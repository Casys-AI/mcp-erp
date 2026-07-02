import { mapDolibarrLifecycle } from "../../../domain/lifecycle.ts";
import type {
  NormalizedPayload,
  NormalizedView,
} from "../../../domain/normalized.ts";
import { assertNativeId } from "../../../domain/normalized.ts";
import { mapDolibarrDocData } from "../../../platform/erp/dolibarr/handlers/documents.ts";
import type { DolibarrProposal } from "../../../platform/erp/dolibarr/types.ts";
import type {
  NativeQuotationToolPlan,
  QuotationCreateInput,
  SalesDocumentLineInput,
} from "../../shared/sales-document.types.ts";

// ── Write mappers ─────────────────────────────────────────────────────────────

export type DolibarrQuotationCreatePlan = NativeQuotationToolPlan<
  "dolibarr.proposal_create"
>;

/**
 * Map a normalized QuotationCreateInput + parsed socid to a Dolibarr native
 * tool plan. validUntil is passed as ISO valid_until; the native handler derives
 * duree_validite.
 */
export function mapQuotationCreateToDolibarr(
  input: QuotationCreateInput,
  socid: number,
): DolibarrQuotationCreatePlan {
  const args: Record<string, unknown> = {
    mode: input.mode,
    socid,
    lines: input.lines.map(mapLineToDolibarrLine),
  };
  if (input.date !== undefined) args.date = input.date;
  if (input.validUntil !== undefined) args.valid_until = input.validUntil;
  return { toolName: "dolibarr.proposal_create", args };
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

export function normalizeDolibarrProposal(
  raw: DolibarrProposal,
): NormalizedPayload<DolibarrProposal> {
  const nativeId = assertNativeId(raw.id, "dolibarr", "propal");
  const mapped = mapDolibarrDocData(raw as Record<string, unknown>, "proposal");
  return {
    nativeId,
    nativeType: "propal",
    erpType: "dolibarr",
    lifecycleState: mapDolibarrLifecycle("proposal", raw.statut),
    availableActions: [],
    data: dolibarrDocDataToView(mapped, nativeId),
    _raw: raw,
  };
}

function dolibarrDocDataToView(
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
    date: typeof mapped.transaction_date === "string"
      ? mapped.transaction_date
      : undefined,
    dueDate: typeof mapped.valid_till === "string"
      ? mapped.valid_till
      : typeof mapped.delivery_date === "string"
      ? mapped.delivery_date
      : undefined,
  };
}
