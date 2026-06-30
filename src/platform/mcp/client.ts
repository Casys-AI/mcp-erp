/**
 * ErpToolsClient — projection from agnostic ERP adapters to @casys/mcp-server.
 *
 * Mirrors the `EInvoiceToolsClient` shape from mcp-einvoice: adapters stay
 * business/runtime focused, while this client owns the MCP wire projection.
 *
 * @module @casys/mcp-erp/client
 */

import type {
  McpApp,
  MCPTool,
  StructuredToolResult,
  ToolHandler,
  ToolHandlerContext,
} from "@casys/mcp-server";
import type {
  ErpAdapter,
  ErpToolCallContext,
  ErpToolCallResult,
  ErpToolDefinition,
} from "../../domain/adapter.ts";
import {
  buildAdapterFromProvider,
  type ErpAdapterCache,
  type ErpConnectionProvider,
  ErpProviderError,
} from "../../connection-provider.ts";

export interface ErpToolsClientOptions {
  readonly tenantId: string;
  readonly actorSubject?: string | null;
  readonly signal?: AbortSignal;
}

export class ErpToolsClient {
  private readonly callContext: ErpToolCallContext;

  constructor(options: ErpToolsClientOptions) {
    this.callContext = {
      tenantId: options.tenantId,
      actorSubject: options.actorSubject ?? null,
      ...(options.signal ? { signal: options.signal } : {}),
    };
  }

  listTools(adapter: ErpAdapter): ErpToolDefinition[] {
    return adapter.tools();
  }

  toMCPFormat(adapter: ErpAdapter): MCPTool[] {
    return this.listTools(adapter).map((tool) => {
      const mcpTool: MCPTool = {
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema,
      };
      if (tool.outputSchema) {
        mcpTool.outputSchema = tool.outputSchema;
      }
      if (tool.annotations) {
        mcpTool.annotations = tool.annotations;
      }
      if (tool._meta) {
        mcpTool._meta = tool._meta;
      }
      return mcpTool;
    });
  }

  buildHandlersMap(adapter: ErpAdapter): Map<string, ToolHandler> {
    const handlers = new Map<string, ToolHandler>();
    for (const tool of this.listTools(adapter)) {
      handlers.set(
        tool.name,
        async (args: Record<string, unknown>, ctx?: ToolHandlerContext) => {
          const perCallCtx = ctx?.request?.signal
            ? { ...this.callContext, signal: ctx.request.signal }
            : this.callContext;
          const result = await adapter.callTool(tool.name, args, perCallCtx);
          return toStructuredToolResult(result);
        },
      );
    }
    return handlers;
  }

  registerTools(app: McpApp, adapter: ErpAdapter): void {
    app.registerTools(
      this.toMCPFormat(adapter),
      this.buildHandlersMap(adapter),
    );
  }

  async execute(
    name: string,
    args: Record<string, unknown>,
    adapter: ErpAdapter,
  ): Promise<ErpToolCallResult> {
    return await adapter.callTool(name, args, this.callContext);
  }
}

// ---------------------------------------------------------------------------
// Multi-tenant handler map (standalone — no per-call state needed at factory)
// ---------------------------------------------------------------------------

/**
 * Build a handler map where each handler resolves the ERP adapter for the
 * current request's tenant on every call.
 *
 * Pipeline per call:
 *   1. Fast-fail: `ctx.authInfo.tenantId` must be present — throws
 *      `ErpProviderError("TENANT_MISSING")` otherwise.
 *   2. Resolve adapter via `buildAdapterFromProvider` (cache-aware).
 *   3. Call `adapter.callTool` with `{ tenantId, actorSubject, signal }`.
 *
 * @param provider - Resolves an `ErpConnection` for a given tenant id.
 * @param tools    - Static tool catalog entries to generate handlers for.
 * @param cache    - Optional adapter cache (shared across calls for efficiency).
 */
export function buildMultiTenantHandlersMap(
  provider: ErpConnectionProvider,
  tools: ErpToolDefinition[],
  cache?: ErpAdapterCache,
): Map<string, ToolHandler> {
  const handlers = new Map<string, ToolHandler>();

  for (const tool of tools) {
    const toolName = tool.name;
    handlers.set(
      toolName,
      async (
        args: Record<string, unknown>,
        ctx?: ToolHandlerContext,
      ): Promise<unknown> => {
        const tenantId = ctx?.authInfo?.tenantId;
        if (!tenantId) {
          throw new ErpProviderError(
            "TENANT_MISSING",
            { tool: toolName },
            "ensure createMultiTenantMiddleware is configured before tool handlers",
          );
        }

        const adapter = await buildAdapterFromProvider(
          provider,
          tenantId,
          cache,
        );
        const callCtx: ErpToolCallContext = {
          tenantId,
          actorSubject: ctx?.authInfo?.subject ?? null,
          ...(ctx?.request?.signal ? { signal: ctx.request.signal } : {}),
        };

        const result = await adapter.callTool(toolName, args, callCtx);
        return toStructuredToolResult(result);
      },
    );
  }

  return handlers;
}

function toStructuredToolResult(
  result: ErpToolCallResult,
): StructuredToolResult {
  return {
    content: result.summary ?? fallbackSummary(result.content),
    structuredContent: asStructuredContent(result.content),
  };
}

function asStructuredContent(content: unknown): Record<string, unknown> {
  if (
    content !== null && typeof content === "object" && !Array.isArray(content)
  ) {
    return content as Record<string, unknown>;
  }
  return { value: content };
}

function fallbackSummary(content: unknown): string {
  if (typeof content === "string") {
    return content;
  }
  return JSON.stringify(content);
}
