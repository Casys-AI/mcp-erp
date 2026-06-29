/**
 * NormalizedAdapter — Wave 3.
 *
 * A cross-ERP adapter that wraps one or more native adapters and exposes a
 * unified `erp.*` tool surface. Consumers get normalized `NormalizedPayload<T>`
 * objects regardless of whether the backend is ERPNext or Dolibarr.
 *
 * ## Design choices
 *
 * ### erpType property
 * `NormalizedAdapter` does NOT fit the `ErpAdapter.erpType: ErpType` constraint
 * (`ErpType = "erpnext" | "dolibarr"`) — it is cross-ERP by nature. It
 * implements the same duck-type interface (tools / callTool / dispose) but is
 * NOT registered in `registry.ts` and NOT included in `tool-catalog.ts`.
 * Instantiate it manually with `new NormalizedAdapter(adapters)`.
 *
 * ### _list tools
 * `erp.*_list` tools delegate to the native adapter's corresponding list tool
 * and normalize each item inline from the raw array. This avoids N+1 GET
 * round-trips. The normalized list item carries fewer fields than a full
 * `_get` result (no deep mapDolibarr* processing on list items).
 * Return shape: `{ items: NormalizedPayload[], count: number }`.
 *
 * ### _get tools
 * `erp.*_get` tools call the native adapter's get tool, extract the single raw
 * doc from `content`, and run the full normalizer from `normalizers.ts`.
 *
 * ### Error surface
 * - Unknown `erpType` in args → `NormalizedError(UNKNOWN_ERP_TYPE)`.
 * - Unknown tool name → `NormalizedError(UNKNOWN_TOOL)`.
 * - Missing native ID in raw doc → `NormalizedError(MISSING_NATIVE_ID)` from
 *   the normalizer (propagates unchanged).
 *
 * @module @casys/mcp-erp/normalized-adapter
 */

import type {
  ErpAdapter,
  ErpToolCallContext,
  ErpToolCallResult,
  ErpToolDefinition,
} from "./adapter.ts";
import type { NormalizedPayload } from "./normalized.ts";
import { invalidNativeIdError, NormalizedError } from "./normalized.ts";
import {
  normalizeDolibarrInvoice,
  normalizeDolibarrOrder,
  normalizeDolibarrParty,
  normalizeDolibarrProduct,
  normalizeDolibarrProposal,
  normalizeErpNextCustomer,
  normalizeErpNextItem,
  normalizeErpNextQuotation,
  normalizeErpNextSalesInvoice,
  normalizeErpNextSalesOrder,
  normalizeErpNextSupplier,
} from "./adapters/normalizers.ts";

// ─── Tool definitions ─────────────────────────────────────────────────────────

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

const NORMALIZED_TOOLS: readonly ErpToolDefinition[] = [
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
    name: "erp.sales_invoice_get",
    description: "Get one sales invoice by native ID in normalized form.",
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
    name: "erp.quotation_get",
    description:
      "Get one quotation / commercial proposal by native ID in normalized form.",
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
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Extract string erpType from args, throwing NormalizedError if invalid. */
function resolveErpType(
  args: Record<string, unknown>,
  toolName: string,
): "erpnext" | "dolibarr" {
  const erpType = args.erpType;
  if (erpType !== "erpnext" && erpType !== "dolibarr") {
    throw new NormalizedError(
      "UNKNOWN_ERP_TYPE",
      `Unknown ERP type: ${String(erpType)} — expected 'erpnext' or 'dolibarr'`,
      { erpType, toolName },
      "Pass 'erpnext' or 'dolibarr' as the erpType argument",
    );
  }
  return erpType;
}

/** Resolve nativeId string from args. */
function resolveNativeId(args: Record<string, unknown>): string {
  const id = args.nativeId;
  if (typeof id !== "string" || id.length === 0) {
    throw new TypeError("nativeId must be a non-empty string");
  }
  return id;
}

/**
 * Resolve partyKind — fast-fail on any value other than undefined,
 * 'customer', or 'supplier' (AX principle 5: no silent fallback).
 */
function resolvePartyKind(
  args: Record<string, unknown>,
): "customer" | "supplier" {
  const kind = args.partyKind;
  if (kind === undefined || kind === "customer") return "customer";
  if (kind === "supplier") return "supplier";
  throw new NormalizedError(
    "INVALID_PARTY_KIND",
    `Invalid partyKind '${String(kind)}' — expected 'customer' or 'supplier'`,
    { partyKind: kind },
    "Pass 'customer' or 'supplier' as the partyKind argument, or omit it to default to 'customer'",
  );
}

/**
 * Validate that a Dolibarr nativeId is a strict positive decimal integer.
 * `parseInt('42abc', 10)` silently returns 42 — this guard rejects it.
 */
function parseDolibarrNumericId(nativeId: string): number {
  if (!/^\d+$/.test(nativeId)) {
    throw invalidNativeIdError(nativeId, "dolibarr");
  }
  const n = Number(nativeId);
  if (!Number.isInteger(n) || n <= 0) {
    throw invalidNativeIdError(nativeId, "dolibarr");
  }
  return n;
}

/** Extract array from native list result content. */
function extractArray(
  content: unknown,
  key: string,
): Record<string, unknown>[] {
  if (
    content && typeof content === "object" &&
    Array.isArray((content as Record<string, unknown>)[key])
  ) {
    return (content as Record<string, unknown>)[key] as Record<
      string,
      unknown
    >[];
  }
  return [];
}

/** Extract single doc from native get result content. */
function extractDoc(
  content: unknown,
  key: string,
): Record<string, unknown> {
  if (content && typeof content === "object") {
    const val = (content as Record<string, unknown>)[key];
    if (val && typeof val === "object" && !Array.isArray(val)) {
      return val as Record<string, unknown>;
    }
  }
  return {};
}

// ─── NormalizedAdapter ────────────────────────────────────────────────────────

/** Options for constructing a NormalizedAdapter. */
export interface NormalizedAdapterOptions {
  erpnext?: ErpAdapter;
  dolibarr?: ErpAdapter;
}

/**
 * Cross-ERP adapter that exposes 7 normalized `erp.*` tools.
 *
 * Does NOT implement `ErpAdapter` formally (the `erpType` constraint is
 * `'erpnext' | 'dolibarr'`, incompatible with this cross-ERP adapter).
 * It shares the same duck-type interface: `tools()`, `callTool()`, `dispose()`.
 *
 * Not registered in the registry; instantiate manually with
 * `new NormalizedAdapter({ erpnext: myErpnextAdapter, dolibarr: myDolibarrAdapter })`.
 */
export class NormalizedAdapter {
  readonly #erpnext?: ErpAdapter;
  readonly #dolibarr?: ErpAdapter;

  constructor(options: NormalizedAdapterOptions) {
    this.#erpnext = options.erpnext;
    this.#dolibarr = options.dolibarr;
  }

  /** Returns the 7 normalized tool definitions (fresh copy each call). */
  tools(): ErpToolDefinition[] {
    return NORMALIZED_TOOLS.map((tool) => ({
      ...tool,
      inputSchema: structuredClone(tool.inputSchema),
      ...(tool.annotations
        ? { annotations: structuredClone(tool.annotations) }
        : {}),
    }));
  }

  /** Dispatch a normalized `erp.*` tool call. */
  async callTool(
    name: string,
    args: Record<string, unknown>,
    ctx: ErpToolCallContext,
  ): Promise<ErpToolCallResult> {
    const knownNames = NORMALIZED_TOOLS.map((t) => t.name);
    if (!knownNames.includes(name)) {
      throw new NormalizedError(
        "UNKNOWN_TOOL",
        `Unknown normalized tool: '${name}'`,
        { toolName: name },
        `Use one of: ${knownNames.join(", ")}`,
      );
    }

    const erpType = resolveErpType(args, name);
    const nativeAdapter = erpType === "erpnext"
      ? this.#erpnext
      : this.#dolibarr;

    // ── business_party_get ──────────────────────────────────────────────────
    if (name === "erp.business_party_get") {
      const nativeId = resolveNativeId(args);
      const partyKind = resolvePartyKind(args);

      if (erpType === "erpnext" && nativeAdapter) {
        const nativeTool = partyKind === "supplier"
          ? "erpnext.supplier_get"
          : "erpnext.customer_get";
        const r = await nativeAdapter.callTool(
          nativeTool,
          { name: nativeId },
          ctx,
        );
        const raw = partyKind === "supplier"
          ? extractDoc(r.content, "supplier")
          : extractDoc(r.content, "customer");
        const payload = partyKind === "supplier"
          ? normalizeErpNextSupplier(raw)
          : normalizeErpNextCustomer(raw);
        return { content: payload };
      }

      if (erpType === "dolibarr" && nativeAdapter) {
        const id = parseDolibarrNumericId(nativeId);
        const r = await nativeAdapter.callTool(
          "dolibarr.thirdparty_get",
          { id },
          ctx,
        );
        const raw = extractDoc(r.content, "thirdparty");
        return { content: normalizeDolibarrParty(raw) };
      }
    }

    // ── business_party_list ─────────────────────────────────────────────────
    if (name === "erp.business_party_list") {
      const partyKind = resolvePartyKind(args);
      const limit = typeof args.limit === "number" ? args.limit : 20;
      const page = typeof args.page === "number" ? args.page : 0;

      if (erpType === "erpnext" && nativeAdapter) {
        const nativeTool = partyKind === "supplier"
          ? "erpnext.supplier_list"
          : "erpnext.customer_list";
        const r = await nativeAdapter.callTool(
          nativeTool,
          { limit, limitStart: page * limit },
          ctx,
        );
        const listKey = partyKind === "supplier" ? "suppliers" : "customers";
        const rawList = extractArray(r.content, listKey);
        const items: NormalizedPayload[] = rawList.map((raw) =>
          partyKind === "supplier"
            ? normalizeErpNextSupplier(raw)
            : normalizeErpNextCustomer(raw)
        );
        return { content: { items, count: items.length } };
      }

      if (erpType === "dolibarr" && nativeAdapter) {
        const modeArg = partyKind === "supplier" ? "supplier" : "customer";
        const r = await nativeAdapter.callTool(
          "dolibarr.thirdparty_list",
          { limit, page, mode: modeArg },
          ctx,
        );
        const rawList = extractArray(r.content, "thirdparties");
        const items: NormalizedPayload[] = rawList.map((raw) =>
          normalizeDolibarrParty(raw)
        );
        return { content: { items, count: items.length } };
      }
    }

    // ── catalog_item_get ────────────────────────────────────────────────────
    if (name === "erp.catalog_item_get") {
      const nativeId = resolveNativeId(args);

      if (erpType === "erpnext" && nativeAdapter) {
        const r = await nativeAdapter.callTool(
          "erpnext.item_get",
          { name: nativeId },
          ctx,
        );
        return { content: normalizeErpNextItem(extractDoc(r.content, "item")) };
      }

      if (erpType === "dolibarr" && nativeAdapter) {
        const id = parseDolibarrNumericId(nativeId);
        const r = await nativeAdapter.callTool(
          "dolibarr.product_get",
          { id },
          ctx,
        );
        return {
          content: normalizeDolibarrProduct(extractDoc(r.content, "product")),
        };
      }
    }

    // ── catalog_item_list ───────────────────────────────────────────────────
    if (name === "erp.catalog_item_list") {
      const limit = typeof args.limit === "number" ? args.limit : 20;
      const page = typeof args.page === "number" ? args.page : 0;

      if (erpType === "erpnext" && nativeAdapter) {
        const r = await nativeAdapter.callTool(
          "erpnext.item_list",
          { limit, limitStart: page * limit },
          ctx,
        );
        const rawList = extractArray(r.content, "items");
        const items: NormalizedPayload[] = rawList.map((raw) =>
          normalizeErpNextItem(raw)
        );
        return { content: { items, count: items.length } };
      }

      if (erpType === "dolibarr" && nativeAdapter) {
        const r = await nativeAdapter.callTool(
          "dolibarr.product_list",
          { limit, page },
          ctx,
        );
        const rawList = extractArray(r.content, "products");
        const items: NormalizedPayload[] = rawList.map((raw) =>
          normalizeDolibarrProduct(raw)
        );
        return { content: { items, count: items.length } };
      }
    }

    // ── sales_invoice_get ───────────────────────────────────────────────────
    if (name === "erp.sales_invoice_get") {
      const nativeId = resolveNativeId(args);

      if (erpType === "erpnext" && nativeAdapter) {
        const r = await nativeAdapter.callTool(
          "erpnext.sales_invoice_get",
          { name: nativeId },
          ctx,
        );
        return {
          content: normalizeErpNextSalesInvoice(
            extractDoc(r.content, "salesInvoice"),
          ),
        };
      }

      if (erpType === "dolibarr" && nativeAdapter) {
        const id = parseDolibarrNumericId(nativeId);
        const r = await nativeAdapter.callTool(
          "dolibarr.invoice_get",
          { id },
          ctx,
        );
        return {
          content: normalizeDolibarrInvoice(extractDoc(r.content, "invoice")),
        };
      }
    }

    // ── sales_order_get ─────────────────────────────────────────────────────
    if (name === "erp.sales_order_get") {
      const nativeId = resolveNativeId(args);

      if (erpType === "erpnext" && nativeAdapter) {
        const r = await nativeAdapter.callTool(
          "erpnext.sales_order_get",
          { name: nativeId },
          ctx,
        );
        return {
          content: normalizeErpNextSalesOrder(
            extractDoc(r.content, "salesOrder"),
          ),
        };
      }

      if (erpType === "dolibarr" && nativeAdapter) {
        const id = parseDolibarrNumericId(nativeId);
        const r = await nativeAdapter.callTool(
          "dolibarr.order_get",
          { id },
          ctx,
        );
        return {
          content: normalizeDolibarrOrder(extractDoc(r.content, "order")),
        };
      }
    }

    // ── quotation_get ───────────────────────────────────────────────────────
    if (name === "erp.quotation_get") {
      const nativeId = resolveNativeId(args);

      if (erpType === "erpnext" && nativeAdapter) {
        const r = await nativeAdapter.callTool(
          "erpnext.quotation_get",
          { name: nativeId },
          ctx,
        );
        return {
          content: normalizeErpNextQuotation(
            extractDoc(r.content, "quotation"),
          ),
        };
      }

      if (erpType === "dolibarr" && nativeAdapter) {
        const id = parseDolibarrNumericId(nativeId);
        const r = await nativeAdapter.callTool(
          "dolibarr.proposal_get",
          { id },
          ctx,
        );
        return {
          content: normalizeDolibarrProposal(extractDoc(r.content, "proposal")),
        };
      }
    }

    // Should not reach here if erpType is valid — native adapter must be set.
    throw new NormalizedError(
      "ADAPTER_NOT_CONFIGURED",
      `No ${erpType} adapter configured for tool ${name}`,
      { erpType, toolName: name },
      `Provide a ${erpType} adapter when constructing NormalizedAdapter`,
    );
  }

  /** No-op — NormalizedAdapter does not own resources directly. */
  dispose(): void {
    // Individual native adapters manage their own resources.
  }
}
