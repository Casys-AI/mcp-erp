import type { ErpConnection } from "../../../../domain/connection.ts";
import type {
  ErpToolCallContext,
  ErpToolCallResult,
} from "../../../../domain/adapter.ts";
import { parseWriteMode, WriteError } from "../../../../domain/write.ts";
import type { FrappeRestClient } from "../client.ts";

type ErpnextConnection = Extract<ErpConnection, { erpType: "erpnext" }>;

type ContactLinkDoctype = "Customer" | "Supplier";
type PrimaryContactField =
  | "customer_primary_contact"
  | "supplier_primary_contact";

export async function callErpnextWriteTool(
  params: {
    readonly name: string;
    readonly args: Record<string, unknown>;
    readonly ctx: ErpToolCallContext;
    readonly connection: ErpnextConnection;
    readonly client: FrappeRestClient;
  },
): Promise<ErpToolCallResult | undefined> {
  const { name, args, ctx, connection, client } = params;

  if (name === "erpnext.customer_create") {
    const customerName = readRequiredString(args, "customer_name");
    const payload: Record<string, unknown> = {
      customer_name: customerName,
      customer_type: readOptionalString(args, "customer_type", "Company"),
    };
    for (const f of ["tax_id", "default_currency"]) {
      const v = readOptionalStringArgument(args, f);
      if (v !== undefined) payload[f] = v;
    }
    if (connection.defaultCustomerGroup) {
      payload.customer_group = connection.defaultCustomerGroup;
    }
    if (connection.defaultTerritory) {
      payload.territory = connection.defaultTerritory;
    }

    return await createLinkedContactDocument({
      name,
      args,
      ctx,
      client,
      doctype: "Customer",
      nativeName: customerName,
      payload,
      primaryContactField: "customer_primary_contact",
      previewSummary: "Preview ERPNext Customer create (not written)",
      createdSummary: "Created ERPNext Customer",
    });
  }

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
    const created = await client.create("Item", payload, {
      signal: ctx.signal,
    });
    const nativeId = created.name;
    if (typeof nativeId !== "string" || nativeId.length === 0) {
      throw new WriteError(
        "CREATE_FAILED",
        { erpType: "erpnext", tool: name, response: created },
        "ERP returned no document name",
      );
    }
    return {
      content: {
        committed: true,
        doctype: "Item",
        nativeId,
        resolved: payload,
      },
      summary: `Created ERPNext Item ${nativeId}`,
    };
  }

  if (name === "erpnext.customer_update") {
    const mode = parseWriteMode(args);
    const nativeId = readRequiredString(args, "name");
    const payload: Record<string, unknown> = {};
    for (const f of ["customer_name", "tax_id", "default_currency"]) {
      const v = readOptionalStringArgument(args, f);
      if (v !== undefined) payload[f] = v;
    }

    return await updateLinkedContactDocument({
      name,
      args,
      ctx,
      client,
      doctype: "Customer",
      nativeId,
      displayName: String(payload.customer_name ?? nativeId),
      payload,
      primaryContactField: "customer_primary_contact",
      mode,
      previewSummary: "Preview ERPNext Customer update (not written)",
      updatedSummary: "Updated ERPNext Customer",
    });
  }

  if (name === "erpnext.item_update") {
    const mode = parseWriteMode(args);
    const nativeId = readRequiredString(args, "name");
    const payload: Record<string, unknown> = {};
    const itemName = readOptionalStringArgument(args, "item_name");
    if (itemName !== undefined) payload.item_name = itemName;
    if (typeof args.standard_rate === "number") {
      payload.standard_rate = args.standard_rate;
    }
    const stockUom = readOptionalStringArgument(args, "stock_uom");
    if (stockUom !== undefined) payload.stock_uom = stockUom;
    if (mode === "preview") {
      return {
        content: { committed: false, doctype: "Item", resolved: payload },
        summary: "Preview ERPNext Item update (not written)",
      };
    }
    const updated = await client.update("Item", nativeId, payload, {
      signal: ctx.signal,
    });
    if (typeof updated.name !== "string" || updated.name.length === 0) {
      throw new WriteError(
        "UPDATE_FAILED",
        { erpType: "erpnext", tool: name, response: updated },
        "ERP returned no document name",
      );
    }
    return {
      content: {
        committed: true,
        doctype: "Item",
        nativeId,
        resolved: payload,
      },
      summary: `Updated ERPNext Item ${nativeId}`,
    };
  }

  if (name === "erpnext.supplier_create") {
    const supplierName = readRequiredString(args, "supplier_name");
    const payload: Record<string, unknown> = {
      supplier_name: supplierName,
      supplier_type: readOptionalString(args, "supplier_type", "Company"),
    };
    const taxId = readOptionalStringArgument(args, "tax_id");
    if (taxId !== undefined) payload.tax_id = taxId;
    const defaultCurrency = readOptionalStringArgument(
      args,
      "default_currency",
    );
    if (defaultCurrency !== undefined) {
      payload.default_currency = defaultCurrency;
    }
    if (connection.defaultSupplierGroup) {
      payload.supplier_group = connection.defaultSupplierGroup;
    }

    return await createLinkedContactDocument({
      name,
      args,
      ctx,
      client,
      doctype: "Supplier",
      nativeName: supplierName,
      payload,
      primaryContactField: "supplier_primary_contact",
      previewSummary: "Preview ERPNext Supplier create (not written)",
      createdSummary: "Created ERPNext Supplier",
    });
  }

  if (name === "erpnext.supplier_update") {
    const mode = parseWriteMode(args);
    const nativeId = readRequiredString(args, "name");
    const payload: Record<string, unknown> = {};
    for (
      const f of [
        "supplier_name",
        "supplier_type",
        "tax_id",
        "default_currency",
      ]
    ) {
      const v = readOptionalStringArgument(args, f);
      if (v !== undefined) payload[f] = v;
    }

    return await updateLinkedContactDocument({
      name,
      args,
      ctx,
      client,
      doctype: "Supplier",
      nativeId,
      displayName: String(payload.supplier_name ?? nativeId),
      payload,
      primaryContactField: "supplier_primary_contact",
      mode,
      previewSummary: "Preview ERPNext Supplier update (not written)",
      updatedSummary: "Updated ERPNext Supplier",
    });
  }

  if (name === "erpnext.sales_order_create") {
    const mode = parseWriteMode(args);
    const customer = readRequiredString(args, "customer");
    const deliveryDate = readRequiredString(args, "delivery_date");
    const items = readNativeItemRows(args, name);
    const payload: Record<string, unknown> = {
      customer,
      delivery_date: deliveryDate,
      items,
    };
    const transactionDate = readOptionalStringArgument(
      args,
      "transaction_date",
    );
    if (transactionDate !== undefined) {
      payload.transaction_date = transactionDate;
    }
    if (connection.defaultCompany) payload.company = connection.defaultCompany;

    if (mode === "preview") {
      return {
        content: {
          committed: false,
          doctype: "Sales Order",
          resolved: payload,
        },
        summary: "Preview ERPNext Sales Order draft (not written)",
      };
    }
    const created = await client.create<Record<string, unknown>>(
      "Sales Order",
      payload,
      { signal: ctx.signal },
    );
    const nativeId = created.name;
    if (typeof nativeId !== "string" || nativeId.length === 0) {
      throw new WriteError(
        "CREATE_FAILED",
        { erpType: "erpnext", tool: name, response: created },
        "ERP returned no document name",
      );
    }
    return {
      content: {
        committed: true,
        doctype: "Sales Order",
        nativeId,
        resolved: payload,
      },
      summary: `Created ERPNext Sales Order draft ${nativeId}`,
    };
  }

  if (name === "erpnext.quotation_create") {
    const mode = parseWriteMode(args);
    const partyName = readRequiredString(args, "party_name");
    const items = readNativeItemRows(args, name);
    const payload: Record<string, unknown> = {
      quotation_to: "Customer",
      party_name: partyName,
      items,
    };
    const transactionDate = readOptionalStringArgument(
      args,
      "transaction_date",
    );
    if (transactionDate !== undefined) {
      payload.transaction_date = transactionDate;
    }
    const validTill = readOptionalStringArgument(args, "valid_till");
    if (validTill !== undefined) payload.valid_till = validTill;
    if (connection.defaultCompany) payload.company = connection.defaultCompany;

    if (mode === "preview") {
      return {
        content: { committed: false, doctype: "Quotation", resolved: payload },
        summary: "Preview ERPNext Quotation draft (not written)",
      };
    }
    const created = await client.create<Record<string, unknown>>(
      "Quotation",
      payload,
      { signal: ctx.signal },
    );
    const nativeId = created.name;
    if (typeof nativeId !== "string" || nativeId.length === 0) {
      throw new WriteError(
        "CREATE_FAILED",
        { erpType: "erpnext", tool: name, response: created },
        "ERP returned no document name",
      );
    }
    return {
      content: {
        committed: true,
        doctype: "Quotation",
        nativeId,
        resolved: payload,
      },
      summary: `Created ERPNext Quotation draft ${nativeId}`,
    };
  }

  if (name === "erpnext.sales_order_submit") {
    return await handleErpnextDocSubmit({
      args,
      ctx,
      client,
      doctype: "Sales Order",
    });
  }

  if (name === "erpnext.quotation_submit") {
    return await handleErpnextDocSubmit({
      args,
      ctx,
      client,
      doctype: "Quotation",
    });
  }

  if (name === "erpnext.sales_invoice_submit") {
    return await handleErpnextDocSubmit({
      args,
      ctx,
      client,
      doctype: "Sales Invoice",
    });
  }

  if (name === "erpnext.sales_invoice_create") {
    const mode = parseWriteMode(args);
    const customer = readRequiredString(args, "customer");
    const items = readNativeItemRows(args, name);
    const payload: Record<string, unknown> = { customer, items };
    const postingDate = readOptionalStringArgument(args, "posting_date");
    if (postingDate !== undefined) payload.posting_date = postingDate;
    const dueDate = readOptionalStringArgument(args, "due_date");
    if (dueDate !== undefined) payload.due_date = dueDate;
    if (connection.defaultCompany) payload.company = connection.defaultCompany;

    if (mode === "preview") {
      return {
        content: {
          committed: false,
          doctype: "Sales Invoice",
          resolved: payload,
        },
        summary: "Preview ERPNext Sales Invoice draft (not written)",
      };
    }
    const created = await client.create<Record<string, unknown>>(
      "Sales Invoice",
      payload,
      { signal: ctx.signal },
    );
    const nativeId = created.name;
    if (typeof nativeId !== "string" || nativeId.length === 0) {
      throw new WriteError(
        "CREATE_FAILED",
        { erpType: "erpnext", tool: name, response: created },
        "ERP returned no document name",
      );
    }
    return {
      content: {
        committed: true,
        doctype: "Sales Invoice",
        nativeId,
        resolved: payload,
      },
      summary: `Created ERPNext Sales Invoice draft ${nativeId}`,
    };
  }

  return undefined;
}

/**
 * Shared submit handler for ERPNext sales documents.
 *
 * Preview: returns the native plan (doctype/name/method) with no HTTP.
 * Commit: GET full current doc → POST frappe.client.submit (embedded
 * `modified` acts as the optimistic lock). The post-state (`docstatus` /
 * `status`) is included in `resolved` so the normalised layer can map
 * `lifecycleState`.
 */
async function handleErpnextDocSubmit(params: {
  readonly args: Record<string, unknown>;
  readonly ctx: ErpToolCallContext;
  readonly client: FrappeRestClient;
  readonly doctype: "Sales Order" | "Quotation" | "Sales Invoice";
}): Promise<ErpToolCallResult> {
  const { args, ctx, client, doctype } = params;
  const mode = parseWriteMode(args);
  const docName = readRequiredString(args, "name");

  if (mode === "preview") {
    return {
      content: {
        committed: false,
        doctype,
        resolved: {
          doctype,
          name: docName,
          method: "frappe.client.submit",
        },
      },
      summary: `Preview ERPNext ${doctype} submit (not written)`,
    };
  }

  // commit: GET full doc (carries `modified` for optimistic lock) → submit
  const doc = await client.get<Record<string, unknown>>(doctype, docName, {
    signal: ctx.signal,
  });
  const submitted = await client.submitDoc(doc, { signal: ctx.signal });

  return {
    content: {
      committed: true,
      doctype,
      nativeId: docName,
      resolved: {
        doctype,
        name: docName,
        method: "frappe.client.submit",
        docstatus: submitted.docstatus,
        status: submitted.status,
      },
    },
    summary: `Submitted ERPNext ${doctype} ${docName}`,
  };
}

function readNativeItemRows(
  args: Record<string, unknown>,
  toolName: string,
): Array<Record<string, unknown>> {
  const raw = args.items;
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new WriteError(
      "INVALID_ARGS",
      { field: "items", tool: toolName },
      "'items' must be a non-empty array.",
    );
  }
  return raw.map((row, index) => {
    if (typeof row !== "object" || row === null || Array.isArray(row)) {
      throw new TypeError(`items[${index}] must be a plain object`);
    }
    const item = row as Record<string, unknown>;
    const itemCode = readRequiredString(item, "item_code");
    const qty = item.qty;
    if (typeof qty !== "number" || !Number.isFinite(qty) || qty <= 0) {
      throw new TypeError(`items[${index}].qty must be a finite number > 0`);
    }
    const rate = item.rate;
    if (typeof rate !== "number" || !Number.isFinite(rate) || rate < 0) {
      throw new TypeError(`items[${index}].rate must be a finite number >= 0`);
    }
    const result: Record<string, unknown> = {
      item_code: itemCode,
      qty: qty as number,
      rate: rate as number,
    };
    const desc = readOptionalStringArgument(item, "description");
    if (desc !== undefined) result.description = desc;
    return result;
  });
}

async function createLinkedContactDocument(
  params: {
    readonly name: string;
    readonly args: Record<string, unknown>;
    readonly ctx: ErpToolCallContext;
    readonly client: FrappeRestClient;
    readonly doctype: ContactLinkDoctype;
    readonly nativeName: string;
    readonly payload: Record<string, unknown>;
    readonly primaryContactField: PrimaryContactField;
    readonly previewSummary: string;
    readonly createdSummary: string;
  },
): Promise<ErpToolCallResult> {
  const {
    name,
    args,
    ctx,
    client,
    doctype,
    nativeName,
    payload,
    primaryContactField,
    previewSummary,
    createdSummary,
  } = params;
  const mode = parseWriteMode(args);
  const email = readOptionalStringArgument(args, "email");
  const phone = readOptionalStringArgument(args, "phone");
  const contactPayload = (email || phone)
    ? client.buildContactPayload(doctype, "<pending>", {
      firstName: nativeName,
      email,
      phone,
    })
    : null;

  if (mode === "preview") {
    return {
      content: {
        committed: false,
        doctype,
        resolved: {
          document: payload,
          contact: contactPayload,
          ...(email || phone ? { primaryContactField } : {}),
        },
      },
      summary: previewSummary,
    };
  }

  const created = await client.create(doctype, payload, {
    signal: ctx.signal,
  });
  const nativeId = created.name;
  if (typeof nativeId !== "string" || nativeId.length === 0) {
    throw new WriteError(
      "CREATE_FAILED",
      { erpType: "erpnext", tool: name, response: created },
      "ERP returned no document name",
    );
  }

  if (email || phone) {
    try {
      const contactName = await client.createContact(
        doctype,
        nativeId,
        { firstName: nativeName, email, phone },
        { signal: ctx.signal },
      );
      await client.update(
        doctype,
        nativeId,
        { [primaryContactField]: contactName },
        { signal: ctx.signal },
      );
    } catch (err) {
      throw new WriteError(
        "CONTACT_FAILED",
        {
          nativeId,
          erpType: "erpnext",
          tool: name,
          contactError: err instanceof Error ? err.message : String(err),
        },
        "Document created (see nativeId) but linked contact failed; create/fix the contact manually or retry",
      );
    }
  }

  return {
    content: {
      committed: true,
      doctype,
      nativeId,
      resolved: payload,
    },
    summary: `${createdSummary} ${nativeId}`,
  };
}

async function updateLinkedContactDocument(
  params: {
    readonly name: string;
    readonly args: Record<string, unknown>;
    readonly ctx: ErpToolCallContext;
    readonly client: FrappeRestClient;
    readonly doctype: ContactLinkDoctype;
    readonly nativeId: string;
    readonly displayName: string;
    readonly payload: Record<string, unknown>;
    readonly primaryContactField: PrimaryContactField;
    readonly mode: "preview" | "commit";
    readonly previewSummary: string;
    readonly updatedSummary: string;
  },
): Promise<ErpToolCallResult> {
  const {
    name,
    args,
    ctx,
    client,
    doctype,
    nativeId,
    displayName,
    payload,
    primaryContactField,
    mode,
    previewSummary,
    updatedSummary,
  } = params;
  const email = readOptionalStringArgument(args, "email");
  const phone = readOptionalStringArgument(args, "phone");
  const contactPayload = (email || phone)
    ? client.buildContactPayload(doctype, nativeId, {
      firstName: displayName,
      email,
      phone,
    })
    : null;

  if (mode === "preview") {
    return {
      content: {
        committed: false,
        doctype,
        resolved: {
          document: payload,
          contact: contactPayload,
          ...(email || phone ? { primaryContactField } : {}),
        },
      },
      summary: previewSummary,
    };
  }

  const updated = await client.update(doctype, nativeId, payload, {
    signal: ctx.signal,
  });
  if (typeof updated.name !== "string" || updated.name.length === 0) {
    throw new WriteError(
      "UPDATE_FAILED",
      { erpType: "erpnext", tool: name, response: updated },
      "ERP returned no document name",
    );
  }

  if (email || phone) {
    try {
      const existingContact = await client.findPrimaryContact(
        doctype,
        nativeId,
        { signal: ctx.signal },
      );
      if (existingContact) {
        await client.updateContact(
          existingContact.name,
          { email, phone },
          {
            signal: ctx.signal,
          },
        );
        if (!existingContact.isPrimary) {
          await client.update(
            "Contact",
            existingContact.name,
            { is_primary_contact: 1 },
            { signal: ctx.signal },
          );
          await client.update(
            doctype,
            nativeId,
            { [primaryContactField]: existingContact.name },
            { signal: ctx.signal },
          );
        }
      } else {
        const contactName = await client.createContact(
          doctype,
          nativeId,
          {
            firstName: displayName,
            email,
            phone,
          },
          { signal: ctx.signal },
        );
        await client.update(
          doctype,
          nativeId,
          { [primaryContactField]: contactName },
          { signal: ctx.signal },
        );
      }
    } catch (err) {
      throw new WriteError(
        "CONTACT_FAILED",
        {
          nativeId,
          erpType: "erpnext",
          tool: name,
          contactError: err instanceof Error ? err.message : String(err),
        },
        "Document updated (see nativeId) but linked contact failed; create/fix the contact manually or retry",
      );
    }
  }

  return {
    content: {
      committed: true,
      doctype,
      nativeId,
      resolved: payload,
    },
    summary: `${updatedSummary} ${nativeId}`,
  };
}

function readOptionalInteger(
  args: Record<string, unknown>,
  name: string,
  defaultValue: number,
  options: { readonly min: number; readonly max?: number },
): number {
  const value = args[name];
  if (value === undefined) return defaultValue;
  if (!Number.isInteger(value)) {
    throw new TypeError(`${name} must be an integer`);
  }
  const numberValue = value as number;
  if (numberValue < options.min) {
    throw new TypeError(`${name} must be >= ${options.min}`);
  }
  if (options.max !== undefined && numberValue > options.max) {
    throw new TypeError(`${name} must be <= ${options.max}`);
  }
  return numberValue;
}

function readOptionalString(
  args: Record<string, unknown>,
  name: string,
  defaultValue: string,
): string {
  const value = args[name];
  if (value === undefined) return defaultValue;
  if (typeof value !== "string" || value.length === 0) {
    throw new TypeError(`${name} must be a non-empty string`);
  }
  return value;
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
