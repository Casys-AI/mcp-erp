# Roadmap

`@casys/mcp-erp` is currently an alpha technical package: the adapter contract,
MCP projection, local stdio/http server, read-only ERPNext and Dolibarr tools,
and first shared MCP Apps viewers are in place.

## Alpha → Beta

### Shared MCP Apps viewers

- Add a provider-agnostic document detail viewer for sales orders, quotations,
  Dolibarr orders, and Dolibarr proposals.
- Map Dolibarr invoice payloads into the shared invoice viewer contract.
- Replace ERPNext-specific action hooks inherited from `mcp-erpnext` viewers
  with provider-aware MCP tool actions or disabled states.
- Add small empty/error states that explain missing payload fields without
  leaking provider internals.
- Keep common viewer URIs under `ui://mcp-erp/*`.

### Remote MCP server shape

- Define the hosted HTTP deployment boundary for `@casys/mcp-server`.
- Keep ERP credentials resolved outside adapters and passed as explicit
  `ErpConnection` values.
- Add a connection provider interface for host applications that need per-tenant
  credential resolution.
- Keep local stdio/http mode as a development path; do not reintroduce
  `apps/local-agent` or `mcp-bridge`.

### Adapter depth

- Add richer read coverage for suppliers/vendors, payments, stock, and document
  line items where both ERPNext and Dolibarr have clear native APIs.
- Expand provider-native filters for customer, item/product, invoice, order, and
  quotation/proposal list tools.
- Add provider-native lifecycle actions only with explicit native names and
  conservative defaults.
- Keep e-invoicing routing/status out of this package and in `mcp-einvoice`.

### Normalized tools

- Introduce normalized read tools only after native payload mappings are stable.
- First normalized candidates:
  - `erp.business_party_list`
  - `erp.business_party_get`
  - `erp.catalog_item_list`
  - `erp.catalog_item_get`
  - `erp.sales_invoice_get`
  - `erp.sales_order_get`
  - `erp.quotation_get`
- Normalized payloads should preserve the native provider id, native type,
  lifecycle state, available native actions, and raw provider payload.

### Write surfaces

Normalized entity CRUD is shipped for ERPNext and Dolibarr via the `erp.*`
surface with required `mode: "preview" | "commit"`:

- Delivered: `erp.customer_create`, `erp.customer_update`, `erp.product_create`,
  `erp.product_update`, `erp.supplier_create`, `erp.supplier_update`, and
  `erp.capabilities_describe`.

Remaining write work toward beta:

- Transactional documents with line items: sales order, sales invoice, and
  quotation/proposal creates (multi-line bodies, computed totals, lifecycle
  awareness).
- Document lifecycle actions: submit, cancel, validate.
- Purchase flows: supplier order and invoice creates.
- Entity delete (soft-delete or archive where the ERP supports it).
- Idempotency key and durable dedup store (deferred until a native ERP mechanism
  or a shared store is in place).

### Package surface

- Keep the single-package shape until at least two external consumers need a
  split.
- Publish Deno/JSR first-class artifacts and keep npm output as compatibility
  packaging.
- Keep public exports small: adapter contract, registry/factories, MCP
  projection, server helper, viewer registration, and typed errors.

## Later

- Add additional ERP adapters only after the ERPNext/Dolibarr boundary is
  boring.
- Candidate adapters: Odoo, Business Central, Zoho Books/Inventory, Sage, and
  Infor.
- Expand write surfaces beyond entity CRUD: best-of-breed superset interface
  (own-ERP phase) and country-aware address fields once both ERPs have stable
  mapping.
