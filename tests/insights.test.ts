import assert from "node:assert/strict";
import { test } from "node:test";
import {
  applyFilters,
  approvalTimes,
  channelTrend,
  creatorStats,
  lastWeeks,
  resolvedBeforeReview,
  sourceStats,
  termMistakes,
  weekStart,
  weeklyTrend,
  type DraftRow,
  type IssueRow,
} from "../src/lib/insights";

let n = 0;
const issue = (p: Partial<IssueRow>): IssueRow => ({
  id: `f${++n}`,
  draft_id: "d1",
  author_id: "kabir",
  channel: "Instagram",
  draft_title: "t",
  draft_status: "approved",
  demo_seed: false,
  week: "2026-11-09",
  checked_at: "2026-11-10T10:00:00Z",
  category: "tone",
  severity: "low",
  source_type: "rule",
  rule_id: "TONE-2",
  term_id: null,
  fact_id: null,
  image_id: null,
  source_label: "TONE-2 · Calm",
  quote: "!!",
  status: "open",
  dispute_reason: null,
  ...p,
});
const draft = (p: Partial<DraftRow>): DraftRow => ({
  id: "d1",
  author_id: "kabir",
  channel: "Instagram",
  title: "t",
  status: "approved",
  demo_seed: false,
  created_at: "2026-11-10T09:00:00Z",
  first_submitted_at: null,
  approved_at: null,
  hours_to_approval: null,
  ...p,
});

const ROWS: IssueRow[] = [
  issue({ draft_id: "d1", status: "disputed" }),
  issue({ draft_id: "d2", status: "disputed", author_id: "meera", channel: "Email" }),
  issue({ draft_id: "d3", status: "accepted" }),
  issue({ draft_id: "d1", rule_id: "CLAIM-1", source_label: "CLAIM-1 · Superlatives", quote: "the best", status: "accepted" }),
  issue({ draft_id: "d2", rule_id: "CLAIM-1", source_label: "CLAIM-1 · Superlatives", quote: "the best", status: "accepted", author_id: "meera", channel: "Email" }),
  issue({ draft_id: "d3", rule_id: "CLAIM-1", source_label: "CLAIM-1 · Superlatives", quote: "number one", status: "edited" }),
  issue({ draft_id: "d3", rule_id: "CLAIM-1", source_label: "CLAIM-1 · Superlatives", quote: "#1", status: "open" }),
  issue({ draft_id: "d1", source_type: "term", rule_id: null, term_id: "T2", source_label: 'TERM-2 · Use "Lumio Plus"', quote: "Lumio Premium", status: "accepted" }),
  issue({ draft_id: "d3", source_type: "term", rule_id: null, term_id: "T2", source_label: 'TERM-2 · Use "Lumio Plus"', quote: "lumio premium", status: "accepted", demo_seed: true }),
  issue({ draft_id: "d3", source_type: "image", rule_id: null, source_label: "Brand Kit palette", quote: "#FF2E93 · 27%", status: "open" }),
];
const DRAFTS: DraftRow[] = [
  draft({ id: "d1", first_submitted_at: "2026-11-10T10:00:00Z", approved_at: "2026-11-10T16:00:00Z", hours_to_approval: 6 }),
  draft({ id: "d2", author_id: "meera", channel: "Email", first_submitted_at: "2026-11-11T10:00:00Z", approved_at: "2026-11-12T10:00:00Z", hours_to_approval: 24 }),
  draft({ id: "d3", status: "draft", demo_seed: true, created_at: "2026-11-03T09:00:00Z" }),
];

test("most-broken rules and dispute rates, with the possibly-unclear flag", () => {
  const s = sourceStats(ROWS, 0.3, 3);
  assert.equal(s[0].label, "CLAIM-1 · Superlatives");
  assert.equal(s[0].issues, 4);
  assert.equal(s[0].drafts, 3);
  const tone = s.find((x) => x.rule_id === "TONE-2")!;
  assert.equal(tone.issues, 3);
  assert.equal(tone.disputed, 2);
  assert.ok(Math.abs(tone.disputeRate - 2 / 3) < 1e-9);
  assert.equal(tone.possiblyUnclear, true);
  assert.equal(s[0].possiblyUnclear, false);
  // Below the minimum number of findings, a high rate does not raise the flag.
  assert.equal(sourceStats(ROWS, 0.3, 4).find((x) => x.rule_id === "TONE-2")!.possiblyUnclear, false);
  // Image checks without a rule are keyed by label.
  assert.ok(s.some((x) => x.key === "label:Brand Kit palette"));
});

test("terminology mistakes group the wrong variant case-insensitively", () => {
  const t = termMistakes(ROWS);
  assert.equal(t.length, 1);
  assert.equal(t[0].count, 2);
  assert.equal(t[0].drafts, 2);
});

test("filters by channel, creator and demo data", () => {
  assert.equal(applyFilters(ROWS, { channel: "Email" }).length, 2);
  assert.equal(applyFilters(ROWS, { creator: "meera" }).length, 2);
  assert.equal(applyFilters(ROWS, { demo: "exclude" }).length, ROWS.length - 1);
  assert.equal(applyFilters(DRAFTS, { demo: "exclude" }).length, 2);
});

test("creator stats count repeated mistakes across drafts", () => {
  const c = creatorStats(ROWS, DRAFTS, { kabir: "Kabir", meera: "Meera" });
  const kabir = c.find((x) => x.author_id === "kabir")!;
  assert.equal(kabir.issues, 8);
  assert.equal(kabir.drafts, 2);
  assert.equal(kabir.repeatedRules, 3, "TONE-2, CLAIM-1 and TERM-2 each appear in two of Kabir's drafts");
});

test("approval times, resolved-before-review, weekly and channel trends", () => {
  const a = approvalTimes(DRAFTS);
  assert.equal(a.count, 2);
  assert.equal(a.median, 15);
  assert.equal(a.average, 15);
  const r = resolvedBeforeReview(ROWS, DRAFTS);
  assert.equal(r.total, 5); // issues on d1 and d2
  assert.equal(r.fixed, 3);
  const w = weeklyTrend(ROWS, DRAFTS, ["2026-11-02", "2026-11-09"]);
  assert.equal(w[1].issues, ROWS.length);
  assert.equal(w[0].draftsCreated, 1);
  const ch = channelTrend(ROWS, DRAFTS);
  assert.equal(ch.find((x) => x.channel === "Instagram")!.issues, 8);
  assert.equal(ch.find((x) => x.channel === "Email")!.perDraft, 2);
});

test("weeks start on Monday (UTC), like Postgres date_trunc('week')", () => {
  assert.equal(weekStart("2026-11-19T08:00:00Z"), "2026-11-16");
  assert.equal(weekStart("2026-11-16T00:00:00Z"), "2026-11-16");
  assert.equal(weekStart("2026-11-15T23:59:59Z"), "2026-11-09");
  assert.deepEqual(lastWeeks(3, new Date("2026-11-19T00:00:00Z")), ["2026-11-02", "2026-11-09", "2026-11-16"]);
});
