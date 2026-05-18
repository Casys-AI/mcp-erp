import { assertEquals } from "@std/assert";
import type {
  NetworkMessage,
  NetworkTunnelTransport,
} from "@casys/mcp-bridge/adapters/network";
import type { ErpAdapter } from "../../../src/adapter.ts";
import { LocalErpAgent } from "./local-agent.ts";

class FakeTransport implements NetworkTunnelTransport {
  sent: NetworkMessage[] = [];
  private handler: ((message: NetworkMessage) => void) | null = null;

  connect(): Promise<void> {
    return Promise.resolve();
  }

  send(message: NetworkMessage): void {
    this.sent.push(message);
  }

  onMessage(handler: (message: NetworkMessage) => void): void {
    this.handler = handler;
  }

  disconnect(): void {}

  receive(message: NetworkMessage): void {
    this.handler?.(message);
  }
}

Deno.test("local ERP agent connects tunnel client to ERP adapter", async () => {
  const transport = new FakeTransport();
  const adapter: ErpAdapter = {
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
  const agent = new LocalErpAgent({
    relayUrl: "wss://relay.example.test/mcp/_tunnel",
    tenantId: "tenant_123",
    erpType: "erpnext",
    agentId: "agent_1",
    keyVersion: 1,
    adapter,
    transport,
  });

  await agent.start();
  transport.receive({
    type: "tool.call",
    requestId: "req_1",
    toolName: "erpnext.customer_list",
    arguments: { limit: 3 },
    actorSubject: "user_123",
  });
  await new Promise((resolve) => setTimeout(resolve, 0));

  assertEquals(transport.sent.at(0), {
    type: "agent.hello",
    tenantId: "tenant_123",
    targetType: "erpnext",
    agentId: "agent_1",
    keyVersion: 1,
  });
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
});
