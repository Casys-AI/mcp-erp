# @casys/mcp-erp-local-agent

Outbound-tunnel agent for on-prem ERPs (ERPNext, Dolibarr, …) that lets
`erp-platform` route MCP `tools/call` to a customer's LAN without
exposing the ERP publicly.

This is the **only** piece of the Casys stack that runs on customer
hardware. Keep its blast radius small: read-only file access, no
inbound port, no telemetry without consent.

## How it fits

```
Claude.ai (MCP client)
        │  https://<tenant>.erp-platform.fr/mcp
        ▼
erp-platform (Fresh + Prisma SaaS)
        │  WebSocket /mcp/_tunnel  (outbound from agent)
        ▼
@casys/mcp-erp-local-agent  ←─ THIS PACKAGE  ←  runs in the customer LAN
        │  HTTP(S) on the LAN
        ▼
ERPNext / Dolibarr (on-prem)
```

The agent embeds `@casys/mcp-erp` (the ERP adapter dispatcher) and the
`@casys/mcp-bridge/adapters/network` client. It dials the SaaS relay,
authenticates, and forwards every incoming `tool.call` to the local
ERP through the matching adapter.

## Install

While `@casys/mcp-bridge` and `@casys/mcp-erp` are not yet JSR-published,
clone the three sibling repos under a common parent:

```
parent/
├── mcp-server/        # @casys/mcp-bridge
├── mcp-erp/           # this package + adapter core
└── erp-platform/      # hosted SaaS (not needed on the customer host)
```

Then from `mcp-erp/apps/local-agent`:

```bash
deno task check        # fmt + lint + typecheck + test
```

Future: `deno install -A -g jsr:@casys/mcp-erp-local-agent/cli` once
published.

## Configure

Create `mcp-erp.local-agent.json`:

```json
{
  "relayUrl": "wss://acme.erp-platform.fr/mcp/_tunnel",
  "endpointAuth": {
    "type": "bearer",
    "token": "<agent_token>",
    "via": "header"
  },
  "tenantId": "<tenant UUID>",
  "erpType": "erpnext",
  "agentId": "acme-erpnext-prod-01",
  "keyVersion": 1,
  "connection": {
    "erpType": "erpnext",
    "apiUrl": "http://localhost:8000",
    "apiKey": "<erpnext_api_key>",
    "apiSecret": "<erpnext_api_secret>",
    "sandbox": true
  }
}
```

### Top-level fields

| Field          | Type               | Rule                                                                |
| -------------- | ------------------ | ------------------------------------------------------------------- |
| `relayUrl`     | string             | Must be `ws:` (dev) or `wss:`. Points at `/mcp/_tunnel` on the tenant subdomain. |
| `endpointAuth` | object             | See below.                                                          |
| `tenantId`     | string (UUID)      | Matches the platform tenant.                                        |
| `erpType`      | `erpnext` \| `dolibarr` | Restricted to ERPs supported by `@casys/mcp-erp`.                |
| `agentId`      | string             | Stable identifier per agent install. Must match `tunnelAgentId` in the platform DB. |
| `keyVersion`   | positive integer   | Must match `tunnelKeyVersion` in the platform DB. Bump on rotation. |
| `connection`   | object             | ERP-specific. `connection.erpType` must equal top-level `erpType`.  |

### `endpointAuth`

Two variants:

```json
{ "type": "bearer", "token": "...", "via": "header" }
{ "type": "bearer", "token": "...", "via": "query", "queryParam": "token" }
{ "type": "headers", "headers": { "X-Custom-Auth": "..." } }
```

`via: "header"` is the default and the right choice. `via: "query"`
leaks the token to WS proxy logs and access logs — use only when a
proxy cannot pass headers.

### `connection` per ERP

| ERP      | Required fields                                                |
| -------- | -------------------------------------------------------------- |
| ERPNext  | `apiUrl`, `apiKey`, `apiSecret`, `sandbox`                     |
| Dolibarr | `apiUrl`, `apiKey`, `sandbox`                                  |

`apiUrl` must use `http:` or `https:`. `sandbox: true` should be the
norm during smoke-tests.

## Run

```bash
deno task agent --config ./mcp-erp.local-agent.json
```

Required Deno permissions: `--allow-read --allow-net` (already wired in
the `agent` task).

On successful connect you see:

```
Local ERP agent connected: <erpType> <agentId>
```

`SIGINT` / `SIGTERM` triggers a graceful shutdown: in-flight tool calls
finish, the WS closes, the ERP adapter disposes, then exit 0.

## Error codes

All errors emitted at startup are machine-readable. Match the
`CODE: message` shape per AX principle #4 (`code` / `context` /
`recovery`).

| Code                        | Meaning                                                    |
| --------------------------- | ---------------------------------------------------------- |
| `CLI_CONFIG_REQUIRED`       | No `--config <path>` flag.                                 |
| `CONFIG_INVALID`            | The config file is not a JSON object.                      |
| `CONFIG_FIELD_REQUIRED:<p>` | Missing field `<p>`.                                       |
| `CONFIG_FIELD_INVALID:<p>`  | Field `<p>` has a wrong type, format, or enum value.       |

WS close codes from the relay (visible in the agent's log on disconnect):

| Code | Meaning                                                       |
| ---- | ------------------------------------------------------------- |
| 4004 | The tenant has no `TenantErpConfig` row for this `erpType`.   |
| 4009 | The tenant exists but `connectionMode='direct'`.              |
| 4001 | `agentId` / `keyVersion` / token mismatch — re-check enrollment. |

## Security model

What the agent **does** trust:

- The relay URL (TLS-pinned through the customer's CA store).
- The agent token, generated by the platform operator.

What the agent **does not** trust:

- The `tool.call` payloads — every call is dispatched through the ERP
  adapter, which enforces the ERP's own auth model on each request.
- Other agents on the same network — there is no inter-agent
  communication.

Credentials live in memory only. The config file is read once at start;
nothing is written back. Logs do not include credential fields. Verify
with `deno task check` (the test suite asserts no credential leak in
`console.log` calls).

## Troubleshooting

See [`erp-platform/docs/runbooks/local-erp-agent-smoke-test.md`](../../../erp-platform/docs/runbooks/local-erp-agent-smoke-test.md)
section 6 for a symptom → cause table.

## Development

```bash
deno task check    # fmt + lint + typecheck + test (must be green before commit)
deno test          # tests only
```

The package is intentionally thin. Logic that could be reused outside the
local-agent context (transport, adapter registry, ERP catalogs) lives
upstream in `@casys/mcp-bridge` and `@casys/mcp-erp` — do not duplicate.
