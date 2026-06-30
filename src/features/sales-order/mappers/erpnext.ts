import { mapErpNextLifecycle } from "../../../domain/lifecycle.ts";
import type { NormalizedPayload } from "../../../domain/normalized.ts";
import { assertNativeId } from "../../../domain/normalized.ts";
import type { ErpNextSalesOrder } from "../../../platform/erp/erpnext/types.ts";

export function normalizeErpNextSalesOrder(
  raw: ErpNextSalesOrder,
): NormalizedPayload<ErpNextSalesOrder> {
  const nativeId = assertNativeId(
    raw.name && raw.name.length > 0 ? raw.name : null,
    "erpnext",
    "Sales Order",
  );
  return {
    nativeId,
    nativeType: "Sales Order",
    erpType: "erpnext",
    lifecycleState: mapErpNextLifecycle(
      typeof raw.status === "string" ? raw.status : "",
      "Sales Order",
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
      date: typeof raw.transaction_date === "string" && raw.transaction_date
        ? raw.transaction_date
        : undefined,
      dueDate: typeof raw.delivery_date === "string" && raw.delivery_date
        ? raw.delivery_date
        : undefined,
    },
    _raw: raw,
  };
}
