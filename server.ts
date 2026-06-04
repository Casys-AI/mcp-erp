/**
 * Local/dev MCP server entrypoint for @casys/mcp-erp.
 *
 * The production deployment is expected to embed the same `createErpMcpApp`
 * helper in a remote service. This entrypoint is for stdio/http local runs
 * against hosted or local ERP instances.
 *
 * @module @casys/mcp-erp/server
 */

import { buildAdapter, createErpMcpApp, type ErpConnection } from "./mod.ts";

interface ServerConfig {
  readonly tenantId: string;
  readonly actorSubject?: string | null;
  readonly connection: ErpConnection;
}

interface CliArgs {
  readonly configPath: string;
  readonly http: boolean;
  readonly port: number;
  readonly hostname: string;
}

const DEFAULT_PORT = 3020;
const LOG_PREFIX = "[mcp-erp]";

async function main(args = Deno.args): Promise<void> {
  const cli = parseArgs(args);
  const config = await readConfig(cli.configPath);
  const adapter = await buildAdapter(config.connection);
  const app = createErpMcpApp({
    adapter,
    tenantId: config.tenantId,
    actorSubject: config.actorSubject ?? null,
    logger: (message) => console.error(`${LOG_PREFIX} ${message}`),
  });

  if (cli.http) {
    const http = await app.startHttp({
      port: cli.port,
      hostname: cli.hostname,
      cors: true,
      onListen: (info: { hostname: string; port: number }) => {
        console.error(
          `${LOG_PREFIX} HTTP server listening on http://${info.hostname}:${info.port}/mcp`,
        );
      },
    });

    await waitForShutdown(async () => {
      await http.shutdown();
      await adapter.dispose();
    });
    return;
  }

  try {
    await app.start();
  } finally {
    await adapter.dispose();
  }
}

function parseArgs(args: readonly string[]): CliArgs {
  const configFlag = args.indexOf("--config");
  const configPath = configFlag >= 0 ? args[configFlag + 1] : null;
  if (!configPath) {
    throw new Error("CLI_CONFIG_REQUIRED: pass --config <path>");
  }

  const portArg = args.find((arg) => arg.startsWith("--port="));
  const hostnameArg = args.find((arg) => arg.startsWith("--hostname="));
  return {
    configPath,
    http: args.includes("--http"),
    port: portArg ? Number(portArg.slice("--port=".length)) : DEFAULT_PORT,
    hostname: hostnameArg
      ? hostnameArg.slice("--hostname=".length)
      : "localhost",
  };
}

async function readConfig(path: string): Promise<ServerConfig> {
  const raw = JSON.parse(await Deno.readTextFile(path)) as unknown;
  if (!isRecord(raw) || !isRecord(raw.connection)) {
    throw new Error("CONFIG_INVALID: expected tenantId and connection object");
  }
  if (typeof raw.tenantId !== "string" || raw.tenantId.length === 0) {
    throw new Error(
      "CONFIG_FIELD_INVALID: tenantId must be a non-empty string",
    );
  }
  return {
    tenantId: raw.tenantId,
    actorSubject: typeof raw.actorSubject === "string"
      ? raw.actorSubject
      : null,
    connection: raw.connection as ErpConnection,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function waitForShutdown(cleanup: () => Promise<void>): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const signals: readonly Deno.Signal[] = ["SIGINT", "SIGTERM"];
    const stop = () => {
      if (settled) return;
      settled = true;
      for (const signal of signals) {
        Deno.removeSignalListener(signal, stop);
      }
      void cleanup().then(resolve, reject);
    };
    for (const signal of signals) {
      Deno.addSignalListener(signal, stop);
    }
  });
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(`${LOG_PREFIX} Fatal error:`, error);
    Deno.exit(1);
  });
}
