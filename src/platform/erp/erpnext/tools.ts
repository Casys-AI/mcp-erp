import type { ErpToolDefinition } from "../../../domain/adapter.ts";
import {
  ERP_DETAIL_META,
  ERP_DIAGNOSTICS_META,
  ERP_DOCLIST_META,
  ERP_INVOICE_META,
} from "../../viewers/viewers.ts";

export const CUSTOMER_FIELDS = [
  "name",
  "customer_name",
  "customer_type",
  "customer_group",
  "territory",
  "disabled",
  "modified",
] as const;

export const ITEM_FIELDS = [
  "name",
  "item_code",
  "item_name",
  "item_group",
  "stock_uom",
  "is_stock_item",
  "standard_rate",
  "disabled",
  "modified",
] as const;

export const SALES_INVOICE_FIELDS = [
  "name",
  "customer",
  "posting_date",
  "due_date",
  "status",
  "grand_total",
  "outstanding_amount",
  "currency",
  "modified",
] as const;

export const SALES_ORDER_FIELDS = [
  "name",
  "customer",
  "transaction_date",
  "delivery_date",
  "status",
  "grand_total",
  "currency",
  "modified",
] as const;

export const QUOTATION_FIELDS = [
  "name",
  "quotation_to",
  "party_name",
  "transaction_date",
  "valid_till",
  "status",
  "grand_total",
  "currency",
  "modified",
] as const;

export const SUPPLIER_FIELDS = [
  "name",
  "supplier_name",
  "supplier_type",
  "supplier_group",
  "country",
  "disabled",
  "modified",
] as const;

export const PAYMENT_ENTRY_FIELDS = [
  "name",
  "payment_type",
  "party_type",
  "party",
  "posting_date",
  "paid_amount",
  "paid_from_account_currency",
  "paid_to_account_currency",
  "status",
  "modified",
] as const;

export const BIN_FIELDS = [
  "name",
  "item_code",
  "warehouse",
  "actual_qty",
  "reserved_qty",
  "ordered_qty",
  "modified",
] as const;

export const ERPNEXT_TOOLS: readonly ErpToolDefinition[] = [
  {
    name: "erpnext.ping",
    description:
      "Smoke-test the configured ERPNext connection (returns the apiUrl).",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: true,
    },
    _meta: ERP_DIAGNOSTICS_META,
  },
  {
    name: "erpnext.customer_list",
    description: "List ERPNext Customer records through Frappe REST.",
    inputSchema: {
      type: "object",
      properties: {
        limit: {
          type: "integer",
          minimum: 1,
          maximum: 100,
          default: 20,
        },
        limitStart: {
          type: "integer",
          minimum: 0,
          default: 0,
        },
        orderBy: {
          type: "string",
          minLength: 1,
          default: "modified desc",
        },
        customerGroup: {
          type: "string",
          minLength: 1,
        },
        territory: {
          type: "string",
          minLength: 1,
        },
        includeDisabled: {
          type: "boolean",
          default: false,
        },
      },
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: true,
    },
    _meta: ERP_DOCLIST_META,
  },
  {
    name: "erpnext.customer_get",
    description: "Get one ERPNext Customer record by name.",
    inputSchema: {
      type: "object",
      properties: {
        name: {
          type: "string",
          minLength: 1,
        },
      },
      required: ["name"],
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: true,
    },
  },
  {
    name: "erpnext.item_list",
    description: "List ERPNext Item records through Frappe REST.",
    inputSchema: {
      type: "object",
      properties: {
        limit: {
          type: "integer",
          minimum: 1,
          maximum: 100,
          default: 20,
        },
        limitStart: {
          type: "integer",
          minimum: 0,
          default: 0,
        },
        orderBy: {
          type: "string",
          minLength: 1,
          default: "modified desc",
        },
        itemGroup: {
          type: "string",
          minLength: 1,
        },
        isStockItem: {
          type: "boolean",
        },
        includeDisabled: {
          type: "boolean",
          default: false,
        },
      },
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: true,
    },
    _meta: ERP_DOCLIST_META,
  },
  {
    name: "erpnext.item_get",
    description: "Get one ERPNext Item record by name or item_code.",
    inputSchema: {
      type: "object",
      properties: {
        name: {
          type: "string",
          minLength: 1,
        },
      },
      required: ["name"],
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: true,
    },
  },
  {
    name: "erpnext.sales_invoice_list",
    description: "List ERPNext Sales Invoice records through Frappe REST.",
    inputSchema: {
      type: "object",
      properties: {
        limit: {
          type: "integer",
          minimum: 1,
          maximum: 100,
          default: 20,
        },
        limitStart: {
          type: "integer",
          minimum: 0,
          default: 0,
        },
        orderBy: {
          type: "string",
          minLength: 1,
          default: "modified desc",
        },
        customer: {
          type: "string",
          minLength: 1,
        },
        status: {
          type: "string",
          minLength: 1,
        },
        dateFrom: {
          type: "string",
          pattern: "^\\d{4}-\\d{2}-\\d{2}$",
        },
        dateTo: {
          type: "string",
          pattern: "^\\d{4}-\\d{2}-\\d{2}$",
        },
      },
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: true,
    },
    _meta: ERP_DOCLIST_META,
  },
  {
    name: "erpnext.sales_invoice_get",
    description:
      "Get one ERPNext Sales Invoice by name, including its native line items.",
    inputSchema: {
      type: "object",
      properties: {
        name: {
          type: "string",
          minLength: 1,
        },
      },
      required: ["name"],
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: true,
    },
    _meta: ERP_INVOICE_META,
  },
  {
    name: "erpnext.sales_order_list",
    description: "List ERPNext Sales Order records through Frappe REST.",
    inputSchema: {
      type: "object",
      properties: {
        limit: {
          type: "integer",
          minimum: 1,
          maximum: 100,
          default: 20,
        },
        limitStart: {
          type: "integer",
          minimum: 0,
          default: 0,
        },
        orderBy: {
          type: "string",
          minLength: 1,
          default: "modified desc",
        },
        customer: {
          type: "string",
          minLength: 1,
        },
        status: {
          type: "string",
          minLength: 1,
        },
        dateFrom: {
          type: "string",
          pattern: "^\\d{4}-\\d{2}-\\d{2}$",
        },
        dateTo: {
          type: "string",
          pattern: "^\\d{4}-\\d{2}-\\d{2}$",
        },
      },
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: true,
    },
    _meta: ERP_DOCLIST_META,
  },
  {
    name: "erpnext.sales_order_get",
    description:
      "Get one ERPNext Sales Order by name, including its native line items.",
    inputSchema: {
      type: "object",
      properties: {
        name: {
          type: "string",
          minLength: 1,
        },
      },
      required: ["name"],
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: true,
    },
    _meta: ERP_DETAIL_META,
  },
  {
    name: "erpnext.quotation_list",
    description: "List ERPNext Quotation records through Frappe REST.",
    inputSchema: {
      type: "object",
      properties: {
        limit: {
          type: "integer",
          minimum: 1,
          maximum: 100,
          default: 20,
        },
        limitStart: {
          type: "integer",
          minimum: 0,
          default: 0,
        },
        orderBy: {
          type: "string",
          minLength: 1,
          default: "modified desc",
        },
        partyName: {
          type: "string",
          minLength: 1,
        },
        quotationTo: {
          type: "string",
          minLength: 1,
        },
        status: {
          type: "string",
          minLength: 1,
        },
        dateFrom: {
          type: "string",
          pattern: "^\\d{4}-\\d{2}-\\d{2}$",
        },
        dateTo: {
          type: "string",
          pattern: "^\\d{4}-\\d{2}-\\d{2}$",
        },
      },
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: true,
    },
    _meta: ERP_DOCLIST_META,
  },
  {
    name: "erpnext.quotation_get",
    description:
      "Get one ERPNext Quotation by name, including its native line items.",
    inputSchema: {
      type: "object",
      properties: {
        name: {
          type: "string",
          minLength: 1,
        },
      },
      required: ["name"],
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: true,
    },
    _meta: ERP_DETAIL_META,
  },
  {
    name: "erpnext.supplier_list",
    description: "List ERPNext Supplier records through Frappe REST.",
    inputSchema: {
      type: "object",
      properties: {
        limit: {
          type: "integer",
          minimum: 1,
          maximum: 100,
          default: 20,
        },
        limitStart: {
          type: "integer",
          minimum: 0,
          default: 0,
        },
        orderBy: {
          type: "string",
          minLength: 1,
          default: "modified desc",
        },
        supplierGroup: {
          type: "string",
          minLength: 1,
        },
        supplierType: {
          type: "string",
          minLength: 1,
        },
        includeDisabled: {
          type: "boolean",
          default: false,
        },
      },
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: true,
    },
    _meta: ERP_DOCLIST_META,
  },
  {
    name: "erpnext.supplier_get",
    description: "Get one ERPNext Supplier record by name.",
    inputSchema: {
      type: "object",
      properties: {
        name: {
          type: "string",
          minLength: 1,
        },
      },
      required: ["name"],
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: true,
    },
  },
  {
    name: "erpnext.payment_entry_list",
    description: "List ERPNext Payment Entry records through Frappe REST.",
    inputSchema: {
      type: "object",
      properties: {
        limit: {
          type: "integer",
          minimum: 1,
          maximum: 100,
          default: 20,
        },
        limitStart: {
          type: "integer",
          minimum: 0,
          default: 0,
        },
        orderBy: {
          type: "string",
          minLength: 1,
          default: "modified desc",
        },
        partyType: {
          type: "string",
          minLength: 1,
        },
        party: {
          type: "string",
          minLength: 1,
        },
        paymentType: {
          type: "string",
          minLength: 1,
        },
        dateFrom: {
          type: "string",
          pattern: "^\\d{4}-\\d{2}-\\d{2}$",
        },
        dateTo: {
          type: "string",
          pattern: "^\\d{4}-\\d{2}-\\d{2}$",
        },
      },
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: true,
    },
    _meta: ERP_DOCLIST_META,
  },
  {
    name: "erpnext.payment_entry_get",
    description: "Get one ERPNext Payment Entry by name.",
    inputSchema: {
      type: "object",
      properties: {
        name: {
          type: "string",
          minLength: 1,
        },
      },
      required: ["name"],
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: true,
    },
  },
  {
    name: "erpnext.bin_list",
    description:
      "List ERPNext Bin (stock level) records through Frappe REST. Read-only; no individual Bin get (name is not a natural key).",
    inputSchema: {
      type: "object",
      properties: {
        limit: {
          type: "integer",
          minimum: 1,
          maximum: 100,
          default: 20,
        },
        limitStart: {
          type: "integer",
          minimum: 0,
          default: 0,
        },
        orderBy: {
          type: "string",
          minLength: 1,
          default: "modified desc",
        },
        itemCode: {
          type: "string",
          minLength: 1,
        },
        warehouse: {
          type: "string",
          minLength: 1,
        },
      },
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: true,
    },
    _meta: ERP_DOCLIST_META,
  },
];

function group(names: readonly string[]): readonly ErpToolDefinition[] {
  return ERPNEXT_TOOLS.filter((tool) => names.includes(tool.name));
}

export const ERPNEXT_TOOL_GROUPS = {
  diagnostics: group(["erpnext.ping"]),
  businessParties: group([
    "erpnext.customer_list",
    "erpnext.customer_get",
  ]),
  catalog: group(["erpnext.item_list", "erpnext.item_get"]),
  salesDocuments: group([
    "erpnext.sales_invoice_list",
    "erpnext.sales_invoice_get",
    "erpnext.sales_order_list",
    "erpnext.sales_order_get",
    "erpnext.quotation_list",
    "erpnext.quotation_get",
  ]),
  suppliers: group(["erpnext.supplier_list", "erpnext.supplier_get"]),
  accounting: group([
    "erpnext.payment_entry_list",
    "erpnext.payment_entry_get",
  ]),
  inventory: group(["erpnext.bin_list"]),
  writes: group([
    "erpnext.customer_create",
    "erpnext.customer_update",
    "erpnext.item_create",
    "erpnext.item_update",
    "erpnext.supplier_create",
    "erpnext.supplier_update",
  ]),
} satisfies Record<string, readonly ErpToolDefinition[]>;
