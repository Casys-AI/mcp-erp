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
import { ERP_DIAGNOSTICS_META, ERP_DOCLIST_META } from "../viewers.ts";

type DolibarrConnection = Extract<ErpConnection, { erpType: "dolibarr" }>;

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
  }): Promise<unknown[]> {
    return await this.listResource("proposals", options);
  }

  async getProposal(id: number, signal?: AbortSignal): Promise<unknown> {
    return await this.getResource("proposals", id, signal);
  }

  private async listResource(
    resource: "thirdparties" | "products" | "invoices" | "orders" | "proposals",
    options: {
      readonly limit: number;
      readonly page: number;
      readonly signal?: AbortSignal;
    },
  ): Promise<unknown[]> {
    const params = new URLSearchParams();
    params.set("limit", String(options.limit));
    params.set("page", String(options.page));
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
        const limit = readOptionalInteger(args, "limit", 20, {
          min: 1,
          max: 100,
        });
        const page = readOptionalInteger(args, "page", 0, {
          min: 0,
        });
        const thirdparties = await client.listThirdparties({
          limit,
          page,
          signal: _ctx.signal,
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
        const limit = readOptionalInteger(args, "limit", 20, {
          min: 1,
          max: 100,
        });
        const page = readOptionalInteger(args, "page", 0, {
          min: 0,
        });
        const products = await client.listProducts({
          limit,
          page,
          signal: _ctx.signal,
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
        const limit = readOptionalInteger(args, "limit", 20, {
          min: 1,
          max: 100,
        });
        const page = readOptionalInteger(args, "page", 0, {
          min: 0,
        });
        const invoices = await client.listInvoices({
          limit,
          page,
          signal: _ctx.signal,
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
        const id = readRequiredInteger(args, "id", { min: 1 });
        const invoice = await client.getInvoice(id, _ctx.signal);
        return {
          content: {
            invoice,
          },
          summary: `Dolibarr invoice_get returned ${id}`,
        };
      }
      if (name === "dolibarr.order_list") {
        const limit = readOptionalInteger(args, "limit", 20, {
          min: 1,
          max: 100,
        });
        const page = readOptionalInteger(args, "page", 0, {
          min: 0,
        });
        const orders = await client.listOrders({
          limit,
          page,
          signal: _ctx.signal,
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
        const id = readRequiredInteger(args, "id", { min: 1 });
        const order = await client.getOrder(id, _ctx.signal);
        return {
          content: {
            order,
          },
          summary: `Dolibarr order_get returned ${id}`,
        };
      }
      if (name === "dolibarr.proposal_list") {
        const limit = readOptionalInteger(args, "limit", 20, {
          min: 1,
          max: 100,
        });
        const page = readOptionalInteger(args, "page", 0, {
          min: 0,
        });
        const proposals = await client.listProposals({
          limit,
          page,
          signal: _ctx.signal,
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
        const id = readRequiredInteger(args, "id", { min: 1 });
        const proposal = await client.getProposal(id, _ctx.signal);
        return {
          content: {
            proposal,
          },
          summary: `Dolibarr proposal_get returned ${id}`,
        };
      }
      throw new UnknownToolError("dolibarr", name);
    },

    dispose(): void {
      // No persistent resources.
    },
  };
}
