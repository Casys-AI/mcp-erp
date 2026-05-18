import { assertEquals, assertRejects } from "@std/assert";
import type {
  NetworkMessage,
  NetworkTunnelCloseReason,
  NetworkTunnelReconnectOptions,
  NetworkTunnelTransport,
} from "@casys/mcp-bridge/adapters/network";
import {
  NETWORK_PROTOCOL_VERSION,
  NetworkRelayError,
} from "@casys/mcp-bridge/adapters/network";
import type { ErpAdapter } from "../../../src/adapter.ts";
import { LocalErpAgent, type LocalErpAgentOptions } from "./local-agent.ts";

const relayUrl = "wss://relay.example.test/mcp/_tunnel";
const fastReconnect: NetworkTunnelReconnectOptions = {
  initialDelayMs: 0,
  maxDelayMs: 0,
  jitterRatio: 0,
};

type ConnectOutcome =
  | "open"
  | Error
  | ((transport: FakeTransport) => void | Promise<void>);

class FakeTransport implements NetworkTunnelTransport {
  sent: NetworkMessage[] = [];
  connectCalls: string[] = [];
  private handler: ((message: NetworkMessage) => void) | null = null;
  private openHandler: (() => void) | null = null;
  private closeHandler:
    | ((reason: NetworkTunnelCloseReason) => void)
    | null = null;

  constructor(private readonly connectOutcomes: ConnectOutcome[] = []) {}

  connect(url: string): Promise<void> {
    this.connectCalls.push(url);
    const outcome = this.connectOutcomes.shift() ?? "open";
    if (outcome instanceof Error) {
      return Promise.reject(outcome);
    }
    if (typeof outcome === "function") {
      return Promise.resolve(outcome(this));
    }
    this.openHandler?.();
    return Promise.resolve();
  }

  send(message: NetworkMessage): void {
    this.sent.push(message);
  }

  onMessage(handler: (message: NetworkMessage) => void): void {
    this.handler = handler;
  }

  onOpen(handler: () => void): void {
    this.openHandler = handler;
  }

  onClose(handler: (reason: NetworkTunnelCloseReason) => void): void {
    this.closeHandler = handler;
  }

  onError(_handler: (error: unknown) => void): void {}

  disconnect(): void {}

  receive(message: NetworkMessage): void {
    this.handler?.(message);
  }

  close(reason: NetworkTunnelCloseReason = {}): void {
    this.closeHandler?.(reason);
  }
}

Deno.test("local ERP agent connects tunnel client to ERP adapter", async () => {
  const transport = new FakeTransport();
  const agent = createAgent({ transport });

  await agent.start();
  transport.receive({
    type: "tool.call",
    requestId: "req_1",
    toolName: "erpnext.customer_list",
    arguments: { limit: 3 },
    actorSubject: "user_123",
  });
  await new Promise((resolve) => setTimeout(resolve, 0));

  assertEquals(transport.sent.at(0), expectedHello());
  assertEquals(transport.sent.at(-1), {
    type: "tool.result",
    requestId: "req_1",
    result: {
      content: {
        name: "erpnext.customer_list",
        limit: 3,
        tenantId: "tenant_123",
        actorSubject: "user_123",
      },
      summary: "ok",
    },
  });

  agent.stop();
});

Deno.test("local ERP agent retries startup when relay refuses once", async () => {
  const transport = new FakeTransport([
    new Error("relay unavailable"),
    "open",
  ]);
  const agent = createAgent({ transport, reconnect: fastReconnect });

  await agent.start();

  assertEquals(transport.connectCalls, [relayUrl, relayUrl]);
  assertEquals(
    transport.sent.filter((message) => message.type === "agent.hello"),
    [expectedHello()],
  );
  assertEquals(agent.isStopped(), false);

  agent.stop();
});

Deno.test("local ERP agent reconnects with fresh hello after post-connect close", async () => {
  const transport = new FakeTransport();
  const agent = createAgent({ transport, reconnect: fastReconnect });

  await agent.start();
  transport.close({ code: 1006, reason: "abnormal closure" });
  await waitFor(() => transport.connectCalls.length === 2, "reconnect");

  assertEquals(transport.connectCalls, [relayUrl, relayUrl]);
  assertEquals(
    transport.sent.filter((message) => message.type === "agent.hello"),
    [expectedHello(), expectedHello()],
  );
  assertEquals(agent.isStopped(), false);

  agent.stop();
});

Deno.test("local ERP agent stops on terminal tunnel close without retry", async () => {
  const transport = new FakeTransport();
  let terminalError: NetworkRelayError | undefined;
  const agent = createAgent({
    transport,
    reconnect: fastReconnect,
    onTerminalError: (error) => {
      terminalError = error;
    },
  });

  await agent.start();
  transport.close({ code: 4001, reason: "auth rejected" });
  await waitFor(() => terminalError !== undefined, "terminal error");

  assertEquals(terminalError instanceof NetworkRelayError, true);
  assertEquals(terminalError?.code, "TUNNEL_AGENT_DISCONNECTED");
  assertEquals(terminalError?.context, {
    closeCode: 4001,
    reason: "auth rejected",
  });
  assertEquals(agent.isStopped(), true);
  assertEquals(agent.getTerminalError(), terminalError);
  assertEquals(transport.connectCalls, [relayUrl]);
});

Deno.test("local ERP agent rejects terminal close during first hello", async () => {
  let terminalError: NetworkRelayError | undefined;
  const transport = new FakeTransport([
    (fake) => {
      fake.close({ code: 4001, reason: "auth rejected" });
      throw new Error("closed before connected");
    },
  ]);
  const agent = createAgent({
    transport,
    reconnect: fastReconnect,
    onTerminalError: (error) => {
      terminalError = error;
    },
  });

  await assertRejects(
    () => agent.start(),
    NetworkRelayError,
    "TUNNEL_AGENT_DISCONNECTED",
  );

  assertEquals(terminalError instanceof NetworkRelayError, true);
  assertEquals(agent.isStopped(), true);
  assertEquals(transport.connectCalls, [relayUrl]);
});

function createAgent(
  overrides: Partial<LocalErpAgentOptions> & {
    readonly transport: NetworkTunnelTransport;
  },
): LocalErpAgent {
  return new LocalErpAgent({
    relayUrl,
    tenantId: "tenant_123",
    erpType: "erpnext",
    agentId: "agent_1",
    keyVersion: 1,
    adapter: createAdapter(),
    ...overrides,
  });
}

function createAdapter(): ErpAdapter {
  return {
    erpType: "erpnext",
    tools: () => [],
    callTool: (name, args, ctx) =>
      Promise.resolve({
        content: {
          name,
          limit: args.limit,
          tenantId: ctx.tenantId,
          actorSubject: ctx.actorSubject,
        },
        summary: "ok",
      }),
    dispose: () => Promise.resolve(),
  };
}

function expectedHello(): NetworkMessage {
  return {
    type: "agent.hello",
    protocolVersion: NETWORK_PROTOCOL_VERSION,
    tenantId: "tenant_123",
    targetType: "erpnext",
    agentId: "agent_1",
    keyVersion: 1,
  };
}

async function waitFor(
  predicate: () => boolean,
  label: string,
): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt++) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
  throw new Error(`timed out waiting for ${label}`);
}
