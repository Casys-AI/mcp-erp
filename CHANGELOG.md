# Changelog

All notable changes to `@casys/mcp-erp` will be documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and
the project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Breaking changes

- **`erpnext.sales_invoice_get` — `content.data` shape changed (Step 10).**
  `content.data` now contains the normalized invoice-viewer contract (`name`,
  `status`, `customer`/`party_name`, `posting_date`, `due_date`, `currency`,
  `grand_total`, `net_total`, `total_taxes_and_charges`,
  `items[]{item_name, qty, rate, amount}`) instead of the raw Frappe payload.
  The raw Frappe payload is preserved under `content.salesInvoice` for
  backward-compatibility. Consumers that read `content.data` directly must
  migrate to the new contract or read `content.salesInvoice` instead. The
  `status` field now falls back to Frappe's `docstatus` integer (0 → `Draft`, 1
  → `Submitted`, 2 → `Cancelled`) when the document-level `status` string is
  absent or empty.

### Alpha status

- Establishes an alpha technical package: usable by developers for local
  stdio/http MCP runs against explicitly configured ERP connections, with
  read-only ERPNext and Dolibarr coverage plus bundled MCP Apps viewers.
- This is not yet a beta/product release: hosted remote MCP operation, richer
  shared viewers, and broader adapter depth remain roadmap work.

### Added

- ERPNext read-only Customer, Item, Sales Invoice, Sales Order, and Quotation
  tools: `erpnext.customer_list`, `erpnext.customer_get`, `erpnext.item_list`,
  `erpnext.item_get`, `erpnext.sales_invoice_list`, `erpnext.sales_invoice_get`,
  `erpnext.sales_order_list`, `erpnext.sales_order_get`,
  `erpnext.quotation_list`, and `erpnext.quotation_get`.
- Minimal ERPNext/Frappe REST client inside the ERPNext adapter with explicit
  connection credentials, token auth, list filters, JSON parsing, and typed
  `FrappeApiError` propagation.
- Dolibarr read-only Thirdparty, Product, Invoice, Order, and Proposal tools:
  `dolibarr.thirdparty_list`, `dolibarr.thirdparty_get`,
  `dolibarr.product_list`, `dolibarr.product_get`, `dolibarr.invoice_list`, and
  `dolibarr.invoice_get`, `dolibarr.order_list`, `dolibarr.order_get`,
  `dolibarr.proposal_list`, and `dolibarr.proposal_get`.
- Minimal Dolibarr REST client inside the Dolibarr adapter with explicit
  connection credentials, `DOLAPIKEY` auth, reusable module resource reads, JSON
  parsing, and typed `DolibarrApiError` propagation.
- `ErpToolsClient`, mirroring the `mcp-einvoice` `EInvoiceToolsClient` pattern,
  to project agnostic `ErpAdapter` tools into `@casys/mcp-server` `MCPTool`
  registrations and structured tool results.
- `ErpToolCallContext.signal` plumbing in the adapter/client contract. ERPNext
  and Dolibarr pass it into `fetch` when callers provide one; automatic
  per-request cancellation awaits an `@casys/mcp-server` handler context that
  exposes a signal.
- `erpToolErrorMapper` for `@casys/mcp-server` so adapter/API validation errors
  become MCP tool errors instead of raw JSON-RPC failures.
- `server.ts` local/dev MCP entrypoint for stdio and HTTP runs with
  `@casys/mcp-server`.
- MCP Apps viewer support via `registerErpViewers(app)`, bundled
  `doclist-viewer`, `invoice-viewer`, and `diagnostics-viewer` HTML resources
  under `ui://mcp-erp/*`, and `_meta.ui.resourceUri` on compatible read-only
  tools.
- Diagnostics payloads and viewer binding for `erpnext.ping` and
  `dolibarr.ping`, including ERP type, tenant context, API URL, and exposed tool
  names.
- Normalized write surface `erp.*` across ERPNext and Dolibarr:
  `erp.customer_create`, `erp.product_create`, `erp.customer_update`,
  `erp.product_update`, `erp.supplier_create`, `erp.supplier_update`, and the
  read-only `erp.capabilities_describe`. Write tools require an explicit
  `mode: "preview" | "commit"` — no default. `preview` validates inputs and
  echoes the resolved native payload without writing; `commit` performs the
  write. Results always carry `committed: true | false`; `nativeId` is only
  present on `committed: true`. Native creates and updates are internal dispatch
  inside each adapter's `callTool` and are not exposed through `tools()`. Tenant
  connection defaults on `ErpConnection`: ERPNext requires `defaultItemGroup`
  (mandatory for `Item`) and `defaultStockUom`; `defaultCustomerGroup` and
  `defaultTerritory` are optional. Dolibarr requires `defaultIndividualTypentId`
  for individual-party creates.
- Normalized sales document creates (increment 3): `erp.sales_order_create`,
  `erp.quotation_create`, `erp.sales_invoice_create` on both ERPs — create-only,
  draft-only (lifecycle moves are a later increment). Shared input grammar:
  required `customerId` and `lines[]` (`{sku, qty, unitPrice, description?}`,
  product-referenced), optional ISO dates (`date`, plus
  `deliveryDate`/`validUntil`/`dueDate` per document). ERPNext posts inline
  `items` child rows (Quotation via `party_name` + `quotation_to`,
  `delivery_date` enforced with `MISSING_REQUIRED_FIELD`; optional
  `defaultCompany` tenant config on the connection). Dolibarr uses the two-phase
  flow mandated by its REST API (document POST, then per-line POST — `{id}/line`
  for proposals, `{id}/lines` for orders/invoices), with commit-time
  `ref → fk_product` resolution that also propagates the product's `tva_tx`,
  epoch-second dates, derived `duree_validite`, and explicit invoice `type: 0`.
  New structured errors: `EMPTY_LINES`, `INVALID_LINE`, `INVALID_DATE_RANGE`,
  `LINE_PRODUCT_NOT_FOUND`, and `LINES_FAILED` (partial line attach after a
  committed document POST, carrying `nativeId`/`lineIndex`/`attachedLines`). ISO
  dates are validated as real calendar days (no silent `2026-02-31` → March
  coercion).
- Structured write errors serialized to JSON by the error mapper:
  `INVALID_MODE`, `MISSING_REQUIRED_FIELD`, `INVALID_FIELD`,
  `MISSING_REQUIRED_CONFIG`, `UNSUPPORTED_FIELD`, `CREATE_FAILED` — each
  carrying `code` + `context` + `recovery`. `NormalizedError` (Wave 3 reads) is
  now also serialized as structured JSON rather than a prose string.
- **ERPNext Contact mapping** — on ERPNext, `email` and `phone` for a Customer
  or Supplier live in a separate `Contact` document linked via a Dynamic Link
  and designated as primary contact (`customer_primary_contact` /
  `supplier_primary_contact`, `is_primary_contact: 1`). Create flow: POST
  Customer/Supplier → POST Contact with `is_primary_contact: 1` → PUT doc
  `*_primary_contact` field. Update flow: find-or-create the primary Contact
  (ordered `is_primary_contact desc, creation asc`), GET existing Contact first
  to preserve child tables, PUT with new email/phone, promote to primary if
  needed, and PUT the doc's primary-contact pointer. A `CONTACT_FAILED` error is
  raised when the document was committed but the Contact step failed; the
  document is intact and the contact can be corrected manually. Dolibarr stores
  `email` and `phone` as direct fields on the thirdparty resource — same
  normalized input contract, entirely different internal mapping.
- `src/write.ts` — write-path primitives shared by native adapters and the
  normalized layer: `WriteMode` type, `WriteError` class (AX machine-readable
  errors with `code`, `context`, `recovery`), `WriteResult` interface,
  `WRITE_CAPABILITIES` per-ERP manifest (supported tools and unsupported
  fields), `parseWriteMode`, and `assertFieldSupported`. Verified conformance
  notes from the Codex review: Dolibarr supplier uses `code_fournisseur` (not
  `code_client`) as the external-ref field; `uom` is unsupported on Dolibarr and
  is listed in `WRITE_CAPABILITIES.dolibarr.unsupportedFields`.
- `transport` option (`"stateful" | "stateless"`, default `"stateful"`) on
  `createErpMcpApp` and `createErpRemoteApp`. The stateless path conforms to
  SEP-2575 (`protocolVersion` via `_meta`, error codes `-32602` / `-32004`) and
  has been validated end-to-end through the multi-tenant middleware.

### Changed

- `@casys/mcp-server` bumped from `^0.20.0` to `^0.21.0`. This release adds
  SEP-2575 stateless transport conformance and auth/OAuth fixes. The stateful
  default transport path is unchanged.

### Removed

- Removed the `apps/local-agent` tunnel experiment and the `mcp-bridge`
  dependency from the package surface. The supported local development path is
  stdio or HTTP via `@casys/mcp-server`; production should embed the MCP server
  remotely.

## [0.1.0] - 2026-05-19

First release of the ERP-agnostic adapter core.

### Added — `@casys/mcp-erp` (core)

- **`src/tool-catalog.ts` + exported `getErpToolDefinitions(erpType)`.** Returns
  the static tool definitions (name, description, inputSchema) for a given ERP
  type WITHOUT instantiating an adapter. Currently covers `erpnext` and
  `dolibarr`.

### Added — testing

- Catalog ↔ adapter parity test in `src/tool-catalog_test.ts` — builds dummy
  ERPNext and Dolibarr adapters and asserts deep equality on
  `{ name, description, inputSchema }` between `getErpToolDefinitions(erpType)`
  and `adapter.tools()`. Prevents future drift between the static catalog and
  runtime adapter dispatch.
