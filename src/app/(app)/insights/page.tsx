import Link from "next/link";
import { redirect } from "next/navigation";
import { hasFinalRoundSchema, requireProfile } from "@/lib/data";
import {
  applyFilters,
  approvalTimes,
  channelTrend,
  creatorStats,
  lastWeeks,
  resolvedBeforeReview,
  sourceStats,
  termMistakes,
  weeklyTrend,
  type Filters,
} from "@/lib/insights";
import { loadInsights } from "@/lib/insights-data";
import { SettingsForm } from "./settings-form";

export const dynamic = "force-dynamic";

type SP = { channel?: string; creator?: string; demo?: string };

const pct = (v: number | null) => (v === null ? "—" : `${Math.round(v * 100)}%`);
const hrs = (v: number | null) => (v === null ? "—" : v < 48 ? `${v.toFixed(1)} h` : `${(v / 24).toFixed(1)} days`);

function editHref(s: { rule_id: string | null; term_id: string | null; fact_id: string | null; label: string }) {
  if (s.rule_id) return `/brand-kit?tab=rules&edit=${s.rule_id}`;
  if (s.term_id) return "/brand-kit?tab=terms";
  if (s.fact_id) return "/brand-kit?tab=facts";
  if (/palette|logo/i.test(s.label)) return "/brand-kit?tab=visual";
  return "/brand-kit";
}

export default async function InsightsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const { supabase, profile } = await requireProfile();
  if (profile.role !== "admin") redirect("/dashboard");
  if (!(await hasFinalRoundSchema(supabase))) {
    return (
      <div className="grid gap-4">
        <h1 className="page-title">Brand insights</h1>
        <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-800">
          Insights need the database update in <code>supabase/migrations/0002_final_round.sql</code>, which adds the views this page reads.
          Run it once in the Supabase SQL editor.
        </p>
      </div>
    );
  }

  const data = await loadInsights(supabase);
  const filters: Filters = { channel: sp.channel || undefined, creator: sp.creator || undefined, demo: sp.demo === "exclude" ? "exclude" : "include" };
  const issues = applyFilters(data.issues, filters);
  const drafts = applyFilters(data.drafts, filters);
  const stats = sourceStats(issues, data.threshold, data.minFindings);
  const terms = termMistakes(issues).slice(0, 8);
  const creators = creatorStats(issues, drafts, data.names);
  const weeks = weeklyTrend(issues, drafts, lastWeeks(8));
  const channels = channelTrend(issues, drafts);
  const approval = approvalTimes(drafts);
  const resolved = resolvedBeforeReview(issues, drafts);
  const flagged = data.stats.filter((s) => s.possibly_unclear).sort((a, b) => (b.dispute_rate ?? 0) - (a.dispute_rate ?? 0));
  const disputedStats = stats.filter((s) => s.disputed > 0).sort((a, b) => b.disputeRate - a.disputeRate || b.disputed - a.disputed);
  const demoCount = data.drafts.filter((d) => d.demo_seed).length;
  const allChannels = [...new Set(data.drafts.map((d) => d.channel))].sort();

  const q = (extra: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ channel: filters.channel, creator: filters.creator, demo: filters.demo === "exclude" ? "exclude" : undefined, ...extra })) if (v) p.set(k, v);
    return `/insights/drafts?${p.toString()}`;
  };
  const maxIssues = Math.max(1, ...stats.map((s) => s.issues));
  const maxWeek = Math.max(1, ...weeks.map((w) => w.issues));
  const maxChannel = Math.max(0.01, ...channels.map((c) => c.perDraft));

  return (
    <div className="grid gap-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-mute">Admin</p>
          <h1 className="page-title">Brand insights</h1>
          <p className="mt-1 max-w-3xl text-sm text-mute">
            Computed live from this workspace&apos;s findings, disputes and approvals through row-level-secured database views. An issue is one
            Brand Kit source flagging the same words in one draft (re-checks are not double-counted). Every number links to the drafts behind
            it.
          </p>
        </div>
      </div>

      <form className="card flex flex-wrap items-end gap-3 p-4" method="get">
        <div>
          <label className="label" htmlFor="f-channel">Channel</label>
          <select id="f-channel" name="channel" defaultValue={filters.channel ?? ""} className="input w-44">
            <option value="">All channels</option>
            {allChannels.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="f-creator">Creator</label>
          <select id="f-creator" name="creator" defaultValue={filters.creator ?? ""} className="input w-48">
            <option value="">All creators</option>
            {data.creators.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="f-demo">Seeded demo history</label>
          <select id="f-demo" name="demo" defaultValue={filters.demo} className="input w-44">
            <option value="include">Include</option>
            <option value="exclude">Exclude</option>
          </select>
        </div>
        <button className="btn-primary">Apply</button>
        {(filters.channel || filters.creator || filters.demo === "exclude") && (
          <Link href="/insights" className="btn-ghost">Clear</Link>
        )}
        {demoCount > 0 && (
          <p className="basis-full text-xs text-mute">
            <span className="mr-1 rounded bg-sky-500/15 px-1.5 py-0.5 font-semibold text-sky-800">Demo data</span>
            {demoCount} draft{demoCount === 1 ? " was" : "s were"} created by the demo seed (<code>demo_seed = true</code>) so this dashboard has
            history to show. Their findings come from real rule checks. The creators&apos; decisions and timestamps are scripted. Choose
            &ldquo;Exclude&rdquo; to see live data only.
          </p>
        )}
      </form>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Kpi label="Drafts" value={String(drafts.length)} href={q({})} />
        <Kpi label="Distinct issues" value={String(issues.length)} href={q({})} />
        <Kpi label="Resolved before review" value={pct(resolved.share)} sub={`${resolved.fixed} of ${resolved.total} on submitted drafts`} href={q({ submitted: "1" })} />
        <Kpi label="Median time to approval" value={hrs(approval.median)} sub={approval.count ? `avg ${hrs(approval.average)} · ${approval.count} approved` : "no approvals yet"} href={q({ approved: "1" })} />
        <Kpi label="Possibly unclear rules" value={String(flagged.length)} sub={`dispute rate ≥ ${pct(data.threshold)}, ≥ ${data.minFindings} findings`} href="#unclear" warn={flagged.length > 0} />
      </section>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <Panel title="Most-broken Brand Kit rules" note="Distinct issues per source · bar = issues · click to see the drafts">
          {stats.length === 0 ? (
            <Empty />
          ) : (
            <ul className="grid gap-2.5">
              {stats.slice(0, 10).map((s, i) => (
                <li key={s.key} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 text-sm">
                  <Link href={q({ source: s.key })} className="truncate font-medium hover:text-brand-300 hover:underline">
                    {i === 0 && <span className="mr-1.5 rounded bg-red-500/15 px-1.5 py-0.5 text-[10px] font-bold uppercase text-red-700">Top</span>}
                    {s.label}
                  </Link>
                  <span className="text-xs tabular-nums text-mute">
                    {s.issues} issue{s.issues === 1 ? "" : "s"} · {s.drafts} draft{s.drafts === 1 ? "" : "s"}
                  </span>
                  <span className="col-span-2 flex items-center gap-2">
                    <span className="h-2 flex-1 rounded-full bg-line">
                      <span className="block h-2 rounded-full bg-brand-500" style={{ width: `${(s.issues / maxIssues) * 100}%` }} />
                    </span>
                    <Link href={editHref(s)} className="text-xs text-mute hover:text-fg">Edit rule</Link>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Possibly unclear rules" id="unclear" note={`Flagged automatically when the dispute rate is ≥ ${pct(data.threshold)} with at least ${data.minFindings} findings (whole workspace)`}>
          {flagged.length === 0 ? (
            <p className="text-sm text-mute">No rule is above the dispute threshold.</p>
          ) : (
            <ul className="grid gap-3">
              {flagged.map((s) => {
                const key = s.source_id;
                const item = { rule_id: s.source_type === "rule" ? s.source_id : null, term_id: s.source_type === "term" ? s.source_id : null, fact_id: s.source_type === "fact" ? s.source_id : null, label: s.source_label };
                return (
                  <li key={key} className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-marker px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-ink">Possibly unclear</span>
                      <span className="font-medium">{s.source_label}</span>
                    </div>
                    <p className="mt-1 text-sm text-mute">
                      {s.disputed} of {s.findings} findings disputed ({pct(s.dispute_rate)}) across {s.drafts} draft{s.drafts === 1 ? "" : "s"}.
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2 text-xs">
                      <Link className="btn-secondary btn-sm" href={editHref(item)}>Edit the rule</Link>
                      <Link className="btn-ghost btn-sm" href={`/insights/drafts?source=${key}&status=disputed`}>Drafts with disputes</Link>
                      <Link className="btn-ghost btn-sm" href={`/insights/drafts?source=${key}`}>All underlying findings</Link>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Dispute frequency by rule" note="Disputed ÷ distinct issues, for the current filters">
          {disputedStats.length === 0 ? (
            <p className="text-sm text-mute">No disputes yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-mute">
                <tr><th className="pb-2 font-medium">Rule</th><th className="pb-2 text-right font-medium">Disputed</th><th className="pb-2 text-right font-medium">Rate</th></tr>
              </thead>
              <tbody className="divide-y divide-line">
                {disputedStats.map((s) => (
                  <tr key={s.key}>
                    <td className="py-2">
                      <Link href={q({ source: s.key, status: "disputed" })} className="hover:text-brand-300 hover:underline">{s.label}</Link>
                      {s.possiblyUnclear && <span className="ml-2 rounded bg-amber-400/20 px-1 text-[10px] font-semibold text-amber-800">unclear?</span>}
                    </td>
                    <td className="py-2 text-right tabular-nums">{s.disputed}/{s.issues}</td>
                    <td className={`py-2 text-right font-medium tabular-nums ${s.possiblyUnclear ? "text-amber-800" : ""}`}>{pct(s.disputeRate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>

        <Panel title="Repeated terminology mistakes" note="Each wrong variant and how often it appeared">
          {terms.length === 0 ? (
            <p className="text-sm text-mute">No terminology issues.</p>
          ) : (
            <ul className="divide-y divide-line text-sm">
              {terms.map((t) => (
                <li key={`${t.term_id}${t.variant}`} className="flex items-center gap-3 py-2">
                  <Link href={q({ source: t.term_id ?? "", quote: t.variant.toLowerCase() })} className="font-medium text-red-700 line-through decoration-red-400/60 hover:underline">{t.variant}</Link>
                  <span className="text-xs text-mute">{t.label.replace(/^TERM-\d+ · /, "→ ")}</span>
                  <span className="ml-auto text-xs tabular-nums text-mute">{t.count}× in {t.drafts} draft{t.drafts === 1 ? "" : "s"}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Weekly trend" note="Distinct issues found per week (by check date), last 8 weeks">
          <div className="flex h-40 items-end gap-2">
            {weeks.map((w) => (
              <Link key={w.week} href={q({ week: w.week })} className="group flex h-full flex-1 flex-col items-center justify-end gap-1" title={`${w.issues} issues in ${w.draftsWithIssues} drafts, week of ${w.week}`}>
                <span className="text-[10px] tabular-nums text-mute">{w.issues || ""}</span>
                <span className="w-full rounded-t bg-ink group-hover:bg-proof" style={{ height: `${(w.issues / maxWeek) * 100}%`, minHeight: w.issues ? 3 : 0 }} />
                <span className="text-[10px] text-dim">{w.week.slice(5)}</span>
              </Link>
            ))}
          </div>
        </Panel>

        <Panel title="Channel trends" note="Issues per draft by channel">
          {channels.length === 0 ? (
            <Empty />
          ) : (
            <ul className="grid gap-2 text-sm">
              {channels.map((c) => (
                <li key={c.channel} className="grid grid-cols-[110px_1fr_auto] items-center gap-3">
                  <Link href={q({ channel: c.channel })} className="truncate hover:text-brand-300 hover:underline">{c.channel}</Link>
                  <span className="h-2 rounded-full bg-line">
                    <span className="block h-2 rounded-full bg-proof" style={{ width: `${(c.perDraft / maxChannel) * 100}%` }} />
                  </span>
                  <span className="text-xs tabular-nums text-mute">{c.perDraft.toFixed(1)} · {c.drafts} drafts</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <Panel title="Repeated mistakes by creator" note="“Repeated” = a Brand Kit source broken in more than one of their drafts">
          {creators.length === 0 ? (
            <Empty />
          ) : (
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-mute">
                <tr><th className="pb-2 font-medium">Creator</th><th className="pb-2 text-right font-medium">Issues</th><th className="pb-2 text-right font-medium">Per draft</th><th className="pb-2 text-right font-medium">Repeated rules</th><th className="pb-2 text-right font-medium">Disputed</th></tr>
              </thead>
              <tbody className="divide-y divide-line">
                {creators.map((c) => (
                  <tr key={c.author_id}>
                    <td className="py-2"><Link href={q({ creator: c.author_id })} className="hover:text-brand-300 hover:underline">{c.name}</Link></td>
                    <td className="py-2 text-right tabular-nums">{c.issues}</td>
                    <td className="py-2 text-right tabular-nums">{c.perDraft.toFixed(1)}</td>
                    <td className="py-2 text-right tabular-nums">{c.repeatedRules}</td>
                    <td className="py-2 text-right tabular-nums">{c.disputed}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>

        <Panel title="Time from submission to approval" note="First “sent for review” to the final approval">
          <dl className="grid grid-cols-3 gap-3 text-center">
            <Stat label="Median" value={hrs(approval.median)} />
            <Stat label="Average" value={hrs(approval.average)} />
            <Stat label="90th percentile" value={hrs(approval.p90)} />
          </dl>
          <Link href={q({ approved: "1" })} className="mt-4 inline-block text-sm text-brand-300 hover:underline">See the {approval.count} approved draft{approval.count === 1 ? "" : "s"} →</Link>
        </Panel>
      </div>

      <Panel title="Settings" note="Applies to the “possibly unclear” flag everywhere, including the database view">
        <SettingsForm threshold={data.threshold} minFindings={data.minFindings} />
      </Panel>
    </div>
  );
}

function Kpi({ label, value, sub, href, warn }: { label: string; value: string; sub?: string; href: string; warn?: boolean }) {
  return (
    <Link href={href} className={`card px-4 py-3 transition hover:border-line-strong ${warn ? "border-amber-500/40" : ""}`}>
      <div className={`text-2xl font-semibold tabular-nums ${warn ? "text-amber-800" : ""}`}>{value}</div>
      <div className="text-xs text-mute">{label}</div>
      {sub && <div className="mt-0.5 text-[11px] text-dim">{sub}</div>}
    </Link>
  );
}
function Panel({ title, note, children, id }: { title: string; note?: string; children: React.ReactNode; id?: string }) {
  return (
    <section id={id} className="card scroll-mt-24 p-5">
      <h2 className="font-semibold">{title}</h2>
      {note && <p className="mb-4 mt-0.5 text-xs text-mute">{note}</p>}
      {children}
    </section>
  );
}
function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-surface-2 px-2 py-3">
      <dd className="text-xl font-semibold tabular-nums">{value}</dd>
      <dt className="text-xs text-mute">{label}</dt>
    </div>
  );
}
function Empty() {
  return <p className="text-sm text-mute">No data for these filters yet. Check a draft to start building insights.</p>;
}
