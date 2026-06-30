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

const PAGINATION_PROPS = {
  limit: { type: "integer", minimum: 1, maximum: 100, default: 20 },
  page: {
    type: "integer",
    minimum: 0,
    default: 0,
    description: "Page index (Dolibarr) or limitStart offset (ERPNext).",
  },
};

export const PRODUCT_TOOLS: readonly ErpToolDefinition[] = [
  {
    name: "erp.catalog_item_list",
    description:
      "List catalog items (products / ERPNext Items) in normalized form.",
    inputSchema: {
      type: "object",
      properties: {
        erpType: ERP_TYPE_SCHEMA,
        ...PAGINATION_PROPS,
      },
      required: ["erpType"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: "erp.catalog_item_get",
    description: "Get one catalog item by native ID in normalized form.",
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
    name: "erp.product_create",
    description:
      "Create a catalog item (product/service) in normalized form. mode 'preview' validates without writing; 'commit' writes.",
    inputSchema: {
      type: "object",
      properties: {
        erpType: ERP_TYPE_SCHEMA,
        mode: { type: "string", enum: ["preview", "commit"] },
        name: { type: "string", minLength: 1 },
        sku: { type: "string", minLength: 1 },
        kind: {
          type: "string",
          enum: ["product", "service"],
          default: "product",
        },
        unitPrice: { type: "number", minimum: 0 },
        uom: { type: "string", minLength: 1 },
      },
      required: ["erpType", "mode", "name", "sku"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: false },
  },
  {
    name: "erp.product_update",
    description:
      "Update a catalog item (product/service) fields in normalized form. mode 'preview' validates without writing; 'commit' writes. Only provided optional fields are sent (partial update). SKU (item_code) is immutable and cannot be changed.",
    inputSchema: {
      type: "object",
      properties: {
        erpType: ERP_TYPE_SCHEMA,
        mode: { type: "string", enum: ["preview", "commit"] },
        nativeId: NATIVE_ID_SCHEMA,
        name: { type: "string", minLength: 1 },
        unitPrice: { type: "number", minimum: 0 },
        uom: { type: "string", minLength: 1 },
      },
      required: ["erpType", "mode", "nativeId"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: false },
  },
];
