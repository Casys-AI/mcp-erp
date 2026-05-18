import type { NetworkTransportAuth } from "@casys/mcp-bridge/adapters/network";
import {
  ERP_TYPES,
  type ErpConnection,
  type ErpType,
  isKnownErpType,
} from "../../../src/connection.ts";

type ConfigObject = Record<string, unknown>;

export interface LocalErpAgentConfig {
  readonly relayUrl: string;
  readonly endpointAuth: NetworkTransportAuth;
  readonly tenantId: string;
  readonly erpType: ErpType;
  readonly agentId: string;
  readonly keyVersion: number;
  readonly connection: ErpConnection;
}

export function parseLocalErpAgentConfig(raw: unknown): LocalErpAgentConfig {
  const config = requireObject(raw, "CONFIG_INVALID: expected object");
  const relayUrl = requireUrl(
    requireNonEmptyString(config, "relayUrl"),
    "relayUrl",
    ["ws:", "wss:"],
  );
  const endpointAuth = parseEndpointAuth(
    requireObjectField(config, "endpointAuth"),
  );
  const tenantId = requireNonEmptyString(config, "tenantId");
  const erpType = requireErpType(config, "erpType");
  const agentId = requireNonEmptyString(config, "agentId");
  const keyVersion = requirePositiveInteger(config, "keyVersion");
  const connection = parseErpConnection(
    requireObjectField(config, "connection"),
  );

  if (connection.erpType !== erpType) {
    throw new Error(
      "CONFIG_FIELD_INVALID: connection.erpType must match erpType",
    );
  }

  return {
    relayUrl,
    endpointAuth,
    tenantId,
    erpType,
    agentId,
    keyVersion,
    connection,
  };
}

function parseEndpointAuth(raw: unknown): NetworkTransportAuth {
  const auth = requireObject(
    raw,
    "CONFIG_FIELD_INVALID: endpointAuth must be an object",
  );
  const type = requireNonEmptyString(auth, "type", "endpointAuth.type");

  if (type === "bearer") {
    const via = auth.via === undefined
      ? undefined
      : requireEndpointAuthVia(auth);
    const queryParam = auth.queryParam === undefined
      ? undefined
      : requireNonEmptyString(auth, "queryParam", "endpointAuth.queryParam");
    return {
      type,
      token: requireNonEmptyString(auth, "token", "endpointAuth.token"),
      ...(via ? { via } : {}),
      ...(queryParam ? { queryParam } : {}),
    };
  }

  if (type === "headers") {
    const headers = requireObjectField(auth, "headers", "endpointAuth.headers");
    const parsed: Record<string, string> = {};
    for (const [name, value] of Object.entries(headers)) {
      if (!name.trim()) {
        throw new Error("CONFIG_FIELD_INVALID: endpointAuth.headers name");
      }
      if (typeof value !== "string" || value.trim().length === 0) {
        throw new Error(
          `CONFIG_FIELD_INVALID: endpointAuth.headers.${name} must be a non-empty string`,
        );
      }
      parsed[name] = value;
    }
    return { type, headers: parsed };
  }

  throw new Error(
    "CONFIG_FIELD_INVALID: endpointAuth.type must be bearer or headers",
  );
}

function requireEndpointAuthVia(source: ConfigObject): "header" {
  const value = requireNonEmptyString(source, "via", "endpointAuth.via");
  if (value !== "header") {
    throw new Error(
      "CONFIG_FIELD_INVALID: endpointAuth.via must be one of header; query-mode bearer is rejected because the WebSocket URL is logged by many proxies",
    );
  }
  return value;
}

function parseErpConnection(raw: ConfigObject): ErpConnection {
  const erpType = requireErpType(raw, "erpType", "connection.erpType");

  switch (erpType) {
    case "erpnext":
      return {
        erpType,
        apiUrl: requireUrl(
          requireNonEmptyString(raw, "apiUrl", "connection.apiUrl"),
          "connection.apiUrl",
          ["http:", "https:"],
        ),
        apiKey: requireNonEmptyString(raw, "apiKey", "connection.apiKey"),
        apiSecret: requireNonEmptyString(
          raw,
          "apiSecret",
          "connection.apiSecret",
        ),
        sandbox: requireBoolean(raw, "sandbox", "connection.sandbox"),
      };
    case "dolibarr":
      return {
        erpType,
        apiUrl: requireUrl(
          requireNonEmptyString(raw, "apiUrl", "connection.apiUrl"),
          "connection.apiUrl",
          ["http:", "https:"],
        ),
        apiKey: requireNonEmptyString(raw, "apiKey", "connection.apiKey"),
        sandbox: requireBoolean(raw, "sandbox", "connection.sandbox"),
      };
    default:
      return assertNever(erpType);
  }
}

function requireObject(raw: unknown, message: string): ConfigObject {
  if (!isObject(raw)) {
    throw new Error(message);
  }
  return raw;
}

function requireObjectField(
  source: ConfigObject,
  property: string,
  path = property,
): ConfigObject {
  if (!Object.hasOwn(source, property)) {
    throw new Error(`CONFIG_FIELD_REQUIRED: ${path}`);
  }

  const value = source[property];
  if (!isObject(value)) {
    throw new Error(`CONFIG_FIELD_INVALID: ${path} must be an object`);
  }
  return value;
}

function requireNonEmptyString(
  source: ConfigObject,
  property: string,
  path = property,
): string {
  if (!Object.hasOwn(source, property)) {
    throw new Error(`CONFIG_FIELD_REQUIRED: ${path}`);
  }

  const value = source[property];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`CONFIG_FIELD_INVALID: ${path} must be a non-empty string`);
  }
  return value;
}

function requireErpType(
  source: ConfigObject,
  property: string,
  path = property,
): ErpType {
  const value = requireNonEmptyString(source, property, path);
  if (!isKnownErpType(value)) {
    throw new Error(
      `CONFIG_FIELD_INVALID: ${path} must be one of ${ERP_TYPES.join(", ")}`,
    );
  }
  return value;
}

function requirePositiveInteger(
  source: ConfigObject,
  property: string,
  path = property,
): number {
  if (!Object.hasOwn(source, property)) {
    throw new Error(`CONFIG_FIELD_REQUIRED: ${path}`);
  }

  const value = source[property];
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
    throw new Error(
      `CONFIG_FIELD_INVALID: ${path} must be a positive integer`,
    );
  }
  return value;
}

function requireBoolean(
  source: ConfigObject,
  property: string,
  path = property,
): boolean {
  if (!Object.hasOwn(source, property)) {
    throw new Error(`CONFIG_FIELD_REQUIRED: ${path}`);
  }

  const value = source[property];
  if (typeof value !== "boolean") {
    throw new Error(`CONFIG_FIELD_INVALID: ${path} must be a boolean`);
  }
  return value;
}

function requireUrl(
  raw: string,
  path: string,
  protocols: readonly string[],
): string {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error(`CONFIG_FIELD_INVALID: ${path} must be a valid URL`);
  }
  if (!protocols.includes(parsed.protocol)) {
    throw new Error(
      `CONFIG_FIELD_INVALID: ${path} must use ${protocols.join(" or ")}`,
    );
  }
  return parsed.toString();
}

function isObject(raw: unknown): raw is ConfigObject {
  return typeof raw === "object" && raw !== null && !Array.isArray(raw);
}

function assertNever(value: never): never {
  throw new Error(
    `CONFIG_FIELD_INVALID: unsupported ERP type ${String(value)}`,
  );
}
