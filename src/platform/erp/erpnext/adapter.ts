/**
 * ERPNext adapter — Frappe-flavored REST integration.
 *
 * v0.1 starts with a tiny read-only ERPNext surface. Keep this adapter
 * provider-native first; normalized cross-ERP tools come only after the
 * ERPNext/Dolibarr mapping is proven.
 *
 * Roadmap (v0.1 — see verdict from 2026-05-09 brainstorm):
 *   - 5–8 tools max for v0.1: health, customer list/get, item list/get,
 *     sales invoice list/get
 *   - Reuse Frappe-client patterns from `mcp-erpnext` (error parsing,
 *     normalised pagination) but with **explicit** `ErpConnection` —
 *     not env-based singletons
 *   - Normalised errors: no silent fallback
 *
 * @module @casys/mcp-erp/adapters/erpnext
 */

import type { ErpConnection } from "../../../domain/connection.ts";
import {
  type ErpAdapter,
  type ErpToolCallContext,
  type ErpToolCallResult,
  type ErpToolDefinition,
  UnknownToolError,
} from "../../../domain/adapter.ts";
import { parseWriteMode, WriteError } from "../../../domain/write.ts";
import { FrappeRestClient, isRecord } from "./client.ts";
import type { FrappeFilter } from "./client.ts";
import { callErpnextBusinessPartyTool } from "./handlers/business-parties.ts";
import { callErpnextCatalogTool } from "./handlers/catalog.ts";
import { callErpnextDiagnosticsTool } from "./handlers/diagnostics.ts";
import {
  BIN_FIELDS,
  ERPNEXT_TOOLS as TOOLS,
  PAYMENT_ENTRY_FIELDS,
  QUOTATION_FIELDS,
  SALES_INVOICE_FIELDS,
  SALES_ORDER_FIELDS,
} from "./tools.ts";
export { FrappeApiError } from "./client.ts";

type ErpnextConnection = Extract<ErpConnection, { erpType: "erpnext" }>;

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

/**
 * Derive a human-readable status from Frappe's numeric `docstatus` field,
 * used as fallback when the document-level `status` field is absent or empty.
 *
 *   0 → Draft  |  1 → Submitted  |  2 → Cancelled
 */
function mapDocstatus(docstatus: unknown): string {
  if (docstatus === 0 || docstatus === "0") return "Draft";
  if (docstatus === 1 || docstatus === "1") return "Submitted";
  if (docstatus === 2 || docstatus === "2") return "Cancelled";
  return "";
}

/**
 * Map an ERPNext native Sales Invoice payload to the invoice-viewer `data`
 * contract, which is shared with the Dolibarr adapter (`mapDolibarrInvoice`).
 *
 * Target fields: name, status, customer/party_name, posting_date, due_date,
 * currency, grand_total, net_total, total_taxes_and_charges,
 * items[]{item_name, qty, rate, amount}.
 *
 * The full native payload is preserved by `sales_invoice_get` beside `data`.
 *
 * @internal — not a stable public API.
 */
export function mapErpNextSalesInvoice(
  native: Record<string, unknown>,
): Record<string, unknown> {
  const rawItems = Array.isArray(native.items) ? native.items : [];
  const items = rawItems
    .filter((raw) => isRecord(raw))
    .map((raw) => {
      const item = raw as Record<string, unknown>;
      const mapped: Record<string, unknown> = {
        item_name:
          typeof item.item_name === "string" && item.item_name.length > 0
            ? item.item_name
            : (typeof item.item_code === "string" ? item.item_code : ""),
      };
      if (item.qty !== undefined) mapped.qty = item.qty;
      if (typeof item.rate === "number") mapped.rate = item.rate;
      if (typeof item.amount === "number") mapped.amount = item.amount;
      return mapped;
    });

  // Prefer the document-level `status` string (e.g. "Unpaid", "Paid");
  // fall back to docstatus integer when status is absent or empty.
  const explicitStatus = typeof native.status === "string" ? native.status : "";
  const status = explicitStatus || mapDocstatus(native.docstatus);

  const data: Record<string, unknown> = {
    name: typeof native.name === "string" ? native.name : "",
    status,
    items,
  };

  // Party — prefer customer (customer-facing invoice), fallback to party_name
  if (native.customer !== undefined) data.customer = native.customer;
  else if (native.party_name !== undefined) data.party_name = native.party_name;

  if (native.posting_date !== undefined) {
    data.posting_date = native.posting_date;
  }
  if (native.due_date !== undefined) data.due_date = native.due_date;
  if (native.currency !== undefined) data.currency = native.currency;
  if (native.grand_total !== undefined) data.grand_total = native.grand_total;
  if (native.net_total !== undefined) data.net_total = native.net_total;
  if (native.total_taxes_and_charges !== undefined) {
    data.total_taxes_and_charges = native.total_taxes_and_charges;
  }

  return data;
}

export function getErpnextToolDefinitions(): ErpToolDefinition[] {
  return TOOLS.map((tool) => ({
    ...tool,
    inputSchema: structuredClone(tool.inputSchema),
    ...(tool.outputSchema
      ? { outputSchema: structuredClone(tool.outputSchema) }
      : {}),
    ...(tool.annotations
      ? { annotations: structuredClone(tool.annotations) }
      : {}),
    ...(tool._meta ? { _meta: structuredClone(tool._meta) } : {}),
  }));
}

export function createErpnextAdapter(
  connection: ErpnextConnection,
): ErpAdapter {
  const client = new FrappeRestClient(connection);

  return {
    erpType: "erpnext",

    tools(): ErpToolDefinition[] {
      return getErpnextToolDefinitions();
    },

    async callTool(
      name: string,
      args: Record<string, unknown>,
      _ctx: ErpToolCallContext,
    ): Promise<ErpToolCallResult> {
      const diagnostics = await callErpnextDiagnosticsTool({
        name,
        connection,
        ctx: _ctx,
        tools: TOOLS,
      });
      if (diagnostics) return diagnostics;

      const businessParty = await callErpnextBusinessPartyTool({
        name,
        args,
        ctx: _ctx,
        client,
      });
      if (businessParty) return businessParty;

      const catalog = await callErpnextCatalogTool({
        name,
        args,
        ctx: _ctx,
        client,
      });
      if (catalog) return catalog;

      if (name === "erpnext.sales_invoice_list") {
        const limit = readOptionalInteger(args, "limit", 20, {
          min: 1,
          max: 100,
        });
        const limitStart = readOptionalInteger(args, "limitStart", 0, {
          min: 0,
        });
        const orderBy = readOptionalString(
          args,
          "orderBy",
          "modified desc",
        );
        const filters: FrappeFilter[] = [];
        const customer = readOptionalStringArgument(args, "customer");
        if (customer) {
          filters.push(["customer", "=", customer]);
        }
        const status = readOptionalStringArgument(args, "status");
        if (status) {
          filters.push(["status", "=", status]);
        }
        const dateFrom = readOptionalStringArgument(args, "dateFrom");
        if (dateFrom) {
          filters.push(["posting_date", ">=", dateFrom]);
        }
        const dateTo = readOptionalStringArgument(args, "dateTo");
        if (dateTo) {
          filters.push(["posting_date", "<=", dateTo]);
        }
        const salesInvoices = await client.list("Sales Invoice", {
          fields: SALES_INVOICE_FIELDS,
          filters,
          limitPageLength: limit,
          limitStart,
          orderBy,
        }, {
          signal: _ctx.signal,
        });
        return {
          content: {
            doctype: "Sales Invoice",
            data: salesInvoices,
            _title: "ERPNext Sales Invoices",
            _rowAction: {
              toolName: "erpnext.sales_invoice_get",
              idField: "name",
              argName: "name",
            },
            salesInvoices,
            count: salesInvoices.length,
            limit,
            limitStart,
          },
          summary:
            `ERPNext sales_invoice_list returned ${salesInvoices.length} invoice(s)`,
        };
      }
      if (name === "erpnext.sales_invoice_get") {
        const salesInvoice = await client.get(
          "Sales Invoice",
          readRequiredString(args, "name"),
          { signal: _ctx.signal },
        );
        return {
          content: {
            // Normalized invoice-viewer contract (provider-agnostic fields).
            // Breaking change vs pre-Step10: `data` is now the mapped invoice,
            // not the raw native. The raw native is preserved in `salesInvoice`.
            data: mapErpNextSalesInvoice(salesInvoice),
            salesInvoice,
          },
          summary: `ERPNext sales_invoice_get returned ${
            String(salesInvoice.name ?? "sales invoice")
          }`,
        };
      }
      if (name === "erpnext.sales_order_list") {
        const limit = readOptionalInteger(args, "limit", 20, {
          min: 1,
          max: 100,
        });
        const limitStart = readOptionalInteger(args, "limitStart", 0, {
          min: 0,
        });
        const orderBy = readOptionalString(
          args,
          "orderBy",
          "modified desc",
        );
        const filters: FrappeFilter[] = [];
        const customer = readOptionalStringArgument(args, "customer");
        if (customer) {
          filters.push(["customer", "=", customer]);
        }
        const status = readOptionalStringArgument(args, "status");
        if (status) {
          filters.push(["status", "=", status]);
        }
        const dateFrom = readOptionalStringArgument(args, "dateFrom");
        if (dateFrom) {
          filters.push(["transaction_date", ">=", dateFrom]);
        }
        const dateTo = readOptionalStringArgument(args, "dateTo");
        if (dateTo) {
          filters.push(["transaction_date", "<=", dateTo]);
        }
        const salesOrders = await client.list("Sales Order", {
          fields: SALES_ORDER_FIELDS,
          filters,
          limitPageLength: limit,
          limitStart,
          orderBy,
        }, {
          signal: _ctx.signal,
        });
        return {
          content: {
            doctype: "Sales Order",
            data: salesOrders,
            _title: "ERPNext Sales Orders",
            _rowAction: {
              toolName: "erpnext.sales_order_get",
              idField: "name",
              argName: "name",
            },
            salesOrders,
            count: salesOrders.length,
            limit,
            limitStart,
          },
          summary:
            `ERPNext sales_order_list returned ${salesOrders.length} order(s)`,
        };
      }
      if (name === "erpnext.sales_order_get") {
        const salesOrder = await client.get(
          "Sales Order",
          readRequiredString(args, "name"),
          { signal: _ctx.signal },
        );
        return {
          content: {
            data: salesOrder,
            salesOrder,
          },
          summary: `ERPNext sales_order_get returned ${
            String(salesOrder.name ?? "sales order")
          }`,
        };
      }
      if (name === "erpnext.quotation_list") {
        const limit = readOptionalInteger(args, "limit", 20, {
          min: 1,
          max: 100,
        });
        const limitStart = readOptionalInteger(args, "limitStart", 0, {
          min: 0,
        });
        const orderBy = readOptionalString(
          args,
          "orderBy",
          "modified desc",
        );
        const filters: FrappeFilter[] = [];
        const partyName = readOptionalStringArgument(args, "partyName");
        if (partyName) {
          filters.push(["party_name", "=", partyName]);
        }
        const quotationTo = readOptionalStringArgument(args, "quotationTo");
        if (quotationTo) {
          filters.push(["quotation_to", "=", quotationTo]);
        }
        const status = readOptionalStringArgument(args, "status");
        if (status) {
          filters.push(["status", "=", status]);
        }
        const dateFrom = readOptionalStringArgument(args, "dateFrom");
        if (dateFrom) {
          filters.push(["transaction_date", ">=", dateFrom]);
        }
        const dateTo = readOptionalStringArgument(args, "dateTo");
        if (dateTo) {
          filters.push(["transaction_date", "<=", dateTo]);
        }
        const quotations = await client.list("Quotation", {
          fields: QUOTATION_FIELDS,
          filters,
          limitPageLength: limit,
          limitStart,
          orderBy,
        }, {
          signal: _ctx.signal,
        });
        return {
          content: {
            doctype: "Quotation",
            data: quotations,
            _title: "ERPNext Quotations",
            _rowAction: {
              toolName: "erpnext.quotation_get",
              idField: "name",
              argName: "name",
            },
            quotations,
            count: quotations.length,
            limit,
            limitStart,
          },
          summary:
            `ERPNext quotation_list returned ${quotations.length} quotation(s)`,
        };
      }
      if (name === "erpnext.quotation_get") {
        const quotation = await client.get(
          "Quotation",
          readRequiredString(args, "name"),
          { signal: _ctx.signal },
        );
        return {
          content: {
            data: quotation,
            quotation,
          },
          summary: `ERPNext quotation_get returned ${
            String(quotation.name ?? "quotation")
          }`,
        };
      }
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
        if (partyType) {
          filters.push(["party_type", "=", partyType]);
        }
        const party = readOptionalStringArgument(args, "party");
        if (party) {
          filters.push(["party", "=", party]);
        }
        const paymentType = readOptionalStringArgument(args, "paymentType");
        if (paymentType) {
          filters.push(["payment_type", "=", paymentType]);
        }
        const dateFrom = readOptionalStringArgument(args, "dateFrom");
        if (dateFrom) {
          filters.push(["posting_date", ">=", dateFrom]);
        }
        const dateTo = readOptionalStringArgument(args, "dateTo");
        if (dateTo) {
          filters.push(["posting_date", "<=", dateTo]);
        }
        const paymentEntries = await client.list("Payment Entry", {
          fields: PAYMENT_ENTRY_FIELDS,
          filters,
          limitPageLength: limit,
          limitStart,
          orderBy,
        }, { signal: _ctx.signal });
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
          { signal: _ctx.signal },
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
        if (itemCode) {
          filters.push(["item_code", "=", itemCode]);
        }
        const warehouse = readOptionalStringArgument(args, "warehouse");
        if (warehouse) {
          filters.push(["warehouse", "=", warehouse]);
        }
        const bins = await client.list("Bin", {
          fields: BIN_FIELDS,
          filters,
          limitPageLength: limit,
          limitStart,
          orderBy,
        }, { signal: _ctx.signal });
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
      if (name === "erpnext.customer_create") {
        const mode = parseWriteMode(args);
        const customerName = readRequiredString(args, "customer_name");
        const payload: Record<string, unknown> = {
          customer_name: customerName,
          customer_type: readOptionalString(args, "customer_type", "Company"),
        };
        for (const f of ["tax_id", "default_currency"]) {
          const v = readOptionalStringArgument(args, f);
          if (v !== undefined) payload[f] = v;
        }
        if (connection.defaultCustomerGroup) {
          payload.customer_group = connection.defaultCustomerGroup;
        }
        if (connection.defaultTerritory) {
          payload.territory = connection.defaultTerritory;
        }
        const email = readOptionalStringArgument(args, "email");
        const phone = readOptionalStringArgument(args, "phone");

        const contactPayload = (email || phone)
          ? client.buildContactPayload("Customer", "<pending>", {
            firstName: customerName,
            email,
            phone,
          })
          : null;

        if (mode === "preview") {
          return {
            content: {
              committed: false,
              doctype: "Customer",
              resolved: {
                document: payload,
                contact: contactPayload,
                // Fix 1 — indique le champ qui sera positionné en commit
                ...(email || phone
                  ? { primaryContactField: "customer_primary_contact" }
                  : {}),
              },
            },
            summary: "Preview ERPNext Customer create (not written)",
          };
        }
        const created = await client.create("Customer", payload, {
          signal: _ctx.signal,
        });
        const nativeId = created.name;
        if (typeof nativeId !== "string" || nativeId.length === 0) {
          throw new WriteError(
            "CREATE_FAILED",
            { erpType: "erpnext", tool: name, response: created },
            "ERP returned no document name",
          );
        }
        if (email || phone) {
          try {
            // Fix 1 — POST Contact (avec is_primary_contact:1) puis PUT Customer pour le désigner
            const contactName = await client.createContact(
              "Customer",
              nativeId as string,
              { firstName: customerName, email, phone },
              { signal: _ctx.signal },
            );
            await client.update(
              "Customer",
              nativeId as string,
              { customer_primary_contact: contactName },
              { signal: _ctx.signal },
            );
          } catch (err) {
            throw new WriteError(
              "CONTACT_FAILED",
              {
                nativeId,
                erpType: "erpnext",
                tool: name,
                contactError: err instanceof Error ? err.message : String(err),
              },
              "Document created (see nativeId) but linked contact failed; create/fix the contact manually or retry",
            );
          }
        }
        return {
          content: {
            committed: true,
            doctype: "Customer",
            nativeId,
            resolved: payload,
          },
          summary: `Created ERPNext Customer ${nativeId}`,
        };
      }

      if (name === "erpnext.item_create") {
        const mode = parseWriteMode(args);
        const isStockItem = readOptionalInteger(args, "is_stock_item", 1, {
          min: 0,
          max: 1,
        });
        const payload: Record<string, unknown> = {
          item_name: readRequiredString(args, "item_name"),
          item_code: readRequiredString(args, "item_code"),
          is_stock_item: isStockItem,
          is_sales_item: 1,
        };
        if (typeof args.standard_rate === "number") {
          payload.standard_rate = args.standard_rate;
        }
        const stockUom = readOptionalStringArgument(args, "stock_uom") ??
          connection.defaultStockUom;
        if (!stockUom) {
          throw new WriteError(
            "MISSING_REQUIRED_CONFIG",
            { field: "stock_uom", erpType: "erpnext", tool: name },
            "Provide uom or set defaultStockUom on the ErpConnection.",
          );
        }
        payload.stock_uom = stockUom;
        if (!connection.defaultItemGroup) {
          throw new WriteError(
            "MISSING_REQUIRED_CONFIG",
            { field: "item_group", erpType: "erpnext", tool: name },
            "Set defaultItemGroup on the ErpConnection.",
          );
        }
        payload.item_group = connection.defaultItemGroup;
        if (mode === "preview") {
          return {
            content: { committed: false, doctype: "Item", resolved: payload },
            summary: "Preview ERPNext Item create (not written)",
          };
        }
        const created = await client.create("Item", payload, {
          signal: _ctx.signal,
        });
        const nativeId = created.name;
        if (typeof nativeId !== "string" || nativeId.length === 0) {
          throw new WriteError(
            "CREATE_FAILED",
            { erpType: "erpnext", tool: name, response: created },
            "ERP returned no document name",
          );
        }
        return {
          content: {
            committed: true,
            doctype: "Item",
            nativeId,
            resolved: payload,
          },
          summary: `Created ERPNext Item ${nativeId}`,
        };
      }

      if (name === "erpnext.customer_update") {
        const mode = parseWriteMode(args);
        const nativeId = readRequiredString(args, "name");
        const payload: Record<string, unknown> = {};
        for (const f of ["customer_name", "tax_id", "default_currency"]) {
          const v = readOptionalStringArgument(args, f);
          if (v !== undefined) payload[f] = v;
        }
        const email = readOptionalStringArgument(args, "email");
        const phone = readOptionalStringArgument(args, "phone");

        const contactPayload = (email || phone)
          ? client.buildContactPayload("Customer", nativeId, {
            firstName: String(payload.customer_name ?? nativeId),
            email,
            phone,
          })
          : null;

        if (mode === "preview") {
          return {
            content: {
              committed: false,
              doctype: "Customer",
              resolved: {
                document: payload,
                contact: contactPayload,
                // Fix 1 — indique le champ qui sera positionné en commit
                ...(email || phone
                  ? { primaryContactField: "customer_primary_contact" }
                  : {}),
              },
            },
            summary: "Preview ERPNext Customer update (not written)",
          };
        }
        const updated = await client.update("Customer", nativeId, payload, {
          signal: _ctx.signal,
        });
        if (typeof updated.name !== "string" || updated.name.length === 0) {
          throw new WriteError(
            "UPDATE_FAILED",
            { erpType: "erpnext", tool: name, response: updated },
            "ERP returned no document name",
          );
        }
        if (email || phone) {
          try {
            const existingContact = await client.findPrimaryContact(
              "Customer",
              nativeId,
              { signal: _ctx.signal },
            );
            if (existingContact) {
              await client.updateContact(
                existingContact.name,
                { email, phone },
                {
                  signal: _ctx.signal,
                },
              );
              // Promote to primary if not already marked as such
              if (!existingContact.isPrimary) {
                await client.update(
                  "Contact",
                  existingContact.name,
                  { is_primary_contact: 1 },
                  { signal: _ctx.signal },
                );
                await client.update(
                  "Customer",
                  nativeId,
                  { customer_primary_contact: existingContact.name },
                  { signal: _ctx.signal },
                );
              }
            } else {
              // Fix 1 — nouveau Contact → PUT Customer pour le désigner primaire
              const contactName = await client.createContact(
                "Customer",
                nativeId,
                {
                  firstName: String(payload.customer_name ?? nativeId),
                  email,
                  phone,
                },
                { signal: _ctx.signal },
              );
              await client.update(
                "Customer",
                nativeId,
                { customer_primary_contact: contactName },
                { signal: _ctx.signal },
              );
            }
          } catch (err) {
            throw new WriteError(
              "CONTACT_FAILED",
              {
                nativeId,
                erpType: "erpnext",
                tool: name,
                contactError: err instanceof Error ? err.message : String(err),
              },
              // Fix 4 — texte distingue create/update
              "Document updated (see nativeId) but linked contact failed; create/fix the contact manually or retry",
            );
          }
        }
        return {
          content: {
            committed: true,
            doctype: "Customer",
            nativeId,
            resolved: payload,
          },
          summary: `Updated ERPNext Customer ${nativeId}`,
        };
      }

      if (name === "erpnext.item_update") {
        const mode = parseWriteMode(args);
        const nativeId = readRequiredString(args, "name");
        const payload: Record<string, unknown> = {};
        const itemName = readOptionalStringArgument(args, "item_name");
        if (itemName !== undefined) payload.item_name = itemName;
        if (typeof args.standard_rate === "number") {
          payload.standard_rate = args.standard_rate;
        }
        const stockUom = readOptionalStringArgument(args, "stock_uom");
        if (stockUom !== undefined) payload.stock_uom = stockUom;
        if (mode === "preview") {
          return {
            content: { committed: false, doctype: "Item", resolved: payload },
            summary: "Preview ERPNext Item update (not written)",
          };
        }
        const updated = await client.update("Item", nativeId, payload, {
          signal: _ctx.signal,
        });
        if (
          typeof updated.name !== "string" || updated.name.length === 0
        ) {
          throw new WriteError(
            "UPDATE_FAILED",
            { erpType: "erpnext", tool: name, response: updated },
            "ERP returned no document name",
          );
        }
        return {
          content: {
            committed: true,
            doctype: "Item",
            nativeId,
            resolved: payload,
          },
          summary: `Updated ERPNext Item ${nativeId}`,
        };
      }

      if (name === "erpnext.supplier_create") {
        const mode = parseWriteMode(args);
        const supplierName = readRequiredString(args, "supplier_name");
        const payload: Record<string, unknown> = {
          supplier_name: supplierName,
          supplier_type: readOptionalString(args, "supplier_type", "Company"),
        };
        const taxId = readOptionalStringArgument(args, "tax_id");
        if (taxId !== undefined) payload.tax_id = taxId;
        const defaultCurrency = readOptionalStringArgument(
          args,
          "default_currency",
        );
        if (defaultCurrency !== undefined) {
          payload.default_currency = defaultCurrency;
        }
        if (connection.defaultSupplierGroup) {
          payload.supplier_group = connection.defaultSupplierGroup;
        }
        const email = readOptionalStringArgument(args, "email");
        const phone = readOptionalStringArgument(args, "phone");

        const contactPayload = (email || phone)
          ? client.buildContactPayload("Supplier", "<pending>", {
            firstName: supplierName,
            email,
            phone,
          })
          : null;

        if (mode === "preview") {
          return {
            content: {
              committed: false,
              doctype: "Supplier",
              resolved: {
                document: payload,
                contact: contactPayload,
                // Fix 1 — indique le champ qui sera positionné en commit
                ...(email || phone
                  ? { primaryContactField: "supplier_primary_contact" }
                  : {}),
              },
            },
            summary: "Preview ERPNext Supplier create (not written)",
          };
        }
        const created = await client.create("Supplier", payload, {
          signal: _ctx.signal,
        });
        const nativeId = created.name;
        if (typeof nativeId !== "string" || nativeId.length === 0) {
          throw new WriteError(
            "CREATE_FAILED",
            { erpType: "erpnext", tool: name, response: created },
            "ERP returned no document name",
          );
        }
        if (email || phone) {
          try {
            // Fix 1 — POST Contact (avec is_primary_contact:1) puis PUT Supplier pour le désigner
            const contactName = await client.createContact(
              "Supplier",
              nativeId as string,
              { firstName: supplierName, email, phone },
              { signal: _ctx.signal },
            );
            await client.update(
              "Supplier",
              nativeId as string,
              { supplier_primary_contact: contactName },
              { signal: _ctx.signal },
            );
          } catch (err) {
            throw new WriteError(
              "CONTACT_FAILED",
              {
                nativeId,
                erpType: "erpnext",
                tool: name,
                contactError: err instanceof Error ? err.message : String(err),
              },
              "Document created (see nativeId) but linked contact failed; create/fix the contact manually or retry",
            );
          }
        }
        return {
          content: {
            committed: true,
            doctype: "Supplier",
            nativeId,
            resolved: payload,
          },
          summary: `Created ERPNext Supplier ${nativeId}`,
        };
      }

      if (name === "erpnext.supplier_update") {
        const mode = parseWriteMode(args);
        const nativeId = readRequiredString(args, "name");
        const payload: Record<string, unknown> = {};
        for (
          const f of [
            "supplier_name",
            "supplier_type",
            "tax_id",
            "default_currency",
          ]
        ) {
          const v = readOptionalStringArgument(args, f);
          if (v !== undefined) payload[f] = v;
        }
        const email = readOptionalStringArgument(args, "email");
        const phone = readOptionalStringArgument(args, "phone");

        const contactPayload = (email || phone)
          ? client.buildContactPayload("Supplier", nativeId, {
            firstName: String(payload.supplier_name ?? nativeId),
            email,
            phone,
          })
          : null;

        if (mode === "preview") {
          return {
            content: {
              committed: false,
              doctype: "Supplier",
              resolved: {
                document: payload,
                contact: contactPayload,
                // Fix 1 — indique le champ qui sera positionné en commit
                ...(email || phone
                  ? { primaryContactField: "supplier_primary_contact" }
                  : {}),
              },
            },
            summary: "Preview ERPNext Supplier update (not written)",
          };
        }
        const updated = await client.update("Supplier", nativeId, payload, {
          signal: _ctx.signal,
        });
        if (typeof updated.name !== "string" || updated.name.length === 0) {
          throw new WriteError(
            "UPDATE_FAILED",
            { erpType: "erpnext", tool: name, response: updated },
            "ERP returned no document name",
          );
        }
        if (email || phone) {
          try {
            const existingContact = await client.findPrimaryContact(
              "Supplier",
              nativeId,
              { signal: _ctx.signal },
            );
            if (existingContact) {
              await client.updateContact(
                existingContact.name,
                { email, phone },
                {
                  signal: _ctx.signal,
                },
              );
              // Promote to primary if not already marked as such
              if (!existingContact.isPrimary) {
                await client.update(
                  "Contact",
                  existingContact.name,
                  { is_primary_contact: 1 },
                  { signal: _ctx.signal },
                );
                await client.update(
                  "Supplier",
                  nativeId,
                  { supplier_primary_contact: existingContact.name },
                  { signal: _ctx.signal },
                );
              }
            } else {
              // Fix 1 — nouveau Contact → PUT Supplier pour le désigner primaire
              const contactName = await client.createContact(
                "Supplier",
                nativeId,
                {
                  firstName: String(payload.supplier_name ?? nativeId),
                  email,
                  phone,
                },
                { signal: _ctx.signal },
              );
              await client.update(
                "Supplier",
                nativeId,
                { supplier_primary_contact: contactName },
                { signal: _ctx.signal },
              );
            }
          } catch (err) {
            throw new WriteError(
              "CONTACT_FAILED",
              {
                nativeId,
                erpType: "erpnext",
                tool: name,
                contactError: err instanceof Error ? err.message : String(err),
              },
              // Fix 4 — texte distingue create/update
              "Document updated (see nativeId) but linked contact failed; create/fix the contact manually or retry",
            );
          }
        }
        return {
          content: {
            committed: true,
            doctype: "Supplier",
            nativeId,
            resolved: payload,
          },
          summary: `Updated ERPNext Supplier ${nativeId}`,
        };
      }

      throw new UnknownToolError("erpnext", name);
    },

    dispose(): void {
      // No persistent resources yet. Wire HTTP keep-alive close here when
      // the real Frappe client lands.
    },
  };
}
