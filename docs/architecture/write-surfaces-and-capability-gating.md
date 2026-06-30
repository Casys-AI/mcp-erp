# Write surfaces and capability gating

Status: **architecture decision — design complete 2026-06-30.** Captures the
agreed model for moving `@casys/mcp-erp` from a read-only tool surface to write
(mutation) tools, including the concrete MVP tool list. Ready for an
implementation plan.

This note is the source of truth for *how* writes are shaped and *what* the first
iteration ships. The "Deferred" section lists what is intentionally out of scope.

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

## Field normalization (decided)

**Option (b): common core + a few *normalized* optional fields.** No `native: {}`
escape hatch in the default surface (it breaks portability and invites invented
fields). Optional fields are normalized names mapped to each ERP, e.g. Dolibarr
`code_client` → `externalRef`, `tva_intra` → `taxId`.

**ERP-required fields without a cross-ERP equivalent → per-tenant connection
defaults.** ERPNext often requires `customer_group` / `territory` (and
`item_group` for Items) at creation; Dolibarr has no equivalent. These are
**not** in the normalized schema. They are resolved as explicit defaults on
`ErpConnection` (e.g. `defaultCustomerGroup`, `defaultTerritory`,
`defaultItemGroup`) and injected by the ERPNext adapter — never asked of the
agent. This keeps the normalized schema portable and stops the ERPNext create
from failing on missing required fields. (Adds fields to `src/connection.ts`.)

## MVP scope (this iteration)

Two write tools, both ERPs, each with the required `mode: "preview" | "commit"`:

**`customer_create`** (business party)

| Normalized field | Required | ERPNext `Customer` | Dolibarr `thirdparty` |
|---|---|---|---|
| `name` | yes | `customer_name` | `name`/`nom` |
| `kind`: `company`\|`individual` | default `company` | `customer_type` | individual flag |
| `taxId` | no | `tax_id` | `tva_intra` |
| `externalRef` | no | `name` (prompt-naming) | `code_client` |
| `email` / `phone` | no | `email_id` / `mobile_no` | `email` / `phone` |
| `currency` | no | `default_currency` | `currency_code` |
| `country` | no | (address) | `country_id` |

**`product_create`** (catalog item)

| Normalized field | Required | ERPNext `Item` | Dolibarr `product` |
|---|---|---|---|
| `name` | yes | `item_name` | `label` |
| `kind`: `product`\|`service` | default `product` | `is_stock_item` | `type` (0/1) |
| `sku` | no | `item_code` | `ref` |
| `unitPrice` (+ `currency`) | no | `standard_rate` | `price` |
| `uom` | no | `stock_uom` | (n/a) |

Supporting infrastructure in scope (required by the two tools): the per-adapter
**capability manifest**, the **per-tenant filtered listing**, the request **body**
on the HTTP layer (write path), and **structured write errors**.
`erp.capabilities_describe` ships in this iteration if cheap, otherwise follows —
it is not required by the two creates.

Idempotency: `commit` accepts an **optional** `idempotencyKey`; no automatic
natural-key dedup in the MVP. Missing tenant configuration → structured
`MISSING_REQUIRED_CONFIG` error (code + context + recovery).

The `kind` mapping to Dolibarr (company/individual, product/service) is the most
likely API-conformance risk and must be verified against the live Dolibarr API
before merge (Codex VRAI/FAUX/NUANCE pass).

## Deferred (not in this iteration)

- Best-of-breed superset interface (own-ERP phase).
- Natural-key idempotent dedup on commit.
- `update` / `submit` / `cancel` / `delete` write tools and lifecycle semantics.
- `supplier_create` (shows the doctype-vs-role-flag divergence).

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
