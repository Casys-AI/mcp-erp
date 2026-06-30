import type {
  ErpToolCallContext,
  ErpToolCallResult,
} from "../../../../domain/adapter.ts";
import type { DolibarrRestClient } from "../client.ts";

export async function callDolibarrAccountingTool(
  params: {
    readonly name: string;
    readonly args: Record<string, unknown>;
    readonly ctx: ErpToolCallContext;
    readonly client: DolibarrRestClient;
  },
): Promise<ErpToolCallResult | undefined> {
  const { name, args, ctx, client } = params;

  if (name === "dolibarr.payment_list") {
    rejectUnsupportedArguments(name, args, [
      "limit",
      "page",
      "dateStart",
      "dateEnd",
    ]);
    const limit = readOptionalInteger(args, "limit", 20, {
      min: 1,
      max: 100,
    });
    const page = readOptionalInteger(args, "page", 0, { min: 0 });
    const filters: Record<string, string | number> = {};
    const dateStart = readOptionalDateArgument(args, "dateStart");
    if (dateStart !== undefined) {
      addSqlFilter(
        filters,
        sqlFilterDateComparison("t.datep", ">=", dateStart),
      );
    }
    const dateEnd = readOptionalDateArgument(args, "dateEnd");
    if (dateEnd !== undefined) {
      addSqlFilter(filters, sqlFilterDateComparison("t.datep", "<=", dateEnd));
    }
    const payments = await client.listPayments({
      limit,
      page,
      signal: ctx.signal,
      filters,
    });
    return {
      content: {
        doctype: "Dolibarr Payment",
        data: payments,
        _title: "Dolibarr Payments",
        _rowAction: {
          toolName: "dolibarr.payment_get",
          idField: "id",
          argName: "id",
        },
        payments,
        count: payments.length,
        limit,
        page,
      },
      summary: `Dolibarr payment_list returned ${payments.length} payment(s)`,
    };
  }

  if (name === "dolibarr.payment_get") {
    rejectUnsupportedArguments(name, args, ["id"]);
    const id = readRequiredInteger(args, "id", { min: 1 });
    const payment = await client.getPayment(id, ctx.signal);
    return {
      content: {
        payment,
      },
      summary: `Dolibarr payment_get returned ${id}`,
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

function readRequiredInteger(
  args: Record<string, unknown>,
  name: string,
  options: { readonly min: number },
): number {
  const value = args[name];
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
