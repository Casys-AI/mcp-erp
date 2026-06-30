import { mapDolibarrLifecycle } from "../../../domain/lifecycle.ts";
import type {
  NormalizedPayload,
  NormalizedView,
} from "../../../domain/normalized.ts";
import { assertNativeId } from "../../../domain/normalized.ts";
import { mapDolibarrDocData } from "../../../platform/erp/dolibarr/adapter.ts";
import type { DolibarrOrder } from "../../../platform/erp/dolibarr/types.ts";

export function normalizeDolibarrOrder(
  raw: DolibarrOrder,
): NormalizedPayload<DolibarrOrder> {
  const nativeId = assertNativeId(raw.id, "dolibarr", "commande");
  const mapped = mapDolibarrDocData(raw as Record<string, unknown>, "order");
  return {
    nativeId,
    nativeType: "commande",
    erpType: "dolibarr",
    lifecycleState: mapDolibarrLifecycle("order", raw.statut),
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
    dueDate: typeof mapped.delivery_date === "string"
      ? mapped.delivery_date
      : undefined,
  };
}
