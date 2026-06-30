import { assertEquals } from "@std/assert";
import type { ErpConnection } from "./connection.ts";

Deno.test("ErpConnection — erpnext variant accepts tenant defaults", () => {
  const conn: ErpConnection = {
    erpType: "erpnext",
    apiUrl: "https://erp.example.com",
    apiKey: "k",
    apiSecret: "s",
    sandbox: true,
    defaultItemGroup: "All Item Groups",
    defaultStockUom: "Nos",
    defaultCustomerGroup: "All Customer Groups",
    defaultTerritory: "All Territories",
  };
  assertEquals(conn.erpType === "erpnext" ? conn.defaultItemGroup : undefined, "All Item Groups");
});
