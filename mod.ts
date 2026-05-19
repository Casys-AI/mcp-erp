/**
 * @casys/mcp-erp — ERP-agnostic MCP adapter layer.
 *
 * Drop-in adapters for ERPNext, Dolibarr, and more. Designed to be
 * embedded inside a multi-tenant MCP server: every adapter takes an
 * explicit `ErpConnection` (no env vars, no globals) so the same
 * process can serve N tenants with N different ERPs.
 *
 * v0.1 ships **structural primitives only**. Real ERPNext tools land in
 * 0.2+. This is intentional — the brainstorm verdict (2026-05-09) was
 * to ship a tiny stable surface first and iterate adapters behind it.
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
  ErpToolCallContext,
  ErpToolCallResult,
  ErpToolDefinition,
} from "./src/adapter.ts";

// ─── Registry & adapters ───────────────────────────────────────────
export { buildAdapter, REGISTERED_ERP_TYPES } from "./src/registry.ts";
export { getErpToolDefinitions } from "./src/tool-catalog.ts";

// Direct exports for callers that want to skip the registry indirection
// (typed factories, useful for DI in tests).
export { createErpnextAdapter } from "./src/adapters/erpnext.ts";
export { createDolibarrAdapter } from "./src/adapters/dolibarr.ts";
