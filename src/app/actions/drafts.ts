"use server";

import { friendlyAiError } from "@/lib/engine/gemini";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { loadKit, requireProfile } from "@/lib/data";
import { runCheck } from "@/lib/engine";
import { applyResolutions } from "@/lib/engine/validate";
import { extractText } from "@/lib/extract";
import { toRow } from "@/lib/engine/rows";
import type { BrandKit, Draft, DraftVersion, Finding } from "@/lib/types";
import { findingsForImages } from "@/lib/images/pipeline";
import { attachImage, dbCache, DRAFT_BUCKET, loadDraftImages, MAX_IMAGES_PER_DRAFT, readImageUploads } from "@/lib/images/store";

const MAX_CHARS = 20000;
type Supa = Awaited<ReturnType<typeof requireProfile>>["supabase"];

async function logEvent(supabase: Supa, draft_id: string, actor_id: string, action: string, detail = "", version_no?: number) {
  await supabase.from("draft_events").insert({ draft_id, actor_id, action, detail, version_no });
}

/** True for the finding that asks for alt text on an image (its resolution becomes the image's alt text). */
function isAltTextFinding(f: Pick<Finding, "image_id" | "rule_id" | "source_label">, kit: BrandKit) {
  if (!f.image_id) return false;
  const altRule = kit.rules.find((r) => r.check_key === "alt_text");
  return altRule ? f.rule_id === altRule.id : f.source_label === "Image alt text";
}

/** Text resolutions only: image findings never change the draft text. */
const textFixes = (list: Finding[]) =>
  list
    .filter((f) => !f.image_id && (f.status === "accepted" || f.status === "edited"))
    .map((f) => ({ id: f.id, start: f.start_idx, end: f.end_idx, text: f.resolution_text ?? "" }));

/** Accepted / edited alt-text findings update the image's alt text. */
async function applyAltText(supabase: Supa, findings: Finding[], kit: BrandKit) {
  const updates = findings.filter((f) => (f.status === "accepted" || f.status === "edited") && isAltTextFinding(f, kit));
  for (const f of updates) {
    const alt = (f.resolution_text ?? "").trim();
    if (alt) await supabase.from("draft_images").update({ alt_text: alt.slice(0, 500) }).eq("id", f.image_id!);
  }
  return updates.length;
}

/** Create a new version, run the checks on it (text and images) and store the findings. */
async function addCheckedVersion(
  supabase: Supa,
  userId: string,
  draft: Draft,
  content: string,
  note: string,
  previousCheckedVersionId: string | null,
  sourceFile: string | null = null,
  kitIn?: BrandKit,
) {
  const kit = kitIn ?? (await loadKit(supabase));
  const cache = dbCache(supabase, draft.workspace_id);
  const images = await loadDraftImages(supabase, draft.id);
  const [result, imageResult] = await Promise.all([
    runCheck(content, draft, kit, { cache }),
    images.length ? findingsForImages(images, kit, draft, cache) : Promise.resolve({ findings: [], aiErrors: [] as string[] }),
  ]);
  const version_no = draft.current_version;

  const { data: version, error } = await supabase
    .from("draft_versions")
    .insert({
      draft_id: draft.id,
      version_no,
      content,
      note,
      source_file: sourceFile,
      checked: true,
      ai_checked: result.aiChecked,
      created_by: userId,
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);

  // Disputes carry over: the same source flagging the same words (in the same image) again inherits the dispute.
  let carried: Pick<Finding, "quote" | "rule_id" | "term_id" | "fact_id" | "dispute_reason" | "image_id" | "source_label">[] = [];
  if (previousCheckedVersionId) {
    const { data } = await supabase
      .from("findings")
      .select("*")
      .eq("version_id", previousCheckedVersionId)
      .eq("status", "disputed");
    carried = data ?? [];
  }

  const now = new Date().toISOString();
  const all = [...result.findings, ...imageResult.findings];
  const rows = all.map((c) => {
    const row: Record<string, unknown> = toRow(c, version.id, draft.id);
    const match = carried.find(
      (d) =>
        d.quote === c.quote &&
        (d.image_id ?? null) === (c.image_id ?? null) &&
        ((d.rule_id ?? d.term_id ?? d.fact_id) === c.source_id || (c.source_type === "image" && d.source_label === c.source_label)),
    );
    if (match) {
      row.status = "disputed";
      row.dispute_reason = match.dispute_reason;
      row.resolved_by = userId;
      row.resolved_at = now;
    }
    return row;
  });
  if (rows.length) {
    const { error: fErr } = await supabase.from("findings").insert(rows);
    if (fErr) throw new Error(fErr.message);
  }
  const parts = [
    `${rows.length} finding${rows.length === 1 ? "" : "s"}`,
    result.aiChecked
      ? result.fromCache
        ? "(rules + AI, AI result reused from cache)"
        : "(rules + AI)"
      : `— rule checks only (AI pass failed: ${friendlyAiError(result.aiError)})`,
  ];
  if (images.length) parts.push(`· ${images.length} image${images.length === 1 ? "" : "s"} checked`);
  if (imageResult.aiErrors.length) parts.push(`· image AI checks incomplete (${imageResult.aiErrors.join("; ")})`);
  await logEvent(supabase, draft.id, userId, "checked", parts.join(" "), version_no);
  return { version: version as DraftVersion, result };
}

export async function createDraft(_: unknown, formData: FormData) {
  const { supabase, user, profile } = await requireProfile();
  const title = String(formData.get("title") ?? "").trim();
  const purpose = String(formData.get("purpose") ?? "").trim();
  const channel = String(formData.get("channel") ?? "Blog");
  let content = String(formData.get("content") ?? "");
  const file = formData.get("file");
  let sourceFile: string | null = null;

  let uploads: Awaited<ReturnType<typeof readImageUploads>> = [];
  try {
    if (file instanceof File && file.size > 0) {
      content = await extractText(file);
      sourceFile = file.name;
    }
    uploads = await readImageUploads(formData);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not read the file" };
  }
  content = content.replace(/\r\n/g, "\n").trim();
  if (!title) return { error: "Give the draft a title." };
  if (!content && !uploads.length) return { error: "Paste some content, upload a file or attach an image." };
  if (content.length > MAX_CHARS) return { error: `Content is too long (${content.length} characters, limit ${MAX_CHARS}).` };

  const { data: draft, error } = await supabase
    .from("drafts")
    .insert({ workspace_id: profile.workspace_id, author_id: user.id, title, purpose, channel, current_version: 1 })
    .select("*")
    .single();
  if (error) return { error: error.message };
  await logEvent(supabase, draft.id, user.id, "created", sourceFile ? `Uploaded ${sourceFile}` : "Draft created", 1);

  try {
    const kit = await loadKit(supabase);
    // Images are analysed in parallel so several images cost one vision round-trip, not several.
    await Promise.all(uploads.map((u) => attachImage(supabase, { workspaceId: profile.workspace_id, draftId: draft.id, userId: user.id, kit }, u)));
    if (uploads.length) await logEvent(supabase, draft.id, user.id, "image_added", uploads.map((u) => u.name).join(", "), 1);
    await addCheckedVersion(supabase, user.id, draft as Draft, content, sourceFile ? `Imported from ${sourceFile}` : "First draft", null, sourceFile, kit);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Check failed" };
  }
  redirect(`/drafts/${draft.id}`);
}

async function loadOwnDraft(draftId: string) {
  const ctx = await requireProfile();
  const { data: draft } = await ctx.supabase.from("drafts").select("*").eq("id", draftId).single();
  if (!draft) throw new Error("Draft not found");
  if (draft.author_id !== ctx.user.id) throw new Error("Only the author can change this draft");
  if (!["draft", "changes_requested"].includes(draft.status)) throw new Error("This draft is locked while in review");
  return { ...ctx, draft: draft as Draft };
}

export async function resolveFinding(
  findingId: string,
  action: "accept" | "edit" | "dispute" | "reopen",
  value?: string,
) {
  const { supabase, user } = await requireProfile();
  const { data: f } = await supabase.from("findings").select("*").eq("id", findingId).single();
  if (!f) return { error: "Finding not found" };
  const patch: Record<string, unknown> = { resolved_by: user.id, resolved_at: new Date().toISOString() };
  if (action === "accept") {
    if (!f.suggestion) return { error: "This finding has no suggested fix — use Edit to write one." };
    Object.assign(patch, { status: "accepted", resolution_text: f.suggestion, dispute_reason: null });
  } else if (action === "edit") {
    Object.assign(patch, { status: "edited", resolution_text: value ?? "", dispute_reason: null });
  } else if (action === "dispute") {
    if (!value?.trim()) return { error: "Say briefly why you disagree — the reviewer will see it." };
    Object.assign(patch, { status: "disputed", dispute_reason: value.trim(), resolution_text: null });
  } else {
    Object.assign(patch, { status: "open", resolution_text: null, dispute_reason: null, resolved_by: null, resolved_at: null });
  }
  const { data: updated, error } = await supabase.from("findings").update(patch).eq("id", findingId).select("id");
  if (error) return { error: error.message };
  if (!updated?.length) return { error: "You can't change this finding (the draft may be in review)." };
  if (action !== "reopen") {
    await logEvent(supabase, f.draft_id, user.id, `finding_${action === "accept" ? "accepted" : action === "edit" ? "edited" : "disputed"}`, f.source_label);
  }
  revalidatePath(`/drafts/${f.draft_id}`);
  return { ok: true };
}

async function currentVersions(supabase: Supa, draft: Draft) {
  const { data: versions } = await supabase
    .from("draft_versions")
    .select("*")
    .eq("draft_id", draft.id)
    .order("version_no", { ascending: false });
  const list = (versions ?? []) as DraftVersion[];
  const current = list.find((v) => v.version_no === draft.current_version)!;
  const checked = list.find((v) => v.checked) ?? null;
  return { current, checked };
}

/** Apply resolved fixes (or use edited text) as a new version and re-run the checks. */
export async function recheck(draftId: string, editedContent?: string) {
  return recheckWithNote(draftId, editedContent);
}

async function recheckWithNote(draftId: string, editedContent?: string, forcedNote?: string) {
  try {
    const { supabase, user, draft } = await loadOwnDraft(draftId);
    const { current, checked } = await currentVersions(supabase, draft);
    const kit = await loadKit(supabase);
    let content: string;
    let note: string | undefined = forcedNote;
    if (editedContent !== undefined) {
      content = editedContent.replace(/\r\n/g, "\n").trim();
      note = note ?? "Edited by author";
      const hasImages = (await loadDraftImages(supabase, draft.id)).length > 0;
      if (!content && !hasImages) return { error: "The draft can't be empty." };
      if (content.length > MAX_CHARS) return { error: `Content is too long (limit ${MAX_CHARS}).` };
    } else {
      const { data: findings } = await supabase.from("findings").select("*").eq("version_id", current.id);
      const fixes = textFixes((findings ?? []) as Finding[]);
      content = applyResolutions(current.content, fixes).text;
      const alt = await applyAltText(supabase, (findings ?? []) as Finding[], kit);
      note = note ?? `Applied ${fixes.length + alt} fix${fixes.length + alt === 1 ? "" : "es"}`;
    }
    const next = { ...draft, current_version: draft.current_version + 1 };
    await addCheckedVersion(supabase, user.id, next, content, note, checked?.id ?? null, null, kit);
    const { error } = await supabase
      .from("drafts")
      .update({ current_version: next.current_version, updated_at: new Date().toISOString() })
      .eq("id", draft.id);
    if (error) return { error: error.message };
    revalidatePath(`/drafts/${draftId}`);
    return { ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Re-check failed" };
  }
}

export async function submitForReview(draftId: string) {
  try {
    const { supabase, user, draft } = await loadOwnDraft(draftId);
    const { current } = await currentVersions(supabase, draft);
    if (!current.checked) return { error: "Edit and re-check the draft before sending it back for review." };
    const { data: findings } = await supabase.from("findings").select("*").eq("version_id", current.id);
    const list = (findings ?? []) as Finding[];
    const open = list.filter((f) => f.status === "open");
    if (open.length) return { error: `Resolve the ${open.length} open finding${open.length === 1 ? "" : "s"} first.` };

    let versionNo = draft.current_version;
    await applyAltText(supabase, list, await loadKit(supabase));
    const fixes = textFixes(list);
    if (fixes.length) {
      const { text, skipped } = applyResolutions(current.content, fixes);
      if (skipped.length) return { error: "Two of your fixes overlap. Re-check the draft so they can be applied cleanly." };
      versionNo += 1;
      const { error } = await supabase.from("draft_versions").insert({
        draft_id: draft.id,
        version_no: versionNo,
        content: text,
        note: `Submitted with ${fixes.length} fix${fixes.length === 1 ? "" : "es"} applied`,
        checked: false,
        created_by: user.id,
      });
      if (error) return { error: error.message };
    }
    const disputed = list.filter((f) => f.status === "disputed").length;
    const { error } = await supabase
      .from("drafts")
      .update({ status: "in_review", current_version: versionNo, updated_at: new Date().toISOString() })
      .eq("id", draft.id);
    if (error) return { error: error.message };
    await logEvent(
      supabase,
      draft.id,
      user.id,
      "submitted",
      `Sent for review${disputed ? ` with ${disputed} disputed finding${disputed === 1 ? "" : "s"}` : ""}`,
      versionNo,
    );
    revalidatePath(`/drafts/${draftId}`);
    revalidatePath("/dashboard");
    return { ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not submit" };
  }
}

export async function reviewDecision(draftId: string, decision: "approve" | "changes", comment: string) {
  const { supabase, user, profile } = await requireProfile();
  if (profile.role === "creator") return { error: "Only reviewers and admins can approve content." };
  const { data: draft } = await supabase.from("drafts").select("*").eq("id", draftId).single();
  if (!draft) return { error: "Draft not found" };
  if (draft.author_id === user.id) return { error: "You can't review your own draft." };
  if (draft.status !== "in_review") return { error: "This draft is not waiting for review." };
  if (decision === "changes" && !comment.trim()) return { error: "Tell the author what to change." };

  const status = decision === "approve" ? "approved" : "changes_requested";
  const { data: updated, error } = await supabase
    .from("drafts")
    .update({ status, reviewer_id: user.id, updated_at: new Date().toISOString() })
    .eq("id", draftId)
    .select("id");
  if (error) return { error: error.message };
  if (!updated?.length) return { error: "You don't have permission to review this draft." };
  await logEvent(
    supabase,
    draftId,
    user.id,
    decision === "approve" ? "approved" : "changes_requested",
    comment.trim(),
    draft.current_version,
  );
  revalidatePath(`/drafts/${draftId}`);
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function addComment(draftId: string, comment: string) {
  const { supabase, user } = await requireProfile();
  if (!comment.trim()) return { error: "Write a comment first." };
  await logEvent(supabase, draftId, user.id, "comment", comment.trim());
  revalidatePath(`/drafts/${draftId}`);
  return { ok: true };
}

/** Attach an image to an editable draft, then re-check (creates a new version). */
export async function addImage(draftId: string, formData: FormData) {
  try {
    const { supabase, user, draft } = await loadOwnDraft(draftId);
    const uploads = await readImageUploads(formData);
    if (!uploads.length) return { error: "Choose a PNG or JPG image." };
    const existing = await loadDraftImages(supabase, draft.id);
    if (existing.length + uploads.length > MAX_IMAGES_PER_DRAFT) return { error: `A draft can have at most ${MAX_IMAGES_PER_DRAFT} images.` };
    const kit = await loadKit(supabase);
    await Promise.all(uploads.map((u) => attachImage(supabase, { workspaceId: draft.workspace_id, draftId: draft.id, userId: user.id, kit }, u)));
    await logEvent(supabase, draft.id, user.id, "image_added", uploads.map((u) => u.name).join(", "));
    return await recheckWithNote(draftId, undefined, `Added ${uploads.map((u) => u.name).join(", ")}`);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not add the image" };
  }
}

/** Remove an image from an editable draft, then re-check. */
export async function removeImage(imageId: string) {
  try {
    const ctx = await requireProfile();
    const { data: img } = await ctx.supabase.from("draft_images").select("id, draft_id, storage_path, file_name").eq("id", imageId).maybeSingle();
    if (!img) return { error: "Image not found" };
    const { supabase, user, draft } = await loadOwnDraft(img.draft_id);
    const { data: deleted, error } = await supabase.from("draft_images").delete().eq("id", imageId).select("id");
    if (error) return { error: error.message };
    if (!deleted?.length) return { error: "You can't remove this image." };
    await supabase.storage.from(DRAFT_BUCKET).remove([img.storage_path]);
    await logEvent(supabase, draft.id, user.id, "image_removed", img.file_name);
    return await recheckWithNote(draft.id, undefined, `Removed ${img.file_name}`);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not remove the image" };
  }
}
