# Migration Plan: MCP Specification 2026-07-28

Analysis done 2026-05-23. Target spec validation window: 2026-05-21 →
2026-07-28. Cross-reference: upstream plan in
`mcp-server/docs/migration/2026-07-28.md` and consumer-side plan in
`mcp-erpnext/docs/migration-mcp-spec-2026-07-28.md`.

## TL;DR

`@casys/mcp-erp` is at v0.1 adapter stage and is **mostly insulated** from the
MCP wire. The adapter contract (`ErpAdapter`, `ErpToolDefinition`,
`ErpToolCallResult`) sits one layer above the protocol, and `ErpToolsClient`
projects it into `@casys/mcp-server`.

However, **v0.1 is the right window to evolve the contract** so it can carry the
new spec's primitives (Tasks handles, MCP Apps UI metadata, cache hints,
cancellation) through to consumers without a future breaking change. This
document captures those contract changes.

| Item                                                  | Direction   | Effort |
| ----------------------------------------------------- | ----------- | ------ |
| Bump `@casys/mcp-server` to the 2026-07-28 release    | required    | S      |
| Add `AbortSignal` to `ErpToolCallContext`             | done        | S      |
| Add `_meta` field to `ErpToolDefinition` (cache + ui) | done        | S      |
| Add task-handle variant to `ErpToolCallResult`        | recommended | M      |
| Audit Sampling / Roots / Logging in adapters          | required    | S      |
| Validate stdio/http server entrypoint                 | required    | S      |

## Context

The 2026-07-28 MCP spec is the most invasive revision since the protocol's first
release. Highlights:

- **Stateless core** — no more `initialize` handshake, no more `Mcp-Session-Id`
  header. Every request carries `_meta.protocolVersion`.
- **Multi Round-Trip Requests** replace persistent server→client SSE.
- **Tasks extension** (official) for long-running operations.
- **MCP Apps** (official, SEP-1865) for embedded interactive UIs.
- **Cache hints** (`ttlMs`, `cacheScope`) on list responses.
- **Routing headers** (`Mcp-Method`, `Mcp-Name`) for stateless dispatch.
- **Auth hardening** — `iss` validation per RFC 9207, `application_type` at DCR.
- **Deprecations** (12-month window): Roots, Sampling, Logging.

Upstream impact analysis: `mcp-server/docs/migration/2026-07-28.md`.

## Why mcp-erp is mostly insulated

The MCP wire-format concerns live in `@casys/mcp-server`. `@casys/mcp-erp`
exposes its own type-system (`ErpAdapter` etc., `src/adapter.ts:56–69`) that
consumers project into the MCP wire at boundary time. Consequences:

1. **Stateless core** — `ErpAdapter` is already declared stateless from the
   platform's POV (`src/adapter.ts:6–9`). Nothing to change.
2. **Routing headers and protocol error codes** — live below the adapter
   contract.
3. **MCP Apps protocol** — handled in `@casys/mcp-server` and `@casys/mcp-view`.
   The adapter only needs to _declare_ UI resources in tool metadata, not
   implement the postMessage protocol.
4. **Auth** — `ErpConnection` (`src/connection.ts`) is opaque to the spec. RFC
   9207 / DCR concerns are upstream.

## Required Work

### 1. Dependency bumps (effort: S)

`deno.json`:

```diff
- "@casys/mcp-server": "jsr:@casys/mcp-server@^0.17.2",
+ "@casys/mcp-server": "jsr:@casys/mcp-server@^X.Y.0",  // 2026-07-28-ready release
```

Run `deno task test` and `deno task check` after the bump. Failures should
surface around `server.ts`, `src/mcp-app.ts`, and `src/client.ts` if the
`@casys/mcp-server` API has shifted.

### 2. Add `AbortSignal` to `ErpToolCallContext` (done)

The 2026-07-28 spec formalises cancellation across the new Multi Round-Trip
Request flow. The adapter contract exposes an optional `AbortSignal` so the MCP
server/runtime layer can cancel outbound ERP HTTP calls.

`src/adapter.ts:37–42`:

```diff
 export interface ErpToolCallContext {
   readonly tenantId: string;
   readonly actorSubject: string | null;
+  /** Cancellation signal, surfaced from the MCP server/runtime layer. */
+  readonly signal?: AbortSignal;
 }
```

Update both reference adapters (`src/adapters/erpnext.ts`,
`src/adapters/dolibarr.ts`) to honour `ctx.signal` in their HTTP calls
(`fetch(url, { signal: ctx.signal })`). This is implemented across the current
ERPNext and Dolibarr read-only HTTP tools.

Current `@casys/mcp-server` JSR handlers only receive tool args, so
`ErpToolsClient` accepts an optional constructor-level `signal`. Automatic
per-request propagation from `request.signal` should be wired during the
2026-07-28-ready `@casys/mcp-server` bump, once the handler context is available
in the published package.

### 3. Audit deprecated capabilities (effort: S)

12-month deprecation window starting 2026-07-28 for **Roots**, **Sampling**,
**Logging**. Scaffold adapters likely do not use any of these, but confirm:

```bash
grep -rn "sampling\|createMessage\|roots\|setLevel\|LoggingMessageNotification" src/ server.ts
```

If anything turns up, plan migration (server-side LLM, plain `console.log`, or
removal). For pure ERP CRUD adapters this should be a no-op.

### 4. Validate stdio/http server entrypoint (effort: S)

`server.ts` and `src/mcp-app.ts` are the package-owned MCP server surfaces. What
needs validation:

- stdio mode starts and registers the adapter tools;
- HTTP mode serves `/mcp` and exposes structured tool results;
- `erpToolErrorMapper` still converts typed adapter/API errors into MCP tool
  errors;
- future MCP Apps viewer resources are registered through `@casys/mcp-server`,
  not adapter internals.

Action: run MCP Inspector against `deno task serve -- --config ...`.

## Recommended Work — Contract Evolution

These are non-breaking additions to the v0.1 contract. They should land before
consumers (erp-platform, future migrated mcp-erpnext) hit a real need, so they
never have to bypass `mcp-erp` to get spec-native MCP features through.

### 5. Add `_meta` field to `ErpToolDefinition` (done)

The 2026-07-28 spec puts cache hints and UI references on tool metadata.
`ErpToolDefinition` now carries `outputSchema`, `annotations`, and `_meta`, and
`ErpToolsClient` preserves those fields when registering `MCPTool`s with
`@casys/mcp-server`.

```diff
 export interface ErpToolDefinition {
   name: string;
   description: string;
   inputSchema: Record<string, unknown>;
   outputSchema?: Record<string, unknown>;
   annotations?: ErpToolAnnotations;
+  /**
+   * Spec-aligned metadata for the MCP boundary. Forward-compatible:
+   * unknown fields are passed through verbatim by consumers.
+   */
+  _meta?: {
+    /** Cache hints emitted on `tools/list`. */
+    cache?: {
+      ttlMs?: number;
+      cacheScope?: "global" | "tenant" | "session";
+    };
+    /** MCP Apps UI resource link, per SEP-1865. */
+    ui?: {
+      resourceUri: string;
+      visibility?: ReadonlyArray<"model" | "app">;
+    };
+    /** Free-form passthrough for spec fields landed after this version. */
+    [key: string]: unknown;
+  };
 }
```

Reference candidates for cache hints once adapters grow real tools:

- `erpnext.doctype_list` — TTL 5 min, scope `global`
- `erpnext.chart_of_accounts` — TTL 5 min, scope `tenant`
- `dolibarr.entrepot_list` — TTL 5 min, scope `tenant`

Consumers project this into `_meta.ui` and `_meta.cache` shapes that
`@casys/mcp-server` will read on `tools/list`.

### 6. Add task-handle variant to `ErpToolCallResult` (effort: M)

The Tasks extension allows a `tools/call` to answer with a task handle instead
of a final result. To let adapter authors opt in cleanly:

```diff
-export interface ErpToolCallResult {
-  content: unknown;
-  summary?: string;
-}
+export type ErpToolCallResult = ErpToolCallSyncResult | ErpToolCallTaskResult;
+
+export interface ErpToolCallSyncResult {
+  readonly kind?: "sync";
+  content: unknown;
+  summary?: string;
+}
+
+export interface ErpToolCallTaskResult {
+  readonly kind: "task";
+  /** Opaque handle returned to the consumer; the consumer surfaces it as `_meta.task`. */
+  readonly taskId: string;
+  /** Adapter-owned poll/wait function. Consumer chooses how to drive it. */
+  readonly poll: (signal?: AbortSignal) => Promise<ErpToolCallSyncResult>;
+}
```

Wait for the Tasks API surface to land in `@casys/mcp-server` before freezing
the field names. Tracked in upstream Track B.

**Candidate ERP operations** that warrant task handles:

- Bulk invoice generation
- Stock revaluation runs
- Period-close / closing-entry operations
- Long aggregation queries (revenue trends over multi-year history)

## Out of Scope

- Inventing a private cache protocol. We piggyback on the spec's `ttlMs` /
  `cacheScope`.
- Re-implementing MCP transport. It stays in `@casys/mcp-server`.
- Tracking `application_type` at the DCR level. ERP connections use API
  key/secret, not DCR. Upstream concern only.

## References

- Upstream framework plan: `mcp-server/docs/migration/2026-07-28.md`
- Consumer-side plan: `mcp-erpnext/docs/migration-mcp-spec-2026-07-28.md`
- MCP 2026-07-28 RC:
  https://blog.modelcontextprotocol.io/posts/2026-07-28-release-candidate/
- MCP Apps spec (SEP-1865):
  https://github.com/modelcontextprotocol/ext-apps/blob/main/specification/2026-01-26/apps.mdx
- Runtime boundaries: `docs/architecture/runtime-boundaries-and-mcp-server.md`
