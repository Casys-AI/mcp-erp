# Write surfaces and capability gating

Status: **architecture decision — foundation accepted 2026-06-30.** Captures the
agreed model for moving `@casys/mcp-erp` from a read-only tool surface to write
(mutation) tools. The foundation below is decided; the "Open decisions" section
lists what is deliberately still unresolved.

This note is the source of truth for *how* writes are shaped. It does not yet
specify the MVP tool list field-by-field — that follows once the open decisions
are closed.

## Context

- `@casys/mcp-erp` is ERP-agnostic and today **100% read-only** (ERPNext via the
  Frappe API with its `docstatus` draft/submitted/cancelled lifecycle, Dolibarr
  via REST).
- The adapter contract already anticipates mutations: `ErpToolAnnotations` has
  `readOnlyHint` / `destructiveHint` (`src/adapter.ts:41`), and the HTTP layer is
  already generic over the method (`request<T>(method, …)` in
  `src/adapters/erpnext.ts:744`) — it only lacks a request body.
- The package runs in two deployment shapes:
  - **Local / mono-tenant** (dev stdio/http): one ERP per process.
  - **Remote / multi-tenant** (`buildMultiTenantHandlersMap`, `src/client.ts`):
    the ERP is resolved **per request** from the authenticated tenant
    (`ctx.authInfo.tenantId`); it is *not* known at boot. The server also
    supports the **stateless** transport (MCP spec 2026-07-28), where
    `tools/list` can be served without tenant context.

Two precedents and one review fed this decision:
- **`mcp-einvoice`** — the in-house pattern for varying a tool surface by
  provider: stable tool names + per-adapter `capabilities: Set` +
  per-tool `requires[]`, filtered once at boot (mono-tenant).
- **`mcp-erpnext`** — 28 write tools, a solid shared HTTP client, but its write
  plumbing is Frappe-coupled (body shape `{ data: { ...data, doctype } }`,
  `frappe.client.submit/cancel`, optimistic lock via `modified`). Reusable as a
  *pattern*, not as code.
- **Codex design review** (2026-06-30) — converged with both, and flagged the
  multi-tenant/stateless break in the einvoice pattern.

## Decision (foundation)

1. **One normalized, agnostic tool surface with stable names.** Tools are named
   for the business action (`customer_create`), never prefixed by ERP
   (`erpnext.customer_create`). The normalized input schema is common across
   ERPs. "Native" survives **only inside the adapter**: `callTool` translates the
   normalized args into the Frappe/Dolibarr native call. We do **not** ship
   ERP-prefixed native write tools — that would be immediate API debt and would
   teach LLMs the wrong paths.

2. **Capability-based gating.** Each adapter declares what it can actually do via
   a **structured capability manifest** (not a bare `Set<string>` — writes need
   more than a name: supported modes `preview`/`commit`, supported fields,
   required tenant configuration, idempotency, lifecycle touched). Each tool
   declares the capabilities it `requires`. A tool is usable for an ERP iff that
   ERP's manifest satisfies the tool's `requires`.

3. **Dual-mode gating — same mechanism, applied in two places.**
   - **Mono-tenant**: filter `tools/list` at boot by the deployment ERP's
     capabilities — exactly the einvoice pattern. This is the "a client picks one
     ERP and sticks with it" case.
   - **Multi-tenant / stateless**: `tools/list` cannot carry per-tenant truth, so
     it exposes the **superset catalog**, and enforcement happens **at call
     time**: a structured fast-fail `UNSUPPORTED_CAPABILITY` (machine-readable
     `code` + `context.requires` + `context.erpType` + `recovery`). The
     capability manifest drives both the boot filter and the call-time check.

4. **`erp.capabilities_describe` read-only tool** (optionally mirrored as an
   `erp://tenant/capabilities` resource). Because in multi-tenant/stateless a
   model sees the superset in `tools/list` but its tenant may not support every
   tool, the model needs a reliable way to ask "what can *this* tenant do?".
   Output is a strict schema: `erpType`, `supportedTools`,
   `supportedCapabilities`, `supportedFields`, `missingConfiguration`,
   `capabilityVersion`. A tool is preferred over a resource because resources are
   host/app-driven and less reliable for an LLM.

5. **`erpType` stays out of write inputs.** It is derived from the authenticated
   tenant, returned in the *result* (not asked in the input). Never expose native
   and normalized tools for the same action simultaneously — the model will
   gravitate to the more specific one.

6. **Best-of-breed is a later phase.** Today we normalize the *common core of
   what real ERPs already do*. The richer "superset of the best capability of
   each ERP" interface is deferred to the future own-ERP phase. "We normalize
   anyway" — heterogeneity is expressed through tool/capability availability, not
   by falling back to ERP-specific surfaces.

## AX alignment

The model above is chosen to satisfy the project's AX principles:
- **Machine-readable errors**: `UNSUPPORTED_CAPABILITY` carries `code` +
  `context` + `recovery`, not prose. (Improves on `mcp-erpnext`, which flattens
  ERPNext `exc_type` into a string and loses the structured code.)
- **Fast-fail early**: capability + input validation at the boundary, before any
  HTTP write.
- **Explicit over implicit / no silent failures**: an unsupported request fails
  loudly and structured; it is never silently ignored.
- **Safe defaults**: writes are opt-in and previewable (see open decision on
  preview/commit).

## Open decisions (not yet settled)

- **Write semantics — preview/commit vs `dry_run`.** Codex pushes for two tools
  (`*_preview` read-only + `*_commit` requiring a `previewId`/`confirm` +
  `idempotencyKey`) over a single `dry_run: boolean`, because a boolean lets the
  LLM forget to flip it and believe it wrote. The committed result must be
  unambiguous (`committed: true|false`, no fake `nativeId` on preview).
  → to decide.
- **Field-level normalization.** Core-strict vs core + a few *normalized*
  optional fields. Leaning core-strict with mapped fields (Dolibarr `code_client`
  → normalized `externalRef`/`customerCode`, VAT → `taxId`) and ERPNext-only
  `customer_group`/`territory` pushed to explicit per-tenant connection defaults.
  Avoid a `native: {}` escape hatch in the default surface (it breaks portability
  and invites invented fields). → to decide.
- **Idempotency** on commit (key, or natural-key dedup) to avoid duplicate
  records on retry. → to decide.
- **MVP scope.** First writes: create a simple entity (customer + product/item)
  on both ERPNext and Dolibarr, common fields only, explicit tenant defaults,
  structured errors on missing config. → to confirm field list.

## References

- `src/adapter.ts` — `ErpAdapter`, `ErpToolDefinition`, annotations.
- `src/client.ts` — `ErpToolsClient`, `buildMultiTenantHandlersMap` (per-request
  tenant→adapter resolution).
- `src/normalized-adapter.ts` — Wave 3 normalized read layer; `NormalizedPayload`
  already carries `availableActions` / `lifecycleState` (the read-side notion of
  "what this ERP can do"). Writes extend this contract rather than restarting in
  native.
- `docs/architecture/erpnext-dolibarr-api-comparison.md` — native API divergence.
- `docs/migration-mcp-spec-2026-07-28.md` — stateless transport context.
- `mcp-einvoice` — `capabilities`/`requires` precedent (gating at the tool level
  only; static schema; native translation delegated to the adapter).
