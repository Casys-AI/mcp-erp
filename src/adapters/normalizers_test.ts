/**
 * TDD Red bar — normalizers (Wave 3).
 */

import { assertEquals, assertInstanceOf, assertThrows } from "@std/assert";
import type { NormalizedPayload } from "../normalized.ts";
import { NormalizedError } from "../normalized.ts";
import {
  normalizeDolibarrInvoice,
  normalizeDolibarrOrder,
  normalizeDolibarrParty,
  normalizeDolibarrProduct,
  normalizeDolibarrProposal,
  normalizeErpNextCustomer,
  normalizeErpNextItem,
  normalizeErpNextQuotation,
  normalizeErpNextSalesInvoice,
  normalizeErpNextSalesOrder,
  normalizeErpNextSupplier,
} from "./normalizers.ts";
import type {
  DolibarrInvoice,
  DolibarrOrder,
  DolibarrProduct,
  DolibarrProposal,
  DolibarrThirdparty,
  ErpNextCustomer,
  ErpNextItem,
  ErpNextQuotation,
  ErpNextSalesInvoice,
  ErpNextSalesOrder,
  ErpNextSupplier,
} from "./native-types.ts";

// ─── Dolibarr Invoice ─────────────────────────────────────────────────────────

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
  assertEquals(payload.data.grandTotal, 1200);
  assertEquals(payload._raw, raw);
});

Deno.test("normalizeDolibarrInvoice — paye=1 → paid lifecycle", () => {
  const raw: DolibarrInvoice = {
    id: 99,
    ref: "FA2025-099",
    statut: 1,
    paye: 1,
  };
  const payload = normalizeDolibarrInvoice(raw);
  assertEquals(payload.lifecycleState, "paid");
});

Deno.test("normalizeDolibarrInvoice — id=null → MISSING_NATIVE_ID", () => {
  const raw: DolibarrInvoice = { id: null, ref: "FA2025-X", statut: 0 };
  const err = assertThrows(
    () => normalizeDolibarrInvoice(raw),
    NormalizedError,
  );
  assertEquals(err.code, "MISSING_NATIVE_ID");
});

Deno.test("normalizeDolibarrInvoice — id=undefined → MISSING_NATIVE_ID", () => {
  const raw: DolibarrInvoice = { ref: "FA2025-X", statut: 0 };
  const err = assertThrows(
    () => normalizeDolibarrInvoice(raw),
    NormalizedError,
  );
  assertEquals(err.code, "MISSING_NATIVE_ID");
});

Deno.test("normalizeDolibarrInvoice — id='' → MISSING_NATIVE_ID", () => {
  const raw: DolibarrInvoice = { id: "", ref: "FA2025-X", statut: 0 };
  const err = assertThrows(
    () => normalizeDolibarrInvoice(raw),
    NormalizedError,
  );
  assertEquals(err.code, "MISSING_NATIVE_ID");
});

// ─── ERPNext Sales Invoice ────────────────────────────────────────────────────

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

Deno.test("normalizeErpNextSalesInvoice — missing name → MISSING_NATIVE_ID", () => {
  const raw: ErpNextSalesInvoice = { customer: "ACME", status: "Unpaid" };
  const err = assertThrows(
    () => normalizeErpNextSalesInvoice(raw),
    NormalizedError,
  );
  assertEquals(err.code, "MISSING_NATIVE_ID");
});

Deno.test("normalizeErpNextSalesInvoice — empty name → MISSING_NATIVE_ID", () => {
  const raw: ErpNextSalesInvoice = { name: "", customer: "ACME" };
  const err = assertThrows(
    () => normalizeErpNextSalesInvoice(raw),
    NormalizedError,
  );
  assertEquals(err.code, "MISSING_NATIVE_ID");
});

Deno.test("normalizeErpNextSalesInvoice — Overdue status → overdue lifecycle", () => {
  const raw: ErpNextSalesInvoice = {
    name: "SINV-00002",
    status: "Overdue",
    grand_total: 100,
  };
  const payload = normalizeErpNextSalesInvoice(raw);
  assertEquals(payload.lifecycleState, "overdue");
});

Deno.test("normalizeErpNextSalesInvoice — Submitted status → validated lifecycle", () => {
  const raw: ErpNextSalesInvoice = {
    name: "SINV-00003",
    status: "Submitted",
  };
  const payload = normalizeErpNextSalesInvoice(raw);
  assertEquals(payload.lifecycleState, "validated");
});

// ─── ERPNext Customer ─────────────────────────────────────────────────────────

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

Deno.test("normalizeErpNextCustomer — missing name → MISSING_NATIVE_ID", () => {
  const err = assertThrows(
    () => normalizeErpNextCustomer({ customer_name: "X" }),
    NormalizedError,
  );
  assertEquals(err.code, "MISSING_NATIVE_ID");
});

// ─── ERPNext Supplier ─────────────────────────────────────────────────────────

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

// ─── ERPNext Item ─────────────────────────────────────────────────────────────

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

// ─── ERPNext Sales Order ──────────────────────────────────────────────────────

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

// ─── ERPNext Quotation ────────────────────────────────────────────────────────

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

// ─── Dolibarr Order ──────────────────────────────────────────────────────────

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

Deno.test("normalizeDolibarrOrder — id=null → MISSING_NATIVE_ID", () => {
  const raw: DolibarrOrder = { id: null, statut: 0 };
  assertThrows(() => normalizeDolibarrOrder(raw), NormalizedError);
});

Deno.test("normalizeDolibarrOrder — date_livraison → dueDate", () => {
  const raw: DolibarrOrder = {
    id: 20,
    ref: "CO2025-020",
    statut: 1,
    date_livraison: "2025-06-30",
  };
  const payload = normalizeDolibarrOrder(raw);
  assertEquals(payload.data.dueDate, "2025-06-30");
});

// ─── Dolibarr Proposal ───────────────────────────────────────────────────────

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

// ─── Dolibarr Thirdparty ─────────────────────────────────────────────────────

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

Deno.test("normalizeDolibarrParty — id=null → MISSING_NATIVE_ID", () => {
  const raw: DolibarrThirdparty = { id: null, name: "X" };
  assertThrows(() => normalizeDolibarrParty(raw), NormalizedError);
});

// ─── Dolibarr Product ────────────────────────────────────────────────────────

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

Deno.test("normalizeDolibarrProduct — id=null → MISSING_NATIVE_ID", () => {
  const raw: DolibarrProduct = { id: null };
  assertThrows(() => normalizeDolibarrProduct(raw), NormalizedError);
});

// ─── NormalizedError is an Error ─────────────────────────────────────────────

Deno.test("NormalizedError — instanceof Error", () => {
  const err = new NormalizedError("MISSING_NATIVE_ID", "test", {}, "fix it");
  assertInstanceOf(err, Error);
  assertEquals(err.code, "MISSING_NATIVE_ID");
  assertEquals(err.name, "NormalizedError");
});
