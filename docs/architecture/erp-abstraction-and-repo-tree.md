# ERP abstraction and repository tree

Status: working architecture note, created before implementation.

## Goal

`@casys/mcp-erp` should expose ERP systems through MCP without pretending that
every ERP has the same data model or lifecycle. The package should keep
provider-native behavior visible, then add normalized tools only where the
mapping is proven by at least two adapters.

The current package is still scaffold-only:

- `src/adapter.ts`: `ErpAdapter`, tool definition, call context/result.
- `src/connection.ts`: explicit tenant-scoped `ErpConnection`.
- `src/registry.ts`: `buildAdapter(connection)`.
- `src/adapters/erpnext.ts` and `src/adapters/dolibarr.ts`: ping adapters.
- `apps/local-agent`: ERP-specific local runner that consumes the generic tunnel
  from `@casys/mcp-bridge/adapters/network`.

## API Families Observed

### 1. Generic model APIs

These expose a broad object model through one generic API shape.

Examples:

- ERPNext/Frappe: DocTypes via `/api/resource/:doctype`, RPC via
  `/api/method/...`.
- Odoo 19: JSON-2 via `/json/2/<model>/<method>`, with database-specific `/doc`
  metadata.
- Axelor: REST-like `/ws/rest/:model`, search/fetch/action services.
- iDempiere: OData-like `/api/v1/models/{table}` with `$filter`, `$select`,
  `$expand`, plus REST Views.
- Acumatica: contract-based REST endpoints with endpoint-specific Swagger.

Implication: these adapters can share low-level primitives such as
`record.search`, `record.get`, `schema.get`, but business semantics still vary.

### 2. Business endpoint APIs

These expose explicit resources and workflow actions.

Examples:

- Dolibarr: module endpoints for invoices, thirdparties, products, orders,
  proposals, payments, and lifecycle actions such as validate, close, paid.
- Zoho Books/Inventory: contacts, items, invoices, sales orders, approval and
  void/send/draft actions.
- metasfresh: Swagger REST endpoints for business partners, products, sales
  orders, invoices, and order candidates.
- Microsoft Dynamics 365 Business Central: company-scoped resources such as
  customers, items, sales invoices, purchase invoices, and bound actions.
- Oracle Fusion Financials: REST resources and use-case endpoints for
  receivables invoices, suppliers, receipts, bulk actions, attachments.

Implication: normalized MCP tools must preserve native lifecycle actions; a
single generic `updateInvoiceStatus` would hide too much domain behavior.

### 3. Enterprise API catalogs

These expose large API catalogs, often mixed OData/SOAP/REST, with strong
tenant, company, role, and version constraints.

Examples:

- SAP S/4HANA: released OData/SOAP APIs via SAP Business Accelerator Hub.
- NetSuite: SuiteTalk REST and REST Query with OAuth 2.0 and metadata catalog;
  SOAP is being phased out.
- Sage Intacct: XML API is mature; REST is emerging. Sage X3 has its own API
  surface and representation/class model.
- Infor CloudSuite/LN: APIs through Infor OS API Gateway, Swagger/OpenAPI and
  OData-style public APIs.

Implication: `mcp-erp` should treat these as future adapters that need
capability discovery and metadata ingestion before normalized tools.

## Abstraction Strategy

### Provider tools first

Every adapter should expose reliable provider-native tools first:

- `erpnext.customer_list`
- `erpnext.sales_invoice_get`
- `dolibarr.thirdparty_list`
- `dolibarr.invoice_validate`
- `odoo.partner_search`
- `businesscentral.sales_invoice_post`

This keeps MCP execution reliable and avoids pretending that all ERP concepts
are interchangeable.

### Capabilities before normalization

Each adapter should report what it can safely do:

```ts
interface ErpCapabilities {
  schemaDiscovery: boolean;
  genericRecords: boolean;
  businessDocuments: boolean;
  workflowActions: boolean;
  attachments: boolean;
  batch: boolean;
  companyContext: boolean;
  customFields: boolean;
  eInvoicingBridge: boolean;
}
```

Capabilities should be explicit data, not inferred from tool names.

### Normalized tools later

Only add normalized tools when the mapping is backed by real API evidence.
Initial normalized candidates:

- `erp.business_party_list`
- `erp.business_party_get`
- `erp.catalog_item_list`
- `erp.catalog_item_get`
- `erp.sales_invoice_get`

Normalized payloads must include:

- `provider`: ERP type.
- `providerId`: native identifier.
- `providerType`: native object/table/doctype/resource name.
- `lifecycleState`: mapped state plus native state.
- `raw`: native payload.
- `capabilities`: actions that can be performed on this record.

## Proposed Repository Tree

This is the target tree for the next implementation phase, not an immediate
large refactor.

```text
mod.ts
src/
  adapter.ts
  connection.ts
  registry.ts

  capabilities.ts
  errors.ts
  tool-schema.ts

  core/
    http-client.ts
    pagination.ts
    filters.ts
    identifiers.ts

  canonical/
    business-party.ts
    catalog-item.ts
    sales-invoice.ts
    sales-order.ts
    quotation.ts
    attachment.ts
    lifecycle.ts

  tools/
    provider-tool.ts
    normalized-tool.ts
    result.ts

  adapters/
    erpnext/
      adapter.ts
      client.ts
      tools/
        health.ts
        customers.ts
        items.ts
        sales-invoices.ts
      mappers/
        business-party.ts
        catalog-item.ts
        sales-invoice.ts
      fixtures/
      adapter_test.ts

    dolibarr/
      adapter.ts
      client.ts
      tools/
        health.ts
        thirdparties.ts
        products.ts
        invoices.ts
      mappers/
        business-party.ts
        catalog-item.ts
        sales-invoice.ts
      fixtures/
      adapter_test.ts

apps/
  local-agent/
    deno.json
    src/
      config.ts
      adapter-runner.ts
      local-agent.ts
      cli.ts

docs/
  architecture/
    erp-abstraction-and-repo-tree.md
    runtime-boundaries-and-local-tunnel.md
    erpnext-dolibarr-api-comparison.md
  research/
    odoo.md
    axelor.md
    idempiere.md
    business-central.md
```

## Near-Term Plan

1. Keep v0.1 narrow: ERPNext and Dolibarr only.
2. Add `capabilities.ts` and typed error primitives before adding more ERPs.
3. Move ERPNext/Dolibarr from single adapter files to adapter directories when
   the first real tools land.
4. Create `erpnext-dolibarr-api-comparison.md` with endpoint evidence and
   field/lifecycle mapping before adding normalized tools.
5. Reuse `mcp-erpnext` Frappe client/tool patterns, but remove env-based
   singleton assumptions and pass explicit `ErpConnection`.
6. Keep generic runtime transport concerns in `mcp-bridge`; keep the
   ERP-specific local-agent product surface in `mcp-erp/apps/local-agent`.

## Source Notes

Primary sources already checked during the architecture pass:

- Frappe REST API documentation.
- Dolibarr REST API wiki and Dolibarr source endpoints.
- Odoo 19 External JSON-2 API and External RPC deprecation notes.
- Axelor Open Platform web services documentation.
- Tryton RPC and REST client documentation.
- iDempiere REST documentation.
- metasfresh REST API guides.
- Apache OFBiz REST plugin documentation.
- SAP S/4HANA API documentation on SAP Help / Business Accelerator Hub.
- Microsoft Dynamics 365 Business Central API v2.0 documentation.
- Oracle NetSuite SuiteTalk REST/OAuth documentation.
- Acumatica contract-based REST documentation.
- Zoho Books and Zoho Inventory API documentation.
- Oracle Fusion Financials REST API documentation.
- Infor API Gateway and Infor LN REST API documentation.
