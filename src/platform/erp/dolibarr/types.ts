/**
 * Dolibarr native REST payload shapes.
 *
 * These are raw provider shapes: fields are optional because Dolibarr REST
 * payloads vary by module, expansion options, and installation.
 */

export interface DolibarrThirdparty {
  id?: number | string | null;
  ref?: string;
  name?: string;
  nom?: string;
  name_alias?: string;
  client?: number | string;
  fournisseur?: number | string;
  status?: number | string;
  [key: string]: unknown;
}

export interface DolibarrProduct {
  id?: number | string | null;
  ref?: string;
  label?: string;
  type?: number | string;
  status?: number | string;
  price?: number | string;
  [key: string]: unknown;
}

export interface DolibarrInvoice {
  id?: number | string | null;
  ref?: string;
  statut?: number | string;
  paye?: number | string | boolean;
  datef?: string | number;
  date?: string | number;
  date_creation?: string | number;
  date_lim_reglement?: string | number;
  total_ttc?: number | string;
  total_ht?: number | string;
  total_tva?: number | string;
  multicurrency_total_ttc?: number | string;
  multicurrency_code?: string;
  currency?: string;
  socname?: string;
  thirdparty?: Record<string, unknown>;
  thirdparty_name?: string;
  socid?: number | string;
  lines?: unknown[];
  [key: string]: unknown;
}

export interface DolibarrOrder {
  id?: number | string | null;
  ref?: string;
  statut?: number | string;
  date_commande?: string | number;
  date_livraison?: string | number;
  total_ttc?: number | string;
  total_ht?: number | string;
  currency?: string;
  socname?: string;
  thirdparty?: Record<string, unknown>;
  lines?: unknown[];
  [key: string]: unknown;
}

export interface DolibarrProposal {
  id?: number | string | null;
  ref?: string;
  statut?: number | string;
  datep?: string | number;
  fin_validite?: string | number;
  total_ttc?: number | string;
  total_ht?: number | string;
  currency?: string;
  socname?: string;
  thirdparty?: Record<string, unknown>;
  lines?: unknown[];
  [key: string]: unknown;
}
