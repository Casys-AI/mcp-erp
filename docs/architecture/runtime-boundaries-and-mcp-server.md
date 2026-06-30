# Runtime boundaries and MCP server modes

Status: working architecture note, corrected after scope clarification.

## Doctrine

`@casys/mcp-erp` is the ERP adapter package plus a small MCP server bootstrap.
The target product runtime is a **remote MCP server** embedded in `erp-platform`
or another hosted service. The thing that may be local/on-prem is the ERP
instance itself, not a separate customer-side ERP agent.

For development and smoke tests, run the MCP server locally in stdio or HTTP
mode with `@casys/mcp-server`:

```text
MCP Inspector / Claude Desktop
  -> local `deno task stdio -- --config ./mcp-erp.config.json`
  -> createErpMcpApp()
  -> ErpToolsClient.registerTools(app, adapter)
  -> ERPNext / Dolibarr API
```

or:

```text
MCP Inspector / browser client
  -> http://localhost:3020/mcp
  -> createErpMcpApp()
  -> ErpToolsClient.registerTools(app, adapter)
  -> ERPNext / Dolibarr API
```

## Boundary Decision

The `mcp-erp` core remains the adapter layer:

- explicit `ErpConnection`;
- provider API clients;
- provider-native tools;
- typed provider errors;
- `ErpToolsClient` projection into `@casys/mcp-server`;
- canonical mappers and normalized tools later, once mappings are proven.

`@casys/mcp-server` owns MCP protocol concerns:

- stdio and HTTP transports;
- schema validation;
- backpressure and concurrency;
- tool error mapping;
- MCP Apps viewer/resource registration when ERP viewers exist.

`erp-platform` remains the future hosted product layer:

- tenant resolution;
- OAuth/DCR/Zitadel;
- encrypted credential storage;
- remote MCP endpoint exposed to clients;
- network access policy for hosted or on-prem ERP APIs.

## Runtime Modes

### Local Dev Stdio

```bash
deno task stdio -- --config ./mcp-erp.config.json
```

Use for Claude Desktop-style local runs. The config file supplies tenant context
and explicit ERP credentials; adapters do not read env vars.

### Local Dev HTTP

```bash
deno task serve -- --config ./mcp-erp.config.json --port=3020
```

Use for MCP Inspector and HTTP-mode debugging:

```text
http://localhost:3020/mcp
```

### Hosted Remote MCP

```text
Claude.ai / MCP client
  -> https://tenant.erp-platform.fr/mcp
  -> erp-platform auth + tenant resolver
  -> createErpMcpApp({ adapter: buildAdapter(connection), ... })
  -> ERP API
```

Use this for production. If an ERP is not publicly reachable, that is a network
connectivity/product decision at the hosted platform layer, not a responsibility
of the adapter package.

## Local ERP Instances

An ERP can still be local during development:

- ERPNext Docker on `http://localhost:8000`;
- Dolibarr Docker on `http://localhost:8080/api/index.php`;
- customer-like staging ERP reachable through VPN or private network.

That does not change the MCP server shape. The server may run locally in dev or
remotely in production; the adapter only receives an explicit `ErpConnection`.

## Shared Viewers

The shared UI surface is MCP Apps viewers, not an `apps/` runtime package. The
first pass ports built list/detail viewers from `mcp-erpnext` into
`src/ui/dist`, adds a package-native diagnostics viewer, and serves them through
`registerErpViewers(app)`:

- `ui://mcp-erp/doclist-viewer`
- `ui://mcp-erp/invoice-viewer`
- `ui://mcp-erp/diagnostics-viewer`

Current bindings:

- `erpnext.ping` and `dolibarr.ping` point to `diagnostics-viewer`;
- provider-native list tools point to `doclist-viewer`;
- `erpnext.sales_invoice_get` points to `invoice-viewer`;
- Dolibarr invoice detail maps to the invoice viewer contract;
- sales order, quotation, order, and proposal detail tools stay native until a
  shared document-detail viewer lands.

Future reusable ERP views still needed:

- business party list/detail;
- catalog item list/detail;
- order/quotation detail;
- status or lifecycle timeline.

Viewers are registered through `@casys/mcp-server` resources and referenced from
tool `_meta.ui.resourceUri`, following the `mcp-einvoice` viewer pattern.

## Current Tree

```text
server.ts                 # local/dev stdio/http entrypoint
mod.ts                    # public API exports
src/
  domain/
    adapter.ts            # ErpAdapter contract
    connection.ts         # explicit ERP connection union
    lifecycle.ts          # normalized lifecycle mappers
    normalized.ts         # NormalizedPayload / NormalizedError
    write.ts              # write-mode and capability primitives
  features/
    customer/             # customer contract + ERPNext/Dolibarr mappers
    product/              # catalog item contract + mappers
    supplier/             # supplier contract + mappers
    invoice/              # sales invoice contract + normalizers
    sales-order/          # sales order contract + normalizers
    quotation/            # quotation/proposal contract + normalizers
  platform/
    erp/
      erpnext/client.ts   # raw Frappe REST I/O
      erpnext/adapter.ts  # Frappe REST provider tools
      erpnext/adapter_test.ts
      erpnext/types.ts    # ERPNext native payload shapes
      dolibarr/client.ts  # raw Dolibarr REST I/O
      dolibarr/adapter.ts # Dolibarr REST provider tools
      dolibarr/adapter_test.ts
      dolibarr/types.ts   # Dolibarr native payload shapes
    mcp/
      client.ts           # ErpToolsClient -> @casys/mcp-server
      error-mapper.ts     # toolErrorMapper for @casys/mcp-server
      mcp-app.ts          # createErpMcpApp()
      remote-app.ts       # hosted multi-tenant MCP app factory
      tool-catalog.ts     # static provider tool catalog
    viewers/viewers.ts    # registerErpViewers() + viewer metadata constants
  registry.ts             # buildAdapter(connection)
  normalized-adapter.ts   # cross-ERP normalized tool facade
  ui/dist/                # built MCP Apps viewer HTML bundles
```

## Critical Path

1. Grow provider-native read tools for ERPNext and Dolibarr.
2. Keep `createErpMcpApp()` and `ErpToolsClient` aligned with
   `@casys/mcp-server`.
3. Test stdio and HTTP locally against real ERPNext/Dolibarr instances.
4. Continue splitting provider adapters by tool family after the raw REST
   clients.
5. Extend MCP Apps viewers after tool payloads stabilize.
6. Add normalized tools only after both provider mappings are evidence-backed.
