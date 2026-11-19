/**
 * Confidentiality masking for every text that is sent to an AI provider.
 *
 * - Values are replaced with placeholders such as [[EMAIL_1_k3f9q2]]. The suffix is a per-request nonce
 *   chosen so that it does not occur anywhere in the texts being masked, which prevents collisions with
 *   user content and stops one request from restoring another request's placeholders.
 * - Overlapping matches are resolved deterministically: earliest start wins, then the longest match, then
 *   the more specific kind (confidential term / product before custom pattern before email / phone).
 * - The same original value always maps to the same placeholder within one masker, so a confidential
 *   product mentioned in both the Brand Kit and the draft stays consistent for the model.
 * - assertClean() is a last line of defence: it refuses a payload that still contains an original value.
 *
 * Nothing in this module logs.
 */

export type MaskKind = "EMAIL" | "PHONE" | "CONF" | "PRODUCT" | "CUSTOM";

export interface ConfidentialTerm {
  term: string;
  kind: "term" | "unreleased_product";
}

export interface MaskConfig {
  confidentialTerms?: ConfidentialTerm[];
  /** Admin-defined regular expressions (JavaScript syntax, matched case-insensitively). */
  patterns?: string[];
  /** Built-in detectors; both default to true. */
  emails?: boolean;
  phones?: boolean;
}

interface Match {
  start: number;
  end: number;
  kind: MaskKind;
  value: string;
}

const KIND_PRIORITY: Record<MaskKind, number> = { CONF: 0, PRODUCT: 0, CUSTOM: 1, EMAIL: 2, PHONE: 2 };

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g;
// Candidate phone numbers: optional +country, optional (area), digit groups separated by space . or -.
const PHONE_RE = /(?<![\w+])(?:\+\d{1,3}[\s.-]?)?(?:\(\d{1,5}\)[\s.-]?)?\d{2,5}(?:[\s.-]\d{2,5}){0,4}(?![\w])/g;

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const wordWrap = (body: string) => `(?<![\\p{L}\\p{N}_])(?:${body})(?![\\p{L}\\p{N}_])`;

export function isLikelyPhone(candidate: string): boolean {
  const digits = candidate.replace(/\D/g, "");
  if (/^\d{4}-\d{2}-\d{2}$/.test(candidate)) return false; // ISO date
  if (/^\d{4}\s?[-–]\s?\d{4}$/.test(candidate)) return false; // year range
  if (candidate.trim().startsWith("+")) return digits.length >= 8 && digits.length <= 15;
  return digits.length >= 10 && digits.length <= 15;
}

/** Validate an admin-defined pattern. Returns an error message, or null when it is usable. */
export function validatePattern(raw: string): string | null {
  if (!raw.trim()) return "Pattern is empty.";
  if (raw.length > 200) return "Pattern is longer than 200 characters.";
  try {
    const re = new RegExp(raw, "giu");
    if (re.test("")) return "Pattern matches empty text.";
  } catch (e) {
    return `Invalid regular expression: ${e instanceof Error ? e.message : String(e)}`;
  }
  return null;
}

export function findSensitive(text: string, config: MaskConfig): Match[] {
  const found: Match[] = [];
  const push = (start: number, value: string, kind: MaskKind) => {
    if (value) found.push({ start, end: start + value.length, kind, value });
  };
  if (config.emails !== false) for (const m of text.matchAll(EMAIL_RE)) push(m.index!, m[0], "EMAIL");
  if (config.phones !== false)
    for (const m of text.matchAll(PHONE_RE)) {
      const v = m[0].trim();
      if (isLikelyPhone(v)) push(m.index! + m[0].indexOf(v), v, "PHONE");
    }
  for (const t of config.confidentialTerms ?? []) {
    const term = t.term.trim();
    if (term.length < 2) continue;
    const re = new RegExp(wordWrap(escapeRegex(term).replace(/\s+/g, "\\s+")), "giu");
    for (const m of text.matchAll(re)) push(m.index!, m[0], t.kind === "unreleased_product" ? "PRODUCT" : "CONF");
  }
  for (const p of config.patterns ?? []) {
    if (validatePattern(p)) continue;
    const re = new RegExp(p, "giu");
    for (const m of text.matchAll(re)) if (m[0]) push(m.index!, m[0], "CUSTOM");
  }
  // Resolve overlaps: earliest, then longest, then most specific kind.
  found.sort((a, b) => a.start - b.start || b.end - b.start - (a.end - a.start) || KIND_PRIORITY[a.kind] - KIND_PRIORITY[b.kind]);
  const kept: Match[] = [];
  for (const m of found) {
    const last = kept[kept.length - 1];
    if (last && m.start < last.end) continue;
    kept.push(m);
  }
  return kept;
}

function makeNonce(avoid: string[], random: () => number): string {
  const alphabet = "abcdefghijkmnpqrstuvwxyz23456789";
  for (let attempt = 0; attempt < 50; attempt++) {
    let n = "";
    for (let i = 0; i < 6; i++) n += alphabet[Math.floor(random() * alphabet.length)];
    if (!avoid.some((t) => t.toLowerCase().includes(n))) return n;
  }
  throw new Error("Could not choose a collision-free placeholder nonce");
}

export interface Masker {
  readonly nonce: string;
  /** Replace sensitive values in `text`. Texts must have been passed to createMasker (for the collision check). */
  mask(text: string): string;
  /** Put original values back, only for placeholders made by this masker. */
  restore(text: string): string;
  /** Throws if any original sensitive value is still present in `payload`. */
  assertClean(payload: string): void;
  /** Number of distinct values masked, by kind (safe to log: no values). */
  counts(): Record<MaskKind, number>;
}

export function createMasker(
  config: MaskConfig,
  texts: string[],
  random: () => number = Math.random,
): Masker {
  const nonce = makeNonce(texts, random);
  const byValue = new Map<string, string>(); // original -> placeholder
  const byToken = new Map<string, string>(); // "KIND_n" -> original
  const counters: Record<MaskKind, number> = { EMAIL: 0, PHONE: 0, CONF: 0, PRODUCT: 0, CUSTOM: 0 };

  const placeholderFor = (m: Match) => {
    const existing = byValue.get(m.value);
    if (existing) return existing;
    counters[m.kind] += 1;
    const key = `${m.kind}_${counters[m.kind]}`;
    const token = `[[${key}_${nonce}]]`;
    byValue.set(m.value, token);
    byToken.set(key, m.value);
    return token;
  };

  // Tolerant of the model dropping or doubling brackets, but only for this masker's nonce.
  const restoreRe = new RegExp(`\\[{0,2}((?:EMAIL|PHONE|CONF|PRODUCT|CUSTOM)_\\d+)_${nonce}\\]{0,2}`, "g");

  return {
    nonce,
    mask(text) {
      const matches = findSensitive(text, config);
      let out = "";
      let cursor = 0;
      for (const m of matches) {
        out += text.slice(cursor, m.start) + placeholderFor(m);
        cursor = m.end;
      }
      return out + text.slice(cursor);
    },
    restore(text) {
      return text.replace(restoreRe, (whole, key: string) => byToken.get(key) ?? whole);
    },
    assertClean(payload) {
      const lower = payload.toLowerCase();
      for (const value of byValue.keys()) {
        if (lower.includes(value.toLowerCase())) throw new Error("Masking check failed: a sensitive value would have been sent to the AI");
      }
      // Values that were never seen by mask() but are configured as confidential must not appear either.
      if (findSensitive(payload, config).length) {
        throw new Error("Masking check failed: unmasked sensitive text found in the AI request");
      }
    },
    counts() {
      return { ...counters };
    },
  };
}
