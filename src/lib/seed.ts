import type { SupabaseClient } from "@supabase/supabase-js";
import {
  DEMO_COLORS,
  DEMO_CONFIDENTIAL,
  DEMO_DRAFTS,
  DEMO_EXTRA_CREATOR,
  DEMO_FACTS,
  DEMO_PASSWORD,
  DEMO_RULES,
  DEMO_TERMS,
  DEMO_USERS,
  DEMO_WORKSPACE,
} from "./demo-kit";
import { runCheck } from "./engine";
import { applyResolutions } from "./engine/validate";
import { toRow } from "./engine/rows";
import type { BrandKit, Candidate } from "./types";
import { DEMO_LOGO_PNG, DEMO_POSTER_PNG, DEMO_RETIRED_LOGO_PNG } from "./demo/embedded";
import { POSTER } from "./demo/assets";
import { DISPUTE_PROBABILITY, DISPUTE_REASONS, HISTORY_TEMPLATES, prng } from "./demo/history";
import { measurePalette, measureRegionContrast } from "./images/analyze";
import { imageFindings, tagImageTextFindings, type ImageAnalysis } from "./images/findings";

/** Hand-written resolutions for the seeded in-review draft, keyed by the flagged text. */
const SEED_RESOLUTIONS: Record<string, { status: "accepted" | "edited" | "disputed"; text?: string; reason?: string }> = {
  "India's top": { status: "edited", text: "a popular" },
  guarantee: { status: "edited", text: "help you aim for" },
  "Click here": { status: "edited", text: "Tap the link in our bio" },
  "!!!": { status: "disputed", reason: "Exam-season posts are allowed a little hype on Instagram; this is a one-off." },
};

const ALL_USERS = [...DEMO_USERS, DEMO_EXTRA_CREATOR];

async function ensureUsers(admin: SupabaseClient) {
  const { data: list, error } = await admin.auth.admin.listUsers({ perPage: 1000 });
  if (error) throw error;
  const byEmail: Record<string, string> = {};
  for (const u of ALL_USERS) {
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
    byEmail[u.email] = user.id;
  }
  const ids = Object.fromEntries(DEMO_USERS.map((u) => [u.role, byEmail[u.email]])) as Record<"admin" | "creator" | "reviewer", string>;
  return { ids, byEmail };
}

async function hasSchema(admin: SupabaseClient) {
  const { error } = await admin.from("workspace_settings").select("workspace_id").limit(1);
  return !error;
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
  const finalRound = await hasSchema(admin);
  log(finalRound ? "migration 0002 detected" : "migration 0002 NOT applied: images, insights history and masking terms are skipped");

  const { ids, byEmail } = await ensureUsers(admin);
  {
    const { error } = await admin
      .from("profiles")
      .upsert(ALL_USERS.map((u) => ({ id: byEmail[u.email], workspace_id, full_name: u.full_name, role: u.role })));
    if (error) throw error;
  }
  log("demo users ready");

  // Reset demo content: drafts by demo users and the whole Brand Kit.
  const demoIds = Object.values(byEmail);
  await Promise.all([
    admin.from("drafts").delete().eq("workspace_id", workspace_id).in("author_id", demoIds),
    admin.from("guideline_rules").delete().eq("workspace_id", workspace_id),
    admin.from("terms").delete().eq("workspace_id", workspace_id),
    admin.from("facts").delete().eq("workspace_id", workspace_id),
    ...(finalRound
      ? [
          admin.from("brand_colors").delete().eq("workspace_id", workspace_id),
          admin.from("brand_logos").delete().eq("workspace_id", workspace_id),
          admin.from("confidential_terms").delete().eq("workspace_id", workspace_id),
          admin.from("check_cache").delete().eq("workspace_id", workspace_id),
        ]
      : []),
  ]);

  // Terms get staggered timestamps so their order (and the TERM-n codes derived from it) is identical everywhere.
  const base = Date.now() - 60_000;
  const ruleRows = DEMO_RULES.map((r) => {
    const { check_key, ...rest } = r as (typeof DEMO_RULES)[number] & { check_key?: string };
    return { ...rest, patterns: [...r.patterns], workspace_id, created_by: ids.admin, ...(finalRound ? { check_key: check_key ?? null } : {}) };
  });
  const [rulesRes, termsRes, factsRes] = await Promise.all([
    admin.from("guideline_rules").insert(ruleRows).select("*"),
    admin
      .from("terms")
      .insert(DEMO_TERMS.map((t, i) => ({ ...t, banned: [...t.banned], workspace_id, created_at: new Date(base + i * 1000).toISOString() })))
      .select("*"),
    admin.from("facts").insert(DEMO_FACTS.map((f) => ({ ...f, workspace_id }))).select("*"),
  ]);
  if (rulesRes.error) throw rulesRes.error;
  if (termsRes.error) throw termsRes.error;
  if (factsRes.error) throw factsRes.error;
  const rules = rulesRes.data!;
  const terms = termsRes.data!;
  const facts = factsRes.data!;
  log("brand kit ready");

  const kit: BrandKit = {
    rules,
    terms: DEMO_TERMS.map((d) => terms.find((t) => t.preferred === d.preferred)!),
    facts,
    colors: [],
    logos: [],
    confidential: [],
  };

  if (finalRound) {
    await seedVisualIdentity(admin, workspace_id, kit);
    log("palette, logos, confidential terms and settings ready");
  }

  await Promise.all(DEMO_DRAFTS.map((d) => seedSampleDraft(admin, workspace_id, ids, kit, d, log)));
  if (finalRound) {
    await seedPosterDraft(admin, workspace_id, ids, kit);
    log("poster draft seeded");
    const n = await seedHistory(admin, workspace_id, { ...ids, creator2: byEmail[DEMO_EXTRA_CREATOR.email] }, kit);
    log(`${n} historical demo drafts seeded (demo_seed = true)`);
  }
  return { workspace_id };
}

async function seedVisualIdentity(admin: SupabaseClient, workspace_id: string, kit: BrandKit) {
  const { data: colors, error } = await admin.from("brand_colors").insert(DEMO_COLORS.map((c) => ({ ...c, workspace_id }))).select("id, name, hex");
  if (error) throw error;
  kit.colors = colors ?? [];
  const { data: conf, error: cErr } = await admin.from("confidential_terms").insert(DEMO_CONFIDENTIAL.map((c) => ({ ...c, workspace_id }))).select("id, term, kind, note");
  if (cErr) throw cErr;
  kit.confidential = conf ?? [];
  await admin.from("workspace_settings").upsert({ workspace_id, dispute_threshold: 0.3, dispute_min_findings: 3 });
  const logos = [
    { name: "Lumio shield", version: "2026", file: DEMO_LOGO_PNG, is_current: true },
    { name: "Lumio badge", version: "2023 (retired)", file: DEMO_RETIRED_LOGO_PNG, is_current: false },
  ];
  const rows = [];
  for (const [i, l] of logos.entries()) {
    const path = `${workspace_id}/logos/demo-${i + 1}.png`;
    const { error: upErr } = await admin.storage.from("brand-assets").upload(path, Buffer.from(l.file, "base64"), { contentType: "image/png", upsert: true });
    if (upErr) throw upErr;
    rows.push({ workspace_id, name: l.name, version: l.version, storage_path: path, is_current: l.is_current });
  }
  const { data: logoRows, error: lErr } = await admin.from("brand_logos").insert(rows).select("id, name, version, storage_path, is_current");
  if (lErr) throw lErr;
  kit.logos = logoRows ?? [];
}

type Ids = Record<"admin" | "creator" | "reviewer", string>;

async function seedSampleDraft(admin: SupabaseClient, workspace_id: string, ids: Ids, kit: BrandKit, d: (typeof DEMO_DRAFTS)[number], log: (m: string) => void) {
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

  // Seed drafts use the deterministic checks only: fast, stable, and well inside serverless time limits.
  const result = await runCheck(d.content, d, kit, { ai: false });
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
      detail: `${inserted!.length} findings — rule checks only (demo data is seeded without the AI pass)`,
      version_no: 1,
    },
  ]);

  if (d.status === "in_review") {
    // Resolve every finding the way a creator would, then submit version 2.
    const now = new Date().toISOString();
    const resolutions: { id: string; start: number; end: number; text: string }[] = [];
    await Promise.all(
      inserted!.map(async (f) => {
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
      }),
    );
    const { text } = applyResolutions(d.content, resolutions);
    await admin.from("draft_versions").insert({ draft_id: draft.id, version_no: 2, content: text, created_by: ids.creator, note: "Fixes applied" });
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

/**
 * A poster draft for the image journey. The palette and contrast are measured from the real image. Its text
 * regions come from the poster's own design (it is generated by BrandGuard), not from the AI, and the stored
 * analysis says so (textSource: "seed").
 */
async function seedPosterDraft(admin: SupabaseClient, workspace_id: string, ids: Ids, kit: BrandKit) {
  const content = "Lumio Plus is here for exam season. Swipe to see what's included.";
  const { data: draft, error } = await admin
    .from("drafts")
    .insert({ workspace_id, author_id: ids.creator, title: "Exam season poster", purpose: "Announce Lumio Plus with a poster.", channel: "Instagram", status: "draft" })
    .select("*")
    .single();
  if (error) throw error;
  const buf = Buffer.from(DEMO_POSTER_PNG, "base64");
  const path = `${workspace_id}/${draft.id}/exam-poster.png`;
  const { error: upErr } = await admin.storage.from("draft-images").upload(path, buf, { contentType: "image/png", upsert: true });
  if (upErr) throw upErr;
  const blocks = [POSTER.headline, POSTER.grey].map((b) => {
    const [ymin, xmin, ymax, xmax] = b.box.map((v) => v / 1000);
    return { text: b.text, box: { x: xmin, y: ymin, w: xmax - xmin, h: ymax - ymin } };
  });
  const contrast = (await Promise.all(blocks.map((b) => measureRegionContrast(buf, b.box, b.text, POSTER.width, POSTER.height)))).filter(
    (c): c is NonNullable<typeof c> => c !== null,
  );
  const analysis: ImageAnalysis = {
    version: 1,
    width: POSTER.width,
    height: POSTER.height,
    palette: await measurePalette(buf),
    textBlocks: blocks,
    contrast,
    extractedText: blocks.map((b) => b.text).join("\n\n"),
    aiAltText: null,
    logo: null,
    ai: { ran: false, error: "demo data is seeded without the AI pass; text regions come from the poster's design file" },
    textSource: "seed",
  };
  const { data: img, error: imgErr } = await admin
    .from("draft_images")
    .insert({ draft_id: draft.id, workspace_id, storage_path: path, file_name: "exam-poster.png", mime: "image/png", width: POSTER.width, height: POSTER.height, bytes: buf.length, alt_text: "", analysis, analysed_at: new Date().toISOString(), created_by: ids.creator })
    .select("*")
    .single();
  if (imgErr) throw imgErr;
  const { data: v1, error: vErr } = await admin
    .from("draft_versions")
    .insert({ draft_id: draft.id, version_no: 1, content, created_by: ids.creator, note: "First draft", checked: true, ai_checked: false })
    .select("*")
    .single();
  if (vErr) throw vErr;
  const text = await runCheck(content, draft, kit, { ai: false });
  const imageText = await runCheck(analysis.extractedText, draft, kit, { ai: false });
  const all = [...text.findings, ...imageFindings({ id: img.id, file_name: img.file_name, alt_text: "", analysis }, kit), ...tagImageTextFindings(imageText.findings, img.id)];
  if (all.length) {
    const { error: fErr } = await admin.from("findings").insert(all.map((c) => toRow(c, v1.id, draft.id)));
    if (fErr) throw fErr;
  }
  await admin.from("draft_events").insert([
    { draft_id: draft.id, actor_id: ids.creator, action: "created", detail: "Draft created", version_no: 1 },
    { draft_id: draft.id, actor_id: ids.creator, action: "image_added", detail: "exam-poster.png", version_no: 1 },
    { draft_id: draft.id, actor_id: ids.creator, action: "checked", detail: `${all.length} findings · 1 image checked — rule checks only (demo data is seeded without the AI pass)`, version_no: 1 },
  ]);
}

/** Eight weeks of clearly marked demo history (drafts.demo_seed = true) so the insights dashboard has data. */
async function seedHistory(admin: SupabaseClient, workspace_id: string, ids: Ids & { creator2: string }, kit: BrandKit): Promise<number> {
  const rnd = prng(404);
  const DAY = 86_400_000;
  const now = Date.now();
  const plans = Array.from({ length: 24 }, (_, i) => {
    const weeksAgo = 8 - Math.floor(i / 3); // 3 drafts per week, oldest first
    const tpl = HISTORY_TEMPLATES[(i * 5) % HISTORY_TEMPLATES.length];
    const author = i % 2 === 0 ? ids.creator : ids.creator2;
    const created = now - weeksAgo * 7 * DAY + Math.floor(rnd() * 5) * DAY + Math.floor(rnd() * 8) * 3_600_000;
    const roll = rnd();
    const outcome = weeksAgo <= 1 && roll < 0.5 ? "draft" : roll < 0.8 ? "approved" : "changes_requested";
    return { i, tpl, author, created, outcome, reviewHours: 1 + Math.floor(rnd() * 30), submitHours: 1 + Math.floor(rnd() * 6) };
  });

  let count = 0;
  for (let start = 0; start < plans.length; start += 6) {
    await Promise.all(
      plans.slice(start, start + 6).map(async (p) => {
        const iso = (ms: number) => new Date(ms).toISOString();
        const status = p.outcome === "draft" ? "draft" : p.outcome;
        const { data: draft, error } = await admin
          .from("drafts")
          .insert({ workspace_id, author_id: p.author, title: p.tpl.title, purpose: p.tpl.purpose, channel: p.tpl.channel, status, current_version: p.outcome === "draft" ? 1 : 2, reviewer_id: p.outcome === "draft" ? null : ids.reviewer, demo_seed: true, created_at: iso(p.created), updated_at: iso(p.created + (p.submitHours + p.reviewHours) * 3_600_000) })
          .select("*")
          .single();
        if (error) throw error;
        const { data: v1, error: vErr } = await admin
          .from("draft_versions")
          .insert({ draft_id: draft.id, version_no: 1, content: p.tpl.content, created_by: p.author, note: "First draft", checked: true, ai_checked: false, created_at: iso(p.created) })
          .select("*")
          .single();
        if (vErr) throw vErr;
        const res = await runCheck(p.tpl.content, p.tpl, kit, { ai: false });
        const resolutions: { id: string; start: number; end: number; text: string }[] = [];
        const rows = res.findings.map((c) => {
          const code = c.source_label.split(" · ")[0];
          const row: Record<string, unknown> = { ...toRow(c, v1.id, draft.id), created_at: iso(p.created) };
          if (p.outcome === "draft" && rnd() < 0.6) return row; // still open
          if (rnd() < (DISPUTE_PROBABILITY[code] ?? 0.08)) {
            Object.assign(row, { status: "disputed", dispute_reason: DISPUTE_REASONS[code] ?? "Kept as written for this channel.", resolved_by: p.author, resolved_at: iso(p.created + 3_600_000) });
          } else {
            const text = c.suggestion || (code === "ACC-1" ? "See the guide" : c.quote);
            Object.assign(row, { status: c.suggestion ? "accepted" : "edited", resolution_text: text, resolved_by: p.author, resolved_at: iso(p.created + 3_600_000) });
          }
          return row;
        });
        if (rows.length) {
          const { data: inserted, error: fErr } = await admin.from("findings").insert(rows).select("id, start_idx, end_idx, status, resolution_text");
          if (fErr) throw fErr;
          for (const f of inserted ?? []) if (f.status === "accepted" || f.status === "edited") resolutions.push({ id: f.id, start: f.start_idx, end: f.end_idx, text: f.resolution_text ?? "" });
        }
        const events: Record<string, unknown>[] = [
          { draft_id: draft.id, actor_id: p.author, action: "created", detail: "Draft created (demo history)", version_no: 1, created_at: iso(p.created) },
          { draft_id: draft.id, actor_id: p.author, action: "checked", detail: `${rows.length} findings — rule checks only (demo history)`, version_no: 1, created_at: iso(p.created + 60_000) },
        ];
        if (p.outcome !== "draft") {
          const submitted = p.created + p.submitHours * 3_600_000;
          const decided = submitted + p.reviewHours * 3_600_000;
          await admin.from("draft_versions").insert({ draft_id: draft.id, version_no: 2, content: applyResolutions(p.tpl.content, resolutions).text, created_by: p.author, note: "Fixes applied", created_at: iso(submitted) });
          events.push({ draft_id: draft.id, actor_id: p.author, action: "submitted", detail: "Sent for review", version_no: 2, created_at: iso(submitted) });
          events.push(
            p.outcome === "approved"
              ? { draft_id: draft.id, actor_id: ids.reviewer, action: "approved", detail: "Looks good.", version_no: 2, created_at: iso(decided) }
              : { draft_id: draft.id, actor_id: ids.reviewer, action: "changes_requested", detail: "Please soften the claims.", version_no: 2, created_at: iso(decided) },
          );
        }
        await admin.from("draft_events").insert(events);
        count++;
      }),
    );
  }
  return count;
}
