import { assertEquals, assertRejects } from "@std/assert";
import { createErpnextAdapter, FrappeApiError } from "./erpnext.ts";
import { UnknownToolError } from "../adapter.ts";

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
    assertEquals(
      (result.content as { salesInvoice: unknown }).salesInvoice,
      {
        name: "SINV-001",
        customer: "CUST-001",
        items: [{ item_code: "ITEM-001", qty: 2 }],
      },
    );
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
