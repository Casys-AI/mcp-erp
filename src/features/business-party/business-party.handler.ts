import type {
  ErpAdapter,
  ErpToolCallContext,
  ErpToolCallResult,
} from "../../domain/adapter.ts";
import type { ErpType } from "../../domain/connection.ts";
import type { NormalizedPayload } from "../../domain/normalized.ts";
import { NormalizedError } from "../../domain/normalized.ts";
import { normalizeDolibarrParty } from "../customer/mappers/dolibarr.ts";
import { normalizeErpNextCustomer } from "../customer/mappers/erpnext.ts";
import {
  extractArray,
  extractDoc,
  parseDolibarrNumericId,
  resolveNativeId,
} from "../shared/handler-utils.ts";
import { normalizeErpNextSupplier } from "../supplier/mappers/erpnext.ts";

export async function callBusinessPartyTool(
  params: {
    readonly name: string;
    readonly args: Record<string, unknown>;
    readonly ctx: ErpToolCallContext;
    readonly erpType: ErpType;
    readonly nativeAdapter?: ErpAdapter;
  },
): Promise<ErpToolCallResult | undefined> {
  const { name, args, ctx, erpType, nativeAdapter } = params;

  if (name === "erp.business_party_get") {
    const nativeId = resolveNativeId(args);
    const partyKind = resolvePartyKind(args);

    if (erpType === "erpnext" && nativeAdapter) {
      const nativeTool = partyKind === "supplier"
        ? "erpnext.supplier_get"
        : "erpnext.customer_get";
      const r = await nativeAdapter.callTool(
        nativeTool,
        { name: nativeId },
        ctx,
      );
      const raw = partyKind === "supplier"
        ? extractDoc(r.content, "supplier")
        : extractDoc(r.content, "customer");
      const payload = partyKind === "supplier"
        ? normalizeErpNextSupplier(raw)
        : normalizeErpNextCustomer(raw);
      return { content: payload };
    }

    if (erpType === "dolibarr" && nativeAdapter) {
      const id = parseDolibarrNumericId(nativeId);
      const r = await nativeAdapter.callTool(
        "dolibarr.thirdparty_get",
        { id },
        ctx,
      );
      const raw = extractDoc(r.content, "thirdparty");
      return { content: normalizeDolibarrParty(raw) };
    }

    return undefined;
  }

  if (name === "erp.business_party_list") {
    const partyKind = resolvePartyKind(args);
    const limit = typeof args.limit === "number" ? args.limit : 20;
    const page = typeof args.page === "number" ? args.page : 0;

    if (erpType === "erpnext" && nativeAdapter) {
      const nativeTool = partyKind === "supplier"
        ? "erpnext.supplier_list"
        : "erpnext.customer_list";
      const r = await nativeAdapter.callTool(
        nativeTool,
        { limit, limitStart: page * limit },
        ctx,
      );
      const listKey = partyKind === "supplier" ? "suppliers" : "customers";
      const rawList = extractArray(r.content, listKey);
      const items: NormalizedPayload[] = rawList.map((raw) =>
        partyKind === "supplier"
          ? normalizeErpNextSupplier(raw)
          : normalizeErpNextCustomer(raw)
      );
      return { content: { items, count: items.length } };
    }

    if (erpType === "dolibarr" && nativeAdapter) {
      const modeArg = partyKind === "supplier" ? "supplier" : "customer";
      const r = await nativeAdapter.callTool(
        "dolibarr.thirdparty_list",
        { limit, page, mode: modeArg },
        ctx,
      );
      const rawList = extractArray(r.content, "thirdparties");
      const items: NormalizedPayload[] = rawList.map((raw) =>
        normalizeDolibarrParty(raw)
      );
      return { content: { items, count: items.length } };
    }

    return undefined;
  }

  return undefined;
}

function resolvePartyKind(
  args: Record<string, unknown>,
): "customer" | "supplier" {
  const kind = args.partyKind;
  if (kind === undefined || kind === "customer") return "customer";
  if (kind === "supplier") return "supplier";
  throw new NormalizedError(
    "INVALID_PARTY_KIND",
    `Invalid partyKind '${String(kind)}' — expected 'customer' or 'supplier'`,
    { partyKind: kind },
    "Pass 'customer' or 'supplier' as the partyKind argument, or omit it to default to 'customer'",
  );
}
