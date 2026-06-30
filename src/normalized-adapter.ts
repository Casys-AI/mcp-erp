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
 * `erp.*_list` tools delegate through feature handlers to the native adapter's
 * corresponding list tool and normalize each item from the raw array. This
 * avoids N+1 GET round-trips. Return shape:
 * `{ items: NormalizedPayload[], count: number }`.
 *
 * ### _get tools
 * `erp.*_get` tools are implemented in feature handlers that call the native
 * adapter's get tool, extract the single raw doc from `content`, and run the
 * full normalizer for that feature.
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
} from "./domain/adapter.ts";
import { NormalizedError } from "./domain/normalized.ts";
import { WRITE_CAPABILITIES } from "./domain/write.ts";
import { BUSINESS_PARTY_TOOLS } from "./features/business-party/business-party.contract.ts";
import { callBusinessPartyTool } from "./features/business-party/business-party.handler.ts";
import { CUSTOMER_TOOLS } from "./features/customer/customer.contract.ts";
import { callCustomerTool } from "./features/customer/customer.handler.ts";
import { INVOICE_TOOLS } from "./features/invoice/invoice.contract.ts";
import { callInvoiceTool } from "./features/invoice/invoice.handler.ts";
import { PRODUCT_TOOLS } from "./features/product/product.contract.ts";
import { callProductTool } from "./features/product/product.handler.ts";
import { QUOTATION_TOOLS } from "./features/quotation/quotation.contract.ts";
import { callQuotationTool } from "./features/quotation/quotation.handler.ts";
import { SALES_ORDER_TOOLS } from "./features/sales-order/sales-order.contract.ts";
import { callSalesOrderTool } from "./features/sales-order/sales-order.handler.ts";
import { SUPPLIER_TOOLS } from "./features/supplier/supplier.contract.ts";
import { callSupplierTool } from "./features/supplier/supplier.handler.ts";

// ─── Tool definitions ─────────────────────────────────────────────────────────

const ERP_TYPE_SCHEMA = {
  type: "string",
  enum: ["erpnext", "dolibarr"],
  description: "ERP backend to target.",
};

const NORMALIZED_TOOLS: readonly ErpToolDefinition[] = [
  ...BUSINESS_PARTY_TOOLS,
  ...PRODUCT_TOOLS,
  ...INVOICE_TOOLS,
  ...SALES_ORDER_TOOLS,
  ...QUOTATION_TOOLS,
  ...CUSTOMER_TOOLS,
  ...SUPPLIER_TOOLS,
  {
    name: "erp.capabilities_describe",
    description:
      "Describe the write capabilities of the target ERP: supported tools and which normalized fields are unsupported.",
    inputSchema: {
      type: "object",
      properties: { erpType: ERP_TYPE_SCHEMA },
      required: ["erpType"],
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

// ─── NormalizedAdapter ────────────────────────────────────────────────────────

/** Options for constructing a NormalizedAdapter. */
export interface NormalizedAdapterOptions {
  erpnext?: ErpAdapter;
  dolibarr?: ErpAdapter;
}

/**
 * Cross-ERP adapter that exposes the normalized `erp.*` tool surface.
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

  /** Returns the normalized tool definitions (fresh copy each call). */
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

    // ── capabilities_describe ───────────────────────────────────────────────
    if (name === "erp.capabilities_describe") {
      // An unconfigured adapter cannot truthfully report capabilities.
      if (!nativeAdapter) {
        throw new NormalizedError(
          "ADAPTER_NOT_CONFIGURED",
          `No ${erpType} adapter configured for tool ${name}`,
          { erpType, toolName: name },
          `Provide a ${erpType} adapter when constructing NormalizedAdapter`,
        );
      }
      const caps = WRITE_CAPABILITIES[erpType];
      // TODO: missingConfiguration requires native capability introspection (deferred)
      return {
        content: {
          erpType,
          supportedTools: [...caps.tools],
          supportedFields: [],
          unsupportedFields: [...caps.unsupportedFields],
          capabilityVersion: "2026-06-30",
        },
        summary: `Capabilities for ${erpType}`,
      };
    }

    const businessParty = await callBusinessPartyTool({
      name,
      args,
      ctx,
      erpType,
      nativeAdapter,
    });
    if (businessParty) return businessParty;

    const product = await callProductTool({
      name,
      args,
      ctx,
      erpType,
      nativeAdapter,
    });
    if (product) return product;

    const invoice = await callInvoiceTool({
      name,
      args,
      ctx,
      erpType,
      nativeAdapter,
    });
    if (invoice) return invoice;

    const salesOrder = await callSalesOrderTool({
      name,
      args,
      ctx,
      erpType,
      nativeAdapter,
    });
    if (salesOrder) return salesOrder;

    const quotation = await callQuotationTool({
      name,
      args,
      ctx,
      erpType,
      nativeAdapter,
    });
    if (quotation) return quotation;

    const customer = await callCustomerTool({
      name,
      args,
      ctx,
      erpType,
      nativeAdapter,
    });
    if (customer) return customer;

    const supplier = await callSupplierTool({
      name,
      args,
      ctx,
      erpType,
      nativeAdapter,
    });
    if (supplier) return supplier;

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
