import { assert, assertEquals } from "@std/assert";
import {
  ERP_TYPES,
  mapErpNextLifecycle,
  UnknownToolError,
  WRITE_CAPABILITIES,
} from "./domain/mod.ts";
import { BUSINESS_PARTY_TOOLS } from "./features/business-party/business-party.contract.ts";
import { callBusinessPartyTool } from "./features/business-party/business-party.handler.ts";
import { CUSTOMER_TOOLS } from "./features/customer/customer.contract.ts";
import {
  mapCustomerCreateToDolibarr,
  mapCustomerUpdateToDolibarr,
} from "./features/customer/mappers/dolibarr.ts";
import { callCustomerTool } from "./features/customer/customer.handler.ts";
import {
  mapCustomerCreateToErpNext,
  mapCustomerUpdateToErpNext,
} from "./features/customer/mappers/erpnext.ts";
import { INVOICE_TOOLS } from "./features/invoice/invoice.contract.ts";
import { callInvoiceTool } from "./features/invoice/invoice.handler.ts";
import {
  mapSalesInvoiceCreateToDolibarr,
  mapSalesInvoiceSubmitToDolibarr,
  normalizeDolibarrInvoice,
} from "./features/invoice/mappers/dolibarr.ts";
import {
  mapSalesInvoiceCreateToErpNext,
  mapSalesInvoiceSubmitToErpNext,
  normalizeErpNextSalesInvoice,
} from "./features/invoice/mappers/erpnext.ts";
import { PRODUCT_TOOLS } from "./features/product/product.contract.ts";
import { callProductTool } from "./features/product/product.handler.ts";
import { mapProductCreateToDolibarr } from "./features/product/mappers/dolibarr.ts";
import { mapProductCreateToErpNext } from "./features/product/mappers/erpnext.ts";
import { QUOTATION_TOOLS } from "./features/quotation/quotation.contract.ts";
import {
  mapQuotationCreateToDolibarr,
  mapQuotationSubmitToDolibarr,
  normalizeDolibarrProposal,
} from "./features/quotation/mappers/dolibarr.ts";
import {
  mapQuotationCreateToErpNext,
  mapQuotationSubmitToErpNext,
  normalizeErpNextQuotation,
} from "./features/quotation/mappers/erpnext.ts";
import { SALES_ORDER_TOOLS } from "./features/sales-order/sales-order.contract.ts";
import {
  mapSalesOrderCreateToDolibarr,
  mapSalesOrderSubmitToDolibarr,
  normalizeDolibarrOrder,
} from "./features/sales-order/mappers/dolibarr.ts";
import {
  mapSalesOrderCreateToErpNext,
  mapSalesOrderSubmitToErpNext,
  normalizeErpNextSalesOrder,
} from "./features/sales-order/mappers/erpnext.ts";
import { callQuotationTool } from "./features/quotation/quotation.handler.ts";
import { callSalesOrderTool } from "./features/sales-order/sales-order.handler.ts";
import { SUPPLIER_TOOLS } from "./features/supplier/supplier.contract.ts";
import { callSupplierTool } from "./features/supplier/supplier.handler.ts";
import { mapSupplierCreateToDolibarr } from "./features/supplier/mappers/dolibarr.ts";
import { mapSupplierCreateToErpNext } from "./features/supplier/mappers/erpnext.ts";
import { createDolibarrAdapter } from "./platform/erp/dolibarr/adapter.ts";
import { DolibarrRestClient } from "./platform/erp/dolibarr/client.ts";
import {
  DOLIBARR_TOOL_GROUPS,
  DOLIBARR_TOOLS,
} from "./platform/erp/dolibarr/tools.ts";
import { callDolibarrDiagnosticsTool } from "./platform/erp/dolibarr/handlers/diagnostics.ts";
import { callDolibarrBusinessPartyTool } from "./platform/erp/dolibarr/handlers/business-parties.ts";
import { callDolibarrCatalogTool } from "./platform/erp/dolibarr/handlers/catalog.ts";
import { callDolibarrDocumentTool } from "./platform/erp/dolibarr/handlers/documents.ts";
import { callDolibarrAccountingTool } from "./platform/erp/dolibarr/handlers/accounting.ts";
import { callDolibarrInventoryTool } from "./platform/erp/dolibarr/handlers/inventory.ts";
import { callDolibarrWriteTool } from "./platform/erp/dolibarr/handlers/writes.ts";
import { createErpnextAdapter } from "./platform/erp/erpnext/adapter.ts";
import { FrappeRestClient } from "./platform/erp/erpnext/client.ts";
import {
  ERPNEXT_TOOL_GROUPS,
  ERPNEXT_TOOLS,
} from "./platform/erp/erpnext/tools.ts";
import { callErpnextDiagnosticsTool } from "./platform/erp/erpnext/handlers/diagnostics.ts";
import { callErpnextBusinessPartyTool } from "./platform/erp/erpnext/handlers/business-parties.ts";
import { callErpnextCatalogTool } from "./platform/erp/erpnext/handlers/catalog.ts";
import { callErpnextDocumentTool } from "./platform/erp/erpnext/handlers/documents.ts";
import { callErpnextAccountingTool } from "./platform/erp/erpnext/handlers/accounting.ts";
import { callErpnextInventoryTool } from "./platform/erp/erpnext/handlers/inventory.ts";
import { callErpnextWriteTool } from "./platform/erp/erpnext/handlers/writes.ts";
import { ErpToolsClient } from "./platform/mcp/client.ts";
import { ERP_VIEWERS } from "./platform/viewers/viewers.ts";

Deno.test("architecture slices — domain re-exports the transverse contracts", () => {
  assertEquals(ERP_TYPES, ["erpnext", "dolibarr"]);
  assertEquals(
    mapErpNextLifecycle("Unpaid", "Sales Invoice"),
    "open",
  );
  assertEquals(
    WRITE_CAPABILITIES.erpnext.tools.includes("erp.customer_create"),
    true,
  );
  const err = new UnknownToolError("erpnext", "erpnext.missing_tool");
  assertEquals(err.name, "UnknownToolError");
});

Deno.test("architecture slices — customer contract owns normalized customer tools", () => {
  assertEquals(
    CUSTOMER_TOOLS.map((tool) => tool.name),
    ["erp.customer_create", "erp.customer_update"],
  );
  for (const tool of CUSTOMER_TOOLS) {
    assertEquals(tool.inputSchema.type, "object");
    assertEquals(tool.inputSchema.additionalProperties, false);
  }
});

Deno.test("architecture slices — business-party feature owns normalized read tools", () => {
  assertEquals(
    BUSINESS_PARTY_TOOLS.map((tool) => tool.name),
    ["erp.business_party_list", "erp.business_party_get"],
  );
  assertEquals(typeof callBusinessPartyTool, "function");
});

Deno.test("architecture slices — ERPNext customer mapper preserves Contact intent", () => {
  const createPlan = mapCustomerCreateToErpNext({
    mode: "preview",
    name: "Ada Lovelace",
    kind: "individual",
    taxId: "GB-123",
    email: "ada@example.com",
    phone: "+44 20 0000 0000",
    currency: "GBP",
  });

  assertEquals(createPlan.toolName, "erpnext.customer_create");
  assertEquals(createPlan.args, {
    mode: "preview",
    customer_name: "Ada Lovelace",
    customer_type: "Individual",
    tax_id: "GB-123",
    email: "ada@example.com",
    phone: "+44 20 0000 0000",
    default_currency: "GBP",
  });
  assertEquals(createPlan.contact, {
    linkDoctype: "Customer",
    linkName: "<pending>",
    firstName: "Ada Lovelace",
    email: "ada@example.com",
    phone: "+44 20 0000 0000",
    primaryContactField: "customer_primary_contact",
  });

  const updatePlan = mapCustomerUpdateToErpNext({
    mode: "preview",
    nativeId: "CUST-001",
    email: "ops@example.com",
  });

  assertEquals(updatePlan.toolName, "erpnext.customer_update");
  assertEquals(updatePlan.args, {
    mode: "preview",
    name: "CUST-001",
    email: "ops@example.com",
  });
  assertEquals(updatePlan.contact?.linkName, "CUST-001");
});

Deno.test("architecture slices — Dolibarr customer mapper preserves thirdparty fields", () => {
  const createPlan = mapCustomerCreateToDolibarr({
    mode: "preview",
    name: "Client SA",
    kind: "company",
    taxId: "FR-123",
    externalRef: "CLI-001",
    email: "contact@example.fr",
    phone: "+33 1 00 00 00 00",
    currency: "EUR",
  });

  assertEquals(createPlan.toolName, "dolibarr.thirdparty_create");
  assertEquals(createPlan.args, {
    mode: "preview",
    name: "Client SA",
    kind: "company",
    tva_intra: "FR-123",
    code_client: "CLI-001",
    email: "contact@example.fr",
    phone: "+33 1 00 00 00 00",
    multicurrency_code: "EUR",
  });

  const updatePlan = mapCustomerUpdateToDolibarr({
    mode: "preview",
    nativeId: 42,
    name: "Client Renamed",
    externalRef: "CLI-042",
  });

  assertEquals(updatePlan.toolName, "dolibarr.thirdparty_update");
  assertEquals(updatePlan.args, {
    mode: "preview",
    id: 42,
    name: "Client Renamed",
    code_client: "CLI-042",
  });
});

Deno.test("architecture slices — customer feature owns normalized customer handler", () => {
  assertEquals(typeof callCustomerTool, "function");
});

Deno.test("architecture slices — product contract and mappers own catalog item writes", () => {
  assertEquals(
    PRODUCT_TOOLS.map((tool) => tool.name),
    [
      "erp.catalog_item_list",
      "erp.catalog_item_get",
      "erp.product_create",
      "erp.product_update",
    ],
  );

  assertEquals(
    mapProductCreateToErpNext({
      mode: "preview",
      name: "Implementation",
      sku: "SERV-001",
      kind: "service",
      unitPrice: 1200,
      uom: "Hour",
    }),
    {
      toolName: "erpnext.item_create",
      args: {
        mode: "preview",
        item_name: "Implementation",
        item_code: "SERV-001",
        is_stock_item: 0,
        standard_rate: 1200,
        stock_uom: "Hour",
      },
    },
  );

  assertEquals(
    mapProductCreateToDolibarr({
      mode: "preview",
      name: "Widget",
      sku: "W-001",
      kind: "product",
      unitPrice: 99,
    }),
    {
      toolName: "dolibarr.product_create",
      args: {
        mode: "preview",
        label: "Widget",
        ref: "W-001",
        type: 0,
        price: 99,
      },
    },
  );
});

Deno.test("architecture slices — product feature owns normalized product handler", () => {
  assertEquals(typeof callProductTool, "function");
});

Deno.test("architecture slices — supplier contract and mappers own supplier writes", () => {
  assertEquals(
    SUPPLIER_TOOLS.map((tool) => tool.name),
    ["erp.supplier_create", "erp.supplier_update"],
  );

  const erpnextPlan = mapSupplierCreateToErpNext({
    mode: "preview",
    name: "Parts Co",
    taxId: "VAT-1",
    email: "parts@example.com",
    phone: "+1 555 0000",
    currency: "USD",
  });
  assertEquals(erpnextPlan.toolName, "erpnext.supplier_create");
  assertEquals(erpnextPlan.args, {
    mode: "preview",
    supplier_name: "Parts Co",
    tax_id: "VAT-1",
    email: "parts@example.com",
    phone: "+1 555 0000",
    default_currency: "USD",
  });
  assertEquals(
    erpnextPlan.contact?.primaryContactField,
    "supplier_primary_contact",
  );

  assertEquals(
    mapSupplierCreateToDolibarr({
      mode: "preview",
      name: "Parts Co",
      taxId: "VAT-1",
      externalRef: "SUP-1",
      email: "parts@example.com",
      phone: "+1 555 0000",
      currency: "USD",
    }),
    {
      toolName: "dolibarr.supplier_create",
      args: {
        mode: "preview",
        name: "Parts Co",
        tva_intra: "VAT-1",
        code_fournisseur: "SUP-1",
        email: "parts@example.com",
        phone: "+1 555 0000",
        multicurrency_code: "USD",
      },
    },
  );
});

Deno.test("architecture slices — supplier feature owns normalized supplier handler", () => {
  assertEquals(typeof callSupplierTool, "function");
});

Deno.test("architecture slices — document contracts and mappers own normalized reads", () => {
  assertEquals(
    INVOICE_TOOLS.map((tool) => tool.name),
    [
      "erp.sales_invoice_get",
      "erp.sales_invoice_create",
      "erp.sales_invoice_submit",
    ],
  );
  assertEquals(
    SALES_ORDER_TOOLS.map((tool) => tool.name),
    ["erp.sales_order_get", "erp.sales_order_create", "erp.sales_order_submit"],
  );
  assertEquals(
    QUOTATION_TOOLS.map((tool) => tool.name),
    ["erp.quotation_get", "erp.quotation_create", "erp.quotation_submit"],
  );

  assertEquals(
    normalizeErpNextSalesInvoice({
      name: "SINV-001",
      status: "Unpaid",
      customer: "Client SA",
      posting_date: "2026-01-10",
      due_date: "2026-02-10",
      grand_total: 1200,
      currency: "EUR",
    }).data,
    {
      ref: "SINV-001",
      partyName: "Client SA",
      grandTotal: 1200,
      currency: "EUR",
      date: "2026-01-10",
      dueDate: "2026-02-10",
    },
  );

  assertEquals(
    normalizeDolibarrInvoice({
      id: 42,
      ref: "FA2601-001",
      statut: 1,
      socname: "Client SA",
      datef: "2026-01-10",
      date_lim_reglement: "2026-02-10",
      total_ttc: 1200,
      currency: "EUR",
    }).data,
    {
      ref: "FA2601-001",
      partyName: "Client SA",
      grandTotal: 1200,
      currency: "EUR",
      date: "2026-01-10",
      dueDate: "2026-02-10",
    },
  );

  assertEquals(
    normalizeErpNextSalesOrder({
      name: "SO-001",
      status: "To Deliver and Bill",
      customer: "Client SA",
      transaction_date: "2026-01-11",
      delivery_date: "2026-01-20",
      grand_total: 900,
      currency: "EUR",
    }).lifecycleState,
    "open",
  );
  assertEquals(
    normalizeDolibarrOrder({
      id: 43,
      ref: "CO2601-001",
      statut: 3,
      socname: "Client SA",
      date_commande: "2026-01-11",
      date_livraison: "2026-01-20",
      total_ttc: 900,
      currency: "EUR",
    }).data.dueDate,
    "2026-01-20",
  );

  assertEquals(
    normalizeErpNextQuotation({
      name: "QTN-001",
      status: "Ordered",
      party_name: "Prospect SA",
      transaction_date: "2026-01-12",
      valid_till: "2026-02-12",
      grand_total: 700,
      currency: "EUR",
    }).lifecycleState,
    "closed",
  );
  assertEquals(
    normalizeDolibarrProposal({
      id: 44,
      ref: "PR2601-001",
      statut: 2,
      socname: "Prospect SA",
      datep: "2026-01-12",
      fin_validite: "2026-02-12",
      total_ttc: 700,
      currency: "EUR",
    }).data.dueDate,
    "2026-02-12",
  );
});

Deno.test("architecture slices — document features own normalized read handlers", () => {
  assertEquals(typeof callInvoiceTool, "function");
  assertEquals(typeof callSalesOrderTool, "function");
  assertEquals(typeof callQuotationTool, "function");
});

Deno.test("architecture slices — sales document create contracts have strict schemas", () => {
  const createTools = [
    SALES_ORDER_TOOLS.find((t) => t.name === "erp.sales_order_create")!,
    QUOTATION_TOOLS.find((t) => t.name === "erp.quotation_create")!,
    INVOICE_TOOLS.find((t) => t.name === "erp.sales_invoice_create")!,
  ];

  for (const tool of createTools) {
    const schema = tool.inputSchema;
    assertEquals(schema.type, "object");
    assertEquals(schema.additionalProperties, false);
    assertEquals(
      (schema.required as string[]).includes("mode"),
      true,
      `${tool.name}: mode not required`,
    );
    assertEquals(
      (schema.required as string[]).includes("customerId"),
      true,
      `${tool.name}: customerId not required`,
    );
    assertEquals(
      (schema.required as string[]).includes("lines"),
      true,
      `${tool.name}: lines not required`,
    );

    const linesSchema = (schema.properties as Record<string, unknown>)
      .lines as Record<string, unknown>;
    assertEquals(linesSchema.type, "array");
    assertEquals(linesSchema.minItems, 1);

    const itemsSchema = linesSchema.items as Record<string, unknown>;
    assertEquals(itemsSchema.type, "object");
    assertEquals(itemsSchema.additionalProperties, false);
    assertEquals(
      ((itemsSchema.required as string[]) ?? []).includes("sku"),
      true,
    );
    assertEquals(
      ((itemsSchema.required as string[]) ?? []).includes("qty"),
      true,
    );
    assertEquals(
      ((itemsSchema.required as string[]) ?? []).includes("unitPrice"),
      true,
    );

    assertEquals(tool.annotations?.readOnlyHint, false);
    assertEquals(tool.annotations?.destructiveHint, false);
  }

  // per-doc optional date fields present
  assert(
    "deliveryDate" in
      ((SALES_ORDER_TOOLS.find((t) => t.name === "erp.sales_order_create")!
        .inputSchema.properties) as Record<string, unknown>),
  );
  assert(
    "validUntil" in
      ((QUOTATION_TOOLS.find((t) => t.name === "erp.quotation_create")!
        .inputSchema.properties) as Record<string, unknown>),
  );
  assert(
    "dueDate" in
      ((INVOICE_TOOLS.find((t) => t.name === "erp.sales_invoice_create")!
        .inputSchema.properties) as Record<string, unknown>),
  );
});

Deno.test("architecture slices — sales_order_create mappers produce correct native plans", () => {
  // ERPNext: customer, delivery_date (req), items, transaction_date
  const erpnextPlan = mapSalesOrderCreateToErpNext({
    mode: "commit",
    customerId: "CUST-001",
    lines: [
      { sku: "ITEM-1", qty: 2, unitPrice: 100, description: "Widget" },
      { sku: "ITEM-2", qty: 1, unitPrice: 50 },
    ],
    date: "2026-07-10",
    deliveryDate: "2026-07-20",
  });
  assertEquals(erpnextPlan.toolName, "erpnext.sales_order_create");
  assertEquals(erpnextPlan.args.mode, "commit");
  assertEquals(erpnextPlan.args.customer, "CUST-001");
  assertEquals(erpnextPlan.args.delivery_date, "2026-07-20");
  assertEquals(erpnextPlan.args.transaction_date, "2026-07-10");
  assertEquals(erpnextPlan.args.items, [
    { item_code: "ITEM-1", qty: 2, rate: 100, description: "Widget" },
    { item_code: "ITEM-2", qty: 1, rate: 50 },
  ]);

  // Dolibarr: socid, lines (sku/qty/subprice/desc), date, delivery_date
  const dolibarrPlan = mapSalesOrderCreateToDolibarr(
    {
      mode: "commit",
      customerId: "7",
      lines: [{ sku: "REF-1", qty: 3, unitPrice: 25, description: "Vis" }],
      date: "2026-07-10",
      deliveryDate: "2026-07-30",
    },
    7,
  );
  assertEquals(dolibarrPlan.toolName, "dolibarr.order_create");
  assertEquals(dolibarrPlan.args.mode, "commit");
  assertEquals(dolibarrPlan.args.socid, 7);
  assertEquals(dolibarrPlan.args.date, "2026-07-10");
  assertEquals(dolibarrPlan.args.delivery_date, "2026-07-30");
  assertEquals(dolibarrPlan.args.lines, [
    { sku: "REF-1", qty: 3, subprice: 25, desc: "Vis" },
  ]);

  // No date → key absent (native handler defaults to today)
  const planNoDate = mapSalesOrderCreateToDolibarr(
    {
      mode: "preview",
      customerId: "7",
      lines: [{ sku: "REF-1", qty: 1, unitPrice: 10 }],
    },
    7,
  );
  assertEquals("date" in planNoDate.args, false);
  assertEquals("delivery_date" in planNoDate.args, false);
});

Deno.test("architecture slices — quotation_create mappers produce correct native plans", () => {
  // ERPNext Quotation uses party_name (not customer)
  const erpnextPlan = mapQuotationCreateToErpNext({
    mode: "preview",
    customerId: "PROSPECT-001",
    lines: [{ sku: "SVC-1", qty: 1, unitPrice: 500 }],
    date: "2026-07-01",
    validUntil: "2026-07-31",
  });
  assertEquals(erpnextPlan.toolName, "erpnext.quotation_create");
  assertEquals(erpnextPlan.args.party_name, "PROSPECT-001");
  assertEquals("customer" in erpnextPlan.args, false);
  assertEquals(erpnextPlan.args.transaction_date, "2026-07-01");
  assertEquals(erpnextPlan.args.valid_till, "2026-07-31");
  assertEquals(erpnextPlan.args.items, [
    { item_code: "SVC-1", qty: 1, rate: 500 },
  ]);

  // Dolibarr proposal: valid_until (ISO, native derives duree_validite)
  const dolibarrPlan = mapQuotationCreateToDolibarr(
    {
      mode: "commit",
      customerId: "12",
      lines: [{ sku: "REF-A", qty: 2, unitPrice: 80 }],
      date: "2026-07-01",
      validUntil: "2026-07-15",
    },
    12,
  );
  assertEquals(dolibarrPlan.toolName, "dolibarr.proposal_create");
  assertEquals(dolibarrPlan.args.socid, 12);
  assertEquals(dolibarrPlan.args.valid_until, "2026-07-15");
  assertEquals(dolibarrPlan.args.lines, [
    { sku: "REF-A", qty: 2, subprice: 80 },
  ]);
});

Deno.test("architecture slices — sales_invoice_create mappers produce correct native plans", () => {
  // ERPNext Invoice: customer, posting_date, due_date
  const erpnextPlan = mapSalesInvoiceCreateToErpNext({
    mode: "commit",
    customerId: "CUST-002",
    lines: [{ sku: "ITEM-X", qty: 5, unitPrice: 20, description: "Parts" }],
    date: "2026-07-05",
    dueDate: "2026-08-05",
  });
  assertEquals(erpnextPlan.toolName, "erpnext.sales_invoice_create");
  assertEquals(erpnextPlan.args.customer, "CUST-002");
  assertEquals(erpnextPlan.args.posting_date, "2026-07-05");
  assertEquals(erpnextPlan.args.due_date, "2026-08-05");
  assertEquals(erpnextPlan.args.items, [
    { item_code: "ITEM-X", qty: 5, rate: 20, description: "Parts" },
  ]);

  // Dolibarr invoice: due_date ISO (native converts to date_lim_reglement epoch)
  const dolibarrPlan = mapSalesInvoiceCreateToDolibarr(
    {
      mode: "commit",
      customerId: "33",
      lines: [{ sku: "REF-Z", qty: 1, unitPrice: 150 }],
      date: "2026-07-05",
      dueDate: "2026-08-05",
    },
    33,
  );
  assertEquals(dolibarrPlan.toolName, "dolibarr.invoice_create");
  assertEquals(dolibarrPlan.args.socid, 33);
  assertEquals(dolibarrPlan.args.date, "2026-07-05");
  assertEquals(dolibarrPlan.args.due_date, "2026-08-05");
  assertEquals(dolibarrPlan.args.lines, [{
    sku: "REF-Z",
    qty: 1,
    subprice: 150,
  }]);

  // No dueDate → key absent
  const planNoDue = mapSalesInvoiceCreateToDolibarr(
    {
      mode: "preview",
      customerId: "33",
      lines: [{ sku: "REF-Z", qty: 1, unitPrice: 150 }],
    },
    33,
  );
  assertEquals("due_date" in planNoDue.args, false);
});

Deno.test("architecture slices — WRITE_CAPABILITIES includes the 3 new sales document tools", () => {
  for (const erpType of ["erpnext", "dolibarr"] as const) {
    const tools = WRITE_CAPABILITIES[erpType].tools;
    assertEquals(tools.includes("erp.sales_order_create"), true);
    assertEquals(tools.includes("erp.quotation_create"), true);
    assertEquals(tools.includes("erp.sales_invoice_create"), true);
  }
});

Deno.test("architecture slices — platform layer exposes ERP and MCP boundaries", () => {
  assertEquals(typeof createErpnextAdapter, "function");
  assertEquals(typeof createDolibarrAdapter, "function");
  assertEquals(typeof FrappeRestClient, "function");
  assertEquals(typeof DolibarrRestClient, "function");
  assertEquals(typeof ErpToolsClient, "function");
  assert(ERP_VIEWERS.length > 0);
});

Deno.test("architecture slices — provider tool manifests are split by family", () => {
  assertEquals(Object.keys(ERPNEXT_TOOL_GROUPS), [
    "diagnostics",
    "businessParties",
    "catalog",
    "salesDocuments",
    "suppliers",
    "accounting",
    "inventory",
    "writes",
  ]);
  assertEquals(Object.keys(DOLIBARR_TOOL_GROUPS), [
    "diagnostics",
    "businessParties",
    "catalog",
    "salesDocuments",
    "accounting",
    "inventory",
    "writes",
  ]);

  assertEquals(ERPNEXT_TOOLS[0].name, "erpnext.ping");
  assertEquals(DOLIBARR_TOOLS[0].name, "dolibarr.ping");
  assert(
    ERPNEXT_TOOL_GROUPS.salesDocuments.some((tool) =>
      tool.name === "erpnext.sales_invoice_get"
    ),
  );
  assert(
    DOLIBARR_TOOL_GROUPS.salesDocuments.some((tool) =>
      tool.name === "dolibarr.proposal_get"
    ),
  );
});

Deno.test("architecture slices — provider diagnostics handlers are split by family", () => {
  assertEquals(typeof callErpnextDiagnosticsTool, "function");
  assertEquals(typeof callDolibarrDiagnosticsTool, "function");
});

Deno.test("architecture slices — provider business-party handlers are split by family", () => {
  assertEquals(typeof callErpnextBusinessPartyTool, "function");
  assertEquals(typeof callDolibarrBusinessPartyTool, "function");
});

Deno.test("architecture slices — provider catalog handlers are split by family", () => {
  assertEquals(typeof callErpnextCatalogTool, "function");
  assertEquals(typeof callDolibarrCatalogTool, "function");
});

Deno.test("architecture slices — provider document handlers are split by family", () => {
  assertEquals(typeof callErpnextDocumentTool, "function");
  assertEquals(typeof callDolibarrDocumentTool, "function");
});

Deno.test("architecture slices — provider accounting handlers are split by family", () => {
  assertEquals(typeof callErpnextAccountingTool, "function");
  assertEquals(typeof callDolibarrAccountingTool, "function");
});

Deno.test("architecture slices — provider inventory handlers are split by family", () => {
  assertEquals(typeof callErpnextInventoryTool, "function");
  assertEquals(typeof callDolibarrInventoryTool, "function");
});

Deno.test("architecture slices — provider write handlers are split by family", () => {
  assertEquals(typeof callErpnextWriteTool, "function");
  assertEquals(typeof callDolibarrWriteTool, "function");
});

Deno.test("architecture slices — sales document submit contracts have strict schemas", () => {
  const submitTools = [
    SALES_ORDER_TOOLS.find((t) => t.name === "erp.sales_order_submit")!,
    QUOTATION_TOOLS.find((t) => t.name === "erp.quotation_submit")!,
    INVOICE_TOOLS.find((t) => t.name === "erp.sales_invoice_submit")!,
  ];

  for (const tool of submitTools) {
    const schema = tool.inputSchema;
    assertEquals(schema.type, "object");
    assertEquals(schema.additionalProperties, false);
    assertEquals(
      (schema.required as string[]).includes("erpType"),
      true,
      `${tool.name}: erpType not required`,
    );
    assertEquals(
      (schema.required as string[]).includes("mode"),
      true,
      `${tool.name}: mode not required`,
    );
    assertEquals(
      (schema.required as string[]).includes("nativeId"),
      true,
      `${tool.name}: nativeId not required`,
    );
    const props = schema.properties as Record<string, Record<string, unknown>>;
    assertEquals(props.mode.type, "string");
    assertEquals((props.mode.enum as string[]).includes("preview"), true);
    assertEquals((props.mode.enum as string[]).includes("commit"), true);
    assertEquals(props.nativeId.type, "string");
    assertEquals(props.nativeId.minLength, 1);
    assertEquals(tool.annotations?.readOnlyHint, false);
    assertEquals(tool.annotations?.destructiveHint, false);
  }
});

Deno.test("architecture slices — sales-order submit mappers produce correct native plans", () => {
  const input = { mode: "commit" as const, nativeId: "SO-001" };

  const erpNextPlan = mapSalesOrderSubmitToErpNext(input);
  assertEquals(erpNextPlan.toolName, "erpnext.sales_order_submit");
  assertEquals(erpNextPlan.args.mode, "commit");
  assertEquals(erpNextPlan.args.name, "SO-001");
  assertEquals("id" in erpNextPlan.args, false);

  const dolibarrPlan = mapSalesOrderSubmitToDolibarr(input, 42);
  assertEquals(dolibarrPlan.toolName, "dolibarr.order_validate");
  assertEquals(dolibarrPlan.args.mode, "commit");
  assertEquals(dolibarrPlan.args.id, 42);
  assertEquals("name" in dolibarrPlan.args, false);
});

Deno.test("architecture slices — quotation submit mappers produce correct native plans", () => {
  const input = { mode: "preview" as const, nativeId: "QTN-001" };

  const erpNextPlan = mapQuotationSubmitToErpNext(input);
  assertEquals(erpNextPlan.toolName, "erpnext.quotation_submit");
  assertEquals(erpNextPlan.args.name, "QTN-001");

  const dolibarrPlan = mapQuotationSubmitToDolibarr(input, 5);
  assertEquals(dolibarrPlan.toolName, "dolibarr.proposal_validate");
  assertEquals(dolibarrPlan.args.id, 5);
  // proposals must NOT inject idwarehouse at the mapper level
  assertEquals("idwarehouse" in dolibarrPlan.args, false);
});

Deno.test("architecture slices — sales-invoice submit mappers produce correct native plans", () => {
  const input = { mode: "commit" as const, nativeId: "SINV-001" };

  const erpNextPlan = mapSalesInvoiceSubmitToErpNext(input);
  assertEquals(erpNextPlan.toolName, "erpnext.sales_invoice_submit");
  assertEquals(erpNextPlan.args.name, "SINV-001");

  const dolibarrPlan = mapSalesInvoiceSubmitToDolibarr(input, 77);
  assertEquals(dolibarrPlan.toolName, "dolibarr.invoice_validate");
  assertEquals(dolibarrPlan.args.id, 77);
});
