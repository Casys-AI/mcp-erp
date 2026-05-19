import {
  NetworkRelayError,
  NetworkTunnelClient,
  type NetworkTunnelReconnectOptions,
  type NetworkTunnelTransport,
} from "@casys/mcp-bridge/adapters/network";
import type { ErpAdapter } from "../../../src/adapter.ts";
import type { ErpType } from "../../../src/connection.ts";
import { LocalAdapterRunner } from "./adapter-runner.ts";

export interface LocalErpAgentOptions {
  readonly relayUrl: string;
  readonly tenantId: string;
  readonly erpType: ErpType;
  readonly agentId: string;
  readonly keyVersion: number;
  readonly adapter: ErpAdapter;
  readonly transport: NetworkTunnelTransport;
  readonly reconnect?: NetworkTunnelReconnectOptions | false;
  readonly onTerminalError?: (error: NetworkRelayError) => void;
}

export class LocalErpAgent {
  private readonly client: NetworkTunnelClient;
  private stopped = true;
  private terminalError: NetworkRelayError | null = null;
  private startupReconnectAttempt = 0;
  private startupReconnectTimer: number | undefined;
  private resolveStartupReconnectSleep: (() => void) | undefined;

  constructor(private readonly options: LocalErpAgentOptions) {
    const runner = new LocalAdapterRunner({
      tenantId: options.tenantId,
      adapter: options.adapter,
    });
    this.client = new NetworkTunnelClient({
      transport: options.transport,
      tenantId: options.tenantId,
      targetType: options.erpType,
      agentId: options.agentId,
      keyVersion: options.keyVersion,
      reconnect: options.reconnect ?? {},
      onTerminalError: (error) => this.handleTerminalError(error),
      handleToolCall: (call) =>
        runner.callTool({
          toolName: call.toolName,
          arguments: call.arguments,
          actorSubject: call.actorSubject,
        }),
    });
  }

  async start(): Promise<void> {
    this.stopped = false;
    this.terminalError = null;
    this.startupReconnectAttempt = 0;

    while (!this.stopped) {
      try {
        await this.client.start(this.options.relayUrl);
        return;
      } catch (error) {
        const terminalError = this.toTerminalError(error);
        if (terminalError) {
          this.handleTerminalError(terminalError);
          throw terminalError;
        }
        if (!this.shouldRetryStartupError(error)) {
          this.stopped = true;
          throw error;
        }
        this.client.stop();
        await this.sleepBeforeStartupReconnect();
      }
    }
  }

  stop(): void {
    this.stopped = true;
    this.clearStartupReconnectSleep();
    this.client.stop();
  }

  isStopped(): boolean {
    return this.stopped;
  }

  getTerminalError(): NetworkRelayError | null {
    return this.terminalError;
  }

  private handleTerminalError(error: NetworkRelayError): void {
    const alreadyStoppedWithSameError = this.terminalError === error &&
      this.stopped;
    this.terminalError = error;
    this.stopped = true;
    this.clearStartupReconnectSleep();
    if (!alreadyStoppedWithSameError) {
      this.options.onTerminalError?.(error);
    }
  }

  private toTerminalError(error: unknown): NetworkRelayError | null {
    if (this.terminalError) return this.terminalError;
    return error instanceof NetworkRelayError ? error : null;
  }

  private shouldRetryStartupError(error: unknown): boolean {
    if (this.options.reconnect === false || this.stopped) return false;
    return !isConfigError(error);
  }

  private sleepBeforeStartupReconnect(): Promise<void> {
    return new Promise((resolve) => {
      this.resolveStartupReconnectSleep = resolve;
      this.startupReconnectTimer = setTimeout(() => {
        this.startupReconnectTimer = undefined;
        this.resolveStartupReconnectSleep = undefined;
        resolve();
      }, this.nextStartupReconnectDelayMs());
    });
  }

  private clearStartupReconnectSleep(): void {
    if (this.startupReconnectTimer !== undefined) {
      clearTimeout(this.startupReconnectTimer);
      this.startupReconnectTimer = undefined;
    }
    this.resolveStartupReconnectSleep?.();
    this.resolveStartupReconnectSleep = undefined;
  }

  private nextStartupReconnectDelayMs(): number {
    const options = this.options.reconnect === false
      ? undefined
      : this.options.reconnect;
    const initialDelayMs = options?.initialDelayMs ?? 1_000;
    const maxDelayMs = options?.maxDelayMs ?? 60_000;
    const jitterRatio = options?.jitterRatio ?? 0.2;
    const base = Math.min(
      maxDelayMs,
      initialDelayMs * 2 ** this.startupReconnectAttempt++,
    );
    if (jitterRatio <= 0 || base <= 0) return base;
    const jitter = base * jitterRatio * (Math.random() * 2 - 1);
    return Math.max(0, Math.round(base + jitter));
  }
}

function isConfigError(error: unknown): boolean {
  return error instanceof Error && error.message.startsWith("CONFIG_");
}
