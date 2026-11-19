import { createHash } from "node:crypto";
import type { BrandKit, Candidate } from "../types";
import { deterministicChecks } from "./deterministic";
import { aiAvailable, aiCheck, friendlyAiError } from "./gemini";
import { mergeFindings, validateAiFindings, type ValidationReport } from "./validate";

export interface CheckResult {
  findings: Candidate[];
  aiChecked: boolean;
  aiError: string | null;
  discarded: ValidationReport["discarded"];
  /** Findings the model returned before the grounding gate (0 when the AI did not run or the result came from cache). */
  aiRawCount: number;
  /** True when the AI part was served from the result cache. */
  fromCache: boolean;
  masked: Record<string, number>;
}

/** Cached AI output for one (content, metadata, Brand Kit version, date) combination. */
export interface CachedAi {
  kept: Candidate[];
  rawCount: number;
  discardedCount: number;
}
export interface CheckCache {
  get(key: string): Promise<CachedAi | null>;
  set(key: string, value: CachedAi): Promise<void>;
}

export const todayIso = () => new Date().toISOString().slice(0, 10);

/** Fingerprint of everything in the Brand Kit that can change a check result. */
export function kitVersion(kit: BrandKit): string {
  const material = {
    rules: kit.rules
      .filter((r) => r.status === "active")
      .map((r) => [r.id, r.code, r.category, r.severity, r.title, r.description, r.patterns]),
    terms: kit.terms.map((t) => [t.id, t.preferred, t.banned, t.note]),
    facts: kit.facts.map((f) => [f.id, f.code, f.topic, f.statement, f.valid_until]),
    confidential: (kit.confidential ?? []).map((c) => [c.kind, c.term]),
  };
  return createHash("sha256").update(JSON.stringify(material)).digest("hex").slice(0, 16);
}

export function cacheKey(content: string, meta: { purpose: string; channel: string; title: string }, kit: BrandKit, today: string) {
  return createHash("sha256")
    .update(JSON.stringify([content, meta.title, meta.channel, meta.purpose, kitVersion(kit), today]))
    .digest("hex");
}

export async function runCheck(
  content: string,
  meta: { purpose: string; channel: string; title: string },
  kit: BrandKit,
  opts: { ai?: boolean; cache?: CheckCache | null; today?: string } = {},
): Promise<CheckResult> {
  const today = opts.today ?? todayIso();
  const rules = deterministicChecks(content, kit);
  const base = { aiRawCount: 0, fromCache: false, masked: {}, discarded: [] as ValidationReport["discarded"] };
  if (opts.ai === false) {
    return { ...base, findings: mergeFindings(rules, []), aiChecked: false, aiError: null };
  }
  if (!aiAvailable()) {
    return { ...base, findings: mergeFindings(rules, []), aiChecked: false, aiError: "AI checks are not configured" };
  }
  const key = opts.cache ? cacheKey(content, meta, kit, today) : "";
  if (opts.cache) {
    try {
      const hit = await opts.cache.get(key);
      if (hit) return { ...base, findings: mergeFindings(rules, hit.kept), aiChecked: true, aiError: null, fromCache: true };
    } catch {
      // A cache failure must never block a check.
    }
  }
  try {
    const out = await aiCheck(content, meta, kit, today);
    const report = validateAiFindings(content, out.findings, kit);
    if (opts.cache) {
      await opts.cache
        .set(key, { kept: report.kept, rawCount: out.findings.length, discardedCount: report.discarded.length })
        .catch(() => {});
    }
    return {
      findings: mergeFindings(rules, report.kept),
      aiChecked: true,
      aiError: null,
      discarded: report.discarded,
      aiRawCount: out.findings.length,
      fromCache: false,
      masked: out.masked,
    };
  } catch (e) {
    // The deterministic checks still run, so the core flow never breaks on an AI outage.
    // Only a short, content-free reason is logged.
    const msg = e instanceof Error ? e.message : "AI check failed";
    console.error(`AI check failed: ${friendlyAiError(msg)}`);
    return { ...base, findings: mergeFindings(rules, []), aiChecked: false, aiError: msg };
  }
}
