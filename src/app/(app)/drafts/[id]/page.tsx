import Link from "next/link";
import { notFound } from "next/navigation";
import { StatusPill } from "@/components/ui";
import { loadKit, profileMap, requireProfile } from "@/lib/data";
import type { Draft, DraftVersion, Finding } from "@/lib/types";
import { DraftWorkspace } from "./workspace";
import { loadDraftImages, signedImageUrls } from "@/lib/images/store";
import { missingImageRules } from "@/lib/images/findings";
import { hasFinalRoundSchema } from "@/lib/data";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export default async function DraftPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user, profile } = await requireProfile();
  const { data: draft } = await supabase.from("drafts").select("*").eq("id", id).maybeSingle();
  if (!draft) notFound();

  const [{ data: versions }, { data: findings }, { data: events }, people, kit, imageRows, imagesEnabled] = await Promise.all([
    supabase.from("draft_versions").select("*").eq("draft_id", id).order("version_no", { ascending: false }),
    supabase.from("findings").select("*").eq("draft_id", id).order("start_idx"),
    supabase.from("draft_events").select("*").eq("draft_id", id).order("created_at", { ascending: false }),
    profileMap(supabase),
    loadKit(supabase),
    loadDraftImages(supabase, id),
    hasFinalRoundSchema(supabase),
  ]);
  const urls = await signedImageUrls(supabase, imageRows.map((i) => i.storage_path));
  const images = imageRows.map((i) => ({
    id: i.id,
    file_name: i.file_name,
    alt_text: i.alt_text,
    url: urls[i.storage_path] ?? null,
    width: i.width,
    height: i.height,
    analysis: i.analysis,
  }));
  const palette = kit.colors ?? [];
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
  if (palette.length) sources["image:palette"] = `Approved palette: ${palette.map((c) => `${c.name} ${c.hex}`).join(", ")}.`;

  return (
    <div className="grid gap-6">
      <div>
        <Link href="/dashboard" className="text-sm text-mute hover:text-fg">
          ← Dashboard
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="page-title">{d.title}</h1>
          <StatusPill status={d.status} />
        </div>
        <p className="mt-1 text-sm text-mute">
          {d.channel} · by {people[d.author_id]?.full_name ?? "Unknown"} · version {d.current_version}
          {d.purpose && (
            <>
              {" "}
              · <span className="text-mute">Purpose:</span> {d.purpose}
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
        images={images}
        imagesEnabled={imagesEnabled}
        palette={palette}
        minContrast={kit.minContrast ?? 4.5}
        missingRules={missingImageRules(kit).map((k) => k.replace("_", " "))}
        canEdit={canEdit}
        canReview={canReview}
        isAuthor={isAuthor}
        role={profile.role}
        lastDecision={lastDecision ? { action: lastDecision.action, detail: lastDecision.detail, actor: people[lastDecision.actor_id]?.full_name ?? "" } : null}
      />
    </div>
  );
}
