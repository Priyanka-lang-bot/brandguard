"use client";

import { diffWords } from "diff";
import { useMemo, useState, useTransition } from "react";
import { addComment, recheck, resolveFinding, reviewDecision, submitForReview } from "@/app/actions/drafts";
import { CategoryBadge, cx, FindingStatusTag, RoleBadge, SeverityBadge, timeAgo } from "@/components/ui";
import { applyResolutions } from "@/lib/engine/validate";
import type { Draft, DraftVersion, Finding, Role } from "@/lib/types";

interface Event {
  id: number;
  actor_id: string | null;
  action: string;
  detail: string;
  version_no: number | null;
  created_at: string;
}

interface Props {
  draft: Draft;
  versions: DraftVersion[];
  currentId: string;
  checkedId: string | null;
  findings: Finding[];
  events: Event[];
  people: Record<string, { full_name: string; role: Role }>;
  sources: Record<string, string>;
  canEdit: boolean;
  canReview: boolean;
  isAuthor: boolean;
  role: Role;
  lastDecision: { action: string; detail: string; actor: string } | null;
}

type Tab = "findings" | "changes" | "history" | "activity";

export function DraftWorkspace(p: Props) {
  const current = p.versions.find((v) => v.id === p.currentId)!;
  const checked = p.versions.find((v) => v.id === p.checkedId) ?? null;
  const findings = useMemo(() => p.findings.filter((f) => f.version_id === p.checkedId), [p.findings, p.checkedId]);
  const interactive = p.canEdit && current.checked;
  const [tab, setTab] = useState<Tab>("findings");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const run = (fn: () => Promise<{ error?: string } | { ok: boolean } | undefined>) => {
    setError(null);
    start(async () => {
      const res = await fn();
      if (res && "error" in res && res.error) setError(res.error);
    });
  };

  const counts = {
    open: findings.filter((f) => f.status === "open").length,
    fixed: findings.filter((f) => f.status === "accepted" || f.status === "edited").length,
    disputed: findings.filter((f) => f.status === "disputed").length,
  };

  const tabs: { id: Tab; label: string }[] = [
    { id: "findings", label: `Findings (${findings.length})` },
    { id: "changes", label: "Changes" },
    { id: "history", label: `Versions (${p.versions.length})` },
    { id: "activity", label: "Activity" },
  ];

  return (
    <div className="grid gap-4">
      <StatusBanner {...p} counts={counts} current={current} />

      {error && (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">
          {error}
        </p>
      )}

      <div className="flex gap-1 border-b border-slate-200" role="tablist">
        {tabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={cx(
              "-mb-px border-b-2 px-4 py-2 text-sm font-medium",
              tab === t.id ? "border-brand-600 text-brand-700" : "border-transparent text-slate-500 hover:text-ink",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "findings" && (
        <FindingsTab
          {...p}
          current={current}
          checked={checked}
          findings={findings}
          interactive={interactive}
          pending={pending}
          run={run}
          counts={counts}
        />
      )}
      {tab === "changes" && <ChangesTab versions={p.versions} current={current} checked={checked} />}
      {tab === "history" && <HistoryTab versions={p.versions} findings={p.findings} people={p.people} />}
      {tab === "activity" && <ActivityTab events={p.events} people={p.people} draftId={p.draft.id} run={run} pending={pending} />}
    </div>
  );
}

// ---------------------------------------------------------------------------

function StatusBanner(p: Props & { counts: { open: number; fixed: number; disputed: number }; current: DraftVersion }) {
  const { draft, counts } = p;
  let tone = "border-slate-200 bg-white";
  let text: React.ReactNode = null;
  if (draft.status === "approved") {
    tone = "border-emerald-200 bg-emerald-50 text-emerald-900";
    text = (
      <>
        <strong>Approved</strong> by {p.lastDecision?.actor || "a reviewer"}. Version {draft.current_version} is cleared to publish.
        {p.lastDecision?.detail && <span className="block text-sm opacity-80">“{p.lastDecision.detail}”</span>}
      </>
    );
  } else if (draft.status === "in_review") {
    tone = "border-violet-200 bg-violet-50 text-violet-900";
    text = p.canReview ? (
      <>
        <strong>Waiting for your decision.</strong> Review the findings and how the author resolved them
        {counts.disputed ? ` — ${counts.disputed} disputed` : ""}, check the Changes tab, then approve or request changes below.
      </>
    ) : p.isAuthor ? (
      <>
        <strong>Sent for review.</strong> A reviewer will approve it or ask for changes. The draft is locked until then.
        {p.role === "creator" && <span className="block text-sm opacity-80">Demo tip: switch to “Riya · Reviewer” in the top bar to review it.</span>}
      </>
    ) : (
      <>
        <strong>In review.</strong> {p.role === "creator" ? "Only reviewers and admins can approve content." : "You can't review your own draft."}
      </>
    );
  } else if (draft.status === "changes_requested") {
    tone = "border-amber-200 bg-amber-50 text-amber-900";
    text = (
      <>
        <strong>{p.lastDecision?.actor || "The reviewer"} asked for changes:</strong> “{p.lastDecision?.detail}”
        {p.canEdit && <span className="block text-sm opacity-80">Edit the text and re-check, then send it back for review.</span>}
      </>
    );
  } else if (p.canEdit) {
    tone = counts.open ? "border-amber-200 bg-amber-50 text-amber-900" : "border-emerald-200 bg-emerald-50 text-emerald-900";
    text = counts.open ? (
      <>
        <strong>{counts.open} finding{counts.open === 1 ? "" : "s"} to resolve.</strong> Accept the suggested fix, edit it, or dispute it
        with a reason. When nothing is open, send the draft for review.
      </>
    ) : (
      <>
        <strong>All findings resolved.</strong> {counts.fixed} fix{counts.fixed === 1 ? "" : "es"} will be applied
        {counts.disputed ? ` and ${counts.disputed} dispute${counts.disputed === 1 ? "" : "s"} go to the reviewer` : ""}. Send it for review when ready.
      </>
    );
  } else {
    text = <>This draft is being written by its author.</>;
  }
  return (
    <div className={cx("rounded-xl border px-4 py-3 text-sm", tone)}>
      {text}
      {p.current.checked && !p.current.ai_checked && (
        <span className="mt-1 block text-xs opacity-80">
          Note: the AI pass was unavailable for this version, so only the rule-based checks (terminology, patterns) ran.
        </span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

function FindingsTab(
  p: Props & {
    current: DraftVersion;
    checked: DraftVersion | null;
    findings: Finding[];
    interactive: boolean;
    pending: boolean;
    run: (fn: () => Promise<{ error?: string } | { ok: boolean } | undefined>) => void;
    counts: { open: number; fixed: number; disputed: number };
  },
) {
  const { findings, checked, current, interactive, pending, run, counts } = p;
  const [active, setActive] = useState<string | null>(null);
  const [preview, setPreview] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(current.content);
  const [filter, setFilter] = useState<"all" | "open" | "resolved">("all");

  const base = checked?.content ?? current.content;
  const applied = useMemo(
    () =>
      applyResolutions(
        base,
        findings
          .filter((f) => f.status === "accepted" || f.status === "edited")
          .map((f) => ({ id: f.id, start: f.start_idx, end: f.end_idx, text: f.resolution_text ?? "" })),
      ),
    [base, findings],
  );
  const shown = findings.filter((f) => (filter === "all" ? true : filter === "open" ? f.status === "open" : f.status !== "open"));

  // After changes are requested the author edits the latest submitted text directly.
  const needsEdit = p.canEdit && !current.checked;

  if (editing) {
    return (
      <div className="card grid gap-3 p-5">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Edit draft</h2>
          <span className="text-xs text-slate-500">Saving creates version {p.draft.current_version + 1} and checks it again.</span>
        </div>
        <textarea
          className="input min-h-[320px] leading-relaxed"
          value={editText}
          onChange={(e) => setEditText(e.target.value)}
          aria-label="Draft text"
        />
        <div className="flex justify-end gap-2">
          <button className="btn-secondary" onClick={() => setEditing(false)} disabled={pending}>
            Cancel
          </button>
          <button
            className="btn-primary"
            disabled={pending}
            onClick={() =>
              run(async () => {
                const r = await recheck(p.draft.id, editText);
                if (r && "ok" in r) setEditing(false);
                return r;
              })
            }
          >
            {pending ? "Checking…" : "Save & re-check"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_420px]">
      {/* Left: the text */}
      <section className="card self-start">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-5 py-3">
          <div className="text-sm text-slate-600">
            {checked ? (
              <>
                Checked text · <strong>version {checked.version_no}</strong>
                {checked.source_file && <span className="text-slate-400"> · from {checked.source_file}</span>}
              </>
            ) : (
              "No checked version yet"
            )}
          </div>
          <div className="flex items-center gap-2">
            {counts.fixed > 0 && (
              <label className="flex items-center gap-1.5 text-sm text-slate-600">
                <input type="checkbox" checked={preview} onChange={(e) => setPreview(e.target.checked)} />
                Preview with fixes
              </label>
            )}
            {(interactive || needsEdit) && (
              <button
                className="btn-secondary btn-sm"
                onClick={() => {
                  setEditText(needsEdit ? current.content : applied.text);
                  setEditing(true);
                }}
              >
                Edit text
              </button>
            )}
          </div>
        </div>
        <div className="px-5 py-4">
          {preview ? (
            <DiffView from={base} to={applied.text} />
          ) : needsEdit ? (
            <>
              <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
                Showing the version the reviewer saw (v{current.version_no}). Click “Edit text” to change it — the new version is checked again.
              </p>
              <div className="whitespace-pre-wrap leading-relaxed text-slate-800">{current.content}</div>
            </>
          ) : (
            <Highlighted content={base} findings={findings} active={active} onPick={setActive} />
          )}
        </div>
        {!preview && !needsEdit && findings.length > 0 && (
          <div className="flex flex-wrap gap-3 border-t border-slate-100 px-5 py-2.5 text-xs text-slate-500">
            <Legend cls="bg-red-100 decoration-red-500" label="High" />
            <Legend cls="bg-amber-100 decoration-amber-500" label="Medium" />
            <Legend cls="bg-sky-100 decoration-sky-500" label="Low" />
            <Legend cls="bg-emerald-100 decoration-emerald-500" label="Fixed" />
            <Legend cls="bg-orange-50 decoration-orange-400 decoration-dashed" label="Disputed" />
          </div>
        )}
      </section>

      {/* Right: findings + actions */}
      <aside className="grid content-start gap-3">
        {p.canReview && <ReviewPanel draftId={p.draft.id} counts={counts} run={run} pending={pending} />}

        {interactive && (
          <div className="card grid gap-2 p-4">
            <div className="flex items-center justify-between text-sm">
              <span>
                <strong className="tabular-nums">{counts.open}</strong> open · <span className="tabular-nums">{counts.fixed}</span> fixed ·{" "}
                <span className="tabular-nums">{counts.disputed}</span> disputed
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                className="btn-primary flex-1"
                disabled={pending || counts.open > 0}
                title={counts.open ? "Resolve every open finding first" : undefined}
                onClick={() => run(() => submitForReview(p.draft.id))}
              >
                {pending ? "Working…" : "Send for review"}
              </button>
              <button
                className="btn-secondary"
                disabled={pending || counts.fixed === 0}
                title="Apply your fixes as a new version and check it again"
                onClick={() => run(() => recheck(p.draft.id))}
              >
                Apply fixes & re-check
              </button>
            </div>
          </div>
        )}

        {needsEdit && (
          <div className="card p-4 text-sm">
            <button
              className="btn-primary w-full"
              onClick={() => {
                setEditText(current.content);
                setEditing(true);
              }}
            >
              Edit text and re-check
            </button>
          </div>
        )}

        {findings.length > 0 && (
          <div className="flex gap-1 text-xs">
            {(["all", "open", "resolved"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={cx("rounded-full px-2.5 py-1 font-medium capitalize", filter === f ? "bg-ink text-white" : "bg-white text-slate-600 ring-1 ring-slate-200")}
              >
                {f}
              </button>
            ))}
          </div>
        )}

        {findings.length === 0 && checked && (
          <div className="card p-6 text-center">
            <div className="text-3xl">✓</div>
            <p className="mt-2 font-medium">No problems found</p>
            <p className="mt-1 text-sm text-slate-500">Nothing in this draft breaks the Brand Kit{checked.ai_checked ? "" : " rule checks"}.</p>
          </div>
        )}

        {shown.map((f) => (
          <FindingCard
            key={f.id}
            f={f}
            active={active === f.id}
            onFocus={() => setActive(f.id)}
            interactive={interactive}
            run={run}
            pending={pending}
            sourceDetail={p.sources[f.rule_id ?? f.term_id ?? f.fact_id ?? ""]}
          />
        ))}
      </aside>
    </div>
  );
}

function Legend({ cls, label }: { cls: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={cx("inline-block h-3 w-5 rounded-sm underline decoration-2", cls)} /> {label}
    </span>
  );
}

const SEV_MARK = {
  high: "bg-red-100 decoration-red-500",
  medium: "bg-amber-100 decoration-amber-500",
  low: "bg-sky-100 decoration-sky-500",
};

function Highlighted({
  content,
  findings,
  active,
  onPick,
}: {
  content: string;
  findings: Finding[];
  active: string | null;
  onPick: (id: string) => void;
}) {
  const parts: React.ReactNode[] = [];
  let cursor = 0;
  const sorted = [...findings].sort((a, b) => a.start_idx - b.start_idx || b.end_idx - a.end_idx);
  for (const f of sorted) {
    if (f.start_idx < cursor) continue; // overlapping span: shown in the list, not double-highlighted
    if (f.start_idx > cursor) parts.push(content.slice(cursor, f.start_idx));
    const cls =
      f.status === "open"
        ? SEV_MARK[f.severity]
        : f.status === "disputed"
          ? "bg-orange-50 decoration-orange-400 decoration-dashed"
          : "bg-emerald-100 decoration-emerald-500";
    parts.push(
      <mark
        key={f.id}
        id={`mark-${f.id}`}
        onClick={() => {
          onPick(f.id);
          document.getElementById(`finding-${f.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
        }}
        className={cx(
          "cursor-pointer rounded-sm px-0.5 text-inherit underline decoration-2 underline-offset-4",
          cls,
          active === f.id && "ring-2 ring-brand-500",
        )}
        title={f.source_label}
      >
        {content.slice(f.start_idx, f.end_idx)}
      </mark>,
    );
    cursor = f.end_idx;
  }
  parts.push(content.slice(cursor));
  return <div className="whitespace-pre-wrap leading-[1.9] text-slate-800">{parts}</div>;
}

function FindingCard({
  f,
  active,
  onFocus,
  interactive,
  run,
  pending,
  sourceDetail,
}: {
  f: Finding;
  active: boolean;
  onFocus: () => void;
  interactive: boolean;
  run: (fn: () => Promise<{ error?: string } | { ok: boolean } | undefined>) => void;
  pending: boolean;
  sourceDetail?: string;
}) {
  const [mode, setMode] = useState<null | "edit" | "dispute">(null);
  const [text, setText] = useState(f.suggestion || f.quote);
  const [reason, setReason] = useState("");
  const [showSource, setShowSource] = useState(false);

  return (
    <article
      id={`finding-${f.id}`}
      onClick={() => {
        onFocus();
        document.getElementById(`mark-${f.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
      }}
      className={cx("card p-4 transition", active && "ring-2 ring-brand-500", f.status !== "open" && "bg-slate-50/60")}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <SeverityBadge severity={f.severity} />
          <CategoryBadge category={f.category} />
        </div>
        <FindingStatusTag status={f.status} />
      </div>

      <p className="mt-2 text-sm">
        <span className="rounded bg-red-50 px-1 text-red-800 line-through decoration-red-300">{f.quote}</span>
      </p>
      <p className="mt-2 text-sm text-slate-700">{f.explanation}</p>

      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setShowSource((s) => !s);
        }}
        className="mt-2 inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700 hover:bg-slate-200"
        aria-expanded={showSource}
      >
        <span aria-hidden>📎</span> {f.source_label}
        <span className="text-slate-400">· {f.engine === "ai" ? "AI, verified" : "rule match"}</span>
      </button>
      {showSource && sourceDetail && (
        <blockquote className="mt-2 border-l-2 border-slate-300 pl-3 text-xs text-slate-600">{sourceDetail}</blockquote>
      )}

      {f.status === "open" && f.suggestion && (
        <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm">
          <span className="text-xs font-medium uppercase tracking-wide text-emerald-700">Suggested fix</span>
          <p className="text-emerald-900">{f.suggestion || <em>(remove)</em>}</p>
        </div>
      )}
      {f.status === "open" && !f.suggestion && (
        <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">No automatic fix for this one — use Edit to write your own wording.</p>
      )}
      {(f.status === "accepted" || f.status === "edited") && (
        <p className="mt-3 text-sm">
          <span className="text-xs font-medium uppercase tracking-wide text-emerald-700">Replaced with</span>
          <span className="block rounded bg-emerald-50 px-1 text-emerald-900">{f.resolution_text || <em>(removed)</em>}</span>
        </p>
      )}
      {f.status === "disputed" && (
        <p className="mt-3 rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 text-sm text-orange-900">
          <span className="text-xs font-medium uppercase tracking-wide">Author disagrees</span>
          <span className="block">{f.dispute_reason}</span>
        </p>
      )}

      {interactive && (
        <div className="mt-3" onClick={(e) => e.stopPropagation()}>
          {f.status === "open" && mode === null && (
            <div className="flex flex-wrap gap-2">
              <button
                className="btn-success btn-sm"
                disabled={pending || !f.suggestion}
                onClick={() => run(() => resolveFinding(f.id, "accept"))}
              >
                Accept fix
              </button>
              <button className="btn-secondary btn-sm" disabled={pending} onClick={() => setMode("edit")}>
                Edit
              </button>
              <button className="btn-ghost btn-sm" disabled={pending} onClick={() => setMode("dispute")}>
                Dispute
              </button>
            </div>
          )}
          {mode === "edit" && (
            <div className="grid gap-2">
              <label className="text-xs font-medium text-slate-600" htmlFor={`edit-${f.id}`}>
                Replace “{f.quote.length > 40 ? f.quote.slice(0, 40) + "…" : f.quote}” with:
              </label>
              <textarea id={`edit-${f.id}`} className="input text-sm" rows={2} value={text} onChange={(e) => setText(e.target.value)} />
              <div className="flex gap-2">
                <button
                  className="btn-primary btn-sm"
                  disabled={pending}
                  onClick={() =>
                    run(async () => {
                      const r = await resolveFinding(f.id, "edit", text);
                      if (r && "ok" in r) setMode(null);
                      return r;
                    })
                  }
                >
                  Use this wording
                </button>
                <button className="btn-ghost btn-sm" onClick={() => setMode(null)}>
                  Cancel
                </button>
              </div>
            </div>
          )}
          {mode === "dispute" && (
            <div className="grid gap-2">
              <label className="text-xs font-medium text-slate-600" htmlFor={`dispute-${f.id}`}>
                Why is this not a problem? The reviewer sees your reason.
              </label>
              <textarea
                id={`dispute-${f.id}`}
                className="input text-sm"
                rows={2}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. This is a quote from a customer review, not our claim."
              />
              <div className="flex gap-2">
                <button
                  className="btn-primary btn-sm"
                  disabled={pending || !reason.trim()}
                  onClick={() =>
                    run(async () => {
                      const r = await resolveFinding(f.id, "dispute", reason);
                      if (r && "ok" in r) setMode(null);
                      return r;
                    })
                  }
                >
                  Record dispute
                </button>
                <button className="btn-ghost btn-sm" onClick={() => setMode(null)}>
                  Cancel
                </button>
              </div>
            </div>
          )}
          {f.status !== "open" && (
            <button className="btn-ghost btn-sm mt-1" disabled={pending} onClick={() => run(() => resolveFinding(f.id, "reopen"))}>
              Undo
            </button>
          )}
        </div>
      )}
    </article>
  );
}

function ReviewPanel({
  draftId,
  counts,
  run,
  pending,
}: {
  draftId: string;
  counts: { open: number; fixed: number; disputed: number };
  run: (fn: () => Promise<{ error?: string } | { ok: boolean } | undefined>) => void;
  pending: boolean;
}) {
  const [comment, setComment] = useState("");
  return (
    <div className="card grid gap-3 border-violet-200 p-4 ring-1 ring-violet-100">
      <h2 className="font-semibold">Your review</h2>
      <ul className="text-sm text-slate-600">
        <li>
          {counts.fixed} fix{counts.fixed === 1 ? "" : "es"} applied by the author
        </li>
        <li className={counts.disputed ? "font-medium text-orange-700" : ""}>
          {counts.disputed} disputed finding{counts.disputed === 1 ? "" : "s"} — your call
        </li>
      </ul>
      <textarea
        className="input text-sm"
        rows={3}
        placeholder="Comment for the author (required when requesting changes)"
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        aria-label="Review comment"
      />
      <div className="flex gap-2">
        <button className="btn-success flex-1" disabled={pending} onClick={() => run(() => reviewDecision(draftId, "approve", comment))}>
          Approve
        </button>
        <button className="btn-secondary flex-1" disabled={pending} onClick={() => run(() => reviewDecision(draftId, "changes", comment))}>
          Request changes
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function DiffView({ from, to }: { from: string; to: string }) {
  const parts = diffWords(from, to);
  return (
    <div className="whitespace-pre-wrap leading-[1.9] text-slate-800">
      {parts.map((part, i) =>
        part.added ? (
          <ins key={i} className="rounded-sm bg-emerald-100 px-0.5 text-emerald-900 no-underline">
            {part.value}
          </ins>
        ) : part.removed ? (
          <del key={i} className="rounded-sm bg-red-100 px-0.5 text-red-800">
            {part.value}
          </del>
        ) : (
          <span key={i}>{part.value}</span>
        ),
      )}
    </div>
  );
}

function ChangesTab({ versions, current, checked }: { versions: DraftVersion[]; current: DraftVersion; checked: DraftVersion | null }) {
  const sorted = [...versions].sort((a, b) => a.version_no - b.version_no);
  const [fromNo, setFromNo] = useState(sorted[0].version_no);
  const [toNo, setToNo] = useState(current.version_no);
  const from = sorted.find((v) => v.version_no === fromNo)!;
  const to = sorted.find((v) => v.version_no === toNo)!;
  return (
    <section className="card">
      <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-5 py-3 text-sm">
        <span className="text-slate-600">Compare</span>
        <select className="rounded-md border border-slate-300 px-2 py-1" value={fromNo} onChange={(e) => setFromNo(+e.target.value)}>
          {sorted.map((v) => (
            <option key={v.id} value={v.version_no}>
              v{v.version_no} — {v.note || "version"}
            </option>
          ))}
        </select>
        <span className="text-slate-400">→</span>
        <select className="rounded-md border border-slate-300 px-2 py-1" value={toNo} onChange={(e) => setToNo(+e.target.value)}>
          {sorted.map((v) => (
            <option key={v.id} value={v.version_no}>
              v{v.version_no} — {v.note || "version"}
            </option>
          ))}
        </select>
        {checked && checked.id !== current.id && (
          <button className="btn-ghost btn-sm" onClick={() => (setFromNo(checked.version_no), setToNo(current.version_no))}>
            Checked → submitted
          </button>
        )}
      </div>
      <div className="px-5 py-4">
        {from.id === to.id ? <p className="text-sm text-slate-500">Pick two different versions to see what changed.</p> : <DiffView from={from.content} to={to.content} />}
      </div>
    </section>
  );
}

function HistoryTab({
  versions,
  findings,
  people,
}: {
  versions: DraftVersion[];
  findings: Finding[];
  people: Record<string, { full_name: string }>;
}) {
  const [open, setOpen] = useState<string | null>(versions[0]?.id ?? null);
  return (
    <section className="grid gap-3">
      {versions.map((v) => {
        const fs = findings.filter((f) => f.version_id === v.id);
        return (
          <div key={v.id} className="card">
            <button className="flex w-full items-center justify-between gap-4 px-5 py-3 text-left" onClick={() => setOpen(open === v.id ? null : v.id)} aria-expanded={open === v.id}>
              <span>
                <strong>Version {v.version_no}</strong> <span className="text-sm text-slate-500">· {v.note}</span>
              </span>
              <span className="text-xs text-slate-500">
                {v.checked ? `${fs.length} finding${fs.length === 1 ? "" : "s"}` : "not checked"} · {people[v.created_by]?.full_name} · {timeAgo(v.created_at)}
              </span>
            </button>
            {open === v.id && <div className="whitespace-pre-wrap border-t border-slate-100 px-5 py-4 text-sm leading-relaxed text-slate-800">{v.content}</div>}
          </div>
        );
      })}
    </section>
  );
}

const ACTION_LABEL: Record<string, string> = {
  created: "created the draft",
  checked: "ran the brand check",
  finding_accepted: "accepted a fix",
  finding_edited: "edited a fix",
  finding_disputed: "disputed a finding",
  submitted: "sent it for review",
  approved: "approved it",
  changes_requested: "requested changes",
  comment: "commented",
};

function ActivityTab({
  events,
  people,
  draftId,
  run,
  pending,
}: {
  events: Event[];
  people: Record<string, { full_name: string; role: Role }>;
  draftId: string;
  run: (fn: () => Promise<{ error?: string } | { ok: boolean } | undefined>) => void;
  pending: boolean;
}) {
  const [comment, setComment] = useState("");
  return (
    <section className="grid gap-4 lg:grid-cols-[1fr_360px]">
      <ol className="card divide-y divide-slate-100">
        {events.map((e) => {
          const who = e.actor_id ? people[e.actor_id] : null;
          return (
            <li key={e.id} className="flex gap-3 px-5 py-3 text-sm">
              <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-slate-300" />
              <div className="min-w-0 flex-1">
                <p>
                  <strong>{who?.full_name ?? "System"}</strong> {who && <RoleBadge role={who.role} />} {ACTION_LABEL[e.action] ?? e.action}
                  {e.version_no ? <span className="text-slate-500"> · v{e.version_no}</span> : null}
                </p>
                {e.detail && <p className="mt-0.5 text-slate-600">{e.detail}</p>}
              </div>
              <time className="shrink-0 text-xs text-slate-400" dateTime={e.created_at} title={new Date(e.created_at).toLocaleString()}>
                {timeAgo(e.created_at)}
              </time>
            </li>
          );
        })}
      </ol>
      <div className="card grid content-start gap-2 p-4">
        <label className="text-sm font-medium" htmlFor="comment">
          Add a comment
        </label>
        <textarea id="comment" className="input text-sm" rows={3} value={comment} onChange={(e) => setComment(e.target.value)} />
        <button
          className="btn-secondary"
          disabled={pending || !comment.trim()}
          onClick={() =>
            run(async () => {
              const r = await addComment(draftId, comment);
              if (r && "ok" in r) setComment("");
              return r;
            })
          }
        >
          Post comment
        </button>
      </div>
    </section>
  );
}
