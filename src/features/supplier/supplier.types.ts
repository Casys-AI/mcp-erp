import type { WriteMode } from "../../domain/write.ts";

export interface SupplierCreateInput {
  readonly mode: WriteMode;
  readonly name: string;
  readonly taxId?: string;
  readonly externalRef?: string;
  readonly email?: string;
  readonly phone?: string;
  readonly currency?: string;
}

export interface SupplierUpdateInput {
  readonly mode: WriteMode;
  readonly nativeId: string;
  readonly name?: string;
  readonly taxId?: string;
  readonly externalRef?: string;
  readonly email?: string;
  readonly phone?: string;
  readonly currency?: string;
}

export interface DolibarrSupplierUpdateInput
  extends Omit<SupplierUpdateInput, "nativeId"> {
  readonly nativeId: number;
}

export interface SupplierContactPlan {
  readonly linkDoctype: "Supplier";
  readonly linkName: string;
  readonly firstName: string;
  readonly email?: string;
  readonly phone?: string;
  readonly primaryContactField: "supplier_primary_contact";
}

export interface NativeSupplierToolPlan<TToolName extends string> {
  readonly toolName: TToolName;
  readonly args: Record<string, unknown>;
  readonly contact?: SupplierContactPlan;
}
