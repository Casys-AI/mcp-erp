import { assertEquals, assertThrows } from "@std/assert";
import {
  type LocalErpAgentConfig,
  parseLocalErpAgentConfig,
} from "./config.ts";

Deno.test("parseLocalErpAgentConfig parses ERPNext config with bearer endpoint auth", () => {
  const config = parseLocalErpAgentConfig({
    relayUrl: "wss://tenant.erp-platform.test/mcp/_tunnel",
    endpointAuth: {
      type: "bearer",
      token: "oauth-access-token",
    },
    tenantId: "tenant_123",
    erpType: "erpnext",
    agentId: "agent_1",
    keyVersion: 2,
    connection: {
      erpType: "erpnext",
      apiUrl: "https://erpnext.local",
      apiKey: "key",
      apiSecret: "secret",
      sandbox: true,
    },
  });

  const expected: LocalErpAgentConfig = {
    relayUrl: "wss://tenant.erp-platform.test/mcp/_tunnel",
    endpointAuth: {
      type: "bearer",
      token: "oauth-access-token",
    },
    tenantId: "tenant_123",
    erpType: "erpnext",
    agentId: "agent_1",
    keyVersion: 2,
    connection: {
      erpType: "erpnext",
      apiUrl: "https://erpnext.local/",
      apiKey: "key",
      apiSecret: "secret",
      sandbox: true,
    },
  };
  assertEquals(config, expected);
});

Deno.test("parseLocalErpAgentConfig parses Dolibarr config with header endpoint auth", () => {
  const config = parseLocalErpAgentConfig({
    relayUrl: "wss://tenant.erp-platform.test/mcp/_tunnel",
    endpointAuth: {
      type: "headers",
      headers: { authorization: "Bearer token", "x-agent-id": "agent_1" },
    },
    tenantId: "tenant_123",
    erpType: "dolibarr",
    agentId: "agent_1",
    keyVersion: 1,
    connection: {
      erpType: "dolibarr",
      apiUrl: "https://dolibarr.local/api/index.php",
      apiKey: "dolapi",
      sandbox: false,
    },
  });

  assertEquals(config.endpointAuth, {
    type: "headers",
    headers: { authorization: "Bearer token", "x-agent-id": "agent_1" },
  });
  assertEquals(config.connection, {
    erpType: "dolibarr",
    apiUrl: "https://dolibarr.local/api/index.php",
    apiKey: "dolapi",
    sandbox: false,
  });
});

const invalidCases: ReadonlyArray<{
  readonly name: string;
  readonly raw: unknown;
  readonly message: string;
}> = [
  {
    name: "top-level object",
    raw: null,
    message: "CONFIG_INVALID: expected object",
  },
  {
    name: "relay websocket URL",
    raw: {
      ...validErpnextConfig(),
      relayUrl: "https://tenant.erp-platform.test/mcp/_tunnel",
    },
    message: "CONFIG_FIELD_INVALID: relayUrl must use ws: or wss:",
  },
  {
    name: "required string",
    raw: {
      tenantId: "tenant_123",
      erpType: "erpnext",
      agentId: "agent_1",
      keyVersion: 1,
      connection: validErpnextConnection(),
    },
    message: "CONFIG_FIELD_REQUIRED: relayUrl",
  },
  {
    name: "endpoint auth",
    raw: validErpnextConfigWithoutEndpointAuth(),
    message: "CONFIG_FIELD_REQUIRED: endpointAuth",
  },
  {
    name: "known ERP type",
    raw: {
      ...validErpnextConfig(),
      erpType: "odoo",
    },
    message: "CONFIG_FIELD_INVALID: erpType must be one of erpnext, dolibarr",
  },
  {
    name: "positive integer key version",
    raw: {
      ...validErpnextConfig(),
      keyVersion: 0,
    },
    message: "CONFIG_FIELD_INVALID: keyVersion must be a positive integer",
  },
  {
    name: "matching ERP type",
    raw: {
      ...validErpnextConfig(),
      connection: validDolibarrConnection(),
    },
    message: "CONFIG_FIELD_INVALID: connection.erpType must match erpType",
  },
  {
    name: "ERPNext secret",
    raw: {
      ...validErpnextConfig(),
      connection: {
        erpType: "erpnext",
        apiUrl: "https://erpnext.local",
        apiKey: "key",
        sandbox: true,
      },
    },
    message: "CONFIG_FIELD_REQUIRED: connection.apiSecret",
  },
  {
    name: "ERP API URL",
    raw: {
      ...validErpnextConfig(),
      connection: {
        ...validErpnextConnection(),
        apiUrl: "file:///tmp/erpnext",
      },
    },
    message: "CONFIG_FIELD_INVALID: connection.apiUrl must use http: or https:",
  },
  {
    name: "endpoint bearer token",
    raw: {
      ...validErpnextConfig(),
      endpointAuth: { type: "bearer", token: "" },
    },
    message:
      "CONFIG_FIELD_INVALID: endpointAuth.token must be a non-empty string",
  },
];

for (const testCase of invalidCases) {
  Deno.test(`parseLocalErpAgentConfig rejects invalid ${testCase.name}`, () => {
    assertThrows(
      () => parseLocalErpAgentConfig(testCase.raw),
      Error,
      testCase.message,
    );
  });
}

function validErpnextConfig(): Record<string, unknown> {
  return {
    relayUrl: "wss://tenant.erp-platform.test/mcp/_tunnel",
    endpointAuth: {
      type: "bearer",
      token: "agent-token-0123456789012345678901",
    },
    tenantId: "tenant_123",
    erpType: "erpnext",
    agentId: "agent_1",
    keyVersion: 1,
    connection: validErpnextConnection(),
  };
}

function validErpnextConfigWithoutEndpointAuth(): Record<string, unknown> {
  const { endpointAuth: _endpointAuth, ...config } = validErpnextConfig();
  return config;
}

function validErpnextConnection(): Record<string, unknown> {
  return {
    erpType: "erpnext",
    apiUrl: "https://erpnext.local",
    apiKey: "key",
    apiSecret: "secret",
    sandbox: true,
  };
}

function validDolibarrConnection(): Record<string, unknown> {
  return {
    erpType: "dolibarr",
    apiUrl: "https://dolibarr.local/api/index.php",
    apiKey: "dolapi",
    sandbox: false,
  };
}
