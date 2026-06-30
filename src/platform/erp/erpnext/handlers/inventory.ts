import type {
  ErpToolCallContext,
  ErpToolCallResult,
} from "../../../../domain/adapter.ts";
import type { FrappeFilter, FrappeRestClient } from "../client.ts";
import { BIN_FIELDS } from "../tools.ts";

export async function callErpnextInventoryTool(
  params: {
    readonly name: string;
    readonly args: Record<string, unknown>;
    readonly ctx: ErpToolCallContext;
    readonly client: FrappeRestClient;
  },
): Promise<ErpToolCallResult | undefined> {
  const { name, args, ctx, client } = params;

  if (name === "erpnext.bin_list") {
    const limit = readOptionalInteger(args, "limit", 20, {
      min: 1,
      max: 100,
    });
    const limitStart = readOptionalInteger(args, "limitStart", 0, {
      min: 0,
    });
    const orderBy = readOptionalString(args, "orderBy", "modified desc");
    const filters: FrappeFilter[] = [];
    const itemCode = readOptionalStringArgument(args, "itemCode");
    if (itemCode) filters.push(["item_code", "=", itemCode]);
    const warehouse = readOptionalStringArgument(args, "warehouse");
    if (warehouse) filters.push(["warehouse", "=", warehouse]);
    const bins = await client.list("Bin", {
      fields: BIN_FIELDS,
      filters,
      limitPageLength: limit,
      limitStart,
      orderBy,
    }, { signal: ctx.signal });
    return {
      content: {
        doctype: "Bin",
        data: bins,
        _title: "ERPNext Stock (Bin)",
        bins,
        count: bins.length,
        limit,
        limitStart,
      },
      summary: `ERPNext bin_list returned ${bins.length} bin(s)`,
    };
  }

  return undefined;
}

function readOptionalInteger(
  args: Record<string, unknown>,
  name: string,
  defaultValue: number,
  options: { readonly min: number; readonly max?: number },
): number {
  const value = args[name];
  if (value === undefined) return defaultValue;
  if (!Number.isInteger(value)) {
    throw new TypeError(`${name} must be an integer`);
  }
  const numberValue = value as number;
  if (numberValue < options.min) {
    throw new TypeError(`${name} must be >= ${options.min}`);
  }
  if (options.max !== undefined && numberValue > options.max) {
    throw new TypeError(`${name} must be <= ${options.max}`);
  }
  return numberValue;
}

function readOptionalString(
  args: Record<string, unknown>,
  name: string,
  defaultValue: string,
): string {
  const value = args[name];
  if (value === undefined) return defaultValue;
  if (typeof value !== "string" || value.length === 0) {
    throw new TypeError(`${name} must be a non-empty string`);
  }
  return value;
}

function readOptionalStringArgument(
  args: Record<string, unknown>,
  name: string,
): string | undefined {
  const value = args[name];
  if (value === undefined) return undefined;
  if (typeof value !== "string" || value.length === 0) {
    throw new TypeError(`${name} must be a non-empty string`);
  }
  return value;
}
