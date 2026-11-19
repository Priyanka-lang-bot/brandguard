// Accuracy evaluation on eval/dataset.json.
//   npm run eval              -> rule checks only, plus the full pipeline (rules + Gemini + grounding gate) if GEMINI_API_KEY is set
//   npm run eval -- --rules   -> rule checks only
// Writes eval/results/<mode>.json and eval/results/summary.md. Never invents numbers: a mode that cannot run is
// reported as "not executed" with the reason.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { runCheck } from "../src/lib/engine";
import { DEMO_FACTS, DEMO_RULES, DEMO_TERMS } from "../src/lib/demo-kit";
import type { BrandKit, Candidate } from "../src/lib/types";

interface Expected { codes: string[]; quote: string; category: string }
interface Post { id: string; channel: string; content: string; expected: Expected[] }
const dataset = JSON.parse(readFileSync("eval/dataset.json", "utf8")) as { posts: Post[]; today_for_facts: string };

const kit: BrandKit = {
  rules: DEMO_RULES.map((r) => ({ ...r, id: `rule:${r.code}`, patterns: [...r.patterns], status: "active" as const, source: "manual" })) as unknown as BrandKit["rules"],
  terms: DEMO_TERMS.map((t, i) => ({ ...t, id: `term:${i + 1}`, banned: [...t.banned] })),
  facts: DEMO_FACTS.map((f) => ({ ...f, id: `fact:${f.code}` })),
  confidential: [],
};

const codeOf = (c: Candidate) => c.source_label.split(" · ")[0].trim();
const CATEGORY_BY_CODE = (code: string) =>
  /^TERM-[12]$/.test(code) ? "product_name" : code.startsWith("TERM") ? "terminology" : code === "MSG-2" || code === "FACT-4" ? "unreleased" : code === "FACT-6" ? "outdated_fact" : code.startsWith("FACT") || code === "MSG-1" ? "facts_prices" : code.startsWith("CLAIM") ? "claims" : code.startsWith("TONE") ? "tone" : code.startsWith("ACC") ? "accessibility" : "other";

interface PostResult { id: string; tp: number; fp: { code: string; quote: string }[]; fn: { codes: string[]; quote: string }[]; aiRaw: number; aiDiscarded: number; aiError: string | null }

function score(post: Post, found: Candidate[]): Pick<PostResult, "tp" | "fp" | "fn"> & { tpCats: string[]; fpCats: string[]; fnCats: string[] } {
  const spans = post.expected.map((e) => {
    const i = post.content.indexOf(e.quote);
    if (i < 0) throw new Error(`${post.id}: expected quote "${e.quote}" is not in the content`);
    return { ...e, start: i, end: i + e.quote.length, matched: false };
  });
  const fp: PostResult["fp"] = [];
  const tpCats: string[] = [];
  const fpCats: string[] = [];
  for (const f of found) {
    const code = codeOf(f);
    const hit = spans.find((s) => !s.matched && s.codes.includes(code) && f.start < s.end && s.start < f.end);
    if (hit) {
      hit.matched = true;
      tpCats.push(hit.category);
    } else {
      // A second finding on an already-matched span for the same issue counts as a duplicate (false positive).
      fp.push({ code, quote: f.quote });
      fpCats.push(CATEGORY_BY_CODE(code));
    }
  }
  const fn = spans.filter((s) => !s.matched).map((s) => ({ codes: s.codes, quote: s.quote, category: s.category }));
  return { tp: tpCats.length, fp, fn, tpCats, fpCats, fnCats: fn.map((x) => x.category) };
}

async function pool<T, R>(items: T[], n: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k]); } }));
  return out;
}

async function evaluate(mode: "rules" | "full") {
  const started = Date.now();
  const cats: Record<string, { tp: number; fp: number; fn: number }> = {};
  const bump = (c: string, k: "tp" | "fp" | "fn") => ((cats[c] ??= { tp: 0, fp: 0, fn: 0 })[k] += 1);
  const results = await pool(dataset.posts, mode === "full" ? 3 : 8, async (post) => {
    let res = await runCheck(post.content, { title: post.id, channel: post.channel, purpose: "" }, kit, { ai: mode === "full", today: dataset.today_for_facts });
    if (mode === "full" && !res.aiChecked) {
      await new Promise((r) => setTimeout(r, 3000)); // one retry for transient errors / rate limits
      res = await runCheck(post.content, { title: post.id, channel: post.channel, purpose: "" }, kit, { ai: true, today: dataset.today_for_facts });
    }
    const s = score(post, res.findings);
    s.tpCats.forEach((c) => bump(c, "tp"));
    s.fpCats.forEach((c) => bump(c, "fp"));
    s.fnCats.forEach((c) => bump(c, "fn"));
    return { id: post.id, tp: s.tp, fp: s.fp, fn: s.fn, aiRaw: res.aiRawCount, aiDiscarded: res.discarded.length, aiError: res.aiChecked ? null : res.aiError } satisfies PostResult;
  });
  const tp = results.reduce((n, r) => n + r.tp, 0);
  const fp = results.reduce((n, r) => n + r.fp.length, 0);
  const fn = results.reduce((n, r) => n + r.fn.length, 0);
  const aiRaw = results.reduce((n, r) => n + r.aiRaw, 0);
  const aiDiscarded = results.reduce((n, r) => n + r.aiDiscarded, 0);
  const aiFailures = results.filter((r) => r.aiError).length;
  const summary = {
    mode,
    executed_at: new Date().toISOString(),
    model: mode === "full" ? process.env.GEMINI_MODEL || "gemini-3.5-flash" : null,
    posts: dataset.posts.length,
    expected: tp + fn,
    actual: tp + fp,
    tp,
    fp,
    fn,
    precision: tp + fp ? tp / (tp + fp) : null,
    recall: tp + fn ? tp / (tp + fn) : null,
    grounding: mode === "full" ? { ai_findings_returned: aiRaw, discarded_by_grounding_gate: aiDiscarded, rejection_rate: aiRaw ? aiDiscarded / aiRaw : null, posts_where_ai_failed: aiFailures } : null,
    by_category: Object.fromEntries(Object.entries(cats).sort().map(([c, v]) => [c, { ...v, precision: v.tp + v.fp ? v.tp / (v.tp + v.fp) : null, recall: v.tp + v.fn ? v.tp / (v.tp + v.fn) : null }])),
    seconds: (Date.now() - started) / 1000,
    details: results.filter((r) => r.fp.length || r.fn.length || r.aiError),
  };
  return summary;
}

const pct = (v: number | null | undefined) => (v === null || v === undefined ? "—" : `${(v * 100).toFixed(1)}%`);

(async () => {
  mkdirSync("eval/results", { recursive: true });
  const rulesOnly = process.argv.includes("--rules");
  const aiKey = process.env.GEMINI_API_KEY;
  const stub = Boolean(process.env.GEMINI_API_BASE);
  const runs: Awaited<ReturnType<typeof evaluate>>[] = [];
  runs.push(await evaluate("rules"));
  let fullNote = "";
  if (rulesOnly) fullNote = "not executed (--rules)";
  else if (!aiKey) fullNote = "not executed: GEMINI_API_KEY is not set in this environment";
  else if (stub) fullNote = "not executed: GEMINI_API_BASE points at a stub, so results would not measure the real model";
  else runs.push(await evaluate("full"));

  let md = `# Accuracy evaluation\n\nDataset: \`eval/dataset.json\`: ${dataset.posts.length} posts, ${runs[0].expected} planted errors, ${dataset.posts.filter((p) => !p.expected.length).length} clean posts. Fact dates evaluated as of ${dataset.today_for_facts}.\n\n`;
  md += "| Mode | Posts | Expected | Actual | TP | FP | FN | Precision | Recall | Grounding-filter rejection |\n|---|---|---|---|---|---|---|---|---|---|\n";
  for (const r of runs) {
    md += `| ${r.mode === "rules" ? "Rule checks only" : `Rules + AI (${r.model})`} | ${r.posts} | ${r.expected} | ${r.actual} | ${r.tp} | ${r.fp} | ${r.fn} | ${pct(r.precision)} | ${pct(r.recall)} | ${r.grounding ? `${pct(r.grounding.rejection_rate)} (${r.grounding.discarded_by_grounding_gate}/${r.grounding.ai_findings_returned})` : "n/a"} |\n`;
    writeFileSync(`eval/results/${r.mode}.json`, JSON.stringify(r, null, 1));
  }
  if (fullNote) md += `| Rules + AI | ${fullNote} | | | | | | | | |\n`;
  for (const r of runs) {
    md += `\n## ${r.mode === "rules" ? "Rule checks only" : "Rules + AI"}: by category\n\n| Category | TP | FP | FN | Precision | Recall |\n|---|---|---|---|---|---|\n`;
    for (const [c, v] of Object.entries(r.by_category)) md += `| ${c} | ${v.tp} | ${v.fp} | ${v.fn} | ${pct(v.precision)} | ${pct(v.recall)} |\n`;
  }
  md += `\nGenerated ${new Date().toISOString()} by \`npm run eval\`.\n`;
  writeFileSync("eval/results/summary.md", md);
  console.log(md);
})();
