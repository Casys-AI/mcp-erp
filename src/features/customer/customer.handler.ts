import type {
  ErpAdapter,
  ErpToolCallContext,
  ErpToolCallResult,
} from "../../domain/adapter.ts";
import type { ErpType } from "../../domain/connection.ts";
import { invalidNativeIdError } from "../../domain/normalized.ts";
import {
  assertFieldSupported,
  parseWriteMode,
  WriteError,
} from "../../domain/write.ts";
import {
  mapCustomerCreateToDolibarr,
  mapCustomerUpdateToDolibarr,
} from "./mappers/dolibarr.ts";
import {
  mapCustomerCreateToErpNext,
  mapCustomerUpdateToErpNext,
} from "./mappers/erpnext.ts";

export async function callCustomerTool(
  params: {
    readonly name: string;
    readonly args: Record<string, unknown>;
    readonly ctx: ErpToolCallContext;
    readonly erpType: ErpType;
    readonly nativeAdapter?: ErpAdapter;
  },
): Promise<ErpToolCallResult | undefined> {
  const { name, args, ctx, erpType, nativeAdapter } = params;

  if (name === "erp.customer_create") {
    const mode = parseWriteMode(args);
    const cname = reqString("name", args.name, erpType);
    const kind = optEnum(
      "kind",
      args.kind,
      ["company", "individual"] as const,
      erpType,
    ) ?? "company";
    const taxId = optString("taxId", args.taxId, erpType);
    const email = optString("email", args.email, erpType);
    const phone = optString("phone", args.phone, erpType);
    const currency = optString("currency", args.currency, erpType);
    const externalRef = optString("externalRef", args.externalRef, erpType);
    assertFieldSupported(erpType, "externalRef", args);
    const customerInput = {
      mode,
      name: cname,
      kind,
      taxId,
      externalRef,
      email,
      phone,
      currency,
    };

    if (erpType === "erpnext" && nativeAdapter) {
      const nativePlan = mapCustomerCreateToErpNext(customerInput);
      const r = await nativeAdapter.callTool(
        nativePlan.toolName,
        nativePlan.args,
        ctx,
      );
      return {
        content: { ...(r.content as Record<string, unknown>), erpType },
      };
    }

    if (erpType === "dolibarr" && nativeAdapter) {
      const nativePlan = mapCustomerCreateToDolibarr(customerInput);
      const r = await nativeAdapter.callTool(
        nativePlan.toolName,
        nativePlan.args,
        ctx,
      );
      return {
        content: { ...(r.content as Record<string, unknown>), erpType },
      };
    }

    return undefined;
  }

  if (name === "erp.customer_update") {
    const mode = parseWriteMode(args);
    const nativeId = reqString("nativeId", args.nativeId, erpType);
    const cname = optString("name", args.name, erpType);
    const taxId = optString("taxId", args.taxId, erpType);
    const externalRef = optString("externalRef", args.externalRef, erpType);
    assertFieldSupported(erpType, "externalRef", args);
    const email = optString("email", args.email, erpType);
    const phone = optString("phone", args.phone, erpType);
    const currency = optString("currency", args.currency, erpType);
    const customerInput = {
      mode,
      nativeId,
      name: cname,
      taxId,
      externalRef,
      email,
      phone,
      currency,
    };

    if (erpType === "erpnext" && nativeAdapter) {
      const nativePlan = mapCustomerUpdateToErpNext(customerInput);
      const r = await nativeAdapter.callTool(
        nativePlan.toolName,
        nativePlan.args,
        ctx,
      );
      return {
        content: { ...(r.content as Record<string, unknown>), erpType },
      };
    }

    if (erpType === "dolibarr" && nativeAdapter) {
      const numericId = parseDolibarrNumericId(nativeId);
      const nativePlan = mapCustomerUpdateToDolibarr({
        ...customerInput,
        nativeId: numericId,
      });
      const r = await nativeAdapter.callTool(
        nativePlan.toolName,
        nativePlan.args,
        ctx,
      );
      return {
        content: { ...(r.content as Record<string, unknown>), erpType },
      };
    }

    return undefined;
  }

  return undefined;
}

function reqString(field: string, value: unknown, erpType: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new WriteError(
      "MISSING_REQUIRED_FIELD",
      { field, erpType },
      `Field '${field}' is required and must be a non-empty string.`,
    );
  }
  return value;
}

function optString(
  field: string,
  value: unknown,
  erpType: string,
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

function optEnum<T extends string>(
  field: string,
  value: unknown,
  allowed: readonly T[],
  erpType: string,
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

function parseDolibarrNumericId(nativeId: string): number {
  if (!/^\d+$/.test(nativeId)) {
    throw invalidNativeIdError(nativeId, "dolibarr");
  }
  const n = Number(nativeId);
  if (!Number.isInteger(n) || n <= 0) {
    throw invalidNativeIdError(nativeId, "dolibarr");
  }
  return n;
}
