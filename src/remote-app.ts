/**
 * Remote MCP server factory for @casys/mcp-erp.
 *
 * Creates a multi-tenant HTTP-embeddable McpApp boundary:
 *   - Auth is cablee via `AuthOptions` (any `AuthProvider` subclass).
 *   - Tenant resolution is handled by the supplied `TenantResolver` which
 *     writes `authInfo.tenantId` for downstream tool handlers.
 *   - All known ERP tools are registered with multi-tenant handlers that
 *     resolve the right adapter per-request.
 *   - `getFetchHandler` surfaces a Web-standard fetch handler so the app can
 *     be mounted inside any framework (Fresh, Hono, Express, …) without
 *     owning a port.
 *
 * This module is the **remote** boundary; `mcp-app.ts` remains the local
 * single-tenant dev boundary (not modified here).
 *
 * @module @casys/mcp-erp/remote-app
 */

import {
  createMultiTenantMiddleware,
  McpApp,
  type TenantResolver,
} from "@casys/mcp-server";
import type { AuthOptions } from "@casys/mcp-server";
import type { ErpAdapterCache } from "./connection-provider.ts";
import type { ErpConnectionProvider } from "./connection-provider.ts";
import { buildMultiTenantHandlersMap } from "./client.ts";
import { erpToolErrorMapper } from "./error-mapper.ts";
import { registerErpViewers } from "./viewers.ts";
import { getErpToolDefinitions } from "./tool-catalog.ts";
import { REGISTERED_ERP_TYPES } from "./registry.ts";
import type { ErpToolDefinition } from "./adapter.ts";
import type { ErpType } from "./connection.ts";

export interface CreateErpRemoteAppOptions {
  /**
   * Resolves an `ErpConnection` for a given tenant identifier.
   * Implementations should throw `ErpProviderError` when the tenant is unknown.
   */
  readonly connectionProvider: ErpConnectionProvider;

  /**
   * Auth configuration wired into the McpApp.
   * Construct the provider with `JwtAuthProvider` or any preset factory.
   */
  readonly auth: AuthOptions;

  /**
   * Resolves and validates the tenant identifier from an authenticated request.
   * Runs after the auth middleware has populated `ctx.authInfo`.
   */
  readonly tenantResolver: TenantResolver;

  /**
   * Optional adapter cache shared across all tool calls.
   * Prevents rebuilding adapters on every request for the same tenant.
   */
  readonly cache?: ErpAdapterCache;

  /** MCP server name (default: "mcp-erp-remote"). */
  readonly name?: string;

  /** MCP server version (default: "0.1.0"). */
  readonly version?: string;

  /**
   * Register the ERP MCP Apps viewer resources (HTML viewers).
   * Default: true.
   */
  readonly registerViewers?: boolean;

  /**
   * Restrict the registered tool surface to these ERP types.
   * Default: all registered ERP types. The tool set is fixed at registration
   * time (static schemas); per-tenant dynamic filtering is out of scope.
   */
  readonly erpTypes?: readonly ErpType[];

  /**
   * HTTP transport mode (MCP spec 2026-07-28 Track A).
   *
   * - `"stateful"` (DEFAULT): session-based transport, retro-compatible with
   *   all MCP clients.  Emits `Mcp-Session-Id` on first response.
   * - `"stateless"`: per-request transport (no handshake, no `Mcp-Session-Id`).
   *   **Recommended for hosted multi-instance deployments** where sticky sessions
   *   are not guaranteed (e.g. serverless, multi-region load balancers).  Each
   *   request carries its own `protocolVersion` in `params._meta`.
   *
   * Default: `"stateful"` — safe default, rétro-compatible.
   */
  readonly transport?: "stateful" | "stateless";
}

/**
 * Build a multi-tenant HTTP-ready McpApp.
 *
 * Steps:
 *   1. Collect all tool definitions from all registered ERP types.
 *   2. Create `McpApp` with auth and error mapper wired.
 *   3. Add `createMultiTenantMiddleware` so each request's `tenantId` is
 *      resolved before tool handlers execute.
 *   4. Register all ERP tools with `buildMultiTenantHandlersMap`.
 *   5. Optionally register ERP MCP Apps viewers.
 *
 * @returns A fully-wired `McpApp`. Call `getFetchHandler()` to embed it in
 *   an existing server, or `startHttp()` to own a port directly.
 */
export function createErpRemoteApp(
  options: CreateErpRemoteAppOptions,
): McpApp {
  const erpTypes = options.erpTypes ?? REGISTERED_ERP_TYPES;
  const allTools: ErpToolDefinition[] = erpTypes.flatMap(
    (erpType) => getErpToolDefinitions(erpType),
  );

  const app = new McpApp({
    name: options.name ?? "mcp-erp-remote",
    version: options.version ?? "0.1.0",
    maxConcurrent: 10,
    backpressureStrategy: "queue",
    validateSchema: true,
    toolErrorMapper: erpToolErrorMapper,
    auth: options.auth,
    transport: options.transport ?? "stateful",
  });

  // Multi-tenant middleware: resolves tenantId into authInfo BEFORE handlers run.
  app.use(createMultiTenantMiddleware(options.tenantResolver));

  // Build static MCPTool definitions (schemas stay static; handlers are per-request).
  const mcpTools = allTools.map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: t.inputSchema,
    ...(t.outputSchema ? { outputSchema: t.outputSchema } : {}),
    ...(t.annotations ? { annotations: t.annotations } : {}),
    ...(t._meta ? { _meta: t._meta } : {}),
  }));

  const handlers = buildMultiTenantHandlersMap(
    options.connectionProvider,
    allTools,
    options.cache,
  );

  app.registerTools(mcpTools, handlers);

  if (options.registerViewers ?? true) {
    registerErpViewers(app);
  }

  return app;
}
