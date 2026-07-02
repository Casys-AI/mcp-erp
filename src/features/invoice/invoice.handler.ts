import type {
  ErpAdapter,
  ErpToolCallContext,
  ErpToolCallResult,
} from "../../domain/adapter.ts";
import type { ErpType } from "../../domain/connection.ts";
import { parseWriteMode } from "../../domain/write.ts";
import {
  assertDateRange,
  optIsoDate,
  parseSalesDocumentLines,
} from "../shared/sales-document-validation.ts";
import type { SalesInvoiceCreateInput } from "../shared/sales-document.types.ts";
import {
  extractDoc,
  parseDolibarrNumericId,
  reqString,
  resolveNativeId,
} from "../shared/handler-utils.ts";
import {
  mapSalesInvoiceCreateToDolibarr,
  normalizeDolibarrInvoice,
} from "./mappers/dolibarr.ts";
import {
  mapSalesInvoiceCreateToErpNext,
  normalizeErpNextSalesInvoice,
} from "./mappers/erpnext.ts";

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

    return undefined;
  }

  if (name === "erp.sales_invoice_create") {
    const mode = parseWriteMode(args);
    const customerId = reqString("customerId", args.customerId, erpType);
    const lines = parseSalesDocumentLines(args, erpType);
    const date = optIsoDate("date", args.date, erpType);
    const dueDate = optIsoDate("dueDate", args.dueDate, erpType);

    if (dueDate !== undefined && date !== undefined && dueDate < date) {
      assertDateRange("dueDate", dueDate, date, erpType);
    }

    const input: SalesInvoiceCreateInput = {
      mode,
      customerId,
      lines,
      date,
      dueDate,
    };

    if (erpType === "erpnext" && nativeAdapter) {
      const nativePlan = mapSalesInvoiceCreateToErpNext(input);
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
      const nativePlan = mapSalesInvoiceCreateToDolibarr(input, socid);
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
