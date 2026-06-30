import type {
  ErpToolCallContext,
  ErpToolCallResult,
} from "../../../../domain/adapter.ts";
import { parseIntegerLike } from "../../../../domain/lifecycle.ts";
import type { DolibarrRestClient } from "../client.ts";
import {
  DOLIBARR_INVOICE_STATUSES,
  DOLIBARR_ORDER_STATUS_CODES,
  DOLIBARR_PROPOSAL_STATUS_CODES,
} from "../tools.ts";

export async function callDolibarrDocumentTool(
  params: {
    readonly name: string;
    readonly args: Record<string, unknown>;
    readonly ctx: ErpToolCallContext;
    readonly client: DolibarrRestClient;
  },
): Promise<ErpToolCallResult | undefined> {
  const { name, args, ctx, client } = params;

  if (name === "dolibarr.invoice_list") {
    rejectUnsupportedArguments(name, args, [
      "limit",
      "page",
      "thirdpartyId",
      "status",
      "dateStart",
      "dateEnd",
    ]);
    const limit = readOptionalInteger(args, "limit", 20, {
      min: 1,
      max: 100,
    });
    const page = readOptionalInteger(args, "page", 0, { min: 0 });
    const filters: Record<string, string | number> = {};
    const thirdpartyId = readOptionalIntegerArgument(args, "thirdpartyId", {
      min: 1,
    });
    if (thirdpartyId !== undefined) filters.thirdparty_ids = thirdpartyId;
    const status = readOptionalEnumArgument(
      args,
      "status",
      DOLIBARR_INVOICE_STATUSES,
    );
    if (status !== undefined) filters.status = status;
    const dateStart = readOptionalDateArgument(args, "dateStart");
    if (dateStart !== undefined) {
      addSqlFilter(
        filters,
        sqlFilterDateComparison("t.datef", ">=", dateStart),
      );
    }
    const dateEnd = readOptionalDateArgument(args, "dateEnd");
    if (dateEnd !== undefined) {
      addSqlFilter(filters, sqlFilterDateComparison("t.datef", "<=", dateEnd));
    }
    const invoices = await client.listInvoices({
      limit,
      page,
      signal: ctx.signal,
      filters,
    });
    return {
      content: {
        doctype: "Dolibarr Invoice",
        data: invoices,
        _title: "Dolibarr Invoices",
        _rowAction: {
          toolName: "dolibarr.invoice_get",
          idField: "id",
          argName: "id",
        },
        invoices,
        count: invoices.length,
        limit,
        page,
      },
      summary: `Dolibarr invoice_list returned ${invoices.length} invoice(s)`,
    };
  }

  if (name === "dolibarr.invoice_get") {
    rejectUnsupportedArguments(name, args, ["id"]);
    const id = readRequiredInteger(args, "id", { min: 1 });
    const invoice = await client.getInvoice(id, ctx.signal);
    const native = invoice as Record<string, unknown>;
    return {
      content: {
        data: mapDolibarrInvoice(native),
        invoice,
        _native: invoice,
      },
      summary: `Dolibarr invoice_get returned ${id}`,
    };
  }

  if (name === "dolibarr.order_list") {
    rejectUnsupportedArguments(name, args, [
      "limit",
      "page",
      "thirdpartyId",
      "status",
      "dateStart",
      "dateEnd",
    ]);
    const limit = readOptionalInteger(args, "limit", 20, {
      min: 1,
      max: 100,
    });
    const page = readOptionalInteger(args, "page", 0, { min: 0 });
    const filters: Record<string, string | number> = {};
    const thirdpartyId = readOptionalIntegerArgument(args, "thirdpartyId", {
      min: 1,
    });
    if (thirdpartyId !== undefined) filters.thirdparty_ids = thirdpartyId;
    const status = readOptionalMappedStatusCode(
      args,
      "status",
      DOLIBARR_ORDER_STATUS_CODES,
    );
    if (status !== undefined) {
      addSqlFilter(filters, sqlFilterEqualsNumber("t.fk_statut", status));
    }
    const dateStart = readOptionalDateArgument(args, "dateStart");
    if (dateStart !== undefined) {
      addSqlFilter(
        filters,
        sqlFilterDateComparison("t.date_commande", ">=", dateStart),
      );
    }
    const dateEnd = readOptionalDateArgument(args, "dateEnd");
    if (dateEnd !== undefined) {
      addSqlFilter(
        filters,
        sqlFilterDateComparison("t.date_commande", "<=", dateEnd),
      );
    }
    const orders = await client.listOrders({
      limit,
      page,
      signal: ctx.signal,
      filters,
    });
    return {
      content: {
        doctype: "Dolibarr Order",
        data: orders,
        _title: "Dolibarr Orders",
        _rowAction: {
          toolName: "dolibarr.order_get",
          idField: "id",
          argName: "id",
        },
        orders,
        count: orders.length,
        limit,
        page,
      },
      summary: `Dolibarr order_list returned ${orders.length} order(s)`,
    };
  }

  if (name === "dolibarr.order_get") {
    rejectUnsupportedArguments(name, args, ["id"]);
    const id = readRequiredInteger(args, "id", { min: 1 });
    const order = await client.getOrder(id, ctx.signal);
    const native = order as Record<string, unknown>;
    return {
      content: {
        data: mapDolibarrDocData(native, "order"),
        order,
        _native: order,
      },
      summary: `Dolibarr order_get returned ${id}`,
    };
  }

  if (name === "dolibarr.proposal_list") {
    rejectUnsupportedArguments(name, args, [
      "limit",
      "page",
      "thirdpartyId",
      "status",
      "dateStart",
      "dateEnd",
    ]);
    const limit = readOptionalInteger(args, "limit", 20, {
      min: 1,
      max: 100,
    });
    const page = readOptionalInteger(args, "page", 0, { min: 0 });
    const filters: Record<string, string | number> = {};
    const thirdpartyId = readOptionalIntegerArgument(args, "thirdpartyId", {
      min: 1,
    });
    if (thirdpartyId !== undefined) filters.thirdparty_ids = thirdpartyId;
    const status = readOptionalMappedStatusCode(
      args,
      "status",
      DOLIBARR_PROPOSAL_STATUS_CODES,
    );
    if (status !== undefined) {
      addSqlFilter(filters, sqlFilterEqualsNumber("t.fk_statut", status));
    }
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
    const proposals = await client.listProposals({
      limit,
      page,
      signal: ctx.signal,
      filters,
    });
    return {
      content: {
        doctype: "Dolibarr Proposal",
        data: proposals,
        _title: "Dolibarr Proposals",
        _rowAction: {
          toolName: "dolibarr.proposal_get",
          idField: "id",
          argName: "id",
        },
        proposals,
        count: proposals.length,
        limit,
        page,
      },
      summary:
        `Dolibarr proposal_list returned ${proposals.length} proposal(s)`,
    };
  }

  if (name === "dolibarr.proposal_get") {
    rejectUnsupportedArguments(name, args, ["id"]);
    const id = readRequiredInteger(args, "id", { min: 1 });
    const proposal = await client.getProposal(id, ctx.signal);
    const native = proposal as Record<string, unknown>;
    return {
      content: {
        data: mapDolibarrDocData(native, "proposal"),
        proposal,
        _native: proposal,
      },
      summary: `Dolibarr proposal_get returned ${id}`,
    };
  }

  return undefined;
}

const DOLIBARR_INVOICE_STATUS_LABELS: Record<number, string> = {
  0: "Draft",
  1: "Unpaid",
  2: "Paid/Closed",
  3: "Abandoned",
};

const DOLIBARR_ORDER_STATUS_LABELS: Record<number, string> = {
  [-1]: "Cancelled",
  0: "Draft",
  1: "Validated",
  2: "Shipment on process",
  3: "Closed",
};

const DOLIBARR_PROPOSAL_STATUS_LABELS: Record<number, string> = {
  [-1]: "Cancelled",
  0: "Draft",
  1: "Validated",
  2: "Signed",
  3: "Not signed",
  4: "Billed",
};

export function mapDolibarrInvoice(
  native: Record<string, unknown>,
): Record<string, unknown> {
  const money = readDolibarrMoney(native);
  const lines = Array.isArray(native.lines) ? native.lines : [];
  const data: Record<string, unknown> = {
    name: typeof native.ref === "string" ? native.ref : "",
    status: mapDolibarrInvoiceStatus(native.statut, native.paye),
    items: mapDolibarrLines(lines, money.useMulticurrency),
  };
  assignMoneyFields(data, money);
  assignIfDefined(
    data,
    "posting_date",
    readScalarField(native, ["datef", "date", "date_creation"]),
  );
  assignIfDefined(
    data,
    "due_date",
    readScalarField(native, ["date_lim_reglement", "due_date"]),
  );
  assignPartyFields(data, native);
  return data;
}

export function mapDolibarrDocData(
  native: Record<string, unknown>,
  type: "order" | "proposal",
): Record<string, unknown> {
  const money = readDolibarrMoney(native);
  const lines = Array.isArray(native.lines) ? native.lines : [];
  const data: Record<string, unknown> = {
    name: typeof native.ref === "string" ? native.ref : "",
    status: type === "order"
      ? mapDolibarrOrderStatus(native.statut)
      : mapDolibarrProposalStatus(native.statut),
    items: mapDolibarrLines(lines, money.useMulticurrency),
  };
  assignMoneyFields(data, money);
  assignPartyFields(data, native);

  if (type === "order") {
    assignIfDefined(
      data,
      "transaction_date",
      readScalarField(native, ["date_commande", "date", "date_creation"]),
    );
    assignIfDefined(
      data,
      "delivery_date",
      readScalarField(native, ["date_livraison", "delivery_date"]),
    );
  } else {
    assignIfDefined(
      data,
      "transaction_date",
      readScalarField(native, ["datep", "date", "date_creation"]),
    );
    assignIfDefined(
      data,
      "valid_till",
      readScalarField(native, ["fin_validite", "valid_till"]),
    );
    assignIfDefined(
      data,
      "delivery_date",
      readScalarField(native, ["delivery_date"]),
    );
  }

  return data;
}

function mapDolibarrInvoiceStatus(statut: unknown, paye?: unknown): string {
  if (paye === "1" || paye === 1 || paye === true) return "Paid";
  return mapDolibarrStatusValue(statut, DOLIBARR_INVOICE_STATUS_LABELS);
}

function mapDolibarrOrderStatus(statut: unknown): string {
  return mapDolibarrStatusValue(statut, DOLIBARR_ORDER_STATUS_LABELS);
}

function mapDolibarrProposalStatus(statut: unknown): string {
  return mapDolibarrStatusValue(statut, DOLIBARR_PROPOSAL_STATUS_LABELS);
}

function mapDolibarrStatusValue(
  statut: unknown,
  labels: Record<number, string>,
): string {
  const status = parseIntegerLike(statut);
  if (
    status !== undefined &&
    Object.prototype.hasOwnProperty.call(labels, status)
  ) {
    return labels[status];
  }
  return `Unknown (${formatUnknownStatus(statut)})`;
}

function formatUnknownStatus(value: unknown): string {
  if (value === undefined) return "undefined";
  if (value === null) return "null";
  return String(value);
}

interface MappedDolibarrLine extends Record<string, unknown> {
  item_name: string;
  item_code?: string;
  qty?: unknown;
  rate?: number;
  amount?: number;
}

interface DolibarrMoney {
  readonly currency?: string;
  readonly grandTotal?: number;
  readonly netTotal?: number;
  readonly taxes?: number;
  readonly useMulticurrency: boolean;
}

function mapDolibarrLines(
  lines: unknown[],
  useMulticurrency: boolean,
): MappedDolibarrLine[] {
  return lines.map((line) => {
    const l = line as Record<string, unknown>;
    const item: MappedDolibarrLine = {
      item_name: readStringField(l, [
        "label",
        "product_label",
        "desc",
        "description",
      ]) ?? "",
    };
    assignIfDefined(
      item,
      "item_code",
      readStringField(l, ["product_ref", "ref", "product_code"]),
    );
    assignIfDefined(item, "qty", l.qty ?? l.quantity);
    assignIfDefined(
      item,
      "rate",
      useMulticurrency
        ? readNumberField(l, ["multicurrency_subprice"])
        : readNumberField(l, ["subprice", "price"]),
    );
    assignIfDefined(
      item,
      "amount",
      useMulticurrency
        ? readNumberField(l, ["multicurrency_total_ht"])
        : readNumberField(l, ["total_ht", "amount"]),
    );
    return item;
  });
}

function readDolibarrMoney(native: Record<string, unknown>): DolibarrMoney {
  const multicurrencyCode = readStringField(native, ["multicurrency_code"]);
  const hasMulticurrencyTotals = [
    "multicurrency_total_ttc",
    "multicurrency_total_ht",
    "multicurrency_total_tva",
  ].some((field) => hasValue(native[field]));

  if (multicurrencyCode && hasMulticurrencyTotals) {
    return {
      currency: multicurrencyCode,
      grandTotal: readNumberField(native, ["multicurrency_total_ttc"]),
      netTotal: readNumberField(native, ["multicurrency_total_ht"]),
      taxes: readNumberField(native, ["multicurrency_total_tva"]),
      useMulticurrency: true,
    };
  }

  return {
    currency: readStringField(native, ["currency", "currency_code"]),
    grandTotal: readNumberField(native, ["total_ttc"]),
    netTotal: readNumberField(native, ["total_ht"]),
    taxes: readNumberField(native, ["total_tva"]),
    useMulticurrency: false,
  };
}

function assignMoneyFields(
  data: Record<string, unknown>,
  money: DolibarrMoney,
): void {
  assignIfDefined(data, "currency", money.currency);
  assignIfDefined(data, "grand_total", money.grandTotal);
  assignIfDefined(data, "net_total", money.netTotal);
  assignIfDefined(data, "total_taxes_and_charges", money.taxes);
}

function assignPartyFields(
  data: Record<string, unknown>,
  native: Record<string, unknown>,
): void {
  assignIfDefined(data, "party_name", readDolibarrPartyName(native));
  assignIfDefined(
    data,
    "socid",
    readScalarField(native, ["socid", "fk_soc", "thirdparty_id"]),
  );
}

function readDolibarrPartyName(
  native: Record<string, unknown>,
): string | undefined {
  const thirdparty = native.thirdparty;
  if (thirdparty && typeof thirdparty === "object") {
    const thirdpartyName = readStringField(
      thirdparty as Record<string, unknown>,
      ["name", "nom", "name_alias"],
    );
    if (thirdpartyName) return thirdpartyName;
  }
  return readStringField(native, ["socname", "thirdparty_name", "party_name"]);
}

function readScalarField(
  record: Record<string, unknown>,
  names: readonly string[],
): string | number | boolean | undefined {
  for (const name of names) {
    const value = record[name];
    if (
      typeof value === "string" || typeof value === "number" ||
      typeof value === "boolean"
    ) {
      if (typeof value === "string" && value.length === 0) continue;
      return value;
    }
  }
  return undefined;
}

function readStringField(
  record: Record<string, unknown>,
  names: readonly string[],
): string | undefined {
  const value = readScalarField(record, names);
  if (value === undefined) return undefined;
  return String(value);
}

function readNumberField(
  record: Record<string, unknown>,
  names: readonly string[],
): number | undefined {
  for (const name of names) {
    const value = record[name];
    if (!hasValue(value)) continue;
    const parsed = Number.parseFloat(String(value));
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function hasValue(value: unknown): boolean {
  return value !== undefined && value !== null && value !== "";
}

function assignIfDefined(
  target: Record<string, unknown>,
  key: string,
  value: unknown,
): void {
  if (value !== undefined) target[key] = value;
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

function readOptionalEnumArgument<T extends string>(
  args: Record<string, unknown>,
  name: string,
  allowedValues: readonly T[],
): T | undefined {
  const value = readOptionalStringArgument(args, name);
  if (value === undefined) return undefined;
  if (!allowedValues.includes(value as T)) {
    throw new TypeError(
      `${name} must be one of: ${allowedValues.join(", ")}`,
    );
  }
  return value as T;
}

function readOptionalMappedStatusCode(
  args: Record<string, unknown>,
  name: string,
  statusCodes: Record<string, number>,
): number | undefined {
  const value = readOptionalStringArgument(args, name);
  if (value === undefined) return undefined;
  if (!Object.prototype.hasOwnProperty.call(statusCodes, value)) {
    throw new TypeError(
      `${name} must be one of: ${Object.keys(statusCodes).join(", ")}`,
    );
  }
  return statusCodes[value];
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
