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
import { UnknownToolError } from "../../domain/adapter.ts";
import { NormalizedError } from "../../domain/normalized.ts";
import { WriteError } from "../../domain/write.ts";
import { ErpProviderError } from "./connection-provider.ts";
import { DolibarrApiError } from "../erp/dolibarr/adapter.ts";
import { FrappeApiError } from "../erp/erpnext/adapter.ts";

export const erpToolErrorMapper: ToolErrorMapper = (error, toolName) => {
  if (error instanceof WriteError || error instanceof NormalizedError) {
    return JSON.stringify({
      code: redactSensitiveText(error.code),
      context: redactSensitiveValue(error.context),
      recovery: redactSensitiveText(error.recovery),
    });
  }

  if (error instanceof ErpProviderError) {
    return JSON.stringify({
      code: redactSensitiveText(error.code),
      context: redactSensitiveValue(error.context),
      recovery: redactSensitiveText(error.recovery),
    });
  }

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

const REDACTED = "[REDACTED]";
const SENSITIVE_KEY_RE =
  /(api[_-]?key|api[_-]?secret|auth|bearer|credential|password|private[_-]?key|secret|token)/i;
const SENSITIVE_TEXT_RE =
  /\b(api[_-]?key|api[_-]?secret|authorization|credential|password|private[_-]?key|secret|token)\b\s*[:=]\s*["']?[^"',\s;}\]]+/gi;
const BEARER_TEXT_RE = /\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi;
// Frappe-style "token <key>:<secret>" credential (keyword followed by a space,
// no `:`/`=` separator — so SENSITIVE_TEXT_RE does not catch it).
const FRAPPE_TOKEN_RE = /\btoken\s+\S+:\S+/gi;

function redactSensitiveValue(
  value: unknown,
  seen = new WeakSet<object>(),
): unknown {
  if (typeof value === "string") {
    return redactSensitiveText(value);
  }
  if (value === null || typeof value !== "object") {
    return value;
  }
  if (seen.has(value)) {
    return "[Circular]";
  }
  seen.add(value);

  if (Array.isArray(value)) {
    return value.map((item) => redactSensitiveValue(item, seen));
  }

  const redacted: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    redacted[key] = SENSITIVE_KEY_RE.test(key)
      ? REDACTED
      : redactSensitiveValue(item, seen);
  }
  return redacted;
}

function redactSensitiveText(value: string): string {
  return value
    .replace(SENSITIVE_TEXT_RE, (match) => {
      const separator = match.includes("=") ? "=" : ":";
      const [key] = match.split(separator);
      return `${key}${separator}${REDACTED}`;
    })
    .replace(FRAPPE_TOKEN_RE, `token ${REDACTED}`)
    .replace(BEARER_TEXT_RE, `Bearer ${REDACTED}`);
}
