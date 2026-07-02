import type { ErpConnection } from "../../../domain/connection.ts";

type DolibarrConnection = Extract<ErpConnection, { erpType: "dolibarr" }>;

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

export class DolibarrRestClient {
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

  async createThirdparty(
    payload: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<unknown> {
    return await this.request<unknown>(
      "POST",
      "/thirdparties",
      "/thirdparties",
      signal,
      JSON.stringify(payload),
    );
  }

  async createProduct(
    payload: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<unknown> {
    return await this.request<unknown>(
      "POST",
      "/products",
      "/products",
      signal,
      JSON.stringify(payload),
    );
  }

  async updateThirdparty(
    id: number,
    payload: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<unknown> {
    return await this.request<unknown>(
      "PUT",
      `/thirdparties/${id}`,
      `/thirdparties/${id}`,
      signal,
      JSON.stringify(payload),
    );
  }

  async updateProduct(
    id: number,
    payload: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<unknown> {
    return await this.request<unknown>(
      "PUT",
      `/products/${id}`,
      `/products/${id}`,
      signal,
      JSON.stringify(payload),
    );
  }

  async createOrder(
    payload: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<unknown> {
    return await this.request<unknown>(
      "POST",
      "/orders",
      "/orders",
      signal,
      JSON.stringify(payload),
    );
  }

  async createProposal(
    payload: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<unknown> {
    return await this.request<unknown>(
      "POST",
      "/proposals",
      "/proposals",
      signal,
      JSON.stringify(payload),
    );
  }

  async createInvoice(
    payload: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<unknown> {
    return await this.request<unknown>(
      "POST",
      "/invoices",
      "/invoices",
      signal,
      JSON.stringify(payload),
    );
  }

  async addDocumentLine(
    docKind: "orders" | "proposals" | "invoices",
    id: number,
    line: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<unknown> {
    // proposals uses the singular /line endpoint; orders and invoices use /lines
    const lineSegment: Record<"orders" | "proposals" | "invoices", string> = {
      orders: "lines",
      proposals: "line",
      invoices: "lines",
    };
    const path = `/${docKind}/${id}/${lineSegment[docKind]}`;
    return await this.request<unknown>(
      "POST",
      path,
      path,
      signal,
      JSON.stringify(line),
    );
  }

  /**
   * Validate (submit) a sales document via `POST /{docKind}/{id}/validate`.
   *
   * Dolibarr signals an already-validated document with HTTP 304, which the
   * native `fetch` API does NOT surface as an exception (the response object
   * is returned normally). This method inspects the status code directly and
   * returns a discriminated result rather than throwing, so callers can map
   * the 304 case to a structured `ALREADY_TRANSITIONED` write error.
   */
  async validateDocument(
    docKind: "orders" | "proposals" | "invoices",
    id: number,
    body: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<
    | { readonly kind: "already_validated" }
    | { readonly kind: "ok"; readonly body: unknown }
  > {
    const path = `/${docKind}/${id}/validate`;
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}${path}`, {
        method: "POST",
        headers: {
          "accept": "application/json",
          "content-type": "application/json",
          "dolapikey": this.connection.apiKey,
        },
        body: JSON.stringify(body),
        signal,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new DolibarrApiError(
        `Dolibarr POST ${path} failed: ${message}`,
        0,
        null,
      );
    }

    // HTTP 304 = document is already in the validated state.
    // fetch does not throw on 304; we detect it before the ok-check.
    if (response.status === 304) {
      return { kind: "already_validated" };
    }

    const responseBody = await readResponseBody(response);
    if (!response.ok) {
      throw new DolibarrApiError(
        `Dolibarr POST ${path} failed: ${
          extractDolibarrErrorMessage(responseBody, response.statusText)
        }`,
        response.status,
        responseBody,
      );
    }

    return { kind: "ok", body: responseBody };
  }

  async findProductByRef(
    ref: string,
    signal?: AbortSignal,
  ): Promise<{ id: number; tva_tx?: string | number } | undefined> {
    const escaped = ref.replace(/'/g, "''");
    const params = new URLSearchParams();
    params.set("sqlfilters", `(t.ref:=:'${escaped}')`);
    params.set("limit", "1");
    params.set("page", "0");
    const path = "/products";
    const result = await this.request<unknown>(
      "GET",
      `${path}?${params.toString()}`,
      path,
      signal,
    );
    if (!Array.isArray(result) || result.length === 0) return undefined;
    const row = result[0] as Record<string, unknown>;
    const rawId = row.id;
    const numId = typeof rawId === "number"
      ? rawId
      : (typeof rawId === "string" ? parseInt(rawId, 10) : NaN);
    if (!Number.isInteger(numId) || numId <= 0) return undefined;
    const product: { id: number; tva_tx?: string | number } = { id: numId };
    if (row.tva_tx !== undefined && row.tva_tx !== null) {
      product.tva_tx = row.tva_tx as string | number;
    }
    return product;
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
    body?: string,
  ): Promise<T> {
    let response: Response;
    try {
      const headers: Record<string, string> = {
        "accept": "application/json",
        "dolapikey": this.connection.apiKey,
      };
      if (body !== undefined) headers["content-type"] = "application/json";
      response = await fetch(`${this.baseUrl}${path}`, {
        method,
        headers,
        body,
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

    const responseBody = await readResponseBody(response);
    if (!response.ok) {
      throw new DolibarrApiError(
        `Dolibarr ${method} ${errorPath} failed: ${
          extractDolibarrErrorMessage(responseBody, response.statusText)
        }`,
        response.status,
        responseBody,
      );
    }

    return responseBody as T;
  }
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
