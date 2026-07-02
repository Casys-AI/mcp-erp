import type { ErpType } from "../../domain/connection.ts";
import { WriteError } from "../../domain/write.ts";
import type { SalesDocumentLineInput } from "./sales-document.types.ts";

const KNOWN_LINE_FIELDS = new Set(["sku", "qty", "unitPrice", "description"]);

const ISO_DATE_RE = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/;

export function parseSalesDocumentLines(
  args: Record<string, unknown>,
  erpType: ErpType,
): SalesDocumentLineInput[] {
  const raw = args.lines;
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new WriteError(
      "EMPTY_LINES",
      { erpType },
      "lines must be a non-empty array of line items.",
    );
  }

  return raw.map((item, lineIndex) => {
    if (typeof item !== "object" || item === null || Array.isArray(item)) {
      throw new WriteError(
        "INVALID_LINE",
        { lineIndex, erpType },
        `Line ${lineIndex} must be a plain object.`,
      );
    }
    const line = item as Record<string, unknown>;

    for (const key of Object.keys(line)) {
      if (!KNOWN_LINE_FIELDS.has(key)) {
        throw new WriteError(
          "INVALID_LINE",
          { lineIndex, field: key, erpType },
          `Line ${lineIndex} has unknown property '${key}'; allowed: sku, qty, unitPrice, description.`,
        );
      }
    }

    const { sku, qty, unitPrice, description } = line;

    if (typeof sku !== "string" || sku.length === 0) {
      throw new WriteError(
        "INVALID_LINE",
        { lineIndex, field: "sku", erpType },
        `Line ${lineIndex}: 'sku' must be a non-empty string.`,
      );
    }

    if (typeof qty !== "number" || !Number.isFinite(qty) || qty <= 0) {
      throw new WriteError(
        "INVALID_LINE",
        { lineIndex, field: "qty", erpType },
        `Line ${lineIndex}: 'qty' must be a finite number > 0.`,
      );
    }

    if (
      typeof unitPrice !== "number" || !Number.isFinite(unitPrice) ||
      unitPrice < 0
    ) {
      throw new WriteError(
        "INVALID_LINE",
        { lineIndex, field: "unitPrice", erpType },
        `Line ${lineIndex}: 'unitPrice' must be a finite number >= 0.`,
      );
    }

    if (description !== undefined && typeof description !== "string") {
      throw new WriteError(
        "INVALID_LINE",
        { lineIndex, field: "description", erpType },
        `Line ${lineIndex}: 'description' must be a string when provided.`,
      );
    }

    const result: SalesDocumentLineInput = { sku, qty, unitPrice };
    if (typeof description === "string") {
      return { ...result, description };
    }
    return result;
  });
}

export function parseIsoDate(
  field: string,
  value: unknown,
  erpType: ErpType,
): string {
  if (typeof value !== "string" || !ISO_DATE_RE.test(value)) {
    throw new WriteError(
      "INVALID_FIELD",
      { field, value, erpType },
      `Field '${field}' must be a valid ISO date (YYYY-MM-DD).`,
    );
  }
  return value;
}

export function optIsoDate(
  field: string,
  value: unknown,
  erpType: ErpType,
): string | undefined {
  if (value === undefined) return undefined;
  return parseIsoDate(field, value, erpType);
}

export function assertDateRange(
  laterField: string,
  laterDate: string,
  earlierDate: string,
  erpType: ErpType,
): void {
  if (laterDate < earlierDate) {
    throw new WriteError(
      "INVALID_DATE_RANGE",
      { field: laterField, laterDate, earlierDate, erpType },
      `'${laterField}' (${laterDate}) must not be before the document date (${earlierDate}).`,
    );
  }
}
