/**
 * Dolibarr adapter — Dolibarr REST integration.
 *
 * v0.1 starts with a small read-only Dolibarr surface. Keep tools native to
 * Dolibarr modules first; normalized ERP abstractions come later.
 *
 * @module @casys/mcp-erp/adapters/dolibarr
 */

import type { ErpConnection } from "../../../domain/connection.ts";
import { parseWriteMode, WriteError } from "../../../domain/write.ts";
import {
  type ErpAdapter,
  type ErpToolCallContext,
  type ErpToolCallResult,
  type ErpToolDefinition,
  UnknownToolError,
} from "../../../domain/adapter.ts";
import { DolibarrRestClient } from "./client.ts";
import { DOLIBARR_TOOLS as TOOLS } from "./tools.ts";
import { callDolibarrAccountingTool } from "./handlers/accounting.ts";
import { callDolibarrBusinessPartyTool } from "./handlers/business-parties.ts";
import { callDolibarrCatalogTool } from "./handlers/catalog.ts";
import { callDolibarrDocumentTool } from "./handlers/documents.ts";
import { callDolibarrDiagnosticsTool } from "./handlers/diagnostics.ts";
import { callDolibarrInventoryTool } from "./handlers/inventory.ts";
export { DolibarrApiError } from "./client.ts";

type DolibarrConnection = Extract<ErpConnection, { erpType: "dolibarr" }>;

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

/**
 * Validate a Dolibarr create response id.
 * Accepts a positive integer (number or pure-digit string). Rejects
 * objects, null, zero, and negative values with CREATE_FAILED.
 */
function toDolibarrNativeId(id: unknown, tool: string): string {
  if (typeof id === "number" && Number.isInteger(id) && id > 0) {
    return String(id);
  }
  if (typeof id === "string" && /^\d+$/.test(id)) {
    const n = Number(id);
    if (n > 0) return id;
  }
  throw new WriteError(
    "CREATE_FAILED",
    { erpType: "dolibarr", tool, response: id },
    "Dolibarr returned no valid numeric id after creation",
  );
}

function rejectUnsupportedArguments(
  toolName: string,
  args: Record<string, unknown>,
  allowedNames: readonly string[],
): void {
  for (const key of Object.keys(args)) {
    if (!allowedNames.includes(key)) {
      throw new TypeError(`Unsupported argument for ${toolName}: ${key}`);
    }
  }
}

export function getDolibarrToolDefinitions(): ErpToolDefinition[] {
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

export function createDolibarrAdapter(
  connection: DolibarrConnection,
): ErpAdapter {
  const client = new DolibarrRestClient(connection);

  return {
    erpType: "dolibarr",

    tools(): ErpToolDefinition[] {
      return getDolibarrToolDefinitions();
    },

    async callTool(
      name: string,
      args: Record<string, unknown>,
      _ctx: ErpToolCallContext,
    ): Promise<ErpToolCallResult> {
      const diagnostics = await callDolibarrDiagnosticsTool({
        name,
        args,
        connection,
        ctx: _ctx,
        tools: TOOLS,
      });
      if (diagnostics) return diagnostics;

      const businessParty = await callDolibarrBusinessPartyTool({
        name,
        args,
        ctx: _ctx,
        client,
      });
      if (businessParty) return businessParty;

      const catalog = await callDolibarrCatalogTool({
        name,
        args,
        ctx: _ctx,
        client,
      });
      if (catalog) return catalog;

      const document = await callDolibarrDocumentTool({
        name,
        args,
        ctx: _ctx,
        client,
      });
      if (document) return document;

      const accounting = await callDolibarrAccountingTool({
        name,
        args,
        ctx: _ctx,
        client,
      });
      if (accounting) return accounting;

      const inventory = await callDolibarrInventoryTool({
        name,
        args,
        ctx: _ctx,
        client,
      });
      if (inventory) return inventory;

      if (name === "dolibarr.thirdparty_create") {
        rejectUnsupportedArguments(name, args, [
          "mode",
          "name",
          "kind",
          "tva_intra",
          "code_client",
          "email",
          "phone",
          "multicurrency_code",
        ]);
        const mode = parseWriteMode(args);
        const payload: Record<string, unknown> = {
          name: readRequiredString(args, "name"),
          client: 1,
        };
        const kind = readOptionalEnumArgument(args, "kind", [
          "company",
          "individual",
        ]);
        if (kind === "individual") {
          if (
            !Number.isInteger(connection.defaultIndividualTypentId) ||
            (connection.defaultIndividualTypentId as number) <= 0
          ) {
            throw new WriteError(
              "MISSING_REQUIRED_CONFIG",
              { field: "defaultIndividualTypentId", erpType: "dolibarr" },
              "Set defaultIndividualTypentId to a positive integer on the ErpConnection to create individuals.",
            );
          }
          payload.typent_id = connection.defaultIndividualTypentId;
        }
        for (
          const f of [
            "tva_intra",
            "code_client",
            "email",
            "phone",
            "multicurrency_code",
          ]
        ) {
          const v = readOptionalStringArgument(args, f);
          if (v !== undefined) payload[f] = v;
        }
        if (mode === "preview") {
          return {
            content: {
              committed: false,
              doctype: "Dolibarr Thirdparty",
              resolved: payload,
            },
            summary: "Preview Dolibarr thirdparty create (not written)",
          };
        }
        const id = await client.createThirdparty(payload, _ctx.signal);
        const nativeId = toDolibarrNativeId(id, name);
        return {
          content: {
            committed: true,
            doctype: "Dolibarr Thirdparty",
            nativeId,
            resolved: payload,
          },
          summary: `Created Dolibarr thirdparty ${nativeId}`,
        };
      }

      if (name === "dolibarr.product_create") {
        rejectUnsupportedArguments(name, args, [
          "mode",
          "label",
          "ref",
          "type",
          "price",
        ]);
        const mode = parseWriteMode(args);
        const payload: Record<string, unknown> = {
          label: readRequiredString(args, "label"),
          ref: readRequiredString(args, "ref"),
        };
        const type = readOptionalIntegerArgument(args, "type", { min: 0 });
        if (type !== undefined) payload.type = type;
        if (typeof args.price === "number") {
          payload.price = args.price;
          payload.price_base_type = "HT";
        }
        if (mode === "preview") {
          return {
            content: {
              committed: false,
              doctype: "Dolibarr Product",
              resolved: payload,
            },
            summary: "Preview Dolibarr product create (not written)",
          };
        }
        const id = await client.createProduct(payload, _ctx.signal);
        const nativeId = toDolibarrNativeId(id, name);
        return {
          content: {
            committed: true,
            doctype: "Dolibarr Product",
            nativeId,
            resolved: payload,
          },
          summary: `Created Dolibarr product ${nativeId}`,
        };
      }

      if (name === "dolibarr.thirdparty_update") {
        rejectUnsupportedArguments(name, args, [
          "mode",
          "id",
          "name",
          "tva_intra",
          "code_client",
          "email",
          "phone",
          "multicurrency_code",
        ]);
        const mode = parseWriteMode(args);
        const id = readRequiredInteger(args, "id", { min: 1 });
        const payload: Record<string, unknown> = {};
        for (
          const f of [
            "name",
            "tva_intra",
            "code_client",
            "email",
            "phone",
            "multicurrency_code",
          ]
        ) {
          const v = readOptionalStringArgument(args, f);
          if (v !== undefined) payload[f] = v;
        }
        const nativeId = String(id);
        if (mode === "preview") {
          return {
            content: {
              committed: false,
              doctype: "Dolibarr Thirdparty",
              resolved: payload,
            },
            summary: "Preview Dolibarr thirdparty update (not written)",
          };
        }
        await client.updateThirdparty(id, payload, _ctx.signal);
        return {
          content: {
            committed: true,
            doctype: "Dolibarr Thirdparty",
            nativeId,
            resolved: payload,
          },
          summary: `Updated Dolibarr thirdparty ${nativeId}`,
        };
      }

      if (name === "dolibarr.product_update") {
        rejectUnsupportedArguments(name, args, [
          "mode",
          "id",
          "label",
          "price",
          "type",
        ]);
        const mode = parseWriteMode(args);
        const id = readRequiredInteger(args, "id", { min: 1 });
        const payload: Record<string, unknown> = {};
        const label = readOptionalStringArgument(args, "label");
        if (label !== undefined) payload.label = label;
        const productType = readOptionalIntegerArgument(args, "type", {
          min: 0,
        });
        if (productType !== undefined) payload.type = productType;
        if (typeof args.price === "number") {
          payload.price = args.price;
          payload.price_base_type = "HT";
        }
        const nativeId = String(id);
        if (mode === "preview") {
          return {
            content: {
              committed: false,
              doctype: "Dolibarr Product",
              resolved: payload,
            },
            summary: "Preview Dolibarr product update (not written)",
          };
        }
        await client.updateProduct(id, payload, _ctx.signal);
        return {
          content: {
            committed: true,
            doctype: "Dolibarr Product",
            nativeId,
            resolved: payload,
          },
          summary: `Updated Dolibarr product ${nativeId}`,
        };
      }

      if (name === "dolibarr.supplier_create") {
        rejectUnsupportedArguments(name, args, [
          "mode",
          "name",
          "tva_intra",
          "code_fournisseur",
          "email",
          "phone",
          "multicurrency_code",
        ]);
        const mode = parseWriteMode(args);
        const payload: Record<string, unknown> = {
          name: readRequiredString(args, "name"),
          fournisseur: 1,
          // ⚠️ CODEX: confirm whether client:0 should also be sent alongside
          // fournisseur:1 to disambiguate the role. Implemented without client
          // field for now — Dolibarr may default client to 0 when fournisseur=1.
        };
        for (
          const f of [
            "tva_intra",
            "code_fournisseur",
            "email",
            "phone",
            "multicurrency_code",
          ]
        ) {
          const v = readOptionalStringArgument(args, f);
          if (v !== undefined) payload[f] = v;
        }
        if (mode === "preview") {
          return {
            content: {
              committed: false,
              doctype: "Dolibarr Thirdparty",
              resolved: payload,
            },
            summary: "Preview Dolibarr supplier create (not written)",
          };
        }
        const id = await client.createThirdparty(payload, _ctx.signal);
        const nativeId = toDolibarrNativeId(id, name);
        return {
          content: {
            committed: true,
            doctype: "Dolibarr Thirdparty",
            nativeId,
            resolved: payload,
          },
          summary: `Created Dolibarr supplier ${nativeId}`,
        };
      }

      if (name === "dolibarr.supplier_update") {
        rejectUnsupportedArguments(name, args, [
          "mode",
          "id",
          "name",
          "tva_intra",
          "code_fournisseur",
          "email",
          "phone",
          "multicurrency_code",
        ]);
        const mode = parseWriteMode(args);
        const id = readRequiredInteger(args, "id", { min: 1 });
        const payload: Record<string, unknown> = {};
        for (
          const f of [
            "name",
            "tva_intra",
            "code_fournisseur",
            "email",
            "phone",
            "multicurrency_code",
          ]
        ) {
          const v = readOptionalStringArgument(args, f);
          if (v !== undefined) payload[f] = v;
        }
        const nativeId = String(id);
        if (mode === "preview") {
          return {
            content: {
              committed: false,
              doctype: "Dolibarr Thirdparty",
              resolved: payload,
            },
            summary: "Preview Dolibarr supplier update (not written)",
          };
        }
        await client.updateThirdparty(id, payload, _ctx.signal);
        return {
          content: {
            committed: true,
            doctype: "Dolibarr Thirdparty",
            nativeId,
            resolved: payload,
          },
          summary: `Updated Dolibarr supplier ${nativeId}`,
        };
      }

      throw new UnknownToolError("dolibarr", name);
    },

    dispose(): void {
      // No persistent resources.
    },
  };
}
