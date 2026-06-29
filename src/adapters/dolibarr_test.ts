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
    "dolibarr.payment_list",
    "dolibarr.payment_get",
    "dolibarr.stockmovement_list",
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
    toolCount: 14,
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
      "dolibarr.payment_list",
      "dolibarr.payment_get",
      "dolibarr.stockmovement_list",
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

Deno.test("createDolibarrAdapter — thirdparty_list filters by mode customer", async () => {
  const captured: CapturedFetch[] = [];
  const restore = mockFetch({
    status: 200,
    body: [{ id: 42, name: "Acme", client: "1", fournisseur: "0" }],
  }, captured);

  try {
    const adapter = createTestAdapter();
    await adapter.callTool(
      "dolibarr.thirdparty_list",
      { limit: 5, page: 0, mode: "customer" },
      { tenantId: "acme", actorSubject: null },
    );

    assertEquals(captured.length, 1);
    assertEquals(captured[0].url.pathname, "/api/index.php/thirdparties");
    assertEquals(captured[0].url.searchParams.get("mode"), "1");
  } finally {
    restore();
  }
});

Deno.test("createDolibarrAdapter — thirdparty_list filters by mode supplier", async () => {
  const captured: CapturedFetch[] = [];
  const restore = mockFetch({
    status: 200,
    body: [{ id: 43, name: "Globex", client: "0", fournisseur: "1" }],
  }, captured);

  try {
    const adapter = createTestAdapter();
    await adapter.callTool(
      "dolibarr.thirdparty_list",
      { limit: 5, page: 0, mode: "supplier" },
      { tenantId: "acme", actorSubject: null },
    );

    assertEquals(captured.length, 1);
    assertEquals(captured[0].url.searchParams.get("mode"), "4");
  } finally {
    restore();
  }
});

Deno.test("createDolibarrAdapter — thirdparty_list filters by mode prospect", async () => {
  const captured: CapturedFetch[] = [];
  const restore = mockFetch({
    status: 200,
    body: [{ id: 44, name: "ProspectCo", client: "2", fournisseur: "0" }],
  }, captured);

  try {
    const adapter = createTestAdapter();
    await adapter.callTool(
      "dolibarr.thirdparty_list",
      { limit: 5, page: 0, mode: "prospect" },
      { tenantId: "acme", actorSubject: null },
    );

    assertEquals(captured.length, 1);
    assertEquals(captured[0].url.searchParams.get("mode"), "2");
  } finally {
    restore();
  }
});

Deno.test("createDolibarrAdapter — thirdparty_list filters by nameLike via sqlfilters", async () => {
  const captured: CapturedFetch[] = [];
  const restore = mockFetch({
    status: 200,
    body: [{ id: 42, name: "Acme Corp" }],
  }, captured);

  try {
    const adapter = createTestAdapter();
    await adapter.callTool(
      "dolibarr.thirdparty_list",
      { limit: 5, page: 0, nameLike: "Acme" },
      { tenantId: "acme", actorSubject: null },
    );

    assertEquals(captured.length, 1);
    assertEquals(
      captured[0].url.searchParams.get("sqlfilters"),
      "(t.nom:like:'%Acme%')",
    );
  } finally {
    restore();
  }
});

Deno.test("createDolibarrAdapter — thirdparty_list rejects nameLike that would break sqlfilters syntax", async () => {
  const captured: CapturedFetch[] = [];
  const restore = mockFetch({ status: 200, body: [] }, captured);

  try {
    const adapter = createTestAdapter();
    await assertRejects(
      () =>
        adapter.callTool(
          "dolibarr.thirdparty_list",
          { nameLike: "Acme (West)" },
          { tenantId: "acme", actorSubject: null },
        ),
      TypeError,
      "nameLike contains unsupported sqlfilters syntax character",
    );
    assertEquals(captured.length, 0);
  } finally {
    restore();
  }
});

Deno.test("createDolibarrAdapter — invoice_list filters by thirdpartyId, status, and datef sqlfilters", async () => {
  const captured: CapturedFetch[] = [];
  const restore = mockFetch({
    status: 200,
    body: [{ id: 99, ref: "FA2301-001", socid: "42", status: "paid" }],
  }, captured);

  try {
    const adapter = createTestAdapter();
    const result = await adapter.callTool(
      "dolibarr.invoice_list",
      {
        limit: 1,
        page: 0,
        thirdpartyId: 42,
        status: "paid",
        dateStart: "2026-01-01",
        dateEnd: "2026-01-31",
      },
      { tenantId: "acme", actorSubject: null },
    );

    assertEquals(captured.length, 1);
    assertEquals(captured[0].url.pathname, "/api/index.php/invoices");
    assertEquals(captured[0].url.searchParams.get("thirdparty_ids"), "42");
    assertEquals(
      captured[0].url.searchParams.get("status"),
      "paid",
    );
    assertEquals(
      captured[0].url.searchParams.get("sqlfilters"),
      "(t.datef:>=:'2026-01-01') and (t.datef:<=:'2026-01-31')",
    );
    assertEquals(captured[0].url.searchParams.get("statut"), null);
    assertEquals(captured[0].url.searchParams.get("date_start"), null);
    assertEquals(captured[0].url.searchParams.get("date_end"), null);
    assertEquals((result.content as { count: number }).count, 1);
  } finally {
    restore();
  }
});

Deno.test("createDolibarrAdapter — invoice_list rejects legacy statut argument", async () => {
  const captured: CapturedFetch[] = [];
  const restore = mockFetch({ status: 200, body: [] }, captured);

  try {
    const adapter = createTestAdapter();
    await assertRejects(
      () =>
        adapter.callTool(
          "dolibarr.invoice_list",
          { statut: 1 },
          { tenantId: "acme", actorSubject: null },
        ),
      TypeError,
      "Unsupported argument for dolibarr.invoice_list: statut",
    );
    assertEquals(captured.length, 0);
  } finally {
    restore();
  }
});

Deno.test("createDolibarrAdapter — order_list filters by thirdpartyId, status, and sqlfilters", async () => {
  const captured: CapturedFetch[] = [];
  const restore = mockFetch({
    status: 200,
    body: [{ id: 77, ref: "CO2301-001", socid: "42" }],
  }, captured);

  try {
    const adapter = createTestAdapter();
    await adapter.callTool(
      "dolibarr.order_list",
      {
        limit: 1,
        page: 0,
        thirdpartyId: 42,
        status: "shipment_on_process",
        dateStart: "2026-02-01",
        dateEnd: "2026-02-28",
      },
      { tenantId: "acme", actorSubject: null },
    );

    assertEquals(captured.length, 1);
    assertEquals(captured[0].url.pathname, "/api/index.php/orders");
    assertEquals(captured[0].url.searchParams.get("thirdparty_ids"), "42");
    assertEquals(
      captured[0].url.searchParams.get("sqlfilters"),
      "(t.fk_statut:=:2) and (t.date_commande:>=:'2026-02-01') and (t.date_commande:<=:'2026-02-28')",
    );
    assertEquals(captured[0].url.searchParams.get("status"), null);
    assertEquals(captured[0].url.searchParams.get("statut"), null);
    assertEquals(captured[0].url.searchParams.get("date_start"), null);
    assertEquals(captured[0].url.searchParams.get("date_end"), null);
  } finally {
    restore();
  }
});

Deno.test("createDolibarrAdapter — proposal_list filters by thirdpartyId, status, and sqlfilters", async () => {
  const captured: CapturedFetch[] = [];
  const restore = mockFetch({
    status: 200,
    body: [{ id: 88, ref: "PR2301-001", socid: "42" }],
  }, captured);

  try {
    const adapter = createTestAdapter();
    await adapter.callTool(
      "dolibarr.proposal_list",
      {
        limit: 1,
        page: 0,
        thirdpartyId: 42,
        status: "draft",
        dateStart: "2026-03-01",
        dateEnd: "2026-03-31",
      },
      { tenantId: "acme", actorSubject: null },
    );

    assertEquals(captured.length, 1);
    assertEquals(captured[0].url.pathname, "/api/index.php/proposals");
    assertEquals(captured[0].url.searchParams.get("thirdparty_ids"), "42");
    assertEquals(
      captured[0].url.searchParams.get("sqlfilters"),
      "(t.fk_statut:=:0) and (t.datep:>=:'2026-03-01') and (t.datep:<=:'2026-03-31')",
    );
    assertEquals(captured[0].url.searchParams.get("status"), null);
    assertEquals(captured[0].url.searchParams.get("statut"), null);
    assertEquals(captured[0].url.searchParams.get("date_start"), null);
    assertEquals(captured[0].url.searchParams.get("date_end"), null);
  } finally {
    restore();
  }
});

Deno.test("createDolibarrAdapter — product_list translates product type to Dolibarr mode", async () => {
  const captured: CapturedFetch[] = [];
  const restore = mockFetch({
    status: 200,
    body: [{ id: 9, ref: "PROD-001", label: "Widget", type: "0" }],
  }, captured);

  try {
    const adapter = createTestAdapter();
    await adapter.callTool(
      "dolibarr.product_list",
      { limit: 1, page: 0, type: 0 },
      { tenantId: "acme", actorSubject: null },
    );

    assertEquals(captured.length, 1);
    assertEquals(captured[0].url.pathname, "/api/index.php/products");
    assertEquals(captured[0].url.searchParams.get("mode"), "1");
    assertEquals(captured[0].url.searchParams.get("type"), null);
  } finally {
    restore();
  }
});

Deno.test("createDolibarrAdapter — product_list translates service type to Dolibarr mode", async () => {
  const captured: CapturedFetch[] = [];
  const restore = mockFetch({
    status: 200,
    body: [{ id: 10, ref: "SVC-001", label: "Consulting", type: "1" }],
  }, captured);

  try {
    const adapter = createTestAdapter();
    const result = await adapter.callTool(
      "dolibarr.product_list",
      { limit: 1, page: 0, type: 1 },
      { tenantId: "acme", actorSubject: null },
    );

    assertEquals(captured.length, 1);
    assertEquals(captured[0].url.pathname, "/api/index.php/products");
    assertEquals(captured[0].url.searchParams.get("mode"), "2");
    assertEquals(captured[0].url.searchParams.get("type"), null);
    assertEquals((result.content as { count: number }).count, 1);
  } finally {
    restore();
  }
});

Deno.test("createDolibarrAdapter — payment_list calls Dolibarr paiements list with datep sqlfilters", async () => {
  const captured: CapturedFetch[] = [];
  const restore = mockFetch({
    status: 200,
    body: [
      {
        id: 5,
        ref: "REG-001",
        fk_soc: "42",
        date: "2026-01-15",
        amount: "1200",
      },
    ],
  }, captured);

  try {
    const controller = new AbortController();
    const adapter = createTestAdapter();
    const result = await adapter.callTool(
      "dolibarr.payment_list",
      {
        limit: 1,
        page: 0,
        dateStart: "2026-01-01",
        dateEnd: "2026-01-31",
      },
      {
        tenantId: "acme",
        actorSubject: "user_1",
        signal: controller.signal,
      },
    );

    assertEquals(captured.length, 1);
    assertEquals(captured[0].method, "GET");
    assertEquals(captured[0].url.pathname, "/api/index.php/paiements");
    assertEquals(captured[0].url.searchParams.get("limit"), "1");
    assertEquals(captured[0].url.searchParams.get("page"), "0");
    assertEquals(
      captured[0].url.searchParams.get("sqlfilters"),
      "(t.datep:>=:'2026-01-01') and (t.datep:<=:'2026-01-31')",
    );
    assertEquals(captured[0].url.searchParams.get("thirdparty_id"), null);
    assertEquals(captured[0].url.searchParams.get("date_start"), null);
    assertEquals(captured[0].url.searchParams.get("date_end"), null);
    assertEquals(captured[0].headers.get("dolapikey"), "dolikey");
    assertEquals(captured[0].signal, controller.signal);
    assertEquals((result.content as { count: number }).count, 1);
    assertEquals((result.content as { payments: unknown[] }).payments, [
      {
        id: 5,
        ref: "REG-001",
        fk_soc: "42",
        date: "2026-01-15",
        amount: "1200",
      },
    ]);
  } finally {
    restore();
  }
});

Deno.test("createDolibarrAdapter — payment_list rejects unsupported thirdpartyId filter", async () => {
  const captured: CapturedFetch[] = [];
  const restore = mockFetch({ status: 200, body: [] }, captured);

  try {
    const adapter = createTestAdapter();
    const paymentListTool = adapter.tools().find((tool) =>
      tool.name === "dolibarr.payment_list"
    );
    const properties =
      (paymentListTool?.inputSchema as { properties: Record<string, unknown> })
        .properties;
    assertEquals("thirdpartyId" in properties, false);

    await assertRejects(
      () =>
        adapter.callTool(
          "dolibarr.payment_list",
          { thirdpartyId: 42 },
          { tenantId: "acme", actorSubject: null },
        ),
      TypeError,
      "Unsupported argument for dolibarr.payment_list: thirdpartyId",
    );
    assertEquals(captured.length, 0);
  } finally {
    restore();
  }
});

Deno.test("createDolibarrAdapter — payment_get calls Dolibarr payment get", async () => {
  const captured: CapturedFetch[] = [];
  const restore = mockFetch({
    status: 200,
    body: { id: 5, ref: "REG-001", amount: "1200" },
  }, captured);

  try {
    const adapter = createTestAdapter();
    const result = await adapter.callTool(
      "dolibarr.payment_get",
      { id: 5 },
      { tenantId: "acme", actorSubject: null },
    );

    assertEquals(captured.length, 1);
    assertEquals(captured[0].method, "GET");
    assertEquals(captured[0].url.pathname, "/api/index.php/paiements/5");
    assertEquals((result.content as { payment: unknown }).payment, {
      id: 5,
      ref: "REG-001",
      amount: "1200",
    });
  } finally {
    restore();
  }
});

Deno.test("createDolibarrAdapter — stockmovement_list calls Dolibarr stockmovements list with sqlfilters", async () => {
  const captured: CapturedFetch[] = [];
  const restore = mockFetch({
    status: 200,
    body: [
      {
        id: 11,
        fk_product: "10",
        warehouse: "Main",
        qty: "5",
        datem: "2026-01-15",
      },
    ],
  }, captured);

  try {
    const controller = new AbortController();
    const adapter = createTestAdapter();
    const result = await adapter.callTool(
      "dolibarr.stockmovement_list",
      {
        limit: 1,
        page: 0,
        fkProduct: 10,
        dateStart: "2026-01-01",
        dateEnd: "2026-01-31",
      },
      {
        tenantId: "acme",
        actorSubject: "user_1",
        signal: controller.signal,
      },
    );

    assertEquals(captured.length, 1);
    assertEquals(captured[0].method, "GET");
    assertEquals(captured[0].url.pathname, "/api/index.php/stockmovements");
    assertEquals(captured[0].url.searchParams.get("limit"), "1");
    assertEquals(captured[0].url.searchParams.get("page"), "0");
    assertEquals(
      captured[0].url.searchParams.get("sqlfilters"),
      "(t.fk_product:=:10) and (t.datem:>=:'2026-01-01') and (t.datem:<=:'2026-01-31')",
    );
    assertEquals(captured[0].url.searchParams.get("fk_product"), null);
    assertEquals(captured[0].url.searchParams.get("date_start"), null);
    assertEquals(captured[0].url.searchParams.get("date_end"), null);
    assertEquals(captured[0].headers.get("dolapikey"), "dolikey");
    assertEquals(captured[0].signal, controller.signal);
    assertEquals((result.content as { count: number }).count, 1);
    assertEquals(
      (result.content as { stockmovements: unknown[] }).stockmovements,
      [
        {
          id: 11,
          fk_product: "10",
          warehouse: "Main",
          qty: "5",
          datem: "2026-01-15",
        },
      ],
    );
  } finally {
    restore();
  }
});
