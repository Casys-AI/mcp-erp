import type {
  ErpToolCallContext,
  ErpToolCallResult,
} from "../../../../domain/adapter.ts";
import type { DolibarrRestClient } from "../client.ts";

export async function callDolibarrInventoryTool(
  params: {
    readonly name: string;
    readonly args: Record<string, unknown>;
    readonly ctx: ErpToolCallContext;
    readonly client: DolibarrRestClient;
  },
): Promise<ErpToolCallResult | undefined> {
  const { name, args, ctx, client } = params;

  if (name === "dolibarr.stockmovement_list") {
    rejectUnsupportedArguments(name, args, [
      "limit",
      "page",
      "fkProduct",
      "dateStart",
      "dateEnd",
    ]);
    const limit = readOptionalInteger(args, "limit", 20, {
      min: 1,
      max: 100,
    });
    const page = readOptionalInteger(args, "page", 0, { min: 0 });
    const filters: Record<string, string | number> = {};
    const fkProduct = readOptionalIntegerArgument(args, "fkProduct", {
      min: 1,
    });
    if (fkProduct !== undefined) {
      addSqlFilter(filters, sqlFilterEqualsNumber("t.fk_product", fkProduct));
    }
    const dateStart = readOptionalDateArgument(args, "dateStart");
    if (dateStart !== undefined) {
      addSqlFilter(
        filters,
        sqlFilterDateComparison("t.datem", ">=", dateStart),
      );
    }
    const dateEnd = readOptionalDateArgument(args, "dateEnd");
    if (dateEnd !== undefined) {
      addSqlFilter(filters, sqlFilterDateComparison("t.datem", "<=", dateEnd));
    }
    const stockmovements = await client.listStockmovements({
      limit,
      page,
      signal: ctx.signal,
      filters,
    });
    return {
      content: {
        doctype: "Dolibarr Stock Movement",
        data: stockmovements,
        _title: "Dolibarr Stock Movements",
        stockmovements,
        count: stockmovements.length,
        limit,
        page,
      },
      summary:
        `Dolibarr stockmovement_list returned ${stockmovements.length} movement(s)`,
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

function readOptionalIntegerArgument(
  args: Record<string, unknown>,
  name: string,
  options: { readonly min: number },
): number | undefined {
  const value = args[name];
  if (value === undefined) return undefined;
  if (!Number.isInteger(value)) {
    throw new TypeError(`${name} must be an integer`);
  }
  const numberValue = value as number;
  if (numberValue < options.min) {
    throw new TypeError(`${name} must be >= ${options.min}`);
  }
  return numberValue;
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

function readOptionalDateArgument(
  args: Record<string, unknown>,
  name: string,
): string | undefined {
  const value = readOptionalStringArgument(args, name);
  if (value === undefined) return undefined;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new TypeError(`${name} must match YYYY-MM-DD`);
  }
  return value;
}

function rejectUnsupportedArguments(
  toolName: string,
  args: Record<string, unknown>,
  allowed: readonly string[],
): void {
  for (const key of Object.keys(args)) {
    if (!allowed.includes(key)) {
      throw new TypeError(`Unsupported argument for ${toolName}: ${key}`);
    }
  }
}

function addSqlFilter(
  filters: Record<string, string | number>,
  condition: string,
): void {
  const current = filters.sqlfilters;
  filters.sqlfilters = current === undefined
    ? condition
    : `${current} and ${condition}`;
}

function sqlFilterEqualsNumber(field: string, value: number): string {
  return `(${field}:=:${value})`;
}

function sqlFilterDateComparison(
  field: string,
  operator: ">=" | "<=",
  value: string,
): string {
  return `(${field}:${operator}:${sqlFilterStringLiteral(value, field)})`;
}

function sqlFilterStringLiteral(value: string, argumentName: string): string {
  if (/['"()]/.test(value)) {
    throw new TypeError(
      `${argumentName} contains unsupported sqlfilters syntax character`,
    );
  }
  if (/[\r\n]/.test(value)) {
    throw new TypeError(`${argumentName} must be a single-line string`);
  }
  return `'${value}'`;
}
