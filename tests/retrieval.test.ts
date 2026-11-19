import assert from "node:assert/strict";
import { test } from "node:test";
import { selectKit } from "../src/lib/engine/retrieval";
import { kitAsPrompt } from "../src/lib/engine/gemini";
import { testKit } from "./helpers";
import type { BrandKit } from "../src/lib/types";

test("small kits are sent whole", () => {
  assert.equal(selectKit(testKit(), "anything"), null);
});

test("large kits: relevant entries selected, TERM numbering preserved", () => {
  const k: BrandKit = testKit();
  for (let i = 0; i < 80; i++) {
    k.rules.push({ id: `filler${i}`, code: `MISC-${i}`, category: "messaging", title: `Filler rule ${i}`, description: `About gardening topic ${i}`, severity: "low", patterns: [], status: "active", source: "manual" });
  }
  const draft = "Upgrade with Lumio Premium for exam guarantees and offline mode.";
  const sel = selectKit(k, draft, 40)!;
  assert.ok(sel);
  const lumioPlus = k.terms.find((t) => t.preferred === "Lumio Plus")!;
  assert.ok(sel.terms.has(lumioPlus.id), "a banned variant present in the draft is always included");
  assert.ok(sel.rules.has("rule:CLAIM-2"), "the guarantee rule is relevant");
  assert.ok(sel.facts.has("fact:FACT-5"), "the offline-mode fact is relevant");
  assert.ok(sel.rules.size < 40);
  const prompt = kitAsPrompt(k, "2026-11-19", sel);
  assert.match(prompt, /\[TERM-2\] Use "Lumio Plus"/, "original TERM-2 code kept");
  assert.ok(!prompt.includes("[TERM-3]") || sel.terms.has(k.terms[2].id));
});
