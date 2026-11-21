import { test } from "node:test";
import assert from "node:assert/strict";
import { demoUuid } from "../src/lib/seed";
import { SHOWCASE, SHOWCASE_FACTS } from "../src/lib/demo/showcase";
import { DEMO_FACTS } from "../src/lib/demo-kit";

test("seeded ids are deterministic, valid UUIDs and unique per workspace and key", () => {
  const a = demoUuid("ws-1", "showcase:welcome-email");
  assert.equal(a, demoUuid("ws-1", "showcase:welcome-email"));
  assert.match(a, /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.notEqual(a, demoUuid("ws-2", "showcase:welcome-email"));
  assert.notEqual(a, demoUuid("ws-1", "showcase:exam-poster"));
});

test("sample catalogue is internally consistent", () => {
  const keys = new Set(SHOWCASE.map((d) => d.key));
  assert.equal(keys.size, SHOWCASE.length, "keys are unique");
  const facts = new Set([...DEMO_FACTS, ...SHOWCASE_FACTS].map((f) => f.code));
  for (const d of SHOWCASE) {
    for (const f of d.factFindings ?? []) {
      assert.ok(facts.has(f.factCode), `${d.key}: ${f.factCode} exists in the Fact Vault`);
      assert.ok(d.content.includes(f.quote), `${d.key}: fact quote "${f.quote}" is in the content`);
    }
    for (const q of Object.keys(d.decisions ?? {})) assert.ok(d.content.toLowerCase().includes(q), `${d.key}: decision "${q}" matches the content`);
    if (d.outcome === "approved" || d.outcome === "changes_requested") assert.ok(d.decisionNote, `${d.key}: reviewer decision has a note`);
  }
  for (const o of ["unchecked", "analysed", "in_review", "changes_requested", "approved"])
    assert.ok(SHOWCASE.some((d) => d.outcome === o && d.author === "creator"), `creator has a ${o} sample`);
});
