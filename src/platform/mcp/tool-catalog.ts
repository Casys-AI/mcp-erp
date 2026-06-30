/**
 * Static ERP tool catalog.
 *
 * Lets host platforms list MCP tool definitions by ERP type without building
 * credential-bound adapters.
 *
 * @module @casys/mcp-erp/tool-catalog
 */

import type { ErpToolDefinition } from "../../domain/adapter.ts";
import type { ErpType } from "../../domain/connection.ts";
import { getDolibarrToolDefinitions } from "../erp/dolibarr/adapter.ts";
import { getErpnextToolDefinitions } from "../erp/erpnext/adapter.ts";

const TOOL_CATALOG = {
  erpnext: getErpnextToolDefinitions,
  dolibarr: getDolibarrToolDefinitions,
} satisfies { [E in ErpType]: () => ErpToolDefinition[] };

export function getErpToolDefinitions(
  erpType: ErpType,
): ErpToolDefinition[] {
  return TOOL_CATALOG[erpType]();
}
