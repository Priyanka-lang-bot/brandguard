import "server-only";
import type { createClient } from "./supabase/server";
import type { DraftRow, IssueRow } from "./insights";

type Client = Awaited<ReturnType<typeof createClient>>;

/** Page through a view so results are never silently cut at the API row limit. */
async function fetchAll<T>(build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = [];
  const page = 1000;
  for (let from = 0; from < 50_000; from += page) {
    const { data, error } = await build(from, from + page - 1);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < page) break;
  }
  return out;
}

export interface ViewStat {
  source_type: string;
  source_id: string;
  source_label: string;
  findings: number;
  disputed: number;
  drafts: number;
  dispute_rate: number | null;
  threshold: number;
  min_findings: number;
  possibly_unclear: boolean;
}

export async function loadInsights(supabase: Client) {
  const [issues, drafts, stats, settings, people] = await Promise.all([
    fetchAll<IssueRow>((a, b) => supabase.from("insight_findings").select("*").order("id").range(a, b)),
    fetchAll<DraftRow>((a, b) => supabase.from("insight_drafts").select("*").order("id").range(a, b)),
    fetchAll<ViewStat>((a, b) => supabase.from("insight_source_stats").select("*").order("source_id").range(a, b)),
    supabase.from("workspace_settings").select("dispute_threshold, dispute_min_findings").maybeSingle(),
    supabase.from("profiles").select("id, full_name, role"),
  ]);
  return {
    issues: issues.map((r) => ({ ...r, week: String(r.week).slice(0, 10) })),
    drafts: drafts.map((d) => ({ ...d, hours_to_approval: d.hours_to_approval === null ? null : Number(d.hours_to_approval) })),
    stats: stats.map((s) => ({ ...s, dispute_rate: s.dispute_rate === null ? null : Number(s.dispute_rate), threshold: Number(s.threshold) })),
    threshold: Number(settings.data?.dispute_threshold ?? 0.3),
    minFindings: Number(settings.data?.dispute_min_findings ?? 3),
    names: Object.fromEntries((people.data ?? []).map((p) => [p.id, p.full_name])) as Record<string, string>,
    creators: (people.data ?? []).filter((p) => p.role !== "reviewer").map((p) => ({ id: p.id, name: p.full_name })),
  };
}
