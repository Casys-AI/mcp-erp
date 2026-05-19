# Changelog

All notable changes to `@casys/mcp-erp` (and its `apps/local-agent`
sub-package `@casys/mcp-erp-local-agent`) will be documented in this
file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and the project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - 2026-05-19

First release that ships both the ERP-agnostic core AND a usable
customer-side tunnel agent. Powers the `erp-platform` tunnel MVP where
online MCP clients (Claude.ai, etc.) call ERPs running on private LANs.

### Added — `@casys/mcp-erp` (core)

- **`src/tool-catalog.ts` + exported `getErpToolDefinitions(erpType)`.**
  Returns the static tool definitions (name, description, inputSchema)
  for a given ERP type WITHOUT instantiating an adapter — so a hosted
  SaaS can build a tunneled MCP server without holding the customer's
  ERP credentials in memory. Currently covers `erpnext` and `dolibarr`.
- **`./local-agent` and `./local-agent/cli` exports** (sub-package
  `@casys/mcp-erp-local-agent`).

### Added — `@casys/mcp-erp-local-agent` (`apps/local-agent`)

This sub-package is the **customer-side tunnel agent** — the only piece
of the Casys stack that runs on customer hardware. It embeds
`@casys/mcp-erp` (this core) plus `@casys/mcp-bridge`'s network client,
dials a SaaS relay, and forwards `tool.call` to the local ERP.

- Runner, config parser, CLI entrypoint (`./cli`), and adapter wiring.
- Bounded exponential reconnect loop (initial 1s, cap 60s, ±20%
  jitter); fresh hello on each (re)connect. Terminal close codes
  (4001/4002/4004/4009) stop the loop with a structured error via
  `onTerminalError`.
- Structured `LocalErpAgentCliError { code, context, recovery }` for
  config-load failures (`CONFIG_FILE_NOT_FOUND`,
  `CONFIG_FILE_UNREADABLE`, `CONFIG_JSON_INVALID`,
  `CONFIG_UNEXPECTED_ERROR`).
- Top-level CLI boundary that redacts WS bearer tokens from stderr
  before printing (defense in depth — bridge also redacts upstream).
- Stable CLI exit codes: `2` = config error, `4` = terminal network
  error, `1` = unknown, `0` = clean shutdown.

### Security — `@casys/mcp-erp-local-agent`

- **`endpointAuth.via: "query"` is now rejected at config parse time.**
  Only `via: "header"` (or the `headers` variant) is accepted. The
  agent runs on customer hardware where systemd / proxy logs may
  capture the WebSocket URL — embedding the bearer there leaks it
  past every log-rotation.

### Added — testing

- Catalog ↔ adapter parity test in `src/tool-catalog_test.ts` — builds
  dummy ERPNext and Dolibarr adapters and asserts deep equality on
  `{ name, description, inputSchema }` between
  `getErpToolDefinitions(erpType)` and `adapter.tools()`. Prevents
  future drift between the static tunneled catalog and the runtime
  adapter dispatch.

### References

- Implementation plan and review trail:
  [`erp-platform/docs/superpowers/plans/2026-05-18-tunnel-review-fixes.md`](https://github.com/Casys-AI/erp-platform/blob/main/docs/superpowers/plans/2026-05-18-tunnel-review-fixes.md)
- Architecture decision: ADR 0003 (`erp-platform/docs/adr/0003-network-tunnel-via-mcp-bridge.md`)
  + ADR 0004 (`erp-platform/docs/adr/0004-tunnel-challenge-response-v2.md`).
- Required peers: `@casys/mcp-bridge ^0.3.0`,
  `@casys/mcp-server ^0.17.2`.
