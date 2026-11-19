import assert from "node:assert/strict";
import { deterministicChecks } from "../src/lib/engine/deterministic";
import { validateAiFindings, mergeFindings, applyResolutions } from "../src/lib/engine/validate";
import { DEMO_RULES, DEMO_TERMS, DEMO_FACTS, DEMO_DRAFTS } from "../src/lib/demo-kit";
import type { BrandKit } from "../src/lib/types";

const kit: BrandKit = {
  rules: DEMO_RULES.map((r, i) => ({ ...r, id: `r${i}`, patterns: [...r.patterns], status: "active" as const, source: "manual" })) as unknown as BrandKit["rules"],
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

// Nested fixes compose: a term fix inside an accepted sentence rewrite is applied to the rewrite.
{
  const text = "We are the best app, trusted by users.";
  const r = applyResolutions(text, [
    { id: "outer", start: 7, end: 37, text: "a popular app, trusted by users" },
    { id: "inner", start: 32, end: 37, text: "learners" },
  ]);
  assert.equal(r.text, "We are a popular app, trusted by learners.");
  assert.deepEqual(r.merged, ["inner"]);
  assert.deepEqual(r.skipped, []);
  // Outer rewrite that already dropped the words: inner is satisfied, nothing skipped.
  const r2 = applyResolutions(text, [
    { id: "outer", start: 7, end: 37, text: "a study app" },
    { id: "inner", start: 32, end: 37, text: "learners" },
  ]);
  assert.equal(r2.text, "We are a study app.");
  assert.deepEqual(r2.skipped, []);
  console.log("Nested resolution tests passed");
}

// One finding per span for a term: overlapping or case-duplicate variants must not double-report.
{
  const a = deterministicChecks("Your Lumio Premium plan renews.", kit).filter((f) => f.source_type === "term");
  assert.equal(a.length, 1, JSON.stringify(a));
  assert.equal(a[0].quote, "Lumio Premium");
  const b = deterministicChecks("Send it by e-mail.", kit).filter((f) => f.source_type === "term");
  assert.equal(b.length, 1, JSON.stringify(b));
  console.log("Term de-duplication tests passed");
}
