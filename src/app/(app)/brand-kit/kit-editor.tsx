"use client";

import { useActionState, useState, useTransition } from "react";
import {
  deleteFact,
  deleteRule,
  deleteTerm,
  importGuidelines,
  resetDemo,
  saveFact,
  saveRule,
  saveTerm,
  setRuleStatus,
} from "@/app/actions/kit";
import { CATEGORY_LABEL, cx, SeverityBadge } from "@/components/ui";
import type { BrandKit, Category, Fact, Rule, Term } from "@/lib/types";

type Result = { ok?: boolean; error?: string } | undefined;
const CATEGORIES = Object.keys(CATEGORY_LABEL) as Category[];

export function KitEditor({ kit, isAdmin, today, aiReady }: { kit: BrandKit; isAdmin: boolean; today: string; aiReady: boolean }) {
  const [tab, setTab] = useState<"rules" | "terms" | "facts" | "import">("rules");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<Result>, after?: () => void) => {
    setError(null);
    start(async () => {
      const r = await fn();
      if (r?.error) setError(r.error);
      else after?.();
    });
  };

  const pendingRules = kit.rules.filter((r) => r.status === "pending");
  const active = kit.rules.filter((r) => r.status === "active");
  const tabs = [
    { id: "rules" as const, label: `Rules (${active.length})` },
    { id: "terms" as const, label: `Terminology (${kit.terms.length})` },
    { id: "facts" as const, label: `Fact Vault (${kit.facts.length})` },
    ...(isAdmin ? [{ id: "import" as const, label: "Import guideline PDF" }] : []),
  ];

  return (
    <div className="grid gap-4">
      {pendingRules.length > 0 && (
        <PendingRules rules={pendingRules} isAdmin={isAdmin} run={run} pending={pending} />
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200">
        <div className="flex gap-1" role="tablist">
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
        {isAdmin && (
          <button
            className="btn-ghost btn-sm mb-1"
            disabled={pending}
            onClick={() => {
              if (confirm("Reset the demo? This restores the Lumio Brand Kit and the sample drafts. Drafts by the demo accounts are removed.")) {
                run(() => resetDemo(), () => location.reload());
              }
            }}
          >
            ↺ Reset demo data
          </button>
        )}
      </div>

      {error && (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">
          {error}
        </p>
      )}

      {tab === "rules" && <RulesTab rules={active} isAdmin={isAdmin} run={run} pending={pending} />}
      {tab === "terms" && <TermsTab terms={kit.terms} isAdmin={isAdmin} run={run} pending={pending} />}
      {tab === "facts" && <FactsTab facts={kit.facts} isAdmin={isAdmin} run={run} pending={pending} today={today} />}
      {tab === "import" && isAdmin && <ImportTab aiReady={aiReady} onDone={() => setTab("rules")} />}
    </div>
  );
}

type RunFn = (fn: () => Promise<Result>, after?: () => void) => void;

function PendingRules({ rules, isAdmin, run, pending }: { rules: Rule[]; isAdmin: boolean; run: RunFn; pending: boolean }) {
  return (
    <section className="card border-amber-200 bg-amber-50/50 p-5">
      <h2 className="font-semibold text-amber-900">
        {rules.length} rule{rules.length === 1 ? "" : "s"} waiting for approval
      </h2>
      <p className="text-sm text-amber-900/80">
        Extracted from an imported guideline document. They are not used in checks until an admin approves them.
      </p>
      <div className="mt-4 grid gap-3">
        {rules.map((r) => (
          <div key={r.id} className="rounded-lg border border-amber-200 bg-white p-4">
            <div className="flex flex-wrap items-center gap-2">
              <code className="text-xs font-semibold text-slate-500">{r.code}</code>
              <span className="text-xs text-slate-500">{CATEGORY_LABEL[r.category]}</span>
              <SeverityBadge severity={r.severity} />
              <span className="ml-auto text-xs text-slate-400">{r.source.replace("pdf:", "from ")}</span>
            </div>
            <p className="mt-1 font-medium">{r.title}</p>
            <p className="text-sm text-slate-600">{r.description}</p>
            {r.source_excerpt ? (
              <blockquote className="mt-2 border-l-2 border-amber-300 pl-3 text-xs italic text-slate-500">“{r.source_excerpt}”</blockquote>
            ) : (
              <p className="mt-2 text-xs text-amber-700">No exact source sentence was found in the document — check this one carefully.</p>
            )}
            {isAdmin && (
              <div className="mt-3 flex gap-2">
                <button className="btn-success btn-sm" disabled={pending} onClick={() => run(() => setRuleStatus(r.id, "active"))}>
                  Approve
                </button>
                <button className="btn-danger btn-sm" disabled={pending} onClick={() => run(() => deleteRule(r.id))}>
                  Reject
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

function RulesTab({ rules, isAdmin, run, pending }: { rules: Rule[]; isAdmin: boolean; run: RunFn; pending: boolean }) {
  const [editing, setEditing] = useState<Rule | "new" | null>(null);
  return (
    <div className="grid gap-4">
      {isAdmin && editing === null && (
        <div>
          <button className="btn-primary" onClick={() => setEditing("new")}>
            + Add rule
          </button>
        </div>
      )}
      {editing && <RuleForm rule={editing === "new" ? null : editing} run={run} pending={pending} onClose={() => setEditing(null)} />}
      {CATEGORIES.map((cat) => {
        const list = rules.filter((r) => r.category === cat);
        if (!list.length) return null;
        return (
          <section key={cat}>
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">{CATEGORY_LABEL[cat]}</h2>
            <div className="card divide-y divide-slate-100">
              {list.map((r) => (
                <div key={r.id} className="flex flex-wrap items-start gap-3 px-5 py-3">
                  <code className="mt-0.5 w-16 shrink-0 text-xs font-semibold text-slate-500">{r.code}</code>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{r.title}</span>
                      <SeverityBadge severity={r.severity} />
                    </div>
                    <p className="text-sm text-slate-600">{r.description}</p>
                    <p className="mt-1 text-xs text-slate-400">
                      {r.patterns.length ? `${r.patterns.length} exact pattern${r.patterns.length === 1 ? "" : "s"} + AI check` : "AI check"}
                      {r.source.startsWith("pdf:") && ` · imported ${r.source.replace("pdf:", "from ")}`}
                    </p>
                  </div>
                  {isAdmin && (
                    <div className="flex gap-1">
                      <button className="btn-ghost btn-sm" onClick={() => setEditing(r)}>
                        Edit
                      </button>
                      <button
                        className="btn-ghost btn-sm text-red-700"
                        disabled={pending}
                        onClick={() => confirm(`Delete ${r.code}?`) && run(() => deleteRule(r.id))}
                      >
                        Delete
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function RuleForm({ rule, run, pending, onClose }: { rule: Rule | null; run: RunFn; pending: boolean; onClose: () => void }) {
  const [v, setV] = useState({
    category: rule?.category ?? "tone",
    title: rule?.title ?? "",
    description: rule?.description ?? "",
    severity: rule?.severity ?? "medium",
    patterns: (rule?.patterns ?? []).join("\n"),
  });
  return (
    <div className="card grid gap-3 p-5">
      <h3 className="font-semibold">{rule ? `Edit ${rule.code}` : "New rule"}</h3>
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label className="label">Category</label>
          <select className="input" value={v.category} onChange={(e) => setV({ ...v, category: e.target.value as Category })}>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABEL[c]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Severity</label>
          <select className="input" value={v.severity} onChange={(e) => setV({ ...v, severity: e.target.value as Rule["severity"] })}>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
        </div>
        <div>
          <label className="label">Title</label>
          <input className="input" value={v.title} onChange={(e) => setV({ ...v, title: e.target.value })} />
        </div>
      </div>
      <div>
        <label className="label">What the rule says</label>
        <textarea className="input" rows={2} value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })} />
      </div>
      <div>
        <label className="label">Exact patterns (optional, one per line)</label>
        <textarea
          className="input font-mono text-xs"
          rows={3}
          value={v.patterns}
          onChange={(e) => setV({ ...v, patterns: e.target.value })}
          placeholder={"\\bguarantee(d)?\\b\n!{2,} => !"}
        />
        <p className="mt-1 text-xs text-slate-500">
          Regular expressions matched without case. Add <code>{" => replacement"}</code> to give an automatic fix. Rules without patterns are
          still checked by the AI.
        </p>
      </div>
      <div className="flex gap-2">
        <button className="btn-primary" disabled={pending} onClick={() => run(() => saveRule({ id: rule?.id, ...v }), onClose)}>
          Save rule
        </button>
        <button className="btn-ghost" onClick={onClose}>
          Cancel
        </button>
      </div>
    </div>
  );
}

function TermsTab({ terms, isAdmin, run, pending }: { terms: Term[]; isAdmin: boolean; run: RunFn; pending: boolean }) {
  const [editing, setEditing] = useState<Term | "new" | null>(null);
  const [v, setV] = useState({ preferred: "", banned: "", note: "" });
  const open = (t: Term | "new") => {
    setEditing(t);
    setV(t === "new" ? { preferred: "", banned: "", note: "" } : { preferred: t.preferred, banned: t.banned.join(", "), note: t.note });
  };
  return (
    <div className="grid gap-4">
      {isAdmin && editing === null && (
        <div>
          <button className="btn-primary" onClick={() => open("new")}>
            + Add term
          </button>
        </div>
      )}
      {editing && (
        <div className="card grid gap-3 p-5 sm:grid-cols-3">
          <div>
            <label className="label">Approved term</label>
            <input className="input" value={v.preferred} onChange={(e) => setV({ ...v, preferred: e.target.value })} />
          </div>
          <div>
            <label className="label">Replace these (comma-separated)</label>
            <input className="input" value={v.banned} onChange={(e) => setV({ ...v, banned: e.target.value })} />
          </div>
          <div>
            <label className="label">Note</label>
            <input className="input" value={v.note} onChange={(e) => setV({ ...v, note: e.target.value })} />
          </div>
          <div className="flex gap-2 sm:col-span-3">
            <button
              className="btn-primary"
              disabled={pending}
              onClick={() => run(() => saveTerm({ id: editing === "new" ? undefined : editing.id, ...v }), () => setEditing(null))}
            >
              Save term
            </button>
            <button className="btn-ghost" onClick={() => setEditing(null)}>
              Cancel
            </button>
          </div>
        </div>
      )}
      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-2.5 font-medium">Code</th>
              <th className="px-4 py-2.5 font-medium">Use</th>
              <th className="px-4 py-2.5 font-medium">Instead of</th>
              <th className="hidden px-4 py-2.5 font-medium md:table-cell">Note</th>
              {isAdmin && <th />}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {terms.map((t, i) => (
              <tr key={t.id}>
                <td className="px-4 py-3">
                  <code className="text-xs font-semibold text-slate-500">TERM-{i + 1}</code>
                </td>
                <td className="px-4 py-3 font-medium text-emerald-800">{t.preferred}</td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1">
                    {t.banned.map((b) => (
                      <span key={b} className="rounded bg-red-50 px-1.5 py-0.5 text-xs text-red-700 line-through">
                        {b}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="hidden px-4 py-3 text-slate-600 md:table-cell">{t.note}</td>
                {isAdmin && (
                  <td className="whitespace-nowrap px-4 py-3 text-right">
                    <button className="btn-ghost btn-sm" onClick={() => open(t)}>
                      Edit
                    </button>
                    <button className="btn-ghost btn-sm text-red-700" disabled={pending} onClick={() => confirm(`Delete "${t.preferred}"?`) && run(() => deleteTerm(t.id))}>
                      Delete
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function FactsTab({ facts, isAdmin, run, pending, today }: { facts: Fact[]; isAdmin: boolean; run: RunFn; pending: boolean; today: string }) {
  const [editing, setEditing] = useState<Fact | "new" | null>(null);
  const [v, setV] = useState({ topic: "", statement: "", valid_until: "" });
  const open = (f: Fact | "new") => {
    setEditing(f);
    setV(f === "new" ? { topic: "", statement: "", valid_until: "" } : { topic: f.topic, statement: f.statement, valid_until: f.valid_until ?? "" });
  };
  return (
    <div className="grid gap-4">
      <p className="text-sm text-slate-600">
        Approved, current facts. A draft that contradicts one — or uses an expired one as if it were current — is flagged and the fix uses the
        approved wording.
      </p>
      {isAdmin && editing === null && (
        <div>
          <button className="btn-primary" onClick={() => open("new")}>
            + Add fact
          </button>
        </div>
      )}
      {editing && (
        <div className="card grid gap-3 p-5 sm:grid-cols-[1fr_2fr_160px]">
          <div>
            <label className="label">Topic</label>
            <input className="input" value={v.topic} onChange={(e) => setV({ ...v, topic: e.target.value })} />
          </div>
          <div>
            <label className="label">Approved statement</label>
            <input className="input" value={v.statement} onChange={(e) => setV({ ...v, statement: e.target.value })} />
          </div>
          <div>
            <label className="label">Valid until</label>
            <input type="date" className="input" value={v.valid_until} onChange={(e) => setV({ ...v, valid_until: e.target.value })} />
          </div>
          <div className="flex gap-2 sm:col-span-3">
            <button
              className="btn-primary"
              disabled={pending}
              onClick={() => run(() => saveFact({ id: editing === "new" ? undefined : editing.id, ...v }), () => setEditing(null))}
            >
              Save fact
            </button>
            <button className="btn-ghost" onClick={() => setEditing(null)}>
              Cancel
            </button>
          </div>
        </div>
      )}
      <div className="card divide-y divide-slate-100">
        {facts.map((f) => {
          const expired = f.valid_until !== null && f.valid_until < today;
          return (
            <div key={f.id} className="flex flex-wrap items-start gap-3 px-5 py-3">
              <code className="mt-0.5 w-16 shrink-0 text-xs font-semibold text-slate-500">{f.code}</code>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{f.topic}</span>
                  {f.valid_until &&
                    (expired ? (
                      <span className="rounded bg-red-50 px-1.5 py-0.5 text-[11px] font-semibold text-red-700 ring-1 ring-red-200">
                        Expired {f.valid_until}
                      </span>
                    ) : (
                      <span className="text-xs text-slate-500">valid until {f.valid_until}</span>
                    ))}
                </div>
                <p className={cx("text-sm", expired ? "text-slate-400 line-through" : "text-slate-700")}>{f.statement}</p>
              </div>
              {isAdmin && (
                <div className="flex gap-1">
                  <button className="btn-ghost btn-sm" onClick={() => open(f)}>
                    Edit
                  </button>
                  <button className="btn-ghost btn-sm text-red-700" disabled={pending} onClick={() => confirm(`Delete ${f.code}?`) && run(() => deleteFact(f.id))}>
                    Delete
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ImportTab({ aiReady, onDone }: { aiReady: boolean; onDone: () => void }) {
  const [state, action, pending] = useActionState(importGuidelines, null);
  return (
    <form action={action} className="card grid gap-4 p-6">
      <div>
        <h2 className="font-semibold">Import a brand guideline document</h2>
        <p className="mt-1 text-sm text-slate-600">
          Upload your guideline PDF or DOCX. BrandGuard extracts individual, checkable rules and quotes the sentence each one came from. Nothing goes
          live until you approve each rule.
        </p>
      </div>
      {!aiReady && <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">The AI key isn&apos;t configured on this server, so import is unavailable.</p>}
      <input name="file" type="file" accept=".pdf,.docx,.txt,.md" required className="text-sm" aria-label="Guideline document" />
      {state?.error && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </p>
      )}
      {state?.ok && (
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {state.count} rules extracted and waiting for approval at the top of this page.{" "}
          <button type="button" className="underline" onClick={onDone}>
            Review them
          </button>
        </p>
      )}
      <div>
        <button className="btn-primary" disabled={pending || !aiReady}>
          {pending ? "Reading the document…" : "Extract rules"}
        </button>
      </div>
    </form>
  );
}
