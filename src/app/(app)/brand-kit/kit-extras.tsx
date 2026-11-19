"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { deleteColor, deleteConfidential, deleteLogo, saveColor, saveConfidential, setLogoCurrent, uploadLogo } from "@/app/actions/kit";
import type { BrandColor, BrandLogo, ConfidentialEntry } from "@/lib/types";

type Result = { ok?: boolean; error?: string } | undefined;
type RunFn = (fn: () => Promise<Result>, after?: () => void) => void;

const KIND_LABEL: Record<ConfidentialEntry["kind"], string> = {
  term: "Confidential term",
  unreleased_product: "Unreleased product",
  pattern: "Custom pattern (regex)",
};

export function SchemaNotice() {
  return (
    <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-800">
      This section needs the database update in <code>supabase/migrations/0002_final_round.sql</code>. Run it once in the Supabase SQL editor
      and reload this page.
    </p>
  );
}

export function VisualTab({
  colors,
  logos,
  logoUrls,
  isAdmin,
  run,
  pending,
}: {
  colors: BrandColor[];
  logos: BrandLogo[];
  logoUrls: Record<string, string>;
  isAdmin: boolean;
  run: RunFn;
  pending: boolean;
}) {
  const [c, setC] = useState({ name: "", hex: "#" });
  return (
    <div className="grid gap-6">
      <section>
        <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-mute">Palette</h2>
        <p className="mb-3 text-sm text-mute">
          Image checks measure each image&apos;s dominant colours and flag any colour covering 5% or more of the image that is more than ΔE 10
          (CIEDE2000) from every colour here. Near-white and near-black neutrals are always allowed.
        </p>
        <div className="card divide-y divide-line">
          {colors.length === 0 && <p className="px-5 py-4 text-sm text-mute">No colours yet, so images are not compared against a palette.</p>}
          {colors.map((col) => (
            <div key={col.id} className="flex items-center gap-3 px-5 py-3">
              <span className="h-8 w-8 rounded-md ring-1 ring-ink/15" style={{ background: col.hex }} />
              <span className="font-medium">{col.name}</span>
              <code className="text-xs text-mute">{col.hex}</code>
              {isAdmin && (
                <button className="btn-ghost btn-sm ml-auto text-red-700" disabled={pending} onClick={() => confirm(`Remove ${col.name}?`) && run(() => deleteColor(col.id))}>
                  Remove
                </button>
              )}
            </div>
          ))}
        </div>
        {isAdmin && (
          <form
            className="mt-3 flex flex-wrap items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              run(() => saveColor(c), () => setC({ name: "", hex: "#" }));
            }}
          >
            <div>
              <label className="label" htmlFor="color-name">Name</label>
              <input id="color-name" className="input w-44" value={c.name} onChange={(e) => setC({ ...c, name: e.target.value })} placeholder="Indigo" />
            </div>
            <div>
              <label className="label" htmlFor="color-hex">Hex</label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  aria-label="Pick colour"
                  className="h-9 w-10 cursor-pointer rounded border border-line-strong bg-transparent"
                  value={/^#[0-9a-f]{6}$/i.test(c.hex) ? c.hex : "#5568f2"}
                  onChange={(e) => setC({ ...c, hex: e.target.value.toUpperCase() })}
                />
                <input id="color-hex" className="input w-32 font-mono" value={c.hex} onChange={(e) => setC({ ...c, hex: e.target.value })} />
              </div>
            </div>
            <button className="btn-primary" disabled={pending}>Add colour</button>
          </form>
        )}
      </section>

      <section>
        <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-mute">Logos</h2>
        <p className="mb-3 text-sm text-mute">
          Upload every version you want BrandGuard to recognise. Mark retired versions as not current: an image using one is flagged, and so is
          an image with no logo at all. Logo matching uses the AI vision check.
        </p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {logos.length === 0 && <p className="card px-5 py-4 text-sm text-mute sm:col-span-2 lg:col-span-3">No logos yet, so logo checks are skipped.</p>}
          {logos.map((l) => (
            <div key={l.id} className="card flex flex-col gap-3 p-4">
              <div className="grid h-28 place-items-center rounded-lg bg-white">
                {logoUrls[l.storage_path] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={logoUrls[l.storage_path]} alt={`${l.name} logo, version ${l.version}`} className="max-h-24 max-w-[80%] object-contain" />
                ) : (
                  <span className="text-xs text-slate-500">No preview</span>
                )}
              </div>
              <div>
                <p className="font-medium">{l.name}</p>
                <p className="text-xs text-mute">
                  Version {l.version} · {l.is_current ? <span className="text-emerald-800">current</span> : <span className="text-amber-800">retired</span>}
                </p>
              </div>
              {isAdmin && (
                <div className="flex gap-1">
                  <button className="btn-ghost btn-sm" disabled={pending} onClick={() => run(() => setLogoCurrent(l.id, !l.is_current))}>
                    Mark {l.is_current ? "retired" : "current"}
                  </button>
                  <button className="btn-ghost btn-sm ml-auto text-red-700" disabled={pending} onClick={() => confirm(`Delete ${l.name} (${l.version})?`) && run(() => deleteLogo(l.id))}>
                    Delete
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
        {isAdmin && <LogoUpload />}
      </section>
    </div>
  );
}

function LogoUpload() {
  const [state, action, pending] = useActionState(uploadLogo, null);
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok) form.current?.reset();
  }, [state]);
  return (
    <form ref={form} action={action} className="card mt-3 grid gap-3 p-4 sm:grid-cols-[1.2fr_1fr_0.8fr_auto_auto] sm:items-end">
      <div>
        <label className="label" htmlFor="logo-file">Logo file (PNG or JPG)</label>
        <input id="logo-file" name="file" type="file" accept="image/png,image/jpeg" required className="text-sm" />
      </div>
      <div>
        <label className="label" htmlFor="logo-name">Name</label>
        <input id="logo-name" name="name" required className="input" placeholder="Lumio shield" />
      </div>
      <div>
        <label className="label" htmlFor="logo-version">Version</label>
        <input id="logo-version" name="version" className="input" placeholder="2026" />
      </div>
      <label className="flex items-center gap-2 pb-2 text-sm">
        <input type="checkbox" name="is_current" defaultChecked /> Current
      </label>
      <button className="btn-primary" disabled={pending}>{pending ? "Uploading…" : "Upload"}</button>
      {state?.error && <p role="alert" className="text-sm text-red-700 sm:col-span-5">{state.error}</p>}
    </form>
  );
}

export function ConfidentialTab({ entries, isAdmin, run, pending }: { entries: ConfidentialEntry[]; isAdmin: boolean; run: RunFn; pending: boolean }) {
  const [v, setV] = useState({ term: "", kind: "term", note: "" });
  return (
    <div className="grid gap-4">
      <div className="card p-5 text-sm text-soft">
        <p>
          Before any text is sent to the AI, BrandGuard replaces <strong>email addresses</strong>, <strong>phone numbers</strong> and every entry
          below with a placeholder such as <code className="rounded bg-surface-2 px-1">[[PRODUCT_1_k3f9q2]]</code>. The real values are put back
          in the quotes and fixes you see. They never reach the AI provider and are not written to application logs.
        </p>
        <p className="mt-2 text-mute">Entries match whole words, ignoring case. Patterns are JavaScript regular expressions, also matched ignoring case.</p>
      </div>
      <div className="card divide-y divide-line">
        {entries.length === 0 && <p className="px-5 py-4 text-sm text-mute">No confidential terms yet. Emails and phone numbers are still masked.</p>}
        {entries.map((e) => (
          <div key={e.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
            <code className="rounded bg-surface-2 px-2 py-0.5 text-sm">{e.term}</code>
            <span className="text-xs text-mute">{KIND_LABEL[e.kind]}</span>
            {e.note && <span className="text-xs text-dim">· {e.note}</span>}
            {isAdmin && (
              <button className="btn-ghost btn-sm ml-auto text-red-700" disabled={pending} onClick={() => confirm(`Remove “${e.term}”?`) && run(() => deleteConfidential(e.id))}>
                Remove
              </button>
            )}
          </div>
        ))}
      </div>
      {isAdmin && (
        <form
          className="card grid gap-3 p-4 sm:grid-cols-[1.4fr_1fr_1.2fr_auto] sm:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            run(() => saveConfidential(v), () => setV({ term: "", kind: v.kind, note: "" }));
          }}
        >
          <div>
            <label className="label" htmlFor="conf-term">{v.kind === "pattern" ? "Pattern" : "Term"}</label>
            <input id="conf-term" className={`input ${v.kind === "pattern" ? "font-mono text-xs" : ""}`} value={v.term} onChange={(e) => setV({ ...v, term: e.target.value })} placeholder={v.kind === "pattern" ? "PRJ-\\d{4}" : "Project Falcon"} />
          </div>
          <div>
            <label className="label" htmlFor="conf-kind">Type</label>
            <select id="conf-kind" className="input" value={v.kind} onChange={(e) => setV({ ...v, kind: e.target.value })}>
              {Object.entries(KIND_LABEL).map(([k, l]) => (
                <option key={k} value={k}>{l}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="conf-note">Note (optional)</label>
            <input id="conf-note" className="input" value={v.note} onChange={(e) => setV({ ...v, note: e.target.value })} />
          </div>
          <button className="btn-primary" disabled={pending}>Add</button>
        </form>
      )}
    </div>
  );
}
