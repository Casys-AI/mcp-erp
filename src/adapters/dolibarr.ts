/**
 * Dolibarr adapter — Dolibarr REST integration.
 *
 * SCAFFOLD STATE: a single `dolibarr.ping` tool. Reserved for **structural
 * validation** of the registry / multi-adapter plumbing. v0.1 ships
 * intentionally empty per the brainstorm verdict (2026-05-09): "1 real
 * adapter (ERPNext) + 1 minimal validation adapter (Dolibarr)".
 *
 * @module @casys/mcp-erp/adapters/dolibarr
 */

import type { ErpConnection } from "../connection.ts";
import {
  type ErpAdapter,
  type ErpToolCallContext,
  type ErpToolCallResult,
  type ErpToolDefinition,
  UnknownToolError,
} from "../adapter.ts";

type DolibarrConnection = Extract<ErpConnection, { erpType: "dolibarr" }>;

const TOOLS: readonly ErpToolDefinition[] = [
  {
    name: "dolibarr.ping",
    description: "Smoke-test the configured Dolibarr connection.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  },
];

export function getDolibarrToolDefinitions(): ErpToolDefinition[] {
  return TOOLS.map((tool) => ({
    ...tool,
    inputSchema: structuredClone(tool.inputSchema),
  }));
}

export function createDolibarrAdapter(
  connection: DolibarrConnection,
): ErpAdapter {
  return {
    erpType: "dolibarr",

    tools(): ErpToolDefinition[] {
      return getDolibarrToolDefinitions();
    },

    async callTool(
      name: string,
      _args: Record<string, unknown>,
      _ctx: ErpToolCallContext,
    ): Promise<ErpToolCallResult> {
      if (name === "dolibarr.ping") {
        return await Promise.resolve({
          content: {
            ok: true,
            apiUrl: connection.apiUrl,
            sandbox: connection.sandbox,
          },
          summary: `Dolibarr connection check — apiUrl=${connection.apiUrl}`,
        });
      }
      throw new UnknownToolError("dolibarr", name);
    },

    dispose(): void {
      // No persistent resources.
    },
  };
}
