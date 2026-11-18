import type { Supabase } from "./supabase/server";
import type { CashRow, MrrRow } from "./metrics";

export interface Company {
  id: string;
  name: string;
}

/** v1: one company per user, created on first visit. */
export async function getOrCreateCompany(supabase: Supabase): Promise<Company> {
  const existing = await supabase
    .from("companies")
    .select("id, name")
    .order("created_at")
    .limit(1)
    .maybeSingle();
  if (existing.error) throw existing.error;
  if (existing.data) return existing.data as Company;

  const created = await supabase.from("companies").insert({}).select("id, name").single();
  if (created.error) throw created.error;
  return created.data as Company;
}

const PAGE = 1000; // PostgREST default max rows per request

export async function loadMrrRows(supabase: Supabase, companyId: string): Promise<MrrRow[]> {
  const out: MrrRow[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("mrr_rows")
      .select("customer_id, month, mrr_cents")
      .eq("company_id", companyId)
      .order("id")
      .range(from, from + PAGE - 1);
    if (error) throw error;
    for (const r of data ?? []) {
      out.push({ customerId: r.customer_id, month: String(r.month).slice(0, 7), mrrCents: Number(r.mrr_cents) });
    }
    if (!data || data.length < PAGE) break;
  }
  return out;
}

export async function loadCash(supabase: Supabase, companyId: string): Promise<CashRow[]> {
  const { data, error } = await supabase
    .from("cash_inputs")
    .select("month, cash_cents, net_burn_cents")
    .eq("company_id", companyId)
    .order("month");
  if (error) throw error;
  return (data ?? []).map((r) => ({
    month: String(r.month).slice(0, 7),
    cashCents: Number(r.cash_cents),
    netBurnCents: Number(r.net_burn_cents),
  }));
}

export async function latestUpload(supabase: Supabase, companyId: string) {
  const { data } = await supabase
    .from("uploads")
    .select("filename, row_count, created_at")
    .eq("company_id", companyId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data as { filename: string; row_count: number; created_at: string } | null;
}
