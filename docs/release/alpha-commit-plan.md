# Alpha Commit Plan

The current alpha diff should be split into focused commits before pushing.

## Proposed commits

1. `refactor!: remove local-agent tunnel experiment`
   - Delete `apps/local-agent`.
   - Remove the obsolete local-agent/tunnel architecture doc.
   - Remove `mcp-bridge` from the package surface.

2. `feat: add mcp-erp alpha implementation`
   - Add `ErpToolsClient`.
   - Add `erpToolErrorMapper`.
   - Add `createErpMcpApp`.
   - Add local stdio/http `server.ts`.
   - Add ERPNext Customer, Item, Sales Invoice, Sales Order, and Quotation
     tools.
   - Add Dolibarr Thirdparty, Product, Invoice, Order, and Proposal tools.
   - Preserve explicit `ErpConnection` usage in adapters.
   - Register `doclist-viewer`, `invoice-viewer`, and `diagnostics-viewer`.
   - Add viewer metadata constants.
   - Attach compatible tool `_meta.ui.resourceUri` values.
   - Include viewer HTML in JSR and npm package outputs.

3. `docs: record alpha status and roadmap`
   - Update `README.md`.
   - Update `CHANGELOG.md`.
   - Add `ROADMAP.md`.
   - Replace runtime-boundary docs with the corrected MCP server boundary.
   - Update ERPNext/Dolibarr comparison notes.

## Push order

Push the branch only after the commits above are reviewed as a coherent alpha
series. Keep generated npm output out of git unless the package policy changes.
