import { test } from "node:test";
import assert from "node:assert/strict";
import { invoicesToMrrRows, type StripeInvoice, type StripeInvoiceLine } from "../src/lib/stripe/mrr";
import { computeMetrics } from "../src/lib/metrics";

const ts = (iso: string) => Date.parse(iso) / 1000;
const monthly = { interval: "month" as const, interval_count: 1 };
const yearly = { interval: "year" as const, interval_count: 1 };

function line(amount: number, start: string, end: string, extra: Partial<StripeInvoiceLine> = {}): StripeInvoiceLine {
  return { amount, period: { start: ts(start), end: ts(end) }, price: { recurring: monthly }, ...extra };
}
let n = 0;
function inv(customer: string, lines: StripeInvoiceLine[], status = "paid", currency = "usd"): StripeInvoice {
  return { id: `in_${++n}`, customer, currency, status, lines: { data: lines } };
}

const NOW = ts("2025-04-20T12:00:00Z");

test("monthly plan billed mid-month counts in each month it covers at month end", () => {
  const { rows } = invoicesToMrrRows(
    [
      inv("cus_A", [line(10000, "2025-01-15", "2025-02-15")]),
      inv("cus_A", [line(10000, "2025-02-15", "2025-03-15")]),
      inv("cus_A", [line(10000, "2025-03-15", "2025-04-15")]),
      inv("cus_A", [line(10000, "2025-04-15", "2025-05-15")]),
    ],
    NOW,
  );
  assert.deepEqual(
    rows.map((r) => [r.month, r.mrrCents]),
    [["2025-01", 10000], ["2025-02", 10000], ["2025-03", 10000], ["2025-04", 10000]],
  );
});

test("annual plan counts at 1/12 every month, capped at the current month", () => {
  const { rows } = invoicesToMrrRows(
    [inv("cus_B", [{ ...line(120000, "2025-01-01", "2026-01-01"), price: { recurring: yearly } }])],
    NOW,
  );
  assert.equal(rows.length, 4); // Jan..Apr 2025 only
  assert.ok(rows.every((r) => r.mrrCents === 10000));
});

test("cancellation: MRR stops after the last paid period ends", () => {
  const { rows } = invoicesToMrrRows(
    [
      inv("cus_C", [line(5000, "2025-01-01", "2025-02-01")]),
      inv("cus_C", [line(5000, "2025-02-01", "2025-03-01")]),
    ],
    NOW,
  );
  assert.deepEqual(rows.map((r) => r.month), ["2025-01", "2025-02"]);
});

test("discounts are netted; prorations, one-time items, void and draft invoices are excluded", () => {
  const { rows } = invoicesToMrrRows(
    [
      inv("cus_D", [
        line(10000, "2025-03-01", "2025-04-01", { discount_amounts: [{ amount: 2000 }] }),
        line(3000, "2025-03-10", "2025-04-01", { proration: true }),
        line(50000, "2025-03-01", "2025-03-01", { price: { recurring: null } }),
      ]),
      inv("cus_D", [line(99999, "2025-03-01", "2025-04-01")], "void"),
      inv("cus_E", [line(99999, "2025-03-01", "2025-04-01")], "draft"),
    ],
    NOW,
  );
  assert.deepEqual(rows, [{ customerId: "cus_D", month: "2025-03", mrrCents: 8000 }]);
});

test("open (unpaid) invoices still count as MRR", () => {
  const { rows } = invoicesToMrrRows([inv("cus_F", [line(4000, "2025-04-01", "2025-05-01")], "open")], NOW);
  assert.deepEqual(rows, [{ customerId: "cus_F", month: "2025-04", mrrCents: 4000 }]);
});

test("uses the dominant currency and reports skipped invoices", () => {
  const r = invoicesToMrrRows(
    [
      inv("cus_G", [line(1000, "2025-03-01", "2025-04-01")]),
      inv("cus_H", [line(1000, "2025-03-01", "2025-04-01")]),
      inv("cus_I", [line(1000, "2025-03-01", "2025-04-01")], "paid", "eur"),
    ],
    NOW,
  );
  assert.equal(r.currency, "usd");
  assert.equal(r.invoicesSkippedOtherCurrency, 1);
  assert.equal(r.rows.length, 2);
});

test("upgrade shows as expansion in the metrics engine", () => {
  const { rows } = invoicesToMrrRows(
    [
      inv("cus_J", [line(10000, "2025-01-01", "2025-02-01")]),
      inv("cus_J", [line(25000, "2025-02-01", "2025-03-01")]),
    ],
    NOW,
  );
  const { months } = computeMetrics(rows);
  assert.equal(months[1].expansionMrrCents, 15000);
});
