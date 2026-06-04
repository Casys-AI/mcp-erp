# @casys/mcp-erp

ERP-agnostic MCP adapter layer.

Drop-in adapters for ERPNext, Dolibarr, and more — designed to be embedded
inside a multi-tenant MCP server. Every adapter takes an explicit
`ErpConnection` (no env vars, no globals) so the same process can serve N
tenants connected to N different ERPs.

> **Status — v0.1.0.** Adapter contract, static tool catalog,
> `@casys/mcp-server` stdio/http projection, ERPNext Customer/Item/Sales
> Invoice/Sales Order/Quotation tools, and Dolibarr
> Thirdparty/Product/Invoice/Order/Proposal tools.

## Usage

```ts
import {
  buildAdapter,
  type ErpConnection,
  ErpToolsClient,
} from "@casys/mcp-erp";

const connection: ErpConnection = {
  erpType: "erpnext",
  apiUrl: "https://erp.example.com",
  apiKey: "<frappe api_key>",
  apiSecret: "<frappe api_secret>",
  sandbox: false,
};

const adapter = await buildAdapter(connection);

const tools = adapter.tools(); // ErpToolDefinition[]
const result = await adapter.callTool("erpnext.customer_list", {
  limit: 20,
  limitStart: 0,
}, {
  tenantId: "acme",
  actorSubject: null,
});

await adapter.dispose();
```

### Registering with `@casys/mcp-server`

`ErpToolsClient` is the MCP projection layer, mirroring `EInvoiceToolsClient` in
`mcp-einvoice`. Adapters stay agnostic; MCP servers register the projected tools
and handlers at the boundary.

```ts
import { McpApp } from "@casys/mcp-server";
import {
  buildAdapter,
  erpToolErrorMapper,
  ErpToolsClient,
} from "@casys/mcp-erp";

const adapter = await buildAdapter(connection);
const toolsClient = new ErpToolsClient({
  tenantId: "acme",
  actorSubject: null,
});

const app = new McpApp({
  name: "mcp-erp-acme",
  version: "0.1.0",
  validateSchema: true,
  backpressureStrategy: "queue",
  toolErrorMapper: erpToolErrorMapper,
});

toolsClient.registerTools(app, adapter);

await app.start(); // stdio

// Or HTTP, useful for Inspector / hosted routes:
// await app.startHttp({ port: 3020, hostname: "localhost" });
```

For a local HTTP smoke test against a hosted or local ERP instance:

```bash
deno task serve -- --config ./mcp-erp.config.json --port=3020
```

### MCP Apps viewers

`createErpMcpApp()` registers bundled MCP Apps viewers under `ui://mcp-erp/*`.
The first list/detail viewers are ported from `mcp-erpnext`; the diagnostics
viewer is a small package-native view:

```text
ui://mcp-erp/doclist-viewer
ui://mcp-erp/invoice-viewer
ui://mcp-erp/diagnostics-viewer
```

`erpnext.ping` and `dolibarr.ping` point to `diagnostics-viewer` and return the
ERP type, API URL, tenant context, and exposed tool surface. Provider-native
list tools point to `doclist-viewer`. `erpnext.sales_invoice_get` points to
`invoice-viewer`. Dolibarr invoice detail stays native for now and will use the
invoice viewer after a small provider-to-viewer payload mapping. Sales order,
quotation, order, and proposal detail tools also stay native until a shared
detail viewer lands.

### Current tool surface

Read-only provider-native tools shipped now:

```text
erpnext.ping
erpnext.customer_list
erpnext.customer_get
erpnext.item_list
erpnext.item_get
erpnext.sales_invoice_list
erpnext.sales_invoice_get
erpnext.sales_order_list
erpnext.sales_order_get
erpnext.quotation_list
erpnext.quotation_get

dolibarr.ping
dolibarr.thirdparty_list
dolibarr.thirdparty_get
dolibarr.product_list
dolibarr.product_get
dolibarr.invoice_list
dolibarr.invoice_get
dolibarr.order_list
dolibarr.order_get
dolibarr.proposal_list
dolibarr.proposal_get
```

## Public surface (v0.1.0)

```ts
// Connection
type ErpConnection
type ErpType
const ERP_TYPES
function isKnownErpType(value: string): value is ErpType

// Adapter contract
interface ErpAdapter
type ErpAdapterFactory
interface ErpToolDefinition
interface ErpToolCallContext
interface ErpToolCallResult
interface ErpToolAnnotations
interface ErpToolMeta
class UnknownToolError

// MCP projection, registry & factories
class ErpToolsClient
function erpToolErrorMapper(error, toolName): string | null
async function buildAdapter(connection: ErpConnection): Promise<ErpAdapter>
const REGISTERED_ERP_TYPES
function getErpToolDefinitions(erpType): ErpToolDefinition[]
function registerErpViewers(app): { registered: string[]; skipped: string[] }
function createErpnextAdapter(connection): ErpAdapter
function createDolibarrAdapter(connection): ErpAdapter
const ERP_VIEWERS
const ERP_DOCLIST_META
const ERP_INVOICE_META
const ERP_DIAGNOSTICS_META
class FrappeApiError
class DolibarrApiError
```

## Why this exists

This package is the OSS adapter layer. Authentication, multi-tenancy, audit, DCR
proxy and dashboard live in the proprietary `erp-platform` SaaS that
**consumes** this package. Splitting them keeps each side honest:

- This package : agnostic protocol/adapters. **No tenant model**, no Zitadel, no
  DB. Receives `ErpConnection` per call.
- `erp-platform` : multi-tenant Fresh+Prisma+Zitadel platform that resolves a
  tenant → credentials → `ErpConnection` and dispatches MCP calls through this
  adapter layer.

## Design choices

1. **One package, not two.** mcp-einvoice splits into `core` + `mcp`; we keep
   things in a single package until we have ≥2 consumers that would benefit from
   the split.
2. **Explicit `ErpConnection`, not env-based.** Per-tenant safety in a single
   Deno process.
3. **Decoupled from `@casys/mcp-server` SDK shape.** Adapters return
   `ErpToolDefinition` (JSON Schema + name + description). Consumers project
   this into the SDK format at boundary time. Same pattern as
   `EInvoiceToolsClient` in mcp-einvoice.
4. **Scope ruthless.** v0.1 focuses on ERPNext and Dolibarr read-only tools
   first. Lifecycle mutations and normalized tools wait until the native API
   mapping is proven on both adapters. No `Odoo`, no `SAP`, until that
   foundation is boring.

## Roadmap

See [`ROADMAP.md`](./ROADMAP.md) for the alpha-to-beta product roadmap.

## Related projects

- [`mcp-einvoice`](https://github.com/Casys-AI/mcp-einvoice) — sibling OSS
  package, same pattern, e-invoicing domain.
- [`mcp-erpnext`](https://github.com/Casys-AI/mcp-erpnext) — mono-cible ERPNext
  MCP server (env-based singleton). Different scope: useful pattern reference,
  but not a runtime dependency of this package.
- `erp-platform` (private) — the SaaS that consumes this package.

## License

MIT — see `LICENSE`.
