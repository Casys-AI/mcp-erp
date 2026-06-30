import type {
  ErpAdapter,
  ErpToolCallContext,
  ErpToolCallResult,
} from "../../domain/adapter.ts";
import type { ErpType } from "../../domain/connection.ts";
import { invalidNativeIdError } from "../../domain/normalized.ts";
import { normalizeDolibarrInvoice } from "./mappers/dolibarr.ts";
import { normalizeErpNextSalesInvoice } from "./mappers/erpnext.ts";

export async function callInvoiceTool(
  params: {
    readonly name: string;
    readonly args: Record<string, unknown>;
    readonly ctx: ErpToolCallContext;
    readonly erpType: ErpType;
    readonly nativeAdapter?: ErpAdapter;
  },
): Promise<ErpToolCallResult | undefined> {
  const { name, args, ctx, erpType, nativeAdapter } = params;
  if (name !== "erp.sales_invoice_get") return undefined;

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

  return undefined;
}

function resolveNativeId(args: Record<string, unknown>): string {
  const id = args.nativeId;
  if (typeof id !== "string" || id.length === 0) {
    throw new TypeError("nativeId must be a non-empty string");
  }
  return id;
}

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
