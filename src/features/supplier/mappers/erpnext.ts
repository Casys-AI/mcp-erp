import type { NormalizedPayload } from "../../../domain/normalized.ts";
import { assertNativeId } from "../../../domain/normalized.ts";
import type { ErpNextSupplier } from "../../../platform/erp/erpnext/types.ts";
import type {
  NativeSupplierToolPlan,
  SupplierContactPlan,
  SupplierCreateInput,
  SupplierUpdateInput,
} from "../supplier.types.ts";

export type ErpNextSupplierCreatePlan = NativeSupplierToolPlan<
  "erpnext.supplier_create"
>;
export type ErpNextSupplierUpdatePlan = NativeSupplierToolPlan<
  "erpnext.supplier_update"
>;

export function mapSupplierCreateToErpNext(
  input: SupplierCreateInput,
): ErpNextSupplierCreatePlan {
  const args: Record<string, unknown> = {
    mode: input.mode,
    supplier_name: input.name,
  };
  assignString(args, "tax_id", input.taxId);
  assignString(args, "email", input.email);
  assignString(args, "phone", input.phone);
  assignString(args, "default_currency", input.currency);

  const contact = buildContactPlan("<pending>", input.name, input);
  return contact
    ? { toolName: "erpnext.supplier_create", args, contact }
    : { toolName: "erpnext.supplier_create", args };
}

export function mapSupplierUpdateToErpNext(
  input: SupplierUpdateInput,
): ErpNextSupplierUpdatePlan {
  const args: Record<string, unknown> = {
    mode: input.mode,
    name: input.nativeId,
  };
  assignString(args, "supplier_name", input.name);
  assignString(args, "tax_id", input.taxId);
  assignString(args, "email", input.email);
  assignString(args, "phone", input.phone);
  assignString(args, "default_currency", input.currency);

  const contact = buildContactPlan(
    input.nativeId,
    input.name ?? input.nativeId,
    input,
  );
  return contact
    ? { toolName: "erpnext.supplier_update", args, contact }
    : { toolName: "erpnext.supplier_update", args };
}

function buildContactPlan(
  linkName: string,
  firstName: string,
  input: Pick<SupplierCreateInput, "email" | "phone">,
): SupplierContactPlan | undefined {
  if (input.email === undefined && input.phone === undefined) {
    return undefined;
  }
  return {
    linkDoctype: "Supplier",
    linkName,
    firstName,
    ...(input.email !== undefined ? { email: input.email } : {}),
    ...(input.phone !== undefined ? { phone: input.phone } : {}),
    primaryContactField: "supplier_primary_contact",
  };
}

function assignString(
  args: Record<string, unknown>,
  field: string,
  value: string | undefined,
): void {
  if (value !== undefined) args[field] = value;
}

export function normalizeErpNextSupplier(
  raw: ErpNextSupplier,
): NormalizedPayload<ErpNextSupplier> {
  const nativeId = assertNativeId(
    raw.name && raw.name.length > 0 ? raw.name : null,
    "erpnext",
    "Supplier",
  );
  return {
    nativeId,
    nativeType: "Supplier",
    erpType: "erpnext",
    lifecycleState: "unknown",
    availableActions: [],
    data: {
      ref: nativeId,
      partyName: typeof raw.supplier_name === "string" && raw.supplier_name
        ? raw.supplier_name
        : undefined,
    },
    _raw: raw,
  };
}
