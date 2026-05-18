import {
  NetworkTunnelClient,
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
}

export class LocalErpAgent {
  private readonly client: NetworkTunnelClient;

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
      handleToolCall: (call) =>
        runner.callTool({
          toolName: call.toolName,
          arguments: call.arguments,
          actorSubject: call.actorSubject,
        }),
    });
  }

  start(): Promise<void> {
    return this.client.start(this.options.relayUrl);
  }

  stop(): void {
    this.client.stop();
  }
}
