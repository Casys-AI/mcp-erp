import type { WriteMode } from "../../domain/write.ts";

export interface SalesDocumentLineInput {
  readonly sku: string;
  readonly qty: number;
  readonly unitPrice: number;
  readonly description?: string;
}

export interface SalesDocumentCreateInput {
  readonly mode: WriteMode;
  readonly customerId: string;
  readonly lines: readonly SalesDocumentLineInput[];
  readonly date?: string;
}

export interface SalesOrderCreateInput extends SalesDocumentCreateInput {
  readonly deliveryDate?: string;
}

export interface QuotationCreateInput extends SalesDocumentCreateInput {
  readonly validUntil?: string;
}

export interface SalesInvoiceCreateInput extends SalesDocumentCreateInput {
  readonly dueDate?: string;
}

export interface NativeSalesOrderToolPlan<TToolName extends string> {
  readonly toolName: TToolName;
  readonly args: Record<string, unknown>;
}

export interface NativeQuotationToolPlan<TToolName extends string> {
  readonly toolName: TToolName;
  readonly args: Record<string, unknown>;
}

export interface NativeSalesInvoiceToolPlan<TToolName extends string> {
  readonly toolName: TToolName;
  readonly args: Record<string, unknown>;
}

/** Normalized input for sales document lifecycle submit. */
export interface SalesDocumentSubmitInput {
  readonly mode: WriteMode;
  readonly nativeId: string;
}

/** Native plan for a sales-order submit operation. */
export interface NativeSalesOrderSubmitPlan<TToolName extends string> {
  readonly toolName: TToolName;
  readonly args: Record<string, unknown>;
}

/** Native plan for a quotation submit operation. */
export interface NativeQuotationSubmitPlan<TToolName extends string> {
  readonly toolName: TToolName;
  readonly args: Record<string, unknown>;
}

/** Native plan for a sales-invoice submit operation. */
export interface NativeSalesInvoiceSubmitPlan<TToolName extends string> {
  readonly toolName: TToolName;
  readonly args: Record<string, unknown>;
}
