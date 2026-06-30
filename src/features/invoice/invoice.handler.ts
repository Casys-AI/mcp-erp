import type {
  ErpAdapter,
  ErpToolCallContext,
  ErpToolCallResult,
} from "../../domain/adapter.ts";
import type { ErpType } from "../../domain/connection.ts";
import {
  extractDoc,
  parseDolibarrNumericId,
  resolveNativeId,
} from "../shared/handler-utils.ts";
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
