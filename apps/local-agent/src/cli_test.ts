import { assert, assertEquals, assertRejects, assertThrows } from "@std/assert";
import type {
  NetworkTransportAuth,
  NetworkTunnelTransport,
} from "@casys/mcp-bridge/adapters/network";
import { NetworkRelayError } from "@casys/mcp-bridge/adapters/network";
import type { ErpAdapter } from "../../../src/adapter.ts";
import type { ErpConnection } from "../../../src/connection.ts";
import {
  LocalErpAgentCliError,
  parseLocalErpAgentCliArgs,
  runLocalErpAgentCli,
  runLocalErpAgentCliMain,
  waitForLocalErpAgentShutdown,
} from "./cli.ts";
import type { LocalErpAgentOptions } from "./local-agent.ts";

class FakeTransport implements NetworkTunnelTransport {
  connect(): Promise<void> {
    return Promise.resolve();
  }
  send(): void {}
  onMessage(): void {}
  onOpen(): void {}
  onClose(): void {}
  onError(): void {}
  disconnect(): void {}
}

class FakeStartedAgent {
  started = false;
  stopped = false;

  start(): Promise<void> {
    this.started = true;
    return Promise.resolve();
  }

  stop(): void {
    this.stopped = true;
  }
}

Deno.test("parseLocalErpAgentCliArgs requires --config", () => {
  assertEquals(parseLocalErpAgentCliArgs(["--config", "./agent.json"]), {
    configPath: "./agent.json",
  });

  assertThrows(
    () => parseLocalErpAgentCliArgs([]),
    Error,
    "CLI_CONFIG_REQUIRED",
  );
});

Deno.test("runLocalErpAgentCli starts local agent from config file", async () => {
  const startedAgent = new FakeStartedAgent();
  const builtAdapters: ErpConnection[] = [];
  const endpointAuth: Array<NetworkTransportAuth | undefined> = [];
  const agentOptions: LocalErpAgentOptions[] = [];
  const logs: string[] = [];

  const runtime = await runLocalErpAgentCli(["--config", "./agent.json"], {
    readTextFile: (path: string) => {
      assertEquals(path, "./agent.json");
      return Promise.resolve(JSON.stringify({
        relayUrl: "wss://acme.erp-platform.test/mcp/_tunnel",
        endpointAuth: {
          type: "bearer",
          token: "oauth-access-token",
        },
        tenantId: "tenant_123",
        erpType: "erpnext",
        agentId: "agent_1",
        keyVersion: 1,
        connection: {
          erpType: "erpnext",
          apiUrl: "https://erp.local",
          apiKey: "key",
          apiSecret: "secret",
          sandbox: true,
        },
      }));
    },
    buildAdapter: (connection: ErpConnection) => {
      builtAdapters.push(connection);
      return Promise.resolve(fakeAdapter(connection.erpType));
    },
    createTransport: (auth) => {
      endpointAuth.push(auth);
      return new FakeTransport();
    },
    createAgent: (options: LocalErpAgentOptions) => {
      agentOptions.push(options);
      return startedAgent;
    },
    log: (message: string) => logs.push(message),
  });

  assertEquals(startedAgent.started, true);
  assertEquals(builtAdapters.map((connection) => connection.erpType), [
    "erpnext",
  ]);
  assertEquals(endpointAuth, [{
    type: "bearer",
    token: "oauth-access-token",
  }]);
  assertEquals(
    agentOptions.map((options) => ({
      relayUrl: options.relayUrl,
      tenantId: options.tenantId,
      erpType: options.erpType,
      agentId: options.agentId,
      keyVersion: options.keyVersion,
    })),
    [{
      relayUrl: "wss://acme.erp-platform.test/mcp/_tunnel",
      tenantId: "tenant_123",
      erpType: "erpnext",
      agentId: "agent_1",
      keyVersion: 1,
    }],
  );
  assertEquals(logs, ["Local ERP agent connected: erpnext agent_1"]);

  await runtime.stop();
  assertEquals(startedAgent.stopped, true);
});

Deno.test("runLocalErpAgentCli raises CONFIG_FILE_NOT_FOUND for missing config file", async () => {
  const error = await assertRejects(
    () =>
      runLocalErpAgentCli(["--config", "./missing-agent.json"], {
        readTextFile: () => {
          throw new Deno.errors.NotFound("missing file");
        },
      }),
    LocalErpAgentCliError,
  );

  assertEquals(error.code, "CONFIG_FILE_NOT_FOUND");
  assertEquals(error.context.path, "./missing-agent.json");
});

Deno.test("runLocalErpAgentCli raises CONFIG_FILE_UNREADABLE for permission denied config file", async () => {
  const error = await assertRejects(
    () =>
      runLocalErpAgentCli(["--config", "./private-agent.json"], {
        readTextFile: () => {
          throw new Deno.errors.PermissionDenied("permission denied");
        },
      }),
    LocalErpAgentCliError,
  );

  assertEquals(error.code, "CONFIG_FILE_UNREADABLE");
  assertEquals(error.context.path, "./private-agent.json");
});

Deno.test("runLocalErpAgentCli raises CONFIG_JSON_INVALID for malformed config JSON", async () => {
  const error = await assertRejects(
    () =>
      runLocalErpAgentCli(["--config", "./broken-agent.json"], {
        readTextFile: () => Promise.resolve("{"),
      }),
    LocalErpAgentCliError,
  );

  assertEquals(error.code, "CONFIG_JSON_INVALID");
  assertEquals(error.context.path, "./broken-agent.json");
});

Deno.test("runLocalErpAgentCliMain redacts WebSocket URL bearer tokens before stderr", async () => {
  const stderr: string[] = [];

  const exitCode = await runLocalErpAgentCliMain(["--config", "./agent.json"], {
    runCli: () => {
      throw new Error(
        "relay refused wss://relay/?access_token=secret123&tenant=tenant_1",
      );
    },
    stderr: (message: string) => stderr.push(message),
  });

  assertEquals(exitCode, 1);
  assert(stderr.join("\n").includes("access_token=***"));
  assert(!stderr.join("\n").includes("secret123"));
});

Deno.test("runLocalErpAgentCliMain exits 4 when terminal relay closes after startup", async () => {
  let disposed = 0;
  const stderr: string[] = [];
  const terminalError = new NetworkRelayError({
    code: "TUNNEL_AGENT_DISCONNECTED",
    context: { closeCode: 4001, reason: "auth rejected" },
    recovery: "Reconnect the local ERP agent.",
  });

  const exitCode = await runLocalErpAgentCliMain(["--config", "./agent.json"], {
    readTextFile: () =>
      Promise.resolve(JSON.stringify({
        relayUrl: "wss://acme.erp-platform.test/mcp/_tunnel",
        endpointAuth: {
          type: "bearer",
          token: "oauth-access-token",
        },
        tenantId: "tenant_123",
        erpType: "erpnext",
        agentId: "agent_1",
        keyVersion: 1,
        connection: {
          erpType: "erpnext",
          apiUrl: "https://erp.local",
          apiKey: "key",
          apiSecret: "secret",
          sandbox: true,
        },
      })),
    buildAdapter: (connection: ErpConnection) =>
      Promise.resolve({
        ...fakeAdapter(connection.erpType),
        dispose: () => {
          disposed++;
          return Promise.resolve();
        },
      }),
    createTransport: () => new FakeTransport(),
    createAgent: (options: LocalErpAgentOptions) => ({
      start() {
        queueMicrotask(() => options.onTerminalError?.(terminalError));
        return Promise.resolve();
      },
      stop() {},
    }),
    stderr: (message: string) => stderr.push(message),
  });

  assertEquals(exitCode, 4);
  assertEquals(disposed, 1);
  assert(stderr.join("\n").includes("TUNNEL_AGENT_DISCONNECTED"));
  assert(stderr.join("\n").includes("closeCode=4001"));
});

Deno.test("waitForLocalErpAgentShutdown stops runtime and resolves on signal", async () => {
  let stopCount = 0;
  const handlers = new Map<string, () => void>();
  const removed: string[] = [];
  const promise = waitForLocalErpAgentShutdown({
    stop() {
      stopCount++;
      return Promise.resolve();
    },
  }, {
    addSignalListener(signal: AgentSignal, handler: () => void) {
      handlers.set(signal, handler);
    },
    removeSignalListener(signal: AgentSignal) {
      removed.push(signal);
    },
  });

  handlers.get("SIGINT")?.();
  await promise;

  assertEquals(stopCount, 1);
  assertEquals(removed, ["SIGINT", "SIGTERM"]);
});

function fakeAdapter(erpType: ErpConnection["erpType"]): ErpAdapter {
  return {
    erpType,
    tools: () => [],
    callTool: () => Promise.resolve({ content: { ok: true } }),
    dispose: () => Promise.resolve(),
  };
}

type AgentSignal = "SIGINT" | "SIGTERM";
