/**
 * SaaS metrics engine. Pure functions, no I/O.
 * All money values are integer cents to avoid floating-point drift.
 * Definitions follow claude/mvp-spec.md in the SaaS KPI Dash project.
 */
import { addMonths, monthRange, type Month } from "./months";

/** Normalized MRR for one customer in one month (month-end state). */
export interface MrrRow {
  customerId: string;
  month: Month;
  mrrCents: number;
}

/** Founder-entered balance-sheet / cash-flow inputs. */
export interface CashRow {
  month: Month;
  cashCents: number;
  /** Positive = cash burned that month. */
  netBurnCents: number;
}

export interface MonthMetrics {
  month: Month;
  mrrCents: number;
  arrCents: number;
  customers: number;
  arpaCents: number | null;

  // MRR bridge: prior MRR + netNew = MRR
  newMrrCents: number;
  expansionMrrCents: number;
  contractionMrrCents: number; // positive number
  churnedMrrCents: number; // positive number
  reactivationMrrCents: number;
  netNewMrrCents: number;

  newCustomers: number;
  churnedCustomers: number;
  reactivatedCustomers: number;

  /** Churned logos / customers at start of month. */
  logoChurnRate: number | null;
  /** (Churned + contraction MRR) / MRR at start of month. */
  grossMrrChurnRate: number | null;

  /** Trailing-12-month retention for the cohort active 12 months earlier. */
  grr12: number | null;
  nrr12: number | null;

  cashCents: number | null;
  netBurnCents: number | null;
  /** Cash / average net burn over the last (up to) 3 months. Null if not burning. */
  runwayMonths: number | null;
  /** Net burn / net new ARR. Null unless burning AND net new ARR > 0. */
  burnMultiple: number | null;
}

export interface CohortRow {
  cohort: Month;
  customers: number;
  startingMrrCents: number;
  /** Index k = months since cohort start. Revenue retention (NRR-style). */
  revenueRetention: number[];
  /** Index k = share of cohort customers still paying. */
  logoRetention: number[];
}

export interface MetricsResult {
  months: MonthMetrics[];
  cohorts: CohortRow[];
}

export interface ComputeOptions {
  /** Extend the timeline to this month (e.g., current month) even with no new data. */
  endMonth?: Month;
}

function sumPerCustomerMonth(rows: MrrRow[]): Map<string, Map<Month, number>> {
  const byCustomer = new Map<string, Map<Month, number>>();
  for (const r of rows) {
    if (!Number.isInteger(r.mrrCents)) throw new Error(`mrrCents must be an integer (customer ${r.customerId}, ${r.month})`);
    if (r.mrrCents < 0) throw new Error(`Negative MRR for customer ${r.customerId} in ${r.month}`);
    let m = byCustomer.get(r.customerId);
    if (!m) byCustomer.set(r.customerId, (m = new Map()));
    m.set(r.month, (m.get(r.month) ?? 0) + r.mrrCents);
  }
  return byCustomer;
}

export function computeMetrics(rows: MrrRow[], cash: CashRow[] = [], opts: ComputeOptions = {}): MetricsResult {
  if (rows.length === 0) return { months: [], cohorts: [] };

  const byCustomer = sumPerCustomerMonth(rows);
  let start = rows[0].month;
  let end = rows[0].month;
  for (const r of rows) {
    if (r.month < start) start = r.month;
    if (r.month > end) end = r.month;
  }
  if (opts.endMonth && opts.endMonth > end) end = opts.endMonth;
  const months = monthRange(start, end);
  const idxOf = new Map(months.map((m, i) => [m, i]));

  // Dense matrix: customer -> MRR per month index (0 when absent).
  const customers = [...byCustomer.keys()];
  const grid = new Map<string, number[]>();
  const firstIdx = new Map<string, number>();
  for (const c of customers) {
    const series = new Array<number>(months.length).fill(0);
    for (const [m, v] of byCustomer.get(c)!) series[idxOf.get(m)!] = v;
    grid.set(c, series);
    const f = series.findIndex((v) => v > 0);
    if (f >= 0) firstIdx.set(c, f);
  }

  const cashByMonth = new Map(cash.map((c) => [c.month, c]));
  const out: MonthMetrics[] = [];

  for (let i = 0; i < months.length; i++) {
    let mrr = 0, count = 0, startMrr = 0, startCount = 0;
    let newM = 0, exp = 0, con = 0, churn = 0, react = 0;
    let newC = 0, churnC = 0, reactC = 0;
    let cohortStart = 0, grrEnd = 0, nrrEnd = 0;

    for (const c of customers) {
      const s = grid.get(c)!;
      const cur = s[i];
      const prev = i > 0 ? s[i - 1] : 0;
      mrr += cur;
      if (cur > 0) count++;
      startMrr += prev;
      if (prev > 0) startCount++;

      if (prev === 0 && cur > 0) {
        if (firstIdx.get(c)! < i) { react += cur; reactC++; }
        else { newM += cur; newC++; }
      } else if (prev > 0 && cur === 0) {
        churn += prev; churnC++;
      } else if (prev > 0 && cur > 0) {
        if (cur > prev) exp += cur - prev;
        else if (cur < prev) con += prev - cur;
      }

      if (i >= 12) {
        const base = s[i - 12];
        if (base > 0) {
          cohortStart += base;
          nrrEnd += cur;
          grrEnd += Math.min(cur, base);
        }
      }
    }

    const netNew = newM + exp + react - con - churn;
    const cashRow = cashByMonth.get(months[i]);
    let runway: number | null = null;
    let burnMultiple: number | null = null;
    if (cashRow) {
      const recent: number[] = [];
      for (let k = 0; k < 3; k++) {
        const r = cashByMonth.get(addMonths(months[i], -k));
        if (r) recent.push(r.netBurnCents);
      }
      const avgBurn = recent.reduce((a, b) => a + b, 0) / recent.length;
      if (avgBurn > 0) runway = cashRow.cashCents / avgBurn;
      const netNewArr = netNew * 12;
      if (cashRow.netBurnCents > 0 && netNewArr > 0) burnMultiple = cashRow.netBurnCents / netNewArr;
    }

    out.push({
      month: months[i],
      mrrCents: mrr,
      arrCents: mrr * 12,
      customers: count,
      arpaCents: count > 0 ? Math.round(mrr / count) : null,
      newMrrCents: newM,
      expansionMrrCents: exp,
      contractionMrrCents: con,
      churnedMrrCents: churn,
      reactivationMrrCents: react,
      netNewMrrCents: netNew,
      newCustomers: newC,
      churnedCustomers: churnC,
      reactivatedCustomers: reactC,
      logoChurnRate: startCount > 0 ? churnC / startCount : null,
      grossMrrChurnRate: startMrr > 0 ? (churn + con) / startMrr : null,
      grr12: cohortStart > 0 ? grrEnd / cohortStart : null,
      nrr12: cohortStart > 0 ? nrrEnd / cohortStart : null,
      cashCents: cashRow?.cashCents ?? null,
      netBurnCents: cashRow?.netBurnCents ?? null,
      runwayMonths: runway,
      burnMultiple,
    });
  }

  // Cohorts by first paying month.
  const cohortMembers = new Map<number, string[]>();
  for (const [c, f] of firstIdx) {
    const list = cohortMembers.get(f) ?? [];
    list.push(c);
    cohortMembers.set(f, list);
  }
  const cohorts: CohortRow[] = [...cohortMembers.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([f, members]) => {
      const startingMrr = members.reduce((a, c) => a + grid.get(c)![f], 0);
      const revenueRetention: number[] = [];
      const logoRetention: number[] = [];
      for (let k = 0; f + k < months.length; k++) {
        let m = 0, n = 0;
        for (const c of members) {
          const v = grid.get(c)![f + k];
          m += v;
          if (v > 0) n++;
        }
        revenueRetention.push(m / startingMrr);
        logoRetention.push(n / members.length);
      }
      return { cohort: months[f], customers: members.length, startingMrrCents: startingMrr, revenueRetention, logoRetention };
    });

  return { months: out, cohorts };
}
