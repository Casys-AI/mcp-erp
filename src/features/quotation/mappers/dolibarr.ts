import { mapDolibarrLifecycle } from "../../../domain/lifecycle.ts";
import type {
  NormalizedPayload,
  NormalizedView,
} from "../../../domain/normalized.ts";
import { assertNativeId } from "../../../domain/normalized.ts";
import { mapDolibarrDocData } from "../../../platform/erp/dolibarr/adapter.ts";
import type { DolibarrProposal } from "../../../platform/erp/dolibarr/types.ts";

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
