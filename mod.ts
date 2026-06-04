/**
 * @casys/mcp-erp — ERP-agnostic MCP adapter layer.
 *
 * Drop-in adapters for ERPNext, Dolibarr, and more. Designed to be
 * embedded inside a multi-tenant MCP server: every adapter takes an
 * explicit `ErpConnection` (no env vars, no globals) so the same
 * process can serve N tenants with N different ERPs.
 *
 * v0.1 ships the adapter primitives, static tool catalog, @casys/mcp-server
 * projection, first read-only ERPNext tools, and first read-only Dolibarr
 * tools.
 *
 * @module @casys/mcp-erp
 */

// ─── Connection (the single seam between platform and adapter) ─────
export { ERP_TYPES, isKnownErpType } from "./src/connection.ts";
export type { ErpConnection, ErpType } from "./src/connection.ts";

// ─── Adapter contract ──────────────────────────────────────────────
export { UnknownToolError } from "./src/adapter.ts";
export type {
  ErpAdapter,
  ErpAdapterFactory,
  ErpToolAnnotations,
  ErpToolCallContext,
  ErpToolCallResult,
  ErpToolDefinition,
  ErpToolMeta,
} from "./src/adapter.ts";

// ─── Registry & adapters ───────────────────────────────────────────
export { buildAdapter, REGISTERED_ERP_TYPES } from "./src/registry.ts";
export { ErpToolsClient } from "./src/client.ts";
export { erpToolErrorMapper } from "./src/error-mapper.ts";
export { createErpMcpApp } from "./src/mcp-app.ts";
export { getErpToolDefinitions } from "./src/tool-catalog.ts";
export {
  ERP_DIAGNOSTICS_META,
  ERP_DOCLIST_META,
  ERP_INVOICE_META,
  ERP_VIEWERS,
  registerErpViewers,
} from "./src/viewers.ts";
export type { ErpViewerName } from "./src/viewers.ts";

// Direct exports for callers that want to skip the registry indirection
// (typed factories, useful for DI in tests).
export {
  createErpnextAdapter,
  FrappeApiError,
} from "./src/adapters/erpnext.ts";
export {
  createDolibarrAdapter,
  DolibarrApiError,
} from "./src/adapters/dolibarr.ts";
