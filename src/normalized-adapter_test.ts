/**
 * TDD Red bar — NormalizedAdapter (Wave 3).
 */

import { assertEquals, assertInstanceOf } from "@std/assert";
import type {
  ErpAdapter,
  ErpToolCallContext,
  ErpToolCallResult,
  ErpToolDefinition,
} from "./adapter.ts";
import { UnknownToolError } from "./adapter.ts";
import type { NormalizedPayload } from "./normalized.ts";
import { NormalizedError } from "./normalized.ts";
import { NormalizedAdapter } from "./normalized-adapter.ts";

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

Deno.test("NormalizedAdapter.tools — exposes exactly 7 erp.* tools", () => {
  const tools = adapter.tools();
  const names = tools.map((t) => t.name).sort();
  assertEquals(names, [
    "erp.business_party_get",
    "erp.business_party_list",
    "erp.catalog_item_get",
    "erp.catalog_item_list",
    "erp.quotation_get",
    "erp.sales_invoice_get",
    "erp.sales_order_get",
  ]);
});

Deno.test("NormalizedAdapter.tools — all tools are readOnly", () => {
  const tools = adapter.tools();
  for (const tool of tools) {
    assertEquals(
      tool.annotations?.readOnlyHint,
      true,
      `${tool.name} should be readOnly`,
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
