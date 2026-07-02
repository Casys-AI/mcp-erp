import { assertEquals, assertRejects } from "@std/assert";
import type { ToolHandlerContext } from "@casys/mcp-server";
import type {
  ErpAdapter,
  ErpToolCallContext,
  ErpToolCallResult,
  ErpToolDefinition,
} from "../../domain/adapter.ts";
import { buildMultiTenantHandlersMap, ErpToolsClient } from "./client.ts";
import {
  type ErpConnectionProvider,
  ErpProviderError,
} from "./connection-provider.ts";

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

Deno.test("ErpToolsClient — propage request.signal depuis ToolHandlerContext", async () => {
  const adapter = new FakeErpAdapter();
  const client = new ErpToolsClient({
    tenantId: "tenant_1",
    actorSubject: "user_1",
  });

  const handlers = client.buildHandlersMap(adapter);
  const handler = handlers.get("erpnext.customer_list");
  if (!handler) {
    throw new Error("missing handler");
  }

  const ctrl = new AbortController();
  const req = new Request("http://x", { signal: ctrl.signal });
  const ctx: ToolHandlerContext = {
    toolName: "erpnext.customer_list",
    request: req,
  };

  await handler({}, ctx);

  assertEquals(adapter.calls.length, 1);
  assertEquals(adapter.calls[0].ctx.signal, req.signal);
});

// ---------------------------------------------------------------------------
// buildMultiTenantHandlersMap tests
// ---------------------------------------------------------------------------

const CUSTOMER_LIST_TOOL: ErpToolDefinition = {
  name: "erpnext.customer_list",
  description: "List customers.",
  inputSchema: {
    type: "object",
    properties: { limit: { type: "integer" } },
    additionalProperties: false,
  },
  annotations: { readOnlyHint: true },
};

Deno.test("buildMultiTenantHandlersMap — tenant A routes to the right adapter", async () => {
  const adapterA = new FakeErpAdapter();
  const provider: ErpConnectionProvider = {
    resolve: () =>
      Promise.resolve({
        erpType: "erpnext",
        apiUrl: "https://erp.test",
        apiKey: "k",
        apiSecret: "s",
        sandbox: true,
      }),
  };

  // Inject the adapter directly via cache so no real HTTP is made
  const cache = {
    get: (id: string) => id === "tenant-A" ? adapterA : undefined,
    set: () => {},
  };

  const handlers = buildMultiTenantHandlersMap(
    provider,
    [CUSTOMER_LIST_TOOL],
    cache,
  );
  const handler = handlers.get("erpnext.customer_list");
  if (!handler) throw new Error("missing handler");

  await handler({ limit: 5 }, {
    toolName: "erpnext.customer_list",
    authInfo: {
      subject: "user-1",
      scopes: [],
      tenantId: "tenant-A",
    },
  });

  assertEquals(adapterA.calls.length, 1);
  assertEquals(adapterA.calls[0].ctx.tenantId, "tenant-A");
  assertEquals(adapterA.calls[0].ctx.actorSubject, "user-1");
});

Deno.test("buildMultiTenantHandlersMap — ctx without authInfo throws TENANT_MISSING", async () => {
  const provider: ErpConnectionProvider = {
    resolve: () => Promise.reject(new Error("should not be called")),
  };

  const handlers = buildMultiTenantHandlersMap(provider, [CUSTOMER_LIST_TOOL]);
  const handler = handlers.get("erpnext.customer_list");
  if (!handler) throw new Error("missing handler");

  await assertRejects(
    async () => {
      await handler({});
    },
    ErpProviderError,
    "TENANT_MISSING",
  );
});

Deno.test("buildMultiTenantHandlersMap — ctx.authInfo without tenantId throws TENANT_MISSING", async () => {
  const provider: ErpConnectionProvider = {
    resolve: () => Promise.reject(new Error("should not be called")),
  };

  const handlers = buildMultiTenantHandlersMap(provider, [CUSTOMER_LIST_TOOL]);
  const handler = handlers.get("erpnext.customer_list");
  if (!handler) throw new Error("missing handler");

  await assertRejects(
    async () => {
      await handler({}, {
        toolName: "erpnext.customer_list",
        authInfo: { subject: "user-1", scopes: [] }, // no tenantId
      });
    },
    ErpProviderError,
    "TENANT_MISSING",
  );
});
