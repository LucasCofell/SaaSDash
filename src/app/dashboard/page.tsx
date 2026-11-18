import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getOrCreateCompany, loadCash, loadMrrRows } from "@/lib/data";
import { computeMetrics, type MonthMetrics } from "@/lib/metrics";
import { money, moneyShort, monthLabel, num, pct } from "@/lib/format";
import { AppHeader } from "../AppHeader";

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
            Upload a CSV of monthly MRR by customer to see your metrics. Stripe connection is coming next.
          </p>
          <Link className="btn" href="/upload">
            Upload CSV
          </Link>
        </div>
      </main>
    );
  }

  const { months, cohorts } = computeMetrics(rows, cash);
  const latest = months[months.length - 1];
  const shown = months.slice(-12);
  const recentCohorts = cohorts.slice(-12);
  const maxAge = Math.max(...recentCohorts.map((c) => c.revenueRetention.length));

  const tiles = [
    { label: "MRR", value: moneyShort(latest.mrrCents), sub: `ARR ${moneyShort(latest.arrCents)}` },
    { label: "Net new MRR", value: moneyShort(latest.netNewMrrCents), sub: monthLabel(latest.month) },
    { label: "Customers", value: latest.customers.toLocaleString(), sub: `ARPA ${moneyShort(latest.arpaCents)}` },
    { label: "NRR (T12M)", value: pct(latest.nrr12, 0), sub: `GRR ${pct(latest.grr12, 0)}` },
    { label: "Logo churn", value: pct(latest.logoChurnRate), sub: "this month" },
    {
      label: "Runway",
      value: latest.runwayMonths === null ? "—" : `${latest.runwayMonths.toFixed(1)} mo`,
      sub: latest.burnMultiple === null ? "Burn multiple —" : `Burn multiple ${latest.burnMultiple.toFixed(1)}x`,
    },
  ];

  return (
    <main className="wrap">
      <AppHeader email={user.email} />
      <p className="muted small" style={{ marginTop: -8 }}>
        Through {monthLabel(latest.month)}
        {cash.length === 0 && (
          <>
            {" · "}
            <Link href="/upload">Add cash and burn</Link> to see runway
          </>
        )}
      </p>

      <div className="tiles">
        {tiles.map((t) => (
          <div className="tile" key={t.label}>
            <div className="label">{t.label}</div>
            <div className="value">{t.value}</div>
            <div className="sub">{t.sub}</div>
          </div>
        ))}
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Monthly metrics</h3>
        <div className="scroll">
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
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Cohort revenue retention</h3>
        <p className="muted small">MRR from each starting cohort as a share of its first-month MRR.</p>
        <div className="scroll">
          <table className="grid">
            <thead>
              <tr>
                <th>Cohort</th>
                <th>Customers</th>
                <th>Starting MRR</th>
                {Array.from({ length: maxAge }, (_, k) => (
                  <th key={k}>M{k}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {recentCohorts.map((c) => (
                <tr key={c.cohort}>
                  <td>{monthLabel(c.cohort)}</td>
                  <td>{c.customers}</td>
                  <td>{money(c.startingMrrCents)}</td>
                  {Array.from({ length: maxAge }, (_, k) => {
                    const v = c.revenueRetention[k];
                    if (v === undefined) return <td key={k} />;
                    const alpha = Math.max(0.06, Math.min(1, v) * 0.45);
                    return (
                      <td key={k} style={{ background: `rgba(47, 91, 211, ${alpha})` }}>
                        {pct(v, 0)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}
