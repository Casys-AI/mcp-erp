import type { NormalizedPayload } from "../../domain/normalized.ts";
import type { DolibarrOrder } from "../../platform/erp/dolibarr/types.ts";
import type { ErpNextSalesOrder } from "../../platform/erp/erpnext/types.ts";

export type SalesOrderNative = ErpNextSalesOrder | DolibarrOrder;
export type SalesOrderPayload = NormalizedPayload<SalesOrderNative>;
