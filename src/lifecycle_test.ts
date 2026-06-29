/**
 * TDD Red bar — lifecycle mappers (Wave 3).
 *
 * Run `deno test src/lifecycle_test.ts` to verify these pass after GREEN.
 */

import { assertEquals } from "@std/assert";
import { mapDolibarrLifecycle, mapErpNextLifecycle } from "./lifecycle.ts";

// ─── ERPNext lifecycle ────────────────────────────────────────────────────────

Deno.test("mapErpNextLifecycle — Sales Invoice: Draft → draft", () => {
  assertEquals(mapErpNextLifecycle("Draft", "Sales Invoice"), "draft");
});

Deno.test("mapErpNextLifecycle — Sales Invoice: Unpaid → open", () => {
  assertEquals(mapErpNextLifecycle("Unpaid", "Sales Invoice"), "open");
});

Deno.test("mapErpNextLifecycle — Sales Invoice: Overdue → overdue", () => {
  assertEquals(mapErpNextLifecycle("Overdue", "Sales Invoice"), "overdue");
});

Deno.test("mapErpNextLifecycle — Sales Invoice: Submitted → validated", () => {
  assertEquals(mapErpNextLifecycle("Submitted", "Sales Invoice"), "validated");
});

Deno.test("mapErpNextLifecycle — Sales Invoice: Paid → paid", () => {
  assertEquals(mapErpNextLifecycle("Paid", "Sales Invoice"), "paid");
});

Deno.test("mapErpNextLifecycle — Sales Invoice: Cancelled → cancelled", () => {
  assertEquals(mapErpNextLifecycle("Cancelled", "Sales Invoice"), "cancelled");
});

Deno.test("mapErpNextLifecycle — Sales Order: Submitted → validated", () => {
  assertEquals(mapErpNextLifecycle("Submitted", "Sales Order"), "validated");
});

Deno.test("mapErpNextLifecycle — Sales Order: To Deliver and Bill → open", () => {
  assertEquals(
    mapErpNextLifecycle("To Deliver and Bill", "Sales Order"),
    "open",
  );
});

Deno.test("mapErpNextLifecycle — Sales Order: Closed → closed", () => {
  assertEquals(mapErpNextLifecycle("Closed", "Sales Order"), "closed");
});

Deno.test("mapErpNextLifecycle — Quotation: Closed → cancelled (refused)", () => {
  // 'Closed' on Quotation = refused ≠ 'Closed' on Sales Order (fulfilled)
  assertEquals(mapErpNextLifecycle("Closed", "Quotation"), "cancelled");
});

Deno.test("mapErpNextLifecycle — Quotation: Ordered → closed", () => {
  assertEquals(mapErpNextLifecycle("Ordered", "Quotation"), "closed");
});

Deno.test("mapErpNextLifecycle — unknown status → unknown", () => {
  assertEquals(
    mapErpNextLifecycle("SomeWeirdStatus", "Sales Invoice"),
    "unknown",
  );
});

Deno.test("mapErpNextLifecycle — unknown doctype → unknown on unknown status", () => {
  assertEquals(
    mapErpNextLifecycle("SomethingElse", "UnknownDoctype"),
    "unknown",
  );
});

Deno.test("mapErpNextLifecycle — unknown doctype: Draft → draft (fallback table)", () => {
  assertEquals(mapErpNextLifecycle("Draft", "UnknownDoctype"), "draft");
});

// ─── ERPNext Sales Invoice — statuts complémentaires ─────────────────────────

Deno.test("mapErpNextLifecycle — Sales Invoice: Partly Paid → open", () => {
  assertEquals(mapErpNextLifecycle("Partly Paid", "Sales Invoice"), "open");
});

Deno.test("mapErpNextLifecycle — Sales Invoice: Unpaid and Discounted → open", () => {
  assertEquals(
    mapErpNextLifecycle("Unpaid and Discounted", "Sales Invoice"),
    "open",
  );
});

Deno.test("mapErpNextLifecycle — Sales Invoice: Overdue and Discounted → overdue", () => {
  assertEquals(
    mapErpNextLifecycle("Overdue and Discounted", "Sales Invoice"),
    "overdue",
  );
});

Deno.test("mapErpNextLifecycle — Sales Invoice: Partly Paid and Discounted → open", () => {
  assertEquals(
    mapErpNextLifecycle("Partly Paid and Discounted", "Sales Invoice"),
    "open",
  );
});

Deno.test("mapErpNextLifecycle — Sales Invoice: Internal Transfer → paid", () => {
  assertEquals(
    mapErpNextLifecycle("Internal Transfer", "Sales Invoice"),
    "paid",
  );
});

// ─── ERPNext Sales Order — statuts complémentaires ───────────────────────────

Deno.test("mapErpNextLifecycle — Sales Order: To Pay → open", () => {
  assertEquals(mapErpNextLifecycle("To Pay", "Sales Order"), "open");
});

Deno.test("mapErpNextLifecycle — Sales Order: On Hold → open", () => {
  assertEquals(mapErpNextLifecycle("On Hold", "Sales Order"), "open");
});

// ─── ERPNext Quotation — statuts complémentaires ─────────────────────────────

Deno.test("mapErpNextLifecycle — Quotation: Partially Ordered → open", () => {
  assertEquals(mapErpNextLifecycle("Partially Ordered", "Quotation"), "open");
});

// ─── Dolibarr lifecycle ───────────────────────────────────────────────────────

Deno.test("mapDolibarrLifecycle — invoice statut=0 → draft", () => {
  assertEquals(mapDolibarrLifecycle("invoice", 0), "draft");
});

Deno.test("mapDolibarrLifecycle — invoice statut='0' (string) → draft", () => {
  assertEquals(mapDolibarrLifecycle("invoice", "0"), "draft");
});

Deno.test("mapDolibarrLifecycle — invoice statut=1 → open", () => {
  assertEquals(mapDolibarrLifecycle("invoice", 1), "open");
});

Deno.test("mapDolibarrLifecycle — invoice paye=1 → paid (override)", () => {
  assertEquals(mapDolibarrLifecycle("invoice", 1, 1), "paid");
});

Deno.test("mapDolibarrLifecycle — invoice paye='1' (string) → paid (override)", () => {
  assertEquals(mapDolibarrLifecycle("invoice", 1, "1"), "paid");
});

Deno.test("mapDolibarrLifecycle — invoice paye=true → paid (override)", () => {
  assertEquals(mapDolibarrLifecycle("invoice", 1, true), "paid");
});

Deno.test("mapDolibarrLifecycle — invoice statut=2 → paid", () => {
  assertEquals(mapDolibarrLifecycle("invoice", 2), "paid");
});

Deno.test("mapDolibarrLifecycle — invoice statut=3 → cancelled (abandoned)", () => {
  assertEquals(mapDolibarrLifecycle("invoice", 3), "cancelled");
});

Deno.test("mapDolibarrLifecycle — order statut=-1 → cancelled", () => {
  assertEquals(mapDolibarrLifecycle("order", -1), "cancelled");
});

Deno.test("mapDolibarrLifecycle — order statut=0 → draft", () => {
  assertEquals(mapDolibarrLifecycle("order", 0), "draft");
});

Deno.test("mapDolibarrLifecycle — order statut=1 → open (validated)", () => {
  assertEquals(mapDolibarrLifecycle("order", 1), "open");
});

Deno.test("mapDolibarrLifecycle — order statut=2 → open (shipment on process)", () => {
  assertEquals(mapDolibarrLifecycle("order", 2), "open");
});

Deno.test("mapDolibarrLifecycle — order statut=3 → closed", () => {
  assertEquals(mapDolibarrLifecycle("order", 3), "closed");
});

Deno.test("mapDolibarrLifecycle — proposal statut=2 → signed", () => {
  assertEquals(mapDolibarrLifecycle("proposal", 2), "signed");
});

Deno.test("mapDolibarrLifecycle — proposal statut=-1 → cancelled", () => {
  assertEquals(mapDolibarrLifecycle("proposal", -1), "cancelled");
});

Deno.test("mapDolibarrLifecycle — proposal statut=3 → cancelled (not signed)", () => {
  assertEquals(mapDolibarrLifecycle("proposal", 3), "cancelled");
});

Deno.test("mapDolibarrLifecycle — proposal statut=4 → closed (billed)", () => {
  assertEquals(mapDolibarrLifecycle("proposal", 4), "closed");
});

Deno.test("mapDolibarrLifecycle — unknown statut → unknown", () => {
  assertEquals(mapDolibarrLifecycle("invoice", 99), "unknown");
});

Deno.test("mapDolibarrLifecycle — null statut → unknown", () => {
  assertEquals(mapDolibarrLifecycle("invoice", null), "unknown");
});

Deno.test("mapDolibarrLifecycle — undefined statut → unknown", () => {
  assertEquals(mapDolibarrLifecycle("invoice", undefined), "unknown");
});
