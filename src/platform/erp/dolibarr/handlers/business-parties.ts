import type {
  ErpToolCallContext,
  ErpToolCallResult,
} from "../../../../domain/adapter.ts";
import type { DolibarrRestClient } from "../client.ts";

export async function callDolibarrBusinessPartyTool(
  params: {
    readonly name: string;
    readonly args: Record<string, unknown>;
    readonly ctx: ErpToolCallContext;
    readonly client: DolibarrRestClient;
  },
): Promise<ErpToolCallResult | undefined> {
  const { name, args, ctx, client } = params;

  if (name === "dolibarr.thirdparty_list") {
    rejectUnsupportedArguments(name, args, [
      "limit",
      "page",
      "mode",
      "nameLike",
    ]);
    const limit = readOptionalInteger(args, "limit", 20, {
      min: 1,
      max: 100,
    });
    const page = readOptionalInteger(args, "page", 0, {
      min: 0,
    });
    const filters: Record<string, string | number> = {};
    const mode = readOptionalStringArgument(args, "mode");
    if (mode !== undefined) {
      const modeMap: Record<string, number> = {
        customer: 1,
        supplier: 4,
        prospect: 2,
      };
      if (!(mode in modeMap)) {
        throw new TypeError(
          `mode must be one of: customer, supplier, prospect`,
        );
      }
      filters.mode = modeMap[mode];
    }
    const nameLike = readOptionalStringArgument(args, "nameLike");
    if (nameLike !== undefined) {
      addSqlFilter(filters, sqlFilterLike("t.nom", nameLike, "nameLike"));
    }
    const thirdparties = await client.listThirdparties({
      limit,
      page,
      signal: ctx.signal,
      filters,
    });
    return {
      content: {
        doctype: "Dolibarr Thirdparty",
        data: thirdparties,
        _title: "Dolibarr Thirdparties",
        _rowAction: {
          toolName: "dolibarr.thirdparty_get",
          idField: "id",
          argName: "id",
        },
        thirdparties,
        count: thirdparties.length,
        limit,
        page,
      },
      summary:
        `Dolibarr thirdparty_list returned ${thirdparties.length} thirdpartie(s)`,
    };
  }

  if (name === "dolibarr.thirdparty_get") {
    rejectUnsupportedArguments(name, args, ["id"]);
    const id = readRequiredInteger(args, "id", { min: 1 });
    const thirdparty = await client.getThirdparty(id, ctx.signal);
    return {
      content: {
        thirdparty,
      },
      summary: `Dolibarr thirdparty_get returned ${id}`,
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

function rejectUnsupportedArguments(
  toolName: string,
  args: Record<string, unknown>,
  allowed: readonly string[],
): void {
  const unsupported = Object.keys(args).filter((key) => !allowed.includes(key));
  if (unsupported.length > 0) {
    throw new TypeError(
      `${toolName} does not support argument(s): ${unsupported.join(", ")}`,
    );
  }
}

function addSqlFilter(
  filters: Record<string, string | number>,
  filter: string,
): void {
  filters.sqlfilters = filters.sqlfilters === undefined
    ? filter
    : `${filters.sqlfilters} AND ${filter}`;
}

function sqlFilterLike(
  field: string,
  value: string,
  argumentName: string,
): string {
  return `(${field}:like:${
    sqlFilterStringLiteral(`%${value}%`, argumentName)
  })`;
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
