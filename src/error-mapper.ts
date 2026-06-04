/**
 * Error mapper for @casys/mcp-server.
 *
 * `McpApp` calls this mapper when a tool handler throws. Returning a string
 * turns the exception into an MCP `isError: true` tool result; returning null
 * preserves the framework's JSON-RPC error behavior for unexpected failures.
 *
 * @module @casys/mcp-erp/error-mapper
 */

import type { ToolErrorMapper } from "@casys/mcp-server";
import { UnknownToolError } from "./adapter.ts";
import { DolibarrApiError } from "./adapters/dolibarr.ts";
import { FrappeApiError } from "./adapters/erpnext.ts";

export const erpToolErrorMapper: ToolErrorMapper = (error, toolName) => {
  if (
    error instanceof UnknownToolError ||
    error instanceof FrappeApiError ||
    error instanceof DolibarrApiError
  ) {
    return error.message;
  }

  if (error instanceof TypeError) {
    return `${toolName}: ${error.message}`;
  }

  return null;
};
