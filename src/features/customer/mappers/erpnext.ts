import type { NormalizedPayload } from "../../../domain/normalized.ts";
import { assertNativeId } from "../../../domain/normalized.ts";
import type { ErpNextCustomer } from "../../../platform/erp/erpnext/types.ts";
import type {
  CustomerContactPlan,
  CustomerCreateInput,
  CustomerUpdateInput,
  NativeCustomerToolPlan,
} from "../customer.types.ts";

export type ErpNextCustomerCreatePlan = NativeCustomerToolPlan<
  "erpnext.customer_create"
>;
export type ErpNextCustomerUpdatePlan = NativeCustomerToolPlan<
  "erpnext.customer_update"
>;

export function mapCustomerCreateToErpNext(
  input: CustomerCreateInput,
): ErpNextCustomerCreatePlan {
  const args: Record<string, unknown> = {
    mode: input.mode,
    customer_name: input.name,
    customer_type: input.kind === "individual" ? "Individual" : "Company",
  };
  assignString(args, "tax_id", input.taxId);
  assignString(args, "email", input.email);
  assignString(args, "phone", input.phone);
  assignString(args, "default_currency", input.currency);

  const contact = buildContactPlan("<pending>", input.name, input);
  return contact
    ? { toolName: "erpnext.customer_create", args, contact }
    : { toolName: "erpnext.customer_create", args };
}

export function mapCustomerUpdateToErpNext(
  input: CustomerUpdateInput,
): ErpNextCustomerUpdatePlan {
  const args: Record<string, unknown> = {
    mode: input.mode,
    name: input.nativeId,
  };
  assignString(args, "customer_name", input.name);
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
    ? { toolName: "erpnext.customer_update", args, contact }
    : { toolName: "erpnext.customer_update", args };
}

function buildContactPlan(
  linkName: string,
  firstName: string,
  input: Pick<CustomerCreateInput, "email" | "phone">,
): CustomerContactPlan | undefined {
  if (input.email === undefined && input.phone === undefined) {
    return undefined;
  }
  return {
    linkDoctype: "Customer",
    linkName,
    firstName,
    ...(input.email !== undefined ? { email: input.email } : {}),
    ...(input.phone !== undefined ? { phone: input.phone } : {}),
    primaryContactField: "customer_primary_contact",
  };
}

function assignString(
  args: Record<string, unknown>,
  field: string,
  value: string | undefined,
): void {
  if (value !== undefined) args[field] = value;
}

export function normalizeErpNextCustomer(
  raw: ErpNextCustomer,
): NormalizedPayload<ErpNextCustomer> {
  const nativeId = assertNativeId(
    raw.name && raw.name.length > 0 ? raw.name : null,
    "erpnext",
    "Customer",
  );
  return {
    nativeId,
    nativeType: "Customer",
    erpType: "erpnext",
    lifecycleState: "unknown",
    availableActions: [],
    data: {
      ref: nativeId,
      partyName: typeof raw.customer_name === "string" && raw.customer_name
        ? raw.customer_name
        : undefined,
    },
    _raw: raw,
  };
}
