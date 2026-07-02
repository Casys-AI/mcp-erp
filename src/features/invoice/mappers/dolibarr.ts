import { mapDolibarrLifecycle } from "../../../domain/lifecycle.ts";
import type {
  NormalizedPayload,
  NormalizedView,
} from "../../../domain/normalized.ts";
import { assertNativeId } from "../../../domain/normalized.ts";
import { mapDolibarrInvoice } from "../../../platform/erp/dolibarr/handlers/documents.ts";
import type { DolibarrInvoice } from "../../../platform/erp/dolibarr/types.ts";
import type {
  NativeSalesInvoiceToolPlan,
  SalesDocumentLineInput,
  SalesInvoiceCreateInput,
} from "../../shared/sales-document.types.ts";

// ── Write mappers ─────────────────────────────────────────────────────────────

export type DolibarrSalesInvoiceCreatePlan = NativeSalesInvoiceToolPlan<
  "dolibarr.invoice_create"
>;

/**
 * Map a normalized SalesInvoiceCreateInput + parsed socid to a Dolibarr native
 * tool plan. dueDate is passed as ISO due_date; the native handler converts to
 * epoch and stores as date_lim_reglement.
 */
export function mapSalesInvoiceCreateToDolibarr(
  input: SalesInvoiceCreateInput,
  socid: number,
): DolibarrSalesInvoiceCreatePlan {
  const args: Record<string, unknown> = {
    mode: input.mode,
    socid,
    lines: input.lines.map(mapLineToDolibarrLine),
  };
  if (input.date !== undefined) args.date = input.date;
  if (input.dueDate !== undefined) args.due_date = input.dueDate;
  return { toolName: "dolibarr.invoice_create", args };
}

function mapLineToDolibarrLine(
  l: SalesDocumentLineInput,
): Record<string, unknown> {
  const row: Record<string, unknown> = {
    sku: l.sku,
    qty: l.qty,
    subprice: l.unitPrice,
  };
  if (l.description !== undefined) row.desc = l.description;
  return row;
}

export function normalizeDolibarrInvoice(
  raw: DolibarrInvoice,
): NormalizedPayload<DolibarrInvoice> {
  const nativeId = assertNativeId(raw.id, "dolibarr", "facture");
  const mapped = mapDolibarrInvoice(raw as Record<string, unknown>);
  return {
    nativeId,
    nativeType: "facture",
    erpType: "dolibarr",
    lifecycleState: mapDolibarrLifecycle("invoice", raw.statut, raw.paye),
    availableActions: [],
    data: dolibarrMappedToView(mapped, nativeId),
    _raw: raw,
  };
}

function dolibarrMappedToView(
  mapped: Record<string, unknown>,
  nativeId: string,
): NormalizedView {
  return {
    ref: typeof mapped.name === "string" && mapped.name
      ? mapped.name
      : nativeId,
    partyName: typeof mapped.party_name === "string"
      ? mapped.party_name
      : undefined,
    grandTotal: typeof mapped.grand_total === "number"
      ? mapped.grand_total
      : undefined,
    currency: typeof mapped.currency === "string" ? mapped.currency : undefined,
    date: typeof mapped.posting_date === "string" ||
        typeof mapped.transaction_date === "string"
      ? (mapped.posting_date as string | undefined) ??
        (mapped.transaction_date as string | undefined)
      : undefined,
    dueDate: typeof mapped.due_date === "string" ? mapped.due_date : undefined,
  };
}
