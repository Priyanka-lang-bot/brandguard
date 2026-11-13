"use server";

import { revalidatePath } from "next/cache";
import { requireProfile } from "@/lib/data";
import { aiAvailable, extractRules } from "@/lib/engine/gemini";
import { parsePattern } from "@/lib/engine/deterministic";
import { extractText } from "@/lib/extract";
import { seedDemo } from "@/lib/seed";
import { createServiceClient } from "@/lib/supabase/server";

const CATEGORIES = ["tone", "terminology", "claims", "messaging", "accessibility", "visual"] as const;
const SEVERITIES = ["high", "medium", "low"] as const;
const PREFIX: Record<string, string> = {
  tone: "TONE",
  terminology: "TERMS",
  claims: "CLAIM",
  messaging: "MSG",
  accessibility: "ACC",
  visual: "VIS",
};

async function requireAdmin() {
  const ctx = await requireProfile();
  if (ctx.profile.role !== "admin") throw new Error("Only admins can change the Brand Kit.");
  return ctx;
}

type Supa = Awaited<ReturnType<typeof requireProfile>>["supabase"];

async function nextCode(supabase: Supa, category: string) {
  const prefix = PREFIX[category] ?? "RULE";
  const { data } = await supabase.from("guideline_rules").select("code").like("code", `${prefix}-%`);
  const max = Math.max(0, ...(data ?? []).map((r) => Number(r.code.split("-")[1]) || 0));
  return `${prefix}-${max + 1}`;
}

function wrap<T extends unknown[]>(fn: (...a: T) => Promise<void>) {
  return async (...a: T): Promise<{ ok?: true; error?: string }> => {
    try {
      await fn(...a);
      revalidatePath("/brand-kit");
      return { ok: true };
    } catch (e) {
      return { error: e instanceof Error ? e.message : "Something went wrong" };
    }
  };
}

export async function saveRule(input: {
  id?: string;
  category: string;
  title: string;
  description: string;
  severity: string;
  patterns: string;
}) {
  return wrap(async () => {
    const { supabase, user, profile } = await requireAdmin();
    if (!CATEGORIES.includes(input.category as never)) throw new Error("Pick a category.");
    if (!SEVERITIES.includes(input.severity as never)) throw new Error("Pick a severity.");
    if (!input.title.trim() || !input.description.trim()) throw new Error("A rule needs a title and a description.");
    const patterns = input.patterns
      .split("\n")
      .map((p) => p.trim())
      .filter(Boolean);
    const bad = patterns.find((p) => !parsePattern(p).regex);
    if (bad) throw new Error(`Invalid pattern: ${bad}`);
    const row = {
      category: input.category,
      title: input.title.trim(),
      description: input.description.trim(),
      severity: input.severity,
      patterns,
    };
    if (input.id) {
      const { error } = await supabase.from("guideline_rules").update(row).eq("id", input.id);
      if (error) throw new Error(error.message);
    } else {
      const code = await nextCode(supabase, input.category);
      const { error } = await supabase
        .from("guideline_rules")
        .insert({ ...row, code, workspace_id: profile.workspace_id, created_by: user.id, status: "active" });
      if (error) throw new Error(error.message);
    }
  })();
}

export async function setRuleStatus(id: string, status: "active" | "pending" | "rejected") {
  return wrap(async () => {
    const { supabase } = await requireAdmin();
    const { error } = await supabase.from("guideline_rules").update({ status }).eq("id", id);
    if (error) throw new Error(error.message);
  })();
}

export async function deleteRule(id: string) {
  return wrap(async () => {
    const { supabase } = await requireAdmin();
    const { error } = await supabase.from("guideline_rules").delete().eq("id", id);
    if (error) throw new Error(error.message);
  })();
}

export async function saveTerm(input: { id?: string; preferred: string; banned: string; note: string }) {
  return wrap(async () => {
    const { supabase, profile } = await requireAdmin();
    const banned = input.banned
      .split(",")
      .map((b) => b.trim())
      .filter(Boolean);
    if (!input.preferred.trim() || !banned.length) throw new Error("Give the approved term and at least one variant to replace.");
    const row = { preferred: input.preferred.trim(), banned, note: input.note.trim() };
    const { error } = input.id
      ? await supabase.from("terms").update(row).eq("id", input.id)
      : await supabase.from("terms").insert({ ...row, workspace_id: profile.workspace_id });
    if (error) throw new Error(error.message);
  })();
}

export async function deleteTerm(id: string) {
  return wrap(async () => {
    const { supabase } = await requireAdmin();
    const { error } = await supabase.from("terms").delete().eq("id", id);
    if (error) throw new Error(error.message);
  })();
}

export async function saveFact(input: { id?: string; topic: string; statement: string; valid_until: string }) {
  return wrap(async () => {
    const { supabase, profile } = await requireAdmin();
    if (!input.topic.trim() || !input.statement.trim()) throw new Error("A fact needs a topic and a statement.");
    const row = { topic: input.topic.trim(), statement: input.statement.trim(), valid_until: input.valid_until || null };
    if (input.id) {
      const { error } = await supabase.from("facts").update(row).eq("id", input.id);
      if (error) throw new Error(error.message);
    } else {
      const { data } = await supabase.from("facts").select("code");
      const max = Math.max(0, ...(data ?? []).map((f) => Number(f.code.split("-")[1]) || 0));
      const { error } = await supabase
        .from("facts")
        .insert({ ...row, code: `FACT-${max + 1}`, workspace_id: profile.workspace_id });
      if (error) throw new Error(error.message);
    }
  })();
}

export async function deleteFact(id: string) {
  return wrap(async () => {
    const { supabase } = await requireAdmin();
    const { error } = await supabase.from("facts").delete().eq("id", id);
    if (error) throw new Error(error.message);
  })();
}

/** Upload a guideline PDF/DOCX: the AI proposes rules, which wait as "pending" until an admin approves each one. */
export async function importGuidelines(_: unknown, formData: FormData) {
  try {
    const { supabase, user, profile } = await requireAdmin();
    if (!aiAvailable()) return { error: "Guideline import needs the AI (GEMINI_API_KEY) to be configured." };
    const file = formData.get("file");
    if (!(file instanceof File) || !file.size) return { error: "Choose a PDF, DOCX or text file." };
    const text = await extractText(file);
    if (text.length < 40) return { error: "Couldn't find readable text in that file (scanned PDFs aren't supported yet)." };
    const extracted = await extractRules(text);
    if (!extracted.length) return { error: "No checkable rules were found in that document." };

    const counters: Record<string, number> = {};
    const rows = [];
    for (const r of extracted) {
      const category = CATEGORIES.includes(r.category as never) ? r.category : "messaging";
      if (counters[category] === undefined) {
        const code = await nextCode(supabase, category);
        counters[category] = Number(code.split("-")[1]);
      } else counters[category] += 1;
      // Keep the excerpt only if it really appears in the document (grounding check).
      const excerpt = r.excerpt && text.replace(/\s+/g, " ").includes(r.excerpt.replace(/\s+/g, " ").trim()) ? r.excerpt.trim() : null;
      rows.push({
        workspace_id: profile.workspace_id,
        code: `${PREFIX[category]}-${counters[category]}`,
        category,
        title: r.title.slice(0, 120),
        description: r.description,
        severity: SEVERITIES.includes(r.severity as never) ? r.severity : "medium",
        patterns: [],
        status: "pending",
        source: `pdf:${file.name}`,
        source_excerpt: excerpt,
        created_by: user.id,
      });
    }
    const { error } = await supabase.from("guideline_rules").insert(rows);
    if (error) return { error: error.message };
    revalidatePath("/brand-kit");
    return { ok: true, count: rows.length };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Import failed" };
  }
}

export async function resetDemo() {
  try {
    await requireAdmin();
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return { error: "SUPABASE_SERVICE_ROLE_KEY is not set on the server." };
    await seedDemo(createServiceClient());
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Reset failed" };
  }
}
