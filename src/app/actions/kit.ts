"use server";

import { revalidatePath } from "next/cache";
import { loadKit, requireProfile } from "@/lib/data";
import { aiAvailable, extractRules } from "@/lib/engine/gemini";
import { parsePattern } from "@/lib/engine/deterministic";
import { extractText } from "@/lib/extract";
import { ensureDemoData } from "@/lib/seed";
import { createServiceClient } from "@/lib/supabase/server";
import { randomUUID } from "node:crypto";
import { inspectImage } from "@/lib/images/analyze";
import { ASSET_BUCKET } from "@/lib/images/store";
import { validatePattern } from "@/lib/privacy/mask";

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
    const extracted = await extractRules(text, await loadKit(supabase));
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

/**
 * Adds any missing sample data (Brand Kit entries, sample drafts, demo history). Never deletes or overwrites:
 * running it again finds everything already there and adds nothing.
 */
export async function loadSampleData() {
  try {
    await requireAdmin();
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return { error: "SUPABASE_SERVICE_ROLE_KEY is not set on the server." };
    const s = await ensureDemoData(createServiceClient());
    revalidatePath("/", "layout");
    const added = Object.values(s.created).reduce((a, b) => a + b, 0) - (s.created.users ?? 0);
    return { ok: true, added };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Loading sample data failed" };
  }
}

// ---------------------------------------------------------------------------
// Visual identity: palette and logos (migration 0002)
// ---------------------------------------------------------------------------

export async function saveColor(input: { id?: string; name: string; hex: string }) {
  return wrap(async () => {
    const { supabase, profile } = await requireAdmin();
    const name = input.name.trim();
    let hex = input.hex.trim();
    if (/^[0-9A-Fa-f]{6}$/.test(hex)) hex = `#${hex}`;
    if (!name) throw new Error("Give the colour a name.");
    if (!/^#[0-9A-Fa-f]{6}$/.test(hex)) throw new Error("Use a 6-digit hex colour such as #5568F2.");
    const row = { name: name.slice(0, 60), hex: hex.toUpperCase() };
    const { error } = input.id
      ? await supabase.from("brand_colors").update(row).eq("id", input.id)
      : await supabase.from("brand_colors").insert({ ...row, workspace_id: profile.workspace_id });
    if (error) throw new Error(schemaHint(error.message));
  })();
}

export async function deleteColor(id: string) {
  return wrap(async () => {
    const { supabase } = await requireAdmin();
    const { error } = await supabase.from("brand_colors").delete().eq("id", id);
    if (error) throw new Error(error.message);
  })();
}

export async function uploadLogo(_: unknown, formData: FormData) {
  try {
    const { supabase, profile } = await requireAdmin();
    const file = formData.get("file");
    const name = String(formData.get("name") ?? "").trim();
    const version = String(formData.get("version") ?? "").trim() || "current";
    const isCurrent = formData.get("is_current") === "on";
    if (!(file instanceof File) || !file.size) return { error: "Choose a PNG or JPG logo file." };
    if (!name) return { error: "Give the logo a name." };
    const data = Buffer.from(await file.arrayBuffer());
    const { mime } = await inspectImage(data);
    const path = `${profile.workspace_id}/logos/${randomUUID()}.${mime === "image/png" ? "png" : "jpg"}`;
    const { error: upErr } = await supabase.storage.from(ASSET_BUCKET).upload(path, data, { contentType: mime });
    if (upErr) return { error: schemaHint(upErr.message) };
    const { error } = await supabase
      .from("brand_logos")
      .insert({ workspace_id: profile.workspace_id, name: name.slice(0, 80), version: version.slice(0, 60), storage_path: path, is_current: isCurrent });
    if (error) {
      await supabase.storage.from(ASSET_BUCKET).remove([path]);
      return { error: schemaHint(error.message) };
    }
    revalidatePath("/brand-kit");
    return { ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Upload failed" };
  }
}

export async function setLogoCurrent(id: string, isCurrent: boolean) {
  return wrap(async () => {
    const { supabase } = await requireAdmin();
    const { error } = await supabase.from("brand_logos").update({ is_current: isCurrent }).eq("id", id);
    if (error) throw new Error(error.message);
  })();
}

export async function deleteLogo(id: string) {
  return wrap(async () => {
    const { supabase } = await requireAdmin();
    const { data } = await supabase.from("brand_logos").select("storage_path").eq("id", id).maybeSingle();
    const { error } = await supabase.from("brand_logos").delete().eq("id", id);
    if (error) throw new Error(error.message);
    if (data?.storage_path) await supabase.storage.from(ASSET_BUCKET).remove([data.storage_path]);
  })();
}

// ---------------------------------------------------------------------------
// Confidential Terms (masked before any text is sent to the AI)
// ---------------------------------------------------------------------------

export async function saveConfidential(input: { id?: string; term: string; kind: string; note: string }) {
  return wrap(async () => {
    const { supabase, profile } = await requireAdmin();
    const term = input.term.trim();
    if (!["term", "unreleased_product", "pattern"].includes(input.kind)) throw new Error("Pick a type.");
    if (term.length < 2) throw new Error("Enter at least 2 characters.");
    if (input.kind === "pattern") {
      const problem = validatePattern(term);
      if (problem) throw new Error(problem);
    }
    const row = { term: term.slice(0, 200), kind: input.kind, note: input.note.trim().slice(0, 300) };
    const { error } = input.id
      ? await supabase.from("confidential_terms").update(row).eq("id", input.id)
      : await supabase.from("confidential_terms").insert({ ...row, workspace_id: profile.workspace_id });
    if (error) throw new Error(schemaHint(error.message));
  })();
}

export async function deleteConfidential(id: string) {
  return wrap(async () => {
    const { supabase } = await requireAdmin();
    const { error } = await supabase.from("confidential_terms").delete().eq("id", id);
    if (error) throw new Error(error.message);
  })();
}

/** Turn "relation does not exist" into an actionable message. */
function schemaHint(msg: string) {
  return /does not exist|schema cache|Bucket not found/i.test(msg)
    ? "This feature needs the database update in supabase/migrations/0002_final_round.sql. Ask the workspace owner to run it."
    : msg;
}

/** Brand minimum contrast for text in images (3–21, default 4.5). */
export async function saveMinContrast(value: number) {
  return wrap(async () => {
    const { supabase, profile } = await requireAdmin();
    if (!Number.isFinite(value) || value < 3 || value > 21) throw new Error("Enter a ratio between 3 and 21.");
    const { error } = await supabase
      .from("workspace_settings")
      .upsert({ workspace_id: profile.workspace_id, min_contrast: Math.round(value * 100) / 100, updated_at: new Date().toISOString() });
    if (error) throw new Error(/min_contrast|schema cache|does not exist/i.test(error.message) ? "This setting needs supabase/migrations/0003_brand_contrast.sql. Ask the workspace owner to run it." : error.message);
  })();
}
