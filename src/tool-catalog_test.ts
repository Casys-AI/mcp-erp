import { assertEquals } from "@std/assert";
import { getErpToolDefinitions } from "../mod.ts";

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
