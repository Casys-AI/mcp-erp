import type { NormalizedPayload } from "../../domain/normalized.ts";
import type { DolibarrProposal } from "../../platform/erp/dolibarr/types.ts";
import type { ErpNextQuotation } from "../../platform/erp/erpnext/types.ts";

export type QuotationNative = ErpNextQuotation | DolibarrProposal;
export type QuotationPayload = NormalizedPayload<QuotationNative>;
