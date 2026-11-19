import type { Supabase } from "../supabase/server";
import { decryptSecret } from "../crypto";
import { fetchInvoices } from "./api";
import { invoicesToMrrRows } from "./mrr";

export interface StripeConnection {
  key_hint: string;
  livemode: boolean;
  last_synced_at: string | null;
  last_sync_summary: string | null;
  last_error: string | null;
}

export async function getStripeConnection(supabase: Supabase, companyId: string): Promise<StripeConnection | null> {
  const { data } = await supabase
    .from("stripe_connections")
    .select("key_hint, livemode, last_synced_at, last_sync_summary, last_error")
    .eq("company_id", companyId)
    .maybeSingle();
  return (data as StripeConnection | null) ?? null;
}

/** Pull invoices with the stored key, rebuild MRR, and replace the company's data. */
export async function syncStripe(supabase: Supabase, companyId: string): Promise<string> {
  const { data: conn, error } = await supabase
    .from("stripe_connections")
    .select("key_ciphertext")
    .eq("company_id", companyId)
    .single();
  if (error || !conn) throw new Error("Stripe is not connected.");

  try {
    const invoices = await fetchInvoices(decryptSecret(conn.key_ciphertext));
    const result = invoicesToMrrRows(invoices, Math.floor(Date.now() / 1000));
    if (result.rows.length === 0) {
      throw new Error("No subscription invoices found in the last 36 months, so there was nothing to import.");
    }

    const { error: rpcError } = await supabase.rpc("replace_mrr", {
      p_company: companyId,
      p_source: "stripe",
      p_label: "Stripe sync",
      p_rows: result.rows,
    });
    if (rpcError) throw new Error(rpcError.message);

    const customers = new Set(result.rows.map((r) => r.customerId)).size;
    let summary = `${result.invoicesUsed.toLocaleString()} invoices, ${customers.toLocaleString()} customers (${(result.currency ?? "").toUpperCase()})`;
    if (result.invoicesSkippedOtherCurrency > 0) {
      summary += `. Skipped ${result.invoicesSkippedOtherCurrency} invoices in other currencies.`;
    }
    await supabase
      .from("stripe_connections")
      .update({ last_synced_at: new Date().toISOString(), last_sync_summary: summary, last_error: null })
      .eq("company_id", companyId);
    return summary;
  } catch (e) {
    const message = e instanceof Error ? e.message : "Sync failed.";
    await supabase.from("stripe_connections").update({ last_error: message }).eq("company_id", companyId);
    throw e;
  }
}
