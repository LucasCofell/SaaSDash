/**
 * Minimal read-only Stripe REST client (no SDK). API version is pinned so the invoice line
 * shape (line.price.recurring, line.proration, line.discount_amounts) stays stable.
 */
import type { StripeInvoice, StripeInvoiceLine } from "./mrr";

const API = "https://api.stripe.com/v1";
const STRIPE_VERSION = "2024-06-20";
const HISTORY_MONTHS = 36;

export class StripeKeyError extends Error {}

async function get<T>(key: string, path: string, params: Record<string, string> = {}): Promise<T> {
  const url = new URL(API + path);
  for (const [k, v] of Object.entries(params)) url.searchParams.append(k, v);
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${key}`, "Stripe-Version": STRIPE_VERSION },
    cache: "no-store",
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg: string = body?.error?.message ?? `Stripe returned HTTP ${res.status}`;
    if (res.status === 401) throw new StripeKeyError("Stripe rejected this key. Check that you copied it completely.");
    if (res.status === 403) throw new StripeKeyError(`This key is missing a permission: ${msg}`);
    throw new Error(msg);
  }
  return body as T;
}

interface List<T> {
  data: T[];
  has_more: boolean;
}

type RawInvoice = StripeInvoice & { lines: List<StripeInvoiceLine> };

/** Cheap call that proves the key works and can read invoices. */
export async function verifyKey(key: string): Promise<void> {
  await get<List<RawInvoice>>(key, "/invoices", { limit: "1" });
}

async function allLines(key: string, inv: RawInvoice): Promise<StripeInvoiceLine[]> {
  const lines = [...inv.lines.data];
  let more = inv.lines.has_more;
  while (more) {
    const page = await get<List<StripeInvoiceLine & { id: string }>>(key, `/invoices/${inv.id}/lines`, {
      limit: "100",
      starting_after: (lines[lines.length - 1] as StripeInvoiceLine & { id: string }).id,
    });
    lines.push(...page.data);
    more = page.has_more;
  }
  return lines;
}

/** Paid and open invoices created in the last HISTORY_MONTHS months. */
export async function fetchInvoices(key: string): Promise<StripeInvoice[]> {
  const since = Math.floor(Date.now() / 1000) - HISTORY_MONTHS * 31 * 86400;
  const out: StripeInvoice[] = [];
  for (const status of ["paid", "open"]) {
    let startingAfter: string | undefined;
    for (;;) {
      const params: Record<string, string> = { limit: "100", status, "created[gte]": String(since) };
      if (startingAfter) params.starting_after = startingAfter;
      const page = await get<List<RawInvoice>>(key, "/invoices", params);
      for (const inv of page.data) {
        const lines = inv.lines.has_more ? await allLines(key, inv) : inv.lines.data;
        out.push({ id: inv.id, customer: inv.customer, currency: inv.currency, status: inv.status, lines: { data: lines } });
      }
      if (!page.has_more || page.data.length === 0) break;
      startingAfter = page.data[page.data.length - 1].id;
    }
  }
  return out;
}
