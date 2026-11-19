import { DEMO_FACTS, DEMO_RULES, DEMO_TERMS } from "../src/lib/demo-kit";
import type { BrandKit } from "../src/lib/types";

/** The demo Brand Kit with stable fake ids, as the checker sees it. */
export function testKit(): BrandKit {
  return {
    rules: DEMO_RULES.map((r) => ({ ...r, id: `rule:${r.code}`, patterns: [...r.patterns], status: "active" as const, source: "manual" })) as unknown as BrandKit["rules"],
    terms: DEMO_TERMS.map((t, i) => ({ ...t, id: `term:${i + 1}`, banned: [...t.banned] })),
    facts: DEMO_FACTS.map((f) => ({ ...f, id: `fact:${f.code}` })),
    confidential: [],
  };
}
