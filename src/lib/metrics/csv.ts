/**
 * CSV ingest for the MRR upload template.
 * Required columns: customer_id, month (or date), mrr. Optional: plan.
 * MRR is in dollars ("$1,250.00" accepted) and converted to integer cents.
 * Multiple rows for the same customer and month are summed (e.g., two plans).
 */
import { toMonth } from "./months";
import type { MrrRow } from "./engine";

export interface CsvError {
  line: number;
  message: string;
}

export interface CsvParseResult {
  rows: MrrRow[];
  errors: CsvError[];
}

/** Minimal RFC 4180 parser: quoted fields, escaped quotes, CRLF. */
export function parseCsv(text: string): string[][] {
  const out: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  const src = text.replace(/^﻿/, "");
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ",") { row.push(field); field = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(field); field = "";
      out.push(row); row = [];
    } else field += ch;
  }
  if (field !== "" || row.length > 0) { row.push(field); out.push(row); }
  return out.filter((r) => r.some((f) => f.trim() !== ""));
}

function parseDollarsToCents(raw: string): number | null {
  let s = raw.trim().replace(/[$,\s]/g, "");
  let negative = false;
  if (/^\(.*\)$/.test(s)) { negative = true; s = s.slice(1, -1); }
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
  const cents = Math.round(Number(s) * 100);
  return negative ? -cents : cents;
}

export function parseMrrCsv(text: string): CsvParseResult {
  const table = parseCsv(text);
  const errors: CsvError[] = [];
  if (table.length === 0) return { rows: [], errors: [{ line: 1, message: "File is empty" }] };

  const header = table[0].map((h) => h.trim().toLowerCase().replace(/\s+/g, "_"));
  const col = (...names: string[]) => header.findIndex((h) => names.includes(h));
  const iCust = col("customer_id", "customer", "customerid");
  const iMonth = col("month", "date", "period");
  const iMrr = col("mrr", "mrr_amount", "amount");
  const missing = [
    iCust < 0 && "customer_id",
    iMonth < 0 && "month",
    iMrr < 0 && "mrr",
  ].filter(Boolean);
  if (missing.length) {
    return { rows: [], errors: [{ line: 1, message: `Missing required column(s): ${missing.join(", ")}` }] };
  }

  const rows: MrrRow[] = [];
  for (let r = 1; r < table.length; r++) {
    const line = r + 1;
    const cells = table[r];
    const customerId = (cells[iCust] ?? "").trim();
    const month = toMonth(cells[iMonth] ?? "");
    const cents = parseDollarsToCents(cells[iMrr] ?? "");
    if (!customerId) { errors.push({ line, message: "customer_id is blank" }); continue; }
    if (!month) { errors.push({ line, message: `Unrecognized month "${cells[iMonth] ?? ""}" (use YYYY-MM)` }); continue; }
    if (cents === null) { errors.push({ line, message: `MRR "${cells[iMrr] ?? ""}" is not a number` }); continue; }
    if (cents < 0) { errors.push({ line, message: "MRR cannot be negative" }); continue; }
    rows.push({ customerId, month, mrrCents: cents });
  }
  return { rows, errors };
}
