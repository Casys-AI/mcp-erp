import { assertEquals } from "@std/assert";
import type {
  ErpAdapter,
  ErpToolCallContext,
  ErpToolCallResult,
  ErpToolDefinition,
} from "./adapter.ts";
import { ErpToolsClient } from "./client.ts";

class FakeErpAdapter implements ErpAdapter {
  readonly erpType = "erpnext";
  calls: Array<{
    name: string;
    args: Record<string, unknown>;
    ctx: ErpToolCallContext;
  }> = [];

  tools(): ErpToolDefinition[] {
    return [
      {
        name: "erpnext.customer_list",
        description: "List customers.",
        inputSchema: {
          type: "object",
          properties: {
            limit: { type: "integer" },
          },
          additionalProperties: false,
        },
        annotations: {
          readOnlyHint: true,
        },
        _meta: {
          ui: {
            resourceUri: "ui://mcp-erp/customer-list",
          },
        },
      },
    ];
  }

  callTool(
    name: string,
    args: Record<string, unknown>,
    ctx: ErpToolCallContext,
  ): Promise<ErpToolCallResult> {
    this.calls.push({ name, args, ctx });
    return Promise.resolve({
      content: {
        customers: [{ name: "CUST-001" }],
        count: 1,
      },
      summary: "Found 1 ERPNext customer",
    });
  }

  dispose(): void {}
}

Deno.test("ErpToolsClient — converts adapter tools to MCP tool format", () => {
  const adapter = new FakeErpAdapter();
  const client = new ErpToolsClient({
    tenantId: "tenant_1",
    actorSubject: "user_1",
  });

  assertEquals(client.toMCPFormat(adapter), [
    {
      name: "erpnext.customer_list",
      description: "List customers.",
      inputSchema: {
        type: "object",
        properties: {
          limit: { type: "integer" },
        },
        additionalProperties: false,
      },
      annotations: {
        readOnlyHint: true,
      },
      _meta: {
        ui: {
          resourceUri: "ui://mcp-erp/customer-list",
        },
      },
    },
  ]);
});

Deno.test("ErpToolsClient — builds mcp-server handlers around ErpAdapter.callTool", async () => {
  const adapter = new FakeErpAdapter();
  const controller = new AbortController();
  const client = new ErpToolsClient({
    tenantId: "tenant_1",
    actorSubject: "user_1",
    signal: controller.signal,
  });

  const handlers = client.buildHandlersMap(adapter);
  const handler = handlers.get("erpnext.customer_list");
  if (!handler) {
    throw new Error("missing handler");
  }

  const result = await handler({ limit: 1 });

  assertEquals(result, {
    content: "Found 1 ERPNext customer",
    structuredContent: {
      customers: [{ name: "CUST-001" }],
      count: 1,
    },
  });
  assertEquals(adapter.calls, [
    {
      name: "erpnext.customer_list",
      args: { limit: 1 },
      ctx: {
        tenantId: "tenant_1",
        actorSubject: "user_1",
        signal: controller.signal,
      },
    },
  ]);
});

Deno.test("ErpToolsClient — wraps non-object adapter content for structuredContent", async () => {
  const adapter = new FakeErpAdapter();
  adapter.callTool = () =>
    Promise.resolve({
      content: "pong",
    });
  const client = new ErpToolsClient({
    tenantId: "tenant_1",
    actorSubject: null,
  });

  const handler = client.buildHandlersMap(adapter).get("erpnext.customer_list");
  if (!handler) {
    throw new Error("missing handler");
  }

  assertEquals(await handler({}), {
    content: "pong",
    structuredContent: {
      value: "pong",
    },
  });
});
