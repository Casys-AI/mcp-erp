/**
 * ERPNext adapter — Frappe-flavored REST integration.
 *
 * v0.1 starts with a tiny read-only ERPNext surface. Keep this adapter
 * provider-native first; normalized cross-ERP tools come only after the
 * ERPNext/Dolibarr mapping is proven.
 *
 * Roadmap (v0.1 — see verdict from 2026-05-09 brainstorm):
 *   - 5–8 tools max for v0.1: health, customer list/get, item list/get,
 *     sales invoice list/get
 *   - Reuse Frappe-client patterns from `mcp-erpnext` (error parsing,
 *     normalised pagination) but with **explicit** `ErpConnection` —
 *     not env-based singletons
 *   - Normalised errors: no silent fallback
 *
 * @module @casys/mcp-erp/adapters/erpnext
 */

import type { ErpConnection } from "../connection.ts";
import {
  type ErpAdapter,
  type ErpToolCallContext,
  type ErpToolCallResult,
  type ErpToolDefinition,
  UnknownToolError,
} from "../adapter.ts";
import {
  ERP_DIAGNOSTICS_META,
  ERP_DOCLIST_META,
  ERP_INVOICE_META,
} from "../viewers.ts";

type ErpnextConnection = Extract<ErpConnection, { erpType: "erpnext" }>;

type FrappeDoc = Record<string, unknown>;
type FrappeFilter = readonly [
  field: string,
  operator: "=" | ">=" | "<=",
  value: string | number,
];

interface FrappeListResponse<T extends FrappeDoc> {
  readonly data?: T[];
}

interface FrappeDocResponse<T extends FrappeDoc> {
  readonly data: T;
}

interface FrappeListOptions {
  readonly fields?: readonly string[];
  readonly filters?: readonly FrappeFilter[];
  readonly limitPageLength?: number;
  readonly limitStart?: number;
  readonly orderBy?: string;
}

interface FrappeRequestOptions {
  readonly signal?: AbortSignal;
}

const CUSTOMER_FIELDS = [
  "name",
  "customer_name",
  "customer_type",
  "customer_group",
  "territory",
  "disabled",
  "modified",
] as const;

const ITEM_FIELDS = [
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

const SALES_INVOICE_FIELDS = [
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

const SALES_ORDER_FIELDS = [
  "name",
  "customer",
  "transaction_date",
  "delivery_date",
  "status",
  "grand_total",
  "currency",
  "modified",
] as const;

const QUOTATION_FIELDS = [
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

const TOOLS: readonly ErpToolDefinition[] = [
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
  },
];

export class FrappeApiError extends Error {
  override readonly name = "FrappeApiError";

  constructor(
    message: string,
    public readonly status: number,
    public readonly body: unknown,
  ) {
    super(message);
  }
}

class FrappeRestClient {
  private readonly baseUrl: string;
  private readonly authHeader: string;

  constructor(connection: ErpnextConnection) {
    this.baseUrl = connection.apiUrl.replace(/\/+$/, "");
    this.authHeader = `token ${connection.apiKey}:${connection.apiSecret}`;
  }

  async list<T extends FrappeDoc>(
    doctype: string,
    options: FrappeListOptions = {},
    requestOptions: FrappeRequestOptions = {},
  ): Promise<T[]> {
    const resourcePath = `/api/resource/${encodeURIComponent(doctype)}`;
    const params = new URLSearchParams();

    if (options.fields && options.fields.length > 0) {
      params.set("fields", JSON.stringify(options.fields));
    }
    if (options.filters && options.filters.length > 0) {
      params.set("filters", JSON.stringify(options.filters));
    }
    if (options.limitPageLength !== undefined) {
      params.set("limit_page_length", String(options.limitPageLength));
    }
    if (options.limitStart !== undefined) {
      params.set("limit_start", String(options.limitStart));
    }
    if (options.orderBy) {
      params.set("order_by", options.orderBy);
    }

    const query = params.toString() ? `?${params.toString()}` : "";
    const result = await this.request<FrappeListResponse<T>>(
      "GET",
      `${resourcePath}${query}`,
      resourcePath,
      requestOptions,
    );
    if (!result || !Array.isArray(result.data)) {
      throw new FrappeApiError(
        `ERPNext GET ${resourcePath} failed: malformed response: data must be an array`,
        200,
        result,
      );
    }
    return result.data;
  }

  async get<T extends FrappeDoc>(
    doctype: string,
    name: string,
    requestOptions: FrappeRequestOptions = {},
  ): Promise<T> {
    const resourcePath = `/api/resource/${encodeURIComponent(doctype)}/${
      encodeURIComponent(name)
    }`;
    const result = await this.request<FrappeDocResponse<T>>(
      "GET",
      resourcePath,
      resourcePath,
      requestOptions,
    );
    if (!result || !isRecord(result.data)) {
      throw new FrappeApiError(
        `ERPNext GET ${resourcePath} failed: malformed response: data must be an object`,
        200,
        result,
      );
    }
    return result.data;
  }

  private async request<T>(
    method: string,
    path: string,
    errorPath: string,
    options: FrappeRequestOptions,
  ): Promise<T> {
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}${path}`, {
        method,
        headers: {
          "accept": "application/json",
          "authorization": this.authHeader,
        },
        signal: options.signal,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new FrappeApiError(
        `ERPNext ${method} ${errorPath} failed: ${message}`,
        0,
        null,
      );
    }

    const body = await readResponseBody(response);
    if (!response.ok) {
      throw new FrappeApiError(
        `ERPNext ${method} ${errorPath} failed: ${
          extractFrappeErrorMessage(body, response.statusText)
        }`,
        response.status,
        body,
      );
    }

    return body as T;
  }
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

function readOptionalBoolean(
  args: Record<string, unknown>,
  name: string,
  defaultValue: boolean,
): boolean {
  const value = args[name];
  if (value === undefined) return defaultValue;
  if (typeof value !== "boolean") {
    throw new TypeError(`${name} must be a boolean`);
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function readResponseBody(response: Response): Promise<unknown> {
  const rawText = await response.text();
  if (rawText.length === 0) return null;

  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    return rawText;
  }

  try {
    return JSON.parse(rawText);
  } catch {
    return rawText;
  }
}

function extractFrappeErrorMessage(
  body: unknown,
  fallback: string,
): string {
  if (typeof body === "string" && body.length > 0) {
    return body.slice(0, 200);
  }
  if (body && typeof body === "object") {
    const record = body as Record<string, unknown>;
    if (typeof record.message === "string" && record.message.length > 0) {
      return record.message;
    }
    if (typeof record.exc_type === "string" && record.exc_type.length > 0) {
      return record.exc_type;
    }
  }
  return fallback || "HTTP request failed";
}

export function getErpnextToolDefinitions(): ErpToolDefinition[] {
  return TOOLS.map((tool) => ({
    ...tool,
    inputSchema: structuredClone(tool.inputSchema),
    ...(tool.outputSchema
      ? { outputSchema: structuredClone(tool.outputSchema) }
      : {}),
    ...(tool.annotations
      ? { annotations: structuredClone(tool.annotations) }
      : {}),
    ...(tool._meta ? { _meta: structuredClone(tool._meta) } : {}),
  }));
}

export function createErpnextAdapter(
  connection: ErpnextConnection,
): ErpAdapter {
  const client = new FrappeRestClient(connection);

  return {
    erpType: "erpnext",

    tools(): ErpToolDefinition[] {
      return getErpnextToolDefinitions();
    },

    async callTool(
      name: string,
      args: Record<string, unknown>,
      _ctx: ErpToolCallContext,
    ): Promise<ErpToolCallResult> {
      if (name === "erpnext.ping") {
        return await Promise.resolve({
          content: {
            ok: true,
            erpType: "erpnext",
            apiUrl: connection.apiUrl,
            sandbox: connection.sandbox,
            tenantId: _ctx.tenantId,
            actorSubject: _ctx.actorSubject,
            toolCount: TOOLS.length,
            toolNames: TOOLS.map((tool) => tool.name),
          },
          summary:
            `ERPNext connection check — apiUrl=${connection.apiUrl} sandbox=${connection.sandbox}`,
        });
      }
      if (name === "erpnext.customer_list") {
        const limit = readOptionalInteger(args, "limit", 20, {
          min: 1,
          max: 100,
        });
        const limitStart = readOptionalInteger(args, "limitStart", 0, {
          min: 0,
        });
        const orderBy = readOptionalString(
          args,
          "orderBy",
          "modified desc",
        );
        const filters: FrappeFilter[] = [];
        if (!readOptionalBoolean(args, "includeDisabled", false)) {
          filters.push(["disabled", "=", 0]);
        }
        const customerGroup = readOptionalStringArgument(args, "customerGroup");
        if (customerGroup) {
          filters.push(["customer_group", "=", customerGroup]);
        }
        const territory = readOptionalStringArgument(args, "territory");
        if (territory) {
          filters.push(["territory", "=", territory]);
        }
        const customers = await client.list("Customer", {
          fields: CUSTOMER_FIELDS,
          filters,
          limitPageLength: limit,
          limitStart,
          orderBy,
        }, {
          signal: _ctx.signal,
        });
        return {
          content: {
            doctype: "Customer",
            data: customers,
            _title: "ERPNext Customers",
            _rowAction: {
              toolName: "erpnext.customer_get",
              idField: "name",
              argName: "name",
            },
            customers,
            count: customers.length,
            limit,
            limitStart,
          },
          summary:
            `ERPNext customer_list returned ${customers.length} customer(s)`,
        };
      }
      if (name === "erpnext.customer_get") {
        const customer = await client.get(
          "Customer",
          readRequiredString(
            args,
            "name",
          ),
          { signal: _ctx.signal },
        );
        return {
          content: {
            customer,
          },
          summary: `ERPNext customer_get returned ${
            String(customer.name ?? "customer")
          }`,
        };
      }
      if (name === "erpnext.item_list") {
        const limit = readOptionalInteger(args, "limit", 20, {
          min: 1,
          max: 100,
        });
        const limitStart = readOptionalInteger(args, "limitStart", 0, {
          min: 0,
        });
        const orderBy = readOptionalString(
          args,
          "orderBy",
          "modified desc",
        );
        const filters: FrappeFilter[] = [];
        if (!readOptionalBoolean(args, "includeDisabled", false)) {
          filters.push(["disabled", "=", 0]);
        }
        const itemGroup = readOptionalStringArgument(args, "itemGroup");
        if (itemGroup) {
          filters.push(["item_group", "=", itemGroup]);
        }
        const isStockItem = args.isStockItem;
        if (isStockItem !== undefined) {
          if (typeof isStockItem !== "boolean") {
            throw new TypeError("isStockItem must be a boolean");
          }
          filters.push(["is_stock_item", "=", isStockItem ? 1 : 0]);
        }
        const items = await client.list("Item", {
          fields: ITEM_FIELDS,
          filters,
          limitPageLength: limit,
          limitStart,
          orderBy,
        }, {
          signal: _ctx.signal,
        });
        return {
          content: {
            doctype: "Item",
            data: items,
            _title: "ERPNext Items",
            _rowAction: {
              toolName: "erpnext.item_get",
              idField: "name",
              argName: "name",
            },
            items,
            count: items.length,
            limit,
            limitStart,
          },
          summary: `ERPNext item_list returned ${items.length} item(s)`,
        };
      }
      if (name === "erpnext.item_get") {
        const item = await client.get(
          "Item",
          readRequiredString(args, "name"),
          { signal: _ctx.signal },
        );
        return {
          content: {
            item,
          },
          summary: `ERPNext item_get returned ${String(item.name ?? "item")}`,
        };
      }
      if (name === "erpnext.sales_invoice_list") {
        const limit = readOptionalInteger(args, "limit", 20, {
          min: 1,
          max: 100,
        });
        const limitStart = readOptionalInteger(args, "limitStart", 0, {
          min: 0,
        });
        const orderBy = readOptionalString(
          args,
          "orderBy",
          "modified desc",
        );
        const filters: FrappeFilter[] = [];
        const customer = readOptionalStringArgument(args, "customer");
        if (customer) {
          filters.push(["customer", "=", customer]);
        }
        const status = readOptionalStringArgument(args, "status");
        if (status) {
          filters.push(["status", "=", status]);
        }
        const dateFrom = readOptionalStringArgument(args, "dateFrom");
        if (dateFrom) {
          filters.push(["posting_date", ">=", dateFrom]);
        }
        const dateTo = readOptionalStringArgument(args, "dateTo");
        if (dateTo) {
          filters.push(["posting_date", "<=", dateTo]);
        }
        const salesInvoices = await client.list("Sales Invoice", {
          fields: SALES_INVOICE_FIELDS,
          filters,
          limitPageLength: limit,
          limitStart,
          orderBy,
        }, {
          signal: _ctx.signal,
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
          { signal: _ctx.signal },
        );
        return {
          content: {
            data: salesInvoice,
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
        const orderBy = readOptionalString(
          args,
          "orderBy",
          "modified desc",
        );
        const filters: FrappeFilter[] = [];
        const customer = readOptionalStringArgument(args, "customer");
        if (customer) {
          filters.push(["customer", "=", customer]);
        }
        const status = readOptionalStringArgument(args, "status");
        if (status) {
          filters.push(["status", "=", status]);
        }
        const dateFrom = readOptionalStringArgument(args, "dateFrom");
        if (dateFrom) {
          filters.push(["transaction_date", ">=", dateFrom]);
        }
        const dateTo = readOptionalStringArgument(args, "dateTo");
        if (dateTo) {
          filters.push(["transaction_date", "<=", dateTo]);
        }
        const salesOrders = await client.list("Sales Order", {
          fields: SALES_ORDER_FIELDS,
          filters,
          limitPageLength: limit,
          limitStart,
          orderBy,
        }, {
          signal: _ctx.signal,
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
          { signal: _ctx.signal },
        );
        return {
          content: {
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
        const orderBy = readOptionalString(
          args,
          "orderBy",
          "modified desc",
        );
        const filters: FrappeFilter[] = [];
        const partyName = readOptionalStringArgument(args, "partyName");
        if (partyName) {
          filters.push(["party_name", "=", partyName]);
        }
        const quotationTo = readOptionalStringArgument(args, "quotationTo");
        if (quotationTo) {
          filters.push(["quotation_to", "=", quotationTo]);
        }
        const status = readOptionalStringArgument(args, "status");
        if (status) {
          filters.push(["status", "=", status]);
        }
        const dateFrom = readOptionalStringArgument(args, "dateFrom");
        if (dateFrom) {
          filters.push(["transaction_date", ">=", dateFrom]);
        }
        const dateTo = readOptionalStringArgument(args, "dateTo");
        if (dateTo) {
          filters.push(["transaction_date", "<=", dateTo]);
        }
        const quotations = await client.list("Quotation", {
          fields: QUOTATION_FIELDS,
          filters,
          limitPageLength: limit,
          limitStart,
          orderBy,
        }, {
          signal: _ctx.signal,
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
          { signal: _ctx.signal },
        );
        return {
          content: {
            quotation,
          },
          summary: `ERPNext quotation_get returned ${
            String(quotation.name ?? "quotation")
          }`,
        };
      }
      throw new UnknownToolError("erpnext", name);
    },

    dispose(): void {
      // No persistent resources yet. Wire HTTP keep-alive close here when
      // the real Frappe client lands.
    },
  };
}
