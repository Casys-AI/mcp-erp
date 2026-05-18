# Runtime boundaries and local ERP tunnel

Status: working architecture note, updated after the first tunnel/local-agent
implementation pass.

## Problem

The target product is not only an ERP adapter package. The full flow is:

```text
Claude.ai / MCP client
  -> erp-platform online MCP endpoint
  -> tenant auth + credential/session routing
  -> ERP adapter execution
  -> customer's ERP, often on a private LAN
```

For hosted ERPs, `erp-platform` can instantiate `mcp-erp` in process and call
the ERP API directly. For local/on-prem ERPs, that is not enough: Claude.ai can
only reach the online MCP endpoint, while the ERP may be a local Docker stack or
LAN server with no public inbound access.

This means the first end-to-end validation is blocked until we have a local ERP
agent and outbound tunnel path.

## Boundary Decision

The `mcp-erp` core remains the ERP adapter layer:

- provider API clients,
- provider-native tools,
- canonical mappers,
- capability declarations,
- normalized tools once mappings are proven.

The `mcp-erp` repository also owns the ERP-specific local-agent app because it
is the concrete "run MCP ERP locally" product surface. That app consumes
`@casys/mcp-bridge/adapters/network`; it does not define its own tunnel
protocol.

`erp-platform` remains the online product layer:

- tenant resolution,
- OAuth/DCR/Zitadel,
- encrypted credential storage,
- MCP endpoint exposed to Claude.ai and other MCP clients,
- routing between direct adapters and tunneled local agents.

`mcp-bridge` owns the network tunnel:

- local agent opens outbound WebSocket to the SaaS relay,
- relay receives Claude.ai `tools/call`,
- relay routes the call to the right tenant/session agent,
- responses flow back through the tunnel.
- protocol names stay generic (`targetType`, not `erpType`) so the same tunnel
  can carry non-ERP local targets.

This matches `erp-platform/docs/adr/0003-network-tunnel-via-mcp-bridge.md`.

## Runtime Modes

### Direct hosted ERP

```text
Claude.ai
  -> https://tenant.erp-platform.fr/mcp
  -> erp-platform auth + tenant resolver
  -> buildAdapter(ErpConnection)
  -> hosted ERP API
```

Use this mode for hosted ERPNext/Frappe Cloud, cloud Dolibarr, Odoo Online when
API access is available, Zoho, Business Central, NetSuite, etc.

### Local ERP through tunnel

```text
Claude.ai
  -> https://tenant.erp-platform.fr/mcp
  -> erp-platform auth + tenant resolver
  -> /mcp/_tunnel relay
  -> outbound WebSocket
  -> local mcp-erp agent
  -> mcp-erp adapter
  -> local ERP API
```

Use this mode for ERPNext Docker, local Dolibarr, on-prem Odoo, or customer
systems behind a firewall.

## Local Agent Shape

The local agent should be thin. It should not own tenant auth or product UX.

Responsibilities:

- load a tenant-specific agent enrollment token or signing key;
- open and maintain the outbound tunnel;
- instantiate the right `mcp-erp` adapter locally;
- execute provider tools against `http://localhost`, LAN hostnames, or private
  VPN addresses;
- return structured MCP tool results and typed errors.

Non-responsibilities:

- no Zitadel/OAuth/DCR;
- no tenant database;
- no web dashboard;
- no compliance/e-invoicing logic beyond calling the relevant local or remote
  tool if composed by the platform.

## Capability Impact

Adapter capabilities must distinguish provider features from runtime transport
features.

Provider capability examples:

- `schemaDiscovery`
- `genericRecords`
- `businessDocuments`
- `workflowActions`
- `attachments`
- `batch`
- `companyContext`
- `customFields`
- `eInvoicingBridge`

Runtime capability examples:

- `directHttp`
- `localTunnel`
- `agentEnrollment`
- `heartbeat`
- `reconnect`
- `relayBackpressure`

Do not infer "ERP supports X" from "the tunnel supports X", or the reverse.

## Proposed Tree Additions

The `mcp-erp` core should stay transport-agnostic, but the repository includes
the ERP local-agent app that wires the core to `mcp-bridge`.

```text
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
  runbooks/
    local-agent-smoke-test.md       # after the bridge MVP exists
```

No separate `@casys/erp-bridge` package for now. If the local-agent app grows
large enough to deserve its own package later, it should still depend on both
`@casys/mcp-erp` and `@casys/mcp-bridge`; the tunnel protocol remains owned by
`mcp-bridge`.

## Critical Path for Full E2E

1. Keep testing adapter logic locally without tunnel: `mcp-erp` -> local ERP
   API.
2. Build bridge MVP: one local agent, one tenant, outbound WebSocket, one
   request in flight at a time.
3. Add `erp-platform` relay route `/mcp/_tunnel`.
4. Add tenant setting that chooses `connectionMode: "direct" | "tunnel"`.
5. Run Claude.ai -> `erp-platform` -> tunnel -> local ERPNext/Dolibarr.
6. Only after this is green, harden multi-agent routing, reconnect,
   backpressure, audit, and enrollment rotation.

## Open Questions

- Is the local agent distributed as `deno run`, a compiled binary, an npm
  wrapper, or all three?
- Does the first enrollment token come from the dashboard, CLI copy/paste, or a
  short-lived QR/code flow?
- Does the local agent expose a local MCP server for Claude Desktop too, or is
  it only a tunnel client for Claude.ai/web clients?
- What is the retry semantic for a tunneled `tools/call`: at most once or at
  least once with idempotency keys?
- How much adapter metadata should be cached in `erp-platform` when the local
  agent is offline?
