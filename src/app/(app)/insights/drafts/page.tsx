import Link from "next/link";
import { redirect } from "next/navigation";
import { StatusPill, FindingStatusTag } from "@/components/ui";
import { hasFinalRoundSchema, requireProfile } from "@/lib/data";
import { applyFilters, sourceKey } from "@/lib/insights";
import { loadInsights } from "@/lib/insights-data";
import type { DraftStatus, FindingStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

type SP = Record<string, string | undefined>;

/** Drill-down: the drafts and findings behind any number on the insights dashboard. */
export default async function InsightDrafts({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const { supabase, profile } = await requireProfile();
  if (profile.role !== "admin") redirect("/dashboard");
  if (!(await hasFinalRoundSchema(supabase))) redirect("/insights");
  const data = await loadInsights(supabase);
  const filters = { channel: sp.channel, creator: sp.creator, demo: sp.demo === "exclude" ? ("exclude" as const) : ("include" as const) };
  let drafts = applyFilters(data.drafts, filters);
  let issues = applyFilters(data.issues, filters);
  if (sp.source) issues = issues.filter((r) => sourceKey(r) === sp.source);
  if (sp.quote) issues = issues.filter((r) => r.quote.toLowerCase() === sp.quote);
  if (sp.status) issues = issues.filter((r) => r.status === sp.status);
  if (sp.week) issues = issues.filter((r) => r.week === sp.week);
  if (sp.approved) drafts = drafts.filter((d) => d.hours_to_approval !== null);
  if (sp.submitted) drafts = drafts.filter((d) => d.first_submitted_at);
  const issueFilter = Boolean(sp.source || sp.quote || sp.status || sp.week);
  const draftIds = new Set(drafts.map((d) => d.id));
  issues = issues.filter((r) => draftIds.has(r.draft_id));
  const shown = issueFilter ? drafts.filter((d) => issues.some((r) => r.draft_id === d.id)) : drafts;
  shown.sort((a, b) => b.created_at.localeCompare(a.created_at));

  const label = issues[0]?.source_label;
  const parts = [
    sp.source && label ? `Source: ${label}` : null,
    sp.quote ? `Wording: “${sp.quote}”` : null,
    sp.status ? `Status: ${sp.status}` : null,
    sp.week ? `Week of ${sp.week}` : null,
    sp.channel ? `Channel: ${sp.channel}` : null,
    sp.creator ? `Creator: ${data.names[sp.creator] ?? "?"}` : null,
    sp.approved ? "Approved drafts" : null,
    sp.submitted ? "Submitted drafts" : null,
    sp.demo === "exclude" ? "Live data only" : null,
  ].filter(Boolean);
  const ruleId = issues[0]?.rule_id;

  return (
    <div className="grid gap-6">
      <div>
        <Link href="/insights" className="text-sm text-mute hover:text-fg">← Insights</Link>
        <h1 className="mt-2 page-title">Underlying drafts</h1>
        <p className="mt-1 text-sm text-mute">{parts.length ? parts.join(" · ") : "All drafts"}</p>
        <p className="mt-1 text-sm">
          <strong className="tabular-nums">{shown.length}</strong> draft{shown.length === 1 ? "" : "s"}
          {issueFilter && <> · <strong className="tabular-nums">{issues.length}</strong> matching issue{issues.length === 1 ? "" : "s"}</>}
          {ruleId && (
            <Link href={`/brand-kit?tab=rules&edit=${ruleId}`} className="btn-secondary btn-sm ml-3">Edit this rule</Link>
          )}
        </p>
      </div>
      {shown.length === 0 ? (
        <p className="card px-4 py-6 text-center text-sm text-mute">Nothing matches these filters.</p>
      ) : (
        <div className="grid gap-3">
          {shown.map((d) => {
            const its = (issueFilter ? issues : data.issues).filter((r) => r.draft_id === d.id);
            return (
              <article key={d.id} className="card p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Link href={`/drafts/${d.id}`} className="font-medium hover:text-brand-300 hover:underline">{d.title}</Link>
                  <StatusPill status={d.status as DraftStatus} />
                  {d.demo_seed && <span className="rounded bg-sky-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-sky-800">demo history</span>}
                  <span className="ml-auto text-xs text-mute">
                    {d.channel} · {data.names[d.author_id] ?? "Unknown"} · {new Date(d.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                    {d.hours_to_approval !== null && ` · approved in ${d.hours_to_approval.toFixed(1)} h`}
                  </span>
                </div>
                {its.length > 0 && (
                  <ul className="mt-3 grid gap-1.5 text-sm">
                    {its.map((r) => (
                      <li key={r.id} className="flex flex-wrap items-baseline gap-2">
                        <FindingStatusTag status={r.status as FindingStatus} />
                        <code className="text-xs text-mute">{r.source_label.split(" · ")[0]}</code>
                        <span className="text-soft">“{r.quote}”</span>
                        {r.dispute_reason && <span className="text-xs text-orange-700">— {r.dispute_reason}</span>}
                      </li>
                    ))}
                  </ul>
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
