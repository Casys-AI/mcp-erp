import type {
  ErpAdapter,
  ErpToolCallContext,
  ErpToolCallResult,
} from "../../domain/adapter.ts";
import type { ErpType } from "../../domain/connection.ts";
import {
  mapDolibarrLifecycle,
  mapErpNextLifecycle,
} from "../../domain/lifecycle.ts";
import { parseWriteMode } from "../../domain/write.ts";
import {
  assertDateRange,
  optIsoDate,
  parseSalesDocumentLines,
} from "../shared/sales-document-validation.ts";
import type {
  SalesDocumentSubmitInput,
  SalesInvoiceCreateInput,
} from "../shared/sales-document.types.ts";
import {
  erpnextEffectiveStatus,
  extractDoc,
  parseDolibarrNumericId,
  reqString,
  resolveNativeId,
} from "../shared/handler-utils.ts";
import {
  mapSalesInvoiceCreateToDolibarr,
  mapSalesInvoiceSubmitToDolibarr,
  normalizeDolibarrInvoice,
} from "./mappers/dolibarr.ts";
import {
  mapSalesInvoiceCreateToErpNext,
  mapSalesInvoiceSubmitToErpNext,
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

  if (name === "erp.sales_invoice_submit") {
    const mode = parseWriteMode(args);
    const nativeId = resolveNativeId(args);
    const input: SalesDocumentSubmitInput = { mode, nativeId };

    if (erpType === "erpnext" && nativeAdapter) {
      const nativePlan = mapSalesInvoiceSubmitToErpNext(input);
      const r = await nativeAdapter.callTool(
        nativePlan.toolName,
        nativePlan.args,
        ctx,
      );
      const content = r.content as Record<string, unknown>;
      if (mode === "commit") {
        const resolved = content.resolved as Record<string, unknown>;
        const lifecycleState = mapErpNextLifecycle(
          erpnextEffectiveStatus(resolved),
          "Sales Invoice",
        );
        return { content: { ...content, lifecycleState, erpType } };
      }
      return { content: { ...content, erpType } };
    }

    if (erpType === "dolibarr" && nativeAdapter) {
      const id = parseDolibarrNumericId(nativeId);
      const nativePlan = mapSalesInvoiceSubmitToDolibarr(input, id);
      const r = await nativeAdapter.callTool(
        nativePlan.toolName,
        nativePlan.args,
        ctx,
      );
      const content = r.content as Record<string, unknown>;
      if (mode === "commit") {
        const resolved = content.resolved as Record<string, unknown>;
        const lifecycleState = mapDolibarrLifecycle("invoice", resolved.statut);
        return { content: { ...content, lifecycleState, erpType } };
      }
      return { content: { ...content, erpType } };
    }

    return undefined;
  }

  return undefined;
}
