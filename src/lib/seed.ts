import type { SupabaseClient } from "@supabase/supabase-js";
import { DEMO_DRAFTS, DEMO_FACTS, DEMO_PASSWORD, DEMO_RULES, DEMO_TERMS, DEMO_USERS, DEMO_WORKSPACE } from "./demo-kit";
import { runCheck } from "./engine";
import { applyResolutions } from "./engine/validate";
import { toRow } from "./engine/rows";
import type { BrandKit, Candidate } from "./types";

/** Hand-written resolutions for the seeded in-review draft, keyed by the flagged text. */
const SEED_RESOLUTIONS: Record<string, { status: "accepted" | "edited" | "disputed"; text?: string; reason?: string }> = {
  "India's top": { status: "edited", text: "a popular" },
  guarantee: { status: "edited", text: "help you aim for" },
  "Click here": { status: "edited", text: "Tap the link in our bio" },
  "!!!": { status: "disputed", reason: "Exam-season posts are allowed a little hype on Instagram; this is a one-off." },
};

async function ensureUsers(admin: SupabaseClient) {
  const { data: list, error } = await admin.auth.admin.listUsers({ perPage: 1000 });
  if (error) throw error;
  const ids: Record<string, string> = {};
  for (const u of DEMO_USERS) {
    let user = list.users.find((x) => x.email === u.email);
    if (!user) {
      const { data, error: e } = await admin.auth.admin.createUser({
        email: u.email,
        password: DEMO_PASSWORD,
        email_confirm: true,
        user_metadata: { full_name: u.full_name },
      });
      if (e) throw e;
      user = data.user!;
    } else {
      await admin.auth.admin.updateUserById(user.id, { password: DEMO_PASSWORD });
    }
    ids[u.role] = user.id;
  }
  return ids;
}

export async function seedDemo(admin: SupabaseClient, log: (m: string) => void = () => {}) {
  // Workspace: the first workspace is the demo workspace (sign-ups join it).
  let { data: ws } = await admin.from("workspaces").select("id").order("created_at").limit(1).maybeSingle();
  if (!ws) {
    const { data, error } = await admin.from("workspaces").insert({ name: DEMO_WORKSPACE }).select("id").single();
    if (error) throw error;
    ws = data;
  } else {
    await admin.from("workspaces").update({ name: DEMO_WORKSPACE }).eq("id", ws.id);
  }
  const workspace_id = ws!.id as string;
  log(`workspace ${workspace_id}`);

  const ids = await ensureUsers(admin);
  for (const u of DEMO_USERS) {
    const { error } = await admin
      .from("profiles")
      .upsert({ id: ids[u.role], workspace_id, full_name: u.full_name, role: u.role });
    if (error) throw error;
  }
  log("demo users ready");

  // Reset demo content: drafts by demo users and the whole Brand Kit.
  const demoIds = Object.values(ids);
  await admin.from("drafts").delete().eq("workspace_id", workspace_id).in("author_id", demoIds);
  await admin.from("guideline_rules").delete().eq("workspace_id", workspace_id);
  await admin.from("terms").delete().eq("workspace_id", workspace_id);
  await admin.from("facts").delete().eq("workspace_id", workspace_id);

  const { data: rules, error: rErr } = await admin
    .from("guideline_rules")
    .insert(DEMO_RULES.map((r) => ({ ...r, patterns: [...r.patterns], workspace_id, created_by: ids.admin })))
    .select("*");
  if (rErr) throw rErr;
  const { data: terms, error: tErr } = await admin
    .from("terms")
    .insert(DEMO_TERMS.map((t) => ({ ...t, banned: [...t.banned], workspace_id })))
    .select("*")
    .order("created_at");
  if (tErr) throw tErr;
  const { data: facts, error: fErr } = await admin
    .from("facts")
    .insert(DEMO_FACTS.map((f) => ({ ...f, workspace_id })))
    .select("*");
  if (fErr) throw fErr;
  log("brand kit loaded");

  // Keep term order identical to DEMO_TERMS so TERM-n codes are stable.
  const orderedTerms = DEMO_TERMS.map((d) => terms!.find((t) => t.preferred === d.preferred)!);
  const kit: BrandKit = { rules: rules!, terms: orderedTerms, facts: facts! };

  for (const d of DEMO_DRAFTS) {
    const { data: draft, error } = await admin
      .from("drafts")
      .insert({ workspace_id, author_id: ids.creator, title: d.title, purpose: d.purpose, channel: d.channel, status: "draft" })
      .select("*")
      .single();
    if (error) throw error;
    const { data: v1, error: vErr } = await admin
      .from("draft_versions")
      .insert({ draft_id: draft.id, version_no: 1, content: d.content, created_by: ids.creator, note: "First draft" })
      .select("*")
      .single();
    if (vErr) throw vErr;

    const result = await runCheck(d.content, d, kit);
    await admin.from("draft_versions").update({ checked: true, ai_checked: result.aiChecked }).eq("id", v1.id);
    const rows = result.findings.map((c: Candidate) => toRow(c, v1.id, draft.id));
    const { data: inserted, error: iErr } = await admin.from("findings").insert(rows).select("*");
    if (iErr) throw iErr;
    await admin.from("draft_events").insert([
      { draft_id: draft.id, actor_id: ids.creator, action: "created", detail: "Draft created", version_no: 1 },
      {
        draft_id: draft.id,
        actor_id: ids.creator,
        action: "checked",
        detail: `${inserted!.length} findings${result.aiChecked ? "" : " (rule checks only)"}`,
        version_no: 1,
      },
    ]);

    if (d.status === "in_review") {
      // Resolve every finding the way a creator would, then submit version 2.
      const now = new Date().toISOString();
      const resolutions: { id: string; start: number; end: number; text: string }[] = [];
      for (const f of inserted!) {
        const plan = SEED_RESOLUTIONS[f.quote];
        let status: "accepted" | "edited" | "disputed";
        let text: string | null = null;
        let reason: string | null = null;
        if (plan?.status === "disputed") {
          status = "disputed";
          reason = plan.reason!;
        } else if (plan?.text) {
          status = "edited";
          text = plan.text;
        } else if (f.suggestion) {
          status = "accepted";
          text = f.suggestion;
        } else {
          status = "disputed";
          reason = "Reviewed and kept as written.";
        }
        await admin
          .from("findings")
          .update({ status, resolution_text: text, dispute_reason: reason, resolved_by: ids.creator, resolved_at: now })
          .eq("id", f.id);
        if (text !== null) resolutions.push({ id: f.id, start: f.start_idx, end: f.end_idx, text });
      }
      const { text } = applyResolutions(d.content, resolutions);
      await admin
        .from("draft_versions")
        .insert({ draft_id: draft.id, version_no: 2, content: text, created_by: ids.creator, note: "Fixes applied" });
      await admin.from("drafts").update({ status: "in_review", current_version: 2 }).eq("id", draft.id);
      await admin.from("draft_events").insert({
        draft_id: draft.id,
        actor_id: ids.creator,
        action: "submitted",
        detail: "Sent for review with 1 disputed finding",
        version_no: 2,
      });
    }
    log(`draft "${d.title}" seeded (${inserted!.length} findings, ai=${result.aiChecked})`);
  }
  return { workspace_id };
}
