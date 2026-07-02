# Write Lifecycle Increment Plan (increment 4)

> **For agentic workers:** Execute with superpowers:subagent-driven-development.
> This increment EXTENDS the write pattern of increments 1–3 (creates already
> merged on `main`). Read the existing write code as the model. TDD: red test →
> impl → green.

**Goal:** Lifecycle moves for the three sales documents on both ERPs —
`erp.sales_order_submit`, `erp.quotation_submit`, `erp.sales_invoice_submit`
(draft → committed; ERPNext `docstatus` 0→1 ≡ Dolibarr validate 0→1). **Submit
only** — cancel is DEFERRED (fact-check 2026-07-02: no homogeneous Dolibarr
cancel path across the three documents).

**Architecture:** Identical to increment 3 (see
`docs/architecture/write-surfaces-and-capability-gating.md`, section "Increment
4 — sales document lifecycle"). Normalized `erp.*` tools → slice handlers →
mappers → internal native branches (`platform/erp/<erp>/handlers/writes.ts`) →
REST clients.

**Reference pattern:** the increment 3 files — slice contracts/handlers/mappers
for sales-order/quotation/invoice, native write branches, `domain/write.ts`, and
`domain/lifecycle.ts` (`mapErpNextLifecycle` / `mapDolibarrLifecycle` — reused
to put the normalized post-transition `lifecycleState` in the result).

## Global Constraints (same as increments 1–3)

- `deno task check` + `deno task test` green at the end of every task (428
  existing tests stay green); fmt on every touched file.
- `mode: "preview" | "commit"` required; preview NEVER does HTTP, result always
  `{ committed: bool }`.
- Structured `WriteError`s in the normalized layer; native branches keep the
  established reader pattern.
- `additionalProperties: false`; `erpType` stays in the input schema (enum),
  same documented deviation as increments 1–3.
- Hexagonal rule unchanged.

## Key specifics of increment 4

- **Input**: `{ erpType, mode, nativeId }` only. Dolibarr `nativeId` is the
  strict integer rule (`parseDolibarrNumericId`).
- **Result adds `lifecycleState`**: after a committed transition, map the ERP's
  post-state through `domain/lifecycle.ts` tables and include it next to
  `committed`/`nativeId`. Preview result carries no lifecycleState (no HTTP,
  unknown). All API facts below are **fact-checked (Codex pass 2026-07-02)** —
  sources in the architecture doc section "Increment 4 … Provider-specific
  mappings".

- **ERPNext submit** = two calls in commit: `GET /api/resource/:doctype/:name`
  (full current doc) then `POST /api/method/frappe.client.submit` with `{doc}` —
  the embedded `modified` is the optimistic lock (TimestampMismatchError
  surfaces structured). NEVER `PUT {docstatus: 1}` (server reload loses the
  lock). Preview does neither call.
- **ERPNext submit-time rejections** (Quotation
  `valid_till <
  transaction_date`, SO row `warehouse` for stock items, SI
  account defaults) surface as structured ERP errors — no new tenant config.
- **Dolibarr validate signatures diverge per doc**: orders
  `POST /orders/{id}/validate` body `{idwarehouse, notrigger: 0}`; proposals
  `POST /proposals/{id}/validate` body `{notrigger: 0}` (NO idwarehouse);
  invoices `POST /invoices/{id}/validate` body `{idwarehouse, notrigger: 0}` (no
  `force_number` — stays out of the normalized surface).
- **`defaultWarehouseId?: number`** new optional tenant config on the Dolibarr
  connection variant: injected as `idwarehouse` on order/invoice validate when
  present; absent → send `idwarehouse: 0` (validation OK but NO stock movement —
  documented behavior, never silent).
- **Dolibarr HTTP 304 = already validated** → structured WriteError
  `ALREADY_TRANSITIONED` (context: nativeId, docKind; recovery: fetch the
  document to see its current state). Check how the client treats 304 today
  (fetch does not throw) — the handler must detect it explicitly.
- **Already-transitioned on ERPNext**: the ERP error surfaces structured (no
  pre-flight state GET beyond the submit's own doc GET).

## Task A (foundation — sequential)

**Files:** `src/domain/write.ts` (+test), the 3 slice contracts,
`src/features/shared/sales-document.types.ts` (submit input/plan types),
`src/architecture_slices_test.ts`

1. `WRITE_CAPABILITIES`: add the 3 submit tool names to both ERPs.
2. Contracts: submit tool definitions on the 3 slices —
   `{erpType, mode, nativeId}` strict schemas, annotations
   `{readOnlyHint: false, destructiveHint: false}`; descriptions state the draft
   → submitted/validated transition and that preview does not write.
3. Shared plan/input types for lifecycle moves.
4. Tests: capabilities + contract schema assertions.

## Task B (ERPNext track — parallel, worktree)

**Files:** `src/platform/erp/erpnext/client.ts` (if a method call helper is
needed), `handlers/writes.ts`, tests.

1. Client: reuse the existing doc GET (or add one) + `submitDoc(doc)` posting
   `{doc}` to `/api/method/frappe.client.submit` (JSON-encode the doc as the
   method expects — check how mcp-erpnext posts frappe.client methods if unsure;
   the response carries the submitted doc).
2. Native branches `erpnext.sales_order_submit`, `erpnext.quotation_submit`,
   `erpnext.sales_invoice_submit`: preview echoes the native plan (doctype,
   name, method) with NO HTTP; commit = GET full doc → frappe.client.submit →
   `{committed: true, nativeId, resolved}` including the post-state
   (`status`/`docstatus` from the response) for lifecycle mapping.
3. Tests: call sequence (GET then method POST), payload shapes, preview
   no-fetch, HTTP error surfacing (e.g. TimestampMismatch 409/417 passes through
   as FrappeApiError).

## Task C (Dolibarr track — parallel, worktree)

**Files:** `src/platform/erp/dolibarr/client.ts`, `handlers/writes.ts`, tests,
`src/domain/connection.ts` (`defaultWarehouseId?: number` on the dolibarr
variant — Task B does NOT touch connection.ts this increment).

1. Client: `validateDocument(docKind, id, body)` — body per docKind signatures
   (orders `{idwarehouse, notrigger: 0}`, proposals `{notrigger: 0}`, invoices
   `{idwarehouse, notrigger: 0}`). Detect HTTP 304 explicitly (fetch does NOT
   throw on it) and signal it to the handler.
2. Native branches `dolibarr.order_validate` / `proposal_validate` /
   `invoice_validate`: preview/commit as usual; `idwarehouse` =
   `connection.defaultWarehouseId ?? 0` (orders/invoices only); 304 → WriteError
   `ALREADY_TRANSITIONED` {nativeId, docKind}; commit returns the raw post-state
   (`statut` from the response object) for lifecycle mapping.
3. Tests: pathname + body per docKind (proposals WITHOUT idwarehouse), preview
   no-fetch, 304 → ALREADY_TRANSITIONED, warehouse injection present/absent.

## Task D (normalized layer — after B‖C merge)

**Files:** the 3 slice handlers + mappers, `normalized-adapter_test.ts`,
`architecture_slices_test.ts`.

1. Mappers: normalized input → native plan per ERP (trivial here — id + tool
   name; keep the mapper layer for symmetry and future fields).
2. Handlers: submit branches — validators (reqString nativeId,
   parseDolibarrNumericId on dolibarr) → mapper → `nativeAdapter.callTool` → map
   post-state to `lifecycleState` via `domain/lifecycle.ts` →
   `{...content, lifecycleState, erpType}` (commit only; preview carries no
   lifecycleState).
3. Tests: e2e preview/commit per ERP, lifecycleState mapping asserted,
   INVALID_NATIVE_ID, ALREADY_TRANSITIONED propagated, capabilities_describe
   includes the 3 new tools.

## Execution

- Phase 0 = Task A on `main`; Phase 1 = B ‖ C in fresh manual worktrees from
  post-A HEAD; Phase 2 = D on the merged tree; then Codex review
  VRAI/FAUX/NUANCE to MERGE-OK, CHANGELOG, commit, push.
