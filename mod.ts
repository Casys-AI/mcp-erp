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
export { ERP_TYPES, isKnownErpType } from "./src/domain/connection.ts";
export type { ErpConnection, ErpType } from "./src/domain/connection.ts";

// ─── Adapter contract ──────────────────────────────────────────────
export { UnknownToolError } from "./src/domain/adapter.ts";
export type {
  ErpAdapter,
  ErpAdapterFactory,
  ErpToolAnnotations,
  ErpToolCallContext,
  ErpToolCallResult,
  ErpToolDefinition,
  ErpToolMeta,
} from "./src/domain/adapter.ts";

// ─── Registry & adapters ───────────────────────────────────────────
export { buildAdapter, REGISTERED_ERP_TYPES } from "./src/registry.ts";
export {
  buildMultiTenantHandlersMap,
  ErpToolsClient,
} from "./src/platform/mcp/client.ts";
export { erpToolErrorMapper } from "./src/platform/mcp/error-mapper.ts";
export { createErpMcpApp } from "./src/platform/mcp/mcp-app.ts";
export type { CreateErpMcpAppOptions } from "./src/platform/mcp/mcp-app.ts";
export { getErpToolDefinitions } from "./src/platform/mcp/tool-catalog.ts";

// ─── Multi-tenant remote boundary ─────────────────────────────────
export {
  buildAdapterFromProvider,
  ErpProviderError,
} from "./src/connection-provider.ts";
export type {
  ErpAdapterCache,
  ErpConnectionProvider,
} from "./src/connection-provider.ts";
export { createErpRemoteApp } from "./src/platform/mcp/remote-app.ts";
export type {
  CreateErpRemoteAppOptions,
} from "./src/platform/mcp/remote-app.ts";
export {
  ERP_DETAIL_META,
  ERP_DIAGNOSTICS_META,
  ERP_DOCLIST_META,
  ERP_INVOICE_META,
  ERP_VIEWERS,
  registerErpViewers,
} from "./src/platform/viewers/viewers.ts";
export type { ErpViewerName } from "./src/platform/viewers/viewers.ts";

// Direct exports for callers that want to skip the registry indirection
// (typed factories, useful for DI in tests).
export {
  createErpnextAdapter,
  FrappeApiError,
} from "./src/platform/erp/erpnext/adapter.ts";
export {
  createDolibarrAdapter,
  DolibarrApiError,
} from "./src/platform/erp/dolibarr/adapter.ts";

// ─── Wave 3 — normalized cross-ERP layer ──────────────────────────────────
export type {
  ErpLifecycleState,
  NormalizedPayload,
  NormalizedView,
} from "./src/domain/normalized.ts";
export {
  assertNativeId,
  missingNativeIdError,
  NormalizedError,
} from "./src/domain/normalized.ts";
export { NormalizedAdapter } from "./src/normalized-adapter.ts";
export type { NormalizedAdapterOptions } from "./src/normalized-adapter.ts";
