import { redirect } from "next/navigation";
import { createClient } from "./supabase/server";
import type { BrandKit, Profile } from "./types";

export async function requireProfile() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).single();
  if (!profile) redirect("/login?error=no-profile");
  return { supabase, user, profile: profile as Profile };
}

type Client = Awaited<ReturnType<typeof createClient>>;

/** Active Brand Kit. Terms are ordered by creation so TERM-n codes stay stable. */
export async function loadKit(supabase: Client, includeInactive = false): Promise<BrandKit> {
  let rulesQ = supabase.from("guideline_rules").select("*").order("category").order("code");
  if (!includeInactive) rulesQ = rulesQ.eq("status", "active");
  const [rules, terms, facts] = await Promise.all([
    rulesQ,
    supabase.from("terms").select("*").order("created_at").order("id"),
    supabase.from("facts").select("*").order("code"),
  ]);
  return { rules: rules.data ?? [], terms: terms.data ?? [], facts: facts.data ?? [] };
}

export async function profileMap(supabase: Client) {
  const { data } = await supabase.from("profiles").select("id, full_name, role");
  return Object.fromEntries((data ?? []).map((p) => [p.id, p])) as Record<string, Pick<Profile, "id" | "full_name" | "role">>;
}
