# Write CRUD Entities Increment Plan (increment 2)

> **For agentic workers:** Execute with superpowers:subagent-driven-development. This increment EXTENDS the established write pattern from increment 1 (the `*_create` tools already merged on `main`). Read the existing create code as the model — do not reinvent it. Steps use TDD: red test → impl → green → commit.

**Goal:** Complete the CRUD of simple entities toward mcp-erpnext parity — add `erp.customer_update`, `erp.product_update`, `erp.supplier_create`, `erp.supplier_update` on both ERPNext and Dolibarr, behind the existing normalized surface with required `mode: preview|commit`.

**Architecture:** Identical to increment 1 (see `docs/architecture/write-surfaces-and-capability-gating.md`). Normalized `erp.*` tools on `NormalizedAdapter` map → internal native tools (`erpnext.*` / `dolibarr.*`, in `callTool` dispatch, NOT in `tools()`). Native tools handle `mode`, do the HTTP write, return `{ committed, nativeId?, resolved }`.

**Reference pattern (read these first, replicate their shape):**
- `src/adapters/erpnext.ts` — `FrappeRestClient.create`, internal `erpnext.customer_create` / `erpnext.item_create` branches, `parseWriteMode`, helpers `readRequiredString`/`readOptionalStringArgument`/`readOptionalInteger`.
- `src/adapters/dolibarr.ts` — `DolibarrRestClient.createThirdparty`/`createProduct`, `toDolibarrNativeId`, internal `dolibarr.thirdparty_create` / `dolibarr.product_create` branches.
- `src/normalized-adapter.ts` — `erp.customer_create` / `erp.product_create` branches (mapping + `assertFieldSupported` + envelope `{...content, erpType}`), local validators `reqString`/`optString`/`optEnum`/`optNonNegativeNumber`.
- `src/write.ts` — `WriteMode`, `WriteError`, `WRITE_CAPABILITIES`, `assertFieldSupported`.

## Global Constraints (same as increment 1)

- Runtime Deno; `deno task test` (= `deno test --allow-all`); `deno task check` must pass (incl. `deno fmt` on ALL touched files, `.ts` AND `.md`).
- Normalized surface = `erp.` namespace; native tools `<erpType>.<entity>_<action>` NOT in `tools()`.
- `mode: "preview" | "commit"` REQUIRED; preview NEVER writes, NEVER returns a real `nativeId`; result always `{ committed: bool }`.
- Structured errors only via `WriteError` (code+context+recovery). Strict runtime validation in the normalized layer (no silent coercion) — same validators as increment 1.
- `additionalProperties: false` on every `inputSchema`.
- API-conformance items flagged `⚠️ CODEX` verified during the final Codex review.

## Key differences vs increment 1 (create)

- **Update tools take a required `nativeId`** (ERPNext `name`, Dolibarr numeric id) + `mode`. All business fields are **optional** — only provided fields are sent (partial update). NO tenant-default injection on update (the record already exists). `commit` → HTTP PUT; result `nativeId` = the input id.
- **Supplier** = a business party with the supplier role:
  - ERPNext: a distinct `Supplier` DocType (`supplier_name`, `supplier_type`, `supplier_group`). Mirror `customer_create`/`update` but on `Supplier`.
  - Dolibarr: the SAME `thirdparties` endpoint with `fournisseur: 1` (instead of `client: 1`). Reuse the thirdparty create/update path with the supplier role flag.

---

## Task A (write.ts + connection.ts — foundation, sequential first)

**Files:** `src/write.ts`, `src/write_test.ts`, `src/connection.ts`, `src/connection_test.ts`

- Add the 4 new tool names to `WRITE_CAPABILITIES[erpnext|dolibarr].tools`:
  `erp.customer_update`, `erp.product_update`, `erp.supplier_create`, `erp.supplier_update`.
  Keep `unsupportedFields: ["externalRef"]` for erpnext (externalRef stays Dolibarr-only).
- Add optional `defaultSupplierGroup?: string` to the `erpnext` variant of `ErpConnection` (mirror `defaultCustomerGroup` — optional, injected on supplier_create only if present; do NOT block the create on it). ⚠️ CODEX: verify whether `supplier_group` is `reqd` on ERPNext Supplier (if it is, treat like `item_group`: required tenant default → `MISSING_REQUIRED_CONFIG`).
- Tests: extend `write_test.ts` (capabilities include the new tools), `connection_test.ts` (defaultSupplierGroup assignable).
- Commit: `feat(write): register CRUD-entity tools in capabilities + supplier-group tenant default`.

## Task B (ERPNext track — parallel) — `src/adapters/erpnext.ts` (+ test)

Add `FrappeRestClient.update<T>(doctype, name, data, requestOptions?)`: PUT `/api/resource/:doctype/:encodeURIComponent(name)` with the data as flat JSON body (reuse the `request` body support added in increment 1); return `result.data`; throw `FrappeApiError` on malformed response. ⚠️ CODEX: confirm Frappe PUT accepts a partial flat body and returns `{ data: <doc> }`.

Add internal `callTool` branches (NOT in `TOOLS`), each `mode`-aware, replicating the create branches' shape:
- `erpnext.customer_update`: requires `name` (the nativeId) + `mode`; optional `customer_name`, `tax_id`, `email_id`, `mobile_no`, `default_currency`. preview → `{committed:false, doctype:"Customer", resolved}` (no PUT); commit → `client.update("Customer", name, payload)` → validate returned name → `{committed:true, doctype:"Customer", nativeId:name, resolved}`.
- `erpnext.item_update`: requires `name` + `mode`; optional `item_name`, `standard_rate`, `stock_uom`. (Do NOT change `item_code` — it is the immutable name.) Same preview/commit shape on `Item`.
- `erpnext.supplier_create`: requires `mode` + `supplier_name`; optional `supplier_type` (default "Company"), `tax_id`. Inject `connection.defaultSupplierGroup` as `supplier_group` if present. preview/commit on `Supplier` (POST via existing `create`).
- `erpnext.supplier_update`: requires `name` + `mode`; optional `supplier_name`, `supplier_type`, `tax_id`. PUT `Supplier`.

Tests (`erpnext_test.ts`): for each — preview does not hit fetch; commit sends the expected PUT/POST path + body; CREATE_FAILED/update-failed when the response lacks `name`. Reuse existing `mockFetch`/`createTestAdapter`.
Commit: `feat(erpnext): internal customer_update/item_update/supplier_create/supplier_update`.

## Task C (Dolibarr track — parallel) — `src/adapters/dolibarr.ts` (+ test)

Add `DolibarrRestClient.updateThirdparty(id, payload, signal?)` (PUT `/thirdparties/:id`) and `updateProduct(id, payload, signal?)` (PUT `/products/:id`), reusing the `request` body param from increment 1. ⚠️ CODEX: confirm Dolibarr PUT returns the updated object (not just an id) and that partial payloads are accepted; the tool's returned `nativeId` should remain the input id regardless.

Add internal `callTool` branches (NOT in `TOOLS`), `mode`-aware, replicating the create branches:
- `dolibarr.thirdparty_update`: requires `id` (numeric, via `toDolibarrNativeId`/`parseDolibarrNumericId` style) + `mode`; optional `name`, `tva_intra`, `code_client`, `email`, `phone`, `multicurrency_code`. PUT.
- `dolibarr.product_update`: requires `id` + `mode`; optional `label`, `price` (+ `price_base_type:"HT"` when price present), `type`. PUT.
- `dolibarr.supplier_create`: same as `thirdparty_create` but sets `fournisseur: 1` (instead of `client: 1`). Requires `mode` + `name`; optional `tva_intra`, `code_client`, `email`, `phone`, `multicurrency_code`. ⚠️ CODEX: confirm `fournisseur: 1` selects the supplier role and whether `client` should be `0`/omitted.
- `dolibarr.supplier_update`: PUT `/thirdparties/:id` (same endpoint as thirdparty_update; the role is already set on the record). Requires `id` + `mode` + optional fields.

Tests (`dolibarr_test.ts`): preview no-POST; commit PUT path + body (and `fournisseur:1` for supplier_create); `nativeId` is the input id. Reuse existing `mockFetch`/`createTestAdapter`.
Commit: `feat(dolibarr): internal thirdparty/product update + supplier create/update`.

## Task D (normalized layer — sequential, after B+C) — `src/normalized-adapter.ts` (+ test)

Add 4 tools to `NORMALIZED_TOOLS` and 4 dispatch branches, mirroring `erp.customer_create`/`erp.product_create`. Use the existing local validators (`reqString`/`optString`/`optEnum`/`optNonNegativeNumber`) and `assertFieldSupported`.

- `erp.customer_update`: input `{ erpType, mode, nativeId, name?, taxId?, externalRef?, email?, phone?, currency? }` (required: `erpType`, `mode`, `nativeId`). Gate `externalRef` on erpnext. Map to native:
  - erpnext → `erpnext.customer_update` `{ mode, name: nativeId, customer_name: name?, tax_id?, email_id: email?, mobile_no: phone?, default_currency: currency? }`.
  - dolibarr → `dolibarr.thirdparty_update` `{ mode, id: nativeId, name?, tva_intra: taxId?, code_client: externalRef?, email?, phone?, multicurrency_code: currency? }`.
- `erp.product_update`: input `{ erpType, mode, nativeId, name?, unitPrice?, uom? }`. (No `sku` — immutable.) Map:
  - erpnext → `erpnext.item_update` `{ mode, name: nativeId, item_name: name?, standard_rate: unitPrice?, stock_uom: uom? }`.
  - dolibarr → `dolibarr.product_update` `{ mode, id: nativeId, label: name?, price: unitPrice? }` (uom ignored on Dolibarr).
- `erp.supplier_create`: input `{ erpType, mode, name, taxId?, externalRef?, email?, phone?, currency? }` (required: `erpType`, `mode`, `name`). Gate `externalRef` on erpnext. Map:
  - erpnext → `erpnext.supplier_create` `{ mode, supplier_name: name, tax_id: taxId? }`.
  - dolibarr → `dolibarr.supplier_create` `{ mode, name, tva_intra: taxId?, code_client: externalRef?, email?, phone?, multicurrency_code: currency? }`.
- `erp.supplier_update`: input `{ erpType, mode, nativeId, name?, taxId?, externalRef?, email?, phone?, currency? }`. Map to `erpnext.supplier_update` / `dolibarr.supplier_update` analogously to customer_update.

All four return `{ ...nativeContent, erpType }`. `annotations: { readOnlyHint: false, destructiveHint: false }` (update is not destructive in the delete sense, but it writes).

Tests (`normalized-adapter_test.ts`): for each tool — happy path maps fields and commits (assert native payload); `nativeId`/`name` required → validation error; `externalRef` on erpnext → `UNSUPPORTED_FIELD`; preview returns `committed:false`. Update the "exposes N erp.* tools" count test (10 → 14).
Commit: `feat(normalized): add customer_update/product_update/supplier_create/supplier_update`.

## Final

- `deno task test` all green; `deno task check` green (run `deno fmt` on touched files incl. this `.md`).
- Confirm new native tools are NOT in any `tools()` output (grep `TOOLS`).
- Codex VRAI/FAUX/NUANCE review of the full branch diff, focused on `⚠️ CODEX` flags (Frappe/Dolibarr PUT semantics, supplier_group reqd, Dolibarr `fournisseur` role). Apply fixes, re-verify to MERGE-OK, then merge to `main`.

## Deferred (still out of scope)

Sales/purchase documents (with line items), lifecycle (submit/cancel/validate), delete, multi-tenant, best-of-breed.
