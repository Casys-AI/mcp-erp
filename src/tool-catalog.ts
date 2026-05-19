/**
 * Static ERP tool catalog.
 *
 * Lets host platforms list MCP tool definitions by ERP type without building
 * credential-bound adapters.
 *
 * @module @casys/mcp-erp/tool-catalog
 */

import type { ErpToolDefinition } from "./adapter.ts";
import type { ErpType } from "./connection.ts";
import { getDolibarrToolDefinitions } from "./adapters/dolibarr.ts";
import { getErpnextToolDefinitions } from "./adapters/erpnext.ts";

const TOOL_CATALOG = {
  erpnext: getErpnextToolDefinitions,
  dolibarr: getDolibarrToolDefinitions,
} satisfies { [E in ErpType]: () => ErpToolDefinition[] };

export function getErpToolDefinitions(
  erpType: ErpType,
): ErpToolDefinition[] {
  return TOOL_CATALOG[erpType]();
}
