import type {
  DolibarrSupplierUpdateInput,
  NativeSupplierToolPlan,
  SupplierCreateInput,
} from "../supplier.types.ts";

export type DolibarrSupplierCreatePlan = NativeSupplierToolPlan<
  "dolibarr.supplier_create"
>;
export type DolibarrSupplierUpdatePlan = NativeSupplierToolPlan<
  "dolibarr.supplier_update"
>;

export function mapSupplierCreateToDolibarr(
  input: SupplierCreateInput,
): DolibarrSupplierCreatePlan {
  const args: Record<string, unknown> = {
    mode: input.mode,
    name: input.name,
  };
  assignString(args, "tva_intra", input.taxId);
  assignString(args, "code_fournisseur", input.externalRef);
  assignString(args, "email", input.email);
  assignString(args, "phone", input.phone);
  assignString(args, "multicurrency_code", input.currency);
  return { toolName: "dolibarr.supplier_create", args };
}

export function mapSupplierUpdateToDolibarr(
  input: DolibarrSupplierUpdateInput,
): DolibarrSupplierUpdatePlan {
  const args: Record<string, unknown> = {
    mode: input.mode,
    id: input.nativeId,
  };
  assignString(args, "name", input.name);
  assignString(args, "tva_intra", input.taxId);
  assignString(args, "code_fournisseur", input.externalRef);
  assignString(args, "email", input.email);
  assignString(args, "phone", input.phone);
  assignString(args, "multicurrency_code", input.currency);
  return { toolName: "dolibarr.supplier_update", args };
}

function assignString(
  args: Record<string, unknown>,
  field: string,
  value: string | undefined,
): void {
  if (value !== undefined) args[field] = value;
}
