import Link from "next/link";
import { notFound } from "next/navigation";
import { StatusPill } from "@/components/ui";
import { loadKit, profileMap, requireProfile } from "@/lib/data";
import type { Draft, DraftVersion, Finding } from "@/lib/types";
import { DraftWorkspace } from "./workspace";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export default async function DraftPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user, profile } = await requireProfile();
  const { data: draft } = await supabase.from("drafts").select("*").eq("id", id).maybeSingle();
  if (!draft) notFound();

  const [{ data: versions }, { data: findings }, { data: events }, people, kit] = await Promise.all([
    supabase.from("draft_versions").select("*").eq("draft_id", id).order("version_no", { ascending: false }),
    supabase.from("findings").select("*").eq("draft_id", id).order("start_idx"),
    supabase.from("draft_events").select("*").eq("draft_id", id).order("created_at", { ascending: false }),
    profileMap(supabase),
    loadKit(supabase),
  ]);
  const d = draft as Draft;
  const vs = (versions ?? []) as DraftVersion[];
  const current = vs.find((v) => v.version_no === d.current_version) ?? vs[0];
  const checked = vs.find((v) => v.checked && v.version_no <= d.current_version) ?? null;
  const all = (findings ?? []) as Finding[];

  const isAuthor = d.author_id === user.id;
  const canEdit = isAuthor && (d.status === "draft" || d.status === "changes_requested");
  const canReview = profile.role !== "creator" && !isAuthor && d.status === "in_review";
  const lastDecision = (events ?? []).find((e) => e.action === "changes_requested" || e.action === "approved");

  // Grounding detail for each finding's source, so the citation can be expanded in place.
  const sources: Record<string, string> = {};
  kit.rules.forEach((r) => (sources[r.id] = r.description));
  kit.terms.forEach((t) => (sources[t.id] = `Use "${t.preferred}" instead of ${t.banned.map((b) => `"${b}"`).join(", ")}.${t.note ? " " + t.note : ""}`));
  kit.facts.forEach((f) => (sources[f.id] = `${f.statement}${f.valid_until ? ` (valid until ${f.valid_until})` : ""}`));

  return (
    <div className="grid gap-6">
      <div>
        <Link href="/dashboard" className="text-sm text-slate-500 hover:text-ink">
          ← Dashboard
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">{d.title}</h1>
          <StatusPill status={d.status} />
        </div>
        <p className="mt-1 text-sm text-slate-600">
          {d.channel} · by {people[d.author_id]?.full_name ?? "Unknown"} · version {d.current_version}
          {d.purpose && (
            <>
              {" "}
              · <span className="text-slate-500">Purpose:</span> {d.purpose}
            </>
          )}
        </p>
      </div>

      <DraftWorkspace
        draft={d}
        versions={vs}
        currentId={current.id}
        checkedId={checked?.id ?? null}
        findings={all}
        events={events ?? []}
        people={people}
        sources={sources}
        canEdit={canEdit}
        canReview={canReview}
        isAuthor={isAuthor}
        role={profile.role}
        lastDecision={lastDecision ? { action: lastDecision.action, detail: lastDecision.detail, actor: people[lastDecision.actor_id]?.full_name ?? "" } : null}
      />
    </div>
  );
}
