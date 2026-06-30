import type { ErpToolDefinition } from "../../../domain/adapter.ts";
import {
  ERP_DETAIL_META,
  ERP_DIAGNOSTICS_META,
  ERP_DOCLIST_META,
  ERP_INVOICE_META,
} from "../../viewers/viewers.ts";

export const DOLIBARR_INVOICE_STATUSES = [
  "draft",
  "unpaid",
  "paid",
  "cancelled",
] as const;

export const DOLIBARR_ORDER_STATUS_CODES: Record<string, number> = {
  canceled: -1,
  draft: 0,
  validated: 1,
  shipment_on_process: 2,
  closed: 3,
};

export const DOLIBARR_PROPOSAL_STATUS_CODES: Record<string, number> = {
  canceled: -1,
  draft: 0,
  validated: 1,
  signed: 2,
  not_signed: 3,
  billed: 4,
};

export const DOLIBARR_TOOLS: readonly ErpToolDefinition[] = [
  {
    name: "dolibarr.ping",
    description: "Smoke-test the configured Dolibarr connection.",
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
    name: "dolibarr.thirdparty_list",
    description: "List Dolibarr thirdparties through the REST API.",
    inputSchema: {
      type: "object",
      properties: {
        limit: {
          type: "integer",
          minimum: 1,
          maximum: 100,
          default: 20,
        },
        page: {
          type: "integer",
          minimum: 0,
          default: 0,
        },
        mode: {
          type: "string",
          enum: ["customer", "supplier", "prospect"],
        },
        nameLike: {
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
  {
    name: "dolibarr.thirdparty_get",
    description: "Get one Dolibarr thirdparty by numeric id.",
    inputSchema: {
      type: "object",
      properties: {
        id: {
          type: "integer",
          minimum: 1,
        },
      },
      required: ["id"],
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: true,
    },
  },
  {
    name: "dolibarr.product_list",
    description: "List Dolibarr products/services through the REST API.",
    inputSchema: {
      type: "object",
      properties: {
        limit: {
          type: "integer",
          minimum: 1,
          maximum: 100,
          default: 20,
        },
        page: {
          type: "integer",
          minimum: 0,
          default: 0,
        },
        type: {
          type: "integer",
          enum: [0, 1],
          description:
            "Dolibarr product type: 0 = product, 1 = service. Translated to REST mode=1/2.",
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
    name: "dolibarr.product_get",
    description: "Get one Dolibarr product/service by numeric id.",
    inputSchema: {
      type: "object",
      properties: {
        id: {
          type: "integer",
          minimum: 1,
        },
      },
      required: ["id"],
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: true,
    },
  },
  {
    name: "dolibarr.invoice_list",
    description: "List Dolibarr customer invoices through the REST API.",
    inputSchema: {
      type: "object",
      properties: {
        limit: {
          type: "integer",
          minimum: 1,
          maximum: 100,
          default: 20,
        },
        page: {
          type: "integer",
          minimum: 0,
          default: 0,
        },
        thirdpartyId: {
          type: "integer",
          minimum: 1,
        },
        status: {
          type: "string",
          enum: [...DOLIBARR_INVOICE_STATUSES],
        },
        dateStart: {
          type: "string",
          pattern: "^\\d{4}-\\d{2}-\\d{2}$",
        },
        dateEnd: {
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
    name: "dolibarr.invoice_get",
    description: "Get one Dolibarr customer invoice by numeric id.",
    inputSchema: {
      type: "object",
      properties: {
        id: {
          type: "integer",
          minimum: 1,
        },
      },
      required: ["id"],
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: true,
    },
    _meta: ERP_INVOICE_META,
  },
  {
    name: "dolibarr.order_list",
    description: "List Dolibarr customer orders through the REST API.",
    inputSchema: {
      type: "object",
      properties: {
        limit: {
          type: "integer",
          minimum: 1,
          maximum: 100,
          default: 20,
        },
        page: {
          type: "integer",
          minimum: 0,
          default: 0,
        },
        thirdpartyId: {
          type: "integer",
          minimum: 1,
        },
        status: {
          type: "string",
          enum: Object.keys(DOLIBARR_ORDER_STATUS_CODES),
        },
        dateStart: {
          type: "string",
          pattern: "^\\d{4}-\\d{2}-\\d{2}$",
        },
        dateEnd: {
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
    name: "dolibarr.order_get",
    description: "Get one Dolibarr customer order by numeric id.",
    inputSchema: {
      type: "object",
      properties: {
        id: {
          type: "integer",
          minimum: 1,
        },
      },
      required: ["id"],
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: true,
    },
    _meta: ERP_DETAIL_META,
  },
  {
    name: "dolibarr.proposal_list",
    description: "List Dolibarr commercial proposals through the REST API.",
    inputSchema: {
      type: "object",
      properties: {
        limit: {
          type: "integer",
          minimum: 1,
          maximum: 100,
          default: 20,
        },
        page: {
          type: "integer",
          minimum: 0,
          default: 0,
        },
        thirdpartyId: {
          type: "integer",
          minimum: 1,
        },
        status: {
          type: "string",
          enum: Object.keys(DOLIBARR_PROPOSAL_STATUS_CODES),
        },
        dateStart: {
          type: "string",
          pattern: "^\\d{4}-\\d{2}-\\d{2}$",
        },
        dateEnd: {
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
    name: "dolibarr.proposal_get",
    description: "Get one Dolibarr commercial proposal by numeric id.",
    inputSchema: {
      type: "object",
      properties: {
        id: {
          type: "integer",
          minimum: 1,
        },
      },
      required: ["id"],
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: true,
    },
    _meta: ERP_DETAIL_META,
  },
  {
    name: "dolibarr.payment_list",
    description:
      "List Dolibarr payment records (règlements) through the REST API.",
    inputSchema: {
      type: "object",
      properties: {
        limit: {
          type: "integer",
          minimum: 1,
          maximum: 100,
          default: 20,
        },
        page: {
          type: "integer",
          minimum: 0,
          default: 0,
        },
        dateStart: {
          type: "string",
          pattern: "^\\d{4}-\\d{2}-\\d{2}$",
        },
        dateEnd: {
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
    name: "dolibarr.payment_get",
    description: "Get one Dolibarr payment record by numeric id.",
    inputSchema: {
      type: "object",
      properties: {
        id: {
          type: "integer",
          minimum: 1,
        },
      },
      required: ["id"],
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: true,
    },
  },
  {
    name: "dolibarr.stockmovement_list",
    description:
      "List Dolibarr stock movement records through the REST API. Read-only; no individual stockmovement get.",
    inputSchema: {
      type: "object",
      properties: {
        limit: {
          type: "integer",
          minimum: 1,
          maximum: 100,
          default: 20,
        },
        page: {
          type: "integer",
          minimum: 0,
          default: 0,
        },
        fkProduct: {
          type: "integer",
          minimum: 1,
        },
        dateStart: {
          type: "string",
          pattern: "^\\d{4}-\\d{2}-\\d{2}$",
        },
        dateEnd: {
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
];

function group(names: readonly string[]): readonly ErpToolDefinition[] {
  return DOLIBARR_TOOLS.filter((tool) => names.includes(tool.name));
}

export const DOLIBARR_TOOL_GROUPS = {
  diagnostics: group(["dolibarr.ping"]),
  businessParties: group([
    "dolibarr.thirdparty_list",
    "dolibarr.thirdparty_get",
  ]),
  catalog: group(["dolibarr.product_list", "dolibarr.product_get"]),
  salesDocuments: group([
    "dolibarr.invoice_list",
    "dolibarr.invoice_get",
    "dolibarr.order_list",
    "dolibarr.order_get",
    "dolibarr.proposal_list",
    "dolibarr.proposal_get",
  ]),
  accounting: group(["dolibarr.payment_list", "dolibarr.payment_get"]),
  inventory: group(["dolibarr.stockmovement_list"]),
  writes: group([
    "dolibarr.thirdparty_create",
    "dolibarr.thirdparty_update",
    "dolibarr.product_create",
    "dolibarr.product_update",
    "dolibarr.supplier_create",
    "dolibarr.supplier_update",
  ]),
} satisfies Record<string, readonly ErpToolDefinition[]>;
