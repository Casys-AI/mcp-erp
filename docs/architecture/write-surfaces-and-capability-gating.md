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
    supports the **stateless** transport (MCP spec 2026-07-28). The server is
    **authenticated**, so the tenant identity rides on *every* request —
    including `tools/list` — even in stateless mode. `tools/list` can therefore
    be resolved per tenant; it is not forced to be tenant-blind.

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

3. **Per-tenant filtered `tools/list` is the primary mechanism; the call-time
   check is defense-in-depth.**
   - **Primary — filtered listing.** `tools/list` is filtered by the tenant's
     ERP capabilities, so an agent **literally never receives** a tool its ERP
     does not support — it cannot call what it cannot see. This holds in **both**
     deployment shapes: mono-tenant filters once at boot (the einvoice pattern);
     multi-tenant filters per request, which is possible because the server is
     authenticated and the `tenantId` is present on `tools/list` too (even
     stateless). There is **no superset catalog** exposed to agents.
   - **Defense-in-depth — call-time fast-fail.** `tools/call` still revalidates
     the capability and fails with a structured `UNSUPPORTED_CAPABILITY`
     (machine-readable `code` + `context.requires` + `context.erpType` +
     `recovery`). This is a safety net for leaks or unauthenticated discovery —
     **not** the everyday mechanism.
   - The same capability manifest drives both the listing filter and the
     call-time check.
   - *Implementation note:* the current `buildMultiTenantHandlersMap`
     (`src/client.ts:122`) registers a **static** tool list and only resolves the
     adapter per tenant **at call time**. To honor the primary mechanism, the
     **listing** must become tenant-resolved as well, not just the handlers.

4. **`erp.capabilities_describe` read-only tool** (optionally mirrored as an
   `erp://tenant/capabilities` resource). With the listing already filtered, the
   agent's *tool presence* is correct; `capabilities_describe` adds the
   finer-grained truth the tool list cannot carry — which **fields** are
   supported, missing tenant configuration, capability version. Output is a
   strict schema: `erpType`, `supportedTools`, `supportedCapabilities`,
   `supportedFields`, `missingConfiguration`, `capabilityVersion`. A tool is
   preferred over a resource because resources are host/app-driven and less
   reliable for an LLM.

5. **`erpType` stays out of write inputs.** It is derived from the authenticated
   tenant, returned in the *result* (not asked in the input). Never expose native
   and normalized tools for the same action simultaneously — the model will
   gravitate to the more specific one.

6. **Best-of-breed is a later phase.** Today we normalize the *common core of
   what real ERPs already do*. The richer "superset of the best capability of
   each ERP" interface is deferred to the future own-ERP phase. "We normalize
   anyway" — heterogeneity is expressed through tool/capability availability, not
   by falling back to ERP-specific surfaces.

7. **Write semantics — single tool with a required `mode`.** Each write action is
   ONE tool (`customer_create`) taking a **required** `mode: "preview" | "commit"`
   (no default — fast-fail if absent). `preview` validates inputs + capabilities
   and echoes the resolved native payload **without writing**; `commit` performs
   the write. The result **always** carries `committed: true|false` (never a fake
   `nativeId` on preview), and `commit` accepts an `idempotencyKey` to dedup
   retries. Chosen over two tools (surface bloat under capability gating +
   `previewId` state in stateless) and over `dry_run: boolean` (which lets the
   LLM forget to flip it and believe it wrote). Trade-off accepted: the single
   tool is destructive, so the `preview` path does not get a `readOnlyHint`.

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
