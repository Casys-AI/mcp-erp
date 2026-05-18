import { assertEquals } from "@std/assert";
import type { ErpAdapter } from "../../../src/adapter.ts";
import { LocalAdapterRunner } from "./adapter-runner.ts";

Deno.test("local adapter runner dispatches tool calls and preserves summaries", async () => {
  const adapter: ErpAdapter = {
    erpType: "erpnext",
    tools: () => [],
    callTool: (name, args, ctx) =>
      Promise.resolve({
        content: { name, args, tenantId: ctx.tenantId },
        summary: "Customers listed",
      }),
    dispose: () => Promise.resolve(),
  };
  const runner = new LocalAdapterRunner({
    tenantId: "tenant_123",
    adapter,
  });

  const result = await runner.callTool({
    toolName: "erpnext.customer_list",
    arguments: { limit: 1 },
    actorSubject: "user_123",
  });

  assertEquals(result, {
    content: {
      name: "erpnext.customer_list",
      args: { limit: 1 },
      tenantId: "tenant_123",
    },
    summary: "Customers listed",
  });
});
