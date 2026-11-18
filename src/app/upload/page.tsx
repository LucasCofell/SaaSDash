import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getOrCreateCompany, latestUpload, loadCash } from "@/lib/data";
import { money, monthLabel } from "@/lib/format";
import { AppHeader } from "../AppHeader";
import { UploadForm } from "./UploadForm";
import { saveCash } from "./actions";

export const dynamic = "force-dynamic";

export default async function UploadPage({
  searchParams,
}: {
  searchParams: Promise<{ cashSaved?: string; cashError?: string }>;
}) {
  const { cashSaved, cashError } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const company = await getOrCreateCompany(supabase);
  const [upload, cash] = await Promise.all([latestUpload(supabase, company.id), loadCash(supabase, company.id)]);

  return (
    <main className="wrap">
      <AppHeader email={user.email} />

      <div className="card">
        <h2 style={{ marginTop: 0 }}>Subscription data (CSV)</h2>
        <p className="muted small">
          One row per customer per month, with columns <code>customer_id</code>, <code>month</code> (YYYY-MM) and{" "}
          <code>mrr</code> (dollars). Annual plans should be entered at 1/12 per month. Uploading replaces your
          previous CSV data. <a href="/sample-mrr.csv">Download a sample file</a>.
        </p>
        {upload && (
          <p className="small">
            Current data: <strong>{upload.filename}</strong> ({upload.row_count.toLocaleString()} rows, uploaded{" "}
            {new Date(upload.created_at).toLocaleDateString()})
          </p>
        )}
        <UploadForm />
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>Cash and burn</h2>
        <p className="muted small">
          Month-end cash balance and that month&apos;s net burn (cash out minus cash in). These drive runway and burn
          multiple. Saving a month that already exists overwrites it.
        </p>
        <form action={saveCash} className="row">
          <label className="field">
            Month
            <input type="month" name="month" required />
          </label>
          <label className="field">
            Cash balance ($)
            <input type="text" inputMode="decimal" name="cash" required placeholder="1,500,000" />
          </label>
          <label className="field">
            Net burn ($)
            <input type="text" inputMode="decimal" name="burn" required placeholder="120,000" />
          </label>
          <button className="btn" type="submit">
            Save month
          </button>
        </form>
        {cashSaved && <p className="success small">Saved {monthLabel(cashSaved)}.</p>}
        {cashError && <p className="error small">{cashError}</p>}
        {cash.length > 0 && (
          <div className="scroll" style={{ marginTop: 16 }}>
            <table className="grid">
              <thead>
                <tr>
                  <th>Month</th>
                  <th>Cash</th>
                  <th>Net burn</th>
                </tr>
              </thead>
              <tbody>
                {[...cash].reverse().map((c) => (
                  <tr key={c.month}>
                    <td>{monthLabel(c.month)}</td>
                    <td>{money(c.cashCents)}</td>
                    <td>{money(c.netBurnCents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  );
}
