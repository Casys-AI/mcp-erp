import type { ErpToolDefinition } from "../../domain/adapter.ts";

const ERP_TYPE_SCHEMA = {
  type: "string",
  enum: ["erpnext", "dolibarr"],
  description: "ERP backend to target.",
};

const NATIVE_ID_SCHEMA = {
  type: "string",
  minLength: 1,
  description: "Native document identifier (ERPNext `name`, Dolibarr `id`).",
};

const LINES_SCHEMA = {
  type: "array",
  minItems: 1,
  items: {
    type: "object",
    properties: {
      sku: {
        type: "string",
        minLength: 1,
        description: "Product SKU (item_code / ref).",
      },
      qty: {
        type: "number",
        exclusiveMinimum: 0,
        description: "Quantity (must be > 0).",
      },
      unitPrice: {
        type: "number",
        minimum: 0,
        description: "Unit price (must be >= 0).",
      },
      description: {
        type: "string",
        description: "Optional line description.",
      },
    },
    required: ["sku", "qty", "unitPrice"],
    additionalProperties: false,
  },
  description: "Line items (min 1).",
};

const SUBMIT_MODE_SCHEMA = {
  type: "string",
  enum: ["preview", "commit"],
  description:
    "Required. 'preview' resolves the native plan without writing; 'commit' performs the transition.",
};

export const SALES_ORDER_TOOLS: readonly ErpToolDefinition[] = [
  {
    name: "erp.sales_order_get",
    description: "Get one sales order by native ID in normalized form.",
    inputSchema: {
      type: "object",
      properties: {
        erpType: ERP_TYPE_SCHEMA,
        nativeId: NATIVE_ID_SCHEMA,
      },
      required: ["erpType", "nativeId"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: "erp.sales_order_create",
    description:
      "Create a sales order (draft) in normalized form. mode 'preview' validates without writing; 'commit' writes.",
    inputSchema: {
      type: "object",
      properties: {
        erpType: ERP_TYPE_SCHEMA,
        mode: {
          type: "string",
          enum: ["preview", "commit"],
          description:
            "Required. 'preview' resolves the payload without writing; 'commit' writes.",
        },
        customerId: {
          type: "string",
          minLength: 1,
          description:
            "Customer identifier (ERPNext Customer name, Dolibarr socid).",
        },
        lines: LINES_SCHEMA,
        date: {
          type: "string",
          description:
            "Document date (YYYY-MM-DD). Defaults to today when omitted.",
        },
        deliveryDate: {
          type: "string",
          description:
            "Delivery date (YYYY-MM-DD). Required by ERPNext; optional on Dolibarr.",
        },
      },
      required: ["erpType", "mode", "customerId", "lines"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: false },
  },
  {
    name: "erp.sales_order_submit",
    description:
      "Submit a sales order (draft → submitted). Transitions the document from draft (docstatus 0 / statut 0) to submitted (ERPNext docstatus 1) or validated (Dolibarr statut 1). mode 'preview' resolves the native plan without any HTTP call; mode 'commit' performs the transition and the result carries a normalized lifecycleState.",
    inputSchema: {
      type: "object",
      properties: {
        erpType: ERP_TYPE_SCHEMA,
        mode: SUBMIT_MODE_SCHEMA,
        nativeId: NATIVE_ID_SCHEMA,
      },
      required: ["erpType", "mode", "nativeId"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: false },
  },
];
