import assert from "node:assert/strict";
import { deterministicChecks } from "../src/lib/engine/deterministic";
import { validateAiFindings, mergeFindings, applyResolutions } from "../src/lib/engine/validate";
import { DEMO_RULES, DEMO_TERMS, DEMO_FACTS, DEMO_DRAFTS } from "../src/lib/demo-kit";
import type { BrandKit } from "../src/lib/types";

const kit: BrandKit = {
  rules: DEMO_RULES.map((r, i) => ({ ...r, id: `r${i}`, patterns: [...r.patterns], status: "active", source: "manual" })) as any,
  terms: DEMO_TERMS.map((t, i) => ({ ...t, id: `t${i}`, banned: [...t.banned] })),
  facts: DEMO_FACTS.map((f, i) => ({ ...f, id: `f${i}` })),
};

for (const d of DEMO_DRAFTS) {
  const found = deterministicChecks(d.content, kit);
  console.log(`\n== ${d.title}: ${found.length} rule findings`);
  for (const f of found) {
    assert.equal(d.content.slice(f.start, f.end), f.quote);
    console.log(`  [${f.source_label}] "${f.quote}" -> "${f.suggestion}"`);
  }
}

// "Lumio" itself must never be flagged by the case-only LUMIO variant.
assert.equal(deterministicChecks("Lumio is great", kit).filter(f => f.source_type === "term").length, 0);
// Sentence-initial capital kept for lowercase preferred term.
assert.equal(deterministicChecks("Users love it", kit)[0].suggestion, "Learners");

// Validator: real quote + real code kept; fake code / fake quote discarded.
const content = DEMO_DRAFTS[0].content;
const rep = validateAiFindings(content, [
  { quote: "for ₹199 a month", source_id: "FACT-1", explanation: "x", suggestion: "for ₹199 a month or ₹1,999 a year", severity: "high" },
  { quote: "Lumio is the fastest app", source_id: "CLAIM-1", explanation: "x", suggestion: "y" },
  { quote: "Board exams", source_id: "RULE-99", explanation: "x", suggestion: "y" },
  { quote: "go all  in", source_id: "tone-1", explanation: "x", suggestion: "try", severity: "low" },
], kit);
assert.equal(rep.kept.length, 2, JSON.stringify(rep, null, 1));
assert.equal(rep.discarded.length, 2);
assert.equal(rep.kept[1].quote, "go all in");

// Merge prefers AI fix when the rule match has none.
const rules = deterministicChecks(content, kit);
const claimRule = rules.find(r => r.quote === "India's top")!;
const ai = validateAiFindings(content, [{ quote: "Lumio is India's top study app", source_id: "CLAIM-1", explanation: "No ranking supports this.", suggestion: "Lumio is a study app built for Indian students", severity: "high" }], kit).kept;
const merged = mergeFindings(rules, ai);
assert.ok(!merged.includes(claimRule) && merged.some(m => m.engine === "ai"));

// Apply resolutions with an overlap.
const r = applyResolutions("Hello big world", [
  { id: "a", start: 6, end: 9, text: "small" },
  { id: "b", start: 7, end: 15, text: "X" },
  { id: "c", start: 0, end: 5, text: "Hi" },
]);
assert.equal(r.text, "Hi small world");
assert.deepEqual(r.skipped, ["b"]);
console.log("\nAll engine tests passed");
