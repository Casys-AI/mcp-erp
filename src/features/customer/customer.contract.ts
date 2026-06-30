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

export const CUSTOMER_TOOLS: readonly ErpToolDefinition[] = [
  {
    name: "erp.customer_create",
    description:
      "Create a customer (business party) in normalized form. mode 'preview' validates without writing; 'commit' writes.",
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
        name: { type: "string", minLength: 1 },
        kind: {
          type: "string",
          enum: ["company", "individual"],
          default: "company",
        },
        taxId: { type: "string", minLength: 1 },
        externalRef: { type: "string", minLength: 1 },
        email: { type: "string", minLength: 1 },
        phone: { type: "string", minLength: 1 },
        currency: { type: "string", minLength: 1 },
      },
      required: ["erpType", "mode", "name"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: false },
  },
  {
    name: "erp.customer_update",
    description:
      "Update a customer (business party) fields in normalized form. mode 'preview' validates without writing; 'commit' writes. Only provided optional fields are sent (partial update).",
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
        nativeId: NATIVE_ID_SCHEMA,
        name: { type: "string", minLength: 1 },
        taxId: { type: "string", minLength: 1 },
        externalRef: { type: "string", minLength: 1 },
        email: { type: "string", minLength: 1 },
        phone: { type: "string", minLength: 1 },
        currency: { type: "string", minLength: 1 },
      },
      required: ["erpType", "mode", "nativeId"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: false },
  },
];
