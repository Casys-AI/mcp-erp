import { mapErpNextLifecycle } from "../../../domain/lifecycle.ts";
import type { NormalizedPayload } from "../../../domain/normalized.ts";
import { assertNativeId } from "../../../domain/normalized.ts";
import type { ErpNextSalesInvoice } from "../../../platform/erp/erpnext/types.ts";

export function normalizeErpNextSalesInvoice(
  raw: ErpNextSalesInvoice,
): NormalizedPayload<ErpNextSalesInvoice> {
  const nativeId = assertNativeId(
    raw.name && raw.name.length > 0 ? raw.name : null,
    "erpnext",
    "Sales Invoice",
  );
  return {
    nativeId,
    nativeType: "Sales Invoice",
    erpType: "erpnext",
    lifecycleState: mapErpNextLifecycle(
      typeof raw.status === "string" ? raw.status : "",
      "Sales Invoice",
    ),
    availableActions: [],
    data: {
      ref: nativeId,
      partyName: typeof raw.customer === "string" && raw.customer
        ? raw.customer
        : undefined,
      grandTotal: typeof raw.grand_total === "number"
        ? raw.grand_total
        : undefined,
      currency: typeof raw.currency === "string" && raw.currency
        ? raw.currency
        : undefined,
      date: typeof raw.posting_date === "string" && raw.posting_date
        ? raw.posting_date
        : undefined,
      dueDate: typeof raw.due_date === "string" && raw.due_date
        ? raw.due_date
        : undefined,
    },
    _raw: raw,
  };
}
