"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getOrCreateCompany } from "@/lib/data";
import { encryptSecret } from "@/lib/crypto";
import { verifyKey } from "@/lib/stripe/api";
import { syncStripe } from "@/lib/stripe/sync";

const back = (params: Record<string, string>) => "/upload?" + new URLSearchParams(params).toString();
const errText = (e: unknown) => (e instanceof Error ? e.message : "Something went wrong.");

async function context() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const company = await getOrCreateCompany(supabase);
  return { supabase, company };
}

export async function connectStripe(formData: FormData) {
  const key = String(formData.get("key") ?? "").trim();
  if (key.startsWith("sk_")) {
    redirect(back({ stripeError: "That's a secret key with full access. Create a restricted read-only key (starts with rk_) instead." }));
  }
  if (!/^rk_(live|test)_[A-Za-z0-9]+$/.test(key)) {
    redirect(back({ stripeError: "Paste a restricted key. It starts with rk_live_ or rk_test_." }));
  }

  const { supabase, company } = await context();
  let target: string;
  try {
    await verifyKey(key);
    const { error } = await supabase.from("stripe_connections").upsert({
      company_id: company.id,
      key_ciphertext: encryptSecret(key),
      key_hint: `${key.slice(0, 8)}…${key.slice(-4)}`,
      livemode: key.startsWith("rk_live_"),
      last_error: null,
    });
    if (error) throw new Error(error.message);
    const summary = await syncStripe(supabase, company.id);
    target = back({ stripeSynced: summary });
  } catch (e) {
    target = back({ stripeError: errText(e) });
  }
  revalidatePath("/dashboard");
  redirect(target);
}

export async function resyncStripe() {
  const { supabase, company } = await context();
  let target: string;
  try {
    target = back({ stripeSynced: await syncStripe(supabase, company.id) });
  } catch (e) {
    target = back({ stripeError: errText(e) });
  }
  revalidatePath("/dashboard");
  redirect(target);
}

export async function disconnectStripe() {
  const { supabase, company } = await context();
  await supabase.from("stripe_connections").delete().eq("company_id", company.id);
  redirect(back({ stripeDisconnected: "1" }));
}
