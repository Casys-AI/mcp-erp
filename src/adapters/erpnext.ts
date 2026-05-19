/**
 * ERPNext adapter — Frappe-flavored REST integration.
 *
 * SCAFFOLD STATE: a single `erpnext.ping` tool that surfaces the
 * configured `apiUrl`. Used to validate the connection plumbing
 * end-to-end before we wire real Frappe calls.
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

import type { ErpConnection } from "../connection.ts";
import {
  type ErpAdapter,
  type ErpToolCallContext,
  type ErpToolCallResult,
  type ErpToolDefinition,
  UnknownToolError,
} from "../adapter.ts";

type ErpnextConnection = Extract<ErpConnection, { erpType: "erpnext" }>;

const TOOLS: readonly ErpToolDefinition[] = [
  {
    name: "erpnext.ping",
    description:
      "Smoke-test the configured ERPNext connection (returns the apiUrl).",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  },
];

export function getErpnextToolDefinitions(): ErpToolDefinition[] {
  return TOOLS.map((tool) => ({
    ...tool,
    inputSchema: structuredClone(tool.inputSchema),
  }));
}

export function createErpnextAdapter(
  connection: ErpnextConnection,
): ErpAdapter {
  return {
    erpType: "erpnext",

    tools(): ErpToolDefinition[] {
      return getErpnextToolDefinitions();
    },

    async callTool(
      name: string,
      _args: Record<string, unknown>,
      _ctx: ErpToolCallContext,
    ): Promise<ErpToolCallResult> {
      if (name === "erpnext.ping") {
        return await Promise.resolve({
          content: {
            ok: true,
            apiUrl: connection.apiUrl,
            sandbox: connection.sandbox,
          },
          summary:
            `ERPNext connection check — apiUrl=${connection.apiUrl} sandbox=${connection.sandbox}`,
        });
      }
      throw new UnknownToolError("erpnext", name);
    },

    dispose(): void {
      // No persistent resources yet. Wire HTTP keep-alive close here when
      // the real Frappe client lands.
    },
  };
}
