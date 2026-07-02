/**
 * ErpConnectionProvider — per-tenant credential resolver.
 *
 * Decouples the multi-tenant HTTP boundary from the adapters: adapters still
 * receive an explicit `ErpConnection` at factory time, but the connection is
 * resolved dynamically per request from a caller-supplied provider.
 *
 * Principals (AX):
 * - Narrow contract: `resolve` takes only `tenantId` and returns only
 *   `ErpConnection`.
 * - Fast-fail: unknown tenants must throw `ErpProviderError` with a
 *   machine-readable `code` before any adapter work begins.
 * - Explicit over implicit: no globals, no env vars — every call site owns
 *   its provider instance.
 *
 * @module @casys/mcp-erp/connection-provider
 */

import type { ErpAdapter } from "../../domain/adapter.ts";
import type { ErpConnection } from "../../domain/connection.ts";
import { buildAdapter } from "../../registry.ts";

// ---------------------------------------------------------------------------
// Machine-readable error
// ---------------------------------------------------------------------------

/**
 * Structured error thrown by `ErpConnectionProvider.resolve` (or
 * `buildAdapterFromProvider`) when resolution fails.
 *
 * AX principle "Machine-Readable Errors": errors carry a typed `code`
 * (for programmatic branching), a `context` object (for structured logs),
 * and a `recovery` hint (for operator runbooks).  Never use prose in `code`.
 */
export class ErpProviderError extends Error {
  override readonly name = "ErpProviderError";

  constructor(
    /** Machine-readable error code. e.g. TENANT_NOT_FOUND, TENANT_MISSING */
    public readonly code: string,
    /** Structured context: field names + values agents can parse. */
    public readonly context: Record<string, unknown>,
    /** Operator-facing recovery hint (may contain prose). */
    public readonly recovery: string,
  ) {
    super(code);
  }
}

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

/**
 * Resolves an `ErpConnection` for a given tenant identifier.
 *
 * Implementations typically look up tenant credentials from a secrets store,
 * database, or config map.  They MUST throw `ErpProviderError` with a
 * machine-readable code when the tenant is unknown or the credentials cannot
 * be fetched.
 */
export interface ErpConnectionProvider {
  resolve(tenantId: string): Promise<ErpConnection>;
}

/**
 * Optional adapter cache to avoid rebuilding the same adapter on every call.
 *
 * Implementations are responsible for thread-safety, TTL enforcement, and
 * eviction.  A simple `Map<string, ErpAdapter>` suffices for single-process
 * deployments.
 */
export interface ErpAdapterCache {
  get(tenantId: string): ErpAdapter | undefined;
  set(tenantId: string, adapter: ErpAdapter): void;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Resolve a tenant's `ErpConnection` and build its adapter.
 *
 * Pipeline:
 *   1. Check `cache` (if provided) — return cached adapter immediately.
 *   2. Call `provider.resolve(tenantId)` — throws `ErpProviderError` on
 *      unknown tenant (AX fast-fail at the credential boundary).
 *   3. Call `buildAdapter(connection)` — dispatches to the right factory.
 *   4. Store the fresh adapter in `cache` (if provided).
 *
 * @throws `ErpProviderError` when the provider rejects the tenant, or any
 *   error thrown by `buildAdapter`.
 */
export async function buildAdapterFromProvider(
  provider: ErpConnectionProvider,
  tenantId: string,
  cache?: ErpAdapterCache,
): Promise<ErpAdapter> {
  if (cache) {
    const cached = cache.get(tenantId);
    if (cached !== undefined) return cached;
  }

  const connection = await provider.resolve(tenantId);
  const adapter = await buildAdapter(connection);

  if (cache) {
    cache.set(tenantId, adapter);
  }

  return adapter;
}
