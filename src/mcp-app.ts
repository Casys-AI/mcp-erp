/**
 * @casys/mcp-server bootstrap helpers for mcp-erp.
 *
 * This is the MCP boundary. ERP adapters remain unaware of stdio/http,
 * sessions, schemas, and MCP Apps transport details.
 *
 * @module @casys/mcp-erp/mcp-app
 */

import { McpApp } from "@casys/mcp-server";
import type { ErpAdapter } from "./adapter.ts";
import { ErpToolsClient } from "./client.ts";
import { erpToolErrorMapper } from "./error-mapper.ts";
import { registerErpViewers } from "./viewers.ts";

export interface CreateErpMcpAppOptions {
  readonly adapter: ErpAdapter;
  readonly tenantId: string;
  readonly actorSubject?: string | null;
  readonly name?: string;
  readonly version?: string;
  readonly logger?: (message: string) => void;
  readonly registerViewers?: boolean;
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
