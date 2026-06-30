import { mapErpNextLifecycle } from "../../../domain/lifecycle.ts";
import type { NormalizedPayload } from "../../../domain/normalized.ts";
import { assertNativeId } from "../../../domain/normalized.ts";
import type { ErpNextQuotation } from "../../../platform/erp/erpnext/types.ts";

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
