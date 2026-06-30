import type { ErpType } from "../../domain/connection.ts";
import { invalidNativeIdError } from "../../domain/normalized.ts";
import { assertFieldSupported, WriteError } from "../../domain/write.ts";

export function resolveNativeId(args: Record<string, unknown>): string {
  const id = args.nativeId;
  if (typeof id !== "string" || id.length === 0) {
    throw new TypeError("nativeId must be a non-empty string");
  }
  return id;
}

export function parseDolibarrNumericId(nativeId: string): number {
  if (!/^\d+$/.test(nativeId)) {
    throw invalidNativeIdError(nativeId, "dolibarr");
  }
  const n = Number(nativeId);
  if (!Number.isInteger(n) || n <= 0) {
    throw invalidNativeIdError(nativeId, "dolibarr");
  }
  return n;
}

export function extractArray(
  content: unknown,
  key: string,
): Record<string, unknown>[] {
  if (
    content && typeof content === "object" &&
    Array.isArray((content as Record<string, unknown>)[key])
  ) {
    return (content as Record<string, unknown>)[key] as Record<
      string,
      unknown
    >[];
  }
  return [];
}

export function extractDoc(
  content: unknown,
  key: string,
): Record<string, unknown> {
  if (content && typeof content === "object") {
    const val = (content as Record<string, unknown>)[key];
    if (val && typeof val === "object" && !Array.isArray(val)) {
      return val as Record<string, unknown>;
    }
  }
  return {};
}

export function reqString(
  field: string,
  value: unknown,
  erpType: ErpType,
): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new WriteError(
      "MISSING_REQUIRED_FIELD",
      { field, erpType },
      `Field '${field}' is required and must be a non-empty string.`,
    );
  }
  return value;
}

export function optString(
  field: string,
  value: unknown,
  erpType: ErpType,
): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || value.length === 0) {
    throw new WriteError(
      "INVALID_FIELD",
      { field, erpType },
      `Field '${field}' must be a non-empty string when provided.`,
    );
  }
  return value;
}

export function optEnum<T extends string>(
  field: string,
  value: unknown,
  allowed: readonly T[],
  erpType: ErpType,
): T | undefined {
  if (value === undefined) return undefined;
  if (!allowed.includes(value as T)) {
    throw new WriteError(
      "INVALID_FIELD",
      { field, value, erpType },
      `Field '${field}' must be one of: ${allowed.join(", ")} when provided.`,
    );
  }
  return value as T;
}

export function optNonNegativeNumber(
  field: string,
  value: unknown,
  erpType: ErpType,
): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new WriteError(
      "INVALID_FIELD",
      { field, erpType },
      `Field '${field}' must be a finite number >= 0 when provided.`,
    );
  }
  return value;
}

export function assertFieldsSupported(
  erpType: ErpType,
  args: Record<string, unknown>,
  fieldNames: readonly string[],
): void {
  for (const field of fieldNames) {
    assertFieldSupported(erpType, field, args);
  }
}
