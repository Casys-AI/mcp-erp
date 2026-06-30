import type {
  ErpAdapter,
  ErpToolCallContext,
  ErpToolCallResult,
} from "../../domain/adapter.ts";
import type { ErpType } from "../../domain/connection.ts";
import { parseWriteMode } from "../../domain/write.ts";
import {
  assertFieldsSupported,
  optEnum,
  optString,
  parseDolibarrNumericId,
  reqString,
} from "../shared/handler-utils.ts";
import {
  mapCustomerCreateToDolibarr,
  mapCustomerUpdateToDolibarr,
} from "./mappers/dolibarr.ts";
import {
  mapCustomerCreateToErpNext,
  mapCustomerUpdateToErpNext,
} from "./mappers/erpnext.ts";

export async function callCustomerTool(
  params: {
    readonly name: string;
    readonly args: Record<string, unknown>;
    readonly ctx: ErpToolCallContext;
    readonly erpType: ErpType;
    readonly nativeAdapter?: ErpAdapter;
  },
): Promise<ErpToolCallResult | undefined> {
  const { name, args, ctx, erpType, nativeAdapter } = params;

  if (name === "erp.customer_create") {
    const mode = parseWriteMode(args);
    const cname = reqString("name", args.name, erpType);
    const kind = optEnum(
      "kind",
      args.kind,
      ["company", "individual"] as const,
      erpType,
    ) ?? "company";
    const taxId = optString("taxId", args.taxId, erpType);
    const email = optString("email", args.email, erpType);
    const phone = optString("phone", args.phone, erpType);
    const currency = optString("currency", args.currency, erpType);
    const externalRef = optString("externalRef", args.externalRef, erpType);
    assertFieldsSupported(erpType, args, ["externalRef"]);
    const customerInput = {
      mode,
      name: cname,
      kind,
      taxId,
      externalRef,
      email,
      phone,
      currency,
    };

    if (erpType === "erpnext" && nativeAdapter) {
      const nativePlan = mapCustomerCreateToErpNext(customerInput);
      const r = await nativeAdapter.callTool(
        nativePlan.toolName,
        nativePlan.args,
        ctx,
      );
      return {
        content: { ...(r.content as Record<string, unknown>), erpType },
      };
    }

    if (erpType === "dolibarr" && nativeAdapter) {
      const nativePlan = mapCustomerCreateToDolibarr(customerInput);
      const r = await nativeAdapter.callTool(
        nativePlan.toolName,
        nativePlan.args,
        ctx,
      );
      return {
        content: { ...(r.content as Record<string, unknown>), erpType },
      };
    }

    return undefined;
  }

  if (name === "erp.customer_update") {
    const mode = parseWriteMode(args);
    const nativeId = reqString("nativeId", args.nativeId, erpType);
    const cname = optString("name", args.name, erpType);
    const taxId = optString("taxId", args.taxId, erpType);
    const externalRef = optString("externalRef", args.externalRef, erpType);
    assertFieldsSupported(erpType, args, ["externalRef"]);
    const email = optString("email", args.email, erpType);
    const phone = optString("phone", args.phone, erpType);
    const currency = optString("currency", args.currency, erpType);
    const customerInput = {
      mode,
      nativeId,
      name: cname,
      taxId,
      externalRef,
      email,
      phone,
      currency,
    };

    if (erpType === "erpnext" && nativeAdapter) {
      const nativePlan = mapCustomerUpdateToErpNext(customerInput);
      const r = await nativeAdapter.callTool(
        nativePlan.toolName,
        nativePlan.args,
        ctx,
      );
      return {
        content: { ...(r.content as Record<string, unknown>), erpType },
      };
    }

    if (erpType === "dolibarr" && nativeAdapter) {
      const numericId = parseDolibarrNumericId(nativeId);
      const nativePlan = mapCustomerUpdateToDolibarr({
        ...customerInput,
        nativeId: numericId,
      });
      const r = await nativeAdapter.callTool(
        nativePlan.toolName,
        nativePlan.args,
        ctx,
      );
      return {
        content: { ...(r.content as Record<string, unknown>), erpType },
      };
    }

    return undefined;
  }

  return undefined;
}
