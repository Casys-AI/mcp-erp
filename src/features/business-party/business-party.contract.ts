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

const PARTY_KIND_SCHEMA = {
  type: "string",
  enum: ["customer", "supplier"],
  default: "customer",
  description: "Whether the party is a customer or supplier.",
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

export const BUSINESS_PARTY_TOOLS: readonly ErpToolDefinition[] = [
  {
    name: "erp.business_party_list",
    description:
      "List business parties (customers or suppliers) in normalized form, across ERPNext or Dolibarr.",
    inputSchema: {
      type: "object",
      properties: {
        erpType: ERP_TYPE_SCHEMA,
        partyKind: PARTY_KIND_SCHEMA,
        ...PAGINATION_PROPS,
      },
      required: ["erpType"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: "erp.business_party_get",
    description:
      "Get one business party (customer or supplier) by native ID in normalized form.",
    inputSchema: {
      type: "object",
      properties: {
        erpType: ERP_TYPE_SCHEMA,
        nativeId: NATIVE_ID_SCHEMA,
        partyKind: PARTY_KIND_SCHEMA,
      },
      required: ["erpType", "nativeId"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true },
  },
];
