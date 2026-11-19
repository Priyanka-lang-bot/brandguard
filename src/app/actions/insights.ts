"use server";

import { revalidatePath } from "next/cache";
import { requireProfile } from "@/lib/data";

/** Admin: set the dispute rate (0–100 %) and minimum findings at which a rule is flagged "possibly unclear". */
export async function saveInsightSettings(_: unknown, formData: FormData) {
  const { supabase, profile } = await requireProfile();
  if (profile.role !== "admin") return { error: "Only admins can change insight settings." };
  const pct = Number(formData.get("threshold"));
  const min = Number(formData.get("min_findings"));
  if (!Number.isFinite(pct) || pct <= 0 || pct > 100) return { error: "Threshold must be between 1 and 100 %." };
  if (!Number.isInteger(min) || min < 1 || min > 1000) return { error: "Minimum findings must be a whole number of at least 1." };
  const { error } = await supabase
    .from("workspace_settings")
    .upsert({ workspace_id: profile.workspace_id, dispute_threshold: Math.round(pct * 10) / 1000, dispute_min_findings: min, updated_at: new Date().toISOString() });
  if (error) return { error: error.message };
  revalidatePath("/insights");
  return { ok: true };
}
