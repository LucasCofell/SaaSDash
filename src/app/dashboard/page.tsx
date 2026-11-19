import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getOrCreateCompany, loadCash, loadMrrRows } from "@/lib/data";
import { computeMetrics, type MonthMetrics } from "@/lib/metrics";
import { money, moneyShort, monthLabel, num, pct } from "@/lib/format";
import { AppHeader } from "../AppHeader";
import {
  CohortHeatmap,
  MrrMovementsChart,
  MrrTrendChart,
  NetNewBridge,
  Sparkline,
  type CohortView,
  type TrendPoint,
} from "./charts";

interface Tile {
  label: string;
  value: string;
  sub?: string;
  delta?: { text: string; good: boolean; show: boolean };
  spark?: number[];
}

export const dynamic = "force-dynamic";

type Line = { label: string; kind?: "section" | "indent"; value?: (m: MonthMetrics) => string; neg?: (m: MonthMetrics) => boolean };

const LINES: Line[] = [
  { label: "MRR bridge", kind: "section" },
  { label: "Beginning MRR", kind: "indent", value: (m) => money(m.mrrCents - m.netNewMrrCents) },
  { label: "+ New", kind: "indent", value: (m) => money(m.newMrrCents) },
  { label: "+ Expansion", kind: "indent", value: (m) => money(m.expansionMrrCents) },
  { label: "+ Reactivation", kind: "indent", value: (m) => money(m.reactivationMrrCents) },
  { label: "− Contraction", kind: "indent", value: (m) => money(-m.contractionMrrCents), neg: (m) => m.contractionMrrCents > 0 },
  { label: "− Churn", kind: "indent", value: (m) => money(-m.churnedMrrCents), neg: (m) => m.churnedMrrCents > 0 },
  { label: "Net new MRR", value: (m) => money(m.netNewMrrCents), neg: (m) => m.netNewMrrCents < 0 },
  { label: "Ending MRR", value: (m) => money(m.mrrCents) },
  { label: "ARR", value: (m) => money(m.arrCents) },
  { label: "Customers", kind: "section" },
  { label: "Paying customers", kind: "indent", value: (m) => m.customers.toLocaleString() },
  { label: "New", kind: "indent", value: (m) => String(m.newCustomers) },
  { label: "Churned", kind: "indent", value: (m) => String(m.churnedCustomers) },
  { label: "ARPA", kind: "indent", value: (m) => money(m.arpaCents) },
  { label: "Retention", kind: "section" },
  { label: "Logo churn (monthly)", kind: "indent", value: (m) => pct(m.logoChurnRate) },
  { label: "Gross MRR churn (monthly)", kind: "indent", value: (m) => pct(m.grossMrrChurnRate) },
  { label: "GRR (trailing 12 mo)", kind: "indent", value: (m) => pct(m.grr12) },
  { label: "NRR (trailing 12 mo)", kind: "indent", value: (m) => pct(m.nrr12) },
  { label: "Cash", kind: "section" },
  { label: "Cash balance", kind: "indent", value: (m) => money(m.cashCents) },
  { label: "Net burn", kind: "indent", value: (m) => money(m.netBurnCents) },
  { label: "Runway (months)", kind: "indent", value: (m) => num(m.runwayMonths, 1) },
  { label: "Burn multiple", kind: "indent", value: (m) => num(m.burnMultiple, 1, "x") },
];

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const company = await getOrCreateCompany(supabase);
  const [rows, cash] = await Promise.all([loadMrrRows(supabase, company.id), loadCash(supabase, company.id)]);

  if (rows.length === 0) {
    return (
      <main className="wrap">
        <AppHeader email={user.email} />
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Add your subscription data</h2>
          <p className="muted">
            Connect Stripe or upload a CSV of monthly MRR by customer to see your metrics.
          </p>
          <Link className="btn" href="/upload">
            Add data
          </Link>
        </div>
      </main>
    );
  }

  const { months, cohorts } = computeMetrics(rows, cash);
  const latest = months[months.length - 1];
  const prev = months.length > 1 ? months[months.length - 2] : null;
  const shown = months.slice(-12);
  const charted = months.slice(-24);

  const trend: TrendPoint[] = charted.map((m) => ({
    month: m.month,
    label: monthLabel(m.month),
    mrr: m.mrrCents,
    netNew: m.netNewMrrCents,
  }));
  const movements = charted.map((m) => ({
    month: m.month,
    label: monthLabel(m.month),
    newMrr: m.newMrrCents,
    expansion: m.expansionMrrCents,
    reactivation: m.reactivationMrrCents,
    contraction: m.contractionMrrCents,
    churn: m.churnedMrrCents,
    netNew: m.netNewMrrCents,
    beginning: m.mrrCents - m.netNewMrrCents,
    ending: m.mrrCents,
  }));
  const cohortViews: CohortView[] = cohorts.slice(-12).map((c) => ({
    cohort: c.cohort,
    label: monthLabel(c.cohort),
    customers: c.customers,
    startingMrr: c.startingMrrCents,
    revenue: c.revenueRetention,
    logos: c.logoRetention,
  }));
  const spark = (f: (m: MonthMetrics) => number | null) =>
    shown.map(f).filter((v): v is number => v !== null);

  const mrrDelta = prev && prev.mrrCents > 0 ? latest.mrrCents / prev.mrrCents - 1 : null;
  const tiles: Tile[] = [
    {
      label: "Net new MRR",
      value: moneyShort(latest.netNewMrrCents),
      sub: monthLabel(latest.month),
      spark: spark((m) => m.netNewMrrCents),
    },
    {
      label: "Customers",
      value: latest.customers.toLocaleString(),
      delta: prev
        ? {
            text: `${latest.customers - prev.customers >= 0 ? "+" : ""}${latest.customers - prev.customers} vs ${monthLabel(prev.month)}`,
            good: latest.customers >= prev.customers,
            show: true,
          }
        : undefined,
      sub: `ARPA ${moneyShort(latest.arpaCents)}`,
      spark: spark((m) => m.customers),
    },
    { label: "NRR (trailing 12 mo)", value: pct(latest.nrr12, 0), sub: `GRR ${pct(latest.grr12, 0)}` },
    {
      label: "Logo churn",
      value: pct(latest.logoChurnRate),
      sub: `Gross MRR churn ${pct(latest.grossMrrChurnRate)}`,
      spark: spark((m) => m.logoChurnRate),
    },
    {
      label: "Runway",
      value: latest.runwayMonths === null ? "—" : `${latest.runwayMonths.toFixed(1)} mo`,
      sub: latest.burnMultiple === null ? "Burn multiple —" : `Burn multiple ${latest.burnMultiple.toFixed(1)}x`,
    },
  ];

  return (
    <main className="wrap">
      <AppHeader email={user.email} />

      <section className="hero-row">
        <div className="hero-metric">
          <div className="label">MRR · {monthLabel(latest.month)}</div>
          <div className="hero-value">{moneyShort(latest.mrrCents)}</div>
          <div className="small">
            {mrrDelta !== null && (
              <span className={mrrDelta >= 0 ? "delta-good" : "delta-bad"}>
                {mrrDelta >= 0 ? "▲" : "▼"} {Math.abs(mrrDelta * 100).toFixed(1)}% vs {prev && monthLabel(prev.month)}
              </span>
            )}
            <span className="muted"> · ARR {moneyShort(latest.arrCents)}</span>
          </div>
          {cash.length === 0 && (
            <p className="small muted" style={{ marginBottom: 0 }}>
              <Link href="/upload">Add cash and burn</Link> to see runway and burn multiple.
            </p>
          )}
        </div>
        <div className="tiles">
          {tiles.map((t) => (
            <div className="tile" key={t.label}>
              <div className="label">{t.label}</div>
              <div className="value">{t.value}</div>
              {t.delta?.show && (
                <div className={`sub ${t.delta.good ? "delta-good" : "delta-bad"}`}>
                  {t.delta.good ? "▲" : "▼"} {t.delta.text}
                </div>
              )}
              {t.sub && <div className="sub">{t.sub}</div>}
              {t.spark && t.spark.length > 1 && (
                <div style={{ marginTop: 6 }}>
                  <Sparkline values={t.spark} />
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      <div className="chart-grid">
        <div className="card">
          <h3 className="chart-title">MRR</h3>
          <p className="chart-sub">Month-end monthly recurring revenue, last {trend.length} months</p>
          <MrrTrendChart data={trend} />
        </div>
        <div className="card">
          <h3 className="chart-title">Net new MRR bridge</h3>
          <p className="chart-sub">What moved MRR in one month</p>
          <NetNewBridge data={movements} />
        </div>
      </div>

      <div className="card">
        <h3 className="chart-title">MRR movements</h3>
        <p className="chart-sub">Gains above the line, losses below; the dot is net new MRR</p>
        <MrrMovementsChart data={movements} />
      </div>

      <div className="card">
        <h3 className="chart-title">Cohort retention</h3>
        <p className="chart-sub">Each row is the customers who started paying that month</p>
        <CohortHeatmap cohorts={cohortViews} />
      </div>

      <details className="card">
        <summary>
          <strong>Monthly metrics table</strong> <span className="muted small">(last 12 months, all metrics)</span>
        </summary>
        <div className="scroll" style={{ marginTop: 12 }}>
          <table className="grid">
            <thead>
              <tr>
                <th />
                {shown.map((m) => (
                  <th key={m.month}>{monthLabel(m.month)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {LINES.map((line) => (
                <tr key={line.label} className={line.kind ?? ""}>
                  <td>{line.label}</td>
                  {shown.map((m) => (
                    <td key={m.month} className={line.neg?.(m) ? "neg" : ""}>
                      {line.value ? line.value(m) : ""}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </main>
  );
}
