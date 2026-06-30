/**
 * Adapter registry — maps `erpType` to a factory.
 *
 * Adding a new ERP = (a) add a variant to `ErpConnection` in
 * `domain/connection.ts`, (b) create the adapter file in `platform/erp/`,
 * (c) register the factory below. The discriminated union ensures
 * step (c) is type-checked: forgetting an entry is a compile error.
 *
 * @module @casys/mcp-erp/registry
 */

import type { ErpAdapter, ErpAdapterFactory } from "./domain/adapter.ts";
import type { ErpConnection, ErpType } from "./domain/connection.ts";
import { createDolibarrAdapter } from "./platform/erp/dolibarr/adapter.ts";
import { createErpnextAdapter } from "./platform/erp/erpnext/adapter.ts";

const REGISTRY: { [E in ErpType]: ErpAdapterFactory<E> } = {
  erpnext: createErpnextAdapter,
  dolibarr: createDolibarrAdapter,
};

/**
 * Build an adapter from an explicit `ErpConnection`. Type-narrows the
 * connection by `erpType` and dispatches to the right factory.
 */
export async function buildAdapter(
  connection: ErpConnection,
): Promise<ErpAdapter> {
  const factory = REGISTRY[connection.erpType] as ErpAdapterFactory<
    typeof connection.erpType
  >;
  if (!factory) {
    throw new Error(
      `No adapter factory registered for erpType=${connection.erpType}`,
    );
  }
  return await factory(connection as never);
}

/** ERP types currently registered in this build. */
export const REGISTERED_ERP_TYPES: readonly ErpType[] = Object.keys(
  REGISTRY,
) as ErpType[];
