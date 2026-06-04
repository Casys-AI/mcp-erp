# ERPNext and Dolibarr API comparison

Status: working evidence note, checked on 2026-05-15 and updated during the
first read-only adapter implementation pass.

## Purpose

This note defines the first real comparison for `mcp-erp` v0.1. The goal is not
to force ERPNext and Dolibarr into the same shape too early. The goal is to find
the reliable overlap, keep native workflows visible, and decide which tools are
safe to expose first.

## Sources Checked

Primary sources used for this pass:

- Frappe REST API: <https://docs.frappe.io/framework/user/en/api/rest>
- Frappe Docstatus:
  <https://docs.frappe.io/framework/user/en/basics/doctypes/frameworktatus>
- Dolibarr REST API wiki:
  <https://wiki.dolibarr.org/index.php/Module_Web_Services_API_REST_%28developer%29>
- Dolibarr invoice API source:
  <https://raw.githubusercontent.com/Dolibarr/dolibarr/develop/htdocs/compta/facture/class/api_invoices.class.php>
- Dolibarr thirdparty API source:
  <https://raw.githubusercontent.com/Dolibarr/dolibarr/develop/htdocs/societe/class/api_thirdparties.class.php>
- Dolibarr product API source:
  <https://raw.githubusercontent.com/Dolibarr/dolibarr/develop/htdocs/product/class/api_products.class.php>
- Dolibarr order API source:
  <https://raw.githubusercontent.com/Dolibarr/dolibarr/develop/htdocs/commande/class/api_orders.class.php>
- Dolibarr proposal API source:
  <https://raw.githubusercontent.com/Dolibarr/dolibarr/develop/htdocs/comm/propal/class/api_proposals.class.php>

## API Shape

### ERPNext / Frappe

Frappe exposes a generic document API:

- Token auth uses `Authorization: token api_key:api_secret`.
- Documents are exposed through `/api/resource/:doctype`.
- Single records are exposed through `/api/resource/:doctype/:name`.
- Lists support `fields`, `expand`, `filters`, `or_filters`, `order_by`,
  `limit_start`, and `limit_page_length`.
- Remote methods are exposed through `/api/method/...`.

Consequence for `mcp-erp`: build one strong Frappe client around generic record
operations, then layer provider-native tools for important DocTypes such as
Customer, Supplier, Item, Sales Invoice, Sales Order, and Quotation.

### Dolibarr

Dolibarr exposes module APIs:

- The REST module must be enabled.
- APIs are served under `/api/index.php/<action>`.
- The API key is passed with the `DOLAPIKEY` header.
- Multicompany context can be forced with `DOLAPIENTITY`.
- The API explorer only shows actions allowed by the active modules and token
  rights.

Consequence for `mcp-erp`: build one Dolibarr HTTP client, but expose explicit
module tools instead of pretending there is one generic record API.

## First Domain Mapping

| Concept        | ERPNext / Frappe                                              | Dolibarr                                                                  | Abstraction note                                                              |
| -------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Business party | `Customer`, `Supplier`, plus related Address/Contact DocTypes | `thirdparties`, with role/mode flags and related representatives/accounts | Normalize later as `BusinessParty` with roles and raw provider data.          |
| Catalog item   | `Item` DocType                                                | `products`, with product/service and stock-related endpoints              | Read tools can align early; pricing and variants need provider detail.        |
| Sales invoice  | `Sales Invoice` DocType                                       | `invoices` endpoint                                                       | Lifecycle differs too much for one write abstraction in v0.1.                 |
| Sales order    | `Sales Order` DocType                                         | `orders` endpoint                                                         | Basic read alignment is feasible; actions remain native.                      |
| Quotation      | `Quotation` DocType                                           | `proposals` endpoint                                                      | Same business intent, different native naming.                                |
| Lines          | Child tables inside parent documents                          | Dedicated line subresources on invoices, orders, proposals                | Normalized reads can flatten lines; writes must stay provider-specific first. |
| Payment        | Payment-related DocTypes and methods                          | Invoice payment endpoints                                                 | Keep payment mutation out of the first normalized contract.                   |

## Lifecycle Divergence

ERPNext/Frappe uses `docstatus` for submittable documents:

- `0`: Draft
- `1`: Submitted
- `2`: Cancelled

The generic REST API can read and update documents, but business lifecycle moves
such as submit/cancel should be treated as document actions, not as plain field
updates.

Dolibarr exposes lifecycle actions directly in module APIs. The invoice API
includes actions such as:

- `{id}/settodraft`
- `{id}/validate`
- `{id}/settopaid`
- `{id}/settounpaid`
- `{id}/usediscount/{discountid}`
- `{id}/usecreditnote/{discountid}`
- `{id}/payments`

Orders and proposals expose similar explicit actions such as validate, close,
reopen, set invoiced, set draft, shipment creation, and proposal conversion.

Consequence: v0.1 should not ship a generic `erp.invoice_update_status`
mutation. Expose native tools first. A normalized lifecycle can start as
read-only state mapping:

```ts
type CanonicalLifecycleState =
  | "draft"
  | "validated"
  | "submitted"
  | "cancelled"
  | "closed"
  | "paid"
  | "unpaid"
  | "unknown";
```

The normalized payload must keep the native state and available native actions.

## Proposed v0.1 Tool Surface

Read-first provider tools. Checked items are implemented in the current package:

```text
erpnext.customer_list        # implemented
erpnext.customer_get         # implemented
erpnext.supplier_list
erpnext.supplier_get
erpnext.item_list            # implemented
erpnext.item_get             # implemented
erpnext.sales_invoice_list   # implemented
erpnext.sales_invoice_get    # implemented
erpnext.sales_order_list     # implemented
erpnext.sales_order_get      # implemented
erpnext.quotation_list       # implemented
erpnext.quotation_get        # implemented

dolibarr.thirdparty_list     # implemented
dolibarr.thirdparty_get      # implemented
dolibarr.product_list        # implemented
dolibarr.product_get         # implemented
dolibarr.invoice_list        # implemented
dolibarr.invoice_get         # implemented
dolibarr.order_list          # implemented
dolibarr.order_get           # implemented
dolibarr.proposal_list       # implemented
dolibarr.proposal_get        # implemented
```

Mutation tools should come later, with `dry_run: true` by default and explicit
native names:

```text
erpnext.sales_invoice_submit
erpnext.sales_invoice_cancel

dolibarr.invoice_validate
dolibarr.invoice_set_to_paid
dolibarr.order_validate
dolibarr.proposal_close
```

## Canonical Types to Study

Do not treat these as stable yet. They are the likely first normalized reads:

- `BusinessParty`
- `CatalogItem`
- `SalesInvoice`
- `SalesInvoiceLine`
- `SalesOrder`
- `Quotation`
- `AttachmentRef`
- `LifecycleState`

Each canonical object should include:

- `provider`
- `providerId`
- `providerType`
- `lifecycleState`
- `nativeLifecycleState`
- `availableActions`
- `raw`

## Implementation Consequences

1. `mcp-erp` should keep provider-native tools visible in the MCP tool list.
2. `capabilities()` should be part of the adapter contract before normalized
   tools grow.
3. List and get tools can be implemented before create/update/validate tools.
4. Pagination, filtering, and field selection need provider-specific input
   schemas.
5. Errors should be machine-readable and preserve provider status/body context.
6. E-invoicing remains outside this adapter layer; invoice data can be read from
   ERP systems here, but regulated invoice routing/status belongs in
   `mcp-einvoice`.
7. Viewers are shared at the MCP Apps layer. The current `doclist-viewer` can
   render provider-native list payloads when tools include `{ doctype, data }`.
   The `diagnostics-viewer` renders both provider `ping` payloads. The ERPNext
   invoice viewer can render `Sales Invoice` details now; Dolibarr invoice
   details need a small payload mapping before using the same viewer.

## Open Verification

Before implementation:

1. Run against one real ERPNext instance and one real Dolibarr instance.
2. Capture representative payloads for Customer/Thirdparty, Item/Product, Sales
   Invoice/Invoice, Sales Order/Order, Quotation/Proposal.
3. Check attachments and custom fields in both systems.
4. Check company/multicompany behavior with realistic tenant credentials.
5. Decide which line writes are safe enough for v0.1, if any.
