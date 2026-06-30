import type { WriteMode } from "../../domain/write.ts";

export type ProductKind = "product" | "service";

export interface ProductCreateInput {
  readonly mode: WriteMode;
  readonly name: string;
  readonly sku: string;
  readonly kind: ProductKind;
  readonly unitPrice?: number;
  readonly uom?: string;
}

export interface ProductUpdateInput {
  readonly mode: WriteMode;
  readonly nativeId: string;
  readonly name?: string;
  readonly unitPrice?: number;
  readonly uom?: string;
}

export interface DolibarrProductUpdateInput
  extends Omit<ProductUpdateInput, "nativeId"> {
  readonly nativeId: number;
}

export interface NativeProductToolPlan<TToolName extends string> {
  readonly toolName: TToolName;
  readonly args: Record<string, unknown>;
}
