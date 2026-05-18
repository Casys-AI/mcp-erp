import { assertEquals } from "@std/assert";
import {
  createDolibarrAdapter,
  createErpnextAdapter,
  type ErpToolDefinition,
  getErpToolDefinitions,
} from "../mod.ts";

function comparableToolDefinition(tool: ErpToolDefinition) {
  return {
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema,
  };
}

Deno.test("getErpToolDefinitions — returns ERPNext definitions without credentials", () => {
  const tools = getErpToolDefinitions("erpnext");

  assertEquals(tools.map((tool) => tool.name), ["erpnext.ping"]);
  assertEquals(tools[0].inputSchema, {
    type: "object",
    properties: {},
    additionalProperties: false,
  });
});

Deno.test("getErpToolDefinitions — returns Dolibarr definitions without credentials", () => {
  const tools = getErpToolDefinitions("dolibarr");

  assertEquals(tools.map((tool) => tool.name), ["dolibarr.ping"]);
  assertEquals(tools[0].inputSchema, {
    type: "object",
    properties: {},
    additionalProperties: false,
  });
});

Deno.test("getErpToolDefinitions — returns a fresh array", () => {
  const tools = getErpToolDefinitions("erpnext");
  tools.push({
    name: "erpnext.mutated",
    description: "Mutation probe.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  });

  assertEquals(getErpToolDefinitions("erpnext").map((tool) => tool.name), [
    "erpnext.ping",
  ]);
});

Deno.test("getErpToolDefinitions — matches runtime adapter tool definitions", () => {
  const erpnextAdapter = createErpnextAdapter({
    erpType: "erpnext",
    apiUrl: "https://erpnext.example.test",
    apiKey: "fake-api-key",
    apiSecret: "fake-api-secret",
    sandbox: true,
  });
  const dolibarrAdapter = createDolibarrAdapter({
    erpType: "dolibarr",
    apiUrl: "https://dolibarr.example.test/api/index.php",
    apiKey: "fake-api-key",
    sandbox: true,
  });

  assertEquals(
    getErpToolDefinitions("erpnext").map(comparableToolDefinition),
    erpnextAdapter.tools().map(comparableToolDefinition),
  );
  assertEquals(
    getErpToolDefinitions("dolibarr").map(comparableToolDefinition),
    dolibarrAdapter.tools().map(comparableToolDefinition),
  );
});
