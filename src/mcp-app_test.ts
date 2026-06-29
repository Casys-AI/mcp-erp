import { assertEquals, assertStringIncludes } from "@std/assert";
import type { ErpAdapter } from "./adapter.ts";
import { createErpMcpApp } from "./mcp-app.ts";

function createAdapter(): ErpAdapter {
  return {
    erpType: "erpnext",
    tools: () => [
      {
        name: "erpnext.ping",
        description: "Ping ERPNext.",
        inputSchema: {
          type: "object",
          properties: {},
          additionalProperties: false,
        },
        annotations: {
          readOnlyHint: true,
        },
      },
    ],
    callTool: () =>
      Promise.resolve({
        content: {
          ok: true,
        },
        summary: "pong",
      }),
    dispose: () => {},
  };
}

Deno.test("createErpMcpApp — registers adapter tools on a McpApp", async () => {
  const app = createErpMcpApp({
    adapter: createAdapter(),
    tenantId: "tenant_1",
    actorSubject: null,
    name: "mcp-erp-test",
    version: "0.1.0",
    logger: () => {},
  });
  const listener = Deno.listen({ port: 0 });
  const port = (listener.addr as Deno.NetAddr).port;
  listener.close();

  const http = await app.startHttp({
    port,
    onListen: () => {},
  });
  try {
    const response = await fetch(`http://localhost:${port}/mcp`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: {
          name: "erpnext.ping",
          arguments: {},
        },
      }),
    });
    const body = await response.json();

    assertEquals(body.result.content[0].text, "pong");
    assertEquals(body.result.structuredContent, { ok: true });
  } finally {
    await http.shutdown();
  }
});

Deno.test("createErpMcpApp — registers ERP MCP Apps viewer resources", async () => {
  const app = createErpMcpApp({
    adapter: createAdapter(),
    tenantId: "tenant_1",
    actorSubject: null,
    name: "mcp-erp-test",
    version: "0.1.0",
    logger: () => {},
  });
  const listener = Deno.listen({ port: 0 });
  const port = (listener.addr as Deno.NetAddr).port;
  listener.close();

  const http = await app.startHttp({
    port,
    onListen: () => {},
  });
  try {
    const listResponse = await fetch(`http://localhost:${port}/mcp`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "resources/list",
      }),
    });
    const listBody = await listResponse.json();
    assertEquals(
      listBody.result.resources.map((resource: { uri: string }) =>
        resource.uri
      ),
      [
        "ui://mcp-erp/doclist-viewer",
        "ui://mcp-erp/invoice-viewer",
        "ui://mcp-erp/diagnostics-viewer",
        "ui://mcp-erp/detail-viewer",
      ],
    );

    const readResponse = await fetch(`http://localhost:${port}/mcp`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 2,
        method: "resources/read",
        params: {
          uri: "ui://mcp-erp/doclist-viewer",
        },
      }),
    });
    const readBody = await readResponse.json();
    assertEquals(
      readBody.result.contents[0].uri,
      "ui://mcp-erp/doclist-viewer",
    );
    assertEquals(
      readBody.result.contents[0].mimeType,
      "text/html;profile=mcp-app",
    );
    assertStringIncludes(
      readBody.result.contents[0].text,
      "<title>Doclist Viewer - mcp-erp</title>",
    );

    const diagnosticsResponse = await fetch(`http://localhost:${port}/mcp`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 3,
        method: "resources/read",
        params: {
          uri: "ui://mcp-erp/diagnostics-viewer",
        },
      }),
    });
    const diagnosticsBody = await diagnosticsResponse.json();
    assertEquals(
      diagnosticsBody.result.contents[0].uri,
      "ui://mcp-erp/diagnostics-viewer",
    );
    assertStringIncludes(
      diagnosticsBody.result.contents[0].text,
      "<title>Diagnostics Viewer - mcp-erp</title>",
    );
  } finally {
    await http.shutdown();
  }
});
