import { assertEquals } from "@std/assert";
import { AuthProvider } from "@casys/mcp-server";
import type { AuthInfo, ProtectedResourceMetadata } from "@casys/mcp-server";
import type { MiddlewareContext } from "@casys/mcp-server";
import type { TenantResolution, TenantResolver } from "@casys/mcp-server";
import type {
  ErpAdapter,
  ErpToolCallContext,
  ErpToolCallResult,
  ErpToolDefinition,
} from "./adapter.ts";
import { createErpRemoteApp } from "./remote-app.ts";
import type { ErpConnectionProvider } from "./connection-provider.ts";

// ---------------------------------------------------------------------------
// Fake auth provider for tests (validates a known token)
// ---------------------------------------------------------------------------

const VALID_TOKEN = "test-bearer-token";
const TEST_SUBJECT = "user-test";

class FakeAuthProvider extends AuthProvider {
  verifyToken(token: string): Promise<AuthInfo | null> {
    if (token !== VALID_TOKEN) return Promise.resolve(null);
    return Promise.resolve({
      subject: TEST_SUBJECT,
      scopes: ["mcp"],
    });
  }

  getResourceMetadata(): ProtectedResourceMetadata {
    // Use `as any` for branded HttpsUrl in tests to avoid importing
    // the non-re-exported httpsUrl factory from @casys/mcp-server.
    return {
      resource: "https://mcp.test",
      resource_metadata_url:
        "https://mcp.test/.well-known/oauth-protected-resource" as any,
      authorization_servers: ["https://auth.test"] as any,
      bearer_methods_supported: ["header"],
    };
  }
}

// ---------------------------------------------------------------------------
// Fake tenant resolver: maps subject to tenantId from a fixture map
// ---------------------------------------------------------------------------

class FixedTenantResolver implements TenantResolver {
  constructor(
    private readonly map: Record<string, string>, // subject → tenantId
  ) {}

  resolve(ctx: MiddlewareContext): Promise<TenantResolution> {
    const authInfo = ctx.authInfo as AuthInfo | undefined;
    if (!authInfo) return Promise.resolve({ ok: false, reason: "no authInfo" });
    const tenantId = this.map[authInfo.subject];
    if (!tenantId) {
      return Promise.resolve({
        ok: false,
        reason: `no tenant for subject ${authInfo.subject}`,
      });
    }
    return Promise.resolve({ ok: true, tenantId });
  }
}

// ---------------------------------------------------------------------------
// Fake adapter
// ---------------------------------------------------------------------------

class FakeAdapter implements ErpAdapter {
  readonly erpType = "erpnext" as const;
  readonly calls: Array<{ name: string; ctx: ErpToolCallContext }> = [];

  tools(): ErpToolDefinition[] {
    return [
      {
        name: "erpnext.ping",
        description: "Ping ERPNext.",
        inputSchema: {
          type: "object",
          properties: {},
          additionalProperties: false,
        },
        annotations: { readOnlyHint: true },
      },
    ];
  }

  callTool(
    name: string,
    _args: Record<string, unknown>,
    ctx: ErpToolCallContext,
  ): Promise<ErpToolCallResult> {
    this.calls.push({ name, ctx });
    return Promise.resolve({ content: { ok: true }, summary: "pong" });
  }

  dispose(): void {}
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeProvider(): ErpConnectionProvider {
  return {
    resolve: () =>
      Promise.resolve({
        erpType: "erpnext",
        apiUrl: "https://erp.test",
        apiKey: "k",
        apiSecret: "s",
        sandbox: true,
      }),
  };
}

function allocatePort(): number {
  const listener = Deno.listen({ port: 0 });
  const port = (listener.addr as Deno.NetAddr).port;
  listener.close();
  return port;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

Deno.test("createErpRemoteApp — request without Bearer token returns 401", async () => {
  const provider = makeProvider();
  const auth = {
    provider: new FakeAuthProvider(),
  };
  const tenantResolver = new FixedTenantResolver({ [TEST_SUBJECT]: "t1" });

  const app = createErpRemoteApp({
    connectionProvider: provider,
    auth,
    tenantResolver,
    name: "test-remote",
    version: "0.0.1",
    registerViewers: false,
  });

  const port = allocatePort();
  const http = await app.startHttp({ port, onListen: () => {} });
  try {
    const response = await fetch(`http://localhost:${port}/mcp`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name: "erpnext.ping", arguments: {} },
      }),
    });
    // Drain response body to avoid fetch resource leak
    await response.text();
    assertEquals(response.status, 401);
  } finally {
    await http.shutdown();
  }
});

Deno.test("createErpRemoteApp — valid token + known tenant returns tool response", async () => {
  const adapter = new FakeAdapter();
  const cache = {
    get: (id: string) => id === "tenant-1" ? adapter : undefined,
    set: () => {},
  };
  const provider = makeProvider();
  const auth = {
    provider: new FakeAuthProvider(),
  };
  const tenantResolver = new FixedTenantResolver({
    [TEST_SUBJECT]: "tenant-1",
  });

  const app = createErpRemoteApp({
    connectionProvider: provider,
    auth,
    tenantResolver,
    cache,
    name: "test-remote",
    version: "0.0.1",
    registerViewers: false,
  });

  const port = allocatePort();
  const http = await app.startHttp({
    port,
    onListen: () => {},
  });

  try {
    const response = await fetch(`http://localhost:${port}/mcp`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "authorization": `Bearer ${VALID_TOKEN}`,
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name: "erpnext.ping", arguments: {} },
      }),
    });
    const body = await response.json();

    assertEquals(body.result.content[0].text, "pong");
    assertEquals(body.result.structuredContent, { ok: true });
    assertEquals(adapter.calls.length, 1);
    assertEquals(adapter.calls[0].ctx.tenantId, "tenant-1");
    assertEquals(adapter.calls[0].ctx.actorSubject, TEST_SUBJECT);
  } finally {
    await http.shutdown();
  }
});

Deno.test("createErpRemoteApp — erpTypes restricts registered tool surface", async () => {
  const provider = makeProvider();
  const auth = {
    provider: new FakeAuthProvider(),
  };
  const tenantResolver = new FixedTenantResolver({
    [TEST_SUBJECT]: "tenant-1",
  });
  const options = {
    connectionProvider: provider,
    auth,
    tenantResolver,
    erpTypes: ["erpnext"] as const,
    name: "test-remote",
    version: "0.0.1",
    registerViewers: false,
  };

  const app = createErpRemoteApp(options);
  const port = allocatePort();
  const http = await app.startHttp({
    port,
    onListen: () => {},
  });

  try {
    const response = await fetch(`http://localhost:${port}/mcp`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "authorization": `Bearer ${VALID_TOKEN}`,
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/list",
      }),
    });
    const body = await response.json() as {
      result: { tools: Array<{ name: string }> };
    };
    const names = body.result.tools.map((tool) => tool.name);

    assertEquals(names.length > 0, true);
    assertEquals(names.every((name) => name.startsWith("erpnext.")), true);
    assertEquals(names.some((name) => name.startsWith("dolibarr.")), false);
  } finally {
    await http.shutdown();
  }
});
