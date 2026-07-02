/**
 * TDD Red bar — NormalizedAdapter (Wave 3).
 */

import {
  assert,
  assertEquals,
  assertInstanceOf,
  assertRejects,
} from "@std/assert";
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

/**
 * Multi-response mock — returns responses in sequence (last entry repeated
 * if the queue is exhausted).
 */
function mockFetchQueue(
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
    const resp = responses[index] ?? responses[responses.length - 1];
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

Deno.test("NormalizedAdapter.tools — exposes exactly 20 erp.* tools", () => {
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
    "erp.quotation_create",
    "erp.quotation_get",
    "erp.quotation_submit",
    "erp.sales_invoice_create",
    "erp.sales_invoice_get",
    "erp.sales_invoice_submit",
    "erp.sales_order_create",
    "erp.sales_order_get",
    "erp.sales_order_submit",
    "erp.supplier_create",
    "erp.supplier_update",
  ]);
});

Deno.test("NormalizedAdapter.tools — read tools are readOnly", () => {
  const readTools = adapter.tools().filter((t) =>
    !t.name.endsWith("_create") &&
    !t.name.endsWith("_update") &&
    !t.name.endsWith("_submit") &&
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

// ─── Task D: erp.sales_order_create ──────────────────────────────────────────

Deno.test("erp.sales_order_create — erpnext preview: no HTTP, committed:false", async () => {
  const captured: CapturedFetch[] = [];
  const restore = mockFetch({ status: 200, body: {} }, captured);
  try {
    const a = new NormalizedAdapter({
      erpnext: createErpnextTestAdapter("All Items", "Nos"),
    });
    const r = await a.callTool(
      "erp.sales_order_create",
      {
        erpType: "erpnext",
        mode: "preview",
        customerId: "CUST-001",
        lines: [{ sku: "ITEM-1", qty: 2, unitPrice: 100 }],
        date: "2026-07-10",
        deliveryDate: "2026-07-20",
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

Deno.test("erp.sales_order_create — erpnext MISSING_REQUIRED_FIELD deliveryDate", async () => {
  const restore = mockFetch({ status: 200, body: {} }, []);
  try {
    const a = new NormalizedAdapter({
      erpnext: createErpnextTestAdapter("All Items", "Nos"),
    });
    const err = await assertRejects(
      () =>
        a.callTool(
          "erp.sales_order_create",
          {
            erpType: "erpnext",
            mode: "commit",
            customerId: "CUST-001",
            lines: [{ sku: "ITEM-1", qty: 1, unitPrice: 50 }],
          },
          { tenantId: "t", actorSubject: null },
        ),
      WriteError,
    );
    assertEquals(err.code, "MISSING_REQUIRED_FIELD");
    assertEquals((err.context as { field: string }).field, "deliveryDate");
    assertEquals((err.context as { erpType: string }).erpType, "erpnext");
  } finally {
    restore();
  }
});

Deno.test("erp.sales_order_create — EMPTY_LINES throws WriteError", async () => {
  const a = new NormalizedAdapter({ erpnext: mockErpnextAdapter });
  const err = await assertRejects(
    () =>
      a.callTool(
        "erp.sales_order_create",
        {
          erpType: "erpnext",
          mode: "preview",
          customerId: "CUST-001",
          lines: [],
          deliveryDate: "2026-07-20",
        },
        CTX,
      ),
    WriteError,
  );
  assertEquals(err.code, "EMPTY_LINES");
});

Deno.test("erp.sales_order_create — INVALID_LINE qty=0 throws WriteError", async () => {
  const a = new NormalizedAdapter({ erpnext: mockErpnextAdapter });
  const err = await assertRejects(
    () =>
      a.callTool(
        "erp.sales_order_create",
        {
          erpType: "erpnext",
          mode: "preview",
          customerId: "CUST-001",
          lines: [{ sku: "X", qty: 0, unitPrice: 10 }],
          deliveryDate: "2026-07-20",
        },
        CTX,
      ),
    WriteError,
  );
  assertEquals(err.code, "INVALID_LINE");
  assertEquals((err.context as { field: string }).field, "qty");
});

Deno.test("erp.sales_order_create — dolibarr commit: resolve sku, POST order, POST line", async () => {
  const captured: CapturedFetch[] = [];
  // 1. GET /products?sqlfilters=... → [{id:7, tva_tx:"20.000"}]
  // 2. POST /orders → 42
  // 3. POST /orders/42/lines → 1
  const restore = mockFetchQueue(
    [
      { status: 200, body: [{ id: 7, tva_tx: "20.000", ref: "SKU-A" }] },
      { status: 200, body: 42 },
      { status: 200, body: 1 },
    ],
    captured,
  );
  try {
    const a = new NormalizedAdapter({ dolibarr: createDolibarrTestAdapter() });
    const r = await a.callTool(
      "erp.sales_order_create",
      {
        erpType: "dolibarr",
        mode: "commit",
        customerId: "7",
        lines: [{ sku: "SKU-A", qty: 3, unitPrice: 25, description: "Bolt" }],
        date: "2026-07-10",
        deliveryDate: "2026-07-25",
      },
      { tenantId: "t", actorSubject: null },
    );
    // Verify 3-call sequence
    assertEquals(captured.length, 3);
    assertEquals(captured[0].method, "GET");
    assertEquals(
      captured[0].url.searchParams.get("sqlfilters"),
      "(t.ref:=:'SKU-A')",
    );
    assertEquals(captured[1].method, "POST");
    assertEquals(captured[1].url.pathname, "/api/index.php/orders");
    const orderBody = JSON.parse(captured[1].body as string);
    assertEquals(orderBody.socid, 7);
    assertEquals(captured[2].method, "POST");
    assertEquals(captured[2].url.pathname, "/api/index.php/orders/42/lines");
    const lineBody = JSON.parse(captured[2].body as string);
    assertEquals(lineBody.fk_product, 7);
    assertEquals(lineBody.qty, 3);
    assertEquals(lineBody.subprice, 25);
    assertEquals(lineBody.desc, "Bolt");
    assertEquals(lineBody.tva_tx, "20.000");

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

Deno.test("erp.sales_order_create — dolibarr LINE_PRODUCT_NOT_FOUND propagated", async () => {
  const restore = mockFetchQueue(
    [{ status: 200, body: [] }], // product not found
    [],
  );
  try {
    const a = new NormalizedAdapter({ dolibarr: createDolibarrTestAdapter() });
    const err = await assertRejects(
      () =>
        a.callTool(
          "erp.sales_order_create",
          {
            erpType: "dolibarr",
            mode: "commit",
            customerId: "7",
            lines: [{ sku: "UNKNOWN-SKU", qty: 1, unitPrice: 10 }],
          },
          { tenantId: "t", actorSubject: null },
        ),
      WriteError,
    );
    assertEquals(err.code, "LINE_PRODUCT_NOT_FOUND");
    assertEquals((err.context as { sku: string }).sku, "UNKNOWN-SKU");
  } finally {
    restore();
  }
});

// ─── Task D: erp.quotation_create ────────────────────────────────────────────

Deno.test("erp.quotation_create — erpnext preview: party_name sent (not customer)", async () => {
  const captured: CapturedFetch[] = [];
  const restore = mockFetch({ status: 200, body: {} }, captured);
  try {
    const a = new NormalizedAdapter({
      erpnext: createErpnextTestAdapter("All Items", "Nos"),
    });
    const r = await a.callTool(
      "erp.quotation_create",
      {
        erpType: "erpnext",
        mode: "preview",
        customerId: "PROSPECT-001",
        lines: [{ sku: "SVC-1", qty: 1, unitPrice: 500 }],
        date: "2026-07-01",
        validUntil: "2026-07-31",
      },
      { tenantId: "t", actorSubject: null },
    );
    assertEquals(captured.length, 0);
    const c = r.content as {
      committed: boolean;
      erpType: string;
      resolved: Record<string, unknown>;
    };
    assertEquals(c.committed, false);
    assertEquals(c.erpType, "erpnext");
    assertEquals(c.resolved.party_name, "PROSPECT-001");
    assertEquals("customer" in c.resolved, false);
  } finally {
    restore();
  }
});

Deno.test("erp.quotation_create — dolibarr commit happy path", async () => {
  const captured: CapturedFetch[] = [];
  const restore = mockFetchQueue(
    [
      { status: 200, body: [{ id: 5, tva_tx: "0", ref: "SVC-A" }] },
      { status: 200, body: 99 },
      { status: 200, body: 1 },
    ],
    captured,
  );
  try {
    const a = new NormalizedAdapter({ dolibarr: createDolibarrTestAdapter() });
    const r = await a.callTool(
      "erp.quotation_create",
      {
        erpType: "dolibarr",
        mode: "commit",
        customerId: "12",
        lines: [{ sku: "SVC-A", qty: 2, unitPrice: 300 }],
        date: "2026-07-01",
        validUntil: "2026-07-15",
      },
      { tenantId: "t", actorSubject: null },
    );
    assertEquals(captured[1].url.pathname, "/api/index.php/proposals");
    const proposalBody = JSON.parse(captured[1].body as string);
    assertEquals(proposalBody.socid, 12);
    // duree_validite = 14 days
    assertEquals(proposalBody.duree_validite, 14);
    const c = r.content as { committed: boolean; nativeId: string };
    assertEquals(c.committed, true);
    assertEquals(c.nativeId, "99");
  } finally {
    restore();
  }
});

// ─── Task D: erp.sales_invoice_create ────────────────────────────────────────

Deno.test("erp.sales_invoice_create — erpnext commit maps fields correctly", async () => {
  const captured: CapturedFetch[] = [];
  const restore = mockFetch(
    { status: 200, body: { data: { name: "SINV-007" } } },
    captured,
  );
  try {
    const a = new NormalizedAdapter({
      erpnext: createErpnextTestAdapter("All Items", "Nos"),
    });
    const r = await a.callTool(
      "erp.sales_invoice_create",
      {
        erpType: "erpnext",
        mode: "commit",
        customerId: "CUST-003",
        lines: [{ sku: "ITEM-Y", qty: 2, unitPrice: 75 }],
        date: "2026-07-05",
        dueDate: "2026-08-05",
      },
      { tenantId: "t", actorSubject: null },
    );
    assertEquals(captured[0].method, "POST");
    // URL-encoded: "Sales Invoice" → "Sales%20Invoice"
    assertEquals(
      decodeURIComponent(captured[0].url.pathname),
      "/api/resource/Sales Invoice",
    );
    const body = JSON.parse(captured[0].body as string);
    assertEquals(body.customer, "CUST-003");
    assertEquals(body.posting_date, "2026-07-05");
    assertEquals(body.due_date, "2026-08-05");
    assertEquals(body.items, [{ item_code: "ITEM-Y", qty: 2, rate: 75 }]);
    const c = r.content as {
      committed: boolean;
      erpType: string;
      nativeId: string;
    };
    assertEquals(c.committed, true);
    assertEquals(c.erpType, "erpnext");
    assertEquals(c.nativeId, "SINV-007");
  } finally {
    restore();
  }
});

Deno.test("erp.sales_invoice_create — dolibarr commit with due_date", async () => {
  const captured: CapturedFetch[] = [];
  const restore = mockFetchQueue(
    [
      { status: 200, body: [{ id: 9, tva_tx: "20", ref: "SKU-INV" }] },
      { status: 200, body: 77 },
      { status: 200, body: 1 },
    ],
    captured,
  );
  try {
    const a = new NormalizedAdapter({ dolibarr: createDolibarrTestAdapter() });
    const r = await a.callTool(
      "erp.sales_invoice_create",
      {
        erpType: "dolibarr",
        mode: "commit",
        customerId: "33",
        lines: [{ sku: "SKU-INV", qty: 1, unitPrice: 200 }],
        date: "2026-07-05",
        dueDate: "2026-08-05",
      },
      { tenantId: "t", actorSubject: null },
    );
    assertEquals(captured[1].url.pathname, "/api/index.php/invoices");
    const invBody = JSON.parse(captured[1].body as string);
    assertEquals(invBody.socid, 33);
    assertEquals(invBody.type, 0);
    // date_lim_reglement should be epoch for 2026-08-05
    assertEquals(
      invBody.date_lim_reglement,
      Math.floor(new Date("2026-08-05T00:00:00Z").getTime() / 1000),
    );
    const c = r.content as { committed: boolean; nativeId: string };
    assertEquals(c.committed, true);
    assertEquals(c.nativeId, "77");
  } finally {
    restore();
  }
});

Deno.test("erp.sales_invoice_create — dolibarr preview: no HTTP, fk_product placeholder", async () => {
  const captured: CapturedFetch[] = [];
  const restore = mockFetch({ status: 200, body: {} }, captured);
  try {
    const a = new NormalizedAdapter({ dolibarr: createDolibarrTestAdapter() });
    const r = await a.callTool(
      "erp.sales_invoice_create",
      {
        erpType: "dolibarr",
        mode: "preview",
        customerId: "33",
        lines: [{ sku: "SKU-INV", qty: 1, unitPrice: 200 }],
      },
      { tenantId: "t", actorSubject: null },
    );
    assertEquals(captured.length, 0);
    const c = r.content as {
      committed: boolean;
      resolved: { lines: Array<Record<string, unknown>> };
    };
    assertEquals(c.committed, false);
    assertEquals(c.resolved.lines[0].fk_product, "<resolved-at-commit>");
  } finally {
    restore();
  }
});

Deno.test("erp.capabilities_describe — includes the 3 new sales doc tools", async () => {
  const a = new NormalizedAdapter({
    erpnext: createErpnextTestAdapter(),
    dolibarr: createDolibarrTestAdapter(),
  });
  for (const erpType of ["erpnext", "dolibarr"] as const) {
    const r = await a.callTool(
      "erp.capabilities_describe",
      { erpType },
      CTX,
    );
    const c = r.content as { supportedTools: string[] };
    assertEquals(c.supportedTools.includes("erp.sales_order_create"), true);
    assertEquals(c.supportedTools.includes("erp.quotation_create"), true);
    assertEquals(c.supportedTools.includes("erp.sales_invoice_create"), true);
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

// ─── Task D: erp.*_submit ─────────────────────────────────────────────────────

Deno.test("erp.sales_order_submit — erpnext preview: no HTTP, committed:false, no lifecycleState", async () => {
  const captured: CapturedFetch[] = [];
  const restore = mockFetch({ status: 200, body: {} }, captured);
  try {
    const a = new NormalizedAdapter({ erpnext: createErpnextTestAdapter() });
    const r = await a.callTool(
      "erp.sales_order_submit",
      { erpType: "erpnext", mode: "preview", nativeId: "SO-001" },
      CTX,
    );
    assertEquals(captured.length, 0);
    const c = r.content as Record<string, unknown>;
    assertEquals(c.committed, false);
    assertEquals(c.erpType, "erpnext");
    assertEquals("lifecycleState" in c, false);
  } finally {
    restore();
  }
});

Deno.test("erp.sales_order_submit — erpnext commit: GET + submit POST, lifecycleState mapped from status", async () => {
  const captured: CapturedFetch[] = [];
  // GET /api/resource/Sales Order/SO-001 → full doc
  // POST /api/method/frappe.client.submit → submitted doc
  const restore = mockFetchQueue(
    [
      {
        status: 200,
        body: {
          data: {
            name: "SO-001",
            doctype: "Sales Order",
            modified: "2026-07-02 12:00:00",
            docstatus: 0,
          },
        },
      },
      {
        status: 200,
        body: {
          message: {
            name: "SO-001",
            doctype: "Sales Order",
            docstatus: 1,
            status: "To Deliver and Bill",
          },
        },
      },
    ],
    captured,
  );
  try {
    const a = new NormalizedAdapter({ erpnext: createErpnextTestAdapter() });
    const r = await a.callTool(
      "erp.sales_order_submit",
      { erpType: "erpnext", mode: "commit", nativeId: "SO-001" },
      CTX,
    );
    assertEquals(captured.length, 2);
    // First call: GET the doc (pathname is URL-encoded: "Sales%20Order")
    assertEquals(captured[0].method, "GET");
    assert(
      decodeURIComponent(captured[0].url.pathname).includes("Sales Order"),
    );
    // Second call: POST submit method
    assertEquals(captured[1].method, "POST");
    assert(
      decodeURIComponent(captured[1].url.pathname).includes(
        "frappe.client.submit",
      ),
    );
    const c = r.content as Record<string, unknown>;
    assertEquals(c.committed, true);
    assertEquals(c.erpType, "erpnext");
    assertEquals(c.lifecycleState, "open"); // "To Deliver and Bill" → "open"
  } finally {
    restore();
  }
});

Deno.test("erp.sales_order_submit — erpnext commit: docstatus 1 + status Submitted → lifecycleState validated", async () => {
  const captured: CapturedFetch[] = [];
  const restore = mockFetchQueue(
    [
      {
        status: 200,
        body: {
          data: {
            name: "SO-002",
            doctype: "Sales Order",
            modified: "2026-07-02 12:00:00",
            docstatus: 0,
          },
        },
      },
      {
        status: 200,
        body: {
          message: {
            name: "SO-002",
            doctype: "Sales Order",
            docstatus: 1,
            status: "Submitted",
          },
        },
      },
    ],
    captured,
  );
  try {
    const a = new NormalizedAdapter({ erpnext: createErpnextTestAdapter() });
    const r = await a.callTool(
      "erp.sales_order_submit",
      { erpType: "erpnext", mode: "commit", nativeId: "SO-002" },
      CTX,
    );
    const c = r.content as Record<string, unknown>;
    assertEquals(c.lifecycleState, "validated");
  } finally {
    restore();
  }
});

Deno.test("erp.quotation_submit — dolibarr commit: POST /proposals/{id}/validate, lifecycleState mapped from statut 1", async () => {
  const captured: CapturedFetch[] = [];
  // POST /proposals/5/validate → { statut: 1, ... }
  const restore = mockFetch(
    { status: 200, body: { statut: 1, id: 5 } },
    captured,
  );
  try {
    const a = new NormalizedAdapter({ dolibarr: createDolibarrTestAdapter() });
    const r = await a.callTool(
      "erp.quotation_submit",
      { erpType: "dolibarr", mode: "commit", nativeId: "5" },
      CTX,
    );
    assertEquals(captured.length, 1);
    assertEquals(captured[0].method, "POST");
    assert(captured[0].url.pathname.includes("/proposals/5/validate"));
    const reqBody = JSON.parse(captured[0].body as string);
    // proposals must NOT send idwarehouse
    assertEquals("idwarehouse" in reqBody, false);
    assertEquals(reqBody.notrigger, 0);
    const c = r.content as Record<string, unknown>;
    assertEquals(c.committed, true);
    assertEquals(c.erpType, "dolibarr");
    assertEquals(c.lifecycleState, "open"); // statut:1 + kind:"proposal" → "open"
  } finally {
    restore();
  }
});

Deno.test("erp.sales_invoice_submit — dolibarr commit: lifecycleState mapped from statut 1", async () => {
  const captured: CapturedFetch[] = [];
  const restore = mockFetch(
    { status: 200, body: { statut: 1, id: 77 } },
    captured,
  );
  try {
    const a = new NormalizedAdapter({ dolibarr: createDolibarrTestAdapter() });
    const r = await a.callTool(
      "erp.sales_invoice_submit",
      { erpType: "dolibarr", mode: "commit", nativeId: "77" },
      CTX,
    );
    assertEquals(captured.length, 1);
    assert(captured[0].url.pathname.includes("/invoices/77/validate"));
    const c = r.content as Record<string, unknown>;
    assertEquals(c.committed, true);
    assertEquals(c.lifecycleState, "open"); // statut:1 + kind:"invoice" → "open"
    assertEquals(c.erpType, "dolibarr");
  } finally {
    restore();
  }
});

Deno.test("erp.sales_order_submit — dolibarr INVALID_NATIVE_ID throws NormalizedError", async () => {
  const a = new NormalizedAdapter({ dolibarr: createDolibarrTestAdapter() });
  const { NormalizedError: NE } = await import("./domain/normalized.ts");
  const err = await assertRejects(
    () =>
      a.callTool(
        "erp.sales_order_submit",
        { erpType: "dolibarr", mode: "commit", nativeId: "not-a-number" },
        CTX,
      ),
    NE,
  );
  assertEquals(err.code, "INVALID_NATIVE_ID");
});

Deno.test("erp.sales_order_submit — dolibarr ALREADY_TRANSITIONED propagated", async () => {
  // Dolibarr signals already-validated with HTTP 304 (null-body status code).
  // `new Response(body, { status: 304 })` throws in Deno when body is non-null,
  // so we create the Response with an empty body.
  const original = globalThis.fetch;
  globalThis.fetch = (): Promise<Response> =>
    Promise.resolve(new Response(null, { status: 304 }));
  try {
    const a = new NormalizedAdapter({ dolibarr: createDolibarrTestAdapter() });
    const err = await assertRejects(
      () =>
        a.callTool(
          "erp.sales_order_submit",
          { erpType: "dolibarr", mode: "commit", nativeId: "10" },
          CTX,
        ),
      WriteError,
    );
    assertEquals(err.code, "ALREADY_TRANSITIONED");
    assertEquals((err.context as { docKind: string }).docKind, "orders");
  } finally {
    globalThis.fetch = original;
  }
});

Deno.test("erp.quotation_submit — preview dolibarr: no HTTP, committed:false, no lifecycleState", async () => {
  const captured: CapturedFetch[] = [];
  const restore = mockFetch({ status: 200, body: {} }, captured);
  try {
    const a = new NormalizedAdapter({ dolibarr: createDolibarrTestAdapter() });
    const r = await a.callTool(
      "erp.quotation_submit",
      { erpType: "dolibarr", mode: "preview", nativeId: "5" },
      CTX,
    );
    assertEquals(captured.length, 0);
    const c = r.content as Record<string, unknown>;
    assertEquals(c.committed, false);
    assertEquals(c.erpType, "dolibarr");
    assertEquals("lifecycleState" in c, false);
  } finally {
    restore();
  }
});

Deno.test("erp.capabilities_describe — includes the 3 submit tools", async () => {
  const a = new NormalizedAdapter({
    erpnext: createErpnextTestAdapter(),
    dolibarr: createDolibarrTestAdapter(),
  });
  for (const erpType of ["erpnext", "dolibarr"] as const) {
    const r = await a.callTool(
      "erp.capabilities_describe",
      { erpType },
      CTX,
    );
    const c = r.content as { supportedTools: string[] };
    assertEquals(
      c.supportedTools.includes("erp.sales_order_submit"),
      true,
      `${erpType}: missing sales_order_submit`,
    );
    assertEquals(
      c.supportedTools.includes("erp.quotation_submit"),
      true,
      `${erpType}: missing quotation_submit`,
    );
    assertEquals(
      c.supportedTools.includes("erp.sales_invoice_submit"),
      true,
      `${erpType}: missing sales_invoice_submit`,
    );
  }
});

Deno.test("erp.sales_order_submit — erpnext commit: status absent → lifecycleState from docstatus", async () => {
  const captured: CapturedFetch[] = [];
  const restore = mockFetchQueue(
    [
      {
        status: 200,
        body: {
          data: {
            name: "SO-002",
            doctype: "Sales Order",
            modified: "2026-07-02 12:00:00",
            docstatus: 0,
          },
        },
      },
      {
        status: 200,
        body: {
          message: {
            name: "SO-002",
            doctype: "Sales Order",
            docstatus: 1,
          },
        },
      },
    ],
    captured,
  );
  try {
    const a = new NormalizedAdapter({ erpnext: createErpnextTestAdapter() });
    const r = await a.callTool(
      "erp.sales_order_submit",
      { erpType: "erpnext", mode: "commit", nativeId: "SO-002" },
      CTX,
    );
    const c = r.content as Record<string, unknown>;
    assertEquals(c.committed, true);
    assertEquals(c.lifecycleState, "validated");
  } finally {
    restore();
  }
});
