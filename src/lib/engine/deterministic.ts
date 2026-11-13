import type { BrandKit, Candidate, Rule, Term } from "../types";

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Word boundaries that understand Unicode letters (so "₹", Hindi words etc. behave).
const wrapWord = (body: string) => `(?<![\\p{L}\\p{N}_])(?:${body})(?![\\p{L}\\p{N}_])`;

function matchCase(source: string, replacement: string): string {
  if (!source || !replacement) return replacement;
  const first = source[0];
  if (first === first.toUpperCase() && first !== first.toLowerCase()) {
    return replacement[0].toUpperCase() + replacement.slice(1);
  }
  return replacement;
}

/**
 * Banned term variants. A variant that differs from the preferred term only by
 * letter case (e.g. "LUMIO" vs "Lumio") is matched case-sensitively; everything
 * else is matched case-insensitively.
 */
export function termChecks(content: string, terms: Term[]): Candidate[] {
  const out: Candidate[] = [];
  terms.forEach((term, i) => {
    for (const variant of term.banned) {
      if (!variant.trim()) continue;
      const caseOnly = variant.toLowerCase() === term.preferred.toLowerCase();
      const re = new RegExp(wrapWord(escapeRegex(variant)), caseOnly ? "gu" : "giu");
      for (const m of content.matchAll(re)) {
        const start = m.index!;
        const quote = m[0];
        // Keep the reader's sentence-initial capital unless the preferred term has its own casing.
        const preferredHasCaps = term.preferred !== term.preferred.toLowerCase();
        const suggestion = caseOnly || preferredHasCaps ? term.preferred : matchCase(quote, term.preferred);
        out.push({
          category: "terminology",
          severity: "medium",
          quote,
          start,
          end: start + quote.length,
          source_type: "term",
          source_id: term.id,
          source_label: `TERM-${i + 1} · Use "${term.preferred}"`,
          explanation: `"${quote}" is not approved wording. The Brand Kit says to use "${term.preferred}"${
            term.note ? ` — ${term.note}` : "."
          }`,
          suggestion,
          engine: "rules",
        });
      }
    }
  });
  return out;
}

/**
 * Rule patterns. Each pattern is a regex, optionally followed by " => replacement".
 * Without a replacement the finding carries no automatic fix and the creator writes one
 * (the AI pass usually supplies a contextual fix for the same span).
 */
export function parsePattern(raw: string): { regex: RegExp | null; replacement: string | null } {
  const [body, ...rest] = raw.split(" => ");
  const replacement = rest.length ? rest.join(" => ") : null;
  try {
    return { regex: new RegExp(body, "giu"), replacement };
  } catch {
    return { regex: null, replacement };
  }
}

export function ruleChecks(content: string, rules: Rule[]): Candidate[] {
  const out: Candidate[] = [];
  for (const rule of rules) {
    if (rule.status !== "active") continue;
    for (const raw of rule.patterns ?? []) {
      const { regex, replacement } = parsePattern(raw);
      if (!regex) continue;
      for (const m of content.matchAll(regex)) {
        if (!m[0]) continue;
        const start = m.index!;
        out.push({
          category: rule.category,
          severity: rule.severity,
          quote: m[0],
          start,
          end: start + m[0].length,
          source_type: "rule",
          source_id: rule.id,
          source_label: `${rule.code} · ${rule.title}`,
          explanation: rule.description,
          suggestion: replacement !== null ? m[0].replace(new RegExp(regex.source, "iu"), replacement) : "",
          engine: "rules",
        });
      }
    }
  }
  return out;
}

export function deterministicChecks(content: string, kit: BrandKit): Candidate[] {
  return [...termChecks(content, kit.terms), ...ruleChecks(content, kit.rules)];
}
