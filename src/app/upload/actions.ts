"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getOrCreateCompany } from "@/lib/data";
import { parseMrrCsv, isMonth, type CsvError } from "@/lib/metrics";

export interface UploadState {
  message?: string;
  errors: CsvError[];
}

const MAX_BYTES = 4_000_000;

export async function uploadCsv(_prev: UploadState, formData: FormData): Promise<UploadState> {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { message: "Choose a CSV file to upload.", errors: [] };
  if (file.size > MAX_BYTES) return { message: "That file is larger than 4 MB.", errors: [] };

  const { rows, errors } = parseMrrCsv(await file.text());
  if (errors.length > 0) {
    return {
      message: `Found ${errors.length} problem${errors.length === 1 ? "" : "s"}. Nothing was saved. Fix the file and upload it again.`,
      errors: errors.slice(0, 25),
    };
  }
  if (rows.length === 0) return { message: "The file has a header but no data rows.", errors: [] };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const company = await getOrCreateCompany(supabase);
  const { error } = await supabase.rpc("replace_mrr", {
    p_company: company.id,
    p_source: "csv",
    p_label: file.name,
    p_rows: rows,
  });
  if (error) return { message: `Could not save the upload: ${error.message}`, errors: [] };

  revalidatePath("/dashboard");
  redirect("/dashboard");
}

function dollarsToCents(raw: FormDataEntryValue | null): number | null {
  const s = String(raw ?? "").replace(/[$,\s]/g, "");
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
  return Math.round(Number(s) * 100);
}

export async function saveCash(formData: FormData) {
  const month = String(formData.get("month") ?? "");
  const cash = dollarsToCents(formData.get("cash"));
  const burn = dollarsToCents(formData.get("burn"));
  if (!isMonth(month) || cash === null || burn === null) {
    redirect("/upload?cashError=" + encodeURIComponent("Enter a month, cash balance and net burn."));
  }

  const supabase = await createClient();
  const company = await getOrCreateCompany(supabase);
  const { error } = await supabase
    .from("cash_inputs")
    .upsert(
      { company_id: company.id, month: `${month}-01`, cash_cents: cash, net_burn_cents: burn },
      { onConflict: "company_id,month" },
    );
  if (error) redirect("/upload?cashError=" + encodeURIComponent(error.message));
  revalidatePath("/dashboard");
  redirect("/upload?cashSaved=" + month);
}
