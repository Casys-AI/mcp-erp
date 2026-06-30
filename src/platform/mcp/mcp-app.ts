/**
 * @casys/mcp-server bootstrap helpers for mcp-erp.
 *
 * This is the MCP boundary. ERP adapters remain unaware of stdio/http,
 * sessions, schemas, and MCP Apps transport details.
 *
 * @module @casys/mcp-erp/mcp-app
 */

import { McpApp } from "@casys/mcp-server";
import type { ErpAdapter } from "../../domain/adapter.ts";
import { ErpToolsClient } from "./client.ts";
import { erpToolErrorMapper } from "./error-mapper.ts";
import { registerErpViewers } from "../viewers/viewers.ts";

export interface CreateErpMcpAppOptions {
  readonly adapter: ErpAdapter;
  readonly tenantId: string;
  readonly actorSubject?: string | null;
  readonly name?: string;
  readonly version?: string;
  readonly logger?: (message: string) => void;
  readonly registerViewers?: boolean;
  /**
   * HTTP transport mode (MCP spec 2026-07-28 Track A).
   *
   * - `"stateful"` (DEFAULT): session-based transport, retro-compatible with
   *   all MCP clients.  Emits `Mcp-Session-Id` on first response.
   * - `"stateless"`: per-request transport (no handshake, no `Mcp-Session-Id`).
   *   Recommended for single-binary dev servers and environments that can
   *   guarantee a single process (no sticky sessions needed).
   *
   * Default: `"stateful"` — safe default, rétro-compatible.
   */
  readonly transport?: "stateful" | "stateless";
}

export function createErpMcpApp(options: CreateErpMcpAppOptions): McpApp {
  const app = new McpApp({
    name: options.name ?? `mcp-erp-${options.adapter.erpType}`,
    version: options.version ?? "0.1.0",
    maxConcurrent: 10,
    backpressureStrategy: "queue",
    validateSchema: true,
    toolErrorMapper: erpToolErrorMapper,
    logger: options.logger,
    transport: options.transport ?? "stateful",
  });

  new ErpToolsClient({
    tenantId: options.tenantId,
    actorSubject: options.actorSubject ?? null,
  }).registerTools(app, options.adapter);
  if (options.registerViewers ?? true) {
    registerErpViewers(app);
  }

  return app;
}
