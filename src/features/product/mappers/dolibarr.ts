import type { NormalizedPayload } from "../../../domain/normalized.ts";
import { assertNativeId } from "../../../domain/normalized.ts";
import type { DolibarrProduct } from "../../../platform/erp/dolibarr/types.ts";
import type {
  DolibarrProductUpdateInput,
  NativeProductToolPlan,
  ProductCreateInput,
} from "../product.types.ts";

export type DolibarrProductCreatePlan = NativeProductToolPlan<
  "dolibarr.product_create"
>;
export type DolibarrProductUpdatePlan = NativeProductToolPlan<
  "dolibarr.product_update"
>;

export function mapProductCreateToDolibarr(
  input: ProductCreateInput,
): DolibarrProductCreatePlan {
  const args: Record<string, unknown> = {
    mode: input.mode,
    label: input.name,
    ref: input.sku,
    type: input.kind === "service" ? 1 : 0,
  };
  assignNumber(args, "price", input.unitPrice);
  return { toolName: "dolibarr.product_create", args };
}

export function mapProductUpdateToDolibarr(
  input: DolibarrProductUpdateInput,
): DolibarrProductUpdatePlan {
  const args: Record<string, unknown> = {
    mode: input.mode,
    id: input.nativeId,
  };
  assignString(args, "label", input.name);
  assignNumber(args, "price", input.unitPrice);
  return { toolName: "dolibarr.product_update", args };
}

function assignString(
  args: Record<string, unknown>,
  field: string,
  value: string | undefined,
): void {
  if (value !== undefined) args[field] = value;
}

export function normalizeDolibarrProduct(
  raw: DolibarrProduct,
): NormalizedPayload<DolibarrProduct> {
  const nativeId = assertNativeId(raw.id, "dolibarr", "product");
  const ref = typeof raw.ref === "string" && raw.ref ? raw.ref : nativeId;
  return {
    nativeId,
    nativeType: "product",
    erpType: "dolibarr",
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
