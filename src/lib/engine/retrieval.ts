import type { BrandKit } from "../types";

/**
 * Brand Kit retrieval for large kits. When the kit has more entries than `limit`, only the most relevant rules,
 * terms and facts are put in the AI prompt (lexical overlap with the draft; any banned term variant that
 * appears in the draft is always included). Small kits are sent whole. Original TERM-n numbering is kept by
 * the caller, so citations stay valid. This is the interim for the pgvector retrieval in the roadmap.
 */
export interface KitSelection {
  rules: Set<string>;
  terms: Set<string>;
  facts: Set<string>;
}

const STOP = new Set("a an and are as at be but by for from has have in is it its of on or our so that the this to was we with you your not no do does use any must".split(" "));
const tokens = (s: string) => new Set(s.toLowerCase().normalize("NFKD").split(/[^\p{L}\p{N}₹%]+/u).filter((t) => t.length > 2 && !STOP.has(t)));

export function selectKit(kit: BrandKit, content: string, limit = 60): KitSelection | null {
  const active = kit.rules.filter((r) => r.status === "active");
  if (active.length + kit.terms.length + kit.facts.length <= limit) return null;
  const doc = tokens(content);
  const lower = content.toLowerCase();
  const score = (text: string) => {
    let n = 0;
    for (const t of tokens(text)) if (doc.has(t)) n++;
    return n;
  };
  const terms = new Set(kit.terms.filter((t) => [t.preferred, ...t.banned].some((v) => v && lower.includes(v.toLowerCase()))).map((t) => t.id));
  const rankedRules = active
    .map((r) => ({ id: r.id, s: score(`${r.title} ${r.description}`) + (r.category === "claims" || r.category === "tone" ? 0.5 : 0) }))
    .sort((a, b) => b.s - a.s);
  const rankedFacts = kit.facts.map((f) => ({ id: f.id, s: score(`${f.topic} ${f.statement}`) })).sort((a, b) => b.s - a.s);
  const budget = Math.max(10, limit - terms.size);
  const rules = new Set(rankedRules.slice(0, Math.ceil(budget * 0.6)).map((r) => r.id));
  const facts = new Set(rankedFacts.filter((f) => f.s > 0).slice(0, Math.floor(budget * 0.4)).map((f) => f.id));
  return { rules, terms, facts };
}
