# @casys/mcp-erp

ERP-agnostic MCP adapter layer.

Drop-in adapters for ERPNext, Dolibarr, and more — designed to be embedded
inside a multi-tenant MCP server. Every adapter takes an explicit
`ErpConnection` (no env vars, no globals) so the same process can serve N
tenants connected to N different ERPs.

> **Status — v0.0.1 scaffold.** Structural primitives only (interface, registry,
> ping adapters). Real ERPNext tools land in 0.2+.

## Usage

```ts
import { buildAdapter, type ErpConnection } from "@casys/mcp-erp";

const connection: ErpConnection = {
  erpType: "erpnext",
  apiUrl: "https://erp.example.com",
  apiKey: "<frappe api_key>",
  apiSecret: "<frappe api_secret>",
  sandbox: false,
};

const adapter = await buildAdapter(connection);

const tools = adapter.tools(); // ErpToolDefinition[]
const result = await adapter.callTool("erpnext.ping", {}, {
  tenantId: "acme",
  actorSubject: null,
});

await adapter.dispose();
```

## Public surface (v0.0.1)

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
class UnknownToolError

// Registry & factories
async function buildAdapter(connection: ErpConnection): Promise<ErpAdapter>
const REGISTERED_ERP_TYPES
function createErpnextAdapter(connection): ErpAdapter
function createDolibarrAdapter(connection): ErpAdapter
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

## Design choices (v0.0.1 brainstorm verdict)

1. **One package, not two.** mcp-einvoice splits into `core` + `mcp`; we keep
   things in a single package until we have ≥2 consumers that would benefit from
   the split.
2. **Explicit `ErpConnection`, not env-based.** Per-tenant safety in a single
   Deno process.
3. **Decoupled from `@casys/mcp-server` SDK shape.** Adapters return
   `ErpToolDefinition` (JSON Schema + name + description). Consumers project
   this into the SDK format at boundary time. Same pattern as
   `EInvoiceToolsClient` in mcp-einvoice.
4. **Scope ruthless.** v0.1 = 1 real adapter (ERPNext, 5–8 tools max) plus 1
   structural-validation adapter (Dolibarr ping). No `Odoo`, no `SAP`, until
   ERPNext is stable.

## Related projects

- [`mcp-einvoice`](https://github.com/Casys-AI/mcp-einvoice) — sibling OSS
  package, same pattern, e-invoicing domain.
- [`mcp-erpnext`](https://github.com/Casys-AI/mcp-erpnext) — mono-cible ERPNext
  MCP server (env-based singleton). Different scope: not multi-tenant, **not
  used by this package**.
- `erp-platform` (private) — the SaaS that consumes this package.

## License

MIT — see `LICENSE`.
