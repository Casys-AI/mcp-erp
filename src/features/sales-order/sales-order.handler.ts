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
import { normalizeDolibarrOrder } from "./mappers/dolibarr.ts";
import { normalizeErpNextSalesOrder } from "./mappers/erpnext.ts";

export async function callSalesOrderTool(
  params: {
    readonly name: string;
    readonly args: Record<string, unknown>;
    readonly ctx: ErpToolCallContext;
    readonly erpType: ErpType;
    readonly nativeAdapter?: ErpAdapter;
  },
): Promise<ErpToolCallResult | undefined> {
  const { name, args, ctx, erpType, nativeAdapter } = params;
  if (name !== "erp.sales_order_get") return undefined;

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

  return undefined;
}
