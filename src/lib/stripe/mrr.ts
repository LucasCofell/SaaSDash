/**
 * Rebuild month-end MRR history from Stripe invoices.
 *
 * Stripe keeps only the current state of a subscription, but every invoice line for a
 * recurring price records the service period it pays for. A customer's MRR at the end of
 * month M is the normalized monthly value of every recurring line whose service period
 * covers that moment. For the current (unfinished) month we use "now" instead.
 *
 * Rules (v1):
 * - Only paid and open invoices count. Draft, void and uncollectible are ignored.
 * - Only lines with a recurring price count. One-time items and proration lines are excluded.
 *   (Prorations are partial-period adjustments; the next full-period line carries the new rate.)
 * - Line discounts are netted out. Annual plans count at 1/12 per month, weekly at 52/12, etc.
 * - One currency only: the most common invoice currency. Other currencies are skipped and counted.
 */
import type { MrrRow } from "../metrics/engine";
import { addMonths, type Month } from "../metrics/months";

export interface StripeRecurring {
  interval: "day" | "week" | "month" | "year";
  interval_count: number;
}

export interface StripeInvoiceLine {
  amount: number;
  proration?: boolean;
  period: { start: number; end: number };
  price?: { recurring: StripeRecurring | null } | null;
  discount_amounts?: { amount: number }[] | null;
}

export interface StripeInvoice {
  id: string;
  customer: string | null;
  currency: string;
  status: string | null;
  lines: { data: StripeInvoiceLine[] };
}

export interface StripeMrrResult {
  rows: MrrRow[];
  currency: string | null;
  invoicesUsed: number;
  invoicesSkippedOtherCurrency: number;
}

function monthOf(tsSec: number): Month {
  const d = new Date(tsSec * 1000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Last second of a month, in Unix seconds (UTC). */
function monthEndSec(m: Month): number {
  const [y, mm] = m.split("-").map(Number);
  return Date.UTC(y, mm, 1) / 1000 - 1; // Date.UTC month is 0-based, so mm = next month
}

/** Months covered by one billing interval. */
export function monthsPerInterval(r: StripeRecurring): number {
  const n = r.interval_count || 1;
  switch (r.interval) {
    case "month":
      return n;
    case "year":
      return 12 * n;
    case "week":
      return (n * 12) / 52;
    case "day":
      return (n * 12) / 365;
  }
}

const COUNTED_STATUSES = new Set(["paid", "open"]);

export function invoicesToMrrRows(invoices: StripeInvoice[], nowSec: number): StripeMrrResult {
  const counted = invoices.filter((i) => i.status && COUNTED_STATUSES.has(i.status) && i.customer);

  const byCurrency = new Map<string, number>();
  for (const inv of counted) byCurrency.set(inv.currency, (byCurrency.get(inv.currency) ?? 0) + 1);
  let currency: string | null = null;
  let best = 0;
  for (const [c, n] of byCurrency) if (n > best) { best = n; currency = c; }

  const nowMonth = monthOf(nowSec);
  const acc = new Map<string, number>(); // `${customer}|${month}` -> fractional cents
  let used = 0;
  let skipped = 0;

  for (const inv of counted) {
    if (inv.currency !== currency) { skipped++; continue; }
    let contributed = false;
    for (const line of inv.lines.data) {
      const recurring = line.price?.recurring;
      if (!recurring || line.proration) continue;
      const discounts = (line.discount_amounts ?? []).reduce((a, d) => a + d.amount, 0);
      const monthly = (line.amount - discounts) / monthsPerInterval(recurring);
      if (monthly <= 0) continue;

      const { start, end } = line.period;
      const lastMonth = monthOf(Math.min(end, nowSec));
      for (let m = monthOf(start); m <= lastMonth; m = addMonths(m, 1)) {
        const t = m === nowMonth ? nowSec : monthEndSec(m);
        if (t >= start && t < end) {
          const k = `${inv.customer}|${m}`;
          acc.set(k, (acc.get(k) ?? 0) + monthly);
          contributed = true;
        }
      }
    }
    if (contributed) used++;
  }

  const rows: MrrRow[] = [];
  for (const [k, v] of acc) {
    const cents = Math.round(v);
    if (cents <= 0) continue;
    const [customerId, month] = k.split("|");
    rows.push({ customerId, month, mrrCents: cents });
  }
  rows.sort((a, b) => (a.month === b.month ? a.customerId.localeCompare(b.customerId) : a.month < b.month ? -1 : 1));
  return { rows, currency, invoicesUsed: used, invoicesSkippedOtherCurrency: skipped };
}
