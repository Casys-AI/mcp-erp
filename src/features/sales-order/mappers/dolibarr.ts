import { mapDolibarrLifecycle } from "../../../domain/lifecycle.ts";
import type {
  NormalizedPayload,
  NormalizedView,
} from "../../../domain/normalized.ts";
import { assertNativeId } from "../../../domain/normalized.ts";
import { mapDolibarrDocData } from "../../../platform/erp/dolibarr/handlers/documents.ts";
import type { DolibarrOrder } from "../../../platform/erp/dolibarr/types.ts";
import type {
  NativeSalesOrderSubmitPlan,
  NativeSalesOrderToolPlan,
  SalesDocumentLineInput,
  SalesDocumentSubmitInput,
  SalesOrderCreateInput,
} from "../../shared/sales-document.types.ts";

// ── Write mappers ─────────────────────────────────────────────────────────────

export type DolibarrSalesOrderCreatePlan = NativeSalesOrderToolPlan<
  "dolibarr.order_create"
>;

/**
 * Map a normalized SalesOrderCreateInput + parsed socid to a Dolibarr native
 * tool plan. ISO dates are passed as-is; the native handler converts to epoch.
 */
export function mapSalesOrderCreateToDolibarr(
  input: SalesOrderCreateInput,
  socid: number,
): DolibarrSalesOrderCreatePlan {
  const args: Record<string, unknown> = {
    mode: input.mode,
    socid,
    lines: input.lines.map(mapLineToDolibarrLine),
  };
  if (input.date !== undefined) args.date = input.date;
  if (input.deliveryDate !== undefined) args.delivery_date = input.deliveryDate;
  return { toolName: "dolibarr.order_create", args };
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

// ── Submit mappers ────────────────────────────────────────────────────────────

export type DolibarrSalesOrderSubmitPlan = NativeSalesOrderSubmitPlan<
  "dolibarr.order_validate"
>;

/**
 * Map a normalized SalesDocumentSubmitInput to a Dolibarr order-validate plan.
 * @param id  Parsed positive integer from the normalized nativeId.
 */
export function mapSalesOrderSubmitToDolibarr(
  input: SalesDocumentSubmitInput,
  id: number,
): DolibarrSalesOrderSubmitPlan {
  return {
    toolName: "dolibarr.order_validate",
    args: { mode: input.mode, id },
  };
}

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
