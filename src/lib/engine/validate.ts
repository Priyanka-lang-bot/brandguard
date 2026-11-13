import type { BrandKit, Candidate, Category, Severity, SourceType } from "../types";

/** Raw finding as returned by the model, before grounding checks. */
export interface RawAiFinding {
  quote?: unknown;
  source_id?: unknown;
  explanation?: unknown;
  suggestion?: unknown;
  severity?: unknown;
}

export interface SourceRef {
  type: SourceType;
  id: string;
  label: string;
  category: Category;
  severity: Severity;
}

/** Codes the model can cite. Terms get TERM-n codes in Brand Kit order. */
export function buildSourceIndex(kit: BrandKit): Map<string, SourceRef> {
  const index = new Map<string, SourceRef>();
  for (const r of kit.rules) {
    if (r.status !== "active") continue;
    index.set(r.code.toUpperCase(), {
      type: "rule",
      id: r.id,
      label: `${r.code} · ${r.title}`,
      category: r.category,
      severity: r.severity,
    });
  }
  kit.terms.forEach((t, i) => {
    index.set(`TERM-${i + 1}`, {
      type: "term",
      id: t.id,
      label: `TERM-${i + 1} · Use "${t.preferred}"`,
      category: "terminology",
      severity: "medium",
    });
  });
  for (const f of kit.facts) {
    index.set(f.code.toUpperCase(), {
      type: "fact",
      id: f.id,
      label: `${f.code} · ${f.topic}`,
      category: "messaging",
      severity: "high",
    });
  }
  return index;
}

/** Find `quote` in `content`: exact first, then case-insensitive, then whitespace-tolerant. */
export function locate(content: string, quote: string, taken: Array<[number, number]> = []): [number, number] | null {
  const free = (s: number, e: number) => !taken.some(([a, b]) => s < b && a < e);
  const tryAll = (haystack: string, needle: string) => {
    let from = 0;
    while (needle) {
      const i = haystack.indexOf(needle, from);
      if (i < 0) return null;
      if (free(i, i + needle.length)) return [i, i + needle.length] as [number, number];
      from = i + 1;
    }
    return null;
  };
  const exact = tryAll(content, quote);
  if (exact) return exact;
  const ci = tryAll(content.toLowerCase(), quote.toLowerCase());
  if (ci) return ci;
  // Whitespace-tolerant: the model sometimes collapses line breaks.
  const parts = quote.trim().split(/\s+/).map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  if (!parts.length || !parts[0]) return null;
  const re = new RegExp(parts.join("\\s+"), "gi");
  for (const m of content.matchAll(re)) {
    const s = m.index!;
    if (free(s, s + m[0].length)) return [s, s + m[0].length];
  }
  return null;
}

export interface ValidationReport {
  kept: Candidate[];
  discarded: { reason: string; finding: RawAiFinding }[];
}

/**
 * Grounding gate: a model finding is kept only if it cites a real Brand Kit source
 * and quotes text that actually exists in the draft. Everything else is discarded.
 */
export function validateAiFindings(content: string, raw: RawAiFinding[], kit: BrandKit): ValidationReport {
  const index = buildSourceIndex(kit);
  const kept: Candidate[] = [];
  const discarded: ValidationReport["discarded"] = [];
  const taken = new Map<string, Array<[number, number]>>();

  for (const f of raw) {
    const quote = typeof f.quote === "string" ? f.quote : "";
    const code = typeof f.source_id === "string" ? f.source_id.trim().toUpperCase() : "";
    const explanation = typeof f.explanation === "string" ? f.explanation.trim() : "";
    const suggestion = typeof f.suggestion === "string" ? f.suggestion : "";
    const src = index.get(code);

    if (!src) {
      discarded.push({ reason: `cites unknown source "${code}"`, finding: f });
      continue;
    }
    if (!quote.trim() || quote.length > 600) {
      discarded.push({ reason: "missing or oversized quote", finding: f });
      continue;
    }
    if (!explanation) {
      discarded.push({ reason: "no explanation", finding: f });
      continue;
    }
    const spans = taken.get(code) ?? [];
    const pos = locate(content, quote, spans);
    if (!pos) {
      discarded.push({ reason: "quote not found in draft", finding: f });
      continue;
    }
    const actual = content.slice(pos[0], pos[1]);
    if (suggestion.trim() === actual.trim()) {
      discarded.push({ reason: "suggestion identical to original", finding: f });
      continue;
    }
    spans.push(pos);
    taken.set(code, spans);

    const sev = f.severity === "high" || f.severity === "medium" || f.severity === "low" ? f.severity : src.severity;
    kept.push({
      category: src.category,
      severity: sev,
      quote: actual,
      start: pos[0],
      end: pos[1],
      source_type: src.type,
      source_id: src.id,
      source_label: src.label,
      explanation,
      suggestion,
      engine: "ai",
    });
  }
  return { kept, discarded };
}

const overlaps = (a: Candidate, b: Candidate) => a.start < b.end && b.start < a.end;

/**
 * Merge deterministic and AI findings. When both flag overlapping text for the same
 * source, the AI version wins if it has a fix and the rule version does not; otherwise
 * the deterministic one wins (it is exact). Results are sorted by position.
 */
export function mergeFindings(rules: Candidate[], ai: Candidate[]): Candidate[] {
  const out: Candidate[] = [];
  for (const r of rules) {
    const twin = ai.find((a) => a.source_id === r.source_id && overlaps(a, r));
    if (twin && !r.suggestion && twin.suggestion) continue;
    out.push(r);
  }
  for (const a of ai) {
    const twin = rules.find((r) => r.source_id === a.source_id && overlaps(a, r));
    if (twin && (twin.suggestion || !a.suggestion)) continue;
    // Drop AI duplicates of the same span + source.
    if (out.some((o) => o.source_id === a.source_id && o.start === a.start && o.end === a.end)) continue;
    out.push(a);
  }
  return out.sort((a, b) => a.start - b.start || a.end - b.end);
}

/**
 * Build the next version's text from the creator's resolutions. Accepted/edited findings
 * replace their span; overlapping later spans are skipped and reported.
 */
export function applyResolutions(
  content: string,
  resolutions: { id: string; start: number; end: number; text: string }[],
): { text: string; skipped: string[] } {
  const sorted = [...resolutions].sort((a, b) => a.start - b.start || a.end - b.end);
  const chosen: typeof sorted = [];
  const skipped: string[] = [];
  for (const r of sorted) {
    const last = chosen[chosen.length - 1];
    if (last && r.start < last.end) skipped.push(r.id);
    else chosen.push(r);
  }
  let text = content;
  for (const r of [...chosen].reverse()) {
    text = text.slice(0, r.start) + r.text + text.slice(r.end);
  }
  return { text, skipped };
}
