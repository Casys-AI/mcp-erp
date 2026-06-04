# Changelog

All notable changes to `@casys/mcp-erp` will be documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and
the project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
