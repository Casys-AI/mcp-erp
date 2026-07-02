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
  QuotationCreateInput,
  SalesDocumentSubmitInput,
} from "../shared/sales-document.types.ts";
import {
  extractDoc,
  parseDolibarrNumericId,
  reqString,
  resolveNativeId,
} from "../shared/handler-utils.ts";
import {
  mapQuotationCreateToDolibarr,
  mapQuotationSubmitToDolibarr,
  normalizeDolibarrProposal,
} from "./mappers/dolibarr.ts";
import {
  mapQuotationCreateToErpNext,
  mapQuotationSubmitToErpNext,
  normalizeErpNextQuotation,
} from "./mappers/erpnext.ts";

export async function callQuotationTool(
  params: {
    readonly name: string;
    readonly args: Record<string, unknown>;
    readonly ctx: ErpToolCallContext;
    readonly erpType: ErpType;
    readonly nativeAdapter?: ErpAdapter;
  },
): Promise<ErpToolCallResult | undefined> {
  const { name, args, ctx, erpType, nativeAdapter } = params;

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

    return undefined;
  }

  if (name === "erp.quotation_create") {
    const mode = parseWriteMode(args);
    const customerId = reqString("customerId", args.customerId, erpType);
    const lines = parseSalesDocumentLines(args, erpType);
    const date = optIsoDate("date", args.date, erpType);
    const validUntil = optIsoDate("validUntil", args.validUntil, erpType);

    if (validUntil !== undefined && date !== undefined && validUntil < date) {
      assertDateRange("validUntil", validUntil, date, erpType);
    }

    const input: QuotationCreateInput = {
      mode,
      customerId,
      lines,
      date,
      validUntil,
    };

    if (erpType === "erpnext" && nativeAdapter) {
      const nativePlan = mapQuotationCreateToErpNext(input);
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
      const nativePlan = mapQuotationCreateToDolibarr(input, socid);
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

  if (name === "erp.quotation_submit") {
    const mode = parseWriteMode(args);
    const nativeId = resolveNativeId(args);
    const input: SalesDocumentSubmitInput = { mode, nativeId };

    if (erpType === "erpnext" && nativeAdapter) {
      const nativePlan = mapQuotationSubmitToErpNext(input);
      const r = await nativeAdapter.callTool(
        nativePlan.toolName,
        nativePlan.args,
        ctx,
      );
      const content = r.content as Record<string, unknown>;
      if (mode === "commit") {
        const resolved = content.resolved as Record<string, unknown>;
        const lifecycleState = mapErpNextLifecycle(
          typeof resolved.status === "string" ? resolved.status : "",
          "Quotation",
        );
        return { content: { ...content, lifecycleState, erpType } };
      }
      return { content: { ...content, erpType } };
    }

    if (erpType === "dolibarr" && nativeAdapter) {
      const id = parseDolibarrNumericId(nativeId);
      const nativePlan = mapQuotationSubmitToDolibarr(input, id);
      const r = await nativeAdapter.callTool(
        nativePlan.toolName,
        nativePlan.args,
        ctx,
      );
      const content = r.content as Record<string, unknown>;
      if (mode === "commit") {
        const resolved = content.resolved as Record<string, unknown>;
        const lifecycleState = mapDolibarrLifecycle(
          "proposal",
          resolved.statut,
        );
        return { content: { ...content, lifecycleState, erpType } };
      }
      return { content: { ...content, erpType } };
    }

    return undefined;
  }

  return undefined;
}
