import { assertEquals, assertRejects } from "@std/assert";
import {
  createErpnextAdapter,
  FrappeApiError,
  mapErpNextSalesInvoice,
} from "./erpnext.ts";
import { UnknownToolError } from "../adapter.ts";
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

function mockFetchSequence(
  responses: ReadonlyArray<{ readonly status: number; readonly body: unknown }>,
  captured: CapturedFetch[],
): () => void {
  const original = globalThis.fetch;
  let index = 0;
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
    const resp = responses[Math.min(index, responses.length - 1)];
    index++;
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

function createTestAdapter() {
  return createErpnextAdapter({
    erpType: "erpnext",
    apiUrl: "https://erp.example.com",
    apiKey: "k",
    apiSecret: "s",
    sandbox: true,
  });
}

Deno.test("createErpnextAdapter — exposes erpnext.ping in tools()", () => {
  const adapter = createTestAdapter();

  const tools = adapter.tools();
  assertEquals(tools.map((t) => t.name), [
    "erpnext.ping",
    "erpnext.customer_list",
    "erpnext.customer_get",
    "erpnext.item_list",
    "erpnext.item_get",
    "erpnext.sales_invoice_list",
    "erpnext.sales_invoice_get",
    "erpnext.sales_order_list",
    "erpnext.sales_order_get",
    "erpnext.quotation_list",
    "erpnext.quotation_get",
    "erpnext.supplier_list",
    "erpnext.supplier_get",
    "erpnext.payment_entry_list",
    "erpnext.payment_entry_get",
    "erpnext.bin_list",
  ]);
  assertEquals(tools[0]._meta, {
    ui: {
      resourceUri: "ui://mcp-erp/diagnostics-viewer",
    },
  });
  assertEquals(adapter.erpType, "erpnext");
});

Deno.test("createErpnextAdapter — ping returns diagnostics", async () => {
  const adapter = createTestAdapter();

  const result = await adapter.callTool("erpnext.ping", {}, {
    tenantId: "acme",
    actorSubject: "user_1",
  });

  assertEquals(result.content, {
    ok: true,
    erpType: "erpnext",
    apiUrl: "https://erp.example.com",
    sandbox: true,
    tenantId: "acme",
    actorSubject: "user_1",
    toolCount: 16,
    toolNames: [
      "erpnext.ping",
      "erpnext.customer_list",
      "erpnext.customer_get",
      "erpnext.item_list",
      "erpnext.item_get",
      "erpnext.sales_invoice_list",
      "erpnext.sales_invoice_get",
      "erpnext.sales_order_list",
      "erpnext.sales_order_get",
      "erpnext.quotation_list",
      "erpnext.quotation_get",
      "erpnext.supplier_list",
      "erpnext.supplier_get",
      "erpnext.payment_entry_list",
      "erpnext.payment_entry_get",
      "erpnext.bin_list",
    ],
  });
});

Deno.test("createErpnextAdapter — customer_list calls Frappe Customer list", async () => {
  const captured: CapturedFetch[] = [];
  const restore = mockFetch({
    status: 200,
    body: {
      data: [
        {
          name: "CUST-001",
          customer_name: "Acme",
          customer_type: "Company",
        },
        {
          name: "CUST-002",
          customer_name: "Globex",
          customer_type: "Company",
        },
      ],
    },
  }, captured);

  try {
    const controller = new AbortController();
    const adapter = createTestAdapter();
    const result = await adapter.callTool(
      "erpnext.customer_list",
      { limit: 2, limitStart: 5, orderBy: "customer_name asc" },
      {
        tenantId: "acme",
        actorSubject: "user_1",
        signal: controller.signal,
      },
    );

    assertEquals(captured.length, 1);
    assertEquals(captured[0].method, "GET");
    assertEquals(captured[0].url.origin, "https://erp.example.com");
    assertEquals(captured[0].url.pathname, "/api/resource/Customer");
    assertEquals(
      captured[0].headers.get("authorization"),
      "token k:s",
    );
    assertEquals(captured[0].signal, controller.signal);
    assertEquals(
      JSON.parse(captured[0].url.searchParams.get("fields") ?? "[]"),
      [
        "name",
        "customer_name",
        "customer_type",
        "customer_group",
        "territory",
        "disabled",
        "modified",
      ],
    );
    assertEquals(
      JSON.parse(captured[0].url.searchParams.get("filters") ?? "[]"),
      [["disabled", "=", 0]],
    );
    assertEquals(captured[0].url.searchParams.get("limit_page_length"), "2");
    assertEquals(captured[0].url.searchParams.get("limit_start"), "5");
    assertEquals(
      captured[0].url.searchParams.get("order_by"),
      "customer_name asc",
    );

    assertEquals((result.content as { count: number }).count, 2);
    assertEquals(
      (result.content as { customers: unknown[] }).customers,
      [
        {
          name: "CUST-001",
          customer_name: "Acme",
          customer_type: "Company",
        },
        {
          name: "CUST-002",
          customer_name: "Globex",
          customer_type: "Company",
        },
      ],
    );
  } finally {
    restore();
  }
});

Deno.test("createErpnextAdapter — item_list calls Frappe Item list with filters", async () => {
  const captured: CapturedFetch[] = [];
  const restore = mockFetch({
    status: 200,
    body: {
      data: [
        {
          name: "ITEM-001",
          item_code: "ITEM-001",
          item_name: "Consulting",
          is_stock_item: 0,
        },
      ],
    },
  }, captured);

  try {
    const adapter = createTestAdapter();
    const result = await adapter.callTool(
      "erpnext.item_list",
      {
        limit: 1,
        itemGroup: "Services",
        isStockItem: false,
        includeDisabled: true,
      },
      { tenantId: "acme", actorSubject: null },
    );

    assertEquals(captured.length, 1);
    assertEquals(captured[0].method, "GET");
    assertEquals(captured[0].url.pathname, "/api/resource/Item");
    assertEquals(
      JSON.parse(captured[0].url.searchParams.get("fields") ?? "[]"),
      [
        "name",
        "item_code",
        "item_name",
        "item_group",
        "stock_uom",
        "is_stock_item",
        "standard_rate",
        "disabled",
        "modified",
      ],
    );
    assertEquals(
      JSON.parse(captured[0].url.searchParams.get("filters") ?? "[]"),
      [
        ["item_group", "=", "Services"],
        ["is_stock_item", "=", 0],
      ],
    );
    assertEquals(captured[0].url.searchParams.get("limit_page_length"), "1");
    assertEquals((result.content as { count: number }).count, 1);
    assertEquals((result.content as { items: unknown[] }).items, [
      {
        name: "ITEM-001",
        item_code: "ITEM-001",
        item_name: "Consulting",
        is_stock_item: 0,
      },
    ]);
  } finally {
    restore();
  }
});

Deno.test("createErpnextAdapter — item_get calls Frappe Item get", async () => {
  const captured: CapturedFetch[] = [];
  const restore = mockFetch({
    status: 200,
    body: {
      data: {
        name: "ITEM-001",
        item_code: "ITEM-001",
        item_name: "Consulting",
      },
    },
  }, captured);

  try {
    const adapter = createTestAdapter();
    const result = await adapter.callTool(
      "erpnext.item_get",
      { name: "ITEM-001" },
      { tenantId: "acme", actorSubject: null },
    );

    assertEquals(captured.length, 1);
    assertEquals(captured[0].method, "GET");
    assertEquals(captured[0].url.pathname, "/api/resource/Item/ITEM-001");
    assertEquals((result.content as { item: unknown }).item, {
      name: "ITEM-001",
      item_code: "ITEM-001",
      item_name: "Consulting",
    });
  } finally {
    restore();
  }
});

Deno.test("createErpnextAdapter — sales_invoice_list calls Frappe Sales Invoice list with filters", async () => {
  const captured: CapturedFetch[] = [];
  const restore = mockFetch({
    status: 200,
    body: {
      data: [
        {
          name: "SINV-001",
          customer: "CUST-001",
          status: "Unpaid",
          grand_total: 1200,
        },
      ],
    },
  }, captured);

  try {
    const adapter = createTestAdapter();
    const result = await adapter.callTool(
      "erpnext.sales_invoice_list",
      {
        customer: "CUST-001",
        status: "Unpaid",
        dateFrom: "2026-01-01",
        dateTo: "2026-01-31",
      },
      { tenantId: "acme", actorSubject: null },
    );

    assertEquals(captured.length, 1);
    assertEquals(captured[0].method, "GET");
    assertEquals(
      captured[0].url.pathname,
      "/api/resource/Sales%20Invoice",
    );
    assertEquals(
      JSON.parse(captured[0].url.searchParams.get("fields") ?? "[]"),
      [
        "name",
        "customer",
        "posting_date",
        "due_date",
        "status",
        "grand_total",
        "outstanding_amount",
        "currency",
        "modified",
      ],
    );
    assertEquals(
      JSON.parse(captured[0].url.searchParams.get("filters") ?? "[]"),
      [
        ["customer", "=", "CUST-001"],
        ["status", "=", "Unpaid"],
        ["posting_date", ">=", "2026-01-01"],
        ["posting_date", "<=", "2026-01-31"],
      ],
    );
    assertEquals((result.content as { count: number }).count, 1);
    assertEquals(
      (result.content as { salesInvoices: unknown[] })
        .salesInvoices,
      [
        {
          name: "SINV-001",
          customer: "CUST-001",
          status: "Unpaid",
          grand_total: 1200,
        },
      ],
    );
  } finally {
    restore();
  }
});

Deno.test("createErpnextAdapter — sales_invoice_get calls Frappe Sales Invoice get", async () => {
  const captured: CapturedFetch[] = [];
  const restore = mockFetch({
    status: 200,
    body: {
      data: {
        name: "SINV-001",
        customer: "CUST-001",
        items: [{ item_code: "ITEM-001", qty: 2 }],
      },
    },
  }, captured);

  try {
    const adapter = createTestAdapter();
    const result = await adapter.callTool(
      "erpnext.sales_invoice_get",
      { name: "SINV-001" },
      { tenantId: "acme", actorSubject: null },
    );

    assertEquals(captured.length, 1);
    assertEquals(captured[0].method, "GET");
    assertEquals(
      captured[0].url.pathname,
      "/api/resource/Sales%20Invoice/SINV-001",
    );
    // Raw native preserved for backward-compat
    assertEquals(
      (result.content as { salesInvoice: unknown }).salesInvoice,
      {
        name: "SINV-001",
        customer: "CUST-001",
        items: [{ item_code: "ITEM-001", qty: 2 }],
      },
    );
    // data is now the mapped invoice (normalized contract)
    const data = (result.content as Record<string, unknown>)
      .data as Record<string, unknown>;
    assertEquals(data.name, "SINV-001");
    assertEquals(data.customer, "CUST-001");
    assertEquals(data.status, "");
    assertEquals(Array.isArray(data.items), true);
  } finally {
    restore();
  }
});

Deno.test("createErpnextAdapter — sales_order_list calls Frappe Sales Order list with filters", async () => {
  const captured: CapturedFetch[] = [];
  const restore = mockFetch({
    status: 200,
    body: {
      data: [
        {
          name: "SO-001",
          customer: "CUST-001",
          status: "To Deliver and Bill",
          grand_total: 1800,
        },
      ],
    },
  }, captured);

  try {
    const adapter = createTestAdapter();
    const result = await adapter.callTool(
      "erpnext.sales_order_list",
      {
        customer: "CUST-001",
        status: "To Deliver and Bill",
        dateFrom: "2026-02-01",
        dateTo: "2026-02-28",
      },
      { tenantId: "acme", actorSubject: null },
    );

    assertEquals(captured.length, 1);
    assertEquals(captured[0].method, "GET");
    assertEquals(
      captured[0].url.pathname,
      "/api/resource/Sales%20Order",
    );
    assertEquals(
      JSON.parse(captured[0].url.searchParams.get("fields") ?? "[]"),
      [
        "name",
        "customer",
        "transaction_date",
        "delivery_date",
        "status",
        "grand_total",
        "currency",
        "modified",
      ],
    );
    assertEquals(
      JSON.parse(captured[0].url.searchParams.get("filters") ?? "[]"),
      [
        ["customer", "=", "CUST-001"],
        ["status", "=", "To Deliver and Bill"],
        ["transaction_date", ">=", "2026-02-01"],
        ["transaction_date", "<=", "2026-02-28"],
      ],
    );
    assertEquals((result.content as { count: number }).count, 1);
    assertEquals(
      (result.content as { salesOrders: unknown[] }).salesOrders,
      [
        {
          name: "SO-001",
          customer: "CUST-001",
          status: "To Deliver and Bill",
          grand_total: 1800,
        },
      ],
    );
  } finally {
    restore();
  }
});

Deno.test("createErpnextAdapter — sales_order_get calls Frappe Sales Order get", async () => {
  const captured: CapturedFetch[] = [];
  const restore = mockFetch({
    status: 200,
    body: {
      data: {
        name: "SO-001",
        customer: "CUST-001",
        items: [{ item_code: "ITEM-001", qty: 3 }],
      },
    },
  }, captured);

  try {
    const adapter = createTestAdapter();
    const result = await adapter.callTool(
      "erpnext.sales_order_get",
      { name: "SO-001" },
      { tenantId: "acme", actorSubject: null },
    );

    assertEquals(captured.length, 1);
    assertEquals(captured[0].method, "GET");
    assertEquals(
      captured[0].url.pathname,
      "/api/resource/Sales%20Order/SO-001",
    );
    assertEquals((result.content as { salesOrder: unknown }).salesOrder, {
      name: "SO-001",
      customer: "CUST-001",
      items: [{ item_code: "ITEM-001", qty: 3 }],
    });
  } finally {
    restore();
  }
});

Deno.test("createErpnextAdapter — quotation_list calls Frappe Quotation list with filters", async () => {
  const captured: CapturedFetch[] = [];
  const restore = mockFetch({
    status: 200,
    body: {
      data: [
        {
          name: "QTN-001",
          party_name: "CUST-001",
          quotation_to: "Customer",
          status: "Open",
          grand_total: 950,
        },
      ],
    },
  }, captured);

  try {
    const adapter = createTestAdapter();
    const result = await adapter.callTool(
      "erpnext.quotation_list",
      {
        partyName: "CUST-001",
        quotationTo: "Customer",
        status: "Open",
        dateFrom: "2026-03-01",
        dateTo: "2026-03-31",
      },
      { tenantId: "acme", actorSubject: null },
    );

    assertEquals(captured.length, 1);
    assertEquals(captured[0].method, "GET");
    assertEquals(captured[0].url.pathname, "/api/resource/Quotation");
    assertEquals(
      JSON.parse(captured[0].url.searchParams.get("fields") ?? "[]"),
      [
        "name",
        "quotation_to",
        "party_name",
        "transaction_date",
        "valid_till",
        "status",
        "grand_total",
        "currency",
        "modified",
      ],
    );
    assertEquals(
      JSON.parse(captured[0].url.searchParams.get("filters") ?? "[]"),
      [
        ["party_name", "=", "CUST-001"],
        ["quotation_to", "=", "Customer"],
        ["status", "=", "Open"],
        ["transaction_date", ">=", "2026-03-01"],
        ["transaction_date", "<=", "2026-03-31"],
      ],
    );
    assertEquals((result.content as { count: number }).count, 1);
    assertEquals(
      (result.content as { quotations: unknown[] }).quotations,
      [
        {
          name: "QTN-001",
          party_name: "CUST-001",
          quotation_to: "Customer",
          status: "Open",
          grand_total: 950,
        },
      ],
    );
  } finally {
    restore();
  }
});

Deno.test("createErpnextAdapter — quotation_get calls Frappe Quotation get", async () => {
  const captured: CapturedFetch[] = [];
  const restore = mockFetch({
    status: 200,
    body: {
      data: {
        name: "QTN-001",
        party_name: "CUST-001",
        items: [{ item_code: "ITEM-001", qty: 1 }],
      },
    },
  }, captured);

  try {
    const adapter = createTestAdapter();
    const result = await adapter.callTool(
      "erpnext.quotation_get",
      { name: "QTN-001" },
      { tenantId: "acme", actorSubject: null },
    );

    assertEquals(captured.length, 1);
    assertEquals(captured[0].method, "GET");
    assertEquals(captured[0].url.pathname, "/api/resource/Quotation/QTN-001");
    assertEquals((result.content as { quotation: unknown }).quotation, {
      name: "QTN-001",
      party_name: "CUST-001",
      items: [{ item_code: "ITEM-001", qty: 1 }],
    });
  } finally {
    restore();
  }
});

Deno.test("createErpnextAdapter — customer_get calls Frappe Customer get", async () => {
  const captured: CapturedFetch[] = [];
  const restore = mockFetch({
    status: 200,
    body: {
      data: {
        name: "CUST-001",
        customer_name: "Acme",
        territory: "Taiwan",
      },
    },
  }, captured);

  try {
    const adapter = createTestAdapter();
    const result = await adapter.callTool(
      "erpnext.customer_get",
      { name: "CUST-001" },
      { tenantId: "acme", actorSubject: null },
    );

    assertEquals(captured.length, 1);
    assertEquals(captured[0].method, "GET");
    assertEquals(captured[0].url.pathname, "/api/resource/Customer/CUST-001");
    assertEquals((result.content as { customer: unknown }).customer, {
      name: "CUST-001",
      customer_name: "Acme",
      territory: "Taiwan",
    });
  } finally {
    restore();
  }
});

Deno.test("createErpnextAdapter — customer_list propagates Frappe HTTP errors", async () => {
  const captured: CapturedFetch[] = [];
  const restore = mockFetch({
    status: 403,
    body: {
      message: "Not permitted",
    },
  }, captured);

  try {
    const adapter = createTestAdapter();
    const error = await assertRejects(
      () =>
        adapter.callTool(
          "erpnext.customer_list",
          {},
          { tenantId: "acme", actorSubject: null },
        ),
      FrappeApiError,
      "ERPNext GET /api/resource/Customer failed: Not permitted",
    );

    assertEquals(error.status, 403);
    assertEquals(error.body, { message: "Not permitted" });
  } finally {
    restore();
  }
});

Deno.test("createErpnextAdapter — customer_list rejects malformed Frappe responses", async () => {
  const captured: CapturedFetch[] = [];
  const restore = mockFetch({
    status: 200,
    body: {
      message: "not the list shape",
    },
  }, captured);

  try {
    const adapter = createTestAdapter();
    const error = await assertRejects(
      () =>
        adapter.callTool(
          "erpnext.customer_list",
          {},
          { tenantId: "acme", actorSubject: null },
        ),
      FrappeApiError,
      "ERPNext GET /api/resource/Customer failed: malformed response: data must be an array",
    );

    assertEquals(error.status, 200);
    assertEquals(error.body, { message: "not the list shape" });
  } finally {
    restore();
  }
});

Deno.test("createErpnextAdapter — unknown tool throws UnknownToolError", async () => {
  const adapter = createTestAdapter();

  await assertRejects(
    () =>
      adapter.callTool("erpnext.nope", {}, {
        tenantId: "acme",
        actorSubject: null,
      }),
    UnknownToolError,
    "Unknown erpnext tool: erpnext.nope",
  );
});

// ── Wave 1: supplier / payment / stock reads ──────────────────────────────────

Deno.test("createErpnextAdapter — supplier_list calls Frappe Supplier list with filters", async () => {
  const captured: CapturedFetch[] = [];
  const restore = mockFetch({
    status: 200,
    body: {
      data: [
        {
          name: "SUPP-001",
          supplier_name: "SupplierCo",
          supplier_type: "Company",
          supplier_group: "Distributor",
        },
      ],
    },
  }, captured);

  try {
    const adapter = createTestAdapter();
    const result = await adapter.callTool(
      "erpnext.supplier_list",
      {
        limit: 1,
        supplierGroup: "Distributor",
        supplierType: "Company",
        includeDisabled: false,
      },
      { tenantId: "acme", actorSubject: null },
    );

    assertEquals(captured.length, 1);
    assertEquals(captured[0].method, "GET");
    assertEquals(captured[0].url.pathname, "/api/resource/Supplier");
    assertEquals(
      JSON.parse(captured[0].url.searchParams.get("fields") ?? "[]"),
      [
        "name",
        "supplier_name",
        "supplier_type",
        "supplier_group",
        "country",
        "disabled",
        "modified",
      ],
    );
    assertEquals(
      JSON.parse(captured[0].url.searchParams.get("filters") ?? "[]"),
      [
        ["disabled", "=", 0],
        ["supplier_group", "=", "Distributor"],
        ["supplier_type", "=", "Company"],
      ],
    );
    assertEquals(captured[0].url.searchParams.get("limit_page_length"), "1");
    assertEquals((result.content as { count: number }).count, 1);
    assertEquals((result.content as { suppliers: unknown[] }).suppliers, [
      {
        name: "SUPP-001",
        supplier_name: "SupplierCo",
        supplier_type: "Company",
        supplier_group: "Distributor",
      },
    ]);
  } finally {
    restore();
  }
});

Deno.test("createErpnextAdapter — supplier_get calls Frappe Supplier get", async () => {
  const captured: CapturedFetch[] = [];
  const restore = mockFetch({
    status: 200,
    body: {
      data: {
        name: "SUPP-001",
        supplier_name: "SupplierCo",
        country: "France",
      },
    },
  }, captured);

  try {
    const adapter = createTestAdapter();
    const result = await adapter.callTool(
      "erpnext.supplier_get",
      { name: "SUPP-001" },
      { tenantId: "acme", actorSubject: null },
    );

    assertEquals(captured.length, 1);
    assertEquals(captured[0].method, "GET");
    assertEquals(captured[0].url.pathname, "/api/resource/Supplier/SUPP-001");
    assertEquals((result.content as { supplier: unknown }).supplier, {
      name: "SUPP-001",
      supplier_name: "SupplierCo",
      country: "France",
    });
  } finally {
    restore();
  }
});

Deno.test("createErpnextAdapter — payment_entry_list calls Frappe Payment Entry list with filters", async () => {
  const captured: CapturedFetch[] = [];
  const restore = mockFetch({
    status: 200,
    body: {
      data: [
        {
          name: "PE-001",
          payment_type: "Receive",
          party_type: "Customer",
          party: "CUST-001",
          paid_amount: 1200,
        },
      ],
    },
  }, captured);

  try {
    const adapter = createTestAdapter();
    const result = await adapter.callTool(
      "erpnext.payment_entry_list",
      {
        partyType: "Customer",
        party: "CUST-001",
        paymentType: "Receive",
        dateFrom: "2026-01-01",
        dateTo: "2026-01-31",
      },
      { tenantId: "acme", actorSubject: null },
    );

    assertEquals(captured.length, 1);
    assertEquals(captured[0].method, "GET");
    assertEquals(
      captured[0].url.pathname,
      "/api/resource/Payment%20Entry",
    );
    assertEquals(
      JSON.parse(captured[0].url.searchParams.get("fields") ?? "[]"),
      [
        "name",
        "payment_type",
        "party_type",
        "party",
        "posting_date",
        "paid_amount",
        "paid_from_account_currency",
        "paid_to_account_currency",
        "status",
        "modified",
      ],
    );
    assertEquals(
      JSON.parse(captured[0].url.searchParams.get("filters") ?? "[]"),
      [
        ["party_type", "=", "Customer"],
        ["party", "=", "CUST-001"],
        ["payment_type", "=", "Receive"],
        ["posting_date", ">=", "2026-01-01"],
        ["posting_date", "<=", "2026-01-31"],
      ],
    );
    assertEquals((result.content as { count: number }).count, 1);
    assertEquals(
      (result.content as { paymentEntries: unknown[] }).paymentEntries,
      [
        {
          name: "PE-001",
          payment_type: "Receive",
          party_type: "Customer",
          party: "CUST-001",
          paid_amount: 1200,
        },
      ],
    );
  } finally {
    restore();
  }
});

Deno.test("createErpnextAdapter — payment_entry_get calls Frappe Payment Entry get", async () => {
  const captured: CapturedFetch[] = [];
  const restore = mockFetch({
    status: 200,
    body: {
      data: {
        name: "PE-001",
        payment_type: "Receive",
        party_type: "Customer",
        party: "CUST-001",
        paid_amount: 1200,
      },
    },
  }, captured);

  try {
    const adapter = createTestAdapter();
    const result = await adapter.callTool(
      "erpnext.payment_entry_get",
      { name: "PE-001" },
      { tenantId: "acme", actorSubject: null },
    );

    assertEquals(captured.length, 1);
    assertEquals(captured[0].method, "GET");
    assertEquals(
      captured[0].url.pathname,
      "/api/resource/Payment%20Entry/PE-001",
    );
    assertEquals(
      (result.content as { paymentEntry: unknown }).paymentEntry,
      {
        name: "PE-001",
        payment_type: "Receive",
        party_type: "Customer",
        party: "CUST-001",
        paid_amount: 1200,
      },
    );
  } finally {
    restore();
  }
});

Deno.test("createErpnextAdapter — bin_list calls Frappe Bin list with filters", async () => {
  const captured: CapturedFetch[] = [];
  const restore = mockFetch({
    status: 200,
    body: {
      data: [
        {
          name: "ITEM-001::Main Warehouse",
          item_code: "ITEM-001",
          warehouse: "Main Warehouse",
          actual_qty: 100,
          reserved_qty: 10,
          ordered_qty: 50,
        },
      ],
    },
  }, captured);

  try {
    const adapter = createTestAdapter();
    const result = await adapter.callTool(
      "erpnext.bin_list",
      {
        itemCode: "ITEM-001",
        warehouse: "Main Warehouse",
      },
      { tenantId: "acme", actorSubject: null },
    );

    assertEquals(captured.length, 1);
    assertEquals(captured[0].method, "GET");
    assertEquals(captured[0].url.pathname, "/api/resource/Bin");
    assertEquals(
      JSON.parse(captured[0].url.searchParams.get("fields") ?? "[]"),
      [
        "name",
        "item_code",
        "warehouse",
        "actual_qty",
        "reserved_qty",
        "ordered_qty",
        "modified",
      ],
    );
    assertEquals(
      JSON.parse(captured[0].url.searchParams.get("filters") ?? "[]"),
      [
        ["item_code", "=", "ITEM-001"],
        ["warehouse", "=", "Main Warehouse"],
      ],
    );
    assertEquals((result.content as { count: number }).count, 1);
    assertEquals((result.content as { bins: unknown[] }).bins, [
      {
        name: "ITEM-001::Main Warehouse",
        item_code: "ITEM-001",
        warehouse: "Main Warehouse",
        actual_qty: 100,
        reserved_qty: 10,
        ordered_qty: 50,
      },
    ]);
  } finally {
    restore();
  }
});

// ── Wave 2: detail-viewer _meta + data field ──────────────────────────────────

Deno.test("createErpnextAdapter — sales_order_get tool has ERP_DETAIL_META", () => {
  const adapter = createTestAdapter();
  const tool = adapter.tools().find((t) =>
    t.name === "erpnext.sales_order_get"
  );
  assertEquals(tool?._meta, {
    ui: { resourceUri: "ui://mcp-erp/detail-viewer" },
  });
});

Deno.test("createErpnextAdapter — sales_order_get result includes data field", async () => {
  const captured: CapturedFetch[] = [];
  const restore = mockFetch({
    status: 200,
    body: {
      data: {
        name: "SO-001",
        customer: "CUST-001",
        status: "To Deliver and Bill",
        items: [{ item_code: "ITEM-001", qty: 3 }],
      },
    },
  }, captured);

  try {
    const adapter = createTestAdapter();
    const result = await adapter.callTool(
      "erpnext.sales_order_get",
      { name: "SO-001" },
      { tenantId: "acme", actorSubject: null },
    );

    const content = result.content as Record<string, unknown>;
    const data = content.data as Record<string, unknown>;
    assertEquals(data.name, "SO-001");
    assertEquals(data.status, "To Deliver and Bill");
    // backward-compat field
    assertEquals(
      (content.salesOrder as Record<string, unknown>).name,
      "SO-001",
    );
  } finally {
    restore();
  }
});

// ── quotation_get: detail-viewer _meta + data field ──────────────────────────

Deno.test("createErpnextAdapter — quotation_get tool has ERP_DETAIL_META", () => {
  const adapter = createTestAdapter();
  const tool = adapter.tools().find((t) => t.name === "erpnext.quotation_get");
  assertEquals(tool?._meta, {
    ui: { resourceUri: "ui://mcp-erp/detail-viewer" },
  });
});

Deno.test("createErpnextAdapter — quotation_get result includes data field", async () => {
  const captured: CapturedFetch[] = [];
  const restore = mockFetch({
    status: 200,
    body: {
      data: {
        name: "QTN-001",
        party_name: "CUST-001",
        status: "Open",
        items: [{ item_code: "ITEM-001", qty: 1 }],
      },
    },
  }, captured);

  try {
    const adapter = createTestAdapter();
    const result = await adapter.callTool(
      "erpnext.quotation_get",
      { name: "QTN-001" },
      { tenantId: "acme", actorSubject: null },
    );

    const content = result.content as Record<string, unknown>;
    const data = content.data as Record<string, unknown>;
    assertEquals(data.name, "QTN-001");
    assertEquals(data.status, "Open");
    // backward-compat field
    assertEquals(
      (content.quotation as Record<string, unknown>).name,
      "QTN-001",
    );
  } finally {
    restore();
  }
});

// ── Step 10: mapErpNextSalesInvoice normalizer ────────────────────────────────

Deno.test("mapErpNextSalesInvoice — maps a full native ERPNext sales invoice to the invoice-viewer contract", () => {
  const native = {
    name: "SINV-001",
    status: "Unpaid",
    customer: "Acme Corp",
    posting_date: "2026-01-15",
    due_date: "2026-02-15",
    currency: "EUR",
    grand_total: 1200,
    net_total: 1000,
    total_taxes_and_charges: 200,
    items: [
      {
        item_name: "Consulting",
        item_code: "SVC-001",
        qty: 2,
        rate: 500,
        amount: 1000,
      },
    ],
  };

  const result = mapErpNextSalesInvoice(native);

  assertEquals(result.name, "SINV-001");
  assertEquals(result.status, "Unpaid");
  assertEquals(result.customer, "Acme Corp");
  assertEquals(result.posting_date, "2026-01-15");
  assertEquals(result.due_date, "2026-02-15");
  assertEquals(result.currency, "EUR");
  assertEquals(result.grand_total, 1200);
  assertEquals(result.net_total, 1000);
  assertEquals(result.total_taxes_and_charges, 200);
  assertEquals(result.items, [
    { item_name: "Consulting", qty: 2, rate: 500, amount: 1000 },
  ]);
});

Deno.test("mapErpNextSalesInvoice — falls back to item_code when item_name is absent", () => {
  const native = {
    name: "SINV-002",
    status: "Draft",
    items: [
      { item_code: "SVC-002", qty: 1, rate: 300, amount: 300 },
    ],
  };

  const result = mapErpNextSalesInvoice(native);

  assertEquals(
    (result.items as Record<string, unknown>[])[0].item_name,
    "SVC-002",
  );
});

Deno.test("mapErpNextSalesInvoice — handles missing optional fields gracefully", () => {
  const native = { name: "SINV-003", status: "Paid" };

  const result = mapErpNextSalesInvoice(native);

  assertEquals(result.name, "SINV-003");
  assertEquals(result.status, "Paid");
  assertEquals(result.items, []);
  assertEquals(result.customer, undefined);
  assertEquals(result.grand_total, undefined);
});

Deno.test("mapErpNextSalesInvoice — contract is consistent with Dolibarr invoice-viewer fields", () => {
  // Both ERPNext and Dolibarr normalizers target the SAME set of keys.
  // This test documents and locks down the cross-provider contract.
  const native = {
    name: "SINV-004",
    status: "Unpaid",
    customer: "Globex",
    posting_date: "2026-03-01",
    due_date: "2026-03-31",
    currency: "USD",
    grand_total: 500,
    net_total: 400,
    total_taxes_and_charges: 100,
    items: [{ item_name: "Widget", qty: 5, rate: 80, amount: 400 }],
  };

  const result = mapErpNextSalesInvoice(native);

  // Contract keys expected by invoice-viewer (same as Dolibarr's mapDolibarrInvoice output)
  const expectedKeys = [
    "name",
    "status",
    "items",
    "customer",
    "posting_date",
    "due_date",
    "currency",
    "grand_total",
    "net_total",
    "total_taxes_and_charges",
  ];
  for (const key of expectedKeys) {
    assertEquals(
      key in result,
      true,
      `Expected contract key "${key}" to be present in mapped invoice`,
    );
  }
});

Deno.test("createErpnextAdapter — sales_invoice_get tool has ERP_INVOICE_META", () => {
  const adapter = createTestAdapter();
  const tool = adapter.tools().find((t) =>
    t.name === "erpnext.sales_invoice_get"
  );
  assertEquals(tool?._meta, {
    ui: { resourceUri: "ui://mcp-erp/invoice-viewer" },
  });
});

// ── Step 10 (Codex corrections): docstatus fallback + isRecord guard ──────────

Deno.test("mapErpNextSalesInvoice — derives status from docstatus:0 when status absent", () => {
  const result = mapErpNextSalesInvoice({ name: "SINV-A", docstatus: 0 });
  assertEquals(result.status, "Draft");
});

Deno.test("mapErpNextSalesInvoice — derives status from docstatus:1 when status absent", () => {
  const result = mapErpNextSalesInvoice({ name: "SINV-B", docstatus: 1 });
  assertEquals(result.status, "Submitted");
});

Deno.test("mapErpNextSalesInvoice — derives status from docstatus:2 when status absent", () => {
  const result = mapErpNextSalesInvoice({ name: "SINV-C", docstatus: 2 });
  assertEquals(result.status, "Cancelled");
});

Deno.test("mapErpNextSalesInvoice — explicit status takes precedence over docstatus", () => {
  const result = mapErpNextSalesInvoice({
    name: "SINV-D",
    status: "Unpaid",
    docstatus: 1,
  });
  assertEquals(result.status, "Unpaid");
});

Deno.test("mapErpNextSalesInvoice — isRecord guard skips null/primitive items without crash", () => {
  const result = mapErpNextSalesInvoice({
    name: "SINV-E",
    status: "Draft",
    items: [null, "x", 42, { item_code: "A", qty: 1, rate: 10, amount: 10 }],
  });
  // Only the valid object survives the guard
  assertEquals((result.items as unknown[]).length, 1);
  assertEquals(
    (result.items as Record<string, unknown>[])[0].item_name,
    "A",
  );
});

// ── Task 4+5: FrappeRestClient.create + erpnext.customer_create ───────────────

Deno.test("FrappeRestClient.create — POSTs the doc body with content-type", async () => {
  const captured: CapturedFetch[] = [];
  const restore = mockFetch(
    {
      status: 200,
      body: { data: { name: "CUST-0001", customer_name: "Acme" } },
    },
    captured,
  );
  try {
    const adapter = createTestAdapter();
    const result = await adapter.callTool(
      "erpnext.customer_create",
      { mode: "commit", customer_name: "Acme" },
      { tenantId: "t", actorSubject: null },
    );
    assertEquals(captured[0].method, "POST");
    assertEquals(captured[0].url.pathname, "/api/resource/Customer");
    assertEquals(captured[0].headers.get("content-type"), "application/json");
    assertEquals(JSON.parse(captured[0].body as string).customer_name, "Acme");
    assertEquals(
      (result.content as { nativeId: string }).nativeId,
      "CUST-0001",
    );
  } finally {
    restore();
  }
});

Deno.test("erpnext.customer_create — preview resolves payload without POST", async () => {
  const captured: CapturedFetch[] = [];
  const restore = mockFetch({ status: 200, body: {} }, captured);
  try {
    const adapter = createTestAdapter();
    const r = await adapter.callTool(
      "erpnext.customer_create",
      { mode: "preview", customer_name: "Acme", customer_type: "Company" },
      { tenantId: "t", actorSubject: null },
    );
    assertEquals(captured.length, 0); // no HTTP on preview
    const c = r.content as {
      committed: boolean;
      resolved: { document: Record<string, unknown>; contact: null };
    };
    assertEquals(c.committed, false);
    assertEquals(c.resolved.document.customer_name, "Acme");
    assertEquals(c.resolved.document.customer_type, "Company");
  } finally {
    restore();
  }
});

Deno.test("erpnext.customer_create — injects optional customer_group default", async () => {
  const captured: CapturedFetch[] = [];
  const restore = mockFetch(
    { status: 200, body: { data: { name: "CUST-1" } } },
    captured,
  );
  try {
    const adapter = createErpnextAdapter({
      erpType: "erpnext",
      apiUrl: "https://erp.example.com",
      apiKey: "k",
      apiSecret: "s",
      sandbox: true,
      defaultCustomerGroup: "All Customer Groups",
    });
    const r = await adapter.callTool(
      "erpnext.customer_create",
      { mode: "commit", customer_name: "Acme" },
      { tenantId: "t", actorSubject: null },
    );
    assertEquals(
      JSON.parse(captured[0].body as string).customer_group,
      "All Customer Groups",
    );
    assertEquals((r.content as { committed: boolean }).committed, true);
    assertEquals((r.content as { nativeId: string }).nativeId, "CUST-1");
  } finally {
    restore();
  }
});

// ── Task 6: erpnext.item_create ───────────────────────────────────────────────

Deno.test("erpnext.item_create — missing defaultItemGroup throws MISSING_REQUIRED_CONFIG", async () => {
  const restore = mockFetch({ status: 200, body: {} }, []);
  try {
    const adapter = createTestAdapter(); // no defaultItemGroup
    const err = await assertRejects(
      () =>
        adapter.callTool(
          "erpnext.item_create",
          {
            mode: "commit",
            item_name: "Widget",
            item_code: "W-1",
            stock_uom: "Nos",
          },
          { tenantId: "t", actorSubject: null },
        ),
      WriteError,
    );
    assertEquals(err.code, "MISSING_REQUIRED_CONFIG");
    assertEquals(err.context.field, "item_group");
  } finally {
    restore();
  }
});

Deno.test("erpnext.item_create — commit sends is_sales_item and defaults", async () => {
  const captured: CapturedFetch[] = [];
  const restore = mockFetch(
    { status: 200, body: { data: { name: "ITEM-1" } } },
    captured,
  );
  try {
    const adapter = createErpnextAdapter({
      erpType: "erpnext",
      apiUrl: "https://erp.example.com",
      apiKey: "k",
      apiSecret: "s",
      sandbox: true,
      defaultItemGroup: "All Item Groups",
      defaultStockUom: "Nos",
    });
    await adapter.callTool(
      "erpnext.item_create",
      {
        mode: "commit",
        item_name: "Widget",
        item_code: "W-1",
        is_stock_item: 0,
      },
      { tenantId: "t", actorSubject: null },
    );
    const body = JSON.parse(captured[0].body as string);
    assertEquals(body.item_code, "W-1");
    assertEquals(body.is_stock_item, 0);
    assertEquals(body.is_sales_item, 1);
    assertEquals(body.item_group, "All Item Groups");
    assertEquals(body.stock_uom, "Nos");
  } finally {
    restore();
  }
});

// ── Fix 2: CREATE_FAILED on malformed ERPNext create response ─────────────────

Deno.test("erpnext.customer_create — no name in response throws CREATE_FAILED", async () => {
  const restore = mockFetch({ status: 200, body: { data: {} } }, []);
  try {
    const adapter = createTestAdapter();
    const err = await assertRejects(
      () =>
        adapter.callTool(
          "erpnext.customer_create",
          { mode: "commit", customer_name: "Acme" },
          { tenantId: "t", actorSubject: null },
        ),
      WriteError,
    );
    assertEquals(err.code, "CREATE_FAILED");
    assertEquals(err.context.erpType, "erpnext");
  } finally {
    restore();
  }
});

Deno.test("erpnext.item_create — no name in response throws CREATE_FAILED", async () => {
  const restore = mockFetch(
    { status: 200, body: { data: { item_code: "W-1" } } },
    [],
  );
  try {
    const adapter = createErpnextAdapter({
      erpType: "erpnext",
      apiUrl: "https://erp.example.com",
      apiKey: "k",
      apiSecret: "s",
      sandbox: true,
      defaultItemGroup: "All Item Groups",
      defaultStockUom: "Nos",
    });
    const err = await assertRejects(
      () =>
        adapter.callTool(
          "erpnext.item_create",
          { mode: "commit", item_name: "Widget", item_code: "W-1" },
          { tenantId: "t", actorSubject: null },
        ),
      WriteError,
    );
    assertEquals(err.code, "CREATE_FAILED");
    assertEquals(err.context.erpType, "erpnext");
  } finally {
    restore();
  }
});

// ── Task B: customer_update ───────────────────────────────────────────────────

Deno.test("erpnext.customer_update — preview returns committed:false without PUT", async () => {
  const captured: CapturedFetch[] = [];
  const restore = mockFetch({ status: 200, body: {} }, captured);
  try {
    const adapter = createTestAdapter();
    const r = await adapter.callTool(
      "erpnext.customer_update",
      {
        mode: "preview",
        name: "CUST-001",
        customer_name: "Acme Updated",
        tax_id: "FR123",
      },
      { tenantId: "t", actorSubject: null },
    );
    assertEquals(captured.length, 0);
    const c = r.content as {
      committed: boolean;
      doctype: string;
      resolved: { document: Record<string, unknown>; contact: null };
    };
    assertEquals(c.committed, false);
    assertEquals(c.doctype, "Customer");
    assertEquals(c.resolved.document.customer_name, "Acme Updated");
    assertEquals(c.resolved.document.tax_id, "FR123");
  } finally {
    restore();
  }
});

Deno.test("erpnext.customer_update — commit sends PUT Customer with partial body", async () => {
  const captured: CapturedFetch[] = [];
  const restore = mockFetch(
    {
      status: 200,
      body: { data: { name: "CUST-001", customer_name: "Acme Updated" } },
    },
    captured,
  );
  try {
    const adapter = createTestAdapter();
    const r = await adapter.callTool(
      "erpnext.customer_update",
      {
        mode: "commit",
        name: "CUST-001",
        customer_name: "Acme Updated",
      },
      { tenantId: "t", actorSubject: null },
    );
    assertEquals(captured.length, 1); // 1 PUT only, no Contact (no email)
    assertEquals(captured[0].method, "PUT");
    assertEquals(
      captured[0].url.pathname,
      "/api/resource/Customer/CUST-001",
    );
    assertEquals(captured[0].headers.get("content-type"), "application/json");
    const body = JSON.parse(captured[0].body as string);
    assertEquals(body.customer_name, "Acme Updated");
    // name must NOT appear in the body (it's a URL param)
    assertEquals("name" in body, false);
    const c = r.content as { committed: boolean; nativeId: string };
    assertEquals(c.committed, true);
    assertEquals(c.nativeId, "CUST-001");
  } finally {
    restore();
  }
});

Deno.test("erpnext.customer_update — missing name in response throws UPDATE_FAILED", async () => {
  const restore = mockFetch(
    { status: 200, body: { data: {} } },
    [],
  );
  try {
    const adapter = createTestAdapter();
    const err = await assertRejects(
      () =>
        adapter.callTool(
          "erpnext.customer_update",
          { mode: "commit", name: "CUST-001", customer_name: "X" },
          { tenantId: "t", actorSubject: null },
        ),
      WriteError,
    );
    assertEquals(err.code, "UPDATE_FAILED");
    assertEquals(err.context.erpType, "erpnext");
  } finally {
    restore();
  }
});

// ── Task B: item_update ───────────────────────────────────────────────────────

Deno.test("erpnext.item_update — preview returns committed:false without PUT", async () => {
  const captured: CapturedFetch[] = [];
  const restore = mockFetch({ status: 200, body: {} }, captured);
  try {
    const adapter = createTestAdapter();
    const r = await adapter.callTool(
      "erpnext.item_update",
      {
        mode: "preview",
        name: "ITEM-001",
        item_name: "Widget v2",
        standard_rate: 99.9,
      },
      { tenantId: "t", actorSubject: null },
    );
    assertEquals(captured.length, 0);
    const c = r.content as {
      committed: boolean;
      doctype: string;
      resolved: Record<string, unknown>;
    };
    assertEquals(c.committed, false);
    assertEquals(c.doctype, "Item");
    assertEquals(c.resolved.item_name, "Widget v2");
    assertEquals(c.resolved.standard_rate, 99.9);
  } finally {
    restore();
  }
});

Deno.test("erpnext.item_update — commit sends PUT Item, does NOT send item_code", async () => {
  const captured: CapturedFetch[] = [];
  const restore = mockFetch(
    { status: 200, body: { data: { name: "ITEM-001" } } },
    captured,
  );
  try {
    const adapter = createTestAdapter();
    const r = await adapter.callTool(
      "erpnext.item_update",
      {
        mode: "commit",
        name: "ITEM-001",
        item_name: "Widget v2",
        standard_rate: 99.9,
        stock_uom: "Kg",
      },
      { tenantId: "t", actorSubject: null },
    );
    assertEquals(captured.length, 1);
    assertEquals(captured[0].method, "PUT");
    assertEquals(captured[0].url.pathname, "/api/resource/Item/ITEM-001");
    const body = JSON.parse(captured[0].body as string);
    assertEquals(body.item_name, "Widget v2");
    assertEquals(body.standard_rate, 99.9);
    assertEquals(body.stock_uom, "Kg");
    assertEquals("item_code" in body, false);
    assertEquals("name" in body, false);
    const c = r.content as { committed: boolean; nativeId: string };
    assertEquals(c.committed, true);
    assertEquals(c.nativeId, "ITEM-001");
  } finally {
    restore();
  }
});

Deno.test("erpnext.item_update — missing name in response throws UPDATE_FAILED", async () => {
  const restore = mockFetch({ status: 200, body: { data: {} } }, []);
  try {
    const adapter = createTestAdapter();
    const err = await assertRejects(
      () =>
        adapter.callTool(
          "erpnext.item_update",
          { mode: "commit", name: "ITEM-001", item_name: "X" },
          { tenantId: "t", actorSubject: null },
        ),
      WriteError,
    );
    assertEquals(err.code, "UPDATE_FAILED");
    assertEquals(err.context.erpType, "erpnext");
  } finally {
    restore();
  }
});

// ── Task B: supplier_create ───────────────────────────────────────────────────

Deno.test("erpnext.supplier_create — preview returns committed:false without POST", async () => {
  const captured: CapturedFetch[] = [];
  const restore = mockFetch({ status: 200, body: {} }, captured);
  try {
    const adapter = createTestAdapter();
    const r = await adapter.callTool(
      "erpnext.supplier_create",
      { mode: "preview", supplier_name: "SupplierCo", tax_id: "FR456" },
      { tenantId: "t", actorSubject: null },
    );
    assertEquals(captured.length, 0);
    const c = r.content as {
      committed: boolean;
      doctype: string;
      resolved: { document: Record<string, unknown>; contact: null };
    };
    assertEquals(c.committed, false);
    assertEquals(c.doctype, "Supplier");
    assertEquals(c.resolved.document.supplier_name, "SupplierCo");
    assertEquals(c.resolved.document.supplier_type, "Company"); // default
    assertEquals(c.resolved.document.tax_id, "FR456");
  } finally {
    restore();
  }
});

Deno.test("erpnext.supplier_create — commit POSTs Supplier body", async () => {
  const captured: CapturedFetch[] = [];
  const restore = mockFetch(
    {
      status: 200,
      body: { data: { name: "SUPP-0001", supplier_name: "SupplierCo" } },
    },
    captured,
  );
  try {
    const adapter = createTestAdapter();
    const r = await adapter.callTool(
      "erpnext.supplier_create",
      { mode: "commit", supplier_name: "SupplierCo" },
      { tenantId: "t", actorSubject: null },
    );
    assertEquals(captured.length, 1);
    assertEquals(captured[0].method, "POST");
    assertEquals(captured[0].url.pathname, "/api/resource/Supplier");
    const body = JSON.parse(captured[0].body as string);
    assertEquals(body.supplier_name, "SupplierCo");
    assertEquals(body.supplier_type, "Company");
    const c = r.content as { committed: boolean; nativeId: string };
    assertEquals(c.committed, true);
    assertEquals(c.nativeId, "SUPP-0001");
  } finally {
    restore();
  }
});

Deno.test("erpnext.supplier_create — injects defaultSupplierGroup if set", async () => {
  const captured: CapturedFetch[] = [];
  const restore = mockFetch(
    { status: 200, body: { data: { name: "SUPP-2" } } },
    captured,
  );
  try {
    const adapter = createErpnextAdapter({
      erpType: "erpnext",
      apiUrl: "https://erp.example.com",
      apiKey: "k",
      apiSecret: "s",
      sandbox: true,
      defaultSupplierGroup: "All Supplier Groups",
    });
    await adapter.callTool(
      "erpnext.supplier_create",
      { mode: "commit", supplier_name: "SupplierCo" },
      { tenantId: "t", actorSubject: null },
    );
    const body = JSON.parse(captured[0].body as string);
    assertEquals(body.supplier_group, "All Supplier Groups");
  } finally {
    restore();
  }
});

Deno.test("erpnext.supplier_create — no name in response throws CREATE_FAILED", async () => {
  const restore = mockFetch({ status: 200, body: { data: {} } }, []);
  try {
    const adapter = createTestAdapter();
    const err = await assertRejects(
      () =>
        adapter.callTool(
          "erpnext.supplier_create",
          { mode: "commit", supplier_name: "SupplierCo" },
          { tenantId: "t", actorSubject: null },
        ),
      WriteError,
    );
    assertEquals(err.code, "CREATE_FAILED");
    assertEquals(err.context.erpType, "erpnext");
  } finally {
    restore();
  }
});

// ── Task B: supplier_update ───────────────────────────────────────────────────

Deno.test("erpnext.supplier_update — preview returns committed:false without PUT", async () => {
  const captured: CapturedFetch[] = [];
  const restore = mockFetch({ status: 200, body: {} }, captured);
  try {
    const adapter = createTestAdapter();
    const r = await adapter.callTool(
      "erpnext.supplier_update",
      {
        mode: "preview",
        name: "SUPP-001",
        supplier_name: "SupplierCo Updated",
      },
      { tenantId: "t", actorSubject: null },
    );
    assertEquals(captured.length, 0);
    const c = r.content as {
      committed: boolean;
      doctype: string;
      resolved: { document: Record<string, unknown>; contact: null };
    };
    assertEquals(c.committed, false);
    assertEquals(c.doctype, "Supplier");
    assertEquals(c.resolved.document.supplier_name, "SupplierCo Updated");
  } finally {
    restore();
  }
});

Deno.test("erpnext.supplier_update — commit sends PUT Supplier with partial body", async () => {
  const captured: CapturedFetch[] = [];
  const restore = mockFetch(
    { status: 200, body: { data: { name: "SUPP-001" } } },
    captured,
  );
  try {
    const adapter = createTestAdapter();
    const r = await adapter.callTool(
      "erpnext.supplier_update",
      {
        mode: "commit",
        name: "SUPP-001",
        supplier_name: "SupplierCo Updated",
        supplier_type: "Individual",
        tax_id: "FR999",
      },
      { tenantId: "t", actorSubject: null },
    );
    assertEquals(captured.length, 1);
    assertEquals(captured[0].method, "PUT");
    assertEquals(captured[0].url.pathname, "/api/resource/Supplier/SUPP-001");
    const body = JSON.parse(captured[0].body as string);
    assertEquals(body.supplier_name, "SupplierCo Updated");
    assertEquals(body.supplier_type, "Individual");
    assertEquals(body.tax_id, "FR999");
    assertEquals("name" in body, false);
    const c = r.content as { committed: boolean; nativeId: string };
    assertEquals(c.committed, true);
    assertEquals(c.nativeId, "SUPP-001");
  } finally {
    restore();
  }
});

Deno.test("erpnext.supplier_update — missing name in response throws UPDATE_FAILED", async () => {
  const restore = mockFetch({ status: 200, body: { data: {} } }, []);
  try {
    const adapter = createTestAdapter();
    const err = await assertRejects(
      () =>
        adapter.callTool(
          "erpnext.supplier_update",
          { mode: "commit", name: "SUPP-001", supplier_name: "X" },
          { tenantId: "t", actorSubject: null },
        ),
      WriteError,
    );
    assertEquals(err.code, "UPDATE_FAILED");
    assertEquals(err.context.erpType, "erpnext");
  } finally {
    restore();
  }
});

// ── Fix 1: Contact logic ──────────────────────────────────────────────────────

Deno.test("erpnext.customer_create — email triggers Contact POST after doc", async () => {
  const captured: CapturedFetch[] = [];
  const restore = mockFetchSequence(
    [
      { status: 200, body: { data: { name: "CUST-2" } } }, // POST Customer
      { status: 200, body: { data: { name: "CONT-1" } } }, // POST Contact
    ],
    captured,
  );
  try {
    const adapter = createTestAdapter();
    const r = await adapter.callTool(
      "erpnext.customer_create",
      {
        mode: "commit",
        customer_name: "Acme",
        email: "acme@example.com",
        phone: "+33600000000",
      },
      { tenantId: "t", actorSubject: null },
    );
    assertEquals(captured.length, 2);
    assertEquals(captured[0].method, "POST");
    assertEquals(captured[0].url.pathname, "/api/resource/Customer");
    const customerBody = JSON.parse(captured[0].body as string);
    assertEquals("email_id" in customerBody, false);
    assertEquals("mobile_no" in customerBody, false);
    assertEquals(captured[1].method, "POST");
    assertEquals(captured[1].url.pathname, "/api/resource/Contact");
    const contactBody = JSON.parse(captured[1].body as string);
    assertEquals(contactBody.first_name, "Acme");
    assertEquals(contactBody.email_ids[0].email_id, "acme@example.com");
    assertEquals(contactBody.phone_nos[0].phone, "+33600000000");
    assertEquals(contactBody.links[0].link_doctype, "Customer");
    assertEquals(contactBody.links[0].link_name, "CUST-2");
    assertEquals((r.content as { committed: boolean }).committed, true);
    assertEquals((r.content as { nativeId: string }).nativeId, "CUST-2");
  } finally {
    restore();
  }
});

Deno.test("erpnext.customer_create — no email → no Contact POST", async () => {
  const captured: CapturedFetch[] = [];
  const restore = mockFetch(
    { status: 200, body: { data: { name: "CUST-3" } } },
    captured,
  );
  try {
    const adapter = createTestAdapter();
    await adapter.callTool(
      "erpnext.customer_create",
      { mode: "commit", customer_name: "Acme" },
      { tenantId: "t", actorSubject: null },
    );
    assertEquals(captured.length, 1);
    assertEquals(captured[0].method, "POST");
    assertEquals(captured[0].url.pathname, "/api/resource/Customer");
  } finally {
    restore();
  }
});

Deno.test("erpnext.customer_create — CONTACT_FAILED if Contact POST fails", async () => {
  const captured: CapturedFetch[] = [];
  const restore = mockFetchSequence(
    [
      { status: 200, body: { data: { name: "CUST-4" } } }, // POST Customer OK
      { status: 400, body: { message: "validation error" } }, // POST Contact FAIL
    ],
    captured,
  );
  try {
    const adapter = createTestAdapter();
    const err = await assertRejects(
      () =>
        adapter.callTool(
          "erpnext.customer_create",
          { mode: "commit", customer_name: "Acme", email: "bad@example.com" },
          { tenantId: "t", actorSubject: null },
        ),
      WriteError,
    );
    assertEquals(err.code, "CONTACT_FAILED");
    assertEquals((err.context as { nativeId: string }).nativeId, "CUST-4");
    assertEquals((err.context as { erpType: string }).erpType, "erpnext");
  } finally {
    restore();
  }
});

Deno.test("erpnext.customer_create — preview includes document and contact payload, no HTTP", async () => {
  const captured: CapturedFetch[] = [];
  const restore = mockFetch({ status: 200, body: {} }, captured);
  try {
    const adapter = createTestAdapter();
    const r = await adapter.callTool(
      "erpnext.customer_create",
      { mode: "preview", customer_name: "Acme", email: "acme@example.com" },
      { tenantId: "t", actorSubject: null },
    );
    assertEquals(captured.length, 0);
    const c = r.content as {
      committed: boolean;
      resolved: {
        document: Record<string, unknown>;
        contact: Record<string, unknown> | null;
      };
    };
    assertEquals(c.committed, false);
    assertEquals(c.resolved.document.customer_name, "Acme");
    assertEquals(c.resolved.contact !== null, true);
    assertEquals(
      (c.resolved.contact as Record<string, unknown>).first_name,
      "Acme",
    );
  } finally {
    restore();
  }
});

Deno.test("erpnext.customer_update — email triggers find-or-create: no existing → POST Contact", async () => {
  const captured: CapturedFetch[] = [];
  const restore = mockFetchSequence(
    [
      { status: 200, body: { data: { name: "CUST-001" } } }, // PUT Customer
      { status: 200, body: { data: [] } }, // GET Contact (none found)
      { status: 200, body: { data: { name: "CONT-1" } } }, // POST Contact
    ],
    captured,
  );
  try {
    const adapter = createTestAdapter();
    await adapter.callTool(
      "erpnext.customer_update",
      {
        mode: "commit",
        name: "CUST-001",
        customer_name: "Acme",
        email: "acme@example.com",
      },
      { tenantId: "t", actorSubject: null },
    );
    assertEquals(captured.length, 3);
    assertEquals(captured[0].method, "PUT");
    assertEquals(captured[1].method, "GET");
    assertEquals(captured[1].url.pathname, "/api/resource/Contact");
    assertEquals(captured[2].method, "POST");
    assertEquals(captured[2].url.pathname, "/api/resource/Contact");
    const customerBody = JSON.parse(captured[0].body as string);
    assertEquals("email_id" in customerBody, false);
  } finally {
    restore();
  }
});

Deno.test("erpnext.customer_update — email triggers find-or-create: existing → PUT Contact", async () => {
  const captured: CapturedFetch[] = [];
  const restore = mockFetchSequence(
    [
      { status: 200, body: { data: { name: "CUST-001" } } }, // PUT Customer
      { status: 200, body: { data: [{ name: "CONT-1" }] } }, // GET Contact (found)
      { status: 200, body: { data: { name: "CONT-1" } } }, // PUT Contact
    ],
    captured,
  );
  try {
    const adapter = createTestAdapter();
    await adapter.callTool(
      "erpnext.customer_update",
      { mode: "commit", name: "CUST-001", email: "acme@example.com" },
      { tenantId: "t", actorSubject: null },
    );
    assertEquals(captured.length, 3);
    assertEquals(captured[2].method, "PUT");
    assertEquals(captured[2].url.pathname, "/api/resource/Contact/CONT-1");
  } finally {
    restore();
  }
});

Deno.test("erpnext.supplier_create — default_currency in Supplier payload", async () => {
  const captured: CapturedFetch[] = [];
  const restore = mockFetch(
    { status: 200, body: { data: { name: "SUPP-5" } } },
    captured,
  );
  try {
    const adapter = createTestAdapter();
    await adapter.callTool(
      "erpnext.supplier_create",
      { mode: "commit", supplier_name: "SupplierCo", default_currency: "EUR" },
      { tenantId: "t", actorSubject: null },
    );
    const body = JSON.parse(captured[0].body as string);
    assertEquals(body.default_currency, "EUR");
    assertEquals("email_id" in body, false);
  } finally {
    restore();
  }
});

Deno.test("erpnext.supplier_create — email triggers Contact POST", async () => {
  const captured: CapturedFetch[] = [];
  const restore = mockFetchSequence(
    [
      { status: 200, body: { data: { name: "SUPP-6" } } },
      { status: 200, body: { data: { name: "CONT-2" } } },
    ],
    captured,
  );
  try {
    const adapter = createTestAdapter();
    await adapter.callTool(
      "erpnext.supplier_create",
      {
        mode: "commit",
        supplier_name: "SupplierCo",
        email: "supplier@example.com",
      },
      { tenantId: "t", actorSubject: null },
    );
    assertEquals(captured.length, 2);
    assertEquals(captured[1].method, "POST");
    assertEquals(captured[1].url.pathname, "/api/resource/Contact");
    const contactBody = JSON.parse(captured[1].body as string);
    assertEquals(contactBody.links[0].link_doctype, "Supplier");
    assertEquals(contactBody.links[0].link_name, "SUPP-6");
  } finally {
    restore();
  }
});

Deno.test("erpnext.supplier_update — email triggers find-or-create Contact", async () => {
  const captured: CapturedFetch[] = [];
  const restore = mockFetchSequence(
    [
      { status: 200, body: { data: { name: "SUPP-001" } } },
      { status: 200, body: { data: [] } },
      { status: 200, body: { data: { name: "CONT-3" } } },
    ],
    captured,
  );
  try {
    const adapter = createTestAdapter();
    await adapter.callTool(
      "erpnext.supplier_update",
      {
        mode: "commit",
        name: "SUPP-001",
        email: "supplier@example.com",
      },
      { tenantId: "t", actorSubject: null },
    );
    assertEquals(captured.length, 3);
    assertEquals(captured[1].method, "GET");
    assertEquals(captured[2].method, "POST");
  } finally {
    restore();
  }
});
