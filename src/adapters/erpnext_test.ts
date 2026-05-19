import { assertEquals, assertRejects } from "@std/assert";
import { createErpnextAdapter } from "./erpnext.ts";
import { UnknownToolError } from "../adapter.ts";

Deno.test("createErpnextAdapter — exposes erpnext.ping in tools()", () => {
  const adapter = createErpnextAdapter({
    erpType: "erpnext",
    apiUrl: "https://erp.example.com",
    apiKey: "k",
    apiSecret: "s",
    sandbox: true,
  });

  const tools = adapter.tools();
  assertEquals(tools.map((t) => t.name), ["erpnext.ping"]);
  assertEquals(adapter.erpType, "erpnext");
});

Deno.test("createErpnextAdapter — ping returns the configured apiUrl", async () => {
  const adapter = createErpnextAdapter({
    erpType: "erpnext",
    apiUrl: "https://erp.example.com",
    apiKey: "k",
    apiSecret: "s",
    sandbox: true,
  });

  const result = await adapter.callTool("erpnext.ping", {}, {
    tenantId: "acme",
    actorSubject: null,
  });

  assertEquals((result.content as { ok: boolean }).ok, true);
  assertEquals(
    (result.content as { apiUrl: string }).apiUrl,
    "https://erp.example.com",
  );
});

Deno.test("createErpnextAdapter — unknown tool throws UnknownToolError", async () => {
  const adapter = createErpnextAdapter({
    erpType: "erpnext",
    apiUrl: "https://erp.example.com",
    apiKey: "k",
    apiSecret: "s",
    sandbox: true,
  });

  await assertRejects(
    () =>
      adapter.callTool("erpnext.nope", {}, {
        tenantId: "acme",
        actorSubject: null,
      }),
    UnknownToolError,
    "Unknown erpnext tool: erpnext.nope",
  );
});
