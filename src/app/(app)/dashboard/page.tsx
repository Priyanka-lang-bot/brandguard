import Link from "next/link";
import { StatusPill, timeAgo } from "@/components/ui";
import { profileMap, requireProfile } from "@/lib/data";
import type { Draft } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function Dashboard() {
  const { supabase, user, profile } = await requireProfile();
  const [{ data: drafts }, people, { data: versions }, { data: openFindings }] = await Promise.all([
    supabase.from("drafts").select("*").order("updated_at", { ascending: false }),
    profileMap(supabase),
    supabase.from("draft_versions").select("id, draft_id, version_no"),
    supabase.from("findings").select("version_id, status, severity").eq("status", "open"),
  ]);
  const list = (drafts ?? []) as Draft[];
  const currentVersionId = new Map(
    list.map((d) => [d.id, versions?.find((v) => v.draft_id === d.id && v.version_no === d.current_version)?.id]),
  );
  const openCount = (d: Draft) => (openFindings ?? []).filter((f) => f.version_id === currentVersionId.get(d.id)).length;

  const isReviewer = profile.role !== "creator";
  const queue = list.filter((d) => d.status === "in_review" && d.author_id !== user.id);
  const mine = list.filter((d) => d.author_id === user.id);
  const others = list.filter((d) => d.author_id !== user.id && !(isReviewer && queue.includes(d)));

  const stats = [
    { label: "Waiting for review", value: list.filter((d) => d.status === "in_review").length },
    { label: "Changes requested", value: list.filter((d) => d.status === "changes_requested").length },
    { label: "Approved", value: list.filter((d) => d.status === "approved").length },
    { label: "Open findings", value: list.reduce((n, d) => n + (["draft", "changes_requested"].includes(d.status) ? openCount(d) : 0), 0) },
  ];

  return (
    <div className="grid gap-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-slate-500">Lumio workspace</p>
          <h1 className="text-2xl font-semibold tracking-tight">Welcome, {profile.full_name.split(" ")[0]}</h1>
        </div>
        {profile.role !== "reviewer" && (
          <Link href="/drafts/new" className="btn-primary">
            + New draft
          </Link>
        )}
      </div>

      <GuideCard role={profile.role} hasQueue={queue.length > 0} />

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="card px-4 py-3">
            <div className="text-2xl font-semibold tabular-nums">{s.value}</div>
            <div className="text-xs text-slate-500">{s.label}</div>
          </div>
        ))}
      </section>

      {isReviewer && (
        <DraftTable
          title="Your review queue"
          empty="Nothing is waiting for your review."
          drafts={queue}
          people={people}
          openCount={openCount}
          highlight
        />
      )}
      {profile.role !== "reviewer" && (
        <DraftTable title="My drafts" empty="You haven't written anything yet." drafts={mine} people={people} openCount={openCount} />
      )}
      <DraftTable title="Everything else in the workspace" empty="No other drafts." drafts={others} people={people} openCount={openCount} />
    </div>
  );
}

function GuideCard({ role, hasQueue }: { role: string; hasQueue: boolean }) {
  const steps =
    role === "reviewer"
      ? [
          hasQueue ? "Open a draft from your review queue below." : "Your queue is empty — switch to Creator (top right) and send a draft for review.",
          "Check the highlighted findings, how each was resolved, and any disputes.",
          "Use the Changes tab to see exactly what the author changed.",
          "Approve it, or request changes with a comment.",
        ]
      : role === "admin"
        ? [
            "Open the Brand Kit to see the rules, terms and facts every check is grounded in.",
            "Add a rule or fact — the next check uses it immediately.",
            "Import a guideline PDF: each extracted rule waits for your approval.",
            "Admins can also review drafts written by others.",
          ]
        : [
            "Click New draft, or open the Welcome email draft below — it already has findings.",
            "For each finding: accept the fix, edit it, or dispute it with a reason.",
            "Send for review when nothing is left open.",
            "Switch to Reviewer (top right) to approve it.",
          ];
  return (
    <section className="card border-brand-100 bg-brand-50/60 p-5">
      <h2 className="text-sm font-semibold text-brand-700">How to try BrandGuard as {role}</h2>
      <ol className="mt-3 grid gap-2 text-sm text-slate-700 sm:grid-cols-2 lg:grid-cols-4">
        {steps.map((s, i) => (
          <li key={i} className="flex gap-2">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-600 text-[11px] font-semibold text-white">
              {i + 1}
            </span>
            <span>{s}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

function DraftTable({
  title,
  empty,
  drafts,
  people,
  openCount,
  highlight,
}: {
  title: string;
  empty: string;
  drafts: Draft[];
  people: Record<string, { full_name: string }>;
  openCount: (d: Draft) => number;
  highlight?: boolean;
}) {
  return (
    <section>
      <h2 className="mb-3 flex items-center gap-2 text-base font-semibold">
        {title}
        {highlight && drafts.length > 0 && (
          <span className="rounded-full bg-violet-600 px-2 py-0.5 text-xs font-semibold text-white">{drafts.length}</span>
        )}
      </h2>
      {drafts.length === 0 ? (
        <p className="card px-4 py-6 text-center text-sm text-slate-500">{empty}</p>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-2.5 font-medium">Title</th>
                <th className="hidden px-4 py-2.5 font-medium sm:table-cell">Channel</th>
                <th className="hidden px-4 py-2.5 font-medium md:table-cell">Author</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
                <th className="hidden px-4 py-2.5 font-medium sm:table-cell">Open findings</th>
                <th className="hidden px-4 py-2.5 text-right font-medium md:table-cell">Updated</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {drafts.map((d) => {
                const open = ["draft", "changes_requested"].includes(d.status) ? openCount(d) : 0;
                return (
                  <tr key={d.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <Link href={`/drafts/${d.id}`} className="font-medium text-ink hover:text-brand-700 hover:underline">
                        {d.title}
                      </Link>
                      <div className="text-xs text-slate-500">v{d.current_version}</div>
                    </td>
                    <td className="hidden px-4 py-3 text-slate-600 sm:table-cell">{d.channel}</td>
                    <td className="hidden px-4 py-3 text-slate-600 md:table-cell">{people[d.author_id]?.full_name ?? "—"}</td>
                    <td className="px-4 py-3">
                      <StatusPill status={d.status} />
                    </td>
                    <td className="hidden px-4 py-3 sm:table-cell">
                      {open ? <span className="font-medium text-amber-700">{open}</span> : <span className="text-slate-400">—</span>}
                    </td>
                    <td className="hidden px-4 py-3 text-right text-slate-500 md:table-cell">{timeAgo(d.updated_at)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
