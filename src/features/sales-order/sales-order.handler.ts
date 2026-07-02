import type {
  ErpAdapter,
  ErpToolCallContext,
  ErpToolCallResult,
} from "../../domain/adapter.ts";
import type { ErpType } from "../../domain/connection.ts";
import { parseWriteMode, WriteError } from "../../domain/write.ts";
import {
  assertDateRange,
  optIsoDate,
  parseSalesDocumentLines,
} from "../shared/sales-document-validation.ts";
import type { SalesOrderCreateInput } from "../shared/sales-document.types.ts";
import {
  extractDoc,
  parseDolibarrNumericId,
  reqString,
  resolveNativeId,
} from "../shared/handler-utils.ts";
import {
  mapSalesOrderCreateToDolibarr,
  normalizeDolibarrOrder,
} from "./mappers/dolibarr.ts";
import {
  mapSalesOrderCreateToErpNext,
  normalizeErpNextSalesOrder,
} from "./mappers/erpnext.ts";

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

    return undefined;
  }

  if (name === "erp.sales_order_create") {
    const mode = parseWriteMode(args);
    const customerId = reqString("customerId", args.customerId, erpType);
    const lines = parseSalesDocumentLines(args, erpType);
    const date = optIsoDate("date", args.date, erpType);
    const deliveryDate = optIsoDate("deliveryDate", args.deliveryDate, erpType);

    if (
      deliveryDate !== undefined && date !== undefined &&
      deliveryDate < date
    ) {
      assertDateRange("deliveryDate", deliveryDate, date, erpType);
    }

    const input: SalesOrderCreateInput = {
      mode,
      customerId,
      lines,
      date,
      deliveryDate,
    };

    if (erpType === "erpnext" && nativeAdapter) {
      if (deliveryDate === undefined) {
        throw new WriteError(
          "MISSING_REQUIRED_FIELD",
          { field: "deliveryDate", erpType: "erpnext" },
          "deliveryDate is required for ERPNext Sales Order; pass a YYYY-MM-DD date.",
        );
      }
      const nativePlan = mapSalesOrderCreateToErpNext(input);
      const r = await nativeAdapter.callTool(
        nativePlan.toolName,
        nativePlan.args,
        ctx,
      );
      return {
        content: { ...(r.content as Record<string, unknown>), erpType },
      };
    }

    if (erpType === "dolibarr" && nativeAdapter) {
      const socid = parseDolibarrNumericId(customerId);
      const nativePlan = mapSalesOrderCreateToDolibarr(input, socid);
      const r = await nativeAdapter.callTool(
        nativePlan.toolName,
        nativePlan.args,
        ctx,
      );
      return {
        content: { ...(r.content as Record<string, unknown>), erpType },
      };
    }

    return undefined;
  }

  return undefined;
}
