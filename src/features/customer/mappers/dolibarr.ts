import type { NormalizedPayload } from "../../../domain/normalized.ts";
import { assertNativeId } from "../../../domain/normalized.ts";
import type { DolibarrThirdparty } from "../../../platform/erp/dolibarr/types.ts";
import type {
  CustomerCreateInput,
  DolibarrCustomerUpdateInput,
  NativeCustomerToolPlan,
} from "../customer.types.ts";

export type DolibarrCustomerCreatePlan = NativeCustomerToolPlan<
  "dolibarr.thirdparty_create"
>;
export type DolibarrCustomerUpdatePlan = NativeCustomerToolPlan<
  "dolibarr.thirdparty_update"
>;

export function mapCustomerCreateToDolibarr(
  input: CustomerCreateInput,
): DolibarrCustomerCreatePlan {
  const args: Record<string, unknown> = {
    mode: input.mode,
    name: input.name,
    kind: input.kind,
  };
  assignString(args, "tva_intra", input.taxId);
  assignString(args, "code_client", input.externalRef);
  assignString(args, "email", input.email);
  assignString(args, "phone", input.phone);
  assignString(args, "multicurrency_code", input.currency);
  return { toolName: "dolibarr.thirdparty_create", args };
}

export function mapCustomerUpdateToDolibarr(
  input: DolibarrCustomerUpdateInput,
): DolibarrCustomerUpdatePlan {
  const args: Record<string, unknown> = {
    mode: input.mode,
    id: input.nativeId,
  };
  assignString(args, "name", input.name);
  assignString(args, "tva_intra", input.taxId);
  assignString(args, "code_client", input.externalRef);
  assignString(args, "email", input.email);
  assignString(args, "phone", input.phone);
  assignString(args, "multicurrency_code", input.currency);
  return { toolName: "dolibarr.thirdparty_update", args };
}

function assignString(
  args: Record<string, unknown>,
  field: string,
  value: string | undefined,
): void {
  if (value !== undefined) args[field] = value;
}

export function normalizeDolibarrParty(
  raw: DolibarrThirdparty,
): NormalizedPayload<DolibarrThirdparty> {
  const nativeId = assertNativeId(raw.id, "dolibarr", "thirdparty");
  const ref = typeof raw.ref === "string" && raw.ref ? raw.ref : nativeId;
  const partyName = typeof raw.name === "string" && raw.name
    ? raw.name
    : typeof raw.nom === "string" && raw.nom
    ? raw.nom
    : typeof raw.name_alias === "string" && raw.name_alias
    ? raw.name_alias
    : undefined;
  return {
    nativeId,
    nativeType: "thirdparty",
    erpType: "dolibarr",
    lifecycleState: "unknown",
    availableActions: [],
    data: { ref, partyName },
    _raw: raw,
  };
}
