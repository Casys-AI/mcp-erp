import { assertEquals, assertThrows } from "@std/assert";
import { WriteError } from "../../domain/write.ts";
import {
  assertDateRange,
  optIsoDate,
  parseIsoDate,
  parseSalesDocumentLines,
} from "./sales-document-validation.ts";

// parseSalesDocumentLines — happy path

Deno.test("parseSalesDocumentLines — accepts valid lines", () => {
  const result = parseSalesDocumentLines(
    {
      lines: [
        { sku: "ITEM-001", qty: 2, unitPrice: 100 },
        { sku: "ITEM-002", qty: 1, unitPrice: 0, description: "Free item" },
      ],
    },
    "erpnext",
  );
  assertEquals(result.length, 2);
  assertEquals(result[0], { sku: "ITEM-001", qty: 2, unitPrice: 100 });
  assertEquals(result[1], {
    sku: "ITEM-002",
    qty: 1,
    unitPrice: 0,
    description: "Free item",
  });
});

// parseSalesDocumentLines — EMPTY_LINES

Deno.test("parseSalesDocumentLines — missing lines throws EMPTY_LINES", () => {
  const err = assertThrows(
    () => parseSalesDocumentLines({}, "erpnext"),
    WriteError,
  );
  assertEquals(err.code, "EMPTY_LINES");
});

Deno.test("parseSalesDocumentLines — empty array throws EMPTY_LINES", () => {
  const err = assertThrows(
    () => parseSalesDocumentLines({ lines: [] }, "dolibarr"),
    WriteError,
  );
  assertEquals(err.code, "EMPTY_LINES");
});

Deno.test("parseSalesDocumentLines — non-array lines throws EMPTY_LINES", () => {
  const err = assertThrows(
    () => parseSalesDocumentLines({ lines: "oops" }, "erpnext"),
    WriteError,
  );
  assertEquals(err.code, "EMPTY_LINES");
});

// parseSalesDocumentLines — INVALID_LINE (item shape)

Deno.test("parseSalesDocumentLines — non-object line throws INVALID_LINE", () => {
  const err = assertThrows(
    () => parseSalesDocumentLines({ lines: ["bad"] }, "erpnext"),
    WriteError,
  );
  assertEquals(err.code, "INVALID_LINE");
  assertEquals(err.context.lineIndex, 0);
});

Deno.test("parseSalesDocumentLines — array-in-array line throws INVALID_LINE", () => {
  const err = assertThrows(
    () => parseSalesDocumentLines({ lines: [[]] }, "dolibarr"),
    WriteError,
  );
  assertEquals(err.code, "INVALID_LINE");
  assertEquals(err.context.lineIndex, 0);
});

Deno.test("parseSalesDocumentLines — unknown property in line throws INVALID_LINE", () => {
  const err = assertThrows(
    () =>
      parseSalesDocumentLines(
        { lines: [{ sku: "X", qty: 1, unitPrice: 10, extra: true }] },
        "erpnext",
      ),
    WriteError,
  );
  assertEquals(err.code, "INVALID_LINE");
  assertEquals(err.context.lineIndex, 0);
  assertEquals(err.context.field, "extra");
});

// parseSalesDocumentLines — INVALID_LINE (sku)

Deno.test("parseSalesDocumentLines — missing sku throws INVALID_LINE", () => {
  const err = assertThrows(
    () =>
      parseSalesDocumentLines(
        { lines: [{ qty: 1, unitPrice: 10 }] },
        "erpnext",
      ),
    WriteError,
  );
  assertEquals(err.code, "INVALID_LINE");
  assertEquals(err.context.field, "sku");
});

Deno.test("parseSalesDocumentLines — empty sku throws INVALID_LINE", () => {
  const err = assertThrows(
    () =>
      parseSalesDocumentLines(
        { lines: [{ sku: "", qty: 1, unitPrice: 10 }] },
        "erpnext",
      ),
    WriteError,
  );
  assertEquals(err.code, "INVALID_LINE");
  assertEquals(err.context.field, "sku");
});

// parseSalesDocumentLines — INVALID_LINE (qty)

Deno.test("parseSalesDocumentLines — qty 0 throws INVALID_LINE", () => {
  const err = assertThrows(
    () =>
      parseSalesDocumentLines(
        { lines: [{ sku: "X", qty: 0, unitPrice: 10 }] },
        "erpnext",
      ),
    WriteError,
  );
  assertEquals(err.code, "INVALID_LINE");
  assertEquals(err.context.field, "qty");
});

Deno.test("parseSalesDocumentLines — negative qty throws INVALID_LINE", () => {
  const err = assertThrows(
    () =>
      parseSalesDocumentLines(
        { lines: [{ sku: "X", qty: -1, unitPrice: 10 }] },
        "dolibarr",
      ),
    WriteError,
  );
  assertEquals(err.code, "INVALID_LINE");
  assertEquals(err.context.field, "qty");
});

Deno.test("parseSalesDocumentLines — non-number qty throws INVALID_LINE", () => {
  const err = assertThrows(
    () =>
      parseSalesDocumentLines(
        { lines: [{ sku: "X", qty: "2", unitPrice: 10 }] },
        "erpnext",
      ),
    WriteError,
  );
  assertEquals(err.code, "INVALID_LINE");
  assertEquals(err.context.field, "qty");
});

// parseSalesDocumentLines — INVALID_LINE (unitPrice)

Deno.test("parseSalesDocumentLines — negative unitPrice throws INVALID_LINE", () => {
  const err = assertThrows(
    () =>
      parseSalesDocumentLines(
        { lines: [{ sku: "X", qty: 1, unitPrice: -0.01 }] },
        "dolibarr",
      ),
    WriteError,
  );
  assertEquals(err.code, "INVALID_LINE");
  assertEquals(err.context.field, "unitPrice");
});

Deno.test("parseSalesDocumentLines — zero unitPrice is valid", () => {
  const result = parseSalesDocumentLines(
    { lines: [{ sku: "X", qty: 1, unitPrice: 0 }] },
    "erpnext",
  );
  assertEquals(result[0].unitPrice, 0);
});

Deno.test("parseSalesDocumentLines — non-number unitPrice throws INVALID_LINE", () => {
  const err = assertThrows(
    () =>
      parseSalesDocumentLines(
        { lines: [{ sku: "X", qty: 1, unitPrice: "free" }] },
        "erpnext",
      ),
    WriteError,
  );
  assertEquals(err.code, "INVALID_LINE");
  assertEquals(err.context.field, "unitPrice");
});

// parseSalesDocumentLines — INVALID_LINE (description)

Deno.test("parseSalesDocumentLines — non-string description throws INVALID_LINE", () => {
  const err = assertThrows(
    () =>
      parseSalesDocumentLines(
        { lines: [{ sku: "X", qty: 1, unitPrice: 10, description: 42 }] },
        "erpnext",
      ),
    WriteError,
  );
  assertEquals(err.code, "INVALID_LINE");
  assertEquals(err.context.field, "description");
});

Deno.test("parseSalesDocumentLines — lineIndex present in context", () => {
  const err = assertThrows(
    () =>
      parseSalesDocumentLines(
        {
          lines: [
            { sku: "OK", qty: 1, unitPrice: 10 },
            { sku: "BAD", qty: -1, unitPrice: 10 },
          ],
        },
        "erpnext",
      ),
    WriteError,
  );
  assertEquals(err.context.lineIndex, 1);
});

// parseIsoDate

Deno.test("parseIsoDate — accepts valid YYYY-MM-DD", () => {
  assertEquals(parseIsoDate("date", "2026-07-02", "erpnext"), "2026-07-02");
});

Deno.test("parseIsoDate — rejects non-string", () => {
  const err = assertThrows(
    () => parseIsoDate("date", 20260702, "erpnext"),
    WriteError,
  );
  assertEquals(err.code, "INVALID_FIELD");
  assertEquals(err.context.field, "date");
});

Deno.test("parseIsoDate — rejects wrong format", () => {
  const err = assertThrows(
    () => parseIsoDate("date", "07/02/2026", "dolibarr"),
    WriteError,
  );
  assertEquals(err.code, "INVALID_FIELD");
});

Deno.test("parseIsoDate — rejects invalid month 13", () => {
  const err = assertThrows(
    () => parseIsoDate("date", "2026-13-01", "erpnext"),
    WriteError,
  );
  assertEquals(err.code, "INVALID_FIELD");
});

// optIsoDate

Deno.test("optIsoDate — undefined returns undefined", () => {
  assertEquals(optIsoDate("date", undefined, "erpnext"), undefined);
});

Deno.test("optIsoDate — valid date returns the date", () => {
  assertEquals(optIsoDate("date", "2026-12-31", "dolibarr"), "2026-12-31");
});

Deno.test("optIsoDate — invalid date throws INVALID_FIELD", () => {
  const err = assertThrows(
    () => optIsoDate("date", "not-a-date", "erpnext"),
    WriteError,
  );
  assertEquals(err.code, "INVALID_FIELD");
});

// assertDateRange

Deno.test("assertDateRange — equal dates is valid", () => {
  assertDateRange("validUntil", "2026-07-02", "2026-07-02", "dolibarr");
});

Deno.test("assertDateRange — later date is valid", () => {
  assertDateRange("dueDate", "2026-08-01", "2026-07-02", "erpnext");
});

Deno.test("assertDateRange — earlier date throws INVALID_DATE_RANGE", () => {
  const err = assertThrows(
    () => assertDateRange("validUntil", "2026-07-01", "2026-07-02", "dolibarr"),
    WriteError,
  );
  assertEquals(err.code, "INVALID_DATE_RANGE");
  assertEquals(err.context.field, "validUntil");
});
