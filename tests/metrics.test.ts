import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { computeMetrics, parseMrrCsv, addMonths, toMonth, type MrrRow } from "../src/lib/metrics";

const $ = (dollars: number) => Math.round(dollars * 100);
const close = (a: number | null, b: number, eps = 1e-9) => {
  assert.notEqual(a, null);
  assert.ok(Math.abs((a as number) - b) < eps, `${a} !== ${b}`);
};

const sample = parseMrrCsv(readFileSync(join(__dirname, "../fixtures/sample-mrr.csv"), "utf8"));

test("CSV fixture parses cleanly", () => {
  assert.deepEqual(sample.errors, []);
  assert.equal(sample.rows.length, 11);
});

test("MRR bridge: hand-checked four-month scenario", () => {
  const { months } = computeMetrics(sample.rows);
  const [jan, feb, mar, apr] = months;

  assert.equal(jan.mrrCents, $(600));
  assert.equal(jan.newMrrCents, $(600));
  assert.equal(jan.customers, 3);

  // Feb: C new (+50), D churns (-300)
  assert.equal(feb.mrrCents, $(350));
  assert.equal(feb.newMrrCents, $(50));
  assert.equal(feb.churnedMrrCents, $(300));
  assert.equal(feb.netNewMrrCents, $(-250));
  close(feb.logoChurnRate, 1 / 3);
  close(feb.grossMrrChurnRate, 300 / 600);

  // Mar: A expands +50, B churns -200
  assert.equal(mar.mrrCents, $(200));
  assert.equal(mar.expansionMrrCents, $(50));
  assert.equal(mar.churnedMrrCents, $(200));
  assert.equal(mar.netNewMrrCents, $(-150));

  // Apr: C contracts -20, D reactivates +300
  assert.equal(apr.mrrCents, $(480));
  assert.equal(apr.contractionMrrCents, $(20));
  assert.equal(apr.reactivationMrrCents, $(300));
  assert.equal(apr.reactivatedCustomers, 1);
  assert.equal(apr.newMrrCents, 0);
  assert.equal(apr.arrCents, $(480 * 12));
  assert.equal(apr.arpaCents, $(160));
});

test("bridge always reconciles: prior MRR + net new = MRR", () => {
  const { months } = computeMetrics(sample.rows);
  for (let i = 1; i < months.length; i++) {
    assert.equal(months[i - 1].mrrCents + months[i].netNewMrrCents, months[i].mrrCents);
  }
});

test("trailing-12 GRR and NRR use the cohort active 12 months earlier", () => {
  const rows: MrrRow[] = [
    { customerId: "X", month: "2024-01", mrrCents: $(1000) },
    { customerId: "Y", month: "2024-01", mrrCents: $(1000) },
    { customerId: "Z", month: "2024-01", mrrCents: $(1000) },
    { customerId: "X", month: "2025-01", mrrCents: $(1200) }, // expanded
    // Y churned
    { customerId: "Z", month: "2025-01", mrrCents: $(800) }, // contracted
    { customerId: "W", month: "2024-06", mrrCents: $(5000) }, // joined later: excluded
    { customerId: "W", month: "2025-01", mrrCents: $(5000) },
  ];
  const { months } = computeMetrics(rows);
  const jan25 = months.find((m) => m.month === "2025-01")!;
  close(jan25.nrr12, 2000 / 3000);
  close(jan25.grr12, 1800 / 3000);
  assert.equal(months.find((m) => m.month === "2024-12")!.nrr12, null);
});

test("runway and burn multiple", () => {
  const rows: MrrRow[] = [
    { customerId: "A", month: "2025-01", mrrCents: $(10_000) },
    { customerId: "A", month: "2025-02", mrrCents: $(10_000) },
    { customerId: "A", month: "2025-03", mrrCents: $(10_000) },
    { customerId: "B", month: "2025-03", mrrCents: $(5_000) },
  ];
  const cash = [
    { month: "2025-01", cashCents: $(1_000_000), netBurnCents: $(80_000) },
    { month: "2025-02", cashCents: $(920_000), netBurnCents: $(100_000) },
    { month: "2025-03", cashCents: $(800_000), netBurnCents: $(120_000) },
  ];
  const mar = computeMetrics(rows, cash).months[2];
  close(mar.runwayMonths, 800_000 / 100_000); // avg burn of last 3 months = 100k
  close(mar.burnMultiple, 120_000 / (5_000 * 12)); // 2.0x
  const feb = computeMetrics(rows, cash).months[1];
  assert.equal(feb.burnMultiple, null); // no net new ARR
});

test("cohort retention", () => {
  const { cohorts } = computeMetrics(sample.rows);
  const jan = cohorts.find((c) => c.cohort === "2025-01")!;
  assert.equal(jan.customers, 3);
  assert.equal(jan.startingMrrCents, $(600));
  close(jan.revenueRetention[0], 1);
  close(jan.revenueRetention[2], 150 / 600); // only A remains (150)
  close(jan.revenueRetention[3], 450 / 600); // A 150 + D 300
  close(jan.logoRetention[2], 1 / 3);
});

test("multiple rows per customer-month are summed; gaps count as zero", () => {
  const { months } = computeMetrics([
    { customerId: "A", month: "2025-01", mrrCents: 100 },
    { customerId: "A", month: "2025-01", mrrCents: 50 },
    { customerId: "A", month: "2025-03", mrrCents: 150 },
  ]);
  assert.equal(months.length, 3);
  assert.equal(months[0].mrrCents, 150);
  assert.equal(months[1].churnedMrrCents, 150);
  assert.equal(months[2].reactivationMrrCents, 150);
});

test("CSV: messy formats and row-level errors", () => {
  const csv = [
    "Customer ID,Date,MRR",
    'acme,2025-01-31,"$1,250.50"',
    "beta,1/15/2025,99",
    ",2025-01,10",
    "gamma,January,10",
    "delta,2025-01,abc",
    "eps,2025-01,-5",
  ].join("\r\n");
  const { rows, errors } = parseMrrCsv(csv);
  assert.deepEqual(rows, [
    { customerId: "acme", month: "2025-01", mrrCents: 125050 },
    { customerId: "beta", month: "2025-01", mrrCents: 9900 },
  ]);
  assert.deepEqual(errors.map((e) => e.line), [4, 5, 6, 7]);
});

test("CSV: missing columns reported", () => {
  const { errors } = parseMrrCsv("customer_id,amount_due\na,1");
  assert.match(errors[0].message, /month, mrr/);
});

test("month helpers", () => {
  assert.equal(addMonths("2024-11", 3), "2025-02");
  assert.equal(addMonths("2025-01", -1), "2024-12");
  assert.equal(toMonth("2025-13"), null);
});
