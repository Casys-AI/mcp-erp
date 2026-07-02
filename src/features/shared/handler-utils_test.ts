import { assertEquals, assertThrows } from "@std/assert";
import { NormalizedError } from "../../domain/normalized.ts";
import { WriteError } from "../../domain/write.ts";
import {
  assertFieldsSupported,
  erpnextEffectiveStatus,
  extractArray,
  extractDoc,
  optEnum,
  optNonNegativeNumber,
  optString,
  parseDolibarrNumericId,
  reqString,
  resolveNativeId,
} from "./handler-utils.ts";

Deno.test("handler utils — resolveNativeId accepts non-empty nativeId", () => {
  assertEquals(resolveNativeId({ nativeId: "CUST-001" }), "CUST-001");
});

Deno.test("handler utils — resolveNativeId rejects missing nativeId", () => {
  assertThrows(
    () => resolveNativeId({}),
    TypeError,
    "nativeId must be a non-empty string",
  );
});

Deno.test("handler utils — parseDolibarrNumericId accepts positive integers", () => {
  assertEquals(parseDolibarrNumericId("42"), 42);
});

Deno.test("handler utils — parseDolibarrNumericId rejects invalid IDs", () => {
  const err = assertThrows(
    () => parseDolibarrNumericId("42abc"),
    NormalizedError,
  );
  assertEquals(err.code, "INVALID_NATIVE_ID");
});

Deno.test("handler utils — extractDoc returns an object at key or empty object", () => {
  assertEquals(extractDoc({ customer: { name: "Ada" } }, "customer"), {
    name: "Ada",
  });
  assertEquals(extractDoc({ customer: [] }, "customer"), {});
  assertEquals(extractDoc(undefined, "customer"), {});
});

Deno.test("handler utils — extractArray returns an array at key or empty array", () => {
  assertEquals(extractArray({ customers: [{ name: "Ada" }] }, "customers"), [
    { name: "Ada" },
  ]);
  assertEquals(extractArray({ customers: {} }, "customers"), []);
  assertEquals(extractArray(undefined, "customers"), []);
});

Deno.test("handler utils — reqString requires a non-empty string", () => {
  assertEquals(reqString("name", "Client SA", "dolibarr"), "Client SA");

  const err = assertThrows(
    () => reqString("name", "", "dolibarr"),
    WriteError,
  );
  assertEquals(err.code, "MISSING_REQUIRED_FIELD");
});

Deno.test("handler utils — optString validates optional non-empty strings", () => {
  assertEquals(optString("email", undefined, "erpnext"), undefined);
  assertEquals(
    optString("email", "ops@example.com", "erpnext"),
    "ops@example.com",
  );

  const err = assertThrows(
    () => optString("email", "", "erpnext"),
    WriteError,
  );
  assertEquals(err.code, "INVALID_FIELD");
});

Deno.test("handler utils — optEnum validates allowed string values", () => {
  assertEquals(
    optEnum("kind", "service", ["product", "service"] as const, "erpnext"),
    "service",
  );
  assertEquals(
    optEnum("kind", undefined, ["product", "service"] as const, "erpnext"),
    undefined,
  );

  const err = assertThrows(
    () => optEnum("kind", "bundle", ["product", "service"] as const, "erpnext"),
    WriteError,
  );
  assertEquals(err.code, "INVALID_FIELD");
});

Deno.test("handler utils — optNonNegativeNumber validates optional prices", () => {
  assertEquals(
    optNonNegativeNumber("unitPrice", undefined, "dolibarr"),
    undefined,
  );
  assertEquals(optNonNegativeNumber("unitPrice", 0, "dolibarr"), 0);
  assertEquals(optNonNegativeNumber("unitPrice", 12.5, "dolibarr"), 12.5);

  const err = assertThrows(
    () => optNonNegativeNumber("unitPrice", -1, "dolibarr"),
    WriteError,
  );
  assertEquals(err.code, "INVALID_FIELD");
});

Deno.test("handler utils — assertFieldsSupported checks each declared field", () => {
  assertFieldsSupported("erpnext", {}, ["externalRef"]);

  const err = assertThrows(
    () =>
      assertFieldsSupported("erpnext", { externalRef: "EXT-1" }, [
        "externalRef",
      ]),
    WriteError,
  );
  assertEquals(err.code, "UNSUPPORTED_FIELD");
});

Deno.test("erpnextEffectiveStatus — explicit status wins", () => {
  assertEquals(
    erpnextEffectiveStatus({ status: "To Deliver and Bill", docstatus: 1 }),
    "To Deliver and Bill",
  );
});

Deno.test("erpnextEffectiveStatus — falls back to docstatus when status absent", () => {
  assertEquals(erpnextEffectiveStatus({ docstatus: 0 }), "Draft");
  assertEquals(erpnextEffectiveStatus({ docstatus: 1 }), "Submitted");
  assertEquals(erpnextEffectiveStatus({ docstatus: 2 }), "Cancelled");
  assertEquals(erpnextEffectiveStatus({ docstatus: "1" }), "Submitted");
});

Deno.test("erpnextEffectiveStatus — empty when neither present or unmappable", () => {
  assertEquals(erpnextEffectiveStatus({}), "");
  assertEquals(erpnextEffectiveStatus({ status: "" }), "");
  assertEquals(erpnextEffectiveStatus({ docstatus: 7 }), "");
  assertEquals(erpnextEffectiveStatus({ docstatus: "abc" }), "");
});
