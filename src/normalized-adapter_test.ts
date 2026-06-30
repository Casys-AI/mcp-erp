/**
 * TDD Red bar — NormalizedAdapter (Wave 3).
 */

import { assertEquals, assertInstanceOf, assertRejects } from "@std/assert";
import type {
  ErpAdapter,
  ErpToolCallContext,
  ErpToolCallResult,
  ErpToolDefinition,
} from "./domain/adapter.ts";
import { UnknownToolError } from "./domain/adapter.ts";
import type { NormalizedPayload } from "./domain/normalized.ts";
import { NormalizedError } from "./domain/normalized.ts";
import { NormalizedAdapter } from "./normalized-adapter.ts";
import { WriteError } from "./domain/write.ts";
import { createDolibarrAdapter } from "./platform/erp/dolibarr/adapter.ts";
import { createErpnextAdapter } from "./platform/erp/erpnext/adapter.ts";

// ─── fetch-mock helpers (used by write tests) ────────────────────────────────

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
        headers: { "content-type": "application/json" },
      }),
    );
  };
  return () => {
    globalThis.fetch = original;
  };
}

function createErpnextTestAdapter(itemGroup?: string, stockUom?: string) {
  return createErpnextAdapter({
    erpType: "erpnext",
    apiUrl: "https://erp.example.com",
    apiKey: "k",
    apiSecret: "s",
    sandbox: true,
    ...(itemGroup !== undefined ? { defaultItemGroup: itemGroup } : {}),
    ...(stockUom !== undefined ? { defaultStockUom: stockUom } : {}),
  });
}

function createDolibarrTestAdapter() {
  return createDolibarrAdapter({
    erpType: "dolibarr",
    apiUrl: "https://dolibarr.example.com/api/index.php",
    apiKey: "dolikey",
    sandbox: true,
  });
}

// ─── Mock adapters ────────────────────────────────────────────────────────────

const CTX: ErpToolCallContext = {
  tenantId: "test-tenant",
  actorSubject: null,
};

const mockErpnextAdapter: ErpAdapter = {
  erpType: "erpnext",
  tools(): ErpToolDefinition[] {
    return [];
  },
  callTool(
    name: string,
    args: Record<string, unknown>,
  ): Promise<ErpToolCallResult> {
    const ok = (content: unknown): Promise<ErpToolCallResult> =>
      Promise.resolve({ content });
    if (name === "erpnext.customer_get") {
      return ok({
        customer: {
          name: String(args.name ?? "CUST-001"),
          customer_name: "Test Corp",
        },
      });
    }
    if (name === "erpnext.supplier_get") {
      return ok({
        supplier: {
          name: String(args.name ?? "SUPP-001"),
          supplier_name: "Parts Co",
        },
      });
    }
    if (name === "erpnext.item_get") {
      return ok({
        item: { name: String(args.name ?? "ITEM-001"), item_code: "SKU-123" },
      });
    }
    if (name === "erpnext.sales_invoice_get") {
      return ok({
        salesInvoice: {
          name: String(args.name ?? "SINV-00001"),
          customer: "ACME",
          status: "Unpaid",
          grand_total: 500,
          currency: "EUR",
        },
      });
    }
    if (name === "erpnext.sales_order_get") {
      return ok({
        salesOrder: {
          name: String(args.name ?? "SO-00001"),
          customer: "ACME",
          status: "To Deliver and Bill",
        },
      });
    }
    if (name === "erpnext.quotation_get") {
      return ok({
        quotation: {
          name: String(args.name ?? "QTN-00001"),
          party_name: "Prospect SA",
          status: "Open",
        },
      });
    }
    if (name === "erpnext.customer_list") {
      return ok({
        customers: [{ name: "CUST-001", customer_name: "Test Corp" }],
        count: 1,
      });
    }
    if (name === "erpnext.supplier_list") {
      return ok({
        suppliers: [{ name: "SUPP-001", supplier_name: "Parts Co" }],
        count: 1,
      });
    }
    if (name === "erpnext.item_list") {
      return ok({
        items: [{ name: "ITEM-001", item_code: "SKU-123" }],
        count: 1,
      });
    }
    return Promise.reject(new UnknownToolError("erpnext", name));
  },
  dispose(): void {},
};

const mockDolibarrAdapter: ErpAdapter = {
  erpType: "dolibarr",
  tools(): ErpToolDefinition[] {
    return [];
  },
  callTool(
    name: string,
    args: Record<string, unknown>,
  ): Promise<ErpToolCallResult> {
    const ok = (content: unknown): Promise<ErpToolCallResult> =>
      Promise.resolve({ content });
    if (name === "dolibarr.invoice_get") {
      return ok({
        invoice: {
          id: args.id ?? 42,
          ref: "FA2025-042",
          statut: 1,
          paye: "0",
          total_ttc: 1200,
          currency: "EUR",
          socname: "Client SA",
        },
      });
    }
    if (name === "dolibarr.order_get") {
      return ok({ order: { id: args.id ?? 10, ref: "CO2025-010", statut: 1 } });
    }
    if (name === "dolibarr.proposal_get") {
      return ok({
        proposal: { id: args.id ?? 5, ref: "DE2025-005", statut: 2 },
      });
    }
    if (name === "dolibarr.thirdparty_get") {
      return ok({
        thirdparty: {
          id: args.id ?? 77,
          name: "Fournisseur SA",
          ref: "FOUR-001",
        },
      });
    }
    if (name === "dolibarr.product_get") {
      return ok({
        product: { id: args.id ?? 3, ref: "SKU-003", label: "Widget Pro" },
      });
    }
    if (name === "dolibarr.thirdparty_list") {
      return ok({
        thirdparties: [{ id: 77, name: "Fournisseur SA", ref: "FOUR-001" }],
        count: 1,
      });
    }
    if (name === "dolibarr.product_list") {
      return ok({ products: [{ id: 3, ref: "SKU-003" }], count: 1 });
    }
    throw new UnknownToolError("dolibarr", name);
  },
  dispose(): void {},
};

// ─── NormalizedAdapter instance ───────────────────────────────────────────────

const adapter = new NormalizedAdapter({
  erpnext: mockErpnextAdapter,
  dolibarr: mockDolibarrAdapter,
});

// ─── tools() ─────────────────────────────────────────────────────────────────

Deno.test("NormalizedAdapter.tools — exposes exactly 14 erp.* tools", () => {
  const tools = adapter.tools();
  const names = tools.map((t) => t.name).sort();
  assertEquals(names, [
    "erp.business_party_get",
    "erp.business_party_list",
    "erp.capabilities_describe",
    "erp.catalog_item_get",
    "erp.catalog_item_list",
    "erp.customer_create",
    "erp.customer_update",
    "erp.product_create",
    "erp.product_update",
    "erp.quotation_get",
    "erp.sales_invoice_get",
    "erp.sales_order_get",
    "erp.supplier_create",
    "erp.supplier_update",
  ]);
});

Deno.test("NormalizedAdapter.tools — read tools are readOnly", () => {
  const readTools = adapter.tools().filter((t) =>
    !t.name.endsWith("_create") &&
    !t.name.endsWith("_update") &&
    t.name !== "erp.capabilities_describe"
  );
  for (const tool of readTools) {
    assertEquals(
      tool.annotations?.readOnlyHint,
      true,
      `${tool.name} should be readOnly`,
    );
  }
});

Deno.test("NormalizedAdapter.tools — write tools are not readOnly", () => {
  const writeTools = adapter.tools().filter(
    (t) => t.name.endsWith("_create") || t.name.endsWith("_update"),
  );
  for (const tool of writeTools) {
    assertEquals(
      tool.annotations?.readOnlyHint === true,
      false,
      `${tool.name} should NOT be readOnly`,
    );
  }
});

// ─── erp.business_party_get ──────────────────────────────────────────────────

Deno.test("erp.business_party_get — erpnext customer delegates correctly", async () => {
  const result = await adapter.callTool(
    "erp.business_party_get",
    { erpType: "erpnext", nativeId: "CUST-001", partyKind: "customer" },
    CTX,
  );
  const payload = result.content as NormalizedPayload;
  assertEquals(payload.nativeId, "CUST-001");
  assertEquals(payload.erpType, "erpnext");
  assertEquals(payload.nativeType, "Customer");
  assertEquals(payload.data.partyName, "Test Corp");
});

Deno.test("erp.business_party_get — erpnext supplier delegates correctly", async () => {
  const result = await adapter.callTool(
    "erp.business_party_get",
    { erpType: "erpnext", nativeId: "SUPP-001", partyKind: "supplier" },
    CTX,
  );
  const payload = result.content as NormalizedPayload;
  assertEquals(payload.nativeId, "SUPP-001");
  assertEquals(payload.nativeType, "Supplier");
  assertEquals(payload.data.partyName, "Parts Co");
});

Deno.test("erp.business_party_get — dolibarr thirdparty delegates correctly", async () => {
  const result = await adapter.callTool(
    "erp.business_party_get",
    { erpType: "dolibarr", nativeId: "77", partyKind: "customer" },
    CTX,
  );
  const payload = result.content as NormalizedPayload;
  assertEquals(payload.nativeId, "77");
  assertEquals(payload.erpType, "dolibarr");
  assertEquals(payload.nativeType, "thirdparty");
  assertEquals(payload.data.partyName, "Fournisseur SA");
});

// ─── erp.sales_invoice_get ───────────────────────────────────────────────────

Deno.test("erp.sales_invoice_get — erpnext delegates correctly", async () => {
  const result = await adapter.callTool(
    "erp.sales_invoice_get",
    { erpType: "erpnext", nativeId: "SINV-00001" },
    CTX,
  );
  const payload = result.content as NormalizedPayload;
  assertEquals(payload.nativeId, "SINV-00001");
  assertEquals(payload.erpType, "erpnext");
  assertEquals(payload.lifecycleState, "open"); // "Unpaid" → "open"
});

Deno.test("erp.sales_invoice_get — dolibarr delegates correctly", async () => {
  const result = await adapter.callTool(
    "erp.sales_invoice_get",
    { erpType: "dolibarr", nativeId: "42" },
    CTX,
  );
  const payload = result.content as NormalizedPayload;
  assertEquals(payload.nativeId, "42");
  assertEquals(payload.erpType, "dolibarr");
  assertEquals(payload.lifecycleState, "open"); // statut=1, paye=0 → "open"
  assertEquals(payload.data.currency, "EUR");
});

// ─── erp.sales_order_get ─────────────────────────────────────────────────────

Deno.test("erp.sales_order_get — erpnext", async () => {
  const result = await adapter.callTool(
    "erp.sales_order_get",
    { erpType: "erpnext", nativeId: "SO-00001" },
    CTX,
  );
  const payload = result.content as NormalizedPayload;
  assertEquals(payload.lifecycleState, "open");
});

Deno.test("erp.sales_order_get — dolibarr", async () => {
  const result = await adapter.callTool(
    "erp.sales_order_get",
    { erpType: "dolibarr", nativeId: "10" },
    CTX,
  );
  const payload = result.content as NormalizedPayload;
  assertEquals(payload.nativeType, "commande");
  assertEquals(payload.lifecycleState, "open");
});

// ─── erp.quotation_get ───────────────────────────────────────────────────────

Deno.test("erp.quotation_get — erpnext", async () => {
  const result = await adapter.callTool(
    "erp.quotation_get",
    { erpType: "erpnext", nativeId: "QTN-00001" },
    CTX,
  );
  const payload = result.content as NormalizedPayload;
  assertEquals(payload.lifecycleState, "open");
});

Deno.test("erp.quotation_get — dolibarr proposal signed", async () => {
  const result = await adapter.callTool(
    "erp.quotation_get",
    { erpType: "dolibarr", nativeId: "5" },
    CTX,
  );
  const payload = result.content as NormalizedPayload;
  assertEquals(payload.nativeType, "propal");
  assertEquals(payload.lifecycleState, "signed");
});

// ─── erp.catalog_item_get ────────────────────────────────────────────────────

Deno.test("erp.catalog_item_get — erpnext", async () => {
  const result = await adapter.callTool(
    "erp.catalog_item_get",
    { erpType: "erpnext", nativeId: "ITEM-001" },
    CTX,
  );
  const payload = result.content as NormalizedPayload;
  assertEquals(payload.nativeId, "ITEM-001");
  assertEquals(payload.data.ref, "SKU-123");
});

Deno.test("erp.catalog_item_get — dolibarr", async () => {
  const result = await adapter.callTool(
    "erp.catalog_item_get",
    { erpType: "dolibarr", nativeId: "3" },
    CTX,
  );
  const payload = result.content as NormalizedPayload;
  assertEquals(payload.nativeId, "3");
  assertEquals(payload.data.ref, "SKU-003");
});

// ─── _list tools ─────────────────────────────────────────────────────────────

Deno.test("erp.business_party_list — erpnext customers", async () => {
  const result = await adapter.callTool(
    "erp.business_party_list",
    { erpType: "erpnext", partyKind: "customer" },
    CTX,
  );
  const content = result.content as {
    items: NormalizedPayload[];
    count: number;
  };
  assertEquals(content.items.length, 1);
  assertEquals(content.items[0].nativeId, "CUST-001");
  assertEquals(content.items[0].erpType, "erpnext");
  assertEquals(content.count, 1);
});

Deno.test("erp.business_party_list — dolibarr thirdparties", async () => {
  const result = await adapter.callTool(
    "erp.business_party_list",
    { erpType: "dolibarr", partyKind: "customer" },
    CTX,
  );
  const content = result.content as {
    items: NormalizedPayload[];
    count: number;
  };
  assertEquals(content.items.length, 1);
  assertEquals(content.items[0].nativeId, "77");
});

Deno.test("erp.catalog_item_list — erpnext items", async () => {
  const result = await adapter.callTool(
    "erp.catalog_item_list",
    { erpType: "erpnext" },
    CTX,
  );
  const content = result.content as {
    items: NormalizedPayload[];
    count: number;
  };
  assertEquals(content.items.length, 1);
  assertEquals(content.items[0].nativeId, "ITEM-001");
});

// ─── Unknown erpType ─────────────────────────────────────────────────────────

Deno.test("callTool — unknown erpType → NormalizedError UNKNOWN_ERP_TYPE", async () => {
  await adapter.callTool(
    "erp.business_party_get",
    { erpType: "sap", nativeId: "X", partyKind: "customer" },
    CTX,
  ).then(() => {
    throw new Error("Expected NormalizedError but resolved");
  }).catch((err: unknown) => {
    assertInstanceOf(err, NormalizedError);
    assertEquals((err as NormalizedError).code, "UNKNOWN_ERP_TYPE");
  });
});

// ─── Unknown tool name ────────────────────────────────────────────────────────

Deno.test("callTool — unknown tool name → NormalizedError UNKNOWN_TOOL", async () => {
  await adapter.callTool(
    "erp.nonexistent_tool",
    { erpType: "erpnext", nativeId: "X" },
    CTX,
  ).then(() => {
    throw new Error("Expected NormalizedError but resolved");
  }).catch((err: unknown) => {
    assertInstanceOf(err, NormalizedError);
    assertEquals((err as NormalizedError).code, "UNKNOWN_TOOL");
  });
});

// ─── INVALID_NATIVE_ID (Dolibarr nativeId non-numérique) ──────────────────────

Deno.test("erp.sales_invoice_get — dolibarr nativeId='abc' → INVALID_NATIVE_ID", async () => {
  await adapter.callTool(
    "erp.sales_invoice_get",
    { erpType: "dolibarr", nativeId: "abc" },
    CTX,
  ).then(() => {
    throw new Error("Expected NormalizedError but resolved");
  }).catch((err: unknown) => {
    assertInstanceOf(err, NormalizedError);
    assertEquals((err as NormalizedError).code, "INVALID_NATIVE_ID");
  });
});

Deno.test("erp.sales_invoice_get — dolibarr nativeId='42abc' → INVALID_NATIVE_ID", async () => {
  await adapter.callTool(
    "erp.sales_invoice_get",
    { erpType: "dolibarr", nativeId: "42abc" },
    CTX,
  ).then(() => {
    throw new Error("Expected NormalizedError but resolved");
  }).catch((err: unknown) => {
    assertInstanceOf(err, NormalizedError);
    assertEquals((err as NormalizedError).code, "INVALID_NATIVE_ID");
  });
});

Deno.test("erp.sales_invoice_get — dolibarr nativeId='-1' → INVALID_NATIVE_ID", async () => {
  await adapter.callTool(
    "erp.sales_invoice_get",
    { erpType: "dolibarr", nativeId: "-1" },
    CTX,
  ).then(() => {
    throw new Error("Expected NormalizedError but resolved");
  }).catch((err: unknown) => {
    assertInstanceOf(err, NormalizedError);
    assertEquals((err as NormalizedError).code, "INVALID_NATIVE_ID");
  });
});

Deno.test("erp.sales_invoice_get — dolibarr nativeId='1.5' → INVALID_NATIVE_ID", async () => {
  await adapter.callTool(
    "erp.sales_invoice_get",
    { erpType: "dolibarr", nativeId: "1.5" },
    CTX,
  ).then(() => {
    throw new Error("Expected NormalizedError but resolved");
  }).catch((err: unknown) => {
    assertInstanceOf(err, NormalizedError);
    assertEquals((err as NormalizedError).code, "INVALID_NATIVE_ID");
  });
});

// ─── INVALID_PARTY_KIND (partyKind invalide) ───────────────────────────────────

Deno.test("erp.business_party_get — invalid partyKind → NormalizedError INVALID_PARTY_KIND", async () => {
  await adapter.callTool(
    "erp.business_party_get",
    { erpType: "erpnext", nativeId: "CUST-001", partyKind: "partner" },
    CTX,
  ).then(() => {
    throw new Error("Expected NormalizedError but resolved");
  }).catch((err: unknown) => {
    assertInstanceOf(err, NormalizedError);
    assertEquals((err as NormalizedError).code, "INVALID_PARTY_KIND");
  });
});

// ─── dispose ─────────────────────────────────────────────────────────────────

Deno.test("NormalizedAdapter.dispose — no-op, does not throw", () => {
  const a = new NormalizedAdapter({
    erpnext: mockErpnextAdapter,
    dolibarr: mockDolibarrAdapter,
  });
  a.dispose();
});

// ─── tools() returns fresh array each call ────────────────────────────────────

Deno.test("NormalizedAdapter.tools — fresh array on each call", () => {
  const first = adapter.tools();
  first.push({
    name: "erp.mutated",
    description: "probe",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  });
  const second = adapter.tools();
  assertEquals(
    second.every((t) => t.name !== "erp.mutated"),
    true,
  );
});

// ─── Task 9: erp.customer_create ─────────────────────────────────────────────

Deno.test("erp.customer_create — erpnext maps fields and commits", async () => {
  const captured: CapturedFetch[] = [];
  const restore = mockFetch(
    { status: 200, body: { data: { name: "CUST-9" } } },
    captured,
  );
  try {
    const a = new NormalizedAdapter({ erpnext: createErpnextTestAdapter() });
    const r = await a.callTool(
      "erp.customer_create",
      {
        erpType: "erpnext",
        mode: "commit",
        name: "Acme",
        kind: "individual",
        taxId: "FR123",
      },
      { tenantId: "t", actorSubject: null },
    );
    const body = JSON.parse(captured[0].body as string);
    assertEquals(body.customer_name, "Acme");
    assertEquals(body.customer_type, "Individual");
    assertEquals(body.tax_id, "FR123");
    const c = r.content as {
      committed: boolean;
      erpType: string;
      nativeId: string;
    };
    assertEquals(c.committed, true);
    assertEquals(c.erpType, "erpnext");
    assertEquals(c.nativeId, "CUST-9");
  } finally {
    restore();
  }
});

Deno.test("erp.customer_create — externalRef unsupported on erpnext throws UNSUPPORTED_FIELD", async () => {
  const restore = mockFetch({ status: 200, body: {} }, []);
  try {
    const a = new NormalizedAdapter({ erpnext: createErpnextTestAdapter() });
    const err = await assertRejects(
      () =>
        a.callTool(
          "erp.customer_create",
          {
            erpType: "erpnext",
            mode: "preview",
            name: "Acme",
            externalRef: "X",
          },
          { tenantId: "t", actorSubject: null },
        ),
      WriteError,
    );
    assertEquals(err.code, "UNSUPPORTED_FIELD");
  } finally {
    restore();
  }
});

Deno.test("erp.customer_create — dolibarr maps externalRef to code_client", async () => {
  const captured: CapturedFetch[] = [];
  const restore = mockFetch({ status: 200, body: 42 }, captured);
  try {
    const a = new NormalizedAdapter({ dolibarr: createDolibarrTestAdapter() });
    const r = await a.callTool(
      "erp.customer_create",
      {
        erpType: "dolibarr",
        mode: "commit",
        name: "Acme",
        externalRef: "EXT-1",
        taxId: "FR456",
        email: "a@b.com",
      },
      { tenantId: "t", actorSubject: null },
    );
    const body = JSON.parse(captured[0].body as string);
    assertEquals(body.name, "Acme");
    assertEquals(body.code_client, "EXT-1");
    assertEquals(body.tva_intra, "FR456");
    assertEquals(body.email, "a@b.com");
    assertEquals(body.client, 1);
    const c = r.content as {
      committed: boolean;
      erpType: string;
      nativeId: string;
    };
    assertEquals(c.committed, true);
    assertEquals(c.erpType, "dolibarr");
    assertEquals(c.nativeId, "42");
  } finally {
    restore();
  }
});

// ─── Task 10: erp.product_create ─────────────────────────────────────────────

Deno.test("erp.product_create — erpnext maps service to is_stock_item 0", async () => {
  const captured: CapturedFetch[] = [];
  const restore = mockFetch(
    { status: 200, body: { data: { name: "ITEM-7" } } },
    captured,
  );
  try {
    const a = new NormalizedAdapter({
      erpnext: createErpnextTestAdapter("All Item Groups", "Nos"),
    });
    const r = await a.callTool(
      "erp.product_create",
      {
        erpType: "erpnext",
        mode: "commit",
        name: "Consulting",
        sku: "SVC-1",
        kind: "service",
        unitPrice: 100,
      },
      { tenantId: "t", actorSubject: null },
    );
    const body = JSON.parse(captured[0].body as string);
    assertEquals(body.item_code, "SVC-1");
    assertEquals(body.is_stock_item, 0);
    assertEquals(body.standard_rate, 100);
    const c = r.content as { nativeId: string; erpType: string };
    assertEquals(c.nativeId, "ITEM-7");
    assertEquals(c.erpType, "erpnext");
  } finally {
    restore();
  }
});

Deno.test("erp.product_create — dolibarr maps product to type 0", async () => {
  const captured: CapturedFetch[] = [];
  const restore = mockFetch({ status: 200, body: 8 }, captured);
  try {
    const a = new NormalizedAdapter({ dolibarr: createDolibarrTestAdapter() });
    await a.callTool(
      "erp.product_create",
      {
        erpType: "dolibarr",
        mode: "commit",
        name: "Widget",
        sku: "W-1",
        kind: "product",
        unitPrice: 9,
      },
      { tenantId: "t", actorSubject: null },
    );
    const body = JSON.parse(captured[0].body as string);
    assertEquals(body.label, "Widget");
    assertEquals(body.ref, "W-1");
    assertEquals(body.type, 0);
    assertEquals(body.price, 9);
  } finally {
    restore();
  }
});

// ─── Task 11: erp.capabilities_describe ──────────────────────────────────────

Deno.test("erp.capabilities_describe — reports erpnext write capabilities", async () => {
  const a = new NormalizedAdapter({ erpnext: createErpnextTestAdapter() });
  const r = await a.callTool(
    "erp.capabilities_describe",
    { erpType: "erpnext" },
    { tenantId: "t", actorSubject: null },
  );
  const c = r.content as {
    erpType: string;
    supportedTools: string[];
    unsupportedFields: string[];
  };
  assertEquals(c.erpType, "erpnext");
  assertEquals(c.supportedTools.includes("erp.customer_create"), true);
  assertEquals(c.unsupportedFields.includes("externalRef"), true);
});

Deno.test("erp.capabilities_describe — reports dolibarr write capabilities", async () => {
  const a = new NormalizedAdapter({ dolibarr: createDolibarrTestAdapter() });
  const r = await a.callTool(
    "erp.capabilities_describe",
    { erpType: "dolibarr" },
    { tenantId: "t", actorSubject: null },
  );
  const c = r.content as {
    erpType: string;
    supportedTools: string[];
    unsupportedFields: string[];
    capabilityVersion: string;
  };
  assertEquals(c.erpType, "dolibarr");
  assertEquals(c.supportedTools.includes("erp.product_create"), true);
  assertEquals(c.unsupportedFields.includes("uom"), true);
  assertEquals(c.capabilityVersion, "2026-06-30");
});

// ── Fix 1: strict runtime validation in normalized-adapter ────────────────────

Deno.test("erp.customer_create — invalid kind throws WriteError INVALID_FIELD", async () => {
  const a = new NormalizedAdapter({ erpnext: mockErpnextAdapter });
  const err = await assertRejects(
    () =>
      a.callTool(
        "erp.customer_create",
        { erpType: "erpnext", mode: "preview", name: "Acme", kind: "INVALID" },
        CTX,
      ),
    WriteError,
  );
  assertEquals(err.code, "INVALID_FIELD");
  assertEquals((err.context as { field: string }).field, "kind");
});

Deno.test("erp.customer_create — taxId as number throws WriteError INVALID_FIELD", async () => {
  const a = new NormalizedAdapter({ erpnext: mockErpnextAdapter });
  const err = await assertRejects(
    () =>
      a.callTool(
        "erp.customer_create",
        { erpType: "erpnext", mode: "preview", name: "Acme", taxId: 123 },
        CTX,
      ),
    WriteError,
  );
  assertEquals(err.code, "INVALID_FIELD");
  assertEquals((err.context as { field: string }).field, "taxId");
});

Deno.test("erp.customer_create — empty name throws WriteError MISSING_REQUIRED_FIELD", async () => {
  const a = new NormalizedAdapter({ erpnext: mockErpnextAdapter });
  const err = await assertRejects(
    () =>
      a.callTool(
        "erp.customer_create",
        { erpType: "erpnext", mode: "preview", name: "" },
        CTX,
      ),
    WriteError,
  );
  assertEquals(err.code, "MISSING_REQUIRED_FIELD");
  assertEquals((err.context as { field: string }).field, "name");
});

Deno.test("erp.product_create — negative unitPrice throws WriteError INVALID_FIELD", async () => {
  const a = new NormalizedAdapter({ erpnext: mockErpnextAdapter });
  const err = await assertRejects(
    () =>
      a.callTool(
        "erp.product_create",
        {
          erpType: "erpnext",
          mode: "preview",
          name: "Widget",
          sku: "W-1",
          unitPrice: -1,
        },
        CTX,
      ),
    WriteError,
  );
  assertEquals(err.code, "INVALID_FIELD");
  assertEquals((err.context as { field: string }).field, "unitPrice");
});

Deno.test("erp.product_create — string unitPrice throws WriteError INVALID_FIELD", async () => {
  const a = new NormalizedAdapter({ erpnext: mockErpnextAdapter });
  const err = await assertRejects(
    () =>
      a.callTool(
        "erp.product_create",
        {
          erpType: "erpnext",
          mode: "preview",
          name: "Widget",
          sku: "W-1",
          unitPrice: "9",
        },
        CTX,
      ),
    WriteError,
  );
  assertEquals(err.code, "INVALID_FIELD");
  assertEquals((err.context as { field: string }).field, "unitPrice");
});

Deno.test("erp.product_create — empty sku throws WriteError MISSING_REQUIRED_FIELD", async () => {
  const a = new NormalizedAdapter({ erpnext: mockErpnextAdapter });
  const err = await assertRejects(
    () =>
      a.callTool(
        "erp.product_create",
        { erpType: "erpnext", mode: "preview", name: "Widget", sku: "" },
        CTX,
      ),
    WriteError,
  );
  assertEquals(err.code, "MISSING_REQUIRED_FIELD");
  assertEquals((err.context as { field: string }).field, "sku");
});

// ── Fix 5: capabilities_describe with unconfigured adapter ────────────────────

Deno.test("erp.capabilities_describe — erpnext not configured throws ADAPTER_NOT_CONFIGURED", async () => {
  const a = new NormalizedAdapter({ dolibarr: mockDolibarrAdapter }); // no erpnext
  const err = await assertRejects(
    () =>
      a.callTool(
        "erp.capabilities_describe",
        { erpType: "erpnext" },
        CTX,
      ),
    NormalizedError,
  );
  assertEquals(err.code, "ADAPTER_NOT_CONFIGURED");
});

Deno.test("erp.capabilities_describe — dolibarr not configured throws ADAPTER_NOT_CONFIGURED", async () => {
  const a = new NormalizedAdapter({ erpnext: mockErpnextAdapter }); // no dolibarr
  const err = await assertRejects(
    () =>
      a.callTool(
        "erp.capabilities_describe",
        { erpType: "dolibarr" },
        CTX,
      ),
    NormalizedError,
  );
  assertEquals(err.code, "ADAPTER_NOT_CONFIGURED");
});

// ─── Task D: erp.customer_update ─────────────────────────────────────────────

Deno.test("erp.customer_update — erpnext maps fields and commits", async () => {
  const captured: CapturedFetch[] = [];
  const restore = mockFetch(
    { status: 200, body: { data: { name: "CUST-001" } } },
    captured,
  );
  try {
    const a = new NormalizedAdapter({ erpnext: createErpnextTestAdapter() });
    const r = await a.callTool(
      "erp.customer_update",
      {
        erpType: "erpnext",
        mode: "commit",
        nativeId: "CUST-001",
        name: "Acme Updated",
        taxId: "FR999",
        currency: "USD",
      },
      { tenantId: "t", actorSubject: null },
    );
    assertEquals(captured.length, 1); // 1 PUT, no Contact (no email/phone)
    assertEquals(captured[0].method, "PUT");
    assertEquals(
      captured[0].url.pathname,
      "/api/resource/Customer/CUST-001",
    );
    const body = JSON.parse(captured[0].body as string);
    assertEquals(body.customer_name, "Acme Updated");
    assertEquals(body.tax_id, "FR999");
    assertEquals(body.default_currency, "USD");
    const c = r.content as {
      committed: boolean;
      erpType: string;
      nativeId: string;
    };
    assertEquals(c.committed, true);
    assertEquals(c.erpType, "erpnext");
    assertEquals(c.nativeId, "CUST-001");
  } finally {
    restore();
  }
});

Deno.test("erp.customer_update — erpnext preview does not write", async () => {
  const captured: CapturedFetch[] = [];
  const restore = mockFetch({ status: 200, body: {} }, captured);
  try {
    const a = new NormalizedAdapter({ erpnext: createErpnextTestAdapter() });
    const r = await a.callTool(
      "erp.customer_update",
      {
        erpType: "erpnext",
        mode: "preview",
        nativeId: "CUST-001",
        name: "Acme",
      },
      { tenantId: "t", actorSubject: null },
    );
    assertEquals(captured.length, 0);
    const c = r.content as { committed: boolean; erpType: string };
    assertEquals(c.committed, false);
    assertEquals(c.erpType, "erpnext");
  } finally {
    restore();
  }
});

Deno.test("erp.customer_update — externalRef on erpnext throws UNSUPPORTED_FIELD", async () => {
  const restore = mockFetch({ status: 200, body: {} }, []);
  try {
    const a = new NormalizedAdapter({ erpnext: createErpnextTestAdapter() });
    const err = await assertRejects(
      () =>
        a.callTool(
          "erp.customer_update",
          {
            erpType: "erpnext",
            mode: "preview",
            nativeId: "CUST-001",
            externalRef: "X",
          },
          { tenantId: "t", actorSubject: null },
        ),
      WriteError,
    );
    assertEquals(err.code, "UNSUPPORTED_FIELD");
  } finally {
    restore();
  }
});

Deno.test("erp.customer_update — dolibarr maps fields and commits", async () => {
  const captured: CapturedFetch[] = [];
  const restore = mockFetch({ status: 200, body: { id: 42 } }, captured);
  try {
    const a = new NormalizedAdapter({ dolibarr: createDolibarrTestAdapter() });
    const r = await a.callTool(
      "erp.customer_update",
      {
        erpType: "dolibarr",
        mode: "commit",
        nativeId: "42",
        name: "Client Updated",
        taxId: "FR456",
        externalRef: "EXT-42",
        email: "client@example.com",
        currency: "EUR",
      },
      { tenantId: "t", actorSubject: null },
    );
    assertEquals(captured[0].method, "PUT");
    assertEquals(captured[0].url.pathname, "/api/index.php/thirdparties/42");
    const body = JSON.parse(captured[0].body as string);
    assertEquals(body.name, "Client Updated");
    assertEquals(body.tva_intra, "FR456");
    assertEquals(body.code_client, "EXT-42");
    assertEquals(body.email, "client@example.com");
    assertEquals(body.multicurrency_code, "EUR");
    const c = r.content as {
      committed: boolean;
      erpType: string;
      nativeId: string;
    };
    assertEquals(c.committed, true);
    assertEquals(c.erpType, "dolibarr");
    assertEquals(c.nativeId, "42");
  } finally {
    restore();
  }
});

Deno.test("erp.customer_update — missing nativeId throws MISSING_REQUIRED_FIELD", async () => {
  const a = new NormalizedAdapter({ erpnext: mockErpnextAdapter });
  const err = await assertRejects(
    () =>
      a.callTool(
        "erp.customer_update",
        { erpType: "erpnext", mode: "preview" },
        CTX,
      ),
    WriteError,
  );
  assertEquals(err.code, "MISSING_REQUIRED_FIELD");
  assertEquals((err.context as { field: string }).field, "nativeId");
});

// ─── Task D: erp.product_update ──────────────────────────────────────────────

Deno.test("erp.product_update — erpnext maps fields and commits", async () => {
  const captured: CapturedFetch[] = [];
  const restore = mockFetch(
    { status: 200, body: { data: { name: "ITEM-001" } } },
    captured,
  );
  try {
    const a = new NormalizedAdapter({ erpnext: createErpnextTestAdapter() });
    const r = await a.callTool(
      "erp.product_update",
      {
        erpType: "erpnext",
        mode: "commit",
        nativeId: "ITEM-001",
        name: "Widget Pro v2",
        unitPrice: 49.99,
        uom: "Nos",
      },
      { tenantId: "t", actorSubject: null },
    );
    assertEquals(captured[0].method, "PUT");
    assertEquals(captured[0].url.pathname, "/api/resource/Item/ITEM-001");
    const body = JSON.parse(captured[0].body as string);
    assertEquals(body.item_name, "Widget Pro v2");
    assertEquals(body.standard_rate, 49.99);
    assertEquals(body.stock_uom, "Nos");
    const c = r.content as {
      committed: boolean;
      erpType: string;
      nativeId: string;
    };
    assertEquals(c.committed, true);
    assertEquals(c.erpType, "erpnext");
    assertEquals(c.nativeId, "ITEM-001");
  } finally {
    restore();
  }
});

Deno.test("erp.product_update — dolibarr maps fields and commits", async () => {
  const captured: CapturedFetch[] = [];
  const restore = mockFetch({ status: 200, body: { id: 3 } }, captured);
  try {
    const a = new NormalizedAdapter({ dolibarr: createDolibarrTestAdapter() });
    const r = await a.callTool(
      "erp.product_update",
      {
        erpType: "dolibarr",
        mode: "commit",
        nativeId: "3",
        name: "Widget Pro v2",
        unitPrice: 19.5,
      },
      { tenantId: "t", actorSubject: null },
    );
    assertEquals(captured[0].method, "PUT");
    assertEquals(captured[0].url.pathname, "/api/index.php/products/3");
    const body = JSON.parse(captured[0].body as string);
    assertEquals(body.label, "Widget Pro v2");
    assertEquals(body.price, 19.5);
    assertEquals(body.price_base_type, "HT");
    const c = r.content as {
      committed: boolean;
      erpType: string;
      nativeId: string;
    };
    assertEquals(c.committed, true);
    assertEquals(c.erpType, "dolibarr");
    assertEquals(c.nativeId, "3");
  } finally {
    restore();
  }
});

Deno.test("erp.product_update — missing nativeId throws MISSING_REQUIRED_FIELD", async () => {
  const a = new NormalizedAdapter({ erpnext: mockErpnextAdapter });
  const err = await assertRejects(
    () =>
      a.callTool(
        "erp.product_update",
        { erpType: "erpnext", mode: "preview" },
        CTX,
      ),
    WriteError,
  );
  assertEquals(err.code, "MISSING_REQUIRED_FIELD");
  assertEquals((err.context as { field: string }).field, "nativeId");
});

Deno.test("erp.product_update — erpnext preview does not write", async () => {
  const captured: CapturedFetch[] = [];
  const restore = mockFetch({ status: 200, body: {} }, captured);
  try {
    const a = new NormalizedAdapter({ erpnext: createErpnextTestAdapter() });
    const r = await a.callTool(
      "erp.product_update",
      {
        erpType: "erpnext",
        mode: "preview",
        nativeId: "ITEM-001",
        unitPrice: 10,
      },
      { tenantId: "t", actorSubject: null },
    );
    assertEquals(captured.length, 0);
    const c = r.content as { committed: boolean };
    assertEquals(c.committed, false);
  } finally {
    restore();
  }
});

// ─── Task D: erp.supplier_create ─────────────────────────────────────────────

Deno.test("erp.supplier_create — erpnext maps fields and commits", async () => {
  const captured: CapturedFetch[] = [];
  const restore = mockFetch(
    { status: 200, body: { data: { name: "SUPP-001" } } },
    captured,
  );
  try {
    const a = new NormalizedAdapter({ erpnext: createErpnextTestAdapter() });
    const r = await a.callTool(
      "erp.supplier_create",
      {
        erpType: "erpnext",
        mode: "commit",
        name: "Parts Co",
        taxId: "FR111",
      },
      { tenantId: "t", actorSubject: null },
    );
    assertEquals(captured[0].method, "POST");
    assertEquals(captured[0].url.pathname, "/api/resource/Supplier");
    const body = JSON.parse(captured[0].body as string);
    assertEquals(body.supplier_name, "Parts Co");
    assertEquals(body.tax_id, "FR111");
    const c = r.content as {
      committed: boolean;
      erpType: string;
      nativeId: string;
    };
    assertEquals(c.committed, true);
    assertEquals(c.erpType, "erpnext");
    assertEquals(c.nativeId, "SUPP-001");
  } finally {
    restore();
  }
});

Deno.test("erp.supplier_create — externalRef on erpnext throws UNSUPPORTED_FIELD", async () => {
  const restore = mockFetch({ status: 200, body: {} }, []);
  try {
    const a = new NormalizedAdapter({ erpnext: createErpnextTestAdapter() });
    const err = await assertRejects(
      () =>
        a.callTool(
          "erp.supplier_create",
          {
            erpType: "erpnext",
            mode: "preview",
            name: "Parts Co",
            externalRef: "X",
          },
          { tenantId: "t", actorSubject: null },
        ),
      WriteError,
    );
    assertEquals(err.code, "UNSUPPORTED_FIELD");
  } finally {
    restore();
  }
});

Deno.test("erp.supplier_create — dolibarr maps fournisseur:1 and commits", async () => {
  const captured: CapturedFetch[] = [];
  const restore = mockFetch({ status: 200, body: 55 }, captured);
  try {
    const a = new NormalizedAdapter({ dolibarr: createDolibarrTestAdapter() });
    const r = await a.callTool(
      "erp.supplier_create",
      {
        erpType: "dolibarr",
        mode: "commit",
        name: "Fournisseur SA",
        taxId: "FR222",
        externalRef: "EXT-SUPP",
        email: "supp@example.com",
        phone: "+33700000000",
        currency: "EUR",
      },
      { tenantId: "t", actorSubject: null },
    );
    assertEquals(captured[0].method, "POST");
    assertEquals(captured[0].url.pathname, "/api/index.php/thirdparties");
    const body = JSON.parse(captured[0].body as string);
    assertEquals(body.name, "Fournisseur SA");
    assertEquals(body.fournisseur, 1);
    assertEquals(body.tva_intra, "FR222");
    assertEquals(body.code_fournisseur, "EXT-SUPP");
    assertEquals("code_client" in body, false);
    assertEquals(body.email, "supp@example.com");
    assertEquals(body.multicurrency_code, "EUR");
    const c = r.content as {
      committed: boolean;
      erpType: string;
      nativeId: string;
    };
    assertEquals(c.committed, true);
    assertEquals(c.erpType, "dolibarr");
    assertEquals(c.nativeId, "55");
  } finally {
    restore();
  }
});

Deno.test("erp.supplier_create — missing name throws MISSING_REQUIRED_FIELD", async () => {
  const a = new NormalizedAdapter({ erpnext: mockErpnextAdapter });
  const err = await assertRejects(
    () =>
      a.callTool(
        "erp.supplier_create",
        { erpType: "erpnext", mode: "preview" },
        CTX,
      ),
    WriteError,
  );
  assertEquals(err.code, "MISSING_REQUIRED_FIELD");
  assertEquals((err.context as { field: string }).field, "name");
});

Deno.test("erp.supplier_create — dolibarr preview does not write", async () => {
  const captured: CapturedFetch[] = [];
  const restore = mockFetch({ status: 200, body: 0 }, captured);
  try {
    const a = new NormalizedAdapter({ dolibarr: createDolibarrTestAdapter() });
    const r = await a.callTool(
      "erp.supplier_create",
      { erpType: "dolibarr", mode: "preview", name: "Fournisseur SA" },
      { tenantId: "t", actorSubject: null },
    );
    assertEquals(captured.length, 0);
    const c = r.content as { committed: boolean };
    assertEquals(c.committed, false);
  } finally {
    restore();
  }
});

// ─── Task D: erp.supplier_update ─────────────────────────────────────────────

Deno.test("erp.supplier_update — erpnext maps fields and commits", async () => {
  const captured: CapturedFetch[] = [];
  const restore = mockFetch(
    { status: 200, body: { data: { name: "SUPP-001" } } },
    captured,
  );
  try {
    const a = new NormalizedAdapter({ erpnext: createErpnextTestAdapter() });
    const r = await a.callTool(
      "erp.supplier_update",
      {
        erpType: "erpnext",
        mode: "commit",
        nativeId: "SUPP-001",
        name: "Parts Co Updated",
        taxId: "FR333",
      },
      { tenantId: "t", actorSubject: null },
    );
    assertEquals(captured[0].method, "PUT");
    assertEquals(captured[0].url.pathname, "/api/resource/Supplier/SUPP-001");
    const body = JSON.parse(captured[0].body as string);
    assertEquals(body.supplier_name, "Parts Co Updated");
    assertEquals(body.tax_id, "FR333");
    const c = r.content as {
      committed: boolean;
      erpType: string;
      nativeId: string;
    };
    assertEquals(c.committed, true);
    assertEquals(c.erpType, "erpnext");
    assertEquals(c.nativeId, "SUPP-001");
  } finally {
    restore();
  }
});

Deno.test("erp.supplier_update — externalRef on erpnext throws UNSUPPORTED_FIELD", async () => {
  const restore = mockFetch({ status: 200, body: {} }, []);
  try {
    const a = new NormalizedAdapter({ erpnext: createErpnextTestAdapter() });
    const err = await assertRejects(
      () =>
        a.callTool(
          "erp.supplier_update",
          {
            erpType: "erpnext",
            mode: "preview",
            nativeId: "SUPP-001",
            externalRef: "X",
          },
          { tenantId: "t", actorSubject: null },
        ),
      WriteError,
    );
    assertEquals(err.code, "UNSUPPORTED_FIELD");
  } finally {
    restore();
  }
});

Deno.test("erp.supplier_update — dolibarr maps fields and commits", async () => {
  const captured: CapturedFetch[] = [];
  const restore = mockFetch({ status: 200, body: { id: 42 } }, captured);
  try {
    const a = new NormalizedAdapter({ dolibarr: createDolibarrTestAdapter() });
    const r = await a.callTool(
      "erp.supplier_update",
      {
        erpType: "dolibarr",
        mode: "commit",
        nativeId: "42",
        name: "Fournisseur Updated",
        taxId: "FR444",
        externalRef: "EXT-F42",
        currency: "GBP",
      },
      { tenantId: "t", actorSubject: null },
    );
    assertEquals(captured[0].method, "PUT");
    assertEquals(captured[0].url.pathname, "/api/index.php/thirdparties/42");
    const body = JSON.parse(captured[0].body as string);
    assertEquals(body.name, "Fournisseur Updated");
    assertEquals(body.tva_intra, "FR444");
    assertEquals(body.code_fournisseur, "EXT-F42");
    assertEquals("code_client" in body, false);
    assertEquals(body.multicurrency_code, "GBP");
    const c = r.content as {
      committed: boolean;
      erpType: string;
      nativeId: string;
    };
    assertEquals(c.committed, true);
    assertEquals(c.erpType, "dolibarr");
    assertEquals(c.nativeId, "42");
  } finally {
    restore();
  }
});

Deno.test("erp.supplier_update — missing nativeId throws MISSING_REQUIRED_FIELD", async () => {
  const a = new NormalizedAdapter({ erpnext: mockErpnextAdapter });
  const err = await assertRejects(
    () =>
      a.callTool(
        "erp.supplier_update",
        { erpType: "erpnext", mode: "preview" },
        CTX,
      ),
    WriteError,
  );
  assertEquals(err.code, "MISSING_REQUIRED_FIELD");
  assertEquals((err.context as { field: string }).field, "nativeId");
});

Deno.test("erp.supplier_update — erpnext preview does not write", async () => {
  const captured: CapturedFetch[] = [];
  const restore = mockFetch({ status: 200, body: {} }, captured);
  try {
    const a = new NormalizedAdapter({ erpnext: createErpnextTestAdapter() });
    const r = await a.callTool(
      "erp.supplier_update",
      { erpType: "erpnext", mode: "preview", nativeId: "SUPP-001", name: "X" },
      { tenantId: "t", actorSubject: null },
    );
    assertEquals(captured.length, 0);
    const c = r.content as { committed: boolean };
    assertEquals(c.committed, false);
  } finally {
    restore();
  }
});

// ─── Fix 3: uom gating on Dolibarr ────────────────────────────────────────────

Deno.test("erp.product_create — uom on dolibarr throws UNSUPPORTED_FIELD", async () => {
  const restore = mockFetch({ status: 200, body: 0 }, []);
  try {
    const a = new NormalizedAdapter({ dolibarr: createDolibarrTestAdapter() });
    const err = await assertRejects(
      () =>
        a.callTool(
          "erp.product_create",
          {
            erpType: "dolibarr",
            mode: "preview",
            name: "Widget",
            sku: "W-1",
            uom: "pcs",
          },
          { tenantId: "t", actorSubject: null },
        ),
      WriteError,
    );
    assertEquals(err.code, "UNSUPPORTED_FIELD");
    assertEquals((err.context as { field: string }).field, "uom");
  } finally {
    restore();
  }
});

Deno.test("erp.product_update — uom on dolibarr throws UNSUPPORTED_FIELD", async () => {
  const restore = mockFetch({ status: 200, body: {} }, []);
  try {
    const a = new NormalizedAdapter({ dolibarr: createDolibarrTestAdapter() });
    const err = await assertRejects(
      () =>
        a.callTool(
          "erp.product_update",
          {
            erpType: "dolibarr",
            mode: "preview",
            nativeId: "3",
            uom: "pcs",
          },
          { tenantId: "t", actorSubject: null },
        ),
      WriteError,
    );
    assertEquals(err.code, "UNSUPPORTED_FIELD");
    assertEquals((err.context as { field: string }).field, "uom");
  } finally {
    restore();
  }
});

// ─── Fix 3: supplier ERPNext currency + dolibarr code_fournisseur ──────────────

Deno.test("erp.supplier_create — erpnext maps currency to default_currency", async () => {
  const captured: CapturedFetch[] = [];
  const restore = mockFetch(
    { status: 200, body: { data: { name: "SUPP-001" } } },
    captured,
  );
  try {
    const a = new NormalizedAdapter({ erpnext: createErpnextTestAdapter() });
    await a.callTool(
      "erp.supplier_create",
      {
        erpType: "erpnext",
        mode: "commit",
        name: "Parts Co",
        currency: "EUR",
      },
      { tenantId: "t", actorSubject: null },
    );
    const body = JSON.parse(captured[0].body as string);
    assertEquals(body.default_currency, "EUR");
  } finally {
    restore();
  }
});

Deno.test("erp.supplier_update — erpnext maps currency to default_currency", async () => {
  const captured: CapturedFetch[] = [];
  const restore = mockFetch(
    { status: 200, body: { data: { name: "SUPP-001" } } },
    captured,
  );
  try {
    const a = new NormalizedAdapter({ erpnext: createErpnextTestAdapter() });
    await a.callTool(
      "erp.supplier_update",
      {
        erpType: "erpnext",
        mode: "commit",
        nativeId: "SUPP-001",
        currency: "USD",
      },
      { tenantId: "t", actorSubject: null },
    );
    const body = JSON.parse(captured[0].body as string);
    assertEquals(body.default_currency, "USD");
  } finally {
    restore();
  }
});

Deno.test("erp.supplier_create — dolibarr externalRef maps to code_fournisseur", async () => {
  const captured: CapturedFetch[] = [];
  const restore = mockFetch({ status: 200, body: 99 }, captured);
  try {
    const a = new NormalizedAdapter({ dolibarr: createDolibarrTestAdapter() });
    await a.callTool(
      "erp.supplier_create",
      {
        erpType: "dolibarr",
        mode: "commit",
        name: "Fournisseur SA",
        externalRef: "EXT-SUPP",
      },
      { tenantId: "t", actorSubject: null },
    );
    const body = JSON.parse(captured[0].body as string);
    assertEquals(body.code_fournisseur, "EXT-SUPP");
    assertEquals("code_client" in body, false);
  } finally {
    restore();
  }
});

Deno.test("erp.supplier_update — dolibarr externalRef maps to code_fournisseur", async () => {
  const captured: CapturedFetch[] = [];
  const restore = mockFetch({ status: 200, body: { id: 42 } }, captured);
  try {
    const a = new NormalizedAdapter({ dolibarr: createDolibarrTestAdapter() });
    await a.callTool(
      "erp.supplier_update",
      {
        erpType: "dolibarr",
        mode: "commit",
        nativeId: "42",
        externalRef: "EXT-F99",
      },
      { tenantId: "t", actorSubject: null },
    );
    const body = JSON.parse(captured[0].body as string);
    assertEquals(body.code_fournisseur, "EXT-F99");
    assertEquals("code_client" in body, false);
  } finally {
    restore();
  }
});
