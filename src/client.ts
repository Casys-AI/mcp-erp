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
} from "./adapter.ts";

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
