import type { WriteMode } from "../../domain/write.ts";

export type CustomerKind = "company" | "individual";

export interface CustomerCreateInput {
  readonly mode: WriteMode;
  readonly name: string;
  readonly kind: CustomerKind;
  readonly taxId?: string;
  readonly externalRef?: string;
  readonly email?: string;
  readonly phone?: string;
  readonly currency?: string;
}

export interface CustomerUpdateInput {
  readonly mode: WriteMode;
  readonly nativeId: string;
  readonly name?: string;
  readonly taxId?: string;
  readonly externalRef?: string;
  readonly email?: string;
  readonly phone?: string;
  readonly currency?: string;
}

export interface DolibarrCustomerUpdateInput
  extends Omit<CustomerUpdateInput, "nativeId"> {
  readonly nativeId: number;
}

export interface CustomerContactPlan {
  readonly linkDoctype: "Customer";
  readonly linkName: string;
  readonly firstName: string;
  readonly email?: string;
  readonly phone?: string;
  readonly primaryContactField: "customer_primary_contact";
}

export interface NativeCustomerToolPlan<TToolName extends string> {
  readonly toolName: TToolName;
  readonly args: Record<string, unknown>;
  readonly contact?: CustomerContactPlan;
}
