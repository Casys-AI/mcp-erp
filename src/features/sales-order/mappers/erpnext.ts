import { mapErpNextLifecycle } from "../../../domain/lifecycle.ts";
import type { NormalizedPayload } from "../../../domain/normalized.ts";
import { assertNativeId } from "../../../domain/normalized.ts";
import type { ErpNextSalesOrder } from "../../../platform/erp/erpnext/types.ts";
import type {
  NativeSalesOrderSubmitPlan,
  NativeSalesOrderToolPlan,
  SalesDocumentLineInput,
  SalesDocumentSubmitInput,
  SalesOrderCreateInput,
} from "../../shared/sales-document.types.ts";

// ── Write mappers ─────────────────────────────────────────────────────────────

export type ErpNextSalesOrderCreatePlan = NativeSalesOrderToolPlan<
  "erpnext.sales_order_create"
>;

/**
 * Map a normalized SalesOrderCreateInput to an ERPNext native tool plan.
 * Caller (handler) MUST ensure deliveryDate is present when erpType is erpnext
 * before calling this mapper.
 */
export function mapSalesOrderCreateToErpNext(
  input: SalesOrderCreateInput,
): ErpNextSalesOrderCreatePlan {
  const args: Record<string, unknown> = {
    mode: input.mode,
    customer: input.customerId,
    delivery_date: input.deliveryDate!,
    items: input.lines.map(mapLineToErpNextItem),
  };
  if (input.date !== undefined) args.transaction_date = input.date;
  return { toolName: "erpnext.sales_order_create", args };
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

// ── Submit mappers ────────────────────────────────────────────────────────────

export type ErpNextSalesOrderSubmitPlan = NativeSalesOrderSubmitPlan<
  "erpnext.sales_order_submit"
>;

/** Map a normalized SalesDocumentSubmitInput to an ERPNext sales-order submit plan. */
export function mapSalesOrderSubmitToErpNext(
  input: SalesDocumentSubmitInput,
): ErpNextSalesOrderSubmitPlan {
  return {
    toolName: "erpnext.sales_order_submit",
    args: { mode: input.mode, name: input.nativeId },
  };
}

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
