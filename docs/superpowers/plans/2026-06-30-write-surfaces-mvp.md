# Write Surfaces MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the first write (mutation) tools to `@casys/mcp-erp` — `erp.customer_create` and `erp.product_create` — on both ERPNext and Dolibarr, behind a normalized surface with a required `preview`/`commit` mode and structured errors.

**Architecture:** Normalized write tools live on the Wave 3 `NormalizedAdapter` (`erp.*`, dispatched by `erpType`). They map normalized fields → native fields, gate per-ERP unsupported fields, and call **internal** native create tools (`erpnext.*_create` / `dolibarr.*_create`) that are present in each adapter's `callTool` dispatch but **not** listed in `tools()` — so only the normalized surface is exposed. Native creates inject tenant defaults from `ErpConnection`, handle `mode` (preview = resolve payload without POST; commit = POST), and return `{ committed, nativeId?, resolved }`.

**Tech Stack:** Deno, TypeScript, `@casys/mcp-server`. No external test framework — `Deno.test` + `globalThis.fetch` stub.

## Global Constraints

- Runtime: Deno. Tests run with `deno task test` (= `deno test --allow-all`). Auto-discovers `*_test.ts`.
- No environment variables, no globals in adapters: credentials and tenant defaults come only from the explicit `ErpConnection`.
- Tool naming: normalized surface uses the `erp.` namespace (`erp.customer_create`). Native creates use `<erpType>.<entity>_create` and are **not** added to `tools()` (internal-only).
- Write result invariant: every write returns `committed: true|false`; preview NEVER returns a real `nativeId`.
- Mode is **required** (no default) — a missing/invalid `mode` is a fast-fail structured error.
- Structured errors only: `code` + `context` + `recovery`, never prose in `code`. Use `WriteError` (this plan) on the write path.
- `additionalProperties: false` on every tool `inputSchema`.
- No `idempotencyKey`, no `country` field, no tool-level per-tenant listing filter in this iteration (see "Deferred" at end). `docs/architecture/write-surfaces-and-capability-gating.md` is the design source of truth.
- API-conformance items flagged `⚠️ CODEX` must be verified against the live ERP API during the Codex VRAI/FAUX/NUANCE review of the diff before merge.

## Known design tension: `erpType` in input

The design doc states "`erpType` stays out of write inputs (derived from the
authenticated tenant)". The Wave 3 `NormalizedAdapter` wraps *both* ERPs and
dispatches by `args.erpType` — the existing `erp.*` **read** tools already take
`erpType` as a required input. To stay consistent with that code, the MVP write
tools also take `erpType` as input. Deriving `erpType` from the tenant belongs to
the **multi-tenant integration of the normalized layer** (resolving a single-ERP
adapter per tenant and dropping `erpType` from the schema) — deferred together
with the per-tenant filtered listing. This is an accepted, documented gap for the
MVP, not an oversight.

---

## File Structure

- Create: `src/write.ts` — write primitives: `WriteMode`, `parseWriteMode`, `WriteError`, `WriteResult`, `WRITE_CAPABILITIES`, `assertFieldSupported`. No imports from adapters (avoids cycles).
- Create: `src/write_test.ts` — unit tests for the primitives.
- Modify: `src/error-mapper.ts` — serialize `WriteError` to structured JSON.
- Modify: `src/connection.ts` — add optional tenant-default fields to the `erpnext` variant.
- Modify: `src/adapters/erpnext.ts` — extend `request` for a body, add `create`, add internal `erpnext.customer_create` / `erpnext.item_create` dispatch branches.
- Modify: `src/adapters/dolibarr.ts` — extend `request` for a body, add `create` methods, add `readRequiredString`, add internal `dolibarr.thirdparty_create` / `dolibarr.product_create` branches.
- Modify: `src/normalized-adapter.ts` — add `erp.customer_create`, `erp.product_create`, `erp.capabilities_describe` tools + dispatch + field mapping + gating.
- Modify (tests): `src/adapters/erpnext_test.ts`, `src/adapters/dolibarr_test.ts`, `src/normalized-adapter_test.ts`.

---

## Task 1: Write primitives (`src/write.ts`)

**Files:**
- Create: `src/write.ts`
- Test: `src/write_test.ts`

**Interfaces:**
- Consumes: `ErpType` from `./connection.ts`.
- Produces:
  - `type WriteMode = "preview" | "commit"`
  - `class WriteError extends Error { code: string; context: Record<string, unknown>; recovery: string }` (constructor `(code, context, recovery)`)
  - `function parseWriteMode(args: Record<string, unknown>): WriteMode` — throws `WriteError("INVALID_MODE", …)` if absent/invalid
  - `interface WriteResult { committed: boolean; resolved: Record<string, unknown>; nativeId?: string }`
  - `const WRITE_CAPABILITIES: Record<ErpType, { tools: readonly string[]; unsupportedFields: readonly string[] }>`
  - `function assertFieldSupported(erpType: ErpType, field: string, args: Record<string, unknown>): void` — throws `WriteError("UNSUPPORTED_FIELD", …)` when the field is present but unsupported

- [ ] **Step 1: Write the failing test**

```typescript
// src/write_test.ts
import { assertEquals, assertThrows } from "@std/assert";
import {
  assertFieldSupported,
  parseWriteMode,
  WriteError,
  WRITE_CAPABILITIES,
} from "./write.ts";

Deno.test("parseWriteMode — accepts preview and commit", () => {
  assertEquals(parseWriteMode({ mode: "preview" }), "preview");
  assertEquals(parseWriteMode({ mode: "commit" }), "commit");
});

Deno.test("parseWriteMode — missing mode throws INVALID_MODE", () => {
  const err = assertThrows(() => parseWriteMode({}), WriteError);
  assertEquals(err.code, "INVALID_MODE");
});

Deno.test("parseWriteMode — invalid mode throws INVALID_MODE", () => {
  const err = assertThrows(() => parseWriteMode({ mode: "dry" }), WriteError);
  assertEquals(err.code, "INVALID_MODE");
});

Deno.test("assertFieldSupported — unsupported field present throws", () => {
  const err = assertThrows(
    () => assertFieldSupported("erpnext", "externalRef", { externalRef: "X" }),
    WriteError,
  );
  assertEquals(err.code, "UNSUPPORTED_FIELD");
});

Deno.test("assertFieldSupported — unsupported field absent is a no-op", () => {
  assertFieldSupported("erpnext", "externalRef", {});
});

Deno.test("WRITE_CAPABILITIES — dolibarr supports externalRef, erpnext does not", () => {
  assertEquals(WRITE_CAPABILITIES.erpnext.unsupportedFields.includes("externalRef"), true);
  assertEquals(WRITE_CAPABILITIES.dolibarr.unsupportedFields.includes("externalRef"), false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `deno test src/write_test.ts`
Expected: FAIL — module `./write.ts` not found.

- [ ] **Step 3: Write the implementation**

```typescript
// src/write.ts
/**
 * Write-path primitives shared by native adapters and the normalized layer.
 *
 * Kept free of adapter/connection-provider imports to avoid import cycles:
 * native adapters import this module, so it must not import them back.
 *
 * @module @casys/mcp-erp/write
 */

import type { ErpType } from "./connection.ts";

/** Write execution mode. Required on every write tool — no default. */
export type WriteMode = "preview" | "commit";

/**
 * Structured write-path error. AX "Machine-Readable Errors": typed `code`,
 * parseable `context`, operator `recovery`. Serialized to JSON by error-mapper.
 */
export class WriteError extends Error {
  override readonly name = "WriteError";
  constructor(
    public readonly code: string,
    public readonly context: Record<string, unknown>,
    public readonly recovery: string,
  ) {
    super(code);
  }
}

/** Resolved native payload + commit outcome returned by a native create. */
export interface WriteResult {
  committed: boolean;
  resolved: Record<string, unknown>;
  nativeId?: string;
}

/** Parse the required `mode` arg. Fast-fail with a structured error. */
export function parseWriteMode(args: Record<string, unknown>): WriteMode {
  const mode = args.mode;
  if (mode === "preview" || mode === "commit") return mode;
  throw new WriteError(
    "INVALID_MODE",
    { mode },
    "Pass mode: \"preview\" (validate without writing) or \"commit\" (write).",
  );
}

/** Per-ERP write capability manifest (MVP scope). */
export const WRITE_CAPABILITIES: Record<
  ErpType,
  { tools: readonly string[]; unsupportedFields: readonly string[] }
> = {
  erpnext: {
    tools: ["erp.customer_create", "erp.product_create"],
    // ERPNext `name` is autoname-driven — no reliable external-ref field.
    unsupportedFields: ["externalRef"],
  },
  dolibarr: {
    tools: ["erp.customer_create", "erp.product_create"],
    unsupportedFields: [],
  },
};

/** Throw UNSUPPORTED_FIELD when a present arg is not supported by the ERP. */
export function assertFieldSupported(
  erpType: ErpType,
  field: string,
  args: Record<string, unknown>,
): void {
  if (
    args[field] !== undefined &&
    WRITE_CAPABILITIES[erpType].unsupportedFields.includes(field)
  ) {
    throw new WriteError(
      "UNSUPPORTED_FIELD",
      { field, erpType },
      `Field '${field}' is not supported on ${erpType}; omit it.`,
    );
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `deno test src/write_test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/write.ts src/write_test.ts
git commit -m "feat(write): add write-path primitives (mode, WriteError, capability manifest)"
```

---

## Task 2: Map `WriteError` in the error mapper

**Files:**
- Modify: `src/error-mapper.ts`
- Test: `src/error-mapper_test.ts` (extend if present; else create)

**Interfaces:**
- Consumes: `WriteError` from `./write.ts`; `NormalizedError` from `./normalized.ts`.
- Produces: error-mapper returns a JSON string `{ code, context, recovery }` for both `WriteError` and `NormalizedError`.

- [ ] **Step 1: Write the failing test**

```typescript
// src/error-mapper_test.ts  (add this test; create the file with imports if absent)
import { assertEquals } from "@std/assert";
import { erpToolErrorMapper } from "./error-mapper.ts";
import { WriteError } from "./write.ts";
import { NormalizedError } from "./normalized.ts";

Deno.test("erpToolErrorMapper — serializes WriteError to structured JSON", () => {
  const out = erpToolErrorMapper(
    new WriteError("INVALID_MODE", { mode: "dry" }, "Pass preview or commit."),
    "erp.customer_create",
  );
  assertEquals(typeof out, "string");
  const parsed = JSON.parse(out as string);
  assertEquals(parsed.code, "INVALID_MODE");
  assertEquals(parsed.context.mode, "dry");
  assertEquals(parsed.recovery, "Pass preview or commit.");
});

Deno.test("erpToolErrorMapper — serializes NormalizedError to structured JSON", () => {
  const out = erpToolErrorMapper(
    new NormalizedError("UNKNOWN_ERP_TYPE", "bad", { erpType: "sap" }, "Use erpnext or dolibarr."),
    "erp.customer_create",
  );
  const parsed = JSON.parse(out as string);
  assertEquals(parsed.code, "UNKNOWN_ERP_TYPE");
  assertEquals(parsed.context.erpType, "sap");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `deno test src/error-mapper_test.ts`
Expected: FAIL — neither `WriteError` nor `NormalizedError` handled, mapper returns `null`.

- [ ] **Step 3: Add the branches**

In `src/error-mapper.ts`, add the imports and branches (reuse the existing redaction helpers):

```typescript
import { WriteError } from "./write.ts";
import { NormalizedError } from "./normalized.ts";
```

```typescript
// inside erpToolErrorMapper, before the FrappeApiError/DolibarrApiError branch:
  if (error instanceof WriteError || error instanceof NormalizedError) {
    return JSON.stringify({
      code: redactSensitiveText(error.code),
      context: redactSensitiveValue(error.context),
      recovery: redactSensitiveText(error.recovery),
    });
  }
```

> Note: confirm `NormalizedError` exposes `code`, `context`, `recovery` public fields (it does, per `src/normalized.ts`). This also upgrades Wave 3 *read* errors to structured JSON.

- [ ] **Step 4: Run test to verify it passes**

Run: `deno test src/error-mapper_test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/error-mapper.ts src/error-mapper_test.ts
git commit -m "feat(errors): map WriteError to structured JSON tool errors"
```

---

## Task 3: ERPNext tenant defaults on the connection

**Files:**
- Modify: `src/connection.ts`

**Interfaces:**
- Produces: the `erpnext` variant of `ErpConnection` gains optional fields
  `defaultItemGroup?: string`, `defaultStockUom?: string`,
  `defaultCustomerGroup?: string`, `defaultTerritory?: string`,
  `defaultIndividualTypentId?: number` (Dolibarr-side individual mapping; see Task 7).

- [ ] **Step 1: Write the failing test**

```typescript
// src/connection_test.ts  (add this test; create file with import if absent)
import { assertEquals } from "@std/assert";
import type { ErpConnection } from "./connection.ts";

Deno.test("ErpConnection — erpnext variant accepts tenant defaults", () => {
  const conn: ErpConnection = {
    erpType: "erpnext",
    apiUrl: "https://erp.example.com",
    apiKey: "k",
    apiSecret: "s",
    sandbox: true,
    defaultItemGroup: "All Item Groups",
    defaultStockUom: "Nos",
    defaultCustomerGroup: "All Customer Groups",
    defaultTerritory: "All Territories",
  };
  assertEquals(conn.erpType === "erpnext" ? conn.defaultItemGroup : undefined, "All Item Groups");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `deno test src/connection_test.ts`
Expected: FAIL — `defaultItemGroup` not assignable.

- [ ] **Step 3: Add the fields**

In `src/connection.ts`, extend the `erpnext` member of the union:

```typescript
  | {
    erpType: "erpnext";
    /** Frappe site URL, e.g. `https://erp.example.com` (no trailing slash). */
    apiUrl: string;
    /** ERPNext API key (Frappe `api_key`). */
    apiKey: string;
    /** ERPNext API secret (Frappe `api_secret`). */
    apiSecret: string;
    sandbox: boolean;
    /** Default Item Group injected on Item create (ERPNext requires it). */
    defaultItemGroup?: string;
    /** Default stock UOM injected on Item create when `uom` is omitted. */
    defaultStockUom?: string;
    /** Optional default Customer Group injected on Customer create. */
    defaultCustomerGroup?: string;
    /** Optional default Territory injected on Customer create. */
    defaultTerritory?: string;
  }
```

And the `dolibarr` member gains the individual-mapping default:

```typescript
  | {
    erpType: "dolibarr";
    /** Dolibarr API URL, e.g. `https://dolibarr.example.com/api/index.php`. */
    apiUrl: string;
    /** `DOLAPIKEY` header value. */
    apiKey: string;
    sandbox: boolean;
    /** typent_id mapped to TE_PRIVATE for `kind: "individual"` (install-specific). */
    defaultIndividualTypentId?: number;
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `deno test src/connection_test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/connection.ts src/connection_test.ts
git commit -m "feat(connection): add ERPNext/Dolibarr write tenant defaults"
```

---

## Task 4: ERPNext HTTP write body + `create` method

**Files:**
- Modify: `src/adapters/erpnext.ts`
- Test: `src/adapters/erpnext_test.ts`

**Interfaces:**
- Consumes: existing `FrappeRestClient.request`, `FrappeRequestOptions`, `FrappeDocResponse`, `isRecord`, `FrappeApiError`.
- Produces: `FrappeRestClient.create<T extends FrappeDoc>(doctype: string, data: Record<string, unknown>, requestOptions?: FrappeRequestOptions): Promise<T>` (POST `/api/resource/:doctype`, returns the created doc from `result.data`). `FrappeRequestOptions` gains `body?: string`.

- [ ] **Step 1: Write the failing test**

The existing suite mocks `globalThis.fetch`. Use the same `mockFetch`/`createTestAdapter` helpers already in `erpnext_test.ts`; extend the captured shape with `body`. Add:

```typescript
// src/adapters/erpnext_test.ts — extend CapturedFetch with `body?: string`
// in mockFetch: body: typeof init?.body === "string" ? init.body : undefined,

Deno.test("FrappeRestClient.create — POSTs the doc body with content-type", async () => {
  const captured: CapturedFetch[] = [];
  const restore = mockFetch(
    { status: 200, body: { data: { name: "CUST-0001", customer_name: "Acme" } } },
    captured,
  );
  try {
    const adapter = createTestAdapter();
    const result = await adapter.callTool(
      "erpnext.customer_create",
      { mode: "commit", customer_name: "Acme" },
      { tenantId: "t", actorSubject: null },
    );
    assertEquals(captured[0].method, "POST");
    assertEquals(captured[0].url.pathname, "/api/resource/Customer");
    assertEquals(captured[0].headers.get("content-type"), "application/json");
    assertEquals(JSON.parse(captured[0].body as string).customer_name, "Acme");
    assertEquals((result.content as { nativeId: string }).nativeId, "CUST-0001");
  } finally {
    restore();
  }
});
```

(This test also covers Task 5's `erpnext.customer_create`; implement `create` here, then the branch in Task 5. Run it green only after Task 5. For Task 4 in isolation, first assert just the `create` method via a tiny internal call — but since `create` has no caller yet, fold the green checkpoint into Task 5 and commit `create` together with the customer branch. Keep this task's commit limited to the `request`/`create` changes.)

- [ ] **Step 2: Extend `request` to send a body**

In `FrappeRestClient.request`, replace the inline `headers` object with a mutable map and pass the body:

```typescript
    const headers: Record<string, string> = {
      "accept": "application/json",
      "authorization": this.authHeader,
    };
    if (options.body !== undefined) {
      headers["content-type"] = "application/json";
    }
    response = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers,
      body: options.body,
      signal: options.signal,
    });
```

Add `body?: string;` to the `FrappeRequestOptions` interface.

- [ ] **Step 3: Add the `create` method**

Next to `get`, add:

```typescript
  async create<T extends FrappeDoc>(
    doctype: string,
    data: Record<string, unknown>,
    requestOptions: FrappeRequestOptions = {},
  ): Promise<T> {
    const resourcePath = `/api/resource/${encodeURIComponent(doctype)}`;
    const result = await this.request<FrappeDocResponse<T>>(
      "POST",
      resourcePath,
      resourcePath,
      { ...requestOptions, body: JSON.stringify(data) },
    );
    if (!result || !isRecord(result.data)) {
      throw new FrappeApiError(
        `ERPNext POST ${resourcePath} failed: malformed response: data must be an object`,
        200,
        result,
      );
    }
    return result.data;
  }
```

> ⚠️ CODEX: confirm Frappe REST `POST /api/resource/:doctype` accepts the document fields as a flat JSON body (not wrapped in `{ data: … }`) and returns `{ data: <doc> }`.

- [ ] **Step 4: Type-check (no green test yet — caller added in Task 5)**

Run: `deno check src/adapters/erpnext.ts`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/adapters/erpnext.ts
git commit -m "feat(erpnext): support request body + add create() to FrappeRestClient"
```

---

## Task 5: Internal `erpnext.customer_create`

**Files:**
- Modify: `src/adapters/erpnext.ts`
- Test: `src/adapters/erpnext_test.ts`

**Interfaces:**
- Consumes: `parseWriteMode` from `../write.ts`, `client.create`, `readRequiredString`, `readOptionalString`, `readOptionalStringArgument`, `connection`.
- Produces: `callTool` handles `"erpnext.customer_create"` (NOT added to `TOOLS`). Native args: `mode` (req), `customer_name` (req), `customer_type?`, `tax_id?`, `email_id?`, `mobile_no?`, `default_currency?`. Returns `content: WriteResult & { doctype: "Customer" }`.

- [ ] **Step 1: Write the failing tests**

```typescript
Deno.test("erpnext.customer_create — preview resolves payload without POST", async () => {
  const captured: CapturedFetch[] = [];
  const restore = mockFetch({ status: 200, body: {} }, captured);
  try {
    const adapter = createTestAdapter();
    const r = await adapter.callTool(
      "erpnext.customer_create",
      { mode: "preview", customer_name: "Acme", customer_type: "Company" },
      { tenantId: "t", actorSubject: null },
    );
    assertEquals(captured.length, 0); // no HTTP on preview
    const c = r.content as { committed: boolean; resolved: Record<string, unknown> };
    assertEquals(c.committed, false);
    assertEquals(c.resolved.customer_name, "Acme");
    assertEquals(c.resolved.customer_type, "Company");
  } finally {
    restore();
  }
});

Deno.test("erpnext.customer_create — injects optional customer_group default", async () => {
  const captured: CapturedFetch[] = [];
  const restore = mockFetch(
    { status: 200, body: { data: { name: "CUST-1" } } },
    captured,
  );
  try {
    const adapter = createErpnextAdapter({
      erpType: "erpnext",
      apiUrl: "https://erp.example.com",
      apiKey: "k",
      apiSecret: "s",
      sandbox: true,
      defaultCustomerGroup: "All Customer Groups",
    });
    const r = await adapter.callTool(
      "erpnext.customer_create",
      { mode: "commit", customer_name: "Acme" },
      { tenantId: "t", actorSubject: null },
    );
    assertEquals(JSON.parse(captured[0].body as string).customer_group, "All Customer Groups");
    assertEquals((r.content as { committed: boolean }).committed, true);
    assertEquals((r.content as { nativeId: string }).nativeId, "CUST-1");
  } finally {
    restore();
  }
});
```

(Import `createErpnextAdapter` in the test file if not already imported.)

- [ ] **Step 2: Run to verify failure**

Run: `deno test src/adapters/erpnext_test.ts`
Expected: FAIL — `erpnext.customer_create` hits `UnknownToolError`.

- [ ] **Step 3: Add the dispatch branch**

Add `import { parseWriteMode } from "../write.ts";` near the top of `erpnext.ts`. In `callTool`, before the final `throw new UnknownToolError(...)`:

```typescript
      if (name === "erpnext.customer_create") {
        const mode = parseWriteMode(args);
        const payload: Record<string, unknown> = {
          customer_name: readRequiredString(args, "customer_name"),
          customer_type: readOptionalString(args, "customer_type", "Company"),
        };
        for (const f of ["tax_id", "email_id", "mobile_no", "default_currency"]) {
          const v = readOptionalStringArgument(args, f);
          if (v !== undefined) payload[f] = v;
        }
        if (connection.defaultCustomerGroup) {
          payload.customer_group = connection.defaultCustomerGroup;
        }
        if (connection.defaultTerritory) {
          payload.territory = connection.defaultTerritory;
        }
        if (mode === "preview") {
          return {
            content: { committed: false, doctype: "Customer", resolved: payload },
            summary: "Preview ERPNext Customer create (not written)",
          };
        }
        const created = await client.create("Customer", payload, {
          signal: _ctx.signal,
        });
        const nativeId = typeof created.name === "string" ? created.name : "";
        return {
          content: { committed: true, doctype: "Customer", nativeId, resolved: payload },
          summary: `Created ERPNext Customer ${nativeId}`,
        };
      }
```

- [ ] **Step 4: Run to verify pass**

Run: `deno test src/adapters/erpnext_test.ts`
Expected: PASS (including the Task 4 create test).

- [ ] **Step 5: Commit**

```bash
git add src/adapters/erpnext.ts src/adapters/erpnext_test.ts
git commit -m "feat(erpnext): internal customer_create with preview/commit + tenant defaults"
```

---

## Task 6: Internal `erpnext.item_create`

**Files:**
- Modify: `src/adapters/erpnext.ts`
- Test: `src/adapters/erpnext_test.ts`

**Interfaces:**
- Consumes: same as Task 5 + `connection.defaultItemGroup`, `connection.defaultStockUom`, `WriteError` from `../write.ts`.
- Produces: `callTool` handles `"erpnext.item_create"` (not in `TOOLS`). Native args: `mode` (req), `item_name` (req), `item_code` (req), `is_stock_item?` (default 1), `standard_rate?` (number), `stock_uom?`. Always sets `is_sales_item: 1`. Requires `defaultItemGroup`; requires `stock_uom` or `defaultStockUom`.

- [ ] **Step 1: Write the failing tests**

```typescript
Deno.test("erpnext.item_create — missing defaultItemGroup throws MISSING_REQUIRED_CONFIG", async () => {
  const restore = mockFetch({ status: 200, body: {} }, []);
  try {
    const adapter = createTestAdapter(); // no defaultItemGroup
    const err = await assertRejects(
      () =>
        adapter.callTool(
          "erpnext.item_create",
          { mode: "commit", item_name: "Widget", item_code: "W-1", stock_uom: "Nos" },
          { tenantId: "t", actorSubject: null },
        ),
      WriteError,
    );
    assertEquals(err.code, "MISSING_REQUIRED_CONFIG");
    assertEquals(err.context.field, "item_group");
  } finally {
    restore();
  }
});

Deno.test("erpnext.item_create — commit sends is_sales_item and defaults", async () => {
  const captured: CapturedFetch[] = [];
  const restore = mockFetch({ status: 200, body: { data: { name: "ITEM-1" } } }, captured);
  try {
    const adapter = createErpnextAdapter({
      erpType: "erpnext",
      apiUrl: "https://erp.example.com",
      apiKey: "k",
      apiSecret: "s",
      sandbox: true,
      defaultItemGroup: "All Item Groups",
      defaultStockUom: "Nos",
    });
    await adapter.callTool(
      "erpnext.item_create",
      { mode: "commit", item_name: "Widget", item_code: "W-1", is_stock_item: 0 },
      { tenantId: "t", actorSubject: null },
    );
    const body = JSON.parse(captured[0].body as string);
    assertEquals(body.item_code, "W-1");
    assertEquals(body.is_stock_item, 0);
    assertEquals(body.is_sales_item, 1);
    assertEquals(body.item_group, "All Item Groups");
    assertEquals(body.stock_uom, "Nos");
  } finally {
    restore();
  }
});
```

(Import `WriteError` and `assertRejects` in the test file.)

- [ ] **Step 2: Run to verify failure**

Run: `deno test src/adapters/erpnext_test.ts`
Expected: FAIL — unknown tool.

- [ ] **Step 3: Add the dispatch branch**

Add `import { parseWriteMode, WriteError } from "../write.ts";` (merge with the Task 5 import). In `callTool`, before the final throw:

```typescript
      if (name === "erpnext.item_create") {
        const mode = parseWriteMode(args);
        const isStockItem = readOptionalInteger(args, "is_stock_item", 1, {
          min: 0,
          max: 1,
        });
        const payload: Record<string, unknown> = {
          item_name: readRequiredString(args, "item_name"),
          item_code: readRequiredString(args, "item_code"),
          is_stock_item: isStockItem,
          is_sales_item: 1,
        };
        if (typeof args.standard_rate === "number") {
          payload.standard_rate = args.standard_rate;
        }
        const stockUom = readOptionalStringArgument(args, "stock_uom") ??
          connection.defaultStockUom;
        if (!stockUom) {
          throw new WriteError(
            "MISSING_REQUIRED_CONFIG",
            { field: "stock_uom", erpType: "erpnext", tool: name },
            "Provide uom or set defaultStockUom on the ErpConnection.",
          );
        }
        payload.stock_uom = stockUom;
        if (!connection.defaultItemGroup) {
          throw new WriteError(
            "MISSING_REQUIRED_CONFIG",
            { field: "item_group", erpType: "erpnext", tool: name },
            "Set defaultItemGroup on the ErpConnection.",
          );
        }
        payload.item_group = connection.defaultItemGroup;
        if (mode === "preview") {
          return {
            content: { committed: false, doctype: "Item", resolved: payload },
            summary: "Preview ERPNext Item create (not written)",
          };
        }
        const created = await client.create("Item", payload, { signal: _ctx.signal });
        const nativeId = typeof created.name === "string" ? created.name : "";
        return {
          content: { committed: true, doctype: "Item", nativeId, resolved: payload },
          summary: `Created ERPNext Item ${nativeId}`,
        };
      }
```

- [ ] **Step 4: Run to verify pass**

Run: `deno test src/adapters/erpnext_test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/adapters/erpnext.ts src/adapters/erpnext_test.ts
git commit -m "feat(erpnext): internal item_create (sku required, item_group/stock_uom defaults)"
```

---

## Task 7: Dolibarr HTTP write body + `create` methods + `readRequiredString`

**Files:**
- Modify: `src/adapters/dolibarr.ts`
- Test: `src/adapters/dolibarr_test.ts`

**Interfaces:**
- Consumes: existing `DolibarrRestClient.request`, `DolibarrApiError`.
- Produces:
  - `request` gains a trailing `body?: string` param (sends `content-type` + body when set).
  - `DolibarrRestClient.createThirdparty(payload: Record<string, unknown>, signal?: AbortSignal): Promise<unknown>` (POST `/thirdparties`).
  - `DolibarrRestClient.createProduct(payload: Record<string, unknown>, signal?: AbortSignal): Promise<unknown>` (POST `/products`).
  - local `readRequiredString(args, name): string`.

- [ ] **Step 1: Write the failing test**

```typescript
// src/adapters/dolibarr_test.ts — extend CapturedFetch with `body?: string`
// in mockFetch: body: typeof init?.body === "string" ? init.body : undefined,

Deno.test("dolibarr.thirdparty_create — commit POSTs name + client:1 and returns id", async () => {
  const captured: CapturedFetch[] = [];
  const restore = mockFetch({ status: 200, body: 77 }, captured); // Dolibarr returns new id
  try {
    const adapter = createTestAdapter();
    const r = await adapter.callTool(
      "dolibarr.thirdparty_create",
      { mode: "commit", name: "Acme" },
      { tenantId: "t", actorSubject: null },
    );
    assertEquals(captured[0].method, "POST");
    assertEquals(captured[0].url.pathname, "/api/index.php/thirdparties");
    assertEquals(captured[0].headers.get("content-type"), "application/json");
    const body = JSON.parse(captured[0].body as string);
    assertEquals(body.name, "Acme");
    assertEquals(body.client, 1);
    const c = r.content as { committed: boolean; nativeId: string };
    assertEquals(c.committed, true);
    assertEquals(c.nativeId, "77");
  } finally {
    restore();
  }
});
```

- [ ] **Step 2: Run to verify failure**

Run: `deno test src/adapters/dolibarr_test.ts`
Expected: FAIL — unknown tool / no create method.

- [ ] **Step 3: Extend `request` and add create methods + helper**

In `DolibarrRestClient.request`, add the body parameter and header:

```typescript
  private async request<T>(
    method: string,
    path: string,
    errorPath: string,
    signal?: AbortSignal,
    body?: string,
  ): Promise<T> {
    let response: Response;
    try {
      const headers: Record<string, string> = {
        "accept": "application/json",
        "dolapikey": this.connection.apiKey,
      };
      if (body !== undefined) headers["content-type"] = "application/json";
      response = await fetch(`${this.baseUrl}${path}`, { method, headers, body, signal });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new DolibarrApiError(
        `Dolibarr ${method} ${errorPath} failed: ${message}`,
        0,
        null,
      );
    }
    const responseBody = await readResponseBody(response);
    if (!response.ok) {
      throw new DolibarrApiError(
        `Dolibarr ${method} ${errorPath} failed: ${
          extractDolibarrErrorMessage(responseBody, response.statusText)
        }`,
        response.status,
        responseBody,
      );
    }
    return responseBody as T;
  }

  async createThirdparty(
    payload: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<unknown> {
    return await this.request<unknown>(
      "POST", "/thirdparties", "/thirdparties", signal, JSON.stringify(payload),
    );
  }

  async createProduct(
    payload: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<unknown> {
    return await this.request<unknown>(
      "POST", "/products", "/products", signal, JSON.stringify(payload),
    );
  }
```

Add the helper next to the other Dolibarr arg helpers:

```typescript
function readRequiredString(args: Record<string, unknown>, name: string): string {
  const value = args[name];
  if (typeof value !== "string" || value.length === 0) {
    throw new TypeError(`${name} must be a non-empty string`);
  }
  return value;
}
```

> ⚠️ CODEX: confirm Dolibarr `POST /thirdparties` and `POST /products` return the new record **id** (integer) as the response body, and that the create payload uses these exact field names.

- [ ] **Step 4: (green checkpoint folded into Task 8)**

The `thirdparty_create` branch is added in Task 8; that is where this test goes green. Here, just type-check:

Run: `deno check src/adapters/dolibarr.ts`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/adapters/dolibarr.ts
git commit -m "feat(dolibarr): support request body + add create methods + readRequiredString"
```

---

## Task 8: Internal `dolibarr.thirdparty_create` and `dolibarr.product_create`

**Files:**
- Modify: `src/adapters/dolibarr.ts`
- Test: `src/adapters/dolibarr_test.ts`

**Interfaces:**
- Consumes: `parseWriteMode`, `WriteError` from `../write.ts`; `client.createThirdparty`, `client.createProduct`; `connection.defaultIndividualTypentId`.
- Produces: `callTool` handles `"dolibarr.thirdparty_create"` and `"dolibarr.product_create"` (not in `TOOLS`).
  - thirdparty native args: `mode` (req), `name` (req), `kind?` (`company`|`individual`), `tva_intra?`, `code_client?`, `email?`, `phone?`, `multicurrency_code?`. Always sets `client: 1`. `individual` sets `typent_id` from `defaultIndividualTypentId`.
  - product native args: `mode` (req), `label` (req), `ref` (req), `type?` (0|1), `price?` (number).

- [ ] **Step 1: Write the failing tests**

```typescript
Deno.test("dolibarr.thirdparty_create — preview does not POST", async () => {
  const captured: CapturedFetch[] = [];
  const restore = mockFetch({ status: 200, body: 1 }, captured);
  try {
    const adapter = createTestAdapter();
    const r = await adapter.callTool(
      "dolibarr.thirdparty_create",
      { mode: "preview", name: "Acme" },
      { tenantId: "t", actorSubject: null },
    );
    assertEquals(captured.length, 0);
    assertEquals((r.content as { committed: boolean }).committed, false);
  } finally {
    restore();
  }
});

Deno.test("dolibarr.product_create — commit sends type and ref, returns id", async () => {
  const captured: CapturedFetch[] = [];
  const restore = mockFetch({ status: 200, body: 5 }, captured);
  try {
    const adapter = createTestAdapter();
    const r = await adapter.callTool(
      "dolibarr.product_create",
      { mode: "commit", label: "Widget", ref: "W-1", type: 1, price: 10 },
      { tenantId: "t", actorSubject: null },
    );
    assertEquals(captured[0].url.pathname, "/api/index.php/products");
    const body = JSON.parse(captured[0].body as string);
    assertEquals(body.ref, "W-1");
    assertEquals(body.label, "Widget");
    assertEquals(body.type, 1);
    assertEquals(body.price, 10);
    assertEquals((r.content as { nativeId: string }).nativeId, "5");
  } finally {
    restore();
  }
});
```

- [ ] **Step 2: Run to verify failure**

Run: `deno test src/adapters/dolibarr_test.ts`
Expected: FAIL — unknown tools.

- [ ] **Step 3: Add the dispatch branches**

Add `import { parseWriteMode, WriteError } from "../write.ts";` to `dolibarr.ts`. In `callTool`, before the final `throw new UnknownToolError("dolibarr", name)`:

```typescript
      if (name === "dolibarr.thirdparty_create") {
        rejectUnsupportedArguments(name, args, [
          "mode", "name", "kind", "tva_intra", "code_client",
          "email", "phone", "multicurrency_code",
        ]);
        const mode = parseWriteMode(args);
        const payload: Record<string, unknown> = {
          name: readRequiredString(args, "name"),
          client: 1,
        };
        const kind = readOptionalEnumArgument(args, "kind", ["company", "individual"]);
        if (kind === "individual") {
          if (connection.defaultIndividualTypentId === undefined) {
            throw new WriteError(
              "MISSING_REQUIRED_CONFIG",
              { field: "typent_id", erpType: "dolibarr", tool: name },
              "Set defaultIndividualTypentId on the ErpConnection to create individuals.",
            );
          }
          payload.typent_id = connection.defaultIndividualTypentId;
        }
        for (const f of ["tva_intra", "code_client", "email", "phone", "multicurrency_code"]) {
          const v = readOptionalStringArgument(args, f);
          if (v !== undefined) payload[f] = v;
        }
        if (mode === "preview") {
          return {
            content: { committed: false, doctype: "Dolibarr Thirdparty", resolved: payload },
            summary: "Preview Dolibarr thirdparty create (not written)",
          };
        }
        const id = await client.createThirdparty(payload, _ctx.signal);
        const nativeId = String(id);
        return {
          content: { committed: true, doctype: "Dolibarr Thirdparty", nativeId, resolved: payload },
          summary: `Created Dolibarr thirdparty ${nativeId}`,
        };
      }

      if (name === "dolibarr.product_create") {
        rejectUnsupportedArguments(name, args, ["mode", "label", "ref", "type", "price"]);
        const mode = parseWriteMode(args);
        const payload: Record<string, unknown> = {
          label: readRequiredString(args, "label"),
          ref: readRequiredString(args, "ref"),
        };
        const type = readOptionalIntegerArgument(args, "type", { min: 0 });
        if (type !== undefined) payload.type = type;
        if (typeof args.price === "number") payload.price = args.price;
        if (mode === "preview") {
          return {
            content: { committed: false, doctype: "Dolibarr Product", resolved: payload },
            summary: "Preview Dolibarr product create (not written)",
          };
        }
        const id = await client.createProduct(payload, _ctx.signal);
        const nativeId = String(id);
        return {
          content: { committed: true, doctype: "Dolibarr Product", nativeId, resolved: payload },
          summary: `Created Dolibarr product ${nativeId}`,
        };
      }
```

> ⚠️ CODEX: confirm `client: 1` selects "customer" role on create, `typent_id` is the correct individual field, and `multicurrency_code` is the right currency field on thirdparty create. Confirm Dolibarr product create accepts `price` without an explicit `price_base_type` (else add `price_base_type: "HT"`).

- [ ] **Step 4: Run to verify pass**

Run: `deno test src/adapters/dolibarr_test.ts`
Expected: PASS (including the Task 7 thirdparty_create test).

- [ ] **Step 5: Commit**

```bash
git add src/adapters/dolibarr.ts src/adapters/dolibarr_test.ts
git commit -m "feat(dolibarr): internal thirdparty_create + product_create with preview/commit"
```

---

## Task 9: Normalized `erp.customer_create`

**Files:**
- Modify: `src/normalized-adapter.ts`
- Test: `src/normalized-adapter_test.ts`

**Interfaces:**
- Consumes: `parseWriteMode`, `assertFieldSupported` from `./write.ts`; `resolveErpType`; native `*.customer_create`/`*.thirdparty_create`.
- Produces: `NORMALIZED_TOOLS` gains `erp.customer_create`; `callTool` maps normalized→native, gates fields, passes `mode`, returns `{ committed, erpType, nativeId?, resolved }`.

Normalized → native field mapping:
- ERPNext: `name`→`customer_name`, `kind:individual`→`customer_type:"Individual"` (else `"Company"`), `taxId`→`tax_id`, `email`→`email_id`, `phone`→`mobile_no`, `currency`→`default_currency`. `externalRef` is gated (unsupported).
- Dolibarr: `name`→`name`, `kind`→`kind`, `taxId`→`tva_intra`, `externalRef`→`code_client`, `email`→`email`, `phone`→`phone`, `currency`→`multicurrency_code`.

- [ ] **Step 1: Write the failing tests**

```typescript
// src/normalized-adapter_test.ts — assumes helpers that build a NormalizedAdapter
// over fetch-mocked native adapters (mirror existing read tests in this file).

Deno.test("erp.customer_create — erpnext maps fields and commits", async () => {
  const captured: CapturedFetch[] = [];
  const restore = mockFetch({ status: 200, body: { data: { name: "CUST-9" } } }, captured);
  try {
    const adapter = new NormalizedAdapter({ erpnext: createErpnextTestAdapter() });
    const r = await adapter.callTool(
      "erp.customer_create",
      { erpType: "erpnext", mode: "commit", name: "Acme", kind: "individual", taxId: "FR123" },
      { tenantId: "t", actorSubject: null },
    );
    const body = JSON.parse(captured[0].body as string);
    assertEquals(body.customer_name, "Acme");
    assertEquals(body.customer_type, "Individual");
    assertEquals(body.tax_id, "FR123");
    const c = r.content as { committed: boolean; erpType: string; nativeId: string };
    assertEquals(c.committed, true);
    assertEquals(c.erpType, "erpnext");
    assertEquals(c.nativeId, "CUST-9");
  } finally {
    restore();
  }
});

Deno.test("erp.customer_create — externalRef unsupported on erpnext throws UNSUPPORTED_FIELD", async () => {
  const restore = mockFetch({ status: 200, body: {} }, []);
  try {
    const adapter = new NormalizedAdapter({ erpnext: createErpnextTestAdapter() });
    const err = await assertRejects(
      () =>
        adapter.callTool(
          "erp.customer_create",
          { erpType: "erpnext", mode: "preview", name: "Acme", externalRef: "X" },
          { tenantId: "t", actorSubject: null },
        ),
      WriteError,
    );
    assertEquals(err.code, "UNSUPPORTED_FIELD");
  } finally {
    restore();
  }
});
```

(Add a `createErpnextTestAdapter()` helper in the test file mirroring the existing native-adapter construction, and import `NormalizedAdapter`, `WriteError`, `assertRejects`.)

- [ ] **Step 2: Run to verify failure**

Run: `deno test src/normalized-adapter_test.ts`
Expected: FAIL — `erp.customer_create` is UNKNOWN_TOOL.

- [ ] **Step 3: Add the tool definition**

Add to `NORMALIZED_TOOLS` (after `erp.business_party_get`):

```typescript
  {
    name: "erp.customer_create",
    description:
      "Create a customer (business party) in normalized form. mode 'preview' validates without writing; 'commit' writes.",
    inputSchema: {
      type: "object",
      properties: {
        erpType: ERP_TYPE_SCHEMA,
        mode: {
          type: "string",
          enum: ["preview", "commit"],
          description: "Required. 'preview' resolves the payload without writing; 'commit' writes.",
        },
        name: { type: "string", minLength: 1 },
        kind: { type: "string", enum: ["company", "individual"], default: "company" },
        taxId: { type: "string", minLength: 1 },
        externalRef: { type: "string", minLength: 1 },
        email: { type: "string", minLength: 1 },
        phone: { type: "string", minLength: 1 },
        currency: { type: "string", minLength: 1 },
      },
      required: ["erpType", "mode", "name"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: false },
  },
```

- [ ] **Step 4: Add the dispatch branch**

Add `import { assertFieldSupported, parseWriteMode } from "./write.ts";`. In `callTool`, after the `erp.business_party_get` block:

```typescript
    // ── customer_create ───────────────────────────────────────────────────────
    if (name === "erp.customer_create") {
      const mode = parseWriteMode(args);
      const cname = typeof args.name === "string" ? args.name : "";
      const kind = args.kind === "individual" ? "individual" : "company";
      assertFieldSupported(erpType, "externalRef", args);

      if (erpType === "erpnext" && nativeAdapter) {
        const nativeArgs: Record<string, unknown> = {
          mode,
          customer_name: cname,
          customer_type: kind === "individual" ? "Individual" : "Company",
        };
        if (typeof args.taxId === "string") nativeArgs.tax_id = args.taxId;
        if (typeof args.email === "string") nativeArgs.email_id = args.email;
        if (typeof args.phone === "string") nativeArgs.mobile_no = args.phone;
        if (typeof args.currency === "string") nativeArgs.default_currency = args.currency;
        const r = await nativeAdapter.callTool("erpnext.customer_create", nativeArgs, ctx);
        return { content: { ...(r.content as Record<string, unknown>), erpType } };
      }

      if (erpType === "dolibarr" && nativeAdapter) {
        const nativeArgs: Record<string, unknown> = { mode, name: cname, kind };
        if (typeof args.taxId === "string") nativeArgs.tva_intra = args.taxId;
        if (typeof args.externalRef === "string") nativeArgs.code_client = args.externalRef;
        if (typeof args.email === "string") nativeArgs.email = args.email;
        if (typeof args.phone === "string") nativeArgs.phone = args.phone;
        if (typeof args.currency === "string") nativeArgs.multicurrency_code = args.currency;
        const r = await nativeAdapter.callTool("dolibarr.thirdparty_create", nativeArgs, ctx);
        return { content: { ...(r.content as Record<string, unknown>), erpType } };
      }
    }
```

- [ ] **Step 5: Run to verify pass + commit**

Run: `deno test src/normalized-adapter_test.ts`
Expected: PASS.

```bash
git add src/normalized-adapter.ts src/normalized-adapter_test.ts
git commit -m "feat(normalized): add erp.customer_create (mapping + field gating + preview/commit)"
```

---

## Task 10: Normalized `erp.product_create`

**Files:**
- Modify: `src/normalized-adapter.ts`
- Test: `src/normalized-adapter_test.ts`

**Interfaces:**
- Consumes: same as Task 9; native `*.item_create` / `*.product_create`.
- Produces: `NORMALIZED_TOOLS` gains `erp.product_create`; `callTool` maps and dispatches.

Mapping:
- ERPNext: `name`→`item_name`, `sku`→`item_code`, `kind:service`→`is_stock_item:0` (else 1), `unitPrice`→`standard_rate`, `uom`→`stock_uom`.
- Dolibarr: `name`→`label`, `sku`→`ref`, `kind:service`→`type:1` (else 0), `unitPrice`→`price`. (`uom` has no Dolibarr equivalent — ignored.)

- [ ] **Step 1: Write the failing tests**

```typescript
Deno.test("erp.product_create — erpnext maps service to is_stock_item 0", async () => {
  const captured: CapturedFetch[] = [];
  const restore = mockFetch({ status: 200, body: { data: { name: "ITEM-7" } } }, captured);
  try {
    const adapter = new NormalizedAdapter({ erpnext: createErpnextTestAdapter("All Item Groups", "Nos") });
    const r = await adapter.callTool(
      "erp.product_create",
      { erpType: "erpnext", mode: "commit", name: "Consulting", sku: "SVC-1", kind: "service", unitPrice: 100 },
      { tenantId: "t", actorSubject: null },
    );
    const body = JSON.parse(captured[0].body as string);
    assertEquals(body.item_code, "SVC-1");
    assertEquals(body.is_stock_item, 0);
    assertEquals(body.standard_rate, 100);
    assertEquals((r.content as { nativeId: string }).nativeId, "ITEM-7");
  } finally {
    restore();
  }
});

Deno.test("erp.product_create — dolibarr maps product to type 0", async () => {
  const captured: CapturedFetch[] = [];
  const restore = mockFetch({ status: 200, body: 8 }, captured);
  try {
    const adapter = new NormalizedAdapter({ dolibarr: createDolibarrTestAdapter() });
    await adapter.callTool(
      "erp.product_create",
      { erpType: "dolibarr", mode: "commit", name: "Widget", sku: "W-1", kind: "product", unitPrice: 9 },
      { tenantId: "t", actorSubject: null },
    );
    const body = JSON.parse(captured[0].body as string);
    assertEquals(body.label, "Widget");
    assertEquals(body.ref, "W-1");
    assertEquals(body.type, 0);
    assertEquals(body.price, 9);
  } finally {
    restore();
  }
});
```

(`createErpnextTestAdapter(itemGroup?, stockUom?)` builds the native adapter with those connection defaults; `createDolibarrTestAdapter()` mirrors it.)

- [ ] **Step 2: Run to verify failure**

Run: `deno test src/normalized-adapter_test.ts`
Expected: FAIL — `erp.product_create` UNKNOWN_TOOL.

- [ ] **Step 3: Add the tool definition**

Add to `NORMALIZED_TOOLS` (after `erp.catalog_item_get`):

```typescript
  {
    name: "erp.product_create",
    description:
      "Create a catalog item (product/service) in normalized form. mode 'preview' validates without writing; 'commit' writes.",
    inputSchema: {
      type: "object",
      properties: {
        erpType: ERP_TYPE_SCHEMA,
        mode: { type: "string", enum: ["preview", "commit"] },
        name: { type: "string", minLength: 1 },
        sku: { type: "string", minLength: 1 },
        kind: { type: "string", enum: ["product", "service"], default: "product" },
        unitPrice: { type: "number", minimum: 0 },
        uom: { type: "string", minLength: 1 },
      },
      required: ["erpType", "mode", "name", "sku"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: false },
  },
```

- [ ] **Step 4: Add the dispatch branch**

In `callTool`, after the `erp.customer_create` block:

```typescript
    // ── product_create ────────────────────────────────────────────────────────
    if (name === "erp.product_create") {
      const mode = parseWriteMode(args);
      const pname = typeof args.name === "string" ? args.name : "";
      const sku = typeof args.sku === "string" ? args.sku : "";
      const isService = args.kind === "service";

      if (erpType === "erpnext" && nativeAdapter) {
        const nativeArgs: Record<string, unknown> = {
          mode,
          item_name: pname,
          item_code: sku,
          is_stock_item: isService ? 0 : 1,
        };
        if (typeof args.unitPrice === "number") nativeArgs.standard_rate = args.unitPrice;
        if (typeof args.uom === "string") nativeArgs.stock_uom = args.uom;
        const r = await nativeAdapter.callTool("erpnext.item_create", nativeArgs, ctx);
        return { content: { ...(r.content as Record<string, unknown>), erpType } };
      }

      if (erpType === "dolibarr" && nativeAdapter) {
        const nativeArgs: Record<string, unknown> = {
          mode,
          label: pname,
          ref: sku,
          type: isService ? 1 : 0,
        };
        if (typeof args.unitPrice === "number") nativeArgs.price = args.unitPrice;
        const r = await nativeAdapter.callTool("dolibarr.product_create", nativeArgs, ctx);
        return { content: { ...(r.content as Record<string, unknown>), erpType } };
      }
    }
```

- [ ] **Step 5: Run to verify pass + commit**

Run: `deno test src/normalized-adapter_test.ts`
Expected: PASS.

```bash
git add src/normalized-adapter.ts src/normalized-adapter_test.ts
git commit -m "feat(normalized): add erp.product_create (sku required, kind mapping)"
```

---

## Task 11: Normalized `erp.capabilities_describe`

**Files:**
- Modify: `src/normalized-adapter.ts`
- Test: `src/normalized-adapter_test.ts`

**Interfaces:**
- Consumes: `WRITE_CAPABILITIES` from `./write.ts`; `resolveErpType`.
- Produces: `NORMALIZED_TOOLS` gains `erp.capabilities_describe`; `callTool` returns `{ erpType, supportedTools, supportedFields, unsupportedFields, capabilityVersion }` (read-only).

- [ ] **Step 1: Write the failing test**

```typescript
Deno.test("erp.capabilities_describe — reports erpnext write capabilities", async () => {
  const adapter = new NormalizedAdapter({ erpnext: createErpnextTestAdapter() });
  const r = await adapter.callTool(
    "erp.capabilities_describe",
    { erpType: "erpnext" },
    { tenantId: "t", actorSubject: null },
  );
  const c = r.content as {
    erpType: string;
    supportedTools: string[];
    unsupportedFields: string[];
  };
  assertEquals(c.erpType, "erpnext");
  assertEquals(c.supportedTools.includes("erp.customer_create"), true);
  assertEquals(c.unsupportedFields.includes("externalRef"), true);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `deno test src/normalized-adapter_test.ts`
Expected: FAIL — UNKNOWN_TOOL.

- [ ] **Step 3: Add the tool definition + branch**

Add `import { WRITE_CAPABILITIES } from "./write.ts";` (merge with the Task 9 import). Add to `NORMALIZED_TOOLS`:

```typescript
  {
    name: "erp.capabilities_describe",
    description:
      "Describe the write capabilities of the target ERP: supported tools and which normalized fields are unsupported.",
    inputSchema: {
      type: "object",
      properties: { erpType: ERP_TYPE_SCHEMA },
      required: ["erpType"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true },
  },
```

In `callTool`, after `resolveErpType` resolves (it runs for every tool), add a branch early — but note `erp.capabilities_describe` does not need a native adapter, so place it right after the `resolveErpType(args, name)` line:

```typescript
    if (name === "erp.capabilities_describe") {
      const caps = WRITE_CAPABILITIES[erpType];
      return {
        content: {
          erpType,
          supportedTools: [...caps.tools],
          supportedFields: [],
          unsupportedFields: [...caps.unsupportedFields],
          capabilityVersion: "2026-06-30",
        },
        summary: `Capabilities for ${erpType}`,
      };
    }
```

- [ ] **Step 4: Run full suite + commit**

Run: `deno task test`
Expected: PASS (whole suite, ~200+ tests).

```bash
git add src/normalized-adapter.ts src/normalized-adapter_test.ts
git commit -m "feat(normalized): add erp.capabilities_describe"
```

---

## Final verification

- [ ] Run `deno task test` — all green.
- [ ] Run `deno check src/**/*.ts` (or the repo's lint/check task from `deno.json`) — no type errors.
- [ ] Confirm `erpnext.customer_create`/`erpnext.item_create`/`dolibarr.thirdparty_create`/`dolibarr.product_create` are NOT in any `tools()` output (grep the `TOOLS` arrays) — internal only.
- [ ] Dispatch the Codex VRAI/FAUX/NUANCE review on the full diff (session `erp-write-design`), focused on every `⚠️ CODEX` flag: Frappe POST body shape, Dolibarr create field names + id-returning responses, `client:1`/`typent_id`/`multicurrency_code`/`price_base_type`. Apply corrections, re-verify until MERGE-OK.

## Deferred (out of this plan)

- Per-tenant **tool-level** filtered `tools/list` (no MVP-visible effect: both ERPs support both creates; matters once tools diverge — e.g. supplier/submit).
- `idempotencyKey` + durable dedup.
- `country` field (needs Dolibarr `country_id` lookup).
- `update`/`submit`/`cancel`/`delete`, `supplier_create`, `Partnership`, ERPNext `externalRef` via custom field.
