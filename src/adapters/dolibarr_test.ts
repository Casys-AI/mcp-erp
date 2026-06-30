import { assertEquals, assertRejects } from "@std/assert";
import { UnknownToolError } from "../adapter.ts";
import { createDolibarrAdapter, DolibarrApiError } from "./dolibarr.ts";
import { WriteError } from "../write.ts";

interface CapturedFetch {
  readonly url: URL;
  readonly method: string;
  readonly headers: Headers;
  readonly signal: AbortSignal | null;
  readonly body?: string;
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
      body: typeof init?.body === "string" ? init.body : undefined,
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
  const native = {
    id: 99,
    ref: "FA2301-001",
    lines: [{ desc: "Consulting", qty: "2" }],
  };
  const restore = mockFetch({
    status: 200,
    body: native,
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
    const content = result.content as Record<string, unknown>;
    assertEquals(content.invoice, native);
    assertEquals(content._native, native);
    assertEquals((content.data as Record<string, unknown>).name, "FA2301-001");
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

// ── Wave 1: native filter / behavior tests ────────────────────────────────────

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

// ── Wave 2: invoice-viewer _meta + payload mapping ────────────────────────────

Deno.test("createDolibarrAdapter — invoice_get tool has ERP_INVOICE_META", () => {
  const adapter = createTestAdapter();
  const tool = adapter.tools().find((t) => t.name === "dolibarr.invoice_get");
  assertEquals(tool?._meta, {
    ui: { resourceUri: "ui://mcp-erp/invoice-viewer" },
  });
});

Deno.test("createDolibarrAdapter — invoice_get maps Dolibarr payload to invoice-viewer contract", async () => {
  const native = {
    id: 99,
    ref: "FA2301-001",
    statut: "2",
    paye: "0",
    multicurrency_code: "USD",
    multicurrency_total_ttc: "1200.00",
    multicurrency_total_ht: "1000.00",
    multicurrency_total_tva: "200.00",
    total_ttc: "1080.00",
    total_ht: "900.00",
    total_tva: "180.00",
    lines: [{
      desc: "Consulting",
      multicurrency_subprice: "500.00",
      multicurrency_total_ht: "1000.00",
      subprice: "450.00",
      total_ht: "900.00",
      qty: "2",
    }],
  };
  const captured: CapturedFetch[] = [];
  const restore = mockFetch({ status: 200, body: native }, captured);

  try {
    const adapter = createTestAdapter();
    const result = await adapter.callTool(
      "dolibarr.invoice_get",
      { id: 99 },
      { tenantId: "acme", actorSubject: null },
    );

    const content = result.content as Record<string, unknown>;
    const data = content.data as Record<string, unknown>;
    assertEquals(data.name, "FA2301-001");
    assertEquals(data.status, "Paid/Closed");
    assertEquals(data.currency, "USD");
    assertEquals(data.grand_total, 1200.0);
    assertEquals(data.net_total, 1000.0);
    assertEquals(data.total_taxes_and_charges, 200.0);
    assertEquals(data.items, [
      { item_name: "Consulting", rate: 500.0, qty: "2", amount: 1000.0 },
    ]);
    assertEquals(content.invoice, native);
    assertEquals(content._native, native);
  } finally {
    restore();
  }
});

Deno.test("createDolibarrAdapter — invoice_get leaves currency unset without coherent multicurrency totals", async () => {
  const native = {
    id: 55,
    ref: "FA2301-002",
    statut: "3",
    paye: "0",
    total_ttc: "500.00",
    total_ht: "400.00",
    total_tva: "100.00",
    lines: [],
  };
  const captured: CapturedFetch[] = [];
  const restore = mockFetch({ status: 200, body: native }, captured);

  try {
    const adapter = createTestAdapter();
    const result = await adapter.callTool(
      "dolibarr.invoice_get",
      { id: 55 },
      { tenantId: "acme", actorSubject: null },
    );

    const content = result.content as Record<string, unknown>;
    const data = content.data as Record<string, unknown>;
    assertEquals(Object.hasOwn(data, "currency"), false);
    assertEquals(data.status, "Abandoned");
    assertEquals(data.items, []);
  } finally {
    restore();
  }
});

Deno.test("createDolibarrAdapter — invoice_get maps unknown invoice status explicitly", async () => {
  const captured: CapturedFetch[] = [];
  const restore = mockFetch({
    status: 200,
    body: { id: 56, ref: "FA2301-003", statut: "9", paye: "0" },
  }, captured);

  try {
    const adapter = createTestAdapter();
    const result = await adapter.callTool(
      "dolibarr.invoice_get",
      { id: 56 },
      { tenantId: "acme", actorSubject: null },
    );

    const content = result.content as Record<string, unknown>;
    const data = content.data as Record<string, unknown>;
    assertEquals(data.status, "Unknown (9)");
  } finally {
    restore();
  }
});

// ── order_get: detail-viewer _meta + normalized data field ────────────────────

Deno.test("createDolibarrAdapter — order_get tool has ERP_DETAIL_META", () => {
  const adapter = createTestAdapter();
  const tool = adapter.tools().find((t) => t.name === "dolibarr.order_get");
  assertEquals(tool?._meta, {
    ui: { resourceUri: "ui://mcp-erp/detail-viewer" },
  });
});

Deno.test("createDolibarrAdapter — order_get result includes normalized detail data", async () => {
  const native = {
    id: 77,
    ref: "CO2301-001",
    statut: "2",
    socid: "42",
    thirdparty: { name: "Acme Corp" },
    date_commande: "2026-02-03",
    date_livraison: "2026-02-20",
    total_ttc: "1800.00",
    total_ht: "1500.00",
    total_tva: "300.00",
    lines: [{
      ref: "SVC-001",
      desc: "Consulting",
      subprice: "500.00",
      total_ht: "1500.00",
      qty: "3",
    }],
  };
  const captured: CapturedFetch[] = [];
  const restore = mockFetch({ status: 200, body: native }, captured);

  try {
    const adapter = createTestAdapter();
    const result = await adapter.callTool(
      "dolibarr.order_get",
      { id: 77 },
      { tenantId: "acme", actorSubject: null },
    );

    const content = result.content as Record<string, unknown>;
    // backward-compat field
    assertEquals(content.order, native);
    assertEquals(content._native, native);
    // normalized data
    const data = content.data as Record<string, unknown>;
    assertEquals(data.name, "CO2301-001");
    assertEquals(data.status, "Shipment on process");
    assertEquals(data.party_name, "Acme Corp");
    assertEquals(data.socid, "42");
    assertEquals(data.transaction_date, "2026-02-03");
    assertEquals(data.delivery_date, "2026-02-20");
    assertEquals(data.grand_total, 1800.0);
    assertEquals(data.net_total, 1500.0);
    assertEquals(data.total_taxes_and_charges, 300.0);
    assertEquals(data.items, [
      {
        item_code: "SVC-001",
        item_name: "Consulting",
        qty: "3",
        rate: 500.0,
        amount: 1500.0,
      },
    ]);
  } finally {
    restore();
  }
});

Deno.test("createDolibarrAdapter — order_get maps closed and unknown order statuses", async () => {
  const captured: CapturedFetch[] = [];
  const restore = mockFetch({
    status: 200,
    body: { id: 78, ref: "CO2301-002", statut: "3" },
  }, captured);

  try {
    const adapter = createTestAdapter();
    const closed = await adapter.callTool(
      "dolibarr.order_get",
      { id: 78 },
      { tenantId: "acme", actorSubject: null },
    );
    assertEquals(
      ((closed.content as Record<string, unknown>).data as Record<
        string,
        unknown
      >).status,
      "Closed",
    );
  } finally {
    restore();
  }

  const capturedUnknown: CapturedFetch[] = [];
  const restoreUnknown = mockFetch({
    status: 200,
    body: { id: 79, ref: "CO2301-003", statut: "9" },
  }, capturedUnknown);

  try {
    const adapter = createTestAdapter();
    const unknown = await adapter.callTool(
      "dolibarr.order_get",
      { id: 79 },
      { tenantId: "acme", actorSubject: null },
    );
    assertEquals(
      ((unknown.content as Record<string, unknown>).data as Record<
        string,
        unknown
      >).status,
      "Unknown (9)",
    );
  } finally {
    restoreUnknown();
  }
});

// ── proposal_get: detail-viewer _meta + normalized data field ─────────────────

Deno.test("createDolibarrAdapter — proposal_get tool has ERP_DETAIL_META", () => {
  const adapter = createTestAdapter();
  const tool = adapter.tools().find((t) => t.name === "dolibarr.proposal_get");
  assertEquals(tool?._meta, {
    ui: { resourceUri: "ui://mcp-erp/detail-viewer" },
  });
});

Deno.test("createDolibarrAdapter — proposal_get result includes normalized detail data", async () => {
  const native = {
    id: 88,
    ref: "PR2301-001",
    statut: "3",
    socid: "42",
    socname: "Acme Corp",
    datep: "2026-03-03",
    fin_validite: "2026-04-03",
    total_ttc: "950.00",
    total_ht: "800.00",
    total_tva: "150.00",
    lines: [{
      product_ref: "SVC-002",
      desc: "Discovery",
      subprice: "800.00",
      total_ht: "800.00",
      qty: "1",
    }],
  };
  const captured: CapturedFetch[] = [];
  const restore = mockFetch({ status: 200, body: native }, captured);

  try {
    const adapter = createTestAdapter();
    const result = await adapter.callTool(
      "dolibarr.proposal_get",
      { id: 88 },
      { tenantId: "acme", actorSubject: null },
    );

    const content = result.content as Record<string, unknown>;
    // backward-compat field
    assertEquals(content.proposal, native);
    assertEquals(content._native, native);
    // normalized data
    const data = content.data as Record<string, unknown>;
    assertEquals(data.name, "PR2301-001");
    assertEquals(data.status, "Not signed");
    assertEquals(data.party_name, "Acme Corp");
    assertEquals(data.socid, "42");
    assertEquals(data.transaction_date, "2026-03-03");
    assertEquals(data.valid_till, "2026-04-03");
    assertEquals(data.grand_total, 950.0);
    assertEquals(data.net_total, 800.0);
    assertEquals(data.total_taxes_and_charges, 150.0);
    assertEquals(data.items, [
      {
        item_code: "SVC-002",
        item_name: "Discovery",
        qty: "1",
        rate: 800.0,
        amount: 800.0,
      },
    ]);
  } finally {
    restore();
  }
});

// ── write surface: Task 7 + Task 8 ───────────────────────────────────────────

Deno.test("dolibarr.thirdparty_create — commit POSTs name + client:1 and returns id", async () => {
  const captured: CapturedFetch[] = [];
  const restore = mockFetch({ status: 200, body: 77 }, captured); // Dolibarr returns new id
  try {
    const adapter = createTestAdapter();
    const r = await adapter.callTool(
      "dolibarr.thirdparty_create",
      { mode: "commit", name: "Acme" },
      { tenantId: "t", actorSubject: null },
    );
    assertEquals(captured[0].method, "POST");
    assertEquals(captured[0].url.pathname, "/api/index.php/thirdparties");
    assertEquals(captured[0].headers.get("content-type"), "application/json");
    const body = JSON.parse(captured[0].body as string);
    assertEquals(body.name, "Acme");
    assertEquals(body.client, 1);
    const c = r.content as { committed: boolean; nativeId: string };
    assertEquals(c.committed, true);
    assertEquals(c.nativeId, "77");
  } finally {
    restore();
  }
});

Deno.test("dolibarr.thirdparty_create — preview does not POST", async () => {
  const captured: CapturedFetch[] = [];
  const restore = mockFetch({ status: 200, body: 1 }, captured);
  try {
    const adapter = createTestAdapter();
    const r = await adapter.callTool(
      "dolibarr.thirdparty_create",
      { mode: "preview", name: "Acme" },
      { tenantId: "t", actorSubject: null },
    );
    assertEquals(captured.length, 0);
    assertEquals((r.content as { committed: boolean }).committed, false);
  } finally {
    restore();
  }
});

Deno.test("dolibarr.product_create — commit sends type and ref, returns id", async () => {
  const captured: CapturedFetch[] = [];
  const restore = mockFetch({ status: 200, body: 5 }, captured);
  try {
    const adapter = createTestAdapter();
    const r = await adapter.callTool(
      "dolibarr.product_create",
      { mode: "commit", label: "Widget", ref: "W-1", type: 1, price: 10 },
      { tenantId: "t", actorSubject: null },
    );
    assertEquals(captured[0].url.pathname, "/api/index.php/products");
    const body = JSON.parse(captured[0].body as string);
    assertEquals(body.ref, "W-1");
    assertEquals(body.label, "Widget");
    assertEquals(body.type, 1);
    assertEquals(body.price, 10);
    assertEquals((r.content as { nativeId: string }).nativeId, "5");
  } finally {
    restore();
  }
});

Deno.test("createDolibarrAdapter — proposal_get maps billed and unknown proposal statuses", async () => {
  const captured: CapturedFetch[] = [];
  const restore = mockFetch({
    status: 200,
    body: { id: 89, ref: "PR2301-002", statut: "4" },
  }, captured);

  try {
    const adapter = createTestAdapter();
    const billed = await adapter.callTool(
      "dolibarr.proposal_get",
      { id: 89 },
      { tenantId: "acme", actorSubject: null },
    );
    assertEquals(
      ((billed.content as Record<string, unknown>).data as Record<
        string,
        unknown
      >).status,
      "Billed",
    );
  } finally {
    restore();
  }

  const capturedUnknown: CapturedFetch[] = [];
  const restoreUnknown = mockFetch({
    status: 200,
    body: { id: 90, ref: "PR2301-003", statut: "9" },
  }, capturedUnknown);

  try {
    const adapter = createTestAdapter();
    const unknown = await adapter.callTool(
      "dolibarr.proposal_get",
      { id: 90 },
      { tenantId: "acme", actorSubject: null },
    );
    assertEquals(
      ((unknown.content as Record<string, unknown>).data as Record<
        string,
        unknown
      >).status,
      "Unknown (9)",
    );
  } finally {
    restoreUnknown();
  }
});

// ── Fix 2: CREATE_FAILED on malformed Dolibarr create response ────────────────

Deno.test("dolibarr.thirdparty_create — object response throws CREATE_FAILED", async () => {
  const restore = mockFetch({ status: 200, body: { id: 77 } }, []);
  try {
    const adapter = createTestAdapter();
    const err = await assertRejects(
      () =>
        adapter.callTool(
          "dolibarr.thirdparty_create",
          { mode: "commit", name: "Acme" },
          { tenantId: "t", actorSubject: null },
        ),
      WriteError,
    );
    assertEquals(err.code, "CREATE_FAILED");
    assertEquals(err.context.erpType, "dolibarr");
  } finally {
    restore();
  }
});

Deno.test("dolibarr.product_create — null response throws CREATE_FAILED", async () => {
  const restore = mockFetch({ status: 200, body: null }, []);
  try {
    const adapter = createTestAdapter();
    const err = await assertRejects(
      () =>
        adapter.callTool(
          "dolibarr.product_create",
          { mode: "commit", label: "Widget", ref: "W-1" },
          { tenantId: "t", actorSubject: null },
        ),
      WriteError,
    );
    assertEquals(err.code, "CREATE_FAILED");
    assertEquals(err.context.erpType, "dolibarr");
  } finally {
    restore();
  }
});

// ── Fix 3: price_base_type:"HT" when price is provided ───────────────────────

Deno.test("dolibarr.product_create — price sends price_base_type:HT in payload", async () => {
  const captured: CapturedFetch[] = [];
  const restore = mockFetch({ status: 200, body: 5 }, captured);
  try {
    const adapter = createTestAdapter();
    await adapter.callTool(
      "dolibarr.product_create",
      { mode: "commit", label: "Widget", ref: "W-1", price: 25 },
      { tenantId: "t", actorSubject: null },
    );
    const body = JSON.parse(captured[0].body as string);
    assertEquals(body.price, 25);
    assertEquals(body.price_base_type, "HT");
  } finally {
    restore();
  }
});

Deno.test("dolibarr.product_create — no price means no price_base_type", async () => {
  const captured: CapturedFetch[] = [];
  const restore = mockFetch({ status: 200, body: 6 }, captured);
  try {
    const adapter = createTestAdapter();
    await adapter.callTool(
      "dolibarr.product_create",
      { mode: "commit", label: "Widget", ref: "W-2" },
      { tenantId: "t", actorSubject: null },
    );
    const body = JSON.parse(captured[0].body as string);
    assertEquals("price_base_type" in body, false);
  } finally {
    restore();
  }
});

// ── Fix 4: defaultIndividualTypentId strict validation ───────────────────────

Deno.test("dolibarr.thirdparty_create — individual with defaultIndividualTypentId=0 throws MISSING_REQUIRED_CONFIG", async () => {
  const restore = mockFetch({ status: 200, body: 1 }, []);
  try {
    const adapter = createDolibarrAdapter({
      erpType: "dolibarr",
      apiUrl: "https://dolibarr.example.com/api/index.php",
      apiKey: "dolikey",
      sandbox: true,
      defaultIndividualTypentId: 0,
    });
    const err = await assertRejects(
      () =>
        adapter.callTool(
          "dolibarr.thirdparty_create",
          { mode: "commit", name: "Doe", kind: "individual" },
          { tenantId: "t", actorSubject: null },
        ),
      WriteError,
    );
    assertEquals(err.code, "MISSING_REQUIRED_CONFIG");
    assertEquals(err.context.field, "defaultIndividualTypentId");
  } finally {
    restore();
  }
});

Deno.test("dolibarr.thirdparty_create — individual without defaultIndividualTypentId throws MISSING_REQUIRED_CONFIG", async () => {
  const restore = mockFetch({ status: 200, body: 1 }, []);
  try {
    const adapter = createTestAdapter(); // no defaultIndividualTypentId
    const err = await assertRejects(
      () =>
        adapter.callTool(
          "dolibarr.thirdparty_create",
          { mode: "commit", name: "Doe", kind: "individual" },
          { tenantId: "t", actorSubject: null },
        ),
      WriteError,
    );
    assertEquals(err.code, "MISSING_REQUIRED_CONFIG");
    assertEquals(err.context.field, "defaultIndividualTypentId");
  } finally {
    restore();
  }
});
