/**
 * Normalized feature mappers.
 */

import { assertEquals, assertInstanceOf, assertThrows } from "@std/assert";
import type { NormalizedPayload } from "../domain/normalized.ts";
import { NormalizedError } from "../domain/normalized.ts";
import { normalizeDolibarrParty } from "./customer/mappers/dolibarr.ts";
import { normalizeErpNextCustomer } from "./customer/mappers/erpnext.ts";
import { normalizeDolibarrInvoice } from "./invoice/mappers/dolibarr.ts";
import { normalizeErpNextSalesInvoice } from "./invoice/mappers/erpnext.ts";
import { normalizeDolibarrProduct } from "./product/mappers/dolibarr.ts";
import { normalizeErpNextItem } from "./product/mappers/erpnext.ts";
import { normalizeDolibarrProposal } from "./quotation/mappers/dolibarr.ts";
import { normalizeErpNextQuotation } from "./quotation/mappers/erpnext.ts";
import { normalizeDolibarrOrder } from "./sales-order/mappers/dolibarr.ts";
import { normalizeErpNextSalesOrder } from "./sales-order/mappers/erpnext.ts";
import { normalizeErpNextSupplier } from "./supplier/mappers/erpnext.ts";
import type {
  DolibarrInvoice,
  DolibarrOrder,
  DolibarrProduct,
  DolibarrProposal,
  DolibarrThirdparty,
} from "../platform/erp/dolibarr/types.ts";
import type {
  ErpNextCustomer,
  ErpNextItem,
  ErpNextQuotation,
  ErpNextSalesInvoice,
  ErpNextSalesOrder,
  ErpNextSupplier,
} from "../platform/erp/erpnext/types.ts";

Deno.test("normalizeDolibarrInvoice — happy path", () => {
  const raw: DolibarrInvoice = {
    id: 42,
    ref: "FA2025-001",
    statut: 1,
    paye: "0",
    datef: "2025-01-15",
    date_lim_reglement: "2025-02-15",
    total_ttc: 1200,
    currency: "EUR",
    socname: "ACME Corp",
  };

  const payload: NormalizedPayload<DolibarrInvoice> = normalizeDolibarrInvoice(
    raw,
  );

  assertEquals(payload.nativeId, "42");
  assertEquals(payload.nativeType, "facture");
  assertEquals(payload.erpType, "dolibarr");
  assertEquals(payload.lifecycleState, "open");
  assertEquals(payload.availableActions, []);
  assertEquals(payload.data.ref, "FA2025-001");
  assertEquals(payload.data.partyName, "ACME Corp");
  assertEquals(payload.data.grandTotal, 1200);
  assertEquals(payload.data.currency, "EUR");
  assertEquals(payload.data.date, "2025-01-15");
  assertEquals(payload.data.dueDate, "2025-02-15");
  assertEquals(payload._raw, raw);
});

Deno.test("normalizeDolibarrInvoice — paye=1 -> paid lifecycle", () => {
  const payload = normalizeDolibarrInvoice({
    id: 99,
    ref: "FA2025-099",
    statut: 1,
    paye: 1,
  });
  assertEquals(payload.lifecycleState, "paid");
});

Deno.test("normalizeDolibarrInvoice — invalid IDs throw MISSING_NATIVE_ID", () => {
  for (const id of [null, undefined, ""] as const) {
    const err = assertThrows(
      () => normalizeDolibarrInvoice({ id, ref: "FA2025-X", statut: 0 }),
      NormalizedError,
    );
    assertEquals(err.code, "MISSING_NATIVE_ID");
  }
});

Deno.test("normalizeErpNextSalesInvoice — happy path", () => {
  const raw: ErpNextSalesInvoice = {
    name: "SINV-00001",
    customer: "ACME Corp",
    posting_date: "2025-01-10",
    due_date: "2025-02-10",
    status: "Unpaid",
    grand_total: 5000,
    currency: "USD",
  };

  const payload: NormalizedPayload<ErpNextSalesInvoice> =
    normalizeErpNextSalesInvoice(raw);

  assertEquals(payload.nativeId, "SINV-00001");
  assertEquals(payload.nativeType, "Sales Invoice");
  assertEquals(payload.erpType, "erpnext");
  assertEquals(payload.lifecycleState, "open");
  assertEquals(payload.availableActions, []);
  assertEquals(payload.data.ref, "SINV-00001");
  assertEquals(payload.data.partyName, "ACME Corp");
  assertEquals(payload.data.grandTotal, 5000);
  assertEquals(payload.data.currency, "USD");
  assertEquals(payload.data.date, "2025-01-10");
  assertEquals(payload.data.dueDate, "2025-02-10");
  assertEquals(payload._raw, raw);
});

Deno.test("normalizeErpNextSalesInvoice — invalid names throw MISSING_NATIVE_ID", () => {
  for (
    const raw of [
      { customer: "ACME", status: "Unpaid" },
      { name: "", customer: "ACME" },
    ] satisfies ErpNextSalesInvoice[]
  ) {
    const err = assertThrows(
      () => normalizeErpNextSalesInvoice(raw),
      NormalizedError,
    );
    assertEquals(err.code, "MISSING_NATIVE_ID");
  }
});

Deno.test("normalizeErpNextSalesInvoice — lifecycle mapping", () => {
  assertEquals(
    normalizeErpNextSalesInvoice({
      name: "SINV-00002",
      status: "Overdue",
      grand_total: 100,
    }).lifecycleState,
    "overdue",
  );
  assertEquals(
    normalizeErpNextSalesInvoice({
      name: "SINV-00003",
      status: "Submitted",
    }).lifecycleState,
    "validated",
  );
});

Deno.test("normalizeErpNextCustomer — happy path", () => {
  const raw: ErpNextCustomer = {
    name: "CUST-001",
    customer_name: "Test Corp",
  };
  const payload = normalizeErpNextCustomer(raw);
  assertEquals(payload.nativeId, "CUST-001");
  assertEquals(payload.nativeType, "Customer");
  assertEquals(payload.erpType, "erpnext");
  assertEquals(payload.data.ref, "CUST-001");
  assertEquals(payload.data.partyName, "Test Corp");
  assertEquals(payload._raw, raw);
});

Deno.test("normalizeErpNextCustomer — missing name -> MISSING_NATIVE_ID", () => {
  const err = assertThrows(
    () => normalizeErpNextCustomer({ customer_name: "X" }),
    NormalizedError,
  );
  assertEquals(err.code, "MISSING_NATIVE_ID");
});

Deno.test("normalizeErpNextSupplier — happy path", () => {
  const raw: ErpNextSupplier = {
    name: "SUPP-001",
    supplier_name: "Parts Co",
  };
  const payload = normalizeErpNextSupplier(raw);
  assertEquals(payload.nativeId, "SUPP-001");
  assertEquals(payload.nativeType, "Supplier");
  assertEquals(payload.data.partyName, "Parts Co");
});

Deno.test("normalizeErpNextItem — happy path", () => {
  const raw: ErpNextItem = {
    name: "ITEM-001",
    item_code: "SKU-123",
    item_name: "Widget",
  };
  const payload = normalizeErpNextItem(raw);
  assertEquals(payload.nativeId, "ITEM-001");
  assertEquals(payload.nativeType, "Item");
  assertEquals(payload.data.ref, "SKU-123");
});

Deno.test("normalizeErpNextSalesOrder — happy path", () => {
  const raw: ErpNextSalesOrder = {
    name: "SO-00001",
    customer: "ACME",
    transaction_date: "2025-01-05",
    status: "To Deliver and Bill",
    grand_total: 3000,
    currency: "EUR",
  };
  const payload = normalizeErpNextSalesOrder(raw);
  assertEquals(payload.nativeId, "SO-00001");
  assertEquals(payload.nativeType, "Sales Order");
  assertEquals(payload.lifecycleState, "open");
  assertEquals(payload.data.date, "2025-01-05");
  assertEquals(payload.data.grandTotal, 3000);
});

Deno.test("normalizeErpNextQuotation — happy path", () => {
  const raw: ErpNextQuotation = {
    name: "QTN-00001",
    party_name: "Prospect SA",
    transaction_date: "2025-01-01",
    valid_till: "2025-01-31",
    status: "Open",
    grand_total: 8000,
    currency: "EUR",
  };
  const payload = normalizeErpNextQuotation(raw);
  assertEquals(payload.nativeId, "QTN-00001");
  assertEquals(payload.nativeType, "Quotation");
  assertEquals(payload.lifecycleState, "open");
  assertEquals(payload.data.partyName, "Prospect SA");
});

Deno.test("normalizeDolibarrOrder — happy path", () => {
  const raw: DolibarrOrder = {
    id: 10,
    ref: "CO2025-010",
    statut: 1,
    total_ttc: 400,
    currency: "EUR",
    socname: "Client SA",
  };
  const payload = normalizeDolibarrOrder(raw);
  assertEquals(payload.nativeId, "10");
  assertEquals(payload.nativeType, "commande");
  assertEquals(payload.lifecycleState, "open");
  assertEquals(payload.data.ref, "CO2025-010");
  assertEquals(payload.data.partyName, "Client SA");
});

Deno.test("normalizeDolibarrOrder — id=null -> MISSING_NATIVE_ID", () => {
  assertThrows(
    () => normalizeDolibarrOrder({ id: null, statut: 0 }),
    NormalizedError,
  );
});

Deno.test("normalizeDolibarrOrder — date_livraison -> dueDate", () => {
  const payload = normalizeDolibarrOrder({
    id: 20,
    ref: "CO2025-020",
    statut: 1,
    date_livraison: "2025-06-30",
  });
  assertEquals(payload.data.dueDate, "2025-06-30");
});

Deno.test("normalizeDolibarrProposal — happy path signed", () => {
  const raw: DolibarrProposal = {
    id: 5,
    ref: "DE2025-005",
    statut: 2,
    total_ttc: 9000,
    currency: "EUR",
  };
  const payload = normalizeDolibarrProposal(raw);
  assertEquals(payload.nativeId, "5");
  assertEquals(payload.nativeType, "propal");
  assertEquals(payload.lifecycleState, "signed");
});

Deno.test("normalizeDolibarrParty — happy path", () => {
  const raw: DolibarrThirdparty = {
    id: 77,
    name: "Fournisseur SA",
    ref: "FOUR-001",
  };
  const payload = normalizeDolibarrParty(raw);
  assertEquals(payload.nativeId, "77");
  assertEquals(payload.nativeType, "thirdparty");
  assertEquals(payload.data.partyName, "Fournisseur SA");
  assertEquals(payload.data.ref, "FOUR-001");
});

Deno.test("normalizeDolibarrParty — id=null -> MISSING_NATIVE_ID", () => {
  assertThrows(
    () => normalizeDolibarrParty({ id: null, name: "X" }),
    NormalizedError,
  );
});

Deno.test("normalizeDolibarrProduct — happy path", () => {
  const raw: DolibarrProduct = {
    id: 3,
    ref: "SKU-003",
    label: "Widget Pro",
  };
  const payload = normalizeDolibarrProduct(raw);
  assertEquals(payload.nativeId, "3");
  assertEquals(payload.nativeType, "product");
  assertEquals(payload.data.ref, "SKU-003");
});

Deno.test("normalizeDolibarrProduct — id=null -> MISSING_NATIVE_ID", () => {
  assertThrows(
    () => normalizeDolibarrProduct({ id: null }),
    NormalizedError,
  );
});

Deno.test("NormalizedError — instanceof Error", () => {
  const err = new NormalizedError("MISSING_NATIVE_ID", "test", {}, "fix it");
  assertInstanceOf(err, Error);
  assertEquals(err.code, "MISSING_NATIVE_ID");
  assertEquals(err.name, "NormalizedError");
});
