/**
 * Lifecycle state mappers — Wave 3.
 *
 * Maps native ERP status strings/integers to the normalized `ErpLifecycleState`
 * union. Tables are separated per doctype (ERPNext) and per document kind
 * (Dolibarr) because the same status value can mean different things in
 * different contexts (e.g. "Closed" on Quotation = refused ≠ "Closed" on
 * Sales Order = fulfilled).
 *
 * Fallback is always `'unknown'` — never throws, never returns undefined.
 *
 * @module @casys/mcp-erp/lifecycle
 */

import type { ErpLifecycleState } from "./normalized.ts";

// ─── ERPNext per-doctype tables ───────────────────────────────────────────────

const ERPNEXT_SALES_INVOICE: Record<string, ErpLifecycleState> = {
  "Draft": "draft",
  "Submitted": "validated",
  "Unpaid": "open",
  // Partial payment variants → still open (balance outstanding)
  "Partly Paid": "open",
  "Unpaid and Discounted": "open",
  "Partly Paid and Discounted": "open",
  // Overdue variants
  "Overdue": "overdue",
  "Overdue and Discounted": "overdue",
  "Paid": "paid",
  // Internal transfer = settled via inter-company entry, treated as paid
  "Internal Transfer": "paid",
  "Cancelled": "cancelled",
  "Return": "cancelled",
  "Credit Note Issued": "cancelled",
};

const ERPNEXT_SALES_ORDER: Record<string, ErpLifecycleState> = {
  "Draft": "draft",
  "Submitted": "validated",
  "To Deliver and Bill": "open",
  "To Bill": "open",
  "To Deliver": "open",
  // To Pay = order validated, awaiting payment — still an active open order
  "To Pay": "open",
  // On Hold = temporarily paused but not cancelled — order is still active
  "On Hold": "open",
  "Completed": "closed",
  "Closed": "closed",
  "Cancelled": "cancelled",
};

const ERPNEXT_QUOTATION: Record<string, ErpLifecycleState> = {
  "Draft": "draft",
  "Submitted": "validated",
  "Open": "open",
  "Replied": "open",
  "Ordered": "closed",
  // Partially Ordered = some lines converted to SO but negotiation still open
  "Partially Ordered": "open",
  // "Closed" on Quotation = the quote was refused or manually closed, not fulfilled.
  // This is semantically different from "Closed" on Sales Order (= delivered + billed).
  "Closed": "cancelled",
  "Cancelled": "cancelled",
  "Expired": "cancelled",
  "Lost": "cancelled",
};

/** Fallback table used when no doctype-specific table is found. */
const ERPNEXT_DEFAULT: Record<string, ErpLifecycleState> = {
  "Draft": "draft",
  "Submitted": "validated",
  "Cancelled": "cancelled",
};

/**
 * Map an ERPNext document status string to a normalized `ErpLifecycleState`.
 *
 * @param status   Raw `status` field from the Frappe document.
 * @param doctype  Frappe doctype name, e.g. `'Sales Invoice'`.
 */
export function mapErpNextLifecycle(
  status: string,
  doctype: string,
): ErpLifecycleState {
  const table: Record<string, ErpLifecycleState> = doctype === "Sales Invoice"
    ? ERPNEXT_SALES_INVOICE
    : doctype === "Sales Order"
    ? ERPNEXT_SALES_ORDER
    : doctype === "Quotation"
    ? ERPNEXT_QUOTATION
    : ERPNEXT_DEFAULT;

  return table[status] ?? "unknown";
}

// ─── Dolibarr per-kind tables ─────────────────────────────────────────────────

/** Dolibarr invoice statut → ErpLifecycleState (paye flag handled separately). */
const DOLIBARR_INVOICE: Record<number, ErpLifecycleState> = {
  0: "draft",
  1: "open",
  2: "paid",
  3: "cancelled",
};

/** Dolibarr commande statut → ErpLifecycleState. */
const DOLIBARR_ORDER: Record<number, ErpLifecycleState> = {
  [-1]: "cancelled",
  0: "draft",
  1: "open",
  2: "open",
  3: "closed",
};

/** Dolibarr proposition statut → ErpLifecycleState. */
const DOLIBARR_PROPOSAL: Record<number, ErpLifecycleState> = {
  [-1]: "cancelled",
  0: "draft",
  1: "open",
  2: "signed",
  3: "cancelled",
  4: "closed",
};

/** Dolibarr document kind discriminant. */
export type DolibarrDocKind = "invoice" | "order" | "proposal";

export function parseIntegerLike(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isInteger(value)) return value;
  if (typeof value !== "string" || value.trim() === "") return undefined;
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : undefined;
}

/**
 * Map a Dolibarr document statut (plus optional paye flag for invoices) to a
 * normalized `ErpLifecycleState`.
 *
 * @param kind    Document kind — `'invoice'`, `'order'`, or `'proposal'`.
 * @param statut  Raw `statut` integer (may arrive as string from the REST API).
 * @param paye    Dolibarr invoice `paye` flag — truthy values override statut.
 */
export function mapDolibarrLifecycle(
  kind: DolibarrDocKind,
  statut: unknown,
  paye?: unknown,
): ErpLifecycleState {
  // paye flag takes priority for invoices (Dolibarr keeps statut=1 even when paid)
  if (kind === "invoice" && (paye === 1 || paye === "1" || paye === true)) {
    return "paid";
  }

  const parsed = parseIntegerLike(statut);
  if (parsed === undefined) return "unknown";

  const table: Record<number, ErpLifecycleState> = kind === "invoice"
    ? DOLIBARR_INVOICE
    : kind === "order"
    ? DOLIBARR_ORDER
    : DOLIBARR_PROPOSAL;

  return table[parsed] ?? "unknown";
}
