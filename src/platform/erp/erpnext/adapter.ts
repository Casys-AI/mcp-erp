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
import { FrappeRestClient } from "./client.ts";
import type { FrappeFilter } from "./client.ts";
import { callErpnextAccountingTool } from "./handlers/accounting.ts";
import { callErpnextBusinessPartyTool } from "./handlers/business-parties.ts";
import { callErpnextCatalogTool } from "./handlers/catalog.ts";
import { callErpnextDocumentTool } from "./handlers/documents.ts";
import { callErpnextDiagnosticsTool } from "./handlers/diagnostics.ts";
import { BIN_FIELDS, ERPNEXT_TOOLS as TOOLS } from "./tools.ts";
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

      const document = await callErpnextDocumentTool({
        name,
        args,
        ctx: _ctx,
        client,
      });
      if (document) return document;

      const accounting = await callErpnextAccountingTool({
        name,
        args,
        ctx: _ctx,
        client,
      });
      if (accounting) return accounting;

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
