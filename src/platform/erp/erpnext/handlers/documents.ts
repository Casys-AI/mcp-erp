import type {
  ErpToolCallContext,
  ErpToolCallResult,
} from "../../../../domain/adapter.ts";
import { isRecord } from "../client.ts";
import type { FrappeFilter, FrappeRestClient } from "../client.ts";
import {
  QUOTATION_FIELDS,
  SALES_INVOICE_FIELDS,
  SALES_ORDER_FIELDS,
} from "../tools.ts";

export async function callErpnextDocumentTool(
  params: {
    readonly name: string;
    readonly args: Record<string, unknown>;
    readonly ctx: ErpToolCallContext;
    readonly client: FrappeRestClient;
  },
): Promise<ErpToolCallResult | undefined> {
  const { name, args, ctx, client } = params;

  if (name === "erpnext.sales_invoice_list") {
    const limit = readOptionalInteger(args, "limit", 20, {
      min: 1,
      max: 100,
    });
    const limitStart = readOptionalInteger(args, "limitStart", 0, {
      min: 0,
    });
    const orderBy = readOptionalString(args, "orderBy", "modified desc");
    const filters: FrappeFilter[] = [];
    const customer = readOptionalStringArgument(args, "customer");
    if (customer) filters.push(["customer", "=", customer]);
    const status = readOptionalStringArgument(args, "status");
    if (status) filters.push(["status", "=", status]);
    const dateFrom = readOptionalStringArgument(args, "dateFrom");
    if (dateFrom) filters.push(["posting_date", ">=", dateFrom]);
    const dateTo = readOptionalStringArgument(args, "dateTo");
    if (dateTo) filters.push(["posting_date", "<=", dateTo]);
    const salesInvoices = await client.list("Sales Invoice", {
      fields: SALES_INVOICE_FIELDS,
      filters,
      limitPageLength: limit,
      limitStart,
      orderBy,
    }, {
      signal: ctx.signal,
    });
    return {
      content: {
        doctype: "Sales Invoice",
        data: salesInvoices,
        _title: "ERPNext Sales Invoices",
        _rowAction: {
          toolName: "erpnext.sales_invoice_get",
          idField: "name",
          argName: "name",
        },
        salesInvoices,
        count: salesInvoices.length,
        limit,
        limitStart,
      },
      summary:
        `ERPNext sales_invoice_list returned ${salesInvoices.length} invoice(s)`,
    };
  }

  if (name === "erpnext.sales_invoice_get") {
    const salesInvoice = await client.get(
      "Sales Invoice",
      readRequiredString(args, "name"),
      { signal: ctx.signal },
    );
    return {
      content: {
        data: mapErpNextSalesInvoice(salesInvoice),
        salesInvoice,
      },
      summary: `ERPNext sales_invoice_get returned ${
        String(salesInvoice.name ?? "sales invoice")
      }`,
    };
  }

  if (name === "erpnext.sales_order_list") {
    const limit = readOptionalInteger(args, "limit", 20, {
      min: 1,
      max: 100,
    });
    const limitStart = readOptionalInteger(args, "limitStart", 0, {
      min: 0,
    });
    const orderBy = readOptionalString(args, "orderBy", "modified desc");
    const filters: FrappeFilter[] = [];
    const customer = readOptionalStringArgument(args, "customer");
    if (customer) filters.push(["customer", "=", customer]);
    const status = readOptionalStringArgument(args, "status");
    if (status) filters.push(["status", "=", status]);
    const dateFrom = readOptionalStringArgument(args, "dateFrom");
    if (dateFrom) filters.push(["transaction_date", ">=", dateFrom]);
    const dateTo = readOptionalStringArgument(args, "dateTo");
    if (dateTo) filters.push(["transaction_date", "<=", dateTo]);
    const salesOrders = await client.list("Sales Order", {
      fields: SALES_ORDER_FIELDS,
      filters,
      limitPageLength: limit,
      limitStart,
      orderBy,
    }, {
      signal: ctx.signal,
    });
    return {
      content: {
        doctype: "Sales Order",
        data: salesOrders,
        _title: "ERPNext Sales Orders",
        _rowAction: {
          toolName: "erpnext.sales_order_get",
          idField: "name",
          argName: "name",
        },
        salesOrders,
        count: salesOrders.length,
        limit,
        limitStart,
      },
      summary:
        `ERPNext sales_order_list returned ${salesOrders.length} order(s)`,
    };
  }

  if (name === "erpnext.sales_order_get") {
    const salesOrder = await client.get(
      "Sales Order",
      readRequiredString(args, "name"),
      { signal: ctx.signal },
    );
    return {
      content: {
        data: salesOrder,
        salesOrder,
      },
      summary: `ERPNext sales_order_get returned ${
        String(salesOrder.name ?? "sales order")
      }`,
    };
  }

  if (name === "erpnext.quotation_list") {
    const limit = readOptionalInteger(args, "limit", 20, {
      min: 1,
      max: 100,
    });
    const limitStart = readOptionalInteger(args, "limitStart", 0, {
      min: 0,
    });
    const orderBy = readOptionalString(args, "orderBy", "modified desc");
    const filters: FrappeFilter[] = [];
    const partyName = readOptionalStringArgument(args, "partyName");
    if (partyName) filters.push(["party_name", "=", partyName]);
    const quotationTo = readOptionalStringArgument(args, "quotationTo");
    if (quotationTo) filters.push(["quotation_to", "=", quotationTo]);
    const status = readOptionalStringArgument(args, "status");
    if (status) filters.push(["status", "=", status]);
    const dateFrom = readOptionalStringArgument(args, "dateFrom");
    if (dateFrom) filters.push(["transaction_date", ">=", dateFrom]);
    const dateTo = readOptionalStringArgument(args, "dateTo");
    if (dateTo) filters.push(["transaction_date", "<=", dateTo]);
    const quotations = await client.list("Quotation", {
      fields: QUOTATION_FIELDS,
      filters,
      limitPageLength: limit,
      limitStart,
      orderBy,
    }, {
      signal: ctx.signal,
    });
    return {
      content: {
        doctype: "Quotation",
        data: quotations,
        _title: "ERPNext Quotations",
        _rowAction: {
          toolName: "erpnext.quotation_get",
          idField: "name",
          argName: "name",
        },
        quotations,
        count: quotations.length,
        limit,
        limitStart,
      },
      summary:
        `ERPNext quotation_list returned ${quotations.length} quotation(s)`,
    };
  }

  if (name === "erpnext.quotation_get") {
    const quotation = await client.get(
      "Quotation",
      readRequiredString(args, "name"),
      { signal: ctx.signal },
    );
    return {
      content: {
        data: quotation,
        quotation,
      },
      summary: `ERPNext quotation_get returned ${
        String(quotation.name ?? "quotation")
      }`,
    };
  }

  return undefined;
}

/**
 * Map an ERPNext native Sales Invoice payload to the invoice-viewer `data`
 * contract. The full native payload is preserved by `sales_invoice_get` beside
 * `data`.
 *
 * @internal — not a stable public API.
 */
export function mapErpNextSalesInvoice(
  native: Record<string, unknown>,
): Record<string, unknown> {
  const rawItems = Array.isArray(native.items) ? native.items : [];
  const items = rawItems
    .filter((raw) => isRecord(raw))
    .map((raw) => {
      const item = raw as Record<string, unknown>;
      const mapped: Record<string, unknown> = {
        item_name:
          typeof item.item_name === "string" && item.item_name.length > 0
            ? item.item_name
            : (typeof item.item_code === "string" ? item.item_code : ""),
      };
      if (item.qty !== undefined) mapped.qty = item.qty;
      if (typeof item.rate === "number") mapped.rate = item.rate;
      if (typeof item.amount === "number") mapped.amount = item.amount;
      return mapped;
    });

  const explicitStatus = typeof native.status === "string" ? native.status : "";
  const status = explicitStatus || mapDocstatus(native.docstatus);

  const data: Record<string, unknown> = {
    name: typeof native.name === "string" ? native.name : "",
    status,
    items,
  };

  if (native.customer !== undefined) data.customer = native.customer;
  else if (native.party_name !== undefined) data.party_name = native.party_name;

  if (native.posting_date !== undefined) {
    data.posting_date = native.posting_date;
  }
  if (native.due_date !== undefined) data.due_date = native.due_date;
  if (native.currency !== undefined) data.currency = native.currency;
  if (native.grand_total !== undefined) data.grand_total = native.grand_total;
  if (native.net_total !== undefined) data.net_total = native.net_total;
  if (native.total_taxes_and_charges !== undefined) {
    data.total_taxes_and_charges = native.total_taxes_and_charges;
  }

  return data;
}

function mapDocstatus(docstatus: unknown): string {
  if (docstatus === 0 || docstatus === "0") return "Draft";
  if (docstatus === 1 || docstatus === "1") return "Submitted";
  if (docstatus === 2 || docstatus === "2") return "Cancelled";
  return "";
}

function readOptionalInteger(
  args: Record<string, unknown>,
  name: string,
  defaultValue: number,
  options: { readonly min: number; readonly max?: number },
): number {
  const value = args[name];
  if (value === undefined) return defaultValue;
  if (!Number.isInteger(value)) {
    throw new TypeError(`${name} must be an integer`);
  }
  const numberValue = value as number;
  if (numberValue < options.min) {
    throw new TypeError(`${name} must be >= ${options.min}`);
  }
  if (options.max !== undefined && numberValue > options.max) {
    throw new TypeError(`${name} must be <= ${options.max}`);
  }
  return numberValue;
}

function readOptionalString(
  args: Record<string, unknown>,
  name: string,
  defaultValue: string,
): string {
  const value = args[name];
  if (value === undefined) return defaultValue;
  if (typeof value !== "string" || value.length === 0) {
    throw new TypeError(`${name} must be a non-empty string`);
  }
  return value;
}

function readOptionalStringArgument(
  args: Record<string, unknown>,
  name: string,
): string | undefined {
  const value = args[name];
  if (value === undefined) return undefined;
  if (typeof value !== "string" || value.length === 0) {
    throw new TypeError(`${name} must be a non-empty string`);
  }
  return value;
}

function readRequiredString(
  args: Record<string, unknown>,
  name: string,
): string {
  const value = args[name];
  if (typeof value !== "string" || value.length === 0) {
    throw new TypeError(`${name} must be a non-empty string`);
  }
  return value;
}
