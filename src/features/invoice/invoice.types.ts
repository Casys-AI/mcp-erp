import type { NormalizedPayload } from "../../domain/normalized.ts";
import type { DolibarrInvoice } from "../../platform/erp/dolibarr/types.ts";
import type { ErpNextSalesInvoice } from "../../platform/erp/erpnext/types.ts";

export type SalesInvoiceNative = ErpNextSalesInvoice | DolibarrInvoice;
export type SalesInvoicePayload = NormalizedPayload<SalesInvoiceNative>;
