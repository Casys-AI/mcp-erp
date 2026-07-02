/**
 * ERPNext native REST payload shapes.
 *
 * These are raw provider shapes: fields are optional because Frappe list/get
 * projections vary by requested field list and doctype.
 */

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

/** Native ERPNext child-table row for Sales Order / Quotation / Sales Invoice. */
export interface ErpNextNativeItemRow {
  item_code: string;
  qty: number;
  rate: number;
  description?: string;
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
