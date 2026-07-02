import type { ErpConnection } from "../../../../domain/connection.ts";
import type {
  ErpToolCallContext,
  ErpToolCallResult,
} from "../../../../domain/adapter.ts";
import { parseWriteMode, WriteError } from "../../../../domain/write.ts";
import type { DolibarrRestClient } from "../client.ts";

type DolibarrConnection = Extract<ErpConnection, { erpType: "dolibarr" }>;

export async function callDolibarrWriteTool(
  params: {
    readonly name: string;
    readonly args: Record<string, unknown>;
    readonly ctx: ErpToolCallContext;
    readonly connection: DolibarrConnection;
    readonly client: DolibarrRestClient;
  },
): Promise<ErpToolCallResult | undefined> {
  const { name, args, ctx, connection, client } = params;

  if (name === "dolibarr.thirdparty_create") {
    rejectUnsupportedArguments(name, args, [
      "mode",
      "name",
      "kind",
      "tva_intra",
      "code_client",
      "email",
      "phone",
      "multicurrency_code",
    ]);
    const mode = parseWriteMode(args);
    const payload: Record<string, unknown> = {
      name: readRequiredString(args, "name"),
      client: 1,
    };
    const kind = readOptionalEnumArgument(args, "kind", [
      "company",
      "individual",
    ]);
    if (kind === "individual") {
      if (
        !Number.isInteger(connection.defaultIndividualTypentId) ||
        (connection.defaultIndividualTypentId as number) <= 0
      ) {
        throw new WriteError(
          "MISSING_REQUIRED_CONFIG",
          { field: "defaultIndividualTypentId", erpType: "dolibarr" },
          "Set defaultIndividualTypentId to a positive integer on the ErpConnection to create individuals.",
        );
      }
      payload.typent_id = connection.defaultIndividualTypentId;
    }
    for (
      const f of [
        "tva_intra",
        "code_client",
        "email",
        "phone",
        "multicurrency_code",
      ]
    ) {
      const v = readOptionalStringArgument(args, f);
      if (v !== undefined) payload[f] = v;
    }
    if (mode === "preview") {
      return {
        content: {
          committed: false,
          doctype: "Dolibarr Thirdparty",
          resolved: payload,
        },
        summary: "Preview Dolibarr thirdparty create (not written)",
      };
    }
    const id = await client.createThirdparty(payload, ctx.signal);
    const nativeId = toDolibarrNativeId(id, name);
    return {
      content: {
        committed: true,
        doctype: "Dolibarr Thirdparty",
        nativeId,
        resolved: payload,
      },
      summary: `Created Dolibarr thirdparty ${nativeId}`,
    };
  }

  if (name === "dolibarr.product_create") {
    rejectUnsupportedArguments(name, args, [
      "mode",
      "label",
      "ref",
      "type",
      "price",
    ]);
    const mode = parseWriteMode(args);
    const payload: Record<string, unknown> = {
      label: readRequiredString(args, "label"),
      ref: readRequiredString(args, "ref"),
    };
    const type = readOptionalIntegerArgument(args, "type", { min: 0 });
    if (type !== undefined) payload.type = type;
    if (typeof args.price === "number") {
      payload.price = args.price;
      payload.price_base_type = "HT";
    }
    if (mode === "preview") {
      return {
        content: {
          committed: false,
          doctype: "Dolibarr Product",
          resolved: payload,
        },
        summary: "Preview Dolibarr product create (not written)",
      };
    }
    const id = await client.createProduct(payload, ctx.signal);
    const nativeId = toDolibarrNativeId(id, name);
    return {
      content: {
        committed: true,
        doctype: "Dolibarr Product",
        nativeId,
        resolved: payload,
      },
      summary: `Created Dolibarr product ${nativeId}`,
    };
  }

  if (name === "dolibarr.thirdparty_update") {
    rejectUnsupportedArguments(name, args, [
      "mode",
      "id",
      "name",
      "tva_intra",
      "code_client",
      "email",
      "phone",
      "multicurrency_code",
    ]);
    const mode = parseWriteMode(args);
    const id = readRequiredInteger(args, "id", { min: 1 });
    const payload: Record<string, unknown> = {};
    for (
      const f of [
        "name",
        "tva_intra",
        "code_client",
        "email",
        "phone",
        "multicurrency_code",
      ]
    ) {
      const v = readOptionalStringArgument(args, f);
      if (v !== undefined) payload[f] = v;
    }
    const nativeId = String(id);
    if (mode === "preview") {
      return {
        content: {
          committed: false,
          doctype: "Dolibarr Thirdparty",
          resolved: payload,
        },
        summary: "Preview Dolibarr thirdparty update (not written)",
      };
    }
    await client.updateThirdparty(id, payload, ctx.signal);
    return {
      content: {
        committed: true,
        doctype: "Dolibarr Thirdparty",
        nativeId,
        resolved: payload,
      },
      summary: `Updated Dolibarr thirdparty ${nativeId}`,
    };
  }

  if (name === "dolibarr.product_update") {
    rejectUnsupportedArguments(name, args, [
      "mode",
      "id",
      "label",
      "price",
      "type",
    ]);
    const mode = parseWriteMode(args);
    const id = readRequiredInteger(args, "id", { min: 1 });
    const payload: Record<string, unknown> = {};
    const label = readOptionalStringArgument(args, "label");
    if (label !== undefined) payload.label = label;
    const productType = readOptionalIntegerArgument(args, "type", {
      min: 0,
    });
    if (productType !== undefined) payload.type = productType;
    if (typeof args.price === "number") {
      payload.price = args.price;
      payload.price_base_type = "HT";
    }
    const nativeId = String(id);
    if (mode === "preview") {
      return {
        content: {
          committed: false,
          doctype: "Dolibarr Product",
          resolved: payload,
        },
        summary: "Preview Dolibarr product update (not written)",
      };
    }
    await client.updateProduct(id, payload, ctx.signal);
    return {
      content: {
        committed: true,
        doctype: "Dolibarr Product",
        nativeId,
        resolved: payload,
      },
      summary: `Updated Dolibarr product ${nativeId}`,
    };
  }

  if (name === "dolibarr.supplier_create") {
    rejectUnsupportedArguments(name, args, [
      "mode",
      "name",
      "tva_intra",
      "code_fournisseur",
      "email",
      "phone",
      "multicurrency_code",
    ]);
    const mode = parseWriteMode(args);
    const payload: Record<string, unknown> = {
      name: readRequiredString(args, "name"),
      fournisseur: 1,
    };
    for (
      const f of [
        "tva_intra",
        "code_fournisseur",
        "email",
        "phone",
        "multicurrency_code",
      ]
    ) {
      const v = readOptionalStringArgument(args, f);
      if (v !== undefined) payload[f] = v;
    }
    if (mode === "preview") {
      return {
        content: {
          committed: false,
          doctype: "Dolibarr Thirdparty",
          resolved: payload,
        },
        summary: "Preview Dolibarr supplier create (not written)",
      };
    }
    const id = await client.createThirdparty(payload, ctx.signal);
    const nativeId = toDolibarrNativeId(id, name);
    return {
      content: {
        committed: true,
        doctype: "Dolibarr Thirdparty",
        nativeId,
        resolved: payload,
      },
      summary: `Created Dolibarr supplier ${nativeId}`,
    };
  }

  if (name === "dolibarr.supplier_update") {
    rejectUnsupportedArguments(name, args, [
      "mode",
      "id",
      "name",
      "tva_intra",
      "code_fournisseur",
      "email",
      "phone",
      "multicurrency_code",
    ]);
    const mode = parseWriteMode(args);
    const id = readRequiredInteger(args, "id", { min: 1 });
    const payload: Record<string, unknown> = {};
    for (
      const f of [
        "name",
        "tva_intra",
        "code_fournisseur",
        "email",
        "phone",
        "multicurrency_code",
      ]
    ) {
      const v = readOptionalStringArgument(args, f);
      if (v !== undefined) payload[f] = v;
    }
    const nativeId = String(id);
    if (mode === "preview") {
      return {
        content: {
          committed: false,
          doctype: "Dolibarr Thirdparty",
          resolved: payload,
        },
        summary: "Preview Dolibarr supplier update (not written)",
      };
    }
    await client.updateThirdparty(id, payload, ctx.signal);
    return {
      content: {
        committed: true,
        doctype: "Dolibarr Thirdparty",
        nativeId,
        resolved: payload,
      },
      summary: `Updated Dolibarr supplier ${nativeId}`,
    };
  }

  if (name === "dolibarr.order_create") {
    rejectUnsupportedArguments(name, args, [
      "mode",
      "socid",
      "lines",
      "date",
      "delivery_date",
    ]);
    const mode = parseWriteMode(args);
    const socid = readRequiredInteger(args, "socid", { min: 1 });
    const lines = readNativeLines(args, name);
    const dateIso = resolveIsoDate(args, "date");
    const dateEpoch = isoToEpochSeconds(dateIso);
    const deliveryDateIso = optReadIsoDate(args, "delivery_date");
    const docPayload: Record<string, unknown> = {
      socid,
      date: dateEpoch,
    };
    if (deliveryDateIso !== undefined) {
      docPayload.delivery_date = isoToEpochSeconds(deliveryDateIso);
    }
    if (mode === "preview") {
      return {
        content: {
          committed: false,
          doctype: "Dolibarr Order",
          resolved: {
            ...docPayload,
            lines: lines.map((l) => buildPreviewLine(l)),
          },
        },
        summary: "Preview Dolibarr order create draft (not written)",
      };
    }
    const skuMap = await resolveSkus(lines, client, ctx.signal);
    const docId = toDolibarrNativeId(
      await client.createOrder(docPayload, ctx.signal),
      name,
    );
    await attachLines(
      client,
      "orders",
      Number(docId),
      lines,
      skuMap,
      ctx.signal,
    );
    return {
      content: {
        committed: true,
        doctype: "Dolibarr Order",
        nativeId: docId,
        resolved: docPayload,
      },
      summary: `Created Dolibarr order ${docId} draft`,
    };
  }

  if (name === "dolibarr.proposal_create") {
    rejectUnsupportedArguments(name, args, [
      "mode",
      "socid",
      "lines",
      "date",
      "valid_until",
    ]);
    const mode = parseWriteMode(args);
    const socid = readRequiredInteger(args, "socid", { min: 1 });
    const lines = readNativeLines(args, name);
    const dateIso = resolveIsoDate(args, "date");
    const dateEpoch = isoToEpochSeconds(dateIso);
    const validUntilIso = optReadIsoDate(args, "valid_until");
    const docPayload: Record<string, unknown> = {
      socid,
      date: dateEpoch,
    };
    if (validUntilIso !== undefined) {
      const dureeValidite = deriveDureeValidite(
        dateIso,
        validUntilIso,
        name,
      );
      docPayload.duree_validite = dureeValidite;
    }
    if (mode === "preview") {
      return {
        content: {
          committed: false,
          doctype: "Dolibarr Proposal",
          resolved: {
            ...docPayload,
            lines: lines.map((l) => buildPreviewLine(l)),
          },
        },
        summary: "Preview Dolibarr proposal create draft (not written)",
      };
    }
    const skuMap = await resolveSkus(lines, client, ctx.signal);
    const docId = toDolibarrNativeId(
      await client.createProposal(docPayload, ctx.signal),
      name,
    );
    await attachLines(
      client,
      "proposals",
      Number(docId),
      lines,
      skuMap,
      ctx.signal,
    );
    return {
      content: {
        committed: true,
        doctype: "Dolibarr Proposal",
        nativeId: docId,
        resolved: docPayload,
      },
      summary: `Created Dolibarr proposal ${docId} draft`,
    };
  }

  if (name === "dolibarr.invoice_create") {
    rejectUnsupportedArguments(name, args, [
      "mode",
      "socid",
      "lines",
      "date",
      "due_date",
    ]);
    const mode = parseWriteMode(args);
    const socid = readRequiredInteger(args, "socid", { min: 1 });
    const lines = readNativeLines(args, name);
    const dateIso = resolveIsoDate(args, "date");
    const dateEpoch = isoToEpochSeconds(dateIso);
    const dueDateIso = optReadIsoDate(args, "due_date");
    const docPayload: Record<string, unknown> = {
      socid,
      date: dateEpoch,
      type: 0,
    };
    if (dueDateIso !== undefined) {
      docPayload.date_lim_reglement = isoToEpochSeconds(dueDateIso);
    }
    if (mode === "preview") {
      return {
        content: {
          committed: false,
          doctype: "Dolibarr Invoice",
          resolved: {
            ...docPayload,
            lines: lines.map((l) => buildPreviewLine(l)),
          },
        },
        summary: "Preview Dolibarr invoice create draft (not written)",
      };
    }
    const skuMap = await resolveSkus(lines, client, ctx.signal);
    const docId = toDolibarrNativeId(
      await client.createInvoice(docPayload, ctx.signal),
      name,
    );
    await attachLines(
      client,
      "invoices",
      Number(docId),
      lines,
      skuMap,
      ctx.signal,
    );
    return {
      content: {
        committed: true,
        doctype: "Dolibarr Invoice",
        nativeId: docId,
        resolved: docPayload,
      },
      summary: `Created Dolibarr invoice ${docId} draft`,
    };
  }

  if (name === "dolibarr.order_validate") {
    rejectUnsupportedArguments(name, args, ["mode", "id"]);
    const mode = parseWriteMode(args);
    const id = readRequiredInteger(args, "id", { min: 1 });
    const idwarehouse = connection.defaultWarehouseId ?? 0;
    const body: Record<string, unknown> = { idwarehouse, notrigger: 0 };
    const nativeId = String(id);
    if (mode === "preview") {
      return {
        content: {
          committed: false,
          doctype: "Dolibarr Order",
          resolved: { endpoint: `/orders/${id}/validate`, body },
        },
        summary: "Preview Dolibarr order validate (not written)",
      };
    }
    const result = await client.validateDocument(
      "orders",
      id,
      body,
      ctx.signal,
    );
    if (result.kind === "already_validated") {
      throw new WriteError(
        "ALREADY_TRANSITIONED",
        { nativeId, docKind: "orders" },
        "fetch the document to see its current state",
      );
    }
    const statut = (result.body as Record<string, unknown>).statut;
    return {
      content: {
        committed: true,
        doctype: "Dolibarr Order",
        nativeId,
        resolved: { statut },
      },
      summary: `Validated Dolibarr order ${nativeId}`,
    };
  }

  if (name === "dolibarr.proposal_validate") {
    rejectUnsupportedArguments(name, args, ["mode", "id"]);
    const mode = parseWriteMode(args);
    const id = readRequiredInteger(args, "id", { min: 1 });
    // proposals do NOT accept idwarehouse — Dolibarr API ignores it there
    const body: Record<string, unknown> = { notrigger: 0 };
    const nativeId = String(id);
    if (mode === "preview") {
      return {
        content: {
          committed: false,
          doctype: "Dolibarr Proposal",
          resolved: { endpoint: `/proposals/${id}/validate`, body },
        },
        summary: "Preview Dolibarr proposal validate (not written)",
      };
    }
    const result = await client.validateDocument(
      "proposals",
      id,
      body,
      ctx.signal,
    );
    if (result.kind === "already_validated") {
      throw new WriteError(
        "ALREADY_TRANSITIONED",
        { nativeId, docKind: "proposals" },
        "fetch the document to see its current state",
      );
    }
    const statut = (result.body as Record<string, unknown>).statut;
    return {
      content: {
        committed: true,
        doctype: "Dolibarr Proposal",
        nativeId,
        resolved: { statut },
      },
      summary: `Validated Dolibarr proposal ${nativeId}`,
    };
  }

  if (name === "dolibarr.invoice_validate") {
    rejectUnsupportedArguments(name, args, ["mode", "id"]);
    const mode = parseWriteMode(args);
    const id = readRequiredInteger(args, "id", { min: 1 });
    const idwarehouse = connection.defaultWarehouseId ?? 0;
    const body: Record<string, unknown> = { idwarehouse, notrigger: 0 };
    const nativeId = String(id);
    if (mode === "preview") {
      return {
        content: {
          committed: false,
          doctype: "Dolibarr Invoice",
          resolved: { endpoint: `/invoices/${id}/validate`, body },
        },
        summary: "Preview Dolibarr invoice validate (not written)",
      };
    }
    const result = await client.validateDocument(
      "invoices",
      id,
      body,
      ctx.signal,
    );
    if (result.kind === "already_validated") {
      throw new WriteError(
        "ALREADY_TRANSITIONED",
        { nativeId, docKind: "invoices" },
        "fetch the document to see its current state",
      );
    }
    const statut = (result.body as Record<string, unknown>).statut;
    return {
      content: {
        committed: true,
        doctype: "Dolibarr Invoice",
        nativeId,
        resolved: { statut },
      },
      summary: `Validated Dolibarr invoice ${nativeId}`,
    };
  }

  return undefined;
}

// ── Helpers for sales-document creates ───────────────────────────────────────

interface DolibarrNativeLine {
  readonly sku: string;
  readonly qty: number;
  readonly subprice: number;
  readonly desc?: string;
}

const NATIVE_LINE_FIELDS = new Set(["sku", "qty", "subprice", "desc"]);

function readNativeLines(
  args: Record<string, unknown>,
  toolName: string,
): DolibarrNativeLine[] {
  const raw = args.lines;
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new WriteError(
      "EMPTY_LINES",
      { erpType: "dolibarr" },
      "lines must be a non-empty array of line items.",
    );
  }
  return raw.map((item, lineIndex) => {
    if (typeof item !== "object" || item === null || Array.isArray(item)) {
      throw new TypeError(
        `${toolName}: lines[${lineIndex}] must be a plain object`,
      );
    }
    const line = item as Record<string, unknown>;
    for (const k of Object.keys(line)) {
      if (!NATIVE_LINE_FIELDS.has(k)) {
        throw new TypeError(
          `${toolName}: lines[${lineIndex}] has unknown key '${k}'`,
        );
      }
    }
    if (typeof line.sku !== "string" || line.sku.length === 0) {
      throw new TypeError(
        `${toolName}: lines[${lineIndex}].sku must be a non-empty string`,
      );
    }
    if (
      typeof line.qty !== "number" || !Number.isFinite(line.qty) ||
      line.qty <= 0
    ) {
      throw new TypeError(
        `${toolName}: lines[${lineIndex}].qty must be a finite number > 0`,
      );
    }
    if (
      typeof line.subprice !== "number" || !Number.isFinite(line.subprice) ||
      line.subprice < 0
    ) {
      throw new TypeError(
        `${toolName}: lines[${lineIndex}].subprice must be a finite number >= 0`,
      );
    }
    if (line.desc !== undefined && typeof line.desc !== "string") {
      throw new TypeError(
        `${toolName}: lines[${lineIndex}].desc must be a string when provided`,
      );
    }
    const result: DolibarrNativeLine = {
      sku: line.sku,
      qty: line.qty,
      subprice: line.subprice,
    };
    if (typeof line.desc === "string") {
      return { ...result, desc: line.desc };
    }
    return result;
  });
}

const ISO_DATE_RE_NATIVE = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/;

function resolveIsoDate(
  args: Record<string, unknown>,
  field: string,
): string {
  const v = args[field];
  if (v === undefined) return new Date().toISOString().slice(0, 10);
  if (typeof v !== "string" || !ISO_DATE_RE_NATIVE.test(v)) {
    throw new TypeError(`${field} must be a valid ISO date (YYYY-MM-DD)`);
  }
  return v;
}

function optReadIsoDate(
  args: Record<string, unknown>,
  field: string,
): string | undefined {
  const v = args[field];
  if (v === undefined) return undefined;
  if (typeof v !== "string" || !ISO_DATE_RE_NATIVE.test(v)) {
    throw new TypeError(`${field} must be a valid ISO date (YYYY-MM-DD)`);
  }
  return v;
}

function isoToEpochSeconds(isoDate: string): number {
  return Math.floor(new Date(`${isoDate}T00:00:00Z`).getTime() / 1000);
}

function deriveDureeValidite(
  dateIso: string,
  validUntilIso: string,
  _toolName: string,
): number {
  const d1 = new Date(`${dateIso}T00:00:00Z`).getTime();
  const d2 = new Date(`${validUntilIso}T00:00:00Z`).getTime();
  const days = Math.floor((d2 - d1) / 86_400_000);
  if (days < 0) {
    throw new WriteError(
      "INVALID_DATE_RANGE",
      { field: "valid_until", date: dateIso, validUntil: validUntilIso },
      "valid_until must not be before the document date.",
    );
  }
  return days;
}

function buildPreviewLine(
  line: DolibarrNativeLine,
): Record<string, unknown> {
  const result: Record<string, unknown> = {
    fk_product: "<resolved-at-commit>",
    qty: line.qty,
    subprice: line.subprice,
  };
  if (line.desc !== undefined) result.desc = line.desc;
  return result;
}

async function resolveSkus(
  lines: DolibarrNativeLine[],
  client: DolibarrRestClient,
  signal?: AbortSignal,
): Promise<Map<string, { id: number; tva_tx?: string | number }>> {
  const distinctSkus = [...new Set(lines.map((l) => l.sku))];
  const skuMap = new Map<string, { id: number; tva_tx?: string | number }>();
  for (const sku of distinctSkus) {
    const product = await client.findProductByRef(sku, signal);
    if (product === undefined) {
      const lineIndex = lines.findIndex((l) => l.sku === sku);
      throw new WriteError(
        "LINE_PRODUCT_NOT_FOUND",
        { sku, lineIndex },
        `Product with ref '${sku}' not found in Dolibarr. Create the product first or fix the sku.`,
      );
    }
    skuMap.set(sku, product);
  }
  return skuMap;
}

async function attachLines(
  client: DolibarrRestClient,
  docKind: "orders" | "proposals" | "invoices",
  docId: number,
  lines: DolibarrNativeLine[],
  skuMap: Map<string, { id: number; tva_tx?: string | number }>,
  signal?: AbortSignal,
): Promise<void> {
  for (let k = 0; k < lines.length; k++) {
    const line = lines[k];
    const product = skuMap.get(line.sku)!;
    const linePayload: Record<string, unknown> = {
      fk_product: product.id,
      qty: line.qty,
      subprice: line.subprice,
    };
    if (line.desc !== undefined) linePayload.desc = line.desc;
    if (product.tva_tx !== undefined) linePayload.tva_tx = product.tva_tx;
    try {
      await client.addDocumentLine(docKind, docId, linePayload, signal);
    } catch {
      throw new WriteError(
        "LINES_FAILED",
        {
          nativeId: String(docId),
          lineIndex: k,
          attachedLines: k,
        },
        `Document draft (id ${docId}) is recoverable in the ERP; retry the failed and missing lines manually.`,
      );
    }
  }
}

function readRequiredString(
  args: Record<string, unknown>,
  name: string,
): string {
  const value = args[name];
  if (typeof value !== "string" || value.length === 0) {
    throw new TypeError(`${name} must be a non-empty string`);
  }
  return value;
}

function readRequiredInteger(
  args: Record<string, unknown>,
  name: string,
  options: { readonly min: number },
): number {
  const value = args[name];
  if (!Number.isInteger(value)) {
    throw new TypeError(`${name} must be an integer`);
  }
  const numberValue = value as number;
  if (numberValue < options.min) {
    throw new TypeError(`${name} must be >= ${options.min}`);
  }
  return numberValue;
}

function readOptionalStringArgument(
  args: Record<string, unknown>,
  name: string,
): string | undefined {
  const value = args[name];
  if (value === undefined) return undefined;
  if (typeof value !== "string" || value.length === 0) {
    throw new TypeError(`${name} must be a non-empty string`);
  }
  return value;
}

function readOptionalEnumArgument<T extends string>(
  args: Record<string, unknown>,
  name: string,
  allowedValues: readonly T[],
): T | undefined {
  const value = readOptionalStringArgument(args, name);
  if (value === undefined) return undefined;
  if (!allowedValues.includes(value as T)) {
    throw new TypeError(
      `${name} must be one of: ${allowedValues.join(", ")}`,
    );
  }
  return value as T;
}

function readOptionalIntegerArgument(
  args: Record<string, unknown>,
  name: string,
  options: { readonly min: number },
): number | undefined {
  const value = args[name];
  if (value === undefined) return undefined;
  if (!Number.isInteger(value)) {
    throw new TypeError(`${name} must be an integer`);
  }
  const numberValue = value as number;
  if (numberValue < options.min) {
    throw new TypeError(`${name} must be >= ${options.min}`);
  }
  return numberValue;
}

function toDolibarrNativeId(id: unknown, tool: string): string {
  if (typeof id === "number" && Number.isInteger(id) && id > 0) {
    return String(id);
  }
  if (typeof id === "string" && /^\d+$/.test(id)) {
    const n = Number(id);
    if (n > 0) return id;
  }
  throw new WriteError(
    "CREATE_FAILED",
    { erpType: "dolibarr", tool, response: id },
    "Dolibarr returned no valid numeric id after creation",
  );
}

function rejectUnsupportedArguments(
  toolName: string,
  args: Record<string, unknown>,
  allowedNames: readonly string[],
): void {
  for (const key of Object.keys(args)) {
    if (!allowedNames.includes(key)) {
      throw new TypeError(`Unsupported argument for ${toolName}: ${key}`);
    }
  }
}
