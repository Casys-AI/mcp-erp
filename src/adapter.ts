/**
 * ErpAdapter — the contract every ERP integration must satisfy.
 *
 * Each adapter exposes a list of MCP-flavoured `ErpToolDefinition`s and a
 * `callTool(name, args, ctx)` dispatcher. The adapter is **stateless from
 * the platform's POV** — it owns its own HTTP keep-alive / retry state,
 * but does not retain authentication or tenant context across calls
 * (that's passed via `ErpToolCallContext`).
 *
 * Design choice (verdict from architectural brainstorm 2026-05-09):
 * adapters take an explicit `ErpConnection` at factory time (no globals,
 * no env vars). This makes them safe to instantiate per-tenant in a
 * multi-tenant server.
 *
 * @module @casys/mcp-erp/adapter
 */

import type { ErpConnection, ErpType } from "./connection.ts";

/**
 * MCP tool definition surfaced by an adapter. Stays decoupled from the
 * `@casys/mcp-server` SDK shape — consumers project this into the SDK
 * format at boundary time (see einvoice-platform's `EInvoiceToolsClient`
 * for the same pattern in the e-invoicing world).
 */
export interface ErpToolDefinition {
  /** Tool name as exposed to MCP clients. Convention: `<erpType>.<action>`. */
  name: string;
  /** One-line description. */
  description: string;
  /** JSON Schema (draft-07) for the call args. */
  inputSchema: Record<string, unknown>;
}

/** Per-call context handed to `callTool`. Adapter-agnostic. */
export interface ErpToolCallContext {
  /** Tenant identifier (slug or UUID — adapter-opaque). For logging only. */
  tenantId: string;
  /** Authenticated user subject (JWT `sub`), or null for system calls. */
  actorSubject: string | null;
}

/** Structured result of a tool call. */
export interface ErpToolCallResult {
  /** Free-form structured result returned to the MCP client. */
  content: unknown;
  /** Optional human-readable summary (used as MCP text content). */
  summary?: string;
}

/**
 * The adapter contract. One instance per `(tenant, erpType)` pair in
 * multi-tenant deployments.
 */
export interface ErpAdapter {
  readonly erpType: ErpType;

  /** Declarative list of tools the adapter handles. */
  tools(): ErpToolDefinition[];

  /** Invoke a tool by name. Throws `UnknownToolError` if the name isn't surfaced. */
  callTool(
    name: string,
    args: Record<string, unknown>,
    ctx: ErpToolCallContext,
  ): Promise<ErpToolCallResult>;

  /** Release HTTP keep-alive / pooled resources. */
  dispose(): Promise<void> | void;
}

/**
 * Adapter factory — given an explicit `ErpConnection`, return an adapter
 * instance bound to that connection. Factories are registered in
 * `registry.ts`.
 */
export type ErpAdapterFactory<E extends ErpType = ErpType> = (
  connection: Extract<ErpConnection, { erpType: E }>,
) => ErpAdapter | Promise<ErpAdapter>;

/** Thrown by `callTool` when the tool name isn't known to the adapter. */
export class UnknownToolError extends Error {
  override readonly name = "UnknownToolError";
  constructor(
    public readonly erpType: ErpType,
    public readonly toolName: string,
  ) {
    super(`Unknown ${erpType} tool: ${toolName}`);
  }
}
