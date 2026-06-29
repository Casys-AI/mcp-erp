/**
 * Cross-ERP payload normalizers — Wave 3.
 *
 * Each normalizer takes a typed native payload and returns a `NormalizedPayload<T>`.
 * They are pure functions: no I/O, no side effects.
 *
 * Design choices:
 *  - ERPNext normalizers use defensive optional chaining (raw fields may be
 *    absent from list-mode projections).
 *  - Dolibarr normalizers reuse `mapDolibarrInvoice` / `mapDolibarrDocData`
 *    from the Wave 2 adapter to avoid duplicating mapping logic.
 *  - `nativeId` is derived from Dolibarr `String(raw.id)` or ERPNext
 *    `raw.name`. If absent/null, `missingNativeIdError` is thrown immediately
 *    (fast-fail — never produce a payload with an empty or fabricated ID).
 *
 * @module @casys/mcp-erp/adapters/normalizers
 */

import type { NormalizedPayload, NormalizedView } from "../normalized.ts";
import { missingNativeIdError } from "../normalized.ts";
import { mapDolibarrLifecycle, mapErpNextLifecycle } from "../lifecycle.ts";
import { mapDolibarrDocData, mapDolibarrInvoice } from "./dolibarr.ts";
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

// ─── Helper ───────────────────────────────────────────────────────────────────

/** Assert that the native ID value is usable; throw MISSING_NATIVE_ID if not. */
function assertNativeId(
  value: unknown,
  erpType: string,
  nativeType: string,
): string {
  if (value === null || value === undefined) {
    throw missingNativeIdError(erpType, nativeType);
  }
  const str = String(value);
  if (str === "" || str === "null" || str === "undefined") {
    throw missingNativeIdError(erpType, nativeType);
  }
  return str;
}

/** Extract a NormalizedView from the output of mapDolibarrInvoice. */
function dolibarrMappedToView(
  mapped: Record<string, unknown>,
  nativeId: string,
): NormalizedView {
  return {
    ref: typeof mapped.name === "string" && mapped.name
      ? mapped.name
      : nativeId,
    partyName: typeof mapped.party_name === "string"
      ? mapped.party_name
      : undefined,
    grandTotal: typeof mapped.grand_total === "number"
      ? mapped.grand_total
      : undefined,
    currency: typeof mapped.currency === "string" ? mapped.currency : undefined,
    date: typeof mapped.posting_date === "string" ||
        typeof mapped.transaction_date === "string"
      ? (mapped.posting_date as string | undefined) ??
        (mapped.transaction_date as string | undefined)
      : undefined,
    dueDate: typeof mapped.due_date === "string" ? mapped.due_date : undefined,
  };
}

/** Extract a NormalizedView from the output of mapDolibarrDocData for orders. */
function dolibarrDocDataToView(
  mapped: Record<string, unknown>,
  nativeId: string,
): NormalizedView {
  return {
    ref: typeof mapped.name === "string" && mapped.name
      ? mapped.name
      : nativeId,
    partyName: typeof mapped.party_name === "string"
      ? mapped.party_name
      : undefined,
    grandTotal: typeof mapped.grand_total === "number"
      ? mapped.grand_total
      : undefined,
    currency: typeof mapped.currency === "string" ? mapped.currency : undefined,
    date: typeof mapped.transaction_date === "string"
      ? mapped.transaction_date
      : undefined,
    // proposals use valid_till; orders use delivery_date (set by mapDolibarrDocData)
    dueDate: typeof mapped.valid_till === "string"
      ? mapped.valid_till
      : typeof mapped.delivery_date === "string"
      ? mapped.delivery_date
      : undefined,
  };
}

// ─── Dolibarr normalizers ─────────────────────────────────────────────────────

export function normalizeDolibarrInvoice(
  raw: DolibarrInvoice,
): NormalizedPayload<DolibarrInvoice> {
  const nativeId = assertNativeId(raw.id, "dolibarr", "facture");
  const mapped = mapDolibarrInvoice(raw as Record<string, unknown>);
  return {
    nativeId,
    nativeType: "facture",
    erpType: "dolibarr",
    lifecycleState: mapDolibarrLifecycle("invoice", raw.statut, raw.paye),
    availableActions: [],
    data: dolibarrMappedToView(mapped, nativeId),
    _raw: raw,
  };
}

export function normalizeDolibarrOrder(
  raw: DolibarrOrder,
): NormalizedPayload<DolibarrOrder> {
  const nativeId = assertNativeId(raw.id, "dolibarr", "commande");
  const mapped = mapDolibarrDocData(raw as Record<string, unknown>, "order");
  return {
    nativeId,
    nativeType: "commande",
    erpType: "dolibarr",
    lifecycleState: mapDolibarrLifecycle("order", raw.statut),
    availableActions: [],
    data: dolibarrDocDataToView(mapped, nativeId),
    _raw: raw,
  };
}

export function normalizeDolibarrProposal(
  raw: DolibarrProposal,
): NormalizedPayload<DolibarrProposal> {
  const nativeId = assertNativeId(raw.id, "dolibarr", "propal");
  const mapped = mapDolibarrDocData(raw as Record<string, unknown>, "proposal");
  return {
    nativeId,
    nativeType: "propal",
    erpType: "dolibarr",
    lifecycleState: mapDolibarrLifecycle("proposal", raw.statut),
    availableActions: [],
    data: dolibarrDocDataToView(mapped, nativeId),
    _raw: raw,
  };
}

export function normalizeDolibarrParty(
  raw: DolibarrThirdparty,
): NormalizedPayload<DolibarrThirdparty> {
  const nativeId = assertNativeId(raw.id, "dolibarr", "thirdparty");
  const ref = typeof raw.ref === "string" && raw.ref ? raw.ref : nativeId;
  const partyName = typeof raw.name === "string" && raw.name
    ? raw.name
    : typeof raw.nom === "string" && raw.nom
    ? raw.nom
    : typeof raw.name_alias === "string" && raw.name_alias
    ? raw.name_alias
    : undefined;
  return {
    nativeId,
    nativeType: "thirdparty",
    erpType: "dolibarr",
    lifecycleState: "unknown",
    availableActions: [],
    data: { ref, partyName },
    _raw: raw,
  };
}

export function normalizeDolibarrProduct(
  raw: DolibarrProduct,
): NormalizedPayload<DolibarrProduct> {
  const nativeId = assertNativeId(raw.id, "dolibarr", "product");
  const ref = typeof raw.ref === "string" && raw.ref ? raw.ref : nativeId;
  return {
    nativeId,
    nativeType: "product",
    erpType: "dolibarr",
    lifecycleState: "unknown",
    availableActions: [],
    data: { ref },
    _raw: raw,
  };
}

// ─── ERPNext normalizers ──────────────────────────────────────────────────────

export function normalizeErpNextSalesInvoice(
  raw: ErpNextSalesInvoice,
): NormalizedPayload<ErpNextSalesInvoice> {
  const nativeId = assertNativeId(
    raw.name && raw.name.length > 0 ? raw.name : null,
    "erpnext",
    "Sales Invoice",
  );
  return {
    nativeId,
    nativeType: "Sales Invoice",
    erpType: "erpnext",
    lifecycleState: mapErpNextLifecycle(
      typeof raw.status === "string" ? raw.status : "",
      "Sales Invoice",
    ),
    availableActions: [],
    data: {
      ref: nativeId,
      partyName: typeof raw.customer === "string" && raw.customer
        ? raw.customer
        : undefined,
      grandTotal: typeof raw.grand_total === "number"
        ? raw.grand_total
        : undefined,
      currency: typeof raw.currency === "string" && raw.currency
        ? raw.currency
        : undefined,
      date: typeof raw.posting_date === "string" && raw.posting_date
        ? raw.posting_date
        : undefined,
      dueDate: typeof raw.due_date === "string" && raw.due_date
        ? raw.due_date
        : undefined,
    },
    _raw: raw,
  };
}

export function normalizeErpNextSalesOrder(
  raw: ErpNextSalesOrder,
): NormalizedPayload<ErpNextSalesOrder> {
  const nativeId = assertNativeId(
    raw.name && raw.name.length > 0 ? raw.name : null,
    "erpnext",
    "Sales Order",
  );
  return {
    nativeId,
    nativeType: "Sales Order",
    erpType: "erpnext",
    lifecycleState: mapErpNextLifecycle(
      typeof raw.status === "string" ? raw.status : "",
      "Sales Order",
    ),
    availableActions: [],
    data: {
      ref: nativeId,
      partyName: typeof raw.customer === "string" && raw.customer
        ? raw.customer
        : undefined,
      grandTotal: typeof raw.grand_total === "number"
        ? raw.grand_total
        : undefined,
      currency: typeof raw.currency === "string" && raw.currency
        ? raw.currency
        : undefined,
      date: typeof raw.transaction_date === "string" && raw.transaction_date
        ? raw.transaction_date
        : undefined,
      dueDate: typeof raw.delivery_date === "string" && raw.delivery_date
        ? raw.delivery_date
        : undefined,
    },
    _raw: raw,
  };
}

export function normalizeErpNextQuotation(
  raw: ErpNextQuotation,
): NormalizedPayload<ErpNextQuotation> {
  const nativeId = assertNativeId(
    raw.name && raw.name.length > 0 ? raw.name : null,
    "erpnext",
    "Quotation",
  );
  return {
    nativeId,
    nativeType: "Quotation",
    erpType: "erpnext",
    lifecycleState: mapErpNextLifecycle(
      typeof raw.status === "string" ? raw.status : "",
      "Quotation",
    ),
    availableActions: [],
    data: {
      ref: nativeId,
      partyName: typeof raw.party_name === "string" && raw.party_name
        ? raw.party_name
        : undefined,
      grandTotal: typeof raw.grand_total === "number"
        ? raw.grand_total
        : undefined,
      currency: typeof raw.currency === "string" && raw.currency
        ? raw.currency
        : undefined,
      date: typeof raw.transaction_date === "string" && raw.transaction_date
        ? raw.transaction_date
        : undefined,
      dueDate: typeof raw.valid_till === "string" && raw.valid_till
        ? raw.valid_till
        : undefined,
    },
    _raw: raw,
  };
}

export function normalizeErpNextCustomer(
  raw: ErpNextCustomer,
): NormalizedPayload<ErpNextCustomer> {
  const nativeId = assertNativeId(
    raw.name && raw.name.length > 0 ? raw.name : null,
    "erpnext",
    "Customer",
  );
  return {
    nativeId,
    nativeType: "Customer",
    erpType: "erpnext",
    lifecycleState: "unknown",
    availableActions: [],
    data: {
      ref: nativeId,
      partyName: typeof raw.customer_name === "string" && raw.customer_name
        ? raw.customer_name
        : undefined,
    },
    _raw: raw,
  };
}

export function normalizeErpNextSupplier(
  raw: ErpNextSupplier,
): NormalizedPayload<ErpNextSupplier> {
  const nativeId = assertNativeId(
    raw.name && raw.name.length > 0 ? raw.name : null,
    "erpnext",
    "Supplier",
  );
  return {
    nativeId,
    nativeType: "Supplier",
    erpType: "erpnext",
    lifecycleState: "unknown",
    availableActions: [],
    data: {
      ref: nativeId,
      partyName: typeof raw.supplier_name === "string" && raw.supplier_name
        ? raw.supplier_name
        : undefined,
    },
    _raw: raw,
  };
}

export function normalizeErpNextItem(
  raw: ErpNextItem,
): NormalizedPayload<ErpNextItem> {
  const nativeId = assertNativeId(
    raw.name && raw.name.length > 0 ? raw.name : null,
    "erpnext",
    "Item",
  );
  const ref = typeof raw.item_code === "string" && raw.item_code
    ? raw.item_code
    : nativeId;
  return {
    nativeId,
    nativeType: "Item",
    erpType: "erpnext",
    lifecycleState: "unknown",
    availableActions: [],
    data: { ref },
    _raw: raw,
  };
}
