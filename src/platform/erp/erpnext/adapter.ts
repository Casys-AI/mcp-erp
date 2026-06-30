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
import { FrappeRestClient } from "./client.ts";
import { callErpnextAccountingTool } from "./handlers/accounting.ts";
import { callErpnextBusinessPartyTool } from "./handlers/business-parties.ts";
import { callErpnextCatalogTool } from "./handlers/catalog.ts";
import { callErpnextDocumentTool } from "./handlers/documents.ts";
import { callErpnextDiagnosticsTool } from "./handlers/diagnostics.ts";
import { callErpnextInventoryTool } from "./handlers/inventory.ts";
import { callErpnextWriteTool } from "./handlers/writes.ts";
import { ERPNEXT_TOOLS as TOOLS } from "./tools.ts";
export { FrappeApiError } from "./client.ts";

type ErpnextConnection = Extract<ErpConnection, { erpType: "erpnext" }>;

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

      const inventory = await callErpnextInventoryTool({
        name,
        args,
        ctx: _ctx,
        client,
      });
      if (inventory) return inventory;

      const write = await callErpnextWriteTool({
        name,
        args,
        ctx: _ctx,
        connection,
        client,
      });
      if (write) return write;

      throw new UnknownToolError("erpnext", name);
    },

    dispose(): void {
      // No persistent resources yet. Wire HTTP keep-alive close here when
      // the real Frappe client lands.
    },
  };
}
