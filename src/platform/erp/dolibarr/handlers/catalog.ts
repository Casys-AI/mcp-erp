import type {
  ErpToolCallContext,
  ErpToolCallResult,
} from "../../../../domain/adapter.ts";
import type { DolibarrRestClient } from "../client.ts";

export async function callDolibarrCatalogTool(
  params: {
    readonly name: string;
    readonly args: Record<string, unknown>;
    readonly ctx: ErpToolCallContext;
    readonly client: DolibarrRestClient;
  },
): Promise<ErpToolCallResult | undefined> {
  const { name, args, ctx, client } = params;

  if (name === "dolibarr.product_list") {
    rejectUnsupportedArguments(name, args, ["limit", "page", "type"]);
    const limit = readOptionalInteger(args, "limit", 20, {
      min: 1,
      max: 100,
    });
    const page = readOptionalInteger(args, "page", 0, {
      min: 0,
    });
    const filters: Record<string, string | number> = {};
    const productType = readOptionalIntegerArgument(args, "type", {
      min: 0,
    });
    if (productType !== undefined) {
      if (productType !== 0 && productType !== 1) {
        throw new TypeError("type must be one of: 0, 1");
      }
      filters.mode = productType === 0 ? 1 : 2;
    }
    const products = await client.listProducts({
      limit,
      page,
      signal: ctx.signal,
      filters,
    });
    return {
      content: {
        doctype: "Dolibarr Product",
        data: products,
        _title: "Dolibarr Products",
        _rowAction: {
          toolName: "dolibarr.product_get",
          idField: "id",
          argName: "id",
        },
        products,
        count: products.length,
        limit,
        page,
      },
      summary: `Dolibarr product_list returned ${products.length} product(s)`,
    };
  }

  if (name === "dolibarr.product_get") {
    rejectUnsupportedArguments(name, args, ["id"]);
    const id = readRequiredInteger(args, "id", { min: 1 });
    const product = await client.getProduct(id, ctx.signal);
    return {
      content: {
        product,
      },
      summary: `Dolibarr product_get returned ${id}`,
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
