import { mapDolibarrLifecycle } from "../../../domain/lifecycle.ts";
import type {
  NormalizedPayload,
  NormalizedView,
} from "../../../domain/normalized.ts";
import { assertNativeId } from "../../../domain/normalized.ts";
import { mapDolibarrInvoice } from "../../../platform/erp/dolibarr/adapter.ts";
import type { DolibarrInvoice } from "../../../platform/erp/dolibarr/types.ts";

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
