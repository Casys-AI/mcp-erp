/**
 * ErpConnection — explicit, tenant-scoped credential handle.
 *
 * Discriminated by `erpType`. Each variant carries the minimum data the
 * matching adapter needs to talk to its ERP. **No environment variables,
 * no globals** — every call site must pass its own connection.
 *
 * Adding a new ERP = adding a variant + registering its factory in
 * `registry.ts`. The discriminated-union `erpType` field gives us
 * exhaustive switch checks at compile time.
 *
 * @module @casys/mcp-erp/connection
 */

export type ErpConnection =
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
    /** Optional default Supplier Group injected on Supplier create. */
    defaultSupplierGroup?: string;
    /** Optional default Company injected on Sales document creates. ERPNext
     * requires `company` but does not reliably default it through the REST API
     * (`remember_last_selected_value` is a UI mechanism). When absent the ERP
     * may fall back to Frappe site-level defaults; a structured ERP error
     * surfaces if none applies. */
    defaultCompany?: string;
  }
  | {
    erpType: "dolibarr";
    /** Dolibarr API URL, e.g. `https://dolibarr.example.com/api/index.php`. */
    apiUrl: string;
    /** `DOLAPIKEY` header value. */
    apiKey: string;
    sandbox: boolean;
    /** typent_id mapped to TE_PRIVATE for `kind: "individual"` (install-specific). */
    defaultIndividualTypentId?: number;
  };

/** ERP type literal — derived from the connection union. */
export type ErpType = ErpConnection["erpType"];

/** Allowlist of supported ERP types. Use for runtime validation. */
export const ERP_TYPES: readonly ErpType[] = ["erpnext", "dolibarr"] as const;

export function isKnownErpType(value: string): value is ErpType {
  return (ERP_TYPES as readonly string[]).includes(value);
}
