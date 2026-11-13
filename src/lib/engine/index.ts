import type { BrandKit, Candidate } from "../types";
import { deterministicChecks } from "./deterministic";
import { aiAvailable, aiCheck } from "./gemini";
import { mergeFindings, validateAiFindings, type ValidationReport } from "./validate";

export interface CheckResult {
  findings: Candidate[];
  aiChecked: boolean;
  aiError: string | null;
  discarded: ValidationReport["discarded"];
}

export const todayIso = () => new Date().toISOString().slice(0, 10);

export async function runCheck(
  content: string,
  meta: { purpose: string; channel: string; title: string },
  kit: BrandKit,
): Promise<CheckResult> {
  const rules = deterministicChecks(content, kit);
  if (!aiAvailable()) {
    return { findings: mergeFindings(rules, []), aiChecked: false, aiError: "AI checks are not configured", discarded: [] };
  }
  try {
    const raw = await aiCheck(content, meta, kit, todayIso());
    const report = validateAiFindings(content, raw, kit);
    return { findings: mergeFindings(rules, report.kept), aiChecked: true, aiError: null, discarded: report.discarded };
  } catch (e) {
    // The deterministic checks still run, so the core flow never breaks on an AI outage.
    console.error("AI check failed", e);
    return {
      findings: mergeFindings(rules, []),
      aiChecked: false,
      aiError: e instanceof Error ? e.message : "AI check failed",
      discarded: [],
    };
  }
}
