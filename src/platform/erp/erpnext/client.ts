import type { ErpConnection } from "../../../domain/connection.ts";

type ErpnextConnection = Extract<ErpConnection, { erpType: "erpnext" }>;

export type FrappeDoc = Record<string, unknown>;
export type FrappeFilter = readonly [
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
  readonly body?: string;
}

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

export class FrappeRestClient {
  private readonly baseUrl: string;
  private readonly authHeader: string;

  constructor(connection: ErpnextConnection) {
    this.baseUrl = connection.apiUrl.replace(/\/+$/, "");
    this.authHeader = `token ${connection.apiKey}:${connection.apiSecret}`;
  }

  buildContactPayload(
    linkDoctype: "Customer" | "Supplier",
    linkName: string,
    opts: { firstName: string; email?: string; phone?: string },
  ): Record<string, unknown> {
    const payload: Record<string, unknown> = {
      first_name: opts.firstName,
      is_primary_contact: 1,
      links: [{ link_doctype: linkDoctype, link_name: linkName }],
    };
    if (opts.email) {
      payload.email_ids = [{ email_id: opts.email, is_primary: 1 }];
    }
    if (opts.phone) {
      payload.phone_nos = [{ phone: opts.phone, is_primary_mobile_no: 1 }];
    }
    return payload;
  }

  async createContact(
    linkDoctype: "Customer" | "Supplier",
    linkName: string,
    opts: { firstName: string; email?: string; phone?: string },
    requestOptions: FrappeRequestOptions = {},
  ): Promise<string> {
    const payload = this.buildContactPayload(linkDoctype, linkName, opts);
    const result = await this.request<FrappeDocResponse<FrappeDoc>>(
      "POST",
      "/api/resource/Contact",
      "/api/resource/Contact",
      { ...requestOptions, body: JSON.stringify(payload) },
    );
    if (
      !result || !isRecord(result.data) || typeof result.data.name !== "string"
    ) {
      throw new FrappeApiError(
        "ERPNext POST /api/resource/Contact failed: malformed response",
        200,
        result,
      );
    }
    return result.data.name;
  }

  async findPrimaryContact(
    linkDoctype: "Customer" | "Supplier",
    linkName: string,
    requestOptions: FrappeRequestOptions = {},
  ): Promise<{ name: string; isPrimary: boolean } | null> {
    const filters = JSON.stringify([
      ["Dynamic Link", "link_doctype", "=", linkDoctype],
      ["Dynamic Link", "link_name", "=", linkName],
    ]);
    const fields = JSON.stringify(["name", "is_primary_contact"]);
    const query = `?filters=${encodeURIComponent(filters)}&fields=${
      encodeURIComponent(fields)
    }&order_by=${
      encodeURIComponent("is_primary_contact desc, creation asc")
    }&limit_page_length=1`;
    const result = await this.request<FrappeListResponse<FrappeDoc>>(
      "GET",
      `/api/resource/Contact${query}`,
      "/api/resource/Contact",
      requestOptions,
    );
    if (!result || !Array.isArray(result.data) || result.data.length === 0) {
      return null;
    }
    const first = result.data[0];
    if (typeof first?.name !== "string") return null;
    return {
      name: String(first.name),
      isPrimary: first.is_primary_contact === 1,
    };
  }

  async updateContact(
    contactName: string,
    opts: { email?: string; phone?: string },
    requestOptions: FrappeRequestOptions = {},
  ): Promise<void> {
    type ContactFields = FrappeDoc & {
      email_ids: Array<Record<string, unknown>>;
      phone_nos: Array<Record<string, unknown>>;
    };
    const existing = await this.request<FrappeDocResponse<ContactFields>>(
      "GET",
      `/api/resource/Contact/${encodeURIComponent(contactName)}`,
      `/api/resource/Contact/${contactName}`,
      requestOptions,
    );

    const emailIds: Array<Record<string, unknown>> = Array.isArray(
        existing?.data?.email_ids,
      )
      ? (existing.data.email_ids as Array<Record<string, unknown>>).map((
        e,
      ) => ({
        ...e,
      }))
      : [];
    const phoneNos: Array<Record<string, unknown>> = Array.isArray(
        existing?.data?.phone_nos,
      )
      ? (existing.data.phone_nos as Array<Record<string, unknown>>).map((
        p,
      ) => ({
        ...p,
      }))
      : [];

    const payload: Record<string, unknown> = {};

    if (opts.email) {
      const primaryIdx = emailIds.findIndex((e) => e.is_primary === 1);
      if (primaryIdx >= 0) {
        emailIds[primaryIdx] = {
          ...emailIds[primaryIdx],
          email_id: opts.email,
        };
      } else {
        emailIds.push({ email_id: opts.email, is_primary: 1 });
      }
      payload.email_ids = emailIds;
    }

    if (opts.phone) {
      const primaryIdx = phoneNos.findIndex((p) =>
        p.is_primary_mobile_no === 1
      );
      if (primaryIdx >= 0) {
        phoneNos[primaryIdx] = { ...phoneNos[primaryIdx], phone: opts.phone };
      } else {
        phoneNos.push({ phone: opts.phone, is_primary_mobile_no: 1 });
      }
      payload.phone_nos = phoneNos;
    }

    await this.request<FrappeDocResponse<FrappeDoc>>(
      "PUT",
      `/api/resource/Contact/${encodeURIComponent(contactName)}`,
      `/api/resource/Contact/${contactName}`,
      { ...requestOptions, body: JSON.stringify(payload) },
    );
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

  async create<T extends FrappeDoc>(
    doctype: string,
    data: Record<string, unknown>,
    requestOptions: FrappeRequestOptions = {},
  ): Promise<T> {
    const resourcePath = `/api/resource/${encodeURIComponent(doctype)}`;
    const result = await this.request<FrappeDocResponse<T>>(
      "POST",
      resourcePath,
      resourcePath,
      { ...requestOptions, body: JSON.stringify(data) },
    );
    if (!result || !isRecord(result.data)) {
      throw new FrappeApiError(
        `ERPNext POST ${resourcePath} failed: malformed response: data must be an object`,
        200,
        result,
      );
    }
    return result.data;
  }

  async update<T extends FrappeDoc>(
    doctype: string,
    name: string,
    data: Record<string, unknown>,
    requestOptions: FrappeRequestOptions = {},
  ): Promise<T> {
    const resourcePath = `/api/resource/${encodeURIComponent(doctype)}/${
      encodeURIComponent(name)
    }`;
    const result = await this.request<FrappeDocResponse<T>>(
      "PUT",
      resourcePath,
      resourcePath,
      { ...requestOptions, body: JSON.stringify(data) },
    );
    if (!result || !isRecord(result.data)) {
      throw new FrappeApiError(
        `ERPNext PUT ${resourcePath} failed: malformed response: data must be an object`,
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
      const headers: Record<string, string> = {
        "accept": "application/json",
        "authorization": this.authHeader,
      };
      if (options.body !== undefined) {
        headers["content-type"] = "application/json";
      }
      response = await fetch(`${this.baseUrl}${path}`, {
        method,
        headers,
        body: options.body,
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

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
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
