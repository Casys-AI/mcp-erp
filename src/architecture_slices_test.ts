import { assert, assertEquals } from "@std/assert";
import {
  ERP_TYPES,
  mapErpNextLifecycle,
  UnknownToolError,
  WRITE_CAPABILITIES,
} from "./domain/mod.ts";
import { CUSTOMER_TOOLS } from "./features/customer/customer.contract.ts";
import {
  mapCustomerCreateToDolibarr,
  mapCustomerUpdateToDolibarr,
} from "./features/customer/mappers/dolibarr.ts";
import {
  mapCustomerCreateToErpNext,
  mapCustomerUpdateToErpNext,
} from "./features/customer/mappers/erpnext.ts";
import { INVOICE_TOOLS } from "./features/invoice/invoice.contract.ts";
import { normalizeDolibarrInvoice } from "./features/invoice/mappers/dolibarr.ts";
import { normalizeErpNextSalesInvoice } from "./features/invoice/mappers/erpnext.ts";
import { PRODUCT_TOOLS } from "./features/product/product.contract.ts";
import { mapProductCreateToDolibarr } from "./features/product/mappers/dolibarr.ts";
import { mapProductCreateToErpNext } from "./features/product/mappers/erpnext.ts";
import { QUOTATION_TOOLS } from "./features/quotation/quotation.contract.ts";
import { normalizeDolibarrProposal } from "./features/quotation/mappers/dolibarr.ts";
import { normalizeErpNextQuotation } from "./features/quotation/mappers/erpnext.ts";
import { SALES_ORDER_TOOLS } from "./features/sales-order/sales-order.contract.ts";
import { normalizeDolibarrOrder } from "./features/sales-order/mappers/dolibarr.ts";
import { normalizeErpNextSalesOrder } from "./features/sales-order/mappers/erpnext.ts";
import { SUPPLIER_TOOLS } from "./features/supplier/supplier.contract.ts";
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

Deno.test("architecture slices — product contract and mappers own catalog item writes", () => {
  assertEquals(
    PRODUCT_TOOLS.map((tool) => tool.name),
    ["erp.product_create", "erp.product_update"],
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

Deno.test("architecture slices — document contracts and mappers own normalized reads", () => {
  assertEquals(
    INVOICE_TOOLS.map((tool) => tool.name),
    ["erp.sales_invoice_get"],
  );
  assertEquals(
    SALES_ORDER_TOOLS.map((tool) => tool.name),
    ["erp.sales_order_get"],
  );
  assertEquals(
    QUOTATION_TOOLS.map((tool) => tool.name),
    ["erp.quotation_get"],
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
