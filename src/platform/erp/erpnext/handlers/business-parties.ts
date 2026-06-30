import type {
  ErpToolCallContext,
  ErpToolCallResult,
} from "../../../../domain/adapter.ts";
import type { FrappeFilter, FrappeRestClient } from "../client.ts";
import { CUSTOMER_FIELDS, SUPPLIER_FIELDS } from "../tools.ts";

export async function callErpnextBusinessPartyTool(
  params: {
    readonly name: string;
    readonly args: Record<string, unknown>;
    readonly ctx: ErpToolCallContext;
    readonly client: FrappeRestClient;
  },
): Promise<ErpToolCallResult | undefined> {
  const { name, args, ctx, client } = params;

  if (name === "erpnext.customer_list") {
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
    const customerGroup = readOptionalStringArgument(args, "customerGroup");
    if (customerGroup) {
      filters.push(["customer_group", "=", customerGroup]);
    }
    const territory = readOptionalStringArgument(args, "territory");
    if (territory) {
      filters.push(["territory", "=", territory]);
    }
    const customers = await client.list("Customer", {
      fields: CUSTOMER_FIELDS,
      filters,
      limitPageLength: limit,
      limitStart,
      orderBy,
    }, {
      signal: ctx.signal,
    });
    return {
      content: {
        doctype: "Customer",
        data: customers,
        _title: "ERPNext Customers",
        _rowAction: {
          toolName: "erpnext.customer_get",
          idField: "name",
          argName: "name",
        },
        customers,
        count: customers.length,
        limit,
        limitStart,
      },
      summary: `ERPNext customer_list returned ${customers.length} customer(s)`,
    };
  }

  if (name === "erpnext.customer_get") {
    const customer = await client.get(
      "Customer",
      readRequiredString(args, "name"),
      { signal: ctx.signal },
    );
    return {
      content: {
        customer,
      },
      summary: `ERPNext customer_get returned ${
        String(customer.name ?? "customer")
      }`,
    };
  }

  if (name === "erpnext.supplier_list") {
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
    const supplierGroup = readOptionalStringArgument(args, "supplierGroup");
    if (supplierGroup) {
      filters.push(["supplier_group", "=", supplierGroup]);
    }
    const supplierType = readOptionalStringArgument(args, "supplierType");
    if (supplierType) {
      filters.push(["supplier_type", "=", supplierType]);
    }
    const suppliers = await client.list("Supplier", {
      fields: SUPPLIER_FIELDS,
      filters,
      limitPageLength: limit,
      limitStart,
      orderBy,
    }, { signal: ctx.signal });
    return {
      content: {
        doctype: "Supplier",
        data: suppliers,
        _title: "ERPNext Suppliers",
        _rowAction: {
          toolName: "erpnext.supplier_get",
          idField: "name",
          argName: "name",
        },
        suppliers,
        count: suppliers.length,
        limit,
        limitStart,
      },
      summary: `ERPNext supplier_list returned ${suppliers.length} supplier(s)`,
    };
  }

  if (name === "erpnext.supplier_get") {
    const supplier = await client.get(
      "Supplier",
      readRequiredString(args, "name"),
      { signal: ctx.signal },
    );
    return {
      content: {
        supplier,
      },
      summary: `ERPNext supplier_get returned ${
        String(supplier.name ?? "supplier")
      }`,
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
