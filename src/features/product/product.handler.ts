import type {
  ErpAdapter,
  ErpToolCallContext,
  ErpToolCallResult,
} from "../../domain/adapter.ts";
import type { ErpType } from "../../domain/connection.ts";
import type { NormalizedPayload } from "../../domain/normalized.ts";
import { invalidNativeIdError } from "../../domain/normalized.ts";
import {
  assertFieldSupported,
  parseWriteMode,
  WriteError,
} from "../../domain/write.ts";
import {
  mapProductCreateToDolibarr,
  mapProductUpdateToDolibarr,
  normalizeDolibarrProduct,
} from "./mappers/dolibarr.ts";
import {
  mapProductCreateToErpNext,
  mapProductUpdateToErpNext,
  normalizeErpNextItem,
} from "./mappers/erpnext.ts";

export async function callProductTool(
  params: {
    readonly name: string;
    readonly args: Record<string, unknown>;
    readonly ctx: ErpToolCallContext;
    readonly erpType: ErpType;
    readonly nativeAdapter?: ErpAdapter;
  },
): Promise<ErpToolCallResult | undefined> {
  const { name, args, ctx, erpType, nativeAdapter } = params;

  if (name === "erp.catalog_item_get") {
    const nativeId = resolveNativeId(args);

    if (erpType === "erpnext" && nativeAdapter) {
      const r = await nativeAdapter.callTool(
        "erpnext.item_get",
        { name: nativeId },
        ctx,
      );
      return { content: normalizeErpNextItem(extractDoc(r.content, "item")) };
    }

    if (erpType === "dolibarr" && nativeAdapter) {
      const id = parseDolibarrNumericId(nativeId);
      const r = await nativeAdapter.callTool(
        "dolibarr.product_get",
        { id },
        ctx,
      );
      return {
        content: normalizeDolibarrProduct(extractDoc(r.content, "product")),
      };
    }

    return undefined;
  }

  if (name === "erp.catalog_item_list") {
    const limit = typeof args.limit === "number" ? args.limit : 20;
    const page = typeof args.page === "number" ? args.page : 0;

    if (erpType === "erpnext" && nativeAdapter) {
      const r = await nativeAdapter.callTool(
        "erpnext.item_list",
        { limit, limitStart: page * limit },
        ctx,
      );
      const rawList = extractArray(r.content, "items");
      const items: NormalizedPayload[] = rawList.map((raw) =>
        normalizeErpNextItem(raw)
      );
      return { content: { items, count: items.length } };
    }

    if (erpType === "dolibarr" && nativeAdapter) {
      const r = await nativeAdapter.callTool(
        "dolibarr.product_list",
        { limit, page },
        ctx,
      );
      const rawList = extractArray(r.content, "products");
      const items: NormalizedPayload[] = rawList.map((raw) =>
        normalizeDolibarrProduct(raw)
      );
      return { content: { items, count: items.length } };
    }

    return undefined;
  }

  if (name === "erp.product_create") {
    const mode = parseWriteMode(args);
    const pname = reqString("name", args.name, erpType);
    const sku = reqString("sku", args.sku, erpType);
    const kind =
      optEnum("kind", args.kind, ["product", "service"] as const, erpType) ??
        "product";
    const unitPrice = optNonNegativeNumber(
      "unitPrice",
      args.unitPrice,
      erpType,
    );
    const uom = optString("uom", args.uom, erpType);
    assertFieldsSupported(erpType, args, ["uom"]);
    const productInput = {
      mode,
      name: pname,
      sku,
      kind,
      unitPrice,
      uom,
    };

    if (erpType === "erpnext" && nativeAdapter) {
      const nativePlan = mapProductCreateToErpNext(productInput);
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
      const nativePlan = mapProductCreateToDolibarr(productInput);
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

  if (name === "erp.product_update") {
    const mode = parseWriteMode(args);
    const nativeId = reqString("nativeId", args.nativeId, erpType);
    const pname = optString("name", args.name, erpType);
    const unitPrice = optNonNegativeNumber(
      "unitPrice",
      args.unitPrice,
      erpType,
    );
    const uom = optString("uom", args.uom, erpType);
    assertFieldsSupported(erpType, args, ["uom"]);
    const productInput = {
      mode,
      nativeId,
      name: pname,
      unitPrice,
      uom,
    };

    if (erpType === "erpnext" && nativeAdapter) {
      const nativePlan = mapProductUpdateToErpNext(productInput);
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
      const nativePlan = mapProductUpdateToDolibarr({
        ...productInput,
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

function resolveNativeId(args: Record<string, unknown>): string {
  const id = args.nativeId;
  if (typeof id !== "string" || id.length === 0) {
    throw new TypeError("nativeId must be a non-empty string");
  }
  return id;
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

function extractArray(
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

function extractDoc(
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

function optNonNegativeNumber(
  field: string,
  value: unknown,
  erpType: string,
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

function assertFieldsSupported(
  erpType: ErpType,
  args: Record<string, unknown>,
  fieldNames: readonly string[],
): void {
  for (const field of fieldNames) {
    assertFieldSupported(erpType, field, args);
  }
}
