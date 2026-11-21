import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  DEMO_COLORS,
  DEMO_CONFIDENTIAL,
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
import { DEMO_LAUNCH_POSTER_PNG } from "./demo/embedded-launch";
import { LAUNCH_POSTER, POSTER } from "./demo/assets";
import { DISPUTE_PROBABILITY, DISPUTE_REASONS, HISTORY_TEMPLATES, prng } from "./demo/history";
import { SHOWCASE, SHOWCASE_FACTS, SHOWCASE_TERMS, type Decision, type ShowcaseDraft } from "./demo/showcase";
import { measurePalette, measureRegionContrast } from "./images/analyze";
import { imageFindings, tagImageTextFindings, type ImageAnalysis } from "./images/findings";

/*
 * Demo data.
 *
 * ensureDemoData() is the default and is safe to run any number of times against a live database:
 *  - it never deletes or overwrites anything; it only inserts what is missing,
 *  - Brand Kit entries are matched by their natural key (rule/fact code, preferred term, colour hex, ...),
 *  - sample drafts get deterministic ids (UUIDv5 of workspace + key), so a second run finds and skips them,
 *  - every sample draft is stored with drafts.demo_seed = true and shown with a "Sample" tag.
 * The only writes to existing rows: demo accounts get their demo password and role back (so the one-click demo
 * sign-in keeps working), and a demo rule whose check_key is still empty gets it filled in.
 *
 * resetDemoData() is the old destructive reset (drafts by demo accounts and the whole Brand Kit are deleted,
 * then everything is recreated). It is only reachable with an explicit flag: `npm run seed -- --reset` or
 * /api/setup?token=...&reset=1. Nothing in the app calls it.
 */

type Log = (m: string) => void;
type Role3 = "admin" | "creator" | "reviewer";
type Ids = Record<Role3, string> & { creator2: string };

export interface SeedSummary {
  workspace_id: string;
  created: Record<string, number>;
  skipped: Record<string, number>;
}

const ALL_USERS = [...DEMO_USERS, DEMO_EXTRA_CREATOR];
const iso = (ms: number) => new Date(ms).toISOString();
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/** Deterministic UUID (version 5 layout) for a seeded record, unique per workspace. */
export function demoUuid(workspace_id: string, key: string): string {
  const h = createHash("sha1").update(`brandguard-demo/${workspace_id}/${key}`).digest();
  h[6] = (h[6] & 0x0f) | 0x50;
  h[8] = (h[8] & 0x3f) | 0x80;
  const x = h.subarray(0, 16).toString("hex");
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20, 32)}`;
}

function must<T>(res: { data: T; error: { message: string } | null }, what: string): T {
  if (res.error) throw new Error(`${what}: ${res.error.message}`);
  return res.data;
}
/** Like must(), for single-row results that are always present on success. */
function one<T>(res: { data: T; error: { message: string } | null }, what: string): NonNullable<T> {
  const d = must(res, what);
  if (d === null || d === undefined) throw new Error(`${what}: no row returned`);
  return d as NonNullable<T>;
}

async function hasSchema(admin: SupabaseClient) {
  const { error } = await admin.from("workspace_settings").select("workspace_id").limit(1);
  return !error;
}

async function ensureWorkspace(admin: SupabaseClient, log: Log): Promise<string> {
  // The first workspace is the demo workspace (sign-ups join it). An existing one is never renamed.
  const { data: ws } = await admin.from("workspaces").select("id").order("created_at").limit(1).maybeSingle();
  if (ws) return ws.id as string;
  const created = one(await admin.from("workspaces").insert({ name: DEMO_WORKSPACE }).select("id").single(), "create workspace");
  log("workspace created");
  return created.id as string;
}

async function ensureUsers(admin: SupabaseClient, workspace_id: string, s: SeedSummary): Promise<Ids> {
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
      s.created.users = (s.created.users ?? 0) + 1;
    } else {
      // Demo accounts only: keep the published demo password working.
      await admin.auth.admin.updateUserById(user.id, { password: DEMO_PASSWORD });
      s.skipped.users = (s.skipped.users ?? 0) + 1;
    }
    byEmail[u.email] = user.id;
  }
  must(
    await admin.from("profiles").upsert(ALL_USERS.map((u) => ({ id: byEmail[u.email], workspace_id, full_name: u.full_name, role: u.role }))),
    "demo profiles",
  );
  const ids = Object.fromEntries(DEMO_USERS.map((u) => [u.role, byEmail[u.email]])) as Record<Role3, string>;
  return { ...ids, creator2: byEmail[DEMO_EXTRA_CREATOR.email] };
}

function count(s: SeedSummary, kind: string, created: number, skipped: number) {
  s.created[kind] = (s.created[kind] ?? 0) + created;
  s.skipped[kind] = (s.skipped[kind] ?? 0) + skipped;
}

/** Adds the demo Brand Kit entries that are missing. Existing entries (demo or not) are left exactly as they are. */
async function ensureBrandKit(admin: SupabaseClient, workspace_id: string, ids: Ids, finalRound: boolean, s: SeedSummary) {
  const [rules, terms, facts] = await Promise.all([
    admin.from("guideline_rules").select("id, code, check_key").eq("workspace_id", workspace_id),
    admin.from("terms").select("id, preferred").eq("workspace_id", workspace_id),
    admin.from("facts").select("id, code").eq("workspace_id", workspace_id),
  ]);
  // check_key arrives with migration 0002; without it, read the codes only.
  const ruleRows = (rules.error ? must(await admin.from("guideline_rules").select("id, code").eq("workspace_id", workspace_id), "rules") : rules.data ?? []) as {
    id: string;
    code: string;
    check_key?: string | null;
  }[];
  const haveCode = new Map(ruleRows.map((r) => [r.code, r]));
  const heldKeys = new Set(ruleRows.map((r) => r.check_key).filter(Boolean));

  const newRules = DEMO_RULES.filter((r) => !haveCode.has(r.code)).map((r) => {
    const { check_key, ...rest } = r as (typeof DEMO_RULES)[number] & { check_key?: string };
    const key = finalRound && check_key && !heldKeys.has(check_key) ? check_key : null;
    if (key) heldKeys.add(key);
    return { ...rest, patterns: [...r.patterns], workspace_id, created_by: ids.admin, ...(finalRound ? { check_key: key } : {}) };
  });
  if (newRules.length) must(await admin.from("guideline_rules").insert(newRules), "insert rules");
  // A demo rule that predates image checks gets its check_key (only if empty and no other rule holds it).
  let filled = 0;
  if (finalRound) {
    for (const r of DEMO_RULES as readonly ((typeof DEMO_RULES)[number] & { check_key?: string })[]) {
      const row = haveCode.get(r.code);
      if (row && r.check_key && !row.check_key && !heldKeys.has(r.check_key)) {
        must(await admin.from("guideline_rules").update({ check_key: r.check_key }).eq("id", row.id).is("check_key", null), "fill check_key");
        heldKeys.add(r.check_key);
        filled++;
      }
    }
  }
  count(s, "rules", newRules.length, DEMO_RULES.length - newRules.length);
  if (filled) count(s, "rule check_keys filled", filled, 0);

  const haveTerm = new Set((must(terms, "terms") ?? []).map((t) => t.preferred.toLowerCase()));
  const wantTerms = [...DEMO_TERMS, ...SHOWCASE_TERMS].filter((t) => !haveTerm.has(t.preferred.toLowerCase()));
  // Staggered timestamps keep the TERM-n order stable: new terms always land after existing ones.
  const base = Date.now() - 60_000;
  if (wantTerms.length)
    must(
      await admin.from("terms").insert(wantTerms.map((t, i) => ({ ...t, banned: [...t.banned], workspace_id, created_at: iso(base + i * 1000) }))),
      "insert terms",
    );
  count(s, "terms", wantTerms.length, DEMO_TERMS.length + SHOWCASE_TERMS.length - wantTerms.length);

  const haveFact = new Set((must(facts, "facts") ?? []).map((f) => f.code));
  const wantFacts = [...DEMO_FACTS, ...SHOWCASE_FACTS].filter((f) => !haveFact.has(f.code));
  if (wantFacts.length) must(await admin.from("facts").insert(wantFacts.map((f) => ({ ...f, workspace_id }))), "insert facts");
  count(s, "facts", wantFacts.length, DEMO_FACTS.length + SHOWCASE_FACTS.length - wantFacts.length);

  if (!finalRound) return;

  const [colors, conf, logos, settings] = await Promise.all([
    admin.from("brand_colors").select("hex").eq("workspace_id", workspace_id),
    admin.from("confidential_terms").select("term").eq("workspace_id", workspace_id),
    admin.from("brand_logos").select("name, version").eq("workspace_id", workspace_id),
    admin.from("workspace_settings").select("workspace_id").eq("workspace_id", workspace_id).maybeSingle(),
  ]);
  const haveHex = new Set((must(colors, "colors") ?? []).map((c) => c.hex.toUpperCase()));
  const wantColors = DEMO_COLORS.filter((c) => !haveHex.has(c.hex.toUpperCase()));
  if (wantColors.length) must(await admin.from("brand_colors").insert(wantColors.map((c) => ({ ...c, workspace_id }))), "insert colours");
  count(s, "colours", wantColors.length, DEMO_COLORS.length - wantColors.length);

  const haveConf = new Set((must(conf, "confidential") ?? []).map((c) => c.term));
  const wantConf = DEMO_CONFIDENTIAL.filter((c) => !haveConf.has(c.term));
  if (wantConf.length) must(await admin.from("confidential_terms").insert(wantConf.map((c) => ({ ...c, workspace_id }))), "insert confidential terms");
  count(s, "confidential terms", wantConf.length, DEMO_CONFIDENTIAL.length - wantConf.length);

  if (!must(settings, "settings")) {
    must(await admin.from("workspace_settings").insert({ workspace_id, dispute_threshold: 0.3, dispute_min_findings: 3 }), "insert settings");
    count(s, "workspace settings", 1, 0);
  } else count(s, "workspace settings", 0, 1);

  const haveLogo = new Set((must(logos, "logos") ?? []).map((l) => `${l.name}|${l.version}`));
  const demoLogos = [
    { name: "Lumio shield", version: "2026", file: DEMO_LOGO_PNG, is_current: true, path: `${workspace_id}/logos/demo-1.png` },
    { name: "Lumio badge", version: "2023 (retired)", file: DEMO_RETIRED_LOGO_PNG, is_current: false, path: `${workspace_id}/logos/demo-2.png` },
  ].filter((l) => !haveLogo.has(`${l.name}|${l.version}`));
  for (const l of demoLogos) {
    await uploadOnce(admin, "brand-assets", l.path, l.file);
    must(await admin.from("brand_logos").insert({ workspace_id, name: l.name, version: l.version, storage_path: l.path, is_current: l.is_current }), "insert logo");
  }
  count(s, "logos", demoLogos.length, 2 - demoLogos.length);
}

/** Uploads a file unless an object already exists at that path (existing objects are never replaced). */
async function uploadOnce(admin: SupabaseClient, bucket: string, path: string, base64: string) {
  const { error } = await admin.storage.from(bucket).upload(path, Buffer.from(base64, "base64"), { contentType: "image/png", upsert: false });
  if (error && !/exist|duplicate|409/i.test(`${error.message} ${(error as { statusCode?: string }).statusCode ?? ""}`)) throw error;
}

/** The workspace's Brand Kit as the engine sees it (service client, so filtered by workspace explicitly). */
async function loadWorkspaceKit(admin: SupabaseClient, workspace_id: string, finalRound: boolean): Promise<BrandKit> {
  const [rules, terms, facts] = await Promise.all([
    admin.from("guideline_rules").select("*").eq("workspace_id", workspace_id).eq("status", "active").order("category").order("code"),
    admin.from("terms").select("*").eq("workspace_id", workspace_id).order("created_at").order("id"),
    admin.from("facts").select("*").eq("workspace_id", workspace_id).order("code"),
  ]);
  const kit: BrandKit = { rules: must(rules, "rules") ?? [], terms: must(terms, "terms") ?? [], facts: must(facts, "facts") ?? [], colors: [], logos: [], confidential: [] };
  if (finalRound) {
    const [colors, logos, conf, settings] = await Promise.all([
      admin.from("brand_colors").select("id, name, hex").eq("workspace_id", workspace_id).order("created_at"),
      admin.from("brand_logos").select("id, name, version, storage_path, is_current").eq("workspace_id", workspace_id).order("created_at"),
      admin.from("confidential_terms").select("id, term, kind, note").eq("workspace_id", workspace_id).order("created_at"),
      admin.from("workspace_settings").select("*").eq("workspace_id", workspace_id).maybeSingle(),
    ]);
    kit.colors = colors.data ?? [];
    kit.logos = logos.data ?? [];
    kit.confidential = conf.data ?? [];
    kit.minContrast = Number((settings.data as { min_contrast?: number } | null)?.min_contrast ?? 4.5);
  }
  return kit;
}

type SeedState = "new" | "resume" | "skip";

/**
 * Where a sample draft stands:
 *  - "skip":   it is complete (its activity events exist; they are always written last), it is not a sample
 *              (demo_seed = false), or the same author already has a draft with this title (e.g. from an older seed);
 *  - "resume": our sample draft exists but an earlier run stopped part-way (no events yet). The missing steps are
 *              completed in place; nothing is deleted or overwritten;
 *  - "new":    nothing there yet.
 */
async function seedState(admin: SupabaseClient, id: string, author: string, title: string | null, finalRound: boolean): Promise<SeedState> {
  const { data: row } = await admin.from("drafts").select(finalRound ? "id, demo_seed" : "id").eq("id", id).maybeSingle();
  if (row) {
    if (finalRound && !(row as { demo_seed?: boolean }).demo_seed) return "skip";
    const { data: ev } = await admin.from("draft_events").select("id").eq("draft_id", id).limit(1);
    return ev?.length ? "skip" : "resume";
  }
  if (title) {
    const { data: same } = await admin.from("drafts").select("id").eq("author_id", author).eq("title", title).limit(1);
    if (same?.length) return "skip";
  }
  return "new";
}

/** Returns the id of a draft version, inserting it only if it does not exist yet (unique on draft_id + version_no). */
async function ensureVersion(admin: SupabaseClient, draft_id: string, version_no: number, fields: Record<string, unknown>): Promise<string> {
  const { data: have } = await admin.from("draft_versions").select("id").eq("draft_id", draft_id).eq("version_no", version_no).maybeSingle();
  if (have) return (have as { id: string }).id;
  return one(await admin.from("draft_versions").insert({ draft_id, version_no, ...fields }).select("id").single(), `insert version ${version_no}`).id as string;
}

type FindingResolution = { status: "accepted" | "edited" | "disputed"; resolution_text: string | null; dispute_reason: string | null; resolved_by: string; resolved_at: string };
type StoredFinding = { id: string; start_idx: number; end_idx: number; status: string; resolution_text: string | null; image_id?: string | null };

/**
 * A complete findings row. Every row sets status and the resolution columns explicitly: in a batch insert,
 * supabase-js sends the union of all rows' keys and PostgREST stores NULL (not the column default) for a key a
 * row lacks, so an open row without "status" next to a resolved row with it violates findings.status NOT NULL.
 */
export function findingRow(c: Candidate, version_id: string, draft_id: string, created_at: string, resolution?: FindingResolution): Record<string, unknown> {
  return {
    ...toRow(c, version_id, draft_id),
    created_at,
    status: "open",
    resolution_text: null,
    dispute_reason: null,
    resolved_by: null,
    resolved_at: null,
    ...resolution,
  };
}

async function storedFindings(admin: SupabaseClient, version_id: string): Promise<StoredFinding[]> {
  return (must(await admin.from("findings").select("id, start_idx, end_idx, status, resolution_text, image_id").eq("version_id", version_id), "read findings") ?? []) as StoredFinding[];
}

function textResolutions(rows: StoredFinding[]) {
  return rows
    .filter((f) => (f.status === "accepted" || f.status === "edited") && !f.image_id && f.resolution_text !== null)
    .map((f) => ({ id: f.id, start: f.start_idx, end: f.end_idx, text: f.resolution_text as string }));
}

interface SeedImage {
  png: string;
  file: string;
  width: number;
  height: number;
  alt: string;
  blocks: { text: string; box: [number, number, number, number] }[];
}
const IMAGES: Record<NonNullable<ShowcaseDraft["image"]>, SeedImage> = {
  "exam-poster": { png: DEMO_POSTER_PNG, file: "exam-poster.png", width: POSTER.width, height: POSTER.height, alt: "", blocks: [POSTER.headline, POSTER.grey] },
  "launch-poster": {
    png: DEMO_LAUNCH_POSTER_PNG,
    file: "schools-launch-poster.png",
    width: LAUNCH_POSTER.width,
    height: LAUNCH_POSTER.height,
    alt: LAUNCH_POSTER.alt,
    blocks: [LAUNCH_POSTER.headline, LAUNCH_POSTER.sub],
  },
};

/**
 * Stores a sample image and its measured analysis. Palette and contrast are measured from the real pixels; the
 * text regions come from the image's own design (BrandGuard generated it), not from the AI, and the stored
 * analysis says so (textSource: "seed").
 */
async function attachSeedImage(admin: SupabaseClient, workspace_id: string, draft_id: string, author: string, spec: SeedImage, at: string) {
  const buf = Buffer.from(spec.png, "base64");
  const path = `${workspace_id}/${draft_id}/${spec.file}`;
  await uploadOnce(admin, "draft-images", path, spec.png);
  const blocks = spec.blocks.map((b) => {
    const [ymin, xmin, ymax, xmax] = b.box.map((v) => v / 1000);
    return { text: b.text, box: { x: xmin, y: ymin, w: xmax - xmin, h: ymax - ymin } };
  });
  const contrast = (await Promise.all(blocks.map((b) => measureRegionContrast(buf, b.box, b.text, spec.width, spec.height)))).filter(
    (c): c is NonNullable<typeof c> => c !== null,
  );
  const analysis: ImageAnalysis = {
    version: 1,
    width: spec.width,
    height: spec.height,
    palette: await measurePalette(buf),
    textBlocks: blocks,
    contrast,
    extractedText: blocks.map((b) => b.text).join("\n\n"),
    aiAltText: null,
    logo: null,
    ai: { ran: false, error: "sample data is seeded without the AI pass; text regions come from the image's design file" },
    textSource: "seed",
  };
  const img = one(
    await admin
      .from("draft_images")
      .insert({ draft_id, workspace_id, storage_path: path, file_name: spec.file, mime: "image/png", width: spec.width, height: spec.height, bytes: buf.length, alt_text: spec.alt, analysis, analysed_at: at, created_by: author, created_at: at })
      .select("id, file_name, alt_text")
      .single(),
    "insert image",
  );
  return { img, analysis };
}

function factCandidates(d: ShowcaseDraft, content: string, kit: BrandKit): Candidate[] {
  const out: Candidate[] = [];
  for (const f of d.factFindings ?? []) {
    const fact = kit.facts.find((x) => x.code === f.factCode);
    const start = content.indexOf(f.quote);
    if (!fact || start < 0) continue; // only cite facts that exist in this workspace's Fact Vault
    out.push({
      category: "messaging",
      severity: "high",
      quote: f.quote,
      start,
      end: start + f.quote.length,
      source_type: "fact",
      source_id: fact.id,
      source_label: `${fact.code} · ${fact.topic}`,
      explanation: f.explanation,
      suggestion: f.suggestion,
      engine: "demo" as Candidate["engine"],
    });
  }
  return out;
}

function decide(f: { quote: string; suggestion: string; image_id?: string | null }, decisions: Record<string, Decision> | undefined): Decision {
  const plan = decisions?.[f.quote.toLowerCase()];
  if (plan) return plan;
  if (f.image_id) return { status: "disputed", reason: "Left for the reviewer to decide (sample)." };
  if (f.suggestion) return { status: "accepted" };
  return { status: "disputed", reason: "Reviewed and kept as written." };
}

type SeedOutcome = "created" | "repaired" | "skipped";

async function seedShowcaseDraft(admin: SupabaseClient, workspace_id: string, ids: Ids, kit: BrandKit, d: ShowcaseDraft, now: number, finalRound: boolean): Promise<SeedOutcome> {
  const id = demoUuid(workspace_id, `showcase:${d.key}`);
  const author = d.author === "creator" ? ids.creator : ids.creator2;
  if (d.image && !finalRound) return "skipped";
  const state = await seedState(admin, id, author, d.title, finalRound);
  if (state === "skip") return "skipped";

  const created = now - d.daysAgo * DAY - 2 * HOUR;
  const resolvedAt = created + 40 * 60_000;
  const submitted = created + (d.submitAfterHours ?? 2) * HOUR;
  const decided = submitted + (d.decideAfterHours ?? 0) * HOUR;
  const reviewed = d.outcome === "approved" || d.outcome === "changes_requested";
  const sent = reviewed || d.outcome === "in_review";
  const last = reviewed ? decided : sent ? submitted : resolvedAt;

  if (state === "new")
    must(
      await admin.from("drafts").insert({
        id,
        workspace_id,
        author_id: author,
        title: d.title,
        purpose: d.purpose,
        channel: d.channel,
        status: d.outcome === "unchecked" || d.outcome === "analysed" ? "draft" : d.outcome,
        current_version: sent ? 2 : 1,
        reviewer_id: reviewed ? ids.reviewer : null,
        created_at: iso(created),
        updated_at: iso(last),
        ...(finalRound ? { demo_seed: true } : {}),
      }),
      "insert draft",
    );
  const checked = d.outcome !== "unchecked";
  const v1 = await ensureVersion(admin, id, 1, { content: d.content, created_by: author, note: "First draft", checked, ai_checked: false, created_at: iso(created) });
  const events: Record<string, unknown>[] = [{ draft_id: id, actor_id: author, action: "created", detail: "Draft created (sample data)", version_no: 1, created_at: iso(created) }];

  let stored: StoredFinding[] = [];
  if (checked) {
    // The findings insert is one statement, so after an interrupted run they are either all there or all missing.
    stored = await storedFindings(admin, v1);
    type SeededImage = { id: string; file_name: string; alt_text: string; analysis: ImageAnalysis };
    let img: SeededImage | null = null;
    if (d.image) {
      const spec = IMAGES[d.image];
      const { data: haveImg } = await admin.from("draft_images").select("id, file_name, alt_text, analysis").eq("draft_id", id).limit(1);
      if (haveImg?.length) img = haveImg[0] as SeededImage;
      else {
        const a = await attachSeedImage(admin, workspace_id, id, author, spec, iso(created));
        img = { ...a.img, analysis: a.analysis } as SeededImage;
      }
      events.push({ draft_id: id, actor_id: author, action: "image_added", detail: spec.file, version_no: 1, created_at: iso(created) });
    }
    if (!stored.length) {
      const text = await runCheck(d.content, d, kit, { ai: false });
      const cands: Candidate[] = [...text.findings, ...factCandidates(d, d.content, kit)];
      if (img) {
        const imageText = await runCheck(img.analysis.extractedText, d, kit, { ai: false });
        cands.push(...imageFindings(img, kit), ...tagImageTextFindings(imageText.findings, img.id));
      }
      // Resolve findings the way the author would have.
      const rows = cands.map((c, i) => {
        if (!(sent || (d.resolveFirst ?? 0) > i)) return findingRow(c, v1, id, iso(created + 60_000));
        const plan = decide({ quote: c.quote, suggestion: c.suggestion, image_id: c.image_id }, d.decisions);
        return findingRow(c, v1, id, iso(created + 60_000), {
          status: plan.status === "accepted" && plan.text ? "edited" : plan.status,
          resolution_text: plan.status === "disputed" ? null : (plan.text ?? c.suggestion),
          dispute_reason: plan.reason ?? null,
          resolved_by: author,
          resolved_at: iso(resolvedAt),
        });
      });
      if (rows.length) stored = (must(await admin.from("findings").insert(rows).select("id, start_idx, end_idx, status, resolution_text, image_id"), "insert findings") ?? []) as StoredFinding[];
    }
    events.push({
      draft_id: id,
      actor_id: author,
      action: "checked",
      detail: `${stored.length} findings${d.image ? " · 1 image checked" : ""} — rule checks only; sample data is seeded without the AI pass`,
      version_no: 1,
      created_at: iso(created + 60_000),
    });
  }

  if (sent) {
    const disputed = stored.filter((f) => f.status === "disputed").length;
    await ensureVersion(admin, id, 2, { content: applyResolutions(d.content, textResolutions(stored)).text, created_by: author, note: "Fixes applied", created_at: iso(submitted - 5 * 60_000) });
    events.push({
      draft_id: id,
      actor_id: author,
      action: "submitted",
      detail: disputed ? `Sent for review with ${disputed} disputed finding${disputed === 1 ? "" : "s"}` : "Sent for review",
      version_no: 2,
      created_at: iso(submitted),
    });
    for (const c of d.comments ?? [])
      events.push({ draft_id: id, actor_id: c.by === "author" ? author : ids.reviewer, action: "comment", detail: c.text, version_no: 2, created_at: iso(created + c.afterHours * HOUR) });
    if (reviewed) events.push({ draft_id: id, actor_id: ids.reviewer, action: d.outcome, detail: d.decisionNote ?? "", version_no: 2, created_at: iso(decided) });
  }
  // Events last: their presence marks the sample as complete.
  must(await admin.from("draft_events").insert(events), "insert events");
  return state === "new" ? "created" : "repaired";
}

/** Eight weeks of clearly marked demo history (drafts.demo_seed = true) so Insights has data to compute from. */
async function seedHistory(admin: SupabaseClient, workspace_id: string, ids: Ids, kit: BrandKit, now: number, s: SeedSummary) {
  const planIds = Array.from({ length: 24 }, (_, i) => demoUuid(workspace_id, `history:${i}`));
  // An older seed stored history with random ids; if any of it is here, adding ours would double the charts.
  const { data: oldHistory } = await admin.from("draft_events").select("draft_id").eq("detail", "Draft created (demo history)").limit(200);
  const legacy = (oldHistory ?? []).some((e) => !planIds.includes(e.draft_id));
  if (legacy) {
    count(s, "history drafts", 0, 24);
    return;
  }
  const rnd = prng(404);
  const plans = planIds.map((id, i) => {
    const weeksAgo = 8 - Math.floor(i / 3); // 3 drafts per week, oldest first
    const tpl = HISTORY_TEMPLATES[(i * 5) % HISTORY_TEMPLATES.length];
    const author = i % 2 === 0 ? ids.creator : ids.creator2;
    const created = now - weeksAgo * 7 * DAY + Math.floor(rnd() * 5) * DAY + Math.floor(rnd() * 8) * HOUR;
    const roll = rnd();
    const outcome = weeksAgo <= 1 && roll < 0.5 ? "draft" : roll < 0.8 ? "approved" : "changes_requested";
    // Per-plan random stream so skipping an existing plan never shifts the decisions of the others.
    return { id, i, tpl, author, created, outcome, reviewHours: 1 + Math.floor(rnd() * 30), submitHours: 1 + Math.floor(rnd() * 6), rnd: prng(1000 + i) };
  });

  let made = 0;
  let repaired = 0;
  for (let start = 0; start < plans.length; start += 6) {
    const settled = await Promise.allSettled(
      plans.slice(start, start + 6).map(async (p): Promise<SeedOutcome> => {
        const state = await seedState(admin, p.id, p.author, null, true);
        if (state === "skip") return "skipped";
        if (state === "new")
          must(
            await admin.from("drafts").insert({
              id: p.id,
              workspace_id,
              author_id: p.author,
              title: p.tpl.title,
              purpose: p.tpl.purpose,
              channel: p.tpl.channel,
              status: p.outcome,
              current_version: p.outcome === "draft" ? 1 : 2,
              reviewer_id: p.outcome === "draft" ? null : ids.reviewer,
              demo_seed: true,
              created_at: iso(p.created),
              updated_at: iso(p.created + (p.submitHours + p.reviewHours) * HOUR),
            }),
            "insert history draft",
          );
        const v1 = await ensureVersion(admin, p.id, 1, { content: p.tpl.content, created_by: p.author, note: "First draft", checked: true, ai_checked: false, created_at: iso(p.created) });
        let stored = await storedFindings(admin, v1);
        if (!stored.length) {
          const res = await runCheck(p.tpl.content, p.tpl, kit, { ai: false });
          const at = iso(p.created);
          const done = iso(p.created + HOUR);
          const rows = res.findings.map((c) => {
            const code = c.source_label.split(" · ")[0];
            if (p.outcome === "draft" && p.rnd() < 0.6) return findingRow(c, v1, p.id, at); // still open
            if (p.rnd() < (DISPUTE_PROBABILITY[code] ?? 0.08))
              return findingRow(c, v1, p.id, at, { status: "disputed", resolution_text: null, dispute_reason: DISPUTE_REASONS[code] ?? "Kept as written for this channel.", resolved_by: p.author, resolved_at: done });
            const text = c.suggestion || (code === "ACC-1" ? "See the guide" : c.quote);
            return findingRow(c, v1, p.id, at, { status: c.suggestion ? "accepted" : "edited", resolution_text: text, dispute_reason: null, resolved_by: p.author, resolved_at: done });
          });
          if (rows.length) stored = (must(await admin.from("findings").insert(rows).select("id, start_idx, end_idx, status, resolution_text, image_id"), "insert history findings") ?? []) as StoredFinding[];
        }
        const events: Record<string, unknown>[] = [
          { draft_id: p.id, actor_id: p.author, action: "created", detail: "Draft created (demo history)", version_no: 1, created_at: iso(p.created) },
          { draft_id: p.id, actor_id: p.author, action: "checked", detail: `${stored.length} findings — rule checks only (demo history)`, version_no: 1, created_at: iso(p.created + 60_000) },
        ];
        if (p.outcome !== "draft") {
          const submitted = p.created + p.submitHours * HOUR;
          const decided = submitted + p.reviewHours * HOUR;
          await ensureVersion(admin, p.id, 2, { content: applyResolutions(p.tpl.content, textResolutions(stored)).text, created_by: p.author, note: "Fixes applied", created_at: iso(submitted) });
          events.push({ draft_id: p.id, actor_id: p.author, action: "submitted", detail: "Sent for review", version_no: 2, created_at: iso(submitted) });
          events.push(
            p.outcome === "approved"
              ? { draft_id: p.id, actor_id: ids.reviewer, action: "approved", detail: "Looks good.", version_no: 2, created_at: iso(decided) }
              : { draft_id: p.id, actor_id: ids.reviewer, action: "changes_requested", detail: "Please soften the claims.", version_no: 2, created_at: iso(decided) },
          );
        }
        must(await admin.from("draft_events").insert(events), "insert history events");
        return state === "new" ? "created" : "repaired";
      }),
    );
    const failed = settled.find((r): r is PromiseRejectedResult => r.status === "rejected");
    if (failed) throw failed.reason;
    const done = settled.map((r) => (r.status === "fulfilled" ? r.value : "skipped"));
    made += done.filter((o) => o === "created").length;
    repaired += done.filter((o) => o === "repaired").length;
  }
  count(s, "history drafts", made, 24 - made - repaired);
  if (repaired) count(s, "history drafts completed after an interrupted run", repaired, 0);
}

/** Safe, idempotent demo seed. See the comment at the top of this file. */
export async function ensureDemoData(admin: SupabaseClient, log: Log = () => {}): Promise<SeedSummary> {
  const s: SeedSummary = { workspace_id: "", created: {}, skipped: {} };
  const workspace_id = await ensureWorkspace(admin, log);
  s.workspace_id = workspace_id;
  log(`workspace ${workspace_id}`);
  const finalRound = await hasSchema(admin);
  log(finalRound ? "migration 0002 detected" : "migration 0002 NOT applied: images, palette, insights history and masking terms are skipped");

  const ids = await ensureUsers(admin, workspace_id, s);
  log("demo accounts ready");
  await ensureBrandKit(admin, workspace_id, ids, finalRound, s);
  log("Brand Kit: missing demo entries added, existing entries untouched");

  const kit = await loadWorkspaceKit(admin, workspace_id, finalRound);
  const now = Date.now();
  let made = 0;
  let repaired = 0;
  for (let i = 0; i < SHOWCASE.length; i += 4) {
    // allSettled: one failing draft must not leave its batch-mates running unobserved after this call returns.
    const results = await Promise.allSettled(SHOWCASE.slice(i, i + 4).map((d) => seedShowcaseDraft(admin, workspace_id, ids, kit, d, now, finalRound)));
    const failed = results.find((r): r is PromiseRejectedResult => r.status === "rejected");
    if (failed) throw failed.reason;
    for (const r of results) {
      if (r.status !== "fulfilled") continue;
      if (r.value === "created") made++;
      if (r.value === "repaired") repaired++;
    }
  }
  count(s, "sample drafts", made, SHOWCASE.length - made - repaired);
  if (repaired) count(s, "sample drafts completed after an interrupted run", repaired, 0);
  log(`sample drafts: ${made} added, ${repaired} completed after an interrupted run, ${SHOWCASE.length - made - repaired} already present`);
  if (finalRound) {
    await seedHistory(admin, workspace_id, ids, kit, now, s);
    log(`history drafts: ${s.created["history drafts"]} added, ${s.skipped["history drafts"]} already present`);
  }
  return s;
}

/**
 * Destructive reset, kept for local development only: deletes the drafts written by the demo accounts and the
 * whole Brand Kit of the demo workspace, then runs ensureDemoData(). Requires an explicit flag to reach.
 */
export async function resetDemoData(admin: SupabaseClient, log: Log = () => {}): Promise<SeedSummary> {
  const workspace_id = await ensureWorkspace(admin, log);
  const finalRound = await hasSchema(admin);
  const { data: list } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const demoIds = (list?.users ?? []).filter((u) => ALL_USERS.some((d) => d.email === u.email)).map((u) => u.id);
  await Promise.all([
    demoIds.length ? admin.from("drafts").delete().eq("workspace_id", workspace_id).in("author_id", demoIds) : null,
    admin.from("guideline_rules").delete().eq("workspace_id", workspace_id),
    admin.from("terms").delete().eq("workspace_id", workspace_id),
    admin.from("facts").delete().eq("workspace_id", workspace_id),
    ...(finalRound
      ? ["brand_colors", "brand_logos", "confidential_terms", "check_cache"].map((t) => admin.from(t).delete().eq("workspace_id", workspace_id))
      : []),
  ]);
  log("demo workspace reset (explicit --reset)");
  return ensureDemoData(admin, log);
}
