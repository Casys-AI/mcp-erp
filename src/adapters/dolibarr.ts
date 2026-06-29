/**
 * Dolibarr adapter — Dolibarr REST integration.
 *
 * v0.1 starts with a small read-only Dolibarr surface. Keep tools native to
 * Dolibarr modules first; normalized ERP abstractions come later.
 *
 * @module @casys/mcp-erp/adapters/dolibarr
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
  ERP_DETAIL_META,
  ERP_DIAGNOSTICS_META,
  ERP_DOCLIST_META,
  ERP_INVOICE_META,
} from "../viewers.ts";

type DolibarrConnection = Extract<ErpConnection, { erpType: "dolibarr" }>;

const DOLIBARR_INVOICE_STATUSES = [
  "draft",
  "unpaid",
  "paid",
  "cancelled",
] as const;

const DOLIBARR_ORDER_STATUS_CODES: Record<string, number> = {
  canceled: -1,
  draft: 0,
  validated: 1,
  shipment_on_process: 2,
  closed: 3,
};

const DOLIBARR_PROPOSAL_STATUS_CODES: Record<string, number> = {
  canceled: -1,
  draft: 0,
  validated: 1,
  signed: 2,
  not_signed: 3,
  billed: 4,
};

const TOOLS: readonly ErpToolDefinition[] = [
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

export class DolibarrApiError extends Error {
  override readonly name = "DolibarrApiError";

  constructor(
    message: string,
    public readonly status: number,
    public readonly body: unknown,
  ) {
    super(message);
  }
}

class DolibarrRestClient {
  private readonly baseUrl: string;

  constructor(private readonly connection: DolibarrConnection) {
    this.baseUrl = connection.apiUrl.replace(/\/+$/, "");
  }

  async listThirdparties(options: {
    readonly limit: number;
    readonly page: number;
    readonly signal?: AbortSignal;
    readonly filters?: Record<string, string | number>;
  }): Promise<unknown[]> {
    return await this.listResource("thirdparties", options);
  }

  async getThirdparty(id: number, signal?: AbortSignal): Promise<unknown> {
    return await this.getResource("thirdparties", id, signal);
  }

  async listProducts(options: {
    readonly limit: number;
    readonly page: number;
    readonly signal?: AbortSignal;
    readonly filters?: Record<string, string | number>;
  }): Promise<unknown[]> {
    return await this.listResource("products", options);
  }

  async getProduct(id: number, signal?: AbortSignal): Promise<unknown> {
    return await this.getResource("products", id, signal);
  }

  async listInvoices(options: {
    readonly limit: number;
    readonly page: number;
    readonly signal?: AbortSignal;
    readonly filters?: Record<string, string | number>;
  }): Promise<unknown[]> {
    return await this.listResource("invoices", options);
  }

  async getInvoice(id: number, signal?: AbortSignal): Promise<unknown> {
    return await this.getResource("invoices", id, signal);
  }

  async listOrders(options: {
    readonly limit: number;
    readonly page: number;
    readonly signal?: AbortSignal;
    readonly filters?: Record<string, string | number>;
  }): Promise<unknown[]> {
    return await this.listResource("orders", options);
  }

  async getOrder(id: number, signal?: AbortSignal): Promise<unknown> {
    return await this.getResource("orders", id, signal);
  }

  async listProposals(options: {
    readonly limit: number;
    readonly page: number;
    readonly signal?: AbortSignal;
    readonly filters?: Record<string, string | number>;
  }): Promise<unknown[]> {
    return await this.listResource("proposals", options);
  }

  async getProposal(id: number, signal?: AbortSignal): Promise<unknown> {
    return await this.getResource("proposals", id, signal);
  }

  async listPayments(options: {
    readonly limit: number;
    readonly page: number;
    readonly signal?: AbortSignal;
    readonly filters?: Record<string, string | number>;
  }): Promise<unknown[]> {
    const params = new URLSearchParams();
    params.set("limit", String(options.limit));
    params.set("page", String(options.page));
    for (const [key, value] of Object.entries(options.filters ?? {})) {
      params.set(key, String(value));
    }
    const errorPath = "/paiements";
    const result = await this.request<unknown[]>(
      "GET",
      `${errorPath}?${params.toString()}`,
      errorPath,
      options.signal,
    );
    if (!Array.isArray(result)) {
      throw new DolibarrApiError(
        `Dolibarr GET ${errorPath} failed: malformed response: expected array`,
        200,
        result,
      );
    }
    return result;
  }

  async getPayment(id: number, signal?: AbortSignal): Promise<unknown> {
    const errorPath = `/paiements/${id}`;
    return await this.request<unknown>("GET", errorPath, errorPath, signal);
  }

  async listStockmovements(options: {
    readonly limit: number;
    readonly page: number;
    readonly signal?: AbortSignal;
    readonly filters?: Record<string, string | number>;
  }): Promise<unknown[]> {
    const params = new URLSearchParams();
    params.set("limit", String(options.limit));
    params.set("page", String(options.page));
    for (const [key, value] of Object.entries(options.filters ?? {})) {
      params.set(key, String(value));
    }
    const errorPath = "/stockmovements";
    const result = await this.request<unknown[]>(
      "GET",
      `${errorPath}?${params.toString()}`,
      errorPath,
      options.signal,
    );
    if (!Array.isArray(result)) {
      throw new DolibarrApiError(
        `Dolibarr GET ${errorPath} failed: malformed response: expected array`,
        200,
        result,
      );
    }
    return result;
  }

  private async listResource(
    resource: "thirdparties" | "products" | "invoices" | "orders" | "proposals",
    options: {
      readonly limit: number;
      readonly page: number;
      readonly signal?: AbortSignal;
      readonly filters?: Record<string, string | number>;
    },
  ): Promise<unknown[]> {
    const params = new URLSearchParams();
    params.set("limit", String(options.limit));
    params.set("page", String(options.page));
    for (const [key, value] of Object.entries(options.filters ?? {})) {
      params.set(key, String(value));
    }
    const errorPath = `/${resource}`;
    const result = await this.request<unknown[]>(
      "GET",
      `${errorPath}?${params.toString()}`,
      errorPath,
      options.signal,
    );
    if (!Array.isArray(result)) {
      throw new DolibarrApiError(
        `Dolibarr GET ${errorPath} failed: malformed response: expected array`,
        200,
        result,
      );
    }
    return result;
  }

  private async getResource(
    resource: "thirdparties" | "products" | "invoices" | "orders" | "proposals",
    id: number,
    signal?: AbortSignal,
  ): Promise<unknown> {
    const errorPath = `/${resource}/${id}`;
    return await this.request<unknown>(
      "GET",
      errorPath,
      errorPath,
      signal,
    );
  }

  private async request<T>(
    method: string,
    path: string,
    errorPath: string,
    signal?: AbortSignal,
  ): Promise<T> {
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}${path}`, {
        method,
        headers: {
          "accept": "application/json",
          "dolapikey": this.connection.apiKey,
        },
        signal,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new DolibarrApiError(
        `Dolibarr ${method} ${errorPath} failed: ${message}`,
        0,
        null,
      );
    }

    const body = await readResponseBody(response);
    if (!response.ok) {
      throw new DolibarrApiError(
        `Dolibarr ${method} ${errorPath} failed: ${
          extractDolibarrErrorMessage(body, response.statusText)
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

function readRequiredInteger(
  args: Record<string, unknown>,
  name: string,
  options: { readonly min: number },
): number {
  const value = args[name];
  if (!Number.isInteger(value)) {
    throw new TypeError(`${name} must be an integer`);
  }
  const numberValue = value as number;
  if (numberValue < options.min) {
    throw new TypeError(`${name} must be >= ${options.min}`);
  }
  return numberValue;
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

function readOptionalDateArgument(
  args: Record<string, unknown>,
  name: string,
): string | undefined {
  const value = readOptionalStringArgument(args, name);
  if (value === undefined) return undefined;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new TypeError(`${name} must match YYYY-MM-DD`);
  }
  return value;
}

function readOptionalEnumArgument<T extends string>(
  args: Record<string, unknown>,
  name: string,
  allowedValues: readonly T[],
): T | undefined {
  const value = readOptionalStringArgument(args, name);
  if (value === undefined) return undefined;
  if (!allowedValues.includes(value as T)) {
    throw new TypeError(
      `${name} must be one of: ${allowedValues.join(", ")}`,
    );
  }
  return value as T;
}

function readOptionalMappedStatusCode(
  args: Record<string, unknown>,
  name: string,
  statusCodes: Record<string, number>,
): number | undefined {
  const value = readOptionalStringArgument(args, name);
  if (value === undefined) return undefined;
  if (!Object.prototype.hasOwnProperty.call(statusCodes, value)) {
    throw new TypeError(
      `${name} must be one of: ${Object.keys(statusCodes).join(", ")}`,
    );
  }
  return statusCodes[value];
}

function readOptionalIntegerArgument(
  args: Record<string, unknown>,
  name: string,
  options: { readonly min: number },
): number | undefined {
  const value = args[name];
  if (value === undefined) return undefined;
  if (!Number.isInteger(value)) {
    throw new TypeError(`${name} must be an integer`);
  }
  const numberValue = value as number;
  if (numberValue < options.min) {
    throw new TypeError(`${name} must be >= ${options.min}`);
  }
  return numberValue;
}

function rejectUnsupportedArguments(
  toolName: string,
  args: Record<string, unknown>,
  allowedNames: readonly string[],
): void {
  for (const key of Object.keys(args)) {
    if (!allowedNames.includes(key)) {
      throw new TypeError(`Unsupported argument for ${toolName}: ${key}`);
    }
  }
}

function addSqlFilter(
  filters: Record<string, string | number>,
  condition: string,
): void {
  const current = filters.sqlfilters;
  filters.sqlfilters = current === undefined
    ? condition
    : `${current} and ${condition}`;
}

function sqlFilterEqualsNumber(field: string, value: number): string {
  return `(${field}:=:${value})`;
}

function sqlFilterDateComparison(
  field: string,
  operator: ">=" | "<=",
  value: string,
): string {
  return `(${field}:${operator}:${sqlFilterStringLiteral(value, field)})`;
}

function sqlFilterLike(
  field: string,
  value: string,
  argumentName: string,
): string {
  return `(${field}:like:${
    sqlFilterStringLiteral(`%${value}%`, argumentName)
  })`;
}

function sqlFilterStringLiteral(value: string, argumentName: string): string {
  if (/['"()]/.test(value)) {
    throw new TypeError(
      `${argumentName} contains unsupported sqlfilters syntax character`,
    );
  }
  if (/[\r\n]/.test(value)) {
    throw new TypeError(`${argumentName} must be a single-line string`);
  }
  return `'${value}'`;
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

function extractDolibarrErrorMessage(
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
    if (record.error && typeof record.error === "object") {
      const error = record.error as Record<string, unknown>;
      if (typeof error.message === "string" && error.message.length > 0) {
        return error.message;
      }
    }
  }
  return fallback || "HTTP request failed";
}

/**
 * Map a Dolibarr `statut` integer (plus optional `paye` flag for invoices)
 * to a provider-agnostic status string suitable for UI display.
 */
const DOLIBARR_INVOICE_STATUS_LABELS: Record<number, string> = {
  0: "Draft",
  1: "Unpaid",
  2: "Paid/Closed",
  3: "Abandoned",
};

const DOLIBARR_ORDER_STATUS_LABELS: Record<number, string> = {
  [-1]: "Cancelled",
  0: "Draft",
  1: "Validated",
  2: "Shipment on process",
  3: "Closed",
};

const DOLIBARR_PROPOSAL_STATUS_LABELS: Record<number, string> = {
  [-1]: "Cancelled",
  0: "Draft",
  1: "Validated",
  2: "Signed",
  3: "Not signed",
  4: "Billed",
};

function mapDolibarrInvoiceStatus(statut: unknown, paye?: unknown): string {
  if (paye === "1" || paye === 1 || paye === true) return "Paid";
  return mapDolibarrStatusValue(statut, DOLIBARR_INVOICE_STATUS_LABELS);
}

function mapDolibarrOrderStatus(statut: unknown): string {
  return mapDolibarrStatusValue(statut, DOLIBARR_ORDER_STATUS_LABELS);
}

function mapDolibarrProposalStatus(statut: unknown): string {
  return mapDolibarrStatusValue(statut, DOLIBARR_PROPOSAL_STATUS_LABELS);
}

function mapDolibarrStatusValue(
  statut: unknown,
  labels: Record<number, string>,
): string {
  const status = parseIntegerLike(statut);
  if (
    status !== undefined &&
    Object.prototype.hasOwnProperty.call(labels, status)
  ) {
    return labels[status];
  }
  return `Unknown (${formatUnknownStatus(statut)})`;
}

function parseIntegerLike(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isInteger(value)) return value;
  if (typeof value !== "string" || value.trim() === "") return undefined;
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : undefined;
}

function formatUnknownStatus(value: unknown): string {
  if (value === undefined) return "undefined";
  if (value === null) return "null";
  return String(value);
}

interface MappedDolibarrLine extends Record<string, unknown> {
  item_name: string;
  item_code?: string;
  qty?: unknown;
  rate?: number;
  amount?: number;
}

interface DolibarrMoney {
  readonly currency?: string;
  readonly grandTotal?: number;
  readonly netTotal?: number;
  readonly taxes?: number;
  readonly useMulticurrency: boolean;
}

function mapDolibarrLines(
  lines: unknown[],
  useMulticurrency: boolean,
): MappedDolibarrLine[] {
  return lines.map((line) => {
    const l = line as Record<string, unknown>;
    const item: MappedDolibarrLine = {
      item_name: readStringField(l, [
        "label",
        "product_label",
        "desc",
        "description",
      ]) ?? "",
    };
    assignIfDefined(
      item,
      "item_code",
      readStringField(l, ["product_ref", "ref", "product_code"]),
    );
    assignIfDefined(item, "qty", l.qty ?? l.quantity);
    assignIfDefined(
      item,
      "rate",
      useMulticurrency
        ? readNumberField(l, ["multicurrency_subprice"])
        : readNumberField(l, ["subprice", "price"]),
    );
    assignIfDefined(
      item,
      "amount",
      useMulticurrency
        ? readNumberField(l, ["multicurrency_total_ht"])
        : readNumberField(l, ["total_ht", "amount"]),
    );
    return item;
  });
}

/**
 * Map a Dolibarr native invoice payload to the invoice-viewer `data` contract.
 * The full native payload is preserved by the tool result beside `data`.
 */
function mapDolibarrInvoice(
  native: Record<string, unknown>,
): Record<string, unknown> {
  const money = readDolibarrMoney(native);
  const lines = Array.isArray(native.lines) ? native.lines : [];
  const data: Record<string, unknown> = {
    name: typeof native.ref === "string" ? native.ref : "",
    status: mapDolibarrInvoiceStatus(native.statut, native.paye),
    items: mapDolibarrLines(lines, money.useMulticurrency),
  };
  assignMoneyFields(data, money);
  assignIfDefined(
    data,
    "posting_date",
    readScalarField(native, ["datef", "date", "date_creation"]),
  );
  assignIfDefined(
    data,
    "due_date",
    readScalarField(native, ["date_lim_reglement", "due_date"]),
  );
  assignPartyFields(data, native);
  return data;
}

/**
 * Build a normalized `data` field for a Dolibarr document (order/proposal)
 * suitable for the detail-viewer contract.
 */
function mapDolibarrDocData(
  native: Record<string, unknown>,
  type: "order" | "proposal",
): Record<string, unknown> {
  const money = readDolibarrMoney(native);
  const lines = Array.isArray(native.lines) ? native.lines : [];
  const data: Record<string, unknown> = {
    name: typeof native.ref === "string" ? native.ref : "",
    status: type === "order"
      ? mapDolibarrOrderStatus(native.statut)
      : mapDolibarrProposalStatus(native.statut),
    items: mapDolibarrLines(lines, money.useMulticurrency),
  };
  assignMoneyFields(data, money);
  assignPartyFields(data, native);

  if (type === "order") {
    assignIfDefined(
      data,
      "transaction_date",
      readScalarField(native, ["date_commande", "date", "date_creation"]),
    );
    assignIfDefined(
      data,
      "delivery_date",
      readScalarField(native, ["date_livraison", "delivery_date"]),
    );
  } else {
    assignIfDefined(
      data,
      "transaction_date",
      readScalarField(native, ["datep", "date", "date_creation"]),
    );
    assignIfDefined(
      data,
      "valid_till",
      readScalarField(native, ["fin_validite", "valid_till"]),
    );
    assignIfDefined(
      data,
      "delivery_date",
      readScalarField(native, ["delivery_date"]),
    );
  }

  return data;
}

function readDolibarrMoney(native: Record<string, unknown>): DolibarrMoney {
  const multicurrencyCode = readStringField(native, ["multicurrency_code"]);
  const hasMulticurrencyTotals = [
    "multicurrency_total_ttc",
    "multicurrency_total_ht",
    "multicurrency_total_tva",
  ].some((field) => hasValue(native[field]));

  if (multicurrencyCode && hasMulticurrencyTotals) {
    return {
      currency: multicurrencyCode,
      grandTotal: readNumberField(native, ["multicurrency_total_ttc"]),
      netTotal: readNumberField(native, ["multicurrency_total_ht"]),
      taxes: readNumberField(native, ["multicurrency_total_tva"]),
      useMulticurrency: true,
    };
  }

  return {
    currency: readStringField(native, ["currency", "currency_code"]),
    grandTotal: readNumberField(native, ["total_ttc"]),
    netTotal: readNumberField(native, ["total_ht"]),
    taxes: readNumberField(native, ["total_tva"]),
    useMulticurrency: false,
  };
}

function assignMoneyFields(
  data: Record<string, unknown>,
  money: DolibarrMoney,
): void {
  assignIfDefined(data, "currency", money.currency);
  assignIfDefined(data, "grand_total", money.grandTotal);
  assignIfDefined(data, "net_total", money.netTotal);
  assignIfDefined(data, "total_taxes_and_charges", money.taxes);
}

function assignPartyFields(
  data: Record<string, unknown>,
  native: Record<string, unknown>,
): void {
  assignIfDefined(data, "party_name", readDolibarrPartyName(native));
  assignIfDefined(
    data,
    "socid",
    readScalarField(native, ["socid", "fk_soc", "thirdparty_id"]),
  );
}

function readDolibarrPartyName(
  native: Record<string, unknown>,
): string | undefined {
  const thirdparty = native.thirdparty;
  if (thirdparty && typeof thirdparty === "object") {
    const thirdpartyName = readStringField(
      thirdparty as Record<string, unknown>,
      ["name", "nom", "name_alias"],
    );
    if (thirdpartyName) return thirdpartyName;
  }
  return readStringField(native, ["socname", "thirdparty_name", "party_name"]);
}

function readScalarField(
  record: Record<string, unknown>,
  names: readonly string[],
): string | number | boolean | undefined {
  for (const name of names) {
    const value = record[name];
    if (
      typeof value === "string" || typeof value === "number" ||
      typeof value === "boolean"
    ) {
      if (typeof value === "string" && value.length === 0) continue;
      return value;
    }
  }
  return undefined;
}

function readStringField(
  record: Record<string, unknown>,
  names: readonly string[],
): string | undefined {
  const value = readScalarField(record, names);
  if (value === undefined) return undefined;
  return String(value);
}

function readNumberField(
  record: Record<string, unknown>,
  names: readonly string[],
): number | undefined {
  for (const name of names) {
    const value = record[name];
    if (!hasValue(value)) continue;
    const parsed = Number.parseFloat(String(value));
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function hasValue(value: unknown): boolean {
  return value !== undefined && value !== null && value !== "";
}

function assignIfDefined(
  target: Record<string, unknown>,
  key: string,
  value: unknown,
): void {
  if (value !== undefined) {
    target[key] = value;
  }
}

export function getDolibarrToolDefinitions(): ErpToolDefinition[] {
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

export function createDolibarrAdapter(
  connection: DolibarrConnection,
): ErpAdapter {
  const client = new DolibarrRestClient(connection);

  return {
    erpType: "dolibarr",

    tools(): ErpToolDefinition[] {
      return getDolibarrToolDefinitions();
    },

    async callTool(
      name: string,
      args: Record<string, unknown>,
      _ctx: ErpToolCallContext,
    ): Promise<ErpToolCallResult> {
      if (name === "dolibarr.ping") {
        rejectUnsupportedArguments(name, args, []);
        return await Promise.resolve({
          content: {
            ok: true,
            erpType: "dolibarr",
            apiUrl: connection.apiUrl,
            sandbox: connection.sandbox,
            tenantId: _ctx.tenantId,
            actorSubject: _ctx.actorSubject,
            toolCount: TOOLS.length,
            toolNames: TOOLS.map((tool) => tool.name),
          },
          summary: `Dolibarr connection check — apiUrl=${connection.apiUrl}`,
        });
      }
      if (name === "dolibarr.thirdparty_list") {
        rejectUnsupportedArguments(name, args, [
          "limit",
          "page",
          "mode",
          "nameLike",
        ]);
        const limit = readOptionalInteger(args, "limit", 20, {
          min: 1,
          max: 100,
        });
        const page = readOptionalInteger(args, "page", 0, {
          min: 0,
        });
        const filters: Record<string, string | number> = {};
        const mode = readOptionalStringArgument(args, "mode");
        if (mode !== undefined) {
          const modeMap: Record<string, number> = {
            customer: 1,
            supplier: 4,
            prospect: 2,
          };
          if (!(mode in modeMap)) {
            throw new TypeError(
              `mode must be one of: customer, supplier, prospect`,
            );
          }
          filters.mode = modeMap[mode];
        }
        const nameLike = readOptionalStringArgument(args, "nameLike");
        if (nameLike !== undefined) {
          addSqlFilter(filters, sqlFilterLike("t.nom", nameLike, "nameLike"));
        }
        const thirdparties = await client.listThirdparties({
          limit,
          page,
          signal: _ctx.signal,
          filters,
        });
        return {
          content: {
            doctype: "Dolibarr Thirdparty",
            data: thirdparties,
            _title: "Dolibarr Thirdparties",
            _rowAction: {
              toolName: "dolibarr.thirdparty_get",
              idField: "id",
              argName: "id",
            },
            thirdparties,
            count: thirdparties.length,
            limit,
            page,
          },
          summary:
            `Dolibarr thirdparty_list returned ${thirdparties.length} thirdpartie(s)`,
        };
      }
      if (name === "dolibarr.thirdparty_get") {
        rejectUnsupportedArguments(name, args, ["id"]);
        const id = readRequiredInteger(args, "id", { min: 1 });
        const thirdparty = await client.getThirdparty(id, _ctx.signal);
        return {
          content: {
            thirdparty,
          },
          summary: `Dolibarr thirdparty_get returned ${id}`,
        };
      }
      if (name === "dolibarr.product_list") {
        rejectUnsupportedArguments(name, args, ["limit", "page", "type"]);
        const limit = readOptionalInteger(args, "limit", 20, {
          min: 1,
          max: 100,
        });
        const page = readOptionalInteger(args, "page", 0, {
          min: 0,
        });
        const filters: Record<string, string | number> = {};
        const productType = readOptionalIntegerArgument(args, "type", {
          min: 0,
        });
        if (productType !== undefined) {
          if (productType !== 0 && productType !== 1) {
            throw new TypeError("type must be one of: 0, 1");
          }
          filters.mode = productType === 0 ? 1 : 2;
        }
        const products = await client.listProducts({
          limit,
          page,
          signal: _ctx.signal,
          filters,
        });
        return {
          content: {
            doctype: "Dolibarr Product",
            data: products,
            _title: "Dolibarr Products",
            _rowAction: {
              toolName: "dolibarr.product_get",
              idField: "id",
              argName: "id",
            },
            products,
            count: products.length,
            limit,
            page,
          },
          summary:
            `Dolibarr product_list returned ${products.length} product(s)`,
        };
      }
      if (name === "dolibarr.product_get") {
        rejectUnsupportedArguments(name, args, ["id"]);
        const id = readRequiredInteger(args, "id", { min: 1 });
        const product = await client.getProduct(id, _ctx.signal);
        return {
          content: {
            product,
          },
          summary: `Dolibarr product_get returned ${id}`,
        };
      }
      if (name === "dolibarr.invoice_list") {
        rejectUnsupportedArguments(name, args, [
          "limit",
          "page",
          "thirdpartyId",
          "status",
          "dateStart",
          "dateEnd",
        ]);
        const limit = readOptionalInteger(args, "limit", 20, {
          min: 1,
          max: 100,
        });
        const page = readOptionalInteger(args, "page", 0, {
          min: 0,
        });
        const filters: Record<string, string | number> = {};
        const thirdpartyId = readOptionalIntegerArgument(args, "thirdpartyId", {
          min: 1,
        });
        if (thirdpartyId !== undefined) {
          filters.thirdparty_ids = thirdpartyId;
        }
        const status = readOptionalEnumArgument(
          args,
          "status",
          DOLIBARR_INVOICE_STATUSES,
        );
        if (status !== undefined) {
          filters.status = status;
        }
        const dateStart = readOptionalDateArgument(args, "dateStart");
        if (dateStart !== undefined) {
          addSqlFilter(
            filters,
            sqlFilterDateComparison(
              "t.datef",
              ">=",
              dateStart,
            ),
          );
        }
        const dateEnd = readOptionalDateArgument(args, "dateEnd");
        if (dateEnd !== undefined) {
          addSqlFilter(
            filters,
            sqlFilterDateComparison(
              "t.datef",
              "<=",
              dateEnd,
            ),
          );
        }
        const invoices = await client.listInvoices({
          limit,
          page,
          signal: _ctx.signal,
          filters,
        });
        return {
          content: {
            doctype: "Dolibarr Invoice",
            data: invoices,
            _title: "Dolibarr Invoices",
            _rowAction: {
              toolName: "dolibarr.invoice_get",
              idField: "id",
              argName: "id",
            },
            invoices,
            count: invoices.length,
            limit,
            page,
          },
          summary:
            `Dolibarr invoice_list returned ${invoices.length} invoice(s)`,
        };
      }
      if (name === "dolibarr.invoice_get") {
        rejectUnsupportedArguments(name, args, ["id"]);
        const id = readRequiredInteger(args, "id", { min: 1 });
        const invoice = await client.getInvoice(id, _ctx.signal);
        const native = invoice as Record<string, unknown>;
        return {
          content: {
            data: mapDolibarrInvoice(native),
            invoice,
            _native: invoice,
          },
          summary: `Dolibarr invoice_get returned ${id}`,
        };
      }
      if (name === "dolibarr.order_list") {
        rejectUnsupportedArguments(name, args, [
          "limit",
          "page",
          "thirdpartyId",
          "status",
          "dateStart",
          "dateEnd",
        ]);
        const limit = readOptionalInteger(args, "limit", 20, {
          min: 1,
          max: 100,
        });
        const page = readOptionalInteger(args, "page", 0, {
          min: 0,
        });
        const filters: Record<string, string | number> = {};
        const thirdpartyId = readOptionalIntegerArgument(args, "thirdpartyId", {
          min: 1,
        });
        if (thirdpartyId !== undefined) {
          filters.thirdparty_ids = thirdpartyId;
        }
        const status = readOptionalMappedStatusCode(
          args,
          "status",
          DOLIBARR_ORDER_STATUS_CODES,
        );
        if (status !== undefined) {
          addSqlFilter(filters, sqlFilterEqualsNumber("t.fk_statut", status));
        }
        const dateStart = readOptionalDateArgument(args, "dateStart");
        if (dateStart !== undefined) {
          addSqlFilter(
            filters,
            sqlFilterDateComparison(
              "t.date_commande",
              ">=",
              dateStart,
            ),
          );
        }
        const dateEnd = readOptionalDateArgument(args, "dateEnd");
        if (dateEnd !== undefined) {
          addSqlFilter(
            filters,
            sqlFilterDateComparison(
              "t.date_commande",
              "<=",
              dateEnd,
            ),
          );
        }
        const orders = await client.listOrders({
          limit,
          page,
          signal: _ctx.signal,
          filters,
        });
        return {
          content: {
            doctype: "Dolibarr Order",
            data: orders,
            _title: "Dolibarr Orders",
            _rowAction: {
              toolName: "dolibarr.order_get",
              idField: "id",
              argName: "id",
            },
            orders,
            count: orders.length,
            limit,
            page,
          },
          summary: `Dolibarr order_list returned ${orders.length} order(s)`,
        };
      }
      if (name === "dolibarr.order_get") {
        rejectUnsupportedArguments(name, args, ["id"]);
        const id = readRequiredInteger(args, "id", { min: 1 });
        const order = await client.getOrder(id, _ctx.signal);
        const native = order as Record<string, unknown>;
        return {
          content: {
            data: mapDolibarrDocData(native, "order"),
            order,
            _native: order,
          },
          summary: `Dolibarr order_get returned ${id}`,
        };
      }
      if (name === "dolibarr.proposal_list") {
        rejectUnsupportedArguments(name, args, [
          "limit",
          "page",
          "thirdpartyId",
          "status",
          "dateStart",
          "dateEnd",
        ]);
        const limit = readOptionalInteger(args, "limit", 20, {
          min: 1,
          max: 100,
        });
        const page = readOptionalInteger(args, "page", 0, {
          min: 0,
        });
        const filters: Record<string, string | number> = {};
        const thirdpartyId = readOptionalIntegerArgument(args, "thirdpartyId", {
          min: 1,
        });
        if (thirdpartyId !== undefined) {
          filters.thirdparty_ids = thirdpartyId;
        }
        const status = readOptionalMappedStatusCode(
          args,
          "status",
          DOLIBARR_PROPOSAL_STATUS_CODES,
        );
        if (status !== undefined) {
          addSqlFilter(filters, sqlFilterEqualsNumber("t.fk_statut", status));
        }
        const dateStart = readOptionalDateArgument(args, "dateStart");
        if (dateStart !== undefined) {
          addSqlFilter(
            filters,
            sqlFilterDateComparison(
              "t.datep",
              ">=",
              dateStart,
            ),
          );
        }
        const dateEnd = readOptionalDateArgument(args, "dateEnd");
        if (dateEnd !== undefined) {
          addSqlFilter(
            filters,
            sqlFilterDateComparison(
              "t.datep",
              "<=",
              dateEnd,
            ),
          );
        }
        const proposals = await client.listProposals({
          limit,
          page,
          signal: _ctx.signal,
          filters,
        });
        return {
          content: {
            doctype: "Dolibarr Proposal",
            data: proposals,
            _title: "Dolibarr Proposals",
            _rowAction: {
              toolName: "dolibarr.proposal_get",
              idField: "id",
              argName: "id",
            },
            proposals,
            count: proposals.length,
            limit,
            page,
          },
          summary:
            `Dolibarr proposal_list returned ${proposals.length} proposal(s)`,
        };
      }
      if (name === "dolibarr.proposal_get") {
        rejectUnsupportedArguments(name, args, ["id"]);
        const id = readRequiredInteger(args, "id", { min: 1 });
        const proposal = await client.getProposal(id, _ctx.signal);
        const native = proposal as Record<string, unknown>;
        return {
          content: {
            data: mapDolibarrDocData(native, "proposal"),
            proposal,
            _native: proposal,
          },
          summary: `Dolibarr proposal_get returned ${id}`,
        };
      }
      if (name === "dolibarr.payment_list") {
        rejectUnsupportedArguments(name, args, [
          "limit",
          "page",
          "dateStart",
          "dateEnd",
        ]);
        const limit = readOptionalInteger(args, "limit", 20, {
          min: 1,
          max: 100,
        });
        const page = readOptionalInteger(args, "page", 0, {
          min: 0,
        });
        const filters: Record<string, string | number> = {};
        const dateStart = readOptionalDateArgument(args, "dateStart");
        if (dateStart !== undefined) {
          addSqlFilter(
            filters,
            sqlFilterDateComparison(
              "t.datep",
              ">=",
              dateStart,
            ),
          );
        }
        const dateEnd = readOptionalDateArgument(args, "dateEnd");
        if (dateEnd !== undefined) {
          addSqlFilter(
            filters,
            sqlFilterDateComparison(
              "t.datep",
              "<=",
              dateEnd,
            ),
          );
        }
        const payments = await client.listPayments({
          limit,
          page,
          signal: _ctx.signal,
          filters,
        });
        return {
          content: {
            doctype: "Dolibarr Payment",
            data: payments,
            _title: "Dolibarr Payments",
            _rowAction: {
              toolName: "dolibarr.payment_get",
              idField: "id",
              argName: "id",
            },
            payments,
            count: payments.length,
            limit,
            page,
          },
          summary:
            `Dolibarr payment_list returned ${payments.length} payment(s)`,
        };
      }
      if (name === "dolibarr.payment_get") {
        rejectUnsupportedArguments(name, args, ["id"]);
        const id = readRequiredInteger(args, "id", { min: 1 });
        const payment = await client.getPayment(id, _ctx.signal);
        return {
          content: {
            payment,
          },
          summary: `Dolibarr payment_get returned ${id}`,
        };
      }
      if (name === "dolibarr.stockmovement_list") {
        rejectUnsupportedArguments(name, args, [
          "limit",
          "page",
          "fkProduct",
          "dateStart",
          "dateEnd",
        ]);
        const limit = readOptionalInteger(args, "limit", 20, {
          min: 1,
          max: 100,
        });
        const page = readOptionalInteger(args, "page", 0, {
          min: 0,
        });
        const filters: Record<string, string | number> = {};
        const fkProduct = readOptionalIntegerArgument(args, "fkProduct", {
          min: 1,
        });
        if (fkProduct !== undefined) {
          addSqlFilter(
            filters,
            sqlFilterEqualsNumber("t.fk_product", fkProduct),
          );
        }
        const dateStart = readOptionalDateArgument(args, "dateStart");
        if (dateStart !== undefined) {
          addSqlFilter(
            filters,
            sqlFilterDateComparison(
              "t.datem",
              ">=",
              dateStart,
            ),
          );
        }
        const dateEnd = readOptionalDateArgument(args, "dateEnd");
        if (dateEnd !== undefined) {
          addSqlFilter(
            filters,
            sqlFilterDateComparison(
              "t.datem",
              "<=",
              dateEnd,
            ),
          );
        }
        const stockmovements = await client.listStockmovements({
          limit,
          page,
          signal: _ctx.signal,
          filters,
        });
        return {
          content: {
            doctype: "Dolibarr Stock Movement",
            data: stockmovements,
            _title: "Dolibarr Stock Movements",
            stockmovements,
            count: stockmovements.length,
            limit,
            page,
          },
          summary:
            `Dolibarr stockmovement_list returned ${stockmovements.length} movement(s)`,
        };
      }
      throw new UnknownToolError("dolibarr", name);
    },

    dispose(): void {
      // No persistent resources.
    },
  };
}
