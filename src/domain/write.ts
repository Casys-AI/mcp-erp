/**
 * Write-path primitives shared by native adapters and the normalized layer.
 *
 * Kept free of adapter/connection-provider imports to avoid import cycles:
 * native adapters import this module, so it must not import them back.
 *
 * @module @casys/mcp-erp/write
 */

import type { ErpType } from "./connection.ts";

/** Write execution mode. Required on every write tool — no default. */
export type WriteMode = "preview" | "commit";

/**
 * Structured write-path error. AX "Machine-Readable Errors": typed `code`,
 * parseable `context`, operator `recovery`. Serialized to JSON by error-mapper.
 */
export class WriteError extends Error {
  override readonly name = "WriteError";
  constructor(
    public readonly code: string,
    public readonly context: Record<string, unknown>,
    public readonly recovery: string,
  ) {
    super(code);
  }
}

/** Resolved native payload + commit outcome returned by a native create. */
export interface WriteResult {
  committed: boolean;
  resolved: Record<string, unknown>;
  nativeId?: string;
}

/** Parse the required `mode` arg. Fast-fail with a structured error. */
export function parseWriteMode(args: Record<string, unknown>): WriteMode {
  const mode = args.mode;
  if (mode === "preview" || mode === "commit") return mode;
  throw new WriteError(
    "INVALID_MODE",
    { mode },
    'Pass mode: "preview" (validate without writing) or "commit" (write).',
  );
}

/** Per-ERP write capability manifest (MVP scope). */
export const WRITE_CAPABILITIES: Record<
  ErpType,
  { tools: readonly string[]; unsupportedFields: readonly string[] }
> = {
  erpnext: {
    tools: [
      "erp.customer_create",
      "erp.product_create",
      "erp.customer_update",
      "erp.product_update",
      "erp.supplier_create",
      "erp.supplier_update",
      "erp.sales_order_create",
      "erp.quotation_create",
      "erp.sales_invoice_create",
    ],
    // ERPNext `name` is autoname-driven — no reliable external-ref field.
    unsupportedFields: ["externalRef"],
  },
  dolibarr: {
    tools: [
      "erp.customer_create",
      "erp.product_create",
      "erp.customer_update",
      "erp.product_update",
      "erp.supplier_create",
      "erp.supplier_update",
      "erp.sales_order_create",
      "erp.quotation_create",
      "erp.sales_invoice_create",
    ],
    unsupportedFields: ["uom"],
  },
};

/** Throw UNSUPPORTED_FIELD when a present arg is not supported by the ERP. */
export function assertFieldSupported(
  erpType: ErpType,
  field: string,
  args: Record<string, unknown>,
): void {
  if (
    args[field] !== undefined &&
    WRITE_CAPABILITIES[erpType].unsupportedFields.includes(field)
  ) {
    throw new WriteError(
      "UNSUPPORTED_FIELD",
      { field, erpType },
      `Field '${field}' is not supported on ${erpType}; omit it.`,
    );
  }
}
