import type {
  ErpAdapter,
  ErpToolCallContext,
  ErpToolCallResult,
} from "../../domain/adapter.ts";
import type { ErpType } from "../../domain/connection.ts";
import { parseWriteMode } from "../../domain/write.ts";
import {
  assertFieldsSupported,
  optString,
  parseDolibarrNumericId,
  reqString,
} from "../shared/handler-utils.ts";
import {
  mapSupplierCreateToDolibarr,
  mapSupplierUpdateToDolibarr,
} from "./mappers/dolibarr.ts";
import {
  mapSupplierCreateToErpNext,
  mapSupplierUpdateToErpNext,
} from "./mappers/erpnext.ts";

export async function callSupplierTool(
  params: {
    readonly name: string;
    readonly args: Record<string, unknown>;
    readonly ctx: ErpToolCallContext;
    readonly erpType: ErpType;
    readonly nativeAdapter?: ErpAdapter;
  },
): Promise<ErpToolCallResult | undefined> {
  const { name, args, ctx, erpType, nativeAdapter } = params;

  if (name === "erp.supplier_create") {
    const mode = parseWriteMode(args);
    const sname = reqString("name", args.name, erpType);
    const taxId = optString("taxId", args.taxId, erpType);
    const externalRef = optString("externalRef", args.externalRef, erpType);
    assertFieldsSupported(erpType, args, ["externalRef"]);
    const email = optString("email", args.email, erpType);
    const phone = optString("phone", args.phone, erpType);
    const currency = optString("currency", args.currency, erpType);
    const supplierInput = {
      mode,
      name: sname,
      taxId,
      externalRef,
      email,
      phone,
      currency,
    };

    if (erpType === "erpnext" && nativeAdapter) {
      const nativePlan = mapSupplierCreateToErpNext(supplierInput);
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
      const nativePlan = mapSupplierCreateToDolibarr(supplierInput);
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

  if (name === "erp.supplier_update") {
    const mode = parseWriteMode(args);
    const nativeId = reqString("nativeId", args.nativeId, erpType);
    const sname = optString("name", args.name, erpType);
    const taxId = optString("taxId", args.taxId, erpType);
    const externalRef = optString("externalRef", args.externalRef, erpType);
    assertFieldsSupported(erpType, args, ["externalRef"]);
    const email = optString("email", args.email, erpType);
    const phone = optString("phone", args.phone, erpType);
    const currency = optString("currency", args.currency, erpType);
    const supplierInput = {
      mode,
      nativeId,
      name: sname,
      taxId,
      externalRef,
      email,
      phone,
      currency,
    };

    if (erpType === "erpnext" && nativeAdapter) {
      const nativePlan = mapSupplierUpdateToErpNext(supplierInput);
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
      const nativePlan = mapSupplierUpdateToDolibarr({
        ...supplierInput,
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
