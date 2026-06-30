import type { NormalizedPayload } from "../../../domain/normalized.ts";
import { assertNativeId } from "../../../domain/normalized.ts";
import type { ErpNextItem } from "../../../platform/erp/erpnext/types.ts";
import type {
  NativeProductToolPlan,
  ProductCreateInput,
  ProductUpdateInput,
} from "../product.types.ts";

export type ErpNextProductCreatePlan = NativeProductToolPlan<
  "erpnext.item_create"
>;
export type ErpNextProductUpdatePlan = NativeProductToolPlan<
  "erpnext.item_update"
>;

export function mapProductCreateToErpNext(
  input: ProductCreateInput,
): ErpNextProductCreatePlan {
  const args: Record<string, unknown> = {
    mode: input.mode,
    item_name: input.name,
    item_code: input.sku,
    is_stock_item: input.kind === "service" ? 0 : 1,
  };
  assignNumber(args, "standard_rate", input.unitPrice);
  assignString(args, "stock_uom", input.uom);
  return { toolName: "erpnext.item_create", args };
}

export function mapProductUpdateToErpNext(
  input: ProductUpdateInput,
): ErpNextProductUpdatePlan {
  const args: Record<string, unknown> = {
    mode: input.mode,
    name: input.nativeId,
  };
  assignString(args, "item_name", input.name);
  assignNumber(args, "standard_rate", input.unitPrice);
  assignString(args, "stock_uom", input.uom);
  return { toolName: "erpnext.item_update", args };
}

function assignString(
  args: Record<string, unknown>,
  field: string,
  value: string | undefined,
): void {
  if (value !== undefined) args[field] = value;
}

export function normalizeErpNextItem(
  raw: ErpNextItem,
): NormalizedPayload<ErpNextItem> {
  const nativeId = assertNativeId(
    raw.name && raw.name.length > 0 ? raw.name : null,
    "erpnext",
    "Item",
  );
  const ref = typeof raw.item_code === "string" && raw.item_code
    ? raw.item_code
    : nativeId;
  return {
    nativeId,
    nativeType: "Item",
    erpType: "erpnext",
    lifecycleState: "unknown",
    availableActions: [],
    data: { ref },
    _raw: raw,
  };
}

function assignNumber(
  args: Record<string, unknown>,
  field: string,
  value: number | undefined,
): void {
  if (value !== undefined) args[field] = value;
}
