import { mapErpNextLifecycle } from "../../../domain/lifecycle.ts";
import type { NormalizedPayload } from "../../../domain/normalized.ts";
import { assertNativeId } from "../../../domain/normalized.ts";
import type { ErpNextQuotation } from "../../../platform/erp/erpnext/types.ts";
import type {
  NativeQuotationToolPlan,
  QuotationCreateInput,
  SalesDocumentLineInput,
} from "../../shared/sales-document.types.ts";

// ── Write mappers ─────────────────────────────────────────────────────────────

export type ErpNextQuotationCreatePlan = NativeQuotationToolPlan<
  "erpnext.quotation_create"
>;

/**
 * Map a normalized QuotationCreateInput to an ERPNext native tool plan.
 * ERPNext Quotation uses party_name (not customer) + quotation_to: "Customer".
 * The native handler injects quotation_to; the mapper sends party_name.
 */
export function mapQuotationCreateToErpNext(
  input: QuotationCreateInput,
): ErpNextQuotationCreatePlan {
  const args: Record<string, unknown> = {
    mode: input.mode,
    party_name: input.customerId,
    items: input.lines.map(mapLineToErpNextItem),
  };
  if (input.date !== undefined) args.transaction_date = input.date;
  if (input.validUntil !== undefined) args.valid_till = input.validUntil;
  return { toolName: "erpnext.quotation_create", args };
}

function mapLineToErpNextItem(
  l: SalesDocumentLineInput,
): Record<string, unknown> {
  const row: Record<string, unknown> = {
    item_code: l.sku,
    qty: l.qty,
    rate: l.unitPrice,
  };
  if (l.description !== undefined) row.description = l.description;
  return row;
}

export function normalizeErpNextQuotation(
  raw: ErpNextQuotation,
): NormalizedPayload<ErpNextQuotation> {
  const nativeId = assertNativeId(
    raw.name && raw.name.length > 0 ? raw.name : null,
    "erpnext",
    "Quotation",
  );
  return {
    nativeId,
    nativeType: "Quotation",
    erpType: "erpnext",
    lifecycleState: mapErpNextLifecycle(
      typeof raw.status === "string" ? raw.status : "",
      "Quotation",
    ),
    availableActions: [],
    data: {
      ref: nativeId,
      partyName: typeof raw.party_name === "string" && raw.party_name
        ? raw.party_name
        : undefined,
      grandTotal: typeof raw.grand_total === "number"
        ? raw.grand_total
        : undefined,
      currency: typeof raw.currency === "string" && raw.currency
        ? raw.currency
        : undefined,
      date: typeof raw.transaction_date === "string" && raw.transaction_date
        ? raw.transaction_date
        : undefined,
      dueDate: typeof raw.valid_till === "string" && raw.valid_till
        ? raw.valid_till
        : undefined,
    },
    _raw: raw,
  };
}
