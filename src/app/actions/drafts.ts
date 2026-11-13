"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { loadKit, requireProfile } from "@/lib/data";
import { runCheck } from "@/lib/engine";
import { applyResolutions } from "@/lib/engine/validate";
import { extractText } from "@/lib/extract";
import { toRow } from "@/lib/engine/rows";
import type { Draft, DraftVersion, Finding } from "@/lib/types";

const MAX_CHARS = 20000;
type Supa = Awaited<ReturnType<typeof requireProfile>>["supabase"];

async function logEvent(supabase: Supa, draft_id: string, actor_id: string, action: string, detail = "", version_no?: number) {
  await supabase.from("draft_events").insert({ draft_id, actor_id, action, detail, version_no });
}

/** Create a new version, run the checks on it and store the findings. */
async function addCheckedVersion(
  supabase: Supa,
  userId: string,
  draft: Draft,
  content: string,
  note: string,
  previousCheckedVersionId: string | null,
  sourceFile: string | null = null,
) {
  const kit = await loadKit(supabase);
  const result = await runCheck(content, draft, kit);
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

  // Disputes carry over: the same source flagging the same words again inherits the dispute.
  let carried: Pick<Finding, "quote" | "rule_id" | "term_id" | "fact_id" | "dispute_reason">[] = [];
  if (previousCheckedVersionId) {
    const { data } = await supabase
      .from("findings")
      .select("quote, rule_id, term_id, fact_id, dispute_reason")
      .eq("version_id", previousCheckedVersionId)
      .eq("status", "disputed");
    carried = data ?? [];
  }

  const now = new Date().toISOString();
  const rows = result.findings.map((c) => {
    const row: Record<string, unknown> = toRow(c, version.id, draft.id);
    const match = carried.find(
      (d) => d.quote === c.quote && (d.rule_id ?? d.term_id ?? d.fact_id) === c.source_id,
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
  await logEvent(
    supabase,
    draft.id,
    userId,
    "checked",
    `${rows.length} finding${rows.length === 1 ? "" : "s"}${result.aiChecked ? "" : " — rule checks only (AI unavailable)"}`,
    version_no,
  );
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

  try {
    if (file instanceof File && file.size > 0) {
      content = await extractText(file);
      sourceFile = file.name;
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not read the file" };
  }
  content = content.replace(/\r\n/g, "\n").trim();
  if (!title) return { error: "Give the draft a title." };
  if (!content) return { error: "Paste some content or upload a file." };
  if (content.length > MAX_CHARS) return { error: `Content is too long (${content.length} characters, limit ${MAX_CHARS}).` };

  const { data: draft, error } = await supabase
    .from("drafts")
    .insert({ workspace_id: profile.workspace_id, author_id: user.id, title, purpose, channel, current_version: 1 })
    .select("*")
    .single();
  if (error) return { error: error.message };
  await logEvent(supabase, draft.id, user.id, "created", sourceFile ? `Uploaded ${sourceFile}` : "Draft created", 1);

  try {
    await addCheckedVersion(supabase, user.id, draft as Draft, content, sourceFile ? `Imported from ${sourceFile}` : "First draft", null, sourceFile);
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
  try {
    const { supabase, user, draft } = await loadOwnDraft(draftId);
    const { current, checked } = await currentVersions(supabase, draft);
    let content: string;
    let note: string;
    if (editedContent !== undefined) {
      content = editedContent.replace(/\r\n/g, "\n").trim();
      note = "Edited by author";
      if (!content) return { error: "The draft can't be empty." };
      if (content.length > MAX_CHARS) return { error: `Content is too long (limit ${MAX_CHARS}).` };
    } else {
      const { data: findings } = await supabase.from("findings").select("*").eq("version_id", current.id);
      const res = (findings ?? []).filter((f) => f.status === "accepted" || f.status === "edited");
      content = applyResolutions(
        current.content,
        res.map((f) => ({ id: f.id, start: f.start_idx, end: f.end_idx, text: f.resolution_text ?? "" })),
      ).text;
      note = `Applied ${res.length} fix${res.length === 1 ? "" : "es"}`;
    }
    const next = { ...draft, current_version: draft.current_version + 1 };
    await addCheckedVersion(supabase, user.id, next, content, note, checked?.id ?? null);
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
    const fixes = list.filter((f) => f.status === "accepted" || f.status === "edited");
    if (fixes.length) {
      const { text, skipped } = applyResolutions(
        current.content,
        fixes.map((f) => ({ id: f.id, start: f.start_idx, end: f.end_idx, text: f.resolution_text ?? "" })),
      );
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
