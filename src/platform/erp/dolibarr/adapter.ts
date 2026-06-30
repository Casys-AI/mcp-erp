/**
 * Dolibarr adapter — Dolibarr REST integration.
 *
 * v0.1 starts with a small read-only Dolibarr surface. Keep tools native to
 * Dolibarr modules first; normalized ERP abstractions come later.
 *
 * @module @casys/mcp-erp/adapters/dolibarr
 */

import type { ErpConnection } from "../../../domain/connection.ts";
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
import { callDolibarrWriteTool } from "./handlers/writes.ts";
export { DolibarrApiError } from "./client.ts";

type DolibarrConnection = Extract<ErpConnection, { erpType: "dolibarr" }>;

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

      const write = await callDolibarrWriteTool({
        name,
        args,
        ctx: _ctx,
        connection,
        client,
      });
      if (write) return write;

      throw new UnknownToolError("dolibarr", name);
    },

    dispose(): void {
      // No persistent resources.
    },
  };
}
