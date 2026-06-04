import { assertEquals, assertRejects } from "@std/assert";
import { UnknownToolError } from "../adapter.ts";
import { createDolibarrAdapter, DolibarrApiError } from "./dolibarr.ts";

interface CapturedFetch {
  readonly url: URL;
  readonly method: string;
  readonly headers: Headers;
  readonly signal: AbortSignal | null;
}

function mockFetch(
  response: { readonly status: number; readonly body: unknown },
  captured: CapturedFetch[],
): () => void {
  const original = globalThis.fetch;

  globalThis.fetch = (
    input: string | URL | Request,
    init?: RequestInit,
  ): Promise<Response> => {
    const url = input instanceof Request ? input.url : input.toString();
    captured.push({
      url: new URL(url),
      method: init?.method ?? "GET",
      headers: new Headers(init?.headers),
      signal: init?.signal instanceof AbortSignal ? init.signal : null,
    });

    return Promise.resolve(
      new Response(JSON.stringify(response.body), {
        status: response.status,
        headers: {
          "content-type": "application/json",
        },
      }),
    );
  };

  return () => {
    globalThis.fetch = original;
  };
}

function createTestAdapter() {
  return createDolibarrAdapter({
    erpType: "dolibarr",
    apiUrl: "https://dolibarr.example.com/api/index.php",
    apiKey: "dolikey",
    sandbox: true,
  });
}

Deno.test("createDolibarrAdapter — exposes Dolibarr tools", () => {
  const adapter = createTestAdapter();

  assertEquals(adapter.tools().map((tool) => tool.name), [
    "dolibarr.ping",
    "dolibarr.thirdparty_list",
    "dolibarr.thirdparty_get",
    "dolibarr.product_list",
    "dolibarr.product_get",
    "dolibarr.invoice_list",
    "dolibarr.invoice_get",
    "dolibarr.order_list",
    "dolibarr.order_get",
    "dolibarr.proposal_list",
    "dolibarr.proposal_get",
  ]);
  assertEquals(adapter.tools()[0]._meta, {
    ui: {
      resourceUri: "ui://mcp-erp/diagnostics-viewer",
    },
  });
  assertEquals(adapter.erpType, "dolibarr");
});

Deno.test("createDolibarrAdapter — ping returns diagnostics", async () => {
  const adapter = createTestAdapter();

  const result = await adapter.callTool("dolibarr.ping", {}, {
    tenantId: "acme",
    actorSubject: "user_1",
  });

  assertEquals(result.content, {
    ok: true,
    erpType: "dolibarr",
    apiUrl: "https://dolibarr.example.com/api/index.php",
    sandbox: true,
    tenantId: "acme",
    actorSubject: "user_1",
    toolCount: 11,
    toolNames: [
      "dolibarr.ping",
      "dolibarr.thirdparty_list",
      "dolibarr.thirdparty_get",
      "dolibarr.product_list",
      "dolibarr.product_get",
      "dolibarr.invoice_list",
      "dolibarr.invoice_get",
      "dolibarr.order_list",
      "dolibarr.order_get",
      "dolibarr.proposal_list",
      "dolibarr.proposal_get",
    ],
  });
});

Deno.test("createDolibarrAdapter — thirdparty_list calls Dolibarr thirdparties list", async () => {
  const captured: CapturedFetch[] = [];
  const restore = mockFetch({
    status: 200,
    body: [
      { id: 42, name: "Acme", client: "1", fournisseur: "0" },
      { id: 43, name: "Globex", client: "1", fournisseur: "1" },
    ],
  }, captured);

  try {
    const controller = new AbortController();
    const adapter = createTestAdapter();
    const result = await adapter.callTool(
      "dolibarr.thirdparty_list",
      { limit: 2, page: 3 },
      {
        tenantId: "acme",
        actorSubject: "user_1",
        signal: controller.signal,
      },
    );

    assertEquals(captured.length, 1);
    assertEquals(captured[0].method, "GET");
    assertEquals(
      captured[0].url.pathname,
      "/api/index.php/thirdparties",
    );
    assertEquals(captured[0].url.searchParams.get("limit"), "2");
    assertEquals(captured[0].url.searchParams.get("page"), "3");
    assertEquals(captured[0].headers.get("dolapikey"), "dolikey");
    assertEquals(captured[0].signal, controller.signal);
    assertEquals((result.content as { count: number }).count, 2);
    assertEquals(
      (result.content as { thirdparties: unknown[] }).thirdparties,
      [
        { id: 42, name: "Acme", client: "1", fournisseur: "0" },
        { id: 43, name: "Globex", client: "1", fournisseur: "1" },
      ],
    );
  } finally {
    restore();
  }
});

Deno.test("createDolibarrAdapter — product_list calls Dolibarr products list", async () => {
  const captured: CapturedFetch[] = [];
  const restore = mockFetch({
    status: 200,
    body: [
      { id: 10, ref: "SKU-001", label: "Consulting", type: "1" },
    ],
  }, captured);

  try {
    const adapter = createTestAdapter();
    const result = await adapter.callTool(
      "dolibarr.product_list",
      { limit: 1, page: 2 },
      { tenantId: "acme", actorSubject: null },
    );

    assertEquals(captured.length, 1);
    assertEquals(captured[0].method, "GET");
    assertEquals(captured[0].url.pathname, "/api/index.php/products");
    assertEquals(captured[0].url.searchParams.get("limit"), "1");
    assertEquals(captured[0].url.searchParams.get("page"), "2");
    assertEquals((result.content as { count: number }).count, 1);
    assertEquals((result.content as { products: unknown[] }).products, [
      { id: 10, ref: "SKU-001", label: "Consulting", type: "1" },
    ]);
  } finally {
    restore();
  }
});

Deno.test("createDolibarrAdapter — product_get calls Dolibarr product get", async () => {
  const captured: CapturedFetch[] = [];
  const restore = mockFetch({
    status: 200,
    body: { id: 10, ref: "SKU-001", label: "Consulting" },
  }, captured);

  try {
    const adapter = createTestAdapter();
    const result = await adapter.callTool(
      "dolibarr.product_get",
      { id: 10 },
      { tenantId: "acme", actorSubject: null },
    );

    assertEquals(captured.length, 1);
    assertEquals(captured[0].method, "GET");
    assertEquals(captured[0].url.pathname, "/api/index.php/products/10");
    assertEquals((result.content as { product: unknown }).product, {
      id: 10,
      ref: "SKU-001",
      label: "Consulting",
    });
  } finally {
    restore();
  }
});

Deno.test("createDolibarrAdapter — invoice_list calls Dolibarr invoices list", async () => {
  const captured: CapturedFetch[] = [];
  const restore = mockFetch({
    status: 200,
    body: [
      { id: 99, ref: "FA2301-001", socid: "42", total_ttc: "1200" },
    ],
  }, captured);

  try {
    const adapter = createTestAdapter();
    const result = await adapter.callTool(
      "dolibarr.invoice_list",
      { limit: 1, page: 0 },
      { tenantId: "acme", actorSubject: null },
    );

    assertEquals(captured.length, 1);
    assertEquals(captured[0].method, "GET");
    assertEquals(captured[0].url.pathname, "/api/index.php/invoices");
    assertEquals(captured[0].url.searchParams.get("limit"), "1");
    assertEquals(captured[0].url.searchParams.get("page"), "0");
    assertEquals((result.content as { count: number }).count, 1);
    assertEquals((result.content as { invoices: unknown[] }).invoices, [
      { id: 99, ref: "FA2301-001", socid: "42", total_ttc: "1200" },
    ]);
  } finally {
    restore();
  }
});

Deno.test("createDolibarrAdapter — invoice_get calls Dolibarr invoice get", async () => {
  const captured: CapturedFetch[] = [];
  const restore = mockFetch({
    status: 200,
    body: {
      id: 99,
      ref: "FA2301-001",
      lines: [{ desc: "Consulting", qty: "2" }],
    },
  }, captured);

  try {
    const adapter = createTestAdapter();
    const result = await adapter.callTool(
      "dolibarr.invoice_get",
      { id: 99 },
      { tenantId: "acme", actorSubject: null },
    );

    assertEquals(captured.length, 1);
    assertEquals(captured[0].method, "GET");
    assertEquals(captured[0].url.pathname, "/api/index.php/invoices/99");
    assertEquals((result.content as { invoice: unknown }).invoice, {
      id: 99,
      ref: "FA2301-001",
      lines: [{ desc: "Consulting", qty: "2" }],
    });
  } finally {
    restore();
  }
});

Deno.test("createDolibarrAdapter — order_list calls Dolibarr orders list", async () => {
  const captured: CapturedFetch[] = [];
  const restore = mockFetch({
    status: 200,
    body: [
      { id: 77, ref: "CO2301-001", socid: "42", total_ttc: "1800" },
    ],
  }, captured);

  try {
    const adapter = createTestAdapter();
    const result = await adapter.callTool(
      "dolibarr.order_list",
      { limit: 1, page: 0 },
      { tenantId: "acme", actorSubject: null },
    );

    assertEquals(captured.length, 1);
    assertEquals(captured[0].method, "GET");
    assertEquals(captured[0].url.pathname, "/api/index.php/orders");
    assertEquals(captured[0].url.searchParams.get("limit"), "1");
    assertEquals(captured[0].url.searchParams.get("page"), "0");
    assertEquals((result.content as { count: number }).count, 1);
    assertEquals((result.content as { orders: unknown[] }).orders, [
      { id: 77, ref: "CO2301-001", socid: "42", total_ttc: "1800" },
    ]);
  } finally {
    restore();
  }
});

Deno.test("createDolibarrAdapter — order_get calls Dolibarr order get", async () => {
  const captured: CapturedFetch[] = [];
  const restore = mockFetch({
    status: 200,
    body: {
      id: 77,
      ref: "CO2301-001",
      lines: [{ desc: "Consulting", qty: "3" }],
    },
  }, captured);

  try {
    const adapter = createTestAdapter();
    const result = await adapter.callTool(
      "dolibarr.order_get",
      { id: 77 },
      { tenantId: "acme", actorSubject: null },
    );

    assertEquals(captured.length, 1);
    assertEquals(captured[0].method, "GET");
    assertEquals(captured[0].url.pathname, "/api/index.php/orders/77");
    assertEquals((result.content as { order: unknown }).order, {
      id: 77,
      ref: "CO2301-001",
      lines: [{ desc: "Consulting", qty: "3" }],
    });
  } finally {
    restore();
  }
});

Deno.test("createDolibarrAdapter — proposal_list calls Dolibarr proposals list", async () => {
  const captured: CapturedFetch[] = [];
  const restore = mockFetch({
    status: 200,
    body: [
      { id: 88, ref: "PR2301-001", socid: "42", total_ttc: "950" },
    ],
  }, captured);

  try {
    const adapter = createTestAdapter();
    const result = await adapter.callTool(
      "dolibarr.proposal_list",
      { limit: 1, page: 2 },
      { tenantId: "acme", actorSubject: null },
    );

    assertEquals(captured.length, 1);
    assertEquals(captured[0].method, "GET");
    assertEquals(captured[0].url.pathname, "/api/index.php/proposals");
    assertEquals(captured[0].url.searchParams.get("limit"), "1");
    assertEquals(captured[0].url.searchParams.get("page"), "2");
    assertEquals((result.content as { count: number }).count, 1);
    assertEquals((result.content as { proposals: unknown[] }).proposals, [
      { id: 88, ref: "PR2301-001", socid: "42", total_ttc: "950" },
    ]);
  } finally {
    restore();
  }
});

Deno.test("createDolibarrAdapter — proposal_get calls Dolibarr proposal get", async () => {
  const captured: CapturedFetch[] = [];
  const restore = mockFetch({
    status: 200,
    body: {
      id: 88,
      ref: "PR2301-001",
      lines: [{ desc: "Consulting", qty: "1" }],
    },
  }, captured);

  try {
    const adapter = createTestAdapter();
    const result = await adapter.callTool(
      "dolibarr.proposal_get",
      { id: 88 },
      { tenantId: "acme", actorSubject: null },
    );

    assertEquals(captured.length, 1);
    assertEquals(captured[0].method, "GET");
    assertEquals(captured[0].url.pathname, "/api/index.php/proposals/88");
    assertEquals((result.content as { proposal: unknown }).proposal, {
      id: 88,
      ref: "PR2301-001",
      lines: [{ desc: "Consulting", qty: "1" }],
    });
  } finally {
    restore();
  }
});

Deno.test("createDolibarrAdapter — thirdparty_get calls Dolibarr thirdparty get", async () => {
  const captured: CapturedFetch[] = [];
  const restore = mockFetch({
    status: 200,
    body: { id: 42, name: "Acme", client: "1" },
  }, captured);

  try {
    const adapter = createTestAdapter();
    const result = await adapter.callTool(
      "dolibarr.thirdparty_get",
      { id: 42 },
      { tenantId: "acme", actorSubject: null },
    );

    assertEquals(captured.length, 1);
    assertEquals(captured[0].method, "GET");
    assertEquals(captured[0].url.pathname, "/api/index.php/thirdparties/42");
    assertEquals((result.content as { thirdparty: unknown }).thirdparty, {
      id: 42,
      name: "Acme",
      client: "1",
    });
  } finally {
    restore();
  }
});

Deno.test("createDolibarrAdapter — thirdparty_list propagates Dolibarr HTTP errors", async () => {
  const captured: CapturedFetch[] = [];
  const restore = mockFetch({
    status: 403,
    body: {
      error: {
        message: "Access denied",
      },
    },
  }, captured);

  try {
    const adapter = createTestAdapter();
    const error = await assertRejects(
      () =>
        adapter.callTool(
          "dolibarr.thirdparty_list",
          {},
          { tenantId: "acme", actorSubject: null },
        ),
      DolibarrApiError,
      "Dolibarr GET /thirdparties failed: Access denied",
    );

    assertEquals(error.status, 403);
    assertEquals(error.body, { error: { message: "Access denied" } });
  } finally {
    restore();
  }
});

Deno.test("createDolibarrAdapter — thirdparty_list rejects malformed Dolibarr responses", async () => {
  const captured: CapturedFetch[] = [];
  const restore = mockFetch({
    status: 200,
    body: { rows: [] },
  }, captured);

  try {
    const adapter = createTestAdapter();
    const error = await assertRejects(
      () =>
        adapter.callTool(
          "dolibarr.thirdparty_list",
          {},
          { tenantId: "acme", actorSubject: null },
        ),
      DolibarrApiError,
      "Dolibarr GET /thirdparties failed: malformed response: expected array",
    );

    assertEquals(error.status, 200);
    assertEquals(error.body, { rows: [] });
  } finally {
    restore();
  }
});

Deno.test("createDolibarrAdapter — unknown tool throws UnknownToolError", async () => {
  const adapter = createTestAdapter();

  await assertRejects(
    () =>
      adapter.callTool("dolibarr.nope", {}, {
        tenantId: "acme",
        actorSubject: null,
      }),
    UnknownToolError,
    "Unknown dolibarr tool: dolibarr.nope",
  );
});
