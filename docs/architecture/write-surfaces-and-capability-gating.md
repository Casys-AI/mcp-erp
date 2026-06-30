# Write surfaces and capability gating

Status: **architecture decision — design complete 2026-06-30.** Captures the
agreed model for moving `@casys/mcp-erp` from a read-only tool surface to write
(mutation) tools, including the concrete MVP tool list. Ready for an
implementation plan.

This note is the source of truth for _how_ writes are shaped and _what_ the
first iteration ships. The "Deferred" section lists what is intentionally out of
scope.

## Context

- `@casys/mcp-erp` is ERP-agnostic and today **100% read-only** (ERPNext via the
  Frappe API with its `docstatus` draft/submitted/cancelled lifecycle, Dolibarr
  via REST).
- The adapter contract already anticipates mutations: `ErpToolAnnotations` has
  `readOnlyHint` / `destructiveHint` (`src/adapter.ts:41`), and the HTTP layer
  is already generic over the method (`request<T>(method, …)` in
  `src/adapters/erpnext.ts:744`) — it only lacks a request body.
- The package runs in two deployment shapes:
  - **Local / mono-tenant** (dev stdio/http): one ERP per process.
  - **Remote / multi-tenant** (`buildMultiTenantHandlersMap`, `src/client.ts`):
    the ERP is resolved **per request** from the authenticated tenant
    (`ctx.authInfo.tenantId`); it is _not_ known at boot. The server also
    supports the **stateless** transport (MCP spec 2026-07-28). The server is
    **authenticated**, so the tenant identity rides on _every_ request —
    including `tools/list` — even in stateless mode. `tools/list` can therefore
    be resolved per tenant; it is not forced to be tenant-blind.

Two precedents and one review fed this decision:

- **`mcp-einvoice`** — the in-house pattern for varying a tool surface by
  provider: stable tool names + per-adapter `capabilities: Set` + per-tool
  `requires[]`, filtered once at boot (mono-tenant).
- **`mcp-erpnext`** — 28 write tools, a solid shared HTTP client, but its write
  plumbing is Frappe-coupled (body shape `{ data: { ...data, doctype } }`,
  `frappe.client.submit/cancel`, optimistic lock via `modified`). Reusable as a
  _pattern_, not as code.
- **Codex design review** (2026-06-30) — converged with both, and flagged the
  multi-tenant/stateless break in the einvoice pattern.

## Decision (foundation)

1. **One normalized, agnostic tool surface with stable names.** Tools are named
   for the business action (`customer_create`), never prefixed by ERP
   (`erpnext.customer_create`). The normalized input schema is common across
   ERPs. "Native" survives **only inside the adapter**: `callTool` translates
   the normalized args into the Frappe/Dolibarr native call. We do **not** ship
   ERP-prefixed native write tools — that would be immediate API debt and would
   teach LLMs the wrong paths.

2. **Capability-based gating.** Each adapter declares what it can actually do
   via a **structured capability manifest** (not a bare `Set<string>` — writes
   need more than a name: supported modes `preview`/`commit`, supported fields,
   required tenant configuration, idempotency, lifecycle touched). Each tool
   declares the capabilities it `requires`. A tool is usable for an ERP iff that
   ERP's manifest satisfies the tool's `requires`.

3. **Per-tenant filtered `tools/list` is the primary mechanism; the call-time
   check is defense-in-depth.**
   - **Primary — filtered listing.** `tools/list` is filtered by the tenant's
     ERP capabilities, so an agent **literally never receives** a tool its ERP
     does not support — it cannot call what it cannot see. This holds in
     **both** deployment shapes: mono-tenant filters once at boot (the einvoice
     pattern); multi-tenant filters per request, which is possible because the
     server is authenticated and the `tenantId` is present on `tools/list` too
     (even stateless). There is **no superset catalog** exposed to agents.
   - **Defense-in-depth — call-time fast-fail.** `tools/call` still revalidates
     the capability and fails with a structured `UNSUPPORTED_CAPABILITY`
     (machine-readable `code` + `context.requires` + `context.erpType` +
     `recovery`). This is a safety net for leaks or unauthenticated discovery —
     **not** the everyday mechanism.
   - The same capability manifest drives both the listing filter and the
     call-time check.
   - _Implementation note:_ the current `buildMultiTenantHandlersMap`
     (`src/client.ts:122`) registers a **static** tool list and only resolves
     the adapter per tenant **at call time**. To honor the primary mechanism,
     the **listing** must become tenant-resolved as well, not just the handlers.
   - _Cache note:_ because one endpoint serves different lists per token,
     `tools/list` must be cached **per tenant/auth**: `cacheScope: private` +
     short TTL (2026-07-28 `ttlMs`/`cacheScope`), `Vary: Authorization` at the
     HTTP/gateway layer, and a `capabilityVersion` to invalidate. Never cache it
     shared.

4. **`erp.capabilities_describe` read-only tool** (optionally mirrored as an
   `erp://tenant/capabilities` resource). With the listing already filtered, the
   agent's _tool presence_ is correct; `capabilities_describe` adds the
   finer-grained truth the tool list cannot carry — which **fields** are
   supported, missing tenant configuration, capability version. Output is a
   strict schema: `erpType`, `supportedTools`, `supportedCapabilities`,
   `supportedFields`, `missingConfiguration`, `capabilityVersion`. A tool is
   preferred over a resource because resources are host/app-driven and less
   reliable for an LLM.

5. **`erpType` stays out of write inputs.** It is derived from the authenticated
   tenant, returned in the _result_ (not asked in the input). Never expose
   native and normalized tools for the same action simultaneously — the model
   will gravitate to the more specific one.

6. **Best-of-breed is a later phase.** Today we normalize the _common core of
   what real ERPs already do_. The richer "superset of the best capability of
   each ERP" interface is deferred to the future own-ERP phase. "We normalize
   anyway" — heterogeneity is expressed through tool/capability availability,
   not by falling back to ERP-specific surfaces.

7. **Write semantics — single tool with a required `mode`.** Each write action
   is ONE tool (`customer_create`) taking a **required**
   `mode: "preview" | "commit"` (no default — fast-fail if absent). `preview`
   validates inputs + capabilities and echoes the resolved native payload
   **without writing**; `commit` performs the write. The result **always**
   carries `committed: true|false` (never a fake `nativeId` on preview). Chosen
   over two tools (surface bloat under capability gating + `previewId` state in
   stateless) and over `dry_run: boolean` (which lets the LLM forget to flip it
   and believe it wrote). Trade-off accepted: the single tool is destructive
   (`readOnlyHint: false` even for `mode: "preview"`, so a host may still
   gate/confirm it) — hence the mandatory `committed: false` on preview as the
   unambiguous signal. **No `idempotencyKey` in the MVP**: neither ERPNext nor
   Dolibarr offers native idempotency, so accepting a key we do not honor would
   mislead the agent (deferred — see below).

## AX alignment

The model above is chosen to satisfy the project's AX principles:

- **Machine-readable errors**: `UNSUPPORTED_CAPABILITY` carries `code` +
  `context` + `recovery`, not prose. (Improves on `mcp-erpnext`, which flattens
  ERPNext `exc_type` into a string and loses the structured code.)
- **Fast-fail early**: capability + input validation at the boundary, before any
  HTTP write.
- **Explicit over implicit / no silent failures**: an unsupported request fails
  loudly and structured; it is never silently ignored.
- **Safe defaults**: writes are opt-in and previewable via the mandatory
  `mode: "preview" | "commit"`.

## Field normalization (decided)

**Option (b): common core + a few _normalized_ optional fields.** No
`native: {}` escape hatch in the default surface (it breaks portability and
invites invented fields). Optional fields are normalized names mapped to each
ERP, e.g. Dolibarr `code_client` → `externalRef`, `tva_intra` → `taxId`.

**A normalized field may be capability-gated per ERP.** When a field maps
cleanly on one ERP but not the other, it is a _supported field_ on the first and
absent on the second — surfaced through `capabilities_describe.supportedFields`,
not through a divergent schema. Example: `externalRef` maps to Dolibarr
`code_client` but ERPNext has **no reliable external-ref field** (the `name` is
`autoname`-driven by Frappe settings), so `externalRef` is **unsupported on
ERPNext** by default (would require a tenant-configured custom field).

**ERP-required fields without a cross-ERP equivalent → per-tenant connection
defaults.** These are **not** in the normalized schema; they are explicit
defaults on `ErpConnection`, injected by the ERPNext adapter, never asked of the
agent. Two distinct cases (verified against the ERPNext DocTypes):

- _Actually required_ — ERPNext `Item` requires `item_group` and `stock_uom`. So
  `defaultItemGroup` is **mandatory** tenant config, and `defaultStockUom` is
  required whenever the agent omits `uom`. Missing → `MISSING_REQUIRED_CONFIG`.
- _Not required, but useful_ — ERPNext `Customer` only requires `customer_name`
  and `customer_type`; `customer_group` / `territory` are **not** `reqd`. So
  `defaultCustomerGroup` / `defaultTerritory` are **optional** tenant defaults —
  the customer create must **not** be blocked on them.

(Adds fields to `src/connection.ts`.)

## MVP scope (this iteration)

Two write tools, both ERPs, each with the required `mode: "preview" | "commit"`:

**`customer_create`** (business party)

| Normalized field                | Required          | ERPNext `Customer`                        | Dolibarr `thirdparty`                                   |
| ------------------------------- | ----------------- | ----------------------------------------- | ------------------------------------------------------- |
| `name`                          | yes               | `customer_name`                           | `name`                                                  |
| `kind`: `company`\|`individual` | default `company` | `customer_type` (`Company`\|`Individual`) | `client: 1` + `typent_id` (`TE_PRIVATE` for individual) |
| `taxId`                         | no                | `tax_id`                                  | `tva_intra`                                             |
| `externalRef`                   | no                | _unsupported_ (autoname)                  | `code_client`                                           |
| `email` / `phone`               | no                | `email_id` / `mobile_no`                  | `email`* / `phone`                                      |
| `currency`                      | no                | `default_currency`                        | `multicurrency_code`                                    |
| `country`                       | no                | (address)                                 | `country_id`                                            |

\* Dolibarr `email` becomes required if `SOCIETE_EMAIL_MANDATORY` is enabled on
the tenant → surfaced via `capabilities_describe` / `MISSING_REQUIRED_FIELD`.
ERPNext `customer_type` also accepts `Partnership`, intentionally out of the
normalized `kind` surface for now.

**`product_create`** (catalog item)

| Normalized field             | Required          | ERPNext `Item`                         | Dolibarr `product`                  |
| ---------------------------- | ----------------- | -------------------------------------- | ----------------------------------- |
| `name`                       | yes               | `item_name`                            | `label`                             |
| `sku`                        | **yes**           | `item_code`                            | `ref`                               |
| `kind`: `product`\|`service` | default `product` | `is_stock_item` (+ `is_sales_item: 1`) | `type` (`0`=product, `1`=service)   |
| `unitPrice`                  | no                | `standard_rate`                        | `price` (+ `price_base_type: "HT"`) |
| `uom`                        | no                | `stock_uom` (else `defaultStockUom`)   | (n/a)                               |

`kind: service` means a **non-stock sellable item** (`is_stock_item: 0` +
`is_sales_item: 1`) — not "any non-stock item". `unitPrice` is in the tenant's
base currency; **no `currency` field** on `product_create` (neither ERP carries
it on the item/product create itself). Dolibarr product type is sent as `type`
on the REST input (it persists as `fk_product_type`).

Supporting infrastructure in scope (required by the two tools): the per-adapter
**capability manifest**, the **per-tenant filtered listing**, the request
**body** on the HTTP layer (write path), **structured write errors**, and
**`erp.capabilities_describe`** — promoted to in-scope, because the conditional
fields above (Dolibarr `email` mandatory flag, ERPNext `externalRef`
unsupported, tenant defaults) make it the mechanism that keeps the surface
non-frustrating for an agent.

Missing/insufficient tenant configuration → structured
`MISSING_REQUIRED_CONFIG`; a field unsupported by the tenant's ERP →
`UNSUPPORTED_FIELD`; both carry `code` + `context` + `recovery`.

API-conformance status: the `kind` mappings and required-field facts above were
fact-checked against the live ERPNext DocTypes and Dolibarr API classes (Codex
VRAI/FAUX/NUANCE pass, 2026-06-30). They must be re-verified against the
tenant's ERP **version** at implementation time.

## Deferred (not in this iteration)

- Best-of-breed superset interface (own-ERP phase).
- **Idempotency** — `idempotencyKey` + durable dedup (keyed by
  `tenant + tool + key + payload-hash`, shared store for stateless
  multi-instance). Removed from the MVP because no native ERP support;
  reintroduce only when backed by a real dedup store.
- `update` / `submit` / `cancel` / `delete` write tools and lifecycle semantics.
- `supplier_create` (shows the doctype-vs-role-flag divergence).
- `Partnership` customer kind; ERPNext `externalRef` via configured custom
  field.

## References

- `src/adapter.ts` — `ErpAdapter`, `ErpToolDefinition`, annotations.
- `src/client.ts` — `ErpToolsClient`, `buildMultiTenantHandlersMap` (per-request
  tenant→adapter resolution).
- `src/normalized-adapter.ts` — Wave 3 normalized read layer;
  `NormalizedPayload` already carries `availableActions` / `lifecycleState` (the
  read-side notion of "what this ERP can do"). Writes extend this contract
  rather than restarting in native.
- `docs/architecture/erpnext-dolibarr-api-comparison.md` — native API
  divergence.
- `docs/migration-mcp-spec-2026-07-28.md` — stateless transport context.
- `mcp-einvoice` — `capabilities`/`requires` precedent (gating at the tool level
  only; static schema; native translation delegated to the adapter).
