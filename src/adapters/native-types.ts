/**
 * Native ERP payload interfaces — Wave 3.
 *
 * These interfaces describe the shapes returned by ERPNext and Dolibarr REST
 * APIs. All fields are optional (`?`) or unknown because the API may omit
 * fields depending on the requested field list or document type.
 *
 * These are NOT exported from `mod.ts` — they are internal implementation
 * details used by the normalizers and compile-time `satisfies` tests.
 *
 * @module @casys/mcp-erp/adapters/native-types
 */

// ─── ERPNext native shapes ────────────────────────────────────────────────────

export interface ErpNextCustomer {
  name?: string;
  customer_name?: string;
  customer_type?: string;
  customer_group?: string;
  territory?: string;
  disabled?: number | boolean;
  modified?: string;
  [key: string]: unknown;
}

export interface ErpNextSupplier {
  name?: string;
  supplier_name?: string;
  supplier_type?: string;
  supplier_group?: string;
  country?: string;
  disabled?: number | boolean;
  modified?: string;
  [key: string]: unknown;
}

export interface ErpNextItem {
  name?: string;
  item_code?: string;
  item_name?: string;
  item_group?: string;
  stock_uom?: string;
  is_stock_item?: number | boolean;
  standard_rate?: number;
  disabled?: number | boolean;
  modified?: string;
  [key: string]: unknown;
}

export interface ErpNextSalesInvoice {
  name?: string;
  customer?: string;
  posting_date?: string;
  due_date?: string;
  status?: string;
  grand_total?: number;
  outstanding_amount?: number;
  currency?: string;
  modified?: string;
  [key: string]: unknown;
}

export interface ErpNextSalesOrder {
  name?: string;
  customer?: string;
  transaction_date?: string;
  delivery_date?: string;
  status?: string;
  grand_total?: number;
  currency?: string;
  modified?: string;
  [key: string]: unknown;
}

export interface ErpNextQuotation {
  name?: string;
  quotation_to?: string;
  party_name?: string;
  transaction_date?: string;
  valid_till?: string;
  status?: string;
  grand_total?: number;
  currency?: string;
  modified?: string;
  [key: string]: unknown;
}

// ─── Dolibarr native shapes ───────────────────────────────────────────────────

export interface DolibarrThirdparty {
  id?: number | string | null;
  ref?: string;
  name?: string;
  nom?: string;
  name_alias?: string;
  client?: number | string;
  fournisseur?: number | string;
  status?: number | string;
  [key: string]: unknown;
}

export interface DolibarrProduct {
  id?: number | string | null;
  ref?: string;
  label?: string;
  type?: number | string;
  status?: number | string;
  price?: number | string;
  [key: string]: unknown;
}

export interface DolibarrInvoice {
  id?: number | string | null;
  ref?: string;
  statut?: number | string;
  paye?: number | string | boolean;
  datef?: string | number;
  date?: string | number;
  date_creation?: string | number;
  date_lim_reglement?: string | number;
  total_ttc?: number | string;
  total_ht?: number | string;
  total_tva?: number | string;
  multicurrency_total_ttc?: number | string;
  multicurrency_code?: string;
  currency?: string;
  socname?: string;
  thirdparty?: Record<string, unknown>;
  thirdparty_name?: string;
  socid?: number | string;
  lines?: unknown[];
  [key: string]: unknown;
}

export interface DolibarrOrder {
  id?: number | string | null;
  ref?: string;
  statut?: number | string;
  date_commande?: string | number;
  date_livraison?: string | number;
  total_ttc?: number | string;
  total_ht?: number | string;
  currency?: string;
  socname?: string;
  thirdparty?: Record<string, unknown>;
  lines?: unknown[];
  [key: string]: unknown;
}

export interface DolibarrProposal {
  id?: number | string | null;
  ref?: string;
  statut?: number | string;
  datep?: string | number;
  fin_validite?: string | number;
  total_ttc?: number | string;
  total_ht?: number | string;
  currency?: string;
  socname?: string;
  thirdparty?: Record<string, unknown>;
  lines?: unknown[];
  [key: string]: unknown;
}

// ─── Compile-time shape checks ────────────────────────────────────────────────
// These `satisfies` assertions confirm the interfaces are structurally valid
// objects (not just type aliases). They run at compile time only.

const _erpnextCustomerCheck = {
  name: "CUST-001",
  customer_name: "Test Corp",
} satisfies ErpNextCustomer;

const _erpnextSalesInvoiceCheck = {
  name: "SINV-00001",
  customer: "ACME",
  status: "Unpaid",
  grand_total: 100,
  currency: "EUR",
} satisfies ErpNextSalesInvoice;

const _dolibarrInvoiceCheck = {
  id: 42,
  ref: "FA2025-001",
  statut: 1,
  paye: "0",
} satisfies DolibarrInvoice;

// Silence unused variable warnings by referencing them in a no-op.
void _erpnextCustomerCheck;
void _erpnextSalesInvoiceCheck;
void _dolibarrInvoiceCheck;
