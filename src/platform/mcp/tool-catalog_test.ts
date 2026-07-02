import { assertEquals } from "@std/assert";
import {
  createDolibarrAdapter,
  createErpnextAdapter,
  type ErpToolDefinition,
  getErpToolDefinitions,
} from "../../../mod.ts";

function comparableToolDefinition(tool: ErpToolDefinition) {
  return {
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema,
    outputSchema: tool.outputSchema,
    annotations: tool.annotations,
    _meta: tool._meta,
  };
}

Deno.test("getErpToolDefinitions — returns ERPNext definitions without credentials", () => {
  const tools = getErpToolDefinitions("erpnext");

  assertEquals(tools.map((tool) => tool.name), [
    "erpnext.ping",
    "erpnext.customer_list",
    "erpnext.customer_get",
    "erpnext.item_list",
    "erpnext.item_get",
    "erpnext.sales_invoice_list",
    "erpnext.sales_invoice_get",
    "erpnext.sales_order_list",
    "erpnext.sales_order_get",
    "erpnext.quotation_list",
    "erpnext.quotation_get",
    "erpnext.supplier_list",
    "erpnext.supplier_get",
    "erpnext.payment_entry_list",
    "erpnext.payment_entry_get",
    "erpnext.bin_list",
  ]);
  assertEquals(tools[0].inputSchema, {
    type: "object",
    properties: {},
    additionalProperties: false,
  });
});

Deno.test("getErpToolDefinitions — returns Dolibarr definitions without credentials", () => {
  const tools = getErpToolDefinitions("dolibarr");

  assertEquals(tools.map((tool) => tool.name), [
    "dolibarr.ping",
    "dolibarr.thirdparty_list",
    "dolibarr.thirdparty_get",
    "dolibarr.product_list",
    "dolibarr.product_get",
    "dolibarr.invoice_list",
    "dolibarr.invoice_get",
    "dolibarr.order_list",
    "dolibarr.order_get",
    "dolibarr.proposal_list",
    "dolibarr.proposal_get",
    "dolibarr.payment_list",
    "dolibarr.payment_get",
    "dolibarr.stockmovement_list",
  ]);
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
    "erpnext.customer_list",
    "erpnext.customer_get",
    "erpnext.item_list",
    "erpnext.item_get",
    "erpnext.sales_invoice_list",
    "erpnext.sales_invoice_get",
    "erpnext.sales_order_list",
    "erpnext.sales_order_get",
    "erpnext.quotation_list",
    "erpnext.quotation_get",
    "erpnext.supplier_list",
    "erpnext.supplier_get",
    "erpnext.payment_entry_list",
    "erpnext.payment_entry_get",
    "erpnext.bin_list",
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
