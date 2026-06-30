import type {
  ErpToolCallContext,
  ErpToolCallResult,
} from "../../../../domain/adapter.ts";
import type { FrappeFilter, FrappeRestClient } from "../client.ts";
import { ITEM_FIELDS } from "../tools.ts";

export async function callErpnextCatalogTool(
  params: {
    readonly name: string;
    readonly args: Record<string, unknown>;
    readonly ctx: ErpToolCallContext;
    readonly client: FrappeRestClient;
  },
): Promise<ErpToolCallResult | undefined> {
  const { name, args, ctx, client } = params;

  if (name === "erpnext.item_list") {
    const limit = readOptionalInteger(args, "limit", 20, {
      min: 1,
      max: 100,
    });
    const limitStart = readOptionalInteger(args, "limitStart", 0, {
      min: 0,
    });
    const orderBy = readOptionalString(args, "orderBy", "modified desc");
    const filters: FrappeFilter[] = [];
    if (!readOptionalBoolean(args, "includeDisabled", false)) {
      filters.push(["disabled", "=", 0]);
    }
    const itemGroup = readOptionalStringArgument(args, "itemGroup");
    if (itemGroup) {
      filters.push(["item_group", "=", itemGroup]);
    }
    const isStockItem = args.isStockItem;
    if (isStockItem !== undefined) {
      if (typeof isStockItem !== "boolean") {
        throw new TypeError("isStockItem must be a boolean");
      }
      filters.push(["is_stock_item", "=", isStockItem ? 1 : 0]);
    }
    const items = await client.list("Item", {
      fields: ITEM_FIELDS,
      filters,
      limitPageLength: limit,
      limitStart,
      orderBy,
    }, {
      signal: ctx.signal,
    });
    return {
      content: {
        doctype: "Item",
        data: items,
        _title: "ERPNext Items",
        _rowAction: {
          toolName: "erpnext.item_get",
          idField: "name",
          argName: "name",
        },
        items,
        count: items.length,
        limit,
        limitStart,
      },
      summary: `ERPNext item_list returned ${items.length} item(s)`,
    };
  }

  if (name === "erpnext.item_get") {
    const item = await client.get(
      "Item",
      readRequiredString(args, "name"),
      { signal: ctx.signal },
    );
    return {
      content: {
        item,
      },
      summary: `ERPNext item_get returned ${String(item.name ?? "item")}`,
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

function readOptionalBoolean(
  args: Record<string, unknown>,
  name: string,
  defaultValue: boolean,
): boolean {
  const value = args[name];
  if (value === undefined) return defaultValue;
  if (typeof value !== "boolean") {
    throw new TypeError(`${name} must be a boolean`);
  }
  return value;
}

function readRequiredString(
  args: Record<string, unknown>,
  name: string,
): string {
  const value = args[name];
  if (typeof value !== "string" || value.length === 0) {
    throw new TypeError(`${name} must be a non-empty string`);
  }
  return value;
}
