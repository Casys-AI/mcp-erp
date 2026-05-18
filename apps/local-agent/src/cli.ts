import type {
  NetworkTransportAuth,
  NetworkTunnelTransport,
} from "@casys/mcp-bridge/adapters/network";
import { WebSocketNetworkTransport } from "@casys/mcp-bridge/adapters/network";
import type { ErpAdapter } from "../../../src/adapter.ts";
import type { ErpConnection } from "../../../src/connection.ts";
import { buildAdapter } from "../../../src/registry.ts";
import {
  type LocalErpAgentConfig,
  parseLocalErpAgentConfig,
} from "./config.ts";
import { LocalErpAgent, type LocalErpAgentOptions } from "./local-agent.ts";

export interface LocalErpAgentCliArgs {
  readonly configPath: string;
}

export interface StartedLocalErpAgent {
  start(): Promise<void>;
  stop(): void;
}

export interface LocalErpAgentRuntime {
  stop(): Promise<void>;
}

export interface LocalErpAgentCliDeps {
  readonly readTextFile?: (path: string) => Promise<string>;
  readonly buildAdapter?: (connection: ErpConnection) => Promise<ErpAdapter>;
  readonly createTransport?: (
    auth: NetworkTransportAuth | undefined,
  ) => NetworkTunnelTransport;
  readonly createAgent?: (
    options: LocalErpAgentOptions,
  ) => StartedLocalErpAgent;
  readonly log?: (message: string) => void;
}

export type LocalErpAgentShutdownSignal = "SIGINT" | "SIGTERM";

export interface LocalErpAgentShutdownDeps {
  readonly addSignalListener?: (
    signal: LocalErpAgentShutdownSignal,
    handler: () => void,
  ) => void;
  readonly removeSignalListener?: (
    signal: LocalErpAgentShutdownSignal,
    handler: () => void,
  ) => void;
}

export function parseLocalErpAgentCliArgs(
  args: readonly string[],
): LocalErpAgentCliArgs {
  const configFlagIndex = args.indexOf("--config");
  const configPath = configFlagIndex >= 0 ? args[configFlagIndex + 1] : null;
  if (!configPath) {
    throw new Error("CLI_CONFIG_REQUIRED: pass --config <path>");
  }
  return { configPath };
}

export async function runLocalErpAgentCli(
  args: readonly string[],
  deps: LocalErpAgentCliDeps = {},
): Promise<LocalErpAgentRuntime> {
  const parsedArgs = parseLocalErpAgentCliArgs(args);
  const config = await loadConfig(parsedArgs.configPath, deps);
  const adapter = await (deps.buildAdapter ?? buildAdapter)(config.connection);
  const transport = (deps.createTransport ?? createWebSocketTransport)(
    config.endpointAuth,
  );
  const agent = (deps.createAgent ?? createLocalAgent)({
    relayUrl: config.relayUrl,
    tenantId: config.tenantId,
    erpType: config.erpType,
    agentId: config.agentId,
    keyVersion: config.keyVersion,
    adapter,
    transport,
  });

  await agent.start();
  deps.log?.(
    `Local ERP agent connected: ${config.erpType} ${config.agentId}`,
  );

  return {
    async stop() {
      agent.stop();
      await adapter.dispose();
    },
  };
}

export function waitForLocalErpAgentShutdown(
  runtime: LocalErpAgentRuntime,
  deps: LocalErpAgentShutdownDeps = {},
): Promise<void> {
  const addSignalListener = deps.addSignalListener ?? Deno.addSignalListener;
  const removeSignalListener = deps.removeSignalListener ??
    Deno.removeSignalListener;
  const signals: readonly LocalErpAgentShutdownSignal[] = [
    "SIGINT",
    "SIGTERM",
  ];

  return new Promise((resolve) => {
    const stop = () => {
      for (const signal of signals) {
        removeSignalListener(signal, stop);
      }
      void runtime.stop().then(resolve);
    };
    for (const signal of signals) {
      addSignalListener(signal, stop);
    }
  });
}

async function loadConfig(
  path: string,
  deps: LocalErpAgentCliDeps,
): Promise<LocalErpAgentConfig> {
  const readTextFile = deps.readTextFile ?? Deno.readTextFile;
  const raw = JSON.parse(await readTextFile(path)) as unknown;
  return parseLocalErpAgentConfig(raw);
}

function createWebSocketTransport(
  auth: NetworkTransportAuth | undefined,
): NetworkTunnelTransport {
  return new WebSocketNetworkTransport({ ...(auth ? { auth } : {}) });
}

function createLocalAgent(options: LocalErpAgentOptions): StartedLocalErpAgent {
  return new LocalErpAgent(options);
}

if (import.meta.main) {
  const runtime = await runLocalErpAgentCli(Deno.args, {
    log: console.log,
  });
  await waitForLocalErpAgentShutdown(runtime);
}
