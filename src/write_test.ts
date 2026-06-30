import { assertEquals, assertThrows } from "@std/assert";
import {
  assertFieldSupported,
  parseWriteMode,
  WRITE_CAPABILITIES,
  WriteError,
} from "./write.ts";

Deno.test("parseWriteMode — accepts preview and commit", () => {
  assertEquals(parseWriteMode({ mode: "preview" }), "preview");
  assertEquals(parseWriteMode({ mode: "commit" }), "commit");
});

Deno.test("parseWriteMode — missing mode throws INVALID_MODE", () => {
  const err = assertThrows(() => parseWriteMode({}), WriteError);
  assertEquals(err.code, "INVALID_MODE");
});

Deno.test("parseWriteMode — invalid mode throws INVALID_MODE", () => {
  const err = assertThrows(() => parseWriteMode({ mode: "dry" }), WriteError);
  assertEquals(err.code, "INVALID_MODE");
});

Deno.test("assertFieldSupported — unsupported field present throws", () => {
  const err = assertThrows(
    () => assertFieldSupported("erpnext", "externalRef", { externalRef: "X" }),
    WriteError,
  );
  assertEquals(err.code, "UNSUPPORTED_FIELD");
});

Deno.test("assertFieldSupported — unsupported field absent is a no-op", () => {
  assertFieldSupported("erpnext", "externalRef", {});
});

Deno.test("WRITE_CAPABILITIES — dolibarr supports externalRef, erpnext does not", () => {
  assertEquals(
    WRITE_CAPABILITIES.erpnext.unsupportedFields.includes("externalRef"),
    true,
  );
  assertEquals(
    WRITE_CAPABILITIES.dolibarr.unsupportedFields.includes("externalRef"),
    false,
  );
});

Deno.test("WRITE_CAPABILITIES — new CRUD-entity tools present on both ERPs", () => {
  const newTools = [
    "erp.customer_update",
    "erp.product_update",
    "erp.supplier_create",
    "erp.supplier_update",
  ];
  for (const tool of newTools) {
    assertEquals(
      WRITE_CAPABILITIES.erpnext.tools.includes(tool),
      true,
      `erpnext missing ${tool}`,
    );
    assertEquals(
      WRITE_CAPABILITIES.dolibarr.tools.includes(tool),
      true,
      `dolibarr missing ${tool}`,
    );
  }
});
