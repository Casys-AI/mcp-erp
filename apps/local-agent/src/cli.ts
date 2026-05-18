import type {
  NetworkTransportAuth,
  NetworkTunnelTransport,
} from "@casys/mcp-bridge/adapters/network";
import {
  NetworkRelayError,
  WebSocketNetworkTransport,
} from "@casys/mcp-bridge/adapters/network";
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

export type LocalErpAgentCliErrorCode =
  | "CONFIG_FILE_NOT_FOUND"
  | "CONFIG_FILE_UNREADABLE"
  | "CONFIG_JSON_INVALID"
  | "CONFIG_UNEXPECTED_ERROR"
  | `CONFIG_${string}`;

export interface LocalErpAgentCliErrorOptions {
  readonly code: LocalErpAgentCliErrorCode;
  readonly context?: Record<string, unknown>;
  readonly recovery: string;
  readonly cause?: unknown;
}

export class LocalErpAgentCliError extends Error {
  readonly code: LocalErpAgentCliErrorCode;
  readonly context: Record<string, unknown>;
  readonly recovery: string;
  override readonly cause?: unknown;

  constructor(options: LocalErpAgentCliErrorOptions) {
    const context = options.context ?? {};
    const path = typeof context.path === "string" ? context.path : null;
    super(
      path
        ? `${options.code}: ${path} - ${options.recovery}`
        : `${options.code}: ${options.recovery}`,
    );
    this.name = "LocalErpAgentCliError";
    this.code = options.code;
    this.context = context;
    this.recovery = options.recovery;
    this.cause = options.cause;
  }
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

export interface LocalErpAgentCliMainDeps extends LocalErpAgentCliDeps {
  readonly runCli?: (
    args: readonly string[],
    deps: LocalErpAgentCliDeps,
  ) => Promise<LocalErpAgentRuntime>;
  readonly waitForShutdown?: (runtime: LocalErpAgentRuntime) => Promise<void>;
  readonly stderr?: (message: string) => void;
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

export async function runLocalErpAgentCliMain(
  args: readonly string[],
  deps: LocalErpAgentCliMainDeps = {},
): Promise<number> {
  try {
    const runCli = deps.runCli ?? runLocalErpAgentCli;
    const waitForShutdown = deps.waitForShutdown ??
      waitForLocalErpAgentShutdown;
    const runtime = await runCli(args, deps);
    await waitForShutdown(runtime);
    return 0;
  } catch (error) {
    const stderr = deps.stderr ?? ((message: string) => console.error(message));
    stderr(formatLocalErpAgentCliError(error));
    return localErpAgentCliExitCode(error);
  }
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
  let text: string;
  try {
    text = await readTextFile(path);
  } catch (error) {
    throw configReadError(path, error);
  }

  let raw: unknown;
  try {
    raw = JSON.parse(text) as unknown;
  } catch (error) {
    throw configJsonError(path, error);
  }

  try {
    return parseLocalErpAgentConfig(raw);
  } catch (error) {
    if (isKnownConfigError(error)) {
      throw error;
    }
    throw unexpectedConfigError(path, error);
  }
}

function createWebSocketTransport(
  auth: NetworkTransportAuth | undefined,
): NetworkTunnelTransport {
  return new WebSocketNetworkTransport({ ...(auth ? { auth } : {}) });
}

function createLocalAgent(options: LocalErpAgentOptions): StartedLocalErpAgent {
  return new LocalErpAgent(options);
}

function configReadError(path: string, error: unknown): unknown {
  if (error instanceof Deno.errors.NotFound) {
    return new LocalErpAgentCliError({
      code: "CONFIG_FILE_NOT_FOUND",
      context: { path },
      recovery: "Create the config file before starting the agent.",
      cause: error,
    });
  }

  if (error instanceof Deno.errors.PermissionDenied) {
    return new LocalErpAgentCliError({
      code: "CONFIG_FILE_UNREADABLE",
      context: { path },
      recovery: "Make the config file readable by the current user.",
      cause: error,
    });
  }

  if (isKnownConfigError(error)) {
    return error;
  }

  return unexpectedConfigError(path, error);
}

function configJsonError(path: string, error: unknown): unknown {
  if (error instanceof SyntaxError) {
    return new LocalErpAgentCliError({
      code: "CONFIG_JSON_INVALID",
      context: { path },
      recovery: "Fix the JSON syntax before starting the agent.",
      cause: error,
    });
  }

  if (isKnownConfigError(error)) {
    return error;
  }

  return unexpectedConfigError(path, error);
}

function unexpectedConfigError(
  path: string,
  error: unknown,
): LocalErpAgentCliError {
  return new LocalErpAgentCliError({
    code: "CONFIG_UNEXPECTED_ERROR",
    context: { path },
    recovery: "Check that the config file exists and can be parsed.",
    cause: error,
  });
}

function isKnownConfigError(error: unknown): boolean {
  return errorCode(error)?.startsWith("CONFIG_") ?? false;
}

function localErpAgentCliExitCode(error: unknown): number {
  const code = errorCode(error);
  if (code?.startsWith("CONFIG_")) {
    return 2;
  }
  if (error instanceof NetworkRelayError) {
    return 4;
  }
  return 1;
}

function formatLocalErpAgentCliError(error: unknown): string {
  if (error instanceof LocalErpAgentCliError) {
    return redactWebSocketBearerUrls(
      formatStructuredError(error.code, error.context, error.recovery),
    );
  }

  if (error instanceof NetworkRelayError) {
    return redactWebSocketBearerUrls(
      formatStructuredError(error.code, error.context, error.recovery),
    );
  }

  const message = error instanceof Error ? error.message : String(error);
  return redactWebSocketBearerUrls(message);
}

function formatStructuredError(
  code: string,
  context: Record<string, unknown>,
  recovery: string,
): string {
  const formattedContext = formatErrorContext(context);
  return formattedContext
    ? `${code}: ${formattedContext} - ${recovery}`
    : `${code}: ${recovery}`;
}

function formatErrorContext(context: Record<string, unknown>): string {
  if (typeof context.path === "string") {
    return context.path;
  }

  return Object.entries(context)
    .map(([key, value]) => `${key}=${formatContextValue(value)}`)
    .join(" ");
}

function formatContextValue(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  return JSON.stringify(value);
}

function errorCode(error: unknown): string | null {
  if (typeof error === "object" && error !== null && "code" in error) {
    const code = (error as { readonly code?: unknown }).code;
    if (typeof code === "string") {
      return code;
    }
  }

  if (error instanceof Error) {
    return error.message.match(/^([A-Z][A-Z0-9_]+):?/)?.[1] ?? null;
  }

  return null;
}

function redactWebSocketBearerUrls(message: string): string {
  return message.replace(/\bwss?:\/\/[^\s'"<>]+/g, (rawUrl) => {
    let parsed: URL;
    try {
      parsed = new URL(rawUrl);
    } catch {
      return rawUrl;
    }

    if (!parsed.search) {
      return rawUrl;
    }

    let redacted = false;
    for (const [name] of parsed.searchParams) {
      if (name.toLowerCase().includes("token")) {
        parsed.searchParams.set(name, "***");
        redacted = true;
      }
    }

    return redacted ? parsed.toString() : rawUrl;
  });
}

if (import.meta.main) {
  const exitCode = await runLocalErpAgentCliMain(Deno.args, {
    log: console.log,
  });
  Deno.exit(exitCode);
}
