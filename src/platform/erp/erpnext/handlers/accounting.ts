import type {
  ErpToolCallContext,
  ErpToolCallResult,
} from "../../../../domain/adapter.ts";
import type { FrappeFilter, FrappeRestClient } from "../client.ts";
import { PAYMENT_ENTRY_FIELDS } from "../tools.ts";

export async function callErpnextAccountingTool(
  params: {
    readonly name: string;
    readonly args: Record<string, unknown>;
    readonly ctx: ErpToolCallContext;
    readonly client: FrappeRestClient;
  },
): Promise<ErpToolCallResult | undefined> {
  const { name, args, ctx, client } = params;

  if (name === "erpnext.payment_entry_list") {
    const limit = readOptionalInteger(args, "limit", 20, {
      min: 1,
      max: 100,
    });
    const limitStart = readOptionalInteger(args, "limitStart", 0, {
      min: 0,
    });
    const orderBy = readOptionalString(args, "orderBy", "modified desc");
    const filters: FrappeFilter[] = [];
    const partyType = readOptionalStringArgument(args, "partyType");
    if (partyType) filters.push(["party_type", "=", partyType]);
    const party = readOptionalStringArgument(args, "party");
    if (party) filters.push(["party", "=", party]);
    const paymentType = readOptionalStringArgument(args, "paymentType");
    if (paymentType) filters.push(["payment_type", "=", paymentType]);
    const dateFrom = readOptionalStringArgument(args, "dateFrom");
    if (dateFrom) filters.push(["posting_date", ">=", dateFrom]);
    const dateTo = readOptionalStringArgument(args, "dateTo");
    if (dateTo) filters.push(["posting_date", "<=", dateTo]);
    const paymentEntries = await client.list("Payment Entry", {
      fields: PAYMENT_ENTRY_FIELDS,
      filters,
      limitPageLength: limit,
      limitStart,
      orderBy,
    }, { signal: ctx.signal });
    return {
      content: {
        doctype: "Payment Entry",
        data: paymentEntries,
        _title: "ERPNext Payment Entries",
        _rowAction: {
          toolName: "erpnext.payment_entry_get",
          idField: "name",
          argName: "name",
        },
        paymentEntries,
        count: paymentEntries.length,
        limit,
        limitStart,
      },
      summary:
        `ERPNext payment_entry_list returned ${paymentEntries.length} payment entry(ies)`,
    };
  }

  if (name === "erpnext.payment_entry_get") {
    const paymentEntry = await client.get(
      "Payment Entry",
      readRequiredString(args, "name"),
      { signal: ctx.signal },
    );
    return {
      content: {
        paymentEntry,
      },
      summary: `ERPNext payment_entry_get returned ${
        String(paymentEntry.name ?? "payment entry")
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
