import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getOrCreateCompany, latestUpload, loadCash } from "@/lib/data";
import { money, monthLabel } from "@/lib/format";
import { AppHeader } from "../AppHeader";
import { UploadForm } from "./UploadForm";
import { saveCash } from "./actions";
import { connectStripe, disconnectStripe, resyncStripe } from "./stripe-actions";
import { getStripeConnection } from "@/lib/stripe/sync";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // Stripe syncs page through invoices

export default async function UploadPage({
  searchParams,
}: {
  searchParams: Promise<{
    cashSaved?: string;
    cashError?: string;
    stripeSynced?: string;
    stripeError?: string;
    stripeDisconnected?: string;
  }>;
}) {
  const { cashSaved, cashError, stripeSynced, stripeError, stripeDisconnected } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const company = await getOrCreateCompany(supabase);
  const [upload, cash, stripe] = await Promise.all([
    latestUpload(supabase, company.id),
    loadCash(supabase, company.id),
    getStripeConnection(supabase, company.id),
  ]);

  return (
    <main className="wrap">
      <AppHeader email={user.email} />

      {upload && (
        <p className="small" style={{ marginTop: -8 }}>
          Current subscription data: <strong>{upload.filename}</strong> ({upload.row_count.toLocaleString()}{" "}
          customer-months, {new Date(upload.created_at).toLocaleString()}). A new Stripe sync or CSV upload replaces
          it.
        </p>
      )}

      <div className="card">
        <h2 style={{ marginTop: 0 }}>Stripe</h2>
        {stripe ? (
          <>
            <p className="small">
              Connected with key <code>{stripe.key_hint}</code>
              {!stripe.livemode && " (test mode)"}.{" "}
              {stripe.last_synced_at
                ? `Last synced ${new Date(stripe.last_synced_at).toLocaleString()}: ${stripe.last_sync_summary}`
                : "Not synced yet."}
            </p>
            {stripe.last_error && !stripeSynced && <p className="error small">Last sync failed: {stripe.last_error}</p>}
            <div className="row">
              <form action={resyncStripe}>
                <button className="btn" type="submit">
                  Sync now
                </button>
              </form>
              <form action={disconnectStripe}>
                <button className="linkbtn small" type="submit">
                  Disconnect
                </button>
              </form>
            </div>
          </>
        ) : (
          <>
            <p className="muted small">
              SaaSDash rebuilds your monthly MRR history from Stripe invoices (up to 36 months). Use a{" "}
              <strong>restricted, read-only key</strong>: in Stripe, go to Developers → API keys → Create restricted key,
              and set <strong>Customers, Invoices, Prices, Products and Subscriptions</strong> to Read. Leave everything
              else as None. The key is encrypted before it&apos;s stored and can never change anything in your Stripe
              account.
            </p>
            <form action={connectStripe} className="row">
              <label className="field" style={{ flex: 1, minWidth: 260 }}>
                Restricted key
                <input type="password" name="key" required placeholder="rk_live_…" autoComplete="off" />
              </label>
              <button className="btn" type="submit">
                Connect and import
              </button>
            </form>
            <p className="muted small">Importing can take up to a minute for larger accounts.</p>
          </>
        )}
        {stripeSynced && <p className="success small">Imported from Stripe: {stripeSynced}</p>}
        {stripeError && <p className="error small">{stripeError}</p>}
        {stripeDisconnected && <p className="small">Stripe disconnected. Your imported data is unchanged.</p>}
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>Or upload a CSV</h2>
        <p className="muted small">
          One row per customer per month, with columns <code>customer_id</code>, <code>month</code> (YYYY-MM) and{" "}
          <code>mrr</code> (dollars). Annual plans should be entered at 1/12 per month.{" "}
          <a href="/sample-mrr.csv">Download a sample file</a>.
        </p>
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
