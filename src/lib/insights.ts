/**
 * Insights computed from the security_invoker views insight_findings and insight_drafts
 * (one row per distinct issue: same source + same words + same draft, latest status).
 * Pure functions so the numbers can be unit-tested and traced back to rows.
 */

export interface IssueRow {
  id: string;
  draft_id: string;
  author_id: string;
  channel: string;
  draft_title: string;
  draft_status: string;
  demo_seed: boolean;
  week: string; // ISO date of the week start
  checked_at: string;
  category: string;
  severity: string;
  source_type: string;
  rule_id: string | null;
  term_id: string | null;
  fact_id: string | null;
  image_id: string | null;
  source_label: string;
  quote: string;
  status: "open" | "accepted" | "edited" | "disputed";
  dispute_reason: string | null;
}

export interface DraftRow {
  id: string;
  author_id: string;
  channel: string;
  title: string;
  status: string;
  demo_seed: boolean;
  created_at: string;
  first_submitted_at: string | null;
  approved_at: string | null;
  hours_to_approval: number | null;
}

export interface Filters {
  channel?: string;
  creator?: string;
  demo?: "include" | "exclude";
}

/** Stable key for a Brand Kit source (image checks without a rule use their label). */
export const sourceKey = (r: Pick<IssueRow, "rule_id" | "term_id" | "fact_id" | "source_label">) =>
  r.rule_id ?? r.term_id ?? r.fact_id ?? `label:${r.source_label}`;

export function applyFilters<T extends { channel: string; author_id: string; demo_seed: boolean }>(rows: T[], f: Filters): T[] {
  return rows.filter(
    (r) => (!f.channel || r.channel === f.channel) && (!f.creator || r.author_id === f.creator) && (f.demo !== "exclude" || !r.demo_seed),
  );
}

export interface SourceStat {
  key: string;
  label: string;
  source_type: string;
  rule_id: string | null;
  term_id: string | null;
  fact_id: string | null;
  issues: number;
  drafts: number;
  disputed: number;
  fixed: number;
  disputeRate: number;
  possiblyUnclear: boolean;
}

export function sourceStats(rows: IssueRow[], threshold: number, minFindings: number): SourceStat[] {
  const map = new Map<string, SourceStat & { draftSet: Set<string> }>();
  for (const r of rows) {
    const key = sourceKey(r);
    let s = map.get(key);
    if (!s) {
      s = { key, label: r.source_label, source_type: r.source_type, rule_id: r.rule_id, term_id: r.term_id, fact_id: r.fact_id, issues: 0, drafts: 0, disputed: 0, fixed: 0, disputeRate: 0, possiblyUnclear: false, draftSet: new Set() };
      map.set(key, s);
    }
    s.issues++;
    s.draftSet.add(r.draft_id);
    if (r.status === "disputed") s.disputed++;
    if (r.status === "accepted" || r.status === "edited") s.fixed++;
  }
  return [...map.values()]
    .map(({ draftSet, ...s }) => {
      const disputeRate = s.issues ? s.disputed / s.issues : 0;
      return { ...s, drafts: draftSet.size, disputeRate, possiblyUnclear: s.issues >= minFindings && disputeRate >= threshold };
    })
    .sort((a, b) => b.issues - a.issues || b.drafts - a.drafts || a.label.localeCompare(b.label));
}

export function termMistakes(rows: IssueRow[]) {
  const map = new Map<string, { variant: string; label: string; term_id: string | null; count: number; drafts: Set<string> }>();
  for (const r of rows) {
    if (r.source_type !== "term") continue;
    const k = `${r.term_id}|${r.quote.toLowerCase()}`;
    const e = map.get(k) ?? { variant: r.quote, label: r.source_label, term_id: r.term_id, count: 0, drafts: new Set<string>() };
    e.count++;
    e.drafts.add(r.draft_id);
    map.set(k, e);
  }
  return [...map.values()].map((e) => ({ ...e, drafts: e.drafts.size })).sort((a, b) => b.count - a.count || a.variant.localeCompare(b.variant));
}

export function creatorStats(rows: IssueRow[], drafts: DraftRow[], names: Record<string, string>) {
  const byAuthor = new Map<string, { issues: number; disputed: number; sources: Map<string, Set<string>> }>();
  for (const r of rows) {
    const e = byAuthor.get(r.author_id) ?? { issues: 0, disputed: 0, sources: new Map<string, Set<string>>() };
    e.issues++;
    if (r.status === "disputed") e.disputed++;
    const set = e.sources.get(sourceKey(r)) ?? new Set<string>();
    set.add(r.draft_id);
    e.sources.set(sourceKey(r), set);
    byAuthor.set(r.author_id, e);
  }
  return [...byAuthor.entries()]
    .map(([author_id, e]) => {
      const draftCount = drafts.filter((d) => d.author_id === author_id).length;
      // A repeated mistake: the same Brand Kit source broken in more than one of this creator's drafts.
      const repeated = [...e.sources.values()].filter((s) => s.size > 1).length;
      return { author_id, name: names[author_id] ?? "Unknown", issues: e.issues, drafts: draftCount, perDraft: draftCount ? e.issues / draftCount : 0, repeatedRules: repeated, disputed: e.disputed };
    })
    .sort((a, b) => b.issues - a.issues);
}

export function weeklyTrend(rows: IssueRow[], drafts: DraftRow[], weeks: string[]) {
  return weeks.map((w) => {
    const issues = rows.filter((r) => r.week === w).length;
    const draftIds = new Set(rows.filter((r) => r.week === w).map((r) => r.draft_id));
    const created = drafts.filter((d) => weekStart(d.created_at) === w).length;
    return { week: w, issues, draftsWithIssues: draftIds.size, draftsCreated: created };
  });
}

export function channelTrend(rows: IssueRow[], drafts: DraftRow[]) {
  const channels = [...new Set(drafts.map((d) => d.channel))].sort();
  return channels
    .map((c) => {
      const ds = drafts.filter((d) => d.channel === c);
      const issues = rows.filter((r) => r.channel === c).length;
      return { channel: c, drafts: ds.length, issues, perDraft: ds.length ? issues / ds.length : 0 };
    })
    .sort((a, b) => b.perDraft - a.perDraft);
}

export function approvalTimes(drafts: DraftRow[]) {
  const hrs = drafts.map((d) => d.hours_to_approval).filter((h): h is number => typeof h === "number" && h >= 0).sort((a, b) => a - b);
  if (!hrs.length) return { count: 0, median: null as number | null, average: null as number | null, p90: null as number | null };
  const q = (p: number) => {
    const idx = (hrs.length - 1) * p;
    const lo = Math.floor(idx), hi = Math.ceil(idx);
    return hrs[lo] + (hrs[hi] - hrs[lo]) * (idx - lo);
  };
  return { count: hrs.length, median: q(0.5), average: hrs.reduce((a, b) => a + b, 0) / hrs.length, p90: q(0.9) };
}

/** Share of issues on submitted drafts that the creator fixed (accepted or edited) before the reviewer saw them. */
export function resolvedBeforeReview(rows: IssueRow[], drafts: DraftRow[]) {
  const submitted = new Set(drafts.filter((d) => d.first_submitted_at).map((d) => d.id));
  const relevant = rows.filter((r) => submitted.has(r.draft_id));
  const fixed = relevant.filter((r) => r.status === "accepted" || r.status === "edited").length;
  return { fixed, total: relevant.length, share: relevant.length ? fixed / relevant.length : null };
}

/** Monday-start week in UTC, matching Postgres date_trunc('week', …). */
export function weekStart(iso: string): string {
  const d = new Date(iso);
  const day = (d.getUTCDay() + 6) % 7;
  const m = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day));
  return m.toISOString().slice(0, 10);
}

export function lastWeeks(n: number, now = new Date()): string[] {
  const cur = weekStart(now.toISOString());
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(cur + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() - 7 * i);
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}
