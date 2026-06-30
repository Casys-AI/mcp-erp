import { assertEquals, assertRejects } from "@std/assert";
import type { ErpAdapter } from "./domain/adapter.ts";
import type { ErpConnection } from "./domain/connection.ts";
import {
  buildAdapterFromProvider,
  type ErpAdapterCache,
  type ErpConnectionProvider,
  ErpProviderError,
} from "./connection-provider.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeProvider(
  resolve: (tenantId: string) => Promise<ErpConnection>,
): ErpConnectionProvider {
  return { resolve };
}

function makeConnection(): ErpConnection {
  return {
    erpType: "erpnext",
    apiUrl: "https://erp.test",
    apiKey: "key",
    apiSecret: "secret",
    sandbox: true,
  };
}

function makeMapCache(): ErpAdapterCache & { store: Map<string, ErpAdapter> } {
  const store = new Map<string, ErpAdapter>();
  return {
    store,
    get: (id) => store.get(id),
    set: (id, adapter) => {
      store.set(id, adapter);
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

Deno.test("buildAdapterFromProvider — resolve OK builds an adapter", async () => {
  let callCount = 0;
  const provider = makeProvider(() => {
    callCount++;
    return Promise.resolve(makeConnection());
  });

  const adapter = await buildAdapterFromProvider(provider, "tenant-1");

  assertEquals(adapter.erpType, "erpnext");
  assertEquals(callCount, 1);
});

Deno.test("buildAdapterFromProvider — cache hit skips provider on second call", async () => {
  let callCount = 0;
  const provider = makeProvider(() => {
    callCount++;
    return Promise.resolve(makeConnection());
  });
  const cache = makeMapCache();

  // First call — should resolve via provider
  const adapter1 = await buildAdapterFromProvider(provider, "tenant-1", cache);
  assertEquals(callCount, 1);

  // Second call — should hit cache
  const adapter2 = await buildAdapterFromProvider(provider, "tenant-1", cache);
  assertEquals(callCount, 1); // still 1

  // Same instance from cache
  assertEquals(adapter1, adapter2);
});

Deno.test("buildAdapterFromProvider — different tenants resolve independently", async () => {
  const calls: string[] = [];
  const provider = makeProvider((tenantId) => {
    calls.push(tenantId);
    return Promise.resolve(makeConnection());
  });

  await buildAdapterFromProvider(provider, "tenant-A");
  await buildAdapterFromProvider(provider, "tenant-B");

  assertEquals(calls, ["tenant-A", "tenant-B"]);
});

Deno.test("buildAdapterFromProvider — unknown tenant propagates machine-readable error", async () => {
  const provider = makeProvider((tenantId) =>
    Promise.reject(
      new ErpProviderError(
        "TENANT_NOT_FOUND",
        { tenantId },
        "register tenant before calling resolve",
      ),
    )
  );

  await assertRejects(
    () => buildAdapterFromProvider(provider, "ghost"),
    ErpProviderError,
    "TENANT_NOT_FOUND",
  );
});

Deno.test("ErpProviderError — is a structured machine-readable error", () => {
  const e = new ErpProviderError(
    "TENANT_NOT_FOUND",
    { tenantId: "x" },
    "register this tenant",
  );
  assertEquals(e.code, "TENANT_NOT_FOUND");
  assertEquals(e.context, { tenantId: "x" });
  assertEquals(e.recovery, "register this tenant");
  assertEquals(e instanceof Error, true);
  assertEquals(e.name, "ErpProviderError");
});
