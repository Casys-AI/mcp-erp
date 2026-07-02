import { assertEquals, assertRejects } from "@std/assert";
import { UnknownToolError } from "../../../domain/adapter.ts";
import { WriteError } from "../../../domain/write.ts";
import { createDolibarrAdapter, DolibarrApiError } from "./adapter.ts";

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

// ── Task C: thirdparty_update ─────────────────────────────────────────────────

Deno.test("dolibarr.thirdparty_update — preview does not PUT", async () => {
  const captured: CapturedFetch[] = [];
  const restore = mockFetch(
    { status: 200, body: { id: 42, name: "Acme" } },
    captured,
  );
  try {
    const adapter = createTestAdapter();
    const r = await adapter.callTool(
      "dolibarr.thirdparty_update",
      { mode: "preview", id: 42, name: "Acme Updated" },
      { tenantId: "t", actorSubject: null },
    );
    assertEquals(captured.length, 0);
    assertEquals((r.content as { committed: boolean }).committed, false);
  } finally {
    restore();
  }
});

Deno.test("dolibarr.thirdparty_update — commit sends PUT and returns input id as nativeId", async () => {
  const captured: CapturedFetch[] = [];
  const restore = mockFetch(
    { status: 200, body: { id: 42, name: "Acme Updated" } },
    captured,
  );
  try {
    const adapter = createTestAdapter();
    const r = await adapter.callTool(
      "dolibarr.thirdparty_update",
      {
        mode: "commit",
        id: 42,
        name: "Acme Updated",
        email: "acme@example.com",
      },
      { tenantId: "t", actorSubject: null },
    );
    assertEquals(captured.length, 1);
    assertEquals(captured[0].method, "PUT");
    assertEquals(captured[0].url.pathname, "/api/index.php/thirdparties/42");
    assertEquals(captured[0].headers.get("content-type"), "application/json");
    const body = JSON.parse(captured[0].body as string);
    assertEquals(body.name, "Acme Updated");
    assertEquals(body.email, "acme@example.com");
    const c = r.content as { committed: boolean; nativeId: string };
    assertEquals(c.committed, true);
    assertEquals(c.nativeId, "42");
  } finally {
    restore();
  }
});

Deno.test("dolibarr.thirdparty_update — optional fields forwarded in payload", async () => {
  const captured: CapturedFetch[] = [];
  const restore = mockFetch({ status: 200, body: { id: 99 } }, captured);
  try {
    const adapter = createTestAdapter();
    await adapter.callTool(
      "dolibarr.thirdparty_update",
      {
        mode: "commit",
        id: 99,
        tva_intra: "FR12345678901",
        code_client: "CLI-001",
        phone: "+33612345678",
        multicurrency_code: "USD",
      },
      { tenantId: "t", actorSubject: null },
    );
    assertEquals(captured.length, 1);
    const body = JSON.parse(captured[0].body as string);
    assertEquals(body.tva_intra, "FR12345678901");
    assertEquals(body.code_client, "CLI-001");
    assertEquals(body.phone, "+33612345678");
    assertEquals(body.multicurrency_code, "USD");
  } finally {
    restore();
  }
});

// ── Task C: product_update ────────────────────────────────────────────────────

Deno.test("dolibarr.product_update — preview does not PUT", async () => {
  const captured: CapturedFetch[] = [];
  const restore = mockFetch({ status: 200, body: {} }, captured);
  try {
    const adapter = createTestAdapter();
    const r = await adapter.callTool(
      "dolibarr.product_update",
      { mode: "preview", id: 10, label: "Widget v2" },
      { tenantId: "t", actorSubject: null },
    );
    assertEquals(captured.length, 0);
    assertEquals((r.content as { committed: boolean }).committed, false);
  } finally {
    restore();
  }
});

Deno.test("dolibarr.product_update — commit sends PUT and price adds price_base_type:HT", async () => {
  const captured: CapturedFetch[] = [];
  const restore = mockFetch({ status: 200, body: { id: 10 } }, captured);
  try {
    const adapter = createTestAdapter();
    const r = await adapter.callTool(
      "dolibarr.product_update",
      { mode: "commit", id: 10, label: "Widget v2", price: 19.99 },
      { tenantId: "t", actorSubject: null },
    );
    assertEquals(captured.length, 1);
    assertEquals(captured[0].method, "PUT");
    assertEquals(captured[0].url.pathname, "/api/index.php/products/10");
    assertEquals(captured[0].headers.get("content-type"), "application/json");
    const body = JSON.parse(captured[0].body as string);
    assertEquals(body.label, "Widget v2");
    assertEquals(body.price, 19.99);
    assertEquals(body.price_base_type, "HT");
    const c = r.content as { committed: boolean; nativeId: string };
    assertEquals(c.committed, true);
    assertEquals(c.nativeId, "10");
  } finally {
    restore();
  }
});

Deno.test("dolibarr.product_update — no price means no price_base_type", async () => {
  const captured: CapturedFetch[] = [];
  const restore = mockFetch({ status: 200, body: { id: 10 } }, captured);
  try {
    const adapter = createTestAdapter();
    await adapter.callTool(
      "dolibarr.product_update",
      { mode: "commit", id: 10, label: "Widget v2" },
      { tenantId: "t", actorSubject: null },
    );
    const body = JSON.parse(captured[0].body as string);
    assertEquals("price_base_type" in body, false);
  } finally {
    restore();
  }
});

Deno.test("dolibarr.product_update — optional type field forwarded", async () => {
  const captured: CapturedFetch[] = [];
  const restore = mockFetch({ status: 200, body: { id: 10 } }, captured);
  try {
    const adapter = createTestAdapter();
    await adapter.callTool(
      "dolibarr.product_update",
      { mode: "commit", id: 10, type: 1 },
      { tenantId: "t", actorSubject: null },
    );
    const body = JSON.parse(captured[0].body as string);
    assertEquals(body.type, 1);
  } finally {
    restore();
  }
});

// ── Task C: supplier_create ───────────────────────────────────────────────────

Deno.test("dolibarr.supplier_create — preview does not POST", async () => {
  const captured: CapturedFetch[] = [];
  const restore = mockFetch({ status: 200, body: 55 }, captured);
  try {
    const adapter = createTestAdapter();
    const r = await adapter.callTool(
      "dolibarr.supplier_create",
      { mode: "preview", name: "Supplier Co" },
      { tenantId: "t", actorSubject: null },
    );
    assertEquals(captured.length, 0);
    assertEquals((r.content as { committed: boolean }).committed, false);
  } finally {
    restore();
  }
});

Deno.test("dolibarr.supplier_create — commit POSTs fournisseur:1 to thirdparties", async () => {
  const captured: CapturedFetch[] = [];
  const restore = mockFetch({ status: 200, body: 55 }, captured);
  try {
    const adapter = createTestAdapter();
    const r = await adapter.callTool(
      "dolibarr.supplier_create",
      { mode: "commit", name: "Supplier Co" },
      { tenantId: "t", actorSubject: null },
    );
    assertEquals(captured.length, 1);
    assertEquals(captured[0].method, "POST");
    assertEquals(captured[0].url.pathname, "/api/index.php/thirdparties");
    assertEquals(captured[0].headers.get("content-type"), "application/json");
    const body = JSON.parse(captured[0].body as string);
    assertEquals(body.name, "Supplier Co");
    assertEquals(body.fournisseur, 1);
    // ⚠️ CODEX: confirm whether client:0 should also be sent
    assertEquals("client" in body, false);
    const c = r.content as { committed: boolean; nativeId: string };
    assertEquals(c.committed, true);
    assertEquals(c.nativeId, "55");
  } finally {
    restore();
  }
});

Deno.test("dolibarr.supplier_create — optional fields forwarded", async () => {
  const captured: CapturedFetch[] = [];
  const restore = mockFetch({ status: 200, body: 56 }, captured);
  try {
    const adapter = createTestAdapter();
    await adapter.callTool(
      "dolibarr.supplier_create",
      {
        mode: "commit",
        name: "Supplier Co",
        tva_intra: "FR12345678901",
        code_fournisseur: "SUPP-001",
        email: "supplier@example.com",
        phone: "+33699999999",
        multicurrency_code: "EUR",
      },
      { tenantId: "t", actorSubject: null },
    );
    const body = JSON.parse(captured[0].body as string);
    assertEquals(body.tva_intra, "FR12345678901");
    assertEquals(body.code_fournisseur, "SUPP-001");
    assertEquals("code_client" in body, false);
    assertEquals(body.email, "supplier@example.com");
    assertEquals(body.phone, "+33699999999");
    assertEquals(body.multicurrency_code, "EUR");
  } finally {
    restore();
  }
});

Deno.test("dolibarr.supplier_create — null response throws CREATE_FAILED", async () => {
  const restore = mockFetch({ status: 200, body: null }, []);
  try {
    const adapter = createTestAdapter();
    const err = await assertRejects(
      () =>
        adapter.callTool(
          "dolibarr.supplier_create",
          { mode: "commit", name: "Supplier Co" },
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

// ── Task C: supplier_update ───────────────────────────────────────────────────

Deno.test("dolibarr.supplier_update — preview does not PUT", async () => {
  const captured: CapturedFetch[] = [];
  const restore = mockFetch({ status: 200, body: {} }, captured);
  try {
    const adapter = createTestAdapter();
    const r = await adapter.callTool(
      "dolibarr.supplier_update",
      { mode: "preview", id: 55 },
      { tenantId: "t", actorSubject: null },
    );
    assertEquals(captured.length, 0);
    assertEquals((r.content as { committed: boolean }).committed, false);
  } finally {
    restore();
  }
});

Deno.test("dolibarr.supplier_update — commit sends PUT to thirdparties/:id", async () => {
  const captured: CapturedFetch[] = [];
  const restore = mockFetch({ status: 200, body: { id: 55 } }, captured);
  try {
    const adapter = createTestAdapter();
    const r = await adapter.callTool(
      "dolibarr.supplier_update",
      { mode: "commit", id: 55, name: "Supplier Co Updated" },
      { tenantId: "t", actorSubject: null },
    );
    assertEquals(captured.length, 1);
    assertEquals(captured[0].method, "PUT");
    assertEquals(captured[0].url.pathname, "/api/index.php/thirdparties/55");
    assertEquals(captured[0].headers.get("content-type"), "application/json");
    const body = JSON.parse(captured[0].body as string);
    assertEquals(body.name, "Supplier Co Updated");
    const c = r.content as { committed: boolean; nativeId: string };
    assertEquals(c.committed, true);
    assertEquals(c.nativeId, "55");
  } finally {
    restore();
  }
});

Deno.test("dolibarr.supplier_create — code_fournisseur in payload (not code_client)", async () => {
  const captured: CapturedFetch[] = [];
  const restore = mockFetch({ status: 200, body: 56 }, captured);
  try {
    const adapter = createTestAdapter();
    await adapter.callTool(
      "dolibarr.supplier_create",
      { mode: "commit", name: "Supplier Co", code_fournisseur: "FOURN-001" },
      { tenantId: "t", actorSubject: null },
    );
    const body = JSON.parse(captured[0].body as string);
    assertEquals(body.code_fournisseur, "FOURN-001");
    assertEquals("code_client" in body, false);
  } finally {
    restore();
  }
});

Deno.test("dolibarr.supplier_update — code_fournisseur in payload (not code_client)", async () => {
  const captured: CapturedFetch[] = [];
  const restore = mockFetch({ status: 200, body: { id: 55 } }, captured);
  try {
    const adapter = createTestAdapter();
    await adapter.callTool(
      "dolibarr.supplier_update",
      { mode: "commit", id: 55, code_fournisseur: "FOURN-001" },
      { tenantId: "t", actorSubject: null },
    );
    const body = JSON.parse(captured[0].body as string);
    assertEquals(body.code_fournisseur, "FOURN-001");
    assertEquals("code_client" in body, false);
  } finally {
    restore();
  }
});

// ── Increment 3 — Dolibarr native sales document creates (Task C) ─────────────

function mockFetchSequence(
  responses: Array<{ readonly status: number; readonly body: unknown }>,
  captured: CapturedFetch[],
): () => void {
  const original = globalThis.fetch;
  let callIndex = 0;

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

    const resp = responses[callIndex];
    if (resp === undefined) {
      throw new Error(
        `mockFetchSequence: unexpected extra call #${callIndex}`,
      );
    }
    callIndex++;

    return Promise.resolve(
      new Response(JSON.stringify(resp.body), {
        status: resp.status,
        headers: { "content-type": "application/json" },
      }),
    );
  };

  return () => {
    globalThis.fetch = original;
  };
}

// Helper: compute expected epoch seconds from ISO date (UTC midnight)
function epochSec(isoDate: string): number {
  return Math.floor(new Date(`${isoDate}T00:00:00Z`).getTime() / 1000);
}

// ── preview = zero HTTP ───────────────────────────────────────────────────────

Deno.test("dolibarr.order_create — preview returns committed:false without HTTP", async () => {
  const captured: CapturedFetch[] = [];
  const restore = mockFetch({ status: 200, body: 1 }, captured);
  try {
    const adapter = createTestAdapter();
    const r = await adapter.callTool(
      "dolibarr.order_create",
      {
        mode: "preview",
        socid: 42,
        lines: [{ sku: "SKU-A", qty: 1, subprice: 100 }],
      },
      { tenantId: "t", actorSubject: null },
    );
    assertEquals(captured.length, 0);
    const c = r.content as Record<string, unknown>;
    assertEquals(c.committed, false);
    assertEquals(c.doctype, "Dolibarr Order");
    const resolved = c.resolved as Record<string, unknown>;
    assertEquals(resolved.socid, 42);
    const previewLines = resolved.lines as Array<Record<string, unknown>>;
    assertEquals(previewLines.length, 1);
    assertEquals(previewLines[0].fk_product, "<resolved-at-commit>");
    assertEquals(previewLines[0].qty, 1);
    assertEquals(previewLines[0].subprice, 100);
  } finally {
    restore();
  }
});

Deno.test("dolibarr.proposal_create — preview returns committed:false without HTTP", async () => {
  const captured: CapturedFetch[] = [];
  const restore = mockFetch({ status: 200, body: 1 }, captured);
  try {
    const adapter = createTestAdapter();
    const r = await adapter.callTool(
      "dolibarr.proposal_create",
      {
        mode: "preview",
        socid: 42,
        lines: [{ sku: "SKU-A", qty: 2, subprice: 50, desc: "Consulting" }],
        date: "2026-01-10",
        valid_until: "2026-02-10",
      },
      { tenantId: "t", actorSubject: null },
    );
    assertEquals(captured.length, 0);
    const c = r.content as Record<string, unknown>;
    assertEquals(c.committed, false);
    assertEquals(c.doctype, "Dolibarr Proposal");
    const resolved = c.resolved as Record<string, unknown>;
    assertEquals(resolved.socid, 42);
    assertEquals(resolved.date, epochSec("2026-01-10"));
    assertEquals(resolved.duree_validite, 31); // days between 2026-01-10 and 2026-02-10
    const previewLines = resolved.lines as Array<Record<string, unknown>>;
    assertEquals(previewLines[0].fk_product, "<resolved-at-commit>");
    assertEquals(previewLines[0].desc, "Consulting");
  } finally {
    restore();
  }
});

Deno.test("dolibarr.invoice_create — preview returns committed:false without HTTP and type:0", async () => {
  const captured: CapturedFetch[] = [];
  const restore = mockFetch({ status: 200, body: 1 }, captured);
  try {
    const adapter = createTestAdapter();
    const r = await adapter.callTool(
      "dolibarr.invoice_create",
      {
        mode: "preview",
        socid: 7,
        lines: [{ sku: "SKU-B", qty: 3, subprice: 200 }],
        date: "2026-03-01",
        due_date: "2026-03-31",
      },
      { tenantId: "t", actorSubject: null },
    );
    assertEquals(captured.length, 0);
    const c = r.content as Record<string, unknown>;
    assertEquals(c.committed, false);
    assertEquals(c.doctype, "Dolibarr Invoice");
    const resolved = c.resolved as Record<string, unknown>;
    assertEquals(resolved.type, 0);
    assertEquals(resolved.date, epochSec("2026-03-01"));
    assertEquals(resolved.date_lim_reglement, epochSec("2026-03-31"));
  } finally {
    restore();
  }
});

// ── ISO → epoch conversion ────────────────────────────────────────────────────

Deno.test("dolibarr.order_create — date is converted to epoch seconds (UTC midnight)", async () => {
  const captured: CapturedFetch[] = [];
  // GET /products → product found; POST /orders → id; POST /orders/id/lines → ok
  const restore = mockFetchSequence(
    [
      { status: 200, body: [{ id: 5, tva_tx: "0.000" }] },
      { status: 200, body: 99 },
      { status: 200, body: 1 },
    ],
    captured,
  );
  try {
    const adapter = createTestAdapter();
    await adapter.callTool(
      "dolibarr.order_create",
      {
        mode: "commit",
        socid: 42,
        lines: [{ sku: "REF-001", qty: 1, subprice: 100 }],
        date: "2026-01-15",
      },
      { tenantId: "t", actorSubject: null },
    );
    const postDocBody = JSON.parse(captured[1].body as string);
    assertEquals(postDocBody.date, epochSec("2026-01-15"));
  } finally {
    restore();
  }
});

// ── SKU resolution order: GETs before POST doc ────────────────────────────────

Deno.test("dolibarr.order_create — commit resolves all SKUs before POST doc", async () => {
  const captured: CapturedFetch[] = [];
  const restore = mockFetchSequence(
    [
      { status: 200, body: [{ id: 5, tva_tx: "20.000" }] }, // GET /products (SKU-A)
      { status: 200, body: [{ id: 6, tva_tx: "10.000" }] }, // GET /products (SKU-B)
      { status: 200, body: 123 }, // POST /orders
      { status: 200, body: 1 }, // POST /orders/123/lines (line 0)
      { status: 200, body: 1 }, // POST /orders/123/lines (line 1)
    ],
    captured,
  );
  try {
    const adapter = createTestAdapter();
    await adapter.callTool(
      "dolibarr.order_create",
      {
        mode: "commit",
        socid: 42,
        lines: [
          { sku: "SKU-A", qty: 1, subprice: 100 },
          { sku: "SKU-B", qty: 2, subprice: 50 },
        ],
        date: "2026-01-15",
      },
      { tenantId: "t", actorSubject: null },
    );
    // First 2 calls must be GETs (product resolution)
    assertEquals(captured[0].method, "GET");
    assertEquals(
      captured[0].url.searchParams.get("sqlfilters"),
      "(t.ref:=:'SKU-A')",
    );
    assertEquals(captured[1].method, "GET");
    assertEquals(
      captured[1].url.searchParams.get("sqlfilters"),
      "(t.ref:=:'SKU-B')",
    );
    // Third call is POST /orders
    assertEquals(captured[2].method, "POST");
    assertEquals(captured[2].url.pathname, "/api/index.php/orders");
    // Then line POSTs
    assertEquals(captured[3].method, "POST");
    assertEquals(captured[3].url.pathname, "/api/index.php/orders/123/lines");
    assertEquals(captured[4].method, "POST");
    assertEquals(captured[4].url.pathname, "/api/index.php/orders/123/lines");
  } finally {
    restore();
  }
});

// ── tva_tx propagation ────────────────────────────────────────────────────────

Deno.test("dolibarr.order_create — tva_tx from product GET is sent on each line", async () => {
  const captured: CapturedFetch[] = [];
  const restore = mockFetchSequence(
    [
      { status: 200, body: [{ id: 7, tva_tx: "20.000" }] }, // product
      { status: 200, body: 55 }, // POST /orders
      { status: 200, body: 1 }, // POST /orders/55/lines
    ],
    captured,
  );
  try {
    const adapter = createTestAdapter();
    const r = await adapter.callTool(
      "dolibarr.order_create",
      {
        mode: "commit",
        socid: 42,
        lines: [{ sku: "REF-VAT", qty: 1, subprice: 500 }],
        date: "2026-01-15",
      },
      { tenantId: "t", actorSubject: null },
    );
    const lineBody = JSON.parse(captured[2].body as string);
    assertEquals(lineBody.fk_product, 7);
    assertEquals(lineBody.tva_tx, "20.000");
    assertEquals(lineBody.subprice, 500);
    assertEquals(lineBody.qty, 1);
    const c = r.content as { committed: boolean; nativeId: string };
    assertEquals(c.committed, true);
    assertEquals(c.nativeId, "55");
  } finally {
    restore();
  }
});

Deno.test("dolibarr.order_create — product without tva_tx: no tva_tx sent on line", async () => {
  const captured: CapturedFetch[] = [];
  const restore = mockFetchSequence(
    [
      { status: 200, body: [{ id: 8 }] }, // product without tva_tx
      { status: 200, body: 56 },
      { status: 200, body: 1 },
    ],
    captured,
  );
  try {
    const adapter = createTestAdapter();
    await adapter.callTool(
      "dolibarr.order_create",
      {
        mode: "commit",
        socid: 42,
        lines: [{ sku: "REF-NOTAX", qty: 1, subprice: 200 }],
        date: "2026-01-15",
      },
      { tenantId: "t", actorSubject: null },
    );
    const lineBody = JSON.parse(captured[2].body as string);
    assertEquals("tva_tx" in lineBody, false);
  } finally {
    restore();
  }
});

// ── LINE_PRODUCT_NOT_FOUND ────────────────────────────────────────────────────

Deno.test("dolibarr.order_create — unknown SKU throws LINE_PRODUCT_NOT_FOUND before POST", async () => {
  const captured: CapturedFetch[] = [];
  const restore = mockFetchSequence(
    [
      { status: 200, body: [] }, // GET /products → empty = not found
    ],
    captured,
  );
  try {
    const adapter = createTestAdapter();
    const err = await assertRejects(
      () =>
        adapter.callTool(
          "dolibarr.order_create",
          {
            mode: "commit",
            socid: 42,
            lines: [{ sku: "UNKNOWN-SKU", qty: 1, subprice: 100 }],
            date: "2026-01-15",
          },
          { tenantId: "t", actorSubject: null },
        ),
      WriteError,
    );
    assertEquals(err.code, "LINE_PRODUCT_NOT_FOUND");
    assertEquals(err.context.sku, "UNKNOWN-SKU");
    assertEquals(err.context.lineIndex, 0);
    // Must not have reached POST /orders
    assertEquals(captured.length, 1);
    assertEquals(captured[0].method, "GET");
  } finally {
    restore();
  }
});

// ── LINES_FAILED partial failure ──────────────────────────────────────────────

Deno.test("dolibarr.order_create — second line POST fails → LINES_FAILED with nativeId and attachedLines", async () => {
  const captured: CapturedFetch[] = [];
  const restore = mockFetchSequence(
    [
      { status: 200, body: [{ id: 5, tva_tx: "20" }] }, // GET product SKU-A
      { status: 200, body: [{ id: 6, tva_tx: "10" }] }, // GET product SKU-B
      { status: 200, body: 123 }, // POST /orders
      { status: 200, body: 1 }, // POST /orders/123/lines (line 0) — success
      { status: 500, body: { error: { message: "DB error" } } }, // line 1 — fail
    ],
    captured,
  );
  try {
    const adapter = createTestAdapter();
    const err = await assertRejects(
      () =>
        adapter.callTool(
          "dolibarr.order_create",
          {
            mode: "commit",
            socid: 42,
            lines: [
              { sku: "SKU-A", qty: 1, subprice: 100 },
              { sku: "SKU-B", qty: 2, subprice: 50 },
            ],
            date: "2026-01-15",
          },
          { tenantId: "t", actorSubject: null },
        ),
      WriteError,
    );
    assertEquals(err.code, "LINES_FAILED");
    assertEquals(err.context.nativeId, "123");
    assertEquals(err.context.lineIndex, 1);
    assertEquals(err.context.attachedLines, 1);
  } finally {
    restore();
  }
});

// ── Payload shapes ────────────────────────────────────────────────────────────

Deno.test("dolibarr.order_create — commit payload: socid, epoch date, epoch delivery_date", async () => {
  const captured: CapturedFetch[] = [];
  const restore = mockFetchSequence(
    [
      { status: 200, body: [{ id: 5, tva_tx: "10" }] },
      { status: 200, body: 77 },
      { status: 200, body: 1 },
    ],
    captured,
  );
  try {
    const adapter = createTestAdapter();
    await adapter.callTool(
      "dolibarr.order_create",
      {
        mode: "commit",
        socid: 9,
        lines: [{ sku: "SKU-X", qty: 1, subprice: 150 }],
        date: "2026-06-01",
        delivery_date: "2026-06-15",
      },
      { tenantId: "t", actorSubject: null },
    );
    const docBody = JSON.parse(captured[1].body as string);
    assertEquals(docBody.socid, 9);
    assertEquals(docBody.date, epochSec("2026-06-01"));
    assertEquals(docBody.delivery_date, epochSec("2026-06-15"));
    assertEquals("lines" in docBody, false); // lines NOT in doc payload
    assertEquals(captured[1].url.pathname, "/api/index.php/orders");
  } finally {
    restore();
  }
});

Deno.test("dolibarr.proposal_create — commit payload: duree_validite derived from valid_until", async () => {
  const captured: CapturedFetch[] = [];
  const restore = mockFetchSequence(
    [
      { status: 200, body: [{ id: 10, tva_tx: "20" }] },
      { status: 200, body: 88 },
      { status: 200, body: 1 },
    ],
    captured,
  );
  try {
    const adapter = createTestAdapter();
    await adapter.callTool(
      "dolibarr.proposal_create",
      {
        mode: "commit",
        socid: 3,
        lines: [{ sku: "SVC-001", qty: 1, subprice: 800 }],
        date: "2026-03-01",
        valid_until: "2026-04-01",
      },
      { tenantId: "t", actorSubject: null },
    );
    const docBody = JSON.parse(captured[1].body as string);
    assertEquals(docBody.socid, 3);
    assertEquals(docBody.date, epochSec("2026-03-01"));
    assertEquals(docBody.duree_validite, 31); // days from 2026-03-01 to 2026-04-01
    assertEquals("fin_validite" in docBody, false); // must NOT be sent
    assertEquals("lines" in docBody, false);
    assertEquals(captured[1].url.pathname, "/api/index.php/proposals");
  } finally {
    restore();
  }
});

Deno.test("dolibarr.invoice_create — commit payload: type:0, epoch dates", async () => {
  const captured: CapturedFetch[] = [];
  const restore = mockFetchSequence(
    [
      { status: 200, body: [{ id: 11, tva_tx: "20" }] },
      { status: 200, body: 99 },
      { status: 200, body: 1 },
    ],
    captured,
  );
  try {
    const adapter = createTestAdapter();
    const r = await adapter.callTool(
      "dolibarr.invoice_create",
      {
        mode: "commit",
        socid: 5,
        lines: [{ sku: "ITEM-1", qty: 2, subprice: 300 }],
        date: "2026-04-01",
        due_date: "2026-04-30",
      },
      { tenantId: "t", actorSubject: null },
    );
    const docBody = JSON.parse(captured[1].body as string);
    assertEquals(docBody.type, 0);
    assertEquals(docBody.socid, 5);
    assertEquals(docBody.date, epochSec("2026-04-01"));
    assertEquals(docBody.date_lim_reglement, epochSec("2026-04-30"));
    assertEquals("lines" in docBody, false);
    assertEquals(captured[1].url.pathname, "/api/index.php/invoices");
    const c = r.content as { committed: boolean; nativeId: string };
    assertEquals(c.committed, true);
    assertEquals(c.nativeId, "99");
  } finally {
    restore();
  }
});

// ── Distinct SKU resolution: same sku used twice → only one GET ───────────────

Deno.test("dolibarr.order_create — repeated SKU resolved only once", async () => {
  const captured: CapturedFetch[] = [];
  const restore = mockFetchSequence(
    [
      { status: 200, body: [{ id: 5, tva_tx: "20" }] }, // one GET for SKU-A
      { status: 200, body: 100 }, // POST /orders
      { status: 200, body: 1 }, // line 0
      { status: 200, body: 1 }, // line 1
    ],
    captured,
  );
  try {
    const adapter = createTestAdapter();
    await adapter.callTool(
      "dolibarr.order_create",
      {
        mode: "commit",
        socid: 42,
        lines: [
          { sku: "SKU-A", qty: 1, subprice: 100 },
          { sku: "SKU-A", qty: 2, subprice: 100 }, // same sku
        ],
        date: "2026-01-15",
      },
      { tenantId: "t", actorSubject: null },
    );
    // Only 1 GET for the deduped sku
    const gets = captured.filter((c) => c.method === "GET");
    assertEquals(gets.length, 1);
  } finally {
    restore();
  }
});

// ── INVALID_DATE_RANGE ────────────────────────────────────────────────────────

Deno.test("dolibarr.proposal_create — valid_until before date throws INVALID_DATE_RANGE", async () => {
  const captured: CapturedFetch[] = [];
  const restore = mockFetch({ status: 200, body: 1 }, captured);
  try {
    const adapter = createTestAdapter();
    const err = await assertRejects(
      () =>
        adapter.callTool(
          "dolibarr.proposal_create",
          {
            mode: "commit",
            socid: 42,
            lines: [{ sku: "X", qty: 1, subprice: 100 }],
            date: "2026-06-01",
            valid_until: "2026-05-01", // before date
          },
          { tenantId: "t", actorSubject: null },
        ),
      WriteError,
    );
    assertEquals(err.code, "INVALID_DATE_RANGE");
    assertEquals(err.context.field, "valid_until");
    assertEquals(err.context.date, "2026-06-01");
    assertEquals(err.context.validUntil, "2026-05-01");
    assertEquals(captured.length, 0); // no HTTP at all
  } finally {
    restore();
  }
});

Deno.test("dolibarr.proposal_create — valid_until same as date → duree_validite:0 (not an error)", async () => {
  const captured: CapturedFetch[] = [];
  const restore = mockFetchSequence(
    [
      { status: 200, body: [{ id: 3, tva_tx: "10" }] },
      { status: 200, body: 50 },
      { status: 200, body: 1 },
    ],
    captured,
  );
  try {
    const adapter = createTestAdapter();
    await adapter.callTool(
      "dolibarr.proposal_create",
      {
        mode: "preview",
        socid: 1,
        lines: [{ sku: "X", qty: 1, subprice: 10 }],
        date: "2026-06-01",
        valid_until: "2026-06-01",
      },
      { tenantId: "t", actorSubject: null },
    );
    // Preview = no HTTP
    assertEquals(captured.length, 0);
  } finally {
    restore();
  }
});

// ── Lines contain desc in commit payload when provided ────────────────────────

Deno.test("dolibarr.proposal_create — line desc forwarded to addDocumentLine", async () => {
  const captured: CapturedFetch[] = [];
  const restore = mockFetchSequence(
    [
      { status: 200, body: [{ id: 12, tva_tx: "5.500" }] },
      { status: 200, body: 70 },
      { status: 200, body: 1 },
    ],
    captured,
  );
  try {
    const adapter = createTestAdapter();
    await adapter.callTool(
      "dolibarr.proposal_create",
      {
        mode: "commit",
        socid: 2,
        lines: [{ sku: "SVC-X", qty: 1, subprice: 900, desc: "Audit" }],
        date: "2026-05-01",
      },
      { tenantId: "t", actorSubject: null },
    );
    const lineBody = JSON.parse(captured[2].body as string);
    assertEquals(lineBody.desc, "Audit");
    assertEquals(lineBody.tva_tx, "5.500");
  } finally {
    restore();
  }
});

// ── Single-quote escaping in sqlfilters ───────────────────────────────────────

Deno.test("dolibarr.order_create — SKU with single quote is escaped in sqlfilters", async () => {
  const captured: CapturedFetch[] = [];
  const restore = mockFetchSequence(
    [
      { status: 200, body: [{ id: 20, tva_tx: "0" }] },
      { status: 200, body: 200 },
      { status: 200, body: 1 },
    ],
    captured,
  );
  try {
    const adapter = createTestAdapter();
    await adapter.callTool(
      "dolibarr.order_create",
      {
        mode: "commit",
        socid: 1,
        lines: [{ sku: "O'REILLY", qty: 1, subprice: 10 }],
        date: "2026-01-01",
      },
      { tenantId: "t", actorSubject: null },
    );
    assertEquals(
      captured[0].url.searchParams.get("sqlfilters"),
      "(t.ref:=:'O''REILLY')",
    );
  } finally {
    restore();
  }
});
