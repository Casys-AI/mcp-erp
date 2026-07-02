# Write Sales Documents Increment Plan (increment 3)

> **For agentic workers:** Execute with superpowers:subagent-driven-development.
> This increment EXTENDS the established write pattern from increments 1–2 (the
> entity `*_create`/`*_update` tools already merged on `main`). Read the
> existing write code as the model — do not reinvent it. Steps use TDD: red test
> → impl → green → commit.

**Goal:** First transactional documents toward mcp-erpnext parity — add
`erp.sales_order_create`, `erp.quotation_create`, `erp.sales_invoice_create`
with line items, on both ERPNext and Dolibarr, behind the existing normalized
surface with required `mode: preview|commit`. Create-only, draft-only (lifecycle
= next increment; document update deferred).

**Architecture:** Identical to increments 1–2 (see
`docs/architecture/write-surfaces-and-capability-gating.md`, section "Increment
3 — sales document creates"). Normalized `erp.*` tools dispatch from
`NormalizedAdapter` → feature slice handlers
(`features/<slice>/<slice>.handler.ts`) → mappers
(`features/<slice>/mappers/<erp>.ts`) → internal native tools (`erpnext.*` /
`dolibarr.*` in `platform/erp/<erp>/handlers/writes.ts`, NOT in `tools()`).
Native tools handle `mode`, do the HTTP write, return
`{ committed, nativeId?, resolved }`.

**Reference pattern (read these first, replicate their shape):**

- `src/features/customer/customer.contract.ts` — write tool definitions with
  strict inputSchema (`additionalProperties: false`).
- `src/features/customer/customer.handler.ts` — normalized handler: validators
  from `features/shared/handler-utils.ts`, typed input, mapper plan,
  `nativeAdapter.callTool`, `{...content, erpType}` envelope.
- `src/features/customer/mappers/erpnext.ts` / `mappers/dolibarr.ts` —
  normalized input → native tool plan (`toolName` + `args`).
- `src/platform/erp/erpnext/handlers/writes.ts` — internal native branches:
  `rejectUnsupportedArguments`, typed readers, preview (no HTTP) / commit
  (`FrappeRestClient.create<T>`), Contact orchestration (the partial-failure
  precedent: `CONTACT_FAILED`).
- `src/platform/erp/dolibarr/handlers/writes.ts` — same on Dolibarr
  (`DolibarrRestClient.createThirdparty/createProduct`, `toDolibarrNativeId`).
- `src/domain/write.ts` — `WriteMode`, `WriteError`, `WRITE_CAPABILITIES`,
  `parseWriteMode`, `assertFieldSupported`.
- `src/normalized-adapter.ts` — slice dispatch + `erp.capabilities_describe`
  (derives `supportedTools` from `WRITE_CAPABILITIES`; adding the 3 tools there
  updates it automatically).

## Global Constraints (same as increments 1–2)

- Runtime Deno; `deno task test` and `deno task check` must pass (incl.
  `deno fmt` on ALL touched files, `.ts` AND `.md`).
- Normalized surface = `erp.` namespace; native tools `<erpType>.<doc>_create`
  NOT in `tools()`.
- `mode: "preview" | "commit"` REQUIRED; preview NEVER writes, NEVER does HTTP,
  NEVER returns a real `nativeId`; result always `{ committed: bool }`.
- Structured errors only via `WriteError` (code+context+recovery). Strict
  runtime validation in the normalized layer (no silent coercion).
- `additionalProperties: false` on every `inputSchema` (including nested line
  objects).
- Hexagonal dependency rule: `domain/` imports nothing from
  `features/`/`platform/`; feature slices may import `platform/erp/*/types.ts`
  and handlers (existing precedent), never `platform/mcp`.
- API-conformance items flagged `⚠️ CODEX` are resolved by the design fact-check
  (see architecture doc) and re-verified in the final review.

## Key specifics of increment 3 (vs 1–2)

- **Line items.** Shared normalized line shape
  `{ sku (req), qty (req, > 0), unitPrice (req, >= 0), description? }`. Boundary
  validation: `EMPTY_LINES` when `lines` missing/empty; `INVALID_LINE` with
  `context.lineIndex` for a bad line. Validation helpers live in
  `features/shared/` (used by the three slices).
- **Three tools share one input grammar** (`customerId`, `lines`, `date?`,
  - one doc-specific optional date each: `deliveryDate` (SO), `validUntil`
    (QTN), `dueDate` (INV)). All API facts below are **fact-checked against
    primary sources (Codex pass 2026-07-02)** — see the architecture doc section
    "Provider-specific mappings (fact-checked 2026-07-02)" for sources.

- **ERPNext customer reference**: `customer` field; on Quotation it is
  `party_name` + `quotation_to: "Customer"` (no `customer` field there).
- **ERPNext `deliveryDate`** on sales order: controller requires it doc- or
  row-level → we send doc-level (ERPNext copies to rows).
  `MISSING_REQUIRED_FIELD` when absent and erpType is erpnext (normalized schema
  keeps it optional).
- **ERPNext `company`**: `reqd`, NOT reliably API-defaulted. New optional
  `defaultCompany` on the erpnext `ErpConnection`: inject when present, omit
  otherwise (instance defaults may apply; ERP error surfaces if not).
- **Dolibarr customer reference**: `socid`, strict integer via
  `parseDolibarrNumericId` (same rule as entity ids).
- **Dolibarr two-phase create (lines are NOT inline)**: the API classes comment
  out `lines` on POST. Commit = `POST /orders|/proposals|/invoices` → then
  `POST /{id}/lines` per line, sequential. A line failure → `LINES_FAILED`
  (context: `nativeId`, `lineIndex`, `attachedLines`) — document draft stays
  recoverable, mirroring `CONTACT_FAILED`.
- **Dolibarr dates = unix timestamps** (epoch seconds, UTC midnight from ISO
  input). `date` always sent on all three docs (input date or today when
  omitted). `validUntil` → derived `duree_validite` in whole days
  (`INVALID_DATE_RANGE` if `validUntil < date`); order delivery date →
  `delivery_date` property (not deprecated `date_livraison`).
- **Dolibarr sku resolution**: `ref` → `fk_product` at COMMIT time only, one
  `GET /products?sqlfilters=(t.ref:=:'SKU')` per distinct sku (syntax verified).
  Preview echoes `fk_product: "<resolved-at-commit>"`. Unknown sku →
  `LINE_PRODUCT_NOT_FOUND` (context: `sku`, `lineIndex`).
- **Dolibarr VAT**: `tva_tx` omitted silently becomes 0 → the adapter sends each
  line's `tva_tx` from the SAME product GET used for fk_product resolution (no
  extra HTTP; matches Dolibarr UI behavior).
- **Dolibarr invoice**: send `type: 0` explicitly (TYPE_STANDARD).
- **Draft on create**: ERPNext POST → `docstatus: 0`; Dolibarr create →
  `STATUS_DRAFT` (0). Result summary must say "draft".
- **No totals sent, ever.** ERP computes; commit result may echo ERP totals in
  `resolved`/raw.

---

## Task A (foundation — sequential, before the parallel tracks)

**Files:** `src/domain/write.ts`, `src/domain/write_test.ts`,
`src/features/shared/sales-document.types.ts` (new),
`src/features/shared/sales-document-validation.ts` (new + test),
`src/features/sales-order/sales-order.contract.ts`,
`src/features/quotation/quotation.contract.ts`,
`src/features/invoice/invoice.contract.ts`, `src/features/*/\*.types.ts`

1. `WRITE_CAPABILITIES`: add the 3 tool names to BOTH ERPs' `tools`.
2. Shared types: `SalesDocumentLineInput`, `SalesDocumentCreateInput` (+ per-doc
   extensions), native plan types per slice.
3. Shared validation: `parseSalesDocumentLines(args, erpType)` → `EMPTY_LINES` /
   `INVALID_LINE` fast-fail; ISO date validators (reuse/extend existing
   helpers).
4. Contracts: add the 3 write tool definitions to the 3 slice contracts (schema
   per the architecture doc table; nested line schema strict).
5. Tests: capabilities list, line validation edge cases (empty, qty 0, negative
   price, missing sku, non-array), contract schema assertions in
   `architecture_slices_test.ts` style.

## Task B (ERPNext track — parallel with C, own worktree)

**Files:** `src/platform/erp/erpnext/handlers/writes.ts`,
`src/platform/erp/erpnext/adapter_test.ts` (or colocated writes test),
`src/platform/erp/erpnext/types.ts`, `src/domain/connection.ts`
(`defaultCompany`)

1. `defaultCompany?: string` on the erpnext `ErpConnection` variant (optional;
   injected as `company` when present, omitted otherwise).
2. Internal native branches `erpnext.sales_order_create`,
   `erpnext.quotation_create`, `erpnext.sales_invoice_create`:
   - args: `mode`, `customer` (or `party_name` + `quotation_to` on quotation),
     `items` (already-mapped child rows `{item_code, qty, rate, description?}`),
     doc dates (`transaction_date`/`posting_date`/`delivery_date`/`valid_till`/
     `due_date` as applicable).
   - preview: resolved doc payload, `committed: false`.
   - commit: `client.create<T>("Sales Order", payload)` etc. →
     `{ committed: true, nativeId: data.name, resolved }`.
3. No new client method needed (`create<T>` exists). Add doc field types to
   `types.ts` if missing.
4. Tests: mocked fetch — payload shape (items child table inline, docstatus
   absent = draft), preview no-fetch, commit happy path, HTTP error mapping.

## Task C (Dolibarr track — parallel with B, own worktree)

**Files:** `src/platform/erp/dolibarr/client.ts`,
`src/platform/erp/dolibarr/handlers/writes.ts`,
`src/platform/erp/dolibarr/adapter_test.ts` (or colocated writes test),
`src/platform/erp/dolibarr/types.ts`

1. Client: `createOrder`, `createProposal`, `createInvoice` (POST, return int id
   like `createThirdparty`), `addDocumentLine(docKind, id, line)`
   (`POST /{orders|proposals|invoices}/{id}/lines`), and `findProductByRef(ref)`
   (GET products, exact ref sqlfilter, returns `{ id, tva_tx } | undefined` —
   one call feeds both fk_product and VAT).
2. Internal native branches `dolibarr.order_create`, `dolibarr.proposal_create`,
   `dolibarr.invoice_create`:
   - args: `mode`, `socid`, `lines` (`{sku, qty, subprice, desc?}`), `date`
     (epoch seconds, always present — handler injects today if omitted
     upstream), `delivery_date?` (order), `duree_validite?` (proposal),
     `date_lim_reglement?` (invoice), `type: 0` (invoice).
   - preview: resolved doc payload + lines with
     `fk_product: "<resolved-at-commit>"`, `committed: false`, no HTTP.
   - commit: resolve distinct skus → `{fk_product, tva_tx}`
     (`LINE_PRODUCT_NOT_FOUND` on miss, BEFORE the document POST), then POST
     document, then sequential `POST /{id}/lines`; on a line failure →
     `LINES_FAILED` (`nativeId`, `lineIndex`, `attachedLines`).
3. Tests: mocked fetch — sku resolution (hit/miss + tva_tx propagation),
   two-phase call order (resolution BEFORE doc POST), payload shape, preview
   no-fetch, commit happy path, ISO→epoch conversion, `LINES_FAILED` partial
   failure, `duree_validite` derivation.

## Task D (normalized layer — after B and C merge)

**Files:** `src/features/sales-order/{sales-order.handler.ts,mappers/*}`,
`src/features/quotation/{quotation.handler.ts,mappers/*}`,
`src/features/invoice/{invoice.handler.ts,mappers/*}`,
`src/normalized-adapter.ts` (dispatch only, stays thin),
`src/architecture_slices_test.ts`, slice tests

1. Mappers ×6: normalized input → native plan (ERPNext child rows / Dolibarr
   lines), doc-specific date mapping, `MISSING_REQUIRED_FIELD` for ERPNext
   `deliveryDate`.
2. Handlers: extend the 3 slice handlers with the create branch (validators →
   input → mapper → `nativeAdapter.callTool` → `{...content, erpType}`).
3. Dispatch: route the 3 new tool names in `normalized-adapter.ts`.
4. Tests: end-to-end normalized (FakeAdapter), per-ERP mapping assertions,
   `architecture_slices_test.ts` additions (contract ownership + mapper shapes),
   `capabilities_describe` includes the new tools.

## Execution

- Phase 0 = Task A on `main` (sequential; it is the shared foundation).
- Phase 1 = Task B ‖ Task C in **manually created worktrees branched from
  current HEAD** (Workflow-tool worktrees pin the session-start base — gotcha).
  Distinct files → merge is ff/ort-clean.
- Phase 2 = Task D on the merged tree.
- Final = Codex review VRAI/FAUX/NUANCE of the full diff until MERGE-OK, then
  commit. Update CHANGELOG.
