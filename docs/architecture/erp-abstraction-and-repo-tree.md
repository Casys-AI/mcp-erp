# ERP abstraction and repository tree

Status: working architecture note. The mixed hexagonal / feature-slice target is
validated as the direction. The repository now uses that shape for the
transverse core, provider I/O, MCP boundary, viewers, the first normalized
feature slices, and the first provider handler families.

## Goal

`@casys/mcp-erp` should expose ERP systems through MCP without pretending that
every ERP has the same data model or lifecycle. The package should keep
provider-native behavior visible, then add normalized tools only where the
mapping is proven by at least two adapters.

The current package has moved past scaffold-only:

- `src/domain/adapter.ts`: `ErpAdapter`, tool definition, call context/result.
- `src/platform/mcp/client.ts`: `ErpToolsClient`, the `@casys/mcp-server`
  projection layer that mirrors `mcp-einvoice`'s `EInvoiceToolsClient`.
- `src/domain/connection.ts`: explicit tenant-scoped `ErpConnection`.
- `src/registry.ts`: `buildAdapter(connection)`.
- `src/platform/erp/erpnext/client.ts`: raw Frappe REST client.
- `src/platform/erp/erpnext/tools.ts`: ERPNext provider tool manifest split by
  family.
- `src/platform/erp/erpnext/handlers/diagnostics.ts`: ERPNext diagnostics
  handler family.
- `src/platform/erp/erpnext/handlers/business-parties.ts`: ERPNext Customer and
  Supplier read handler family.
- `src/platform/erp/erpnext/adapter.ts`: provider-native Frappe tools.
- `src/platform/erp/dolibarr/client.ts`: raw Dolibarr REST client.
- `src/platform/erp/dolibarr/tools.ts`: Dolibarr provider tool manifest split by
  family.
- `src/platform/erp/dolibarr/handlers/diagnostics.ts`: Dolibarr diagnostics
  handler family.
- `src/platform/erp/dolibarr/handlers/business-parties.ts`: Dolibarr thirdparty
  read handler family.
- `src/platform/erp/dolibarr/adapter.ts`: provider-native Dolibarr tools.
- `src/features/customer`, `src/features/product`, and `src/features/supplier`:
  normalized tool contracts plus ERPNext/Dolibarr mappers for the first simple
  business entities.
- `src/features/invoice`, `src/features/sales-order`, and
  `src/features/quotation`: normalized read contracts plus ERPNext/Dolibarr
  document normalizers.
- `src/platform/viewers/viewers.ts` + `src/ui/dist`: first MCP Apps viewer
  registration and built viewer HTML, ported from `mcp-erpnext`.
- `server.ts`: local/dev stdio or HTTP MCP server using `@casys/mcp-server`.

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
- `erpnext.customer_get`
- `erpnext.item_list`
- `erpnext.item_get`
- `erpnext.sales_invoice_list`
- `erpnext.sales_invoice_get`
- `erpnext.sales_order_list`
- `erpnext.sales_order_get`
- `erpnext.quotation_list`
- `erpnext.quotation_get`
- `dolibarr.thirdparty_list`
- `dolibarr.thirdparty_get`
- `dolibarr.product_list`
- `dolibarr.product_get`
- `dolibarr.invoice_list`
- `dolibarr.invoice_get`
- `dolibarr.order_list`
- `dolibarr.order_get`
- `dolibarr.proposal_list`
- `dolibarr.proposal_get`
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

### Normalized tools after proof

Only add normalized tools when the mapping is backed by real API evidence. The
first proven surface now includes:

- `erp.business_party_list`
- `erp.business_party_get`
- `erp.catalog_item_list`
- `erp.catalog_item_get`
- `erp.sales_invoice_get`
- `erp.sales_order_get`
- `erp.quotation_get`
- `erp.customer_create`
- `erp.customer_update`
- `erp.product_create`
- `erp.product_update`
- `erp.supplier_create`
- `erp.supplier_update`
- `erp.capabilities_describe`

Normalized payloads must include:

- `provider`: ERP type.
- `providerId`: native identifier.
- `providerType`: native object/table/doctype/resource name.
- `lifecycleState`: mapped state plus native state.
- `raw`: native payload.
- `capabilities`: actions that can be performed on this record.

## Validated Target Architecture

The target architecture is a deliberate blend of hexagonal/clean boundaries and
vertical feature slices:

- `domain/` is the transverse core: adapter contract, connection union, write
  policy, lifecycle vocabulary, and normalized payload errors.
- `features/<entity>/` owns each business entity contract: tool definitions,
  normalized types, provider-specific mappers, and eventually entity-specific
  read/write handlers.
- `platform/` owns raw I/O and host integration: ERP REST clients/adapters, MCP
  projection, remote-app bootstrap, error mapping, and MCP Apps viewers.
- Provider-native tools remain first-class. Normalized tools are added only
  where ERPNext/Dolibarr mapping is proven.

## Current Implemented Slice

This is the state of the repository after the architecture cleanup tranche. It
is close to the target shell; the remaining work is mainly inside provider
adapter internals and future feature breadth.

```text
mod.ts
src/
  domain/
    adapter.ts
    connection.ts
    lifecycle.ts
    normalized.ts
    write.ts

  features/
    customer/
      customer.contract.ts
      customer.types.ts
      mappers/
        erpnext.ts
        dolibarr.ts
    product/
      product.contract.ts
      product.types.ts
      mappers/
        erpnext.ts
        dolibarr.ts
    supplier/
      supplier.contract.ts
      supplier.types.ts
      mappers/
        erpnext.ts
        dolibarr.ts
    invoice/
      invoice.contract.ts
      invoice.types.ts
      mappers/
        erpnext.ts
        dolibarr.ts
    sales-order/
      sales-order.contract.ts
      sales-order.types.ts
      mappers/
        erpnext.ts
        dolibarr.ts
    quotation/
      quotation.contract.ts
      quotation.types.ts
      mappers/
        erpnext.ts
        dolibarr.ts

  platform/
    erp/
      erpnext/
        client.ts
        tools.ts
        handlers/
          diagnostics.ts
          business-parties.ts
        adapter.ts
        adapter_test.ts
        types.ts
      dolibarr/
        client.ts
        tools.ts
        handlers/
          diagnostics.ts
          business-parties.ts
        adapter.ts
        adapter_test.ts
        types.ts
    mcp/
      client.ts
      error-mapper.ts
      mcp-app.ts
      remote-app.ts
      tool-catalog.ts
    viewers/
      viewers.ts

  registry.ts
  normalized-adapter.ts
```

There are no internal compatibility re-export files. `mod.ts` is the external
package interface; internal code imports directly from `domain/`, `features/`,
or `platform/`.

## Remaining Migration Work

The target architecture is not complete until these moves are done:

1. Continue splitting `platform/erp/*/adapter.ts` handlers by provider tool
   family so adapter files no longer own every native tool handler in one large
   module. The static tool manifests and diagnostics handlers have already moved
   out.
2. Add feature slices for payment and stock movement once their normalized
   contracts are proven.
3. Move read/list handlers from `normalized-adapter.ts` into entity-specific
   feature handlers if the cross-ERP facade grows further.
4. Keep `deno task check` and `deno task test` green at every tranche.

## Near-Term Plan

1. Keep v0.1 narrow: ERPNext and Dolibarr only.
2. Keep `ErpToolsClient` as the only package-level MCP projection into
   `@casys/mcp-server`; adapters must stay wire-agnostic.
3. Keep write capabilities and typed errors in the transverse domain layer
   before adding more ERPs.
4. Continue splitting provider adapters by tool family after the raw HTTP
   clients.
5. Keep `erpnext-dolibarr-api-comparison.md` current with endpoint evidence and
   field/lifecycle mapping before adding normalized tools.
6. Reuse `mcp-erpnext` Frappe client/tool patterns, but remove env-based
   singleton assumptions and pass explicit `ErpConnection`.
7. Keep MCP transport concerns in `@casys/mcp-server`; `mcp-erp` should expose
   stdio/http locally through `server.ts` and be embedded remotely by
   `erp-platform` later.

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
