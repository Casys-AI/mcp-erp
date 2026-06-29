/**
 * Normalized ERP payload types — Wave 3.
 *
 * These types form the cross-ERP contract surfaced by the 7 `erp.*` tools.
 * Native adapters project their raw payloads into this shape; consumers get
 * a uniform view regardless of whether the backend is ERPNext or Dolibarr.
 *
 * Design constraints (see ROADMAP.md Wave 3):
 *  - `nativeId` is always a `string` (Dolibarr `String(id)`, ERPNext `name`).
 *  - `availableActions` is empty in Wave 3 (read-only surface).
 *  - All `NormalizedView` fields are optional except `ref`.
 *
 * @module @casys/mcp-erp/normalized
 */

/**
 * Closed union of ERP document lifecycle states.
 *
 * Fallback is `'unknown'` — never an empty string or undefined, so callers
 * can switch exhaustively without an `else` branch.
 */
export type ErpLifecycleState =
  | "draft"
  | "open"
  | "overdue"
  | "paid"
  | "validated"
  | "signed"
  | "closed"
  | "cancelled"
  | "unknown";

/**
 * Provider-agnostic summary view of an ERP document.
 *
 * Only the fields that exist across ERPNext and Dolibarr are lifted here.
 * All non-`ref` fields are optional — prefer `undefined` over `null` so
 * callers can use the `??` operator directly.
 */
export interface NormalizedView {
  /** Document reference / ID (human-readable, never empty). */
  readonly ref: string;
  /** Name of the counterparty (customer or supplier). */
  readonly partyName?: string;
  /** Grand total including taxes. */
  readonly grandTotal?: number;
  /** ISO 4217 currency code, e.g. `'EUR'`. */
  readonly currency?: string;
  /** ISO 8601 document date, e.g. `'2025-01-01'`. */
  readonly date?: string;
  /** ISO 8601 due date (invoices only). */
  readonly dueDate?: string;
}

/**
 * Fully normalized ERP document payload.
 *
 * @template T  The raw native payload type preserved in `_raw`.
 */
export interface NormalizedPayload<T = unknown> {
  /** Native document ID as a string — always non-empty. */
  readonly nativeId: string;
  /**
   * Native document type label (e.g. `'Sales Invoice'`, `'facture'`).
   * Opaque to the consumer; useful for debugging and logging.
   */
  readonly nativeType: string;
  /** Source ERP system. */
  readonly erpType: "erpnext" | "dolibarr";
  /** Current lifecycle state in the normalized vocabulary. */
  readonly lifecycleState: ErpLifecycleState;
  /**
   * Machine-actionable operations available on this document.
   * Empty in Wave 3 (read-only). Reserved for Wave 4+ write tools.
   */
  readonly availableActions: readonly string[];
  /** Normalized cross-ERP view. */
  readonly data: NormalizedView;
  /** Original native payload — preserved for consumers that need raw fields. */
  readonly _raw: T;
}

/**
 * Structured error thrown when a native document is missing its identifier.
 *
 * AX principle 4: machine-readable errors have `code` + `context` + `recovery`.
 * Never produce a `NormalizedPayload` with an empty or fabricated `nativeId`.
 */
export class NormalizedError extends Error {
  override readonly name = "NormalizedError";
  readonly code: string;
  readonly context: Record<string, unknown>;
  readonly recovery: string;

  constructor(
    code: string,
    message: string,
    context: Record<string, unknown>,
    recovery: string,
  ) {
    super(message);
    this.code = code;
    this.context = context;
    this.recovery = recovery;
  }
}

/** Convenience factory for MISSING_NATIVE_ID errors. */
export function missingNativeIdError(
  erpType: string,
  nativeType: string,
): NormalizedError {
  return new NormalizedError(
    "MISSING_NATIVE_ID",
    `Native ID is absent or null on ${erpType} ${nativeType} document`,
    { erpType, nativeType },
    "Ensure the ERP document has a valid id/name field before normalizing",
  );
}

/**
 * Convenience factory for INVALID_NATIVE_ID errors.
 *
 * Thrown when a Dolibarr nativeId is not a strict positive decimal integer
 * (e.g. `'abc'`, `'42abc'`, `'-1'`, `'1.5'`).
 */
export function invalidNativeIdError(
  nativeId: string,
  erpType: string,
): NormalizedError {
  return new NormalizedError(
    "INVALID_NATIVE_ID",
    `Invalid native ID '${nativeId}' for ${erpType}: expected a positive decimal integer`,
    { nativeId, erpType },
    "Pass a valid positive integer string as nativeId for Dolibarr documents",
  );
}
