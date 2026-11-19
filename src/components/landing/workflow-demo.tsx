"use client";

import { useState } from "react";

/**
 * Scripted walkthrough of the BrandGuard flow with fixed sample content.
 * It is a front-end illustration only — nothing here calls the checker.
 */

type Sev = "high" | "medium" | "low";
type Part = string | { id: string; original: string; fix: string; code: string; sev: Sev; why: string };

const SAMPLE: Part[] = [
  "Big news",
  { id: "a", original: "!!", fix: "!", code: "TONE-2", sev: "low", why: "One exclamation mark per piece at most." },
  " ",
  { id: "b", original: "Lumeo", fix: "Lumio", code: "TERM-1", sev: "medium", why: "Our name is always written “Lumio”." },
  " now works offline ",
  { id: "c", original: "on Android and iPhone", fix: "on Android", code: "FACT-5", sev: "high", why: "Fact Vault: offline mode is Android-only; iOS has no date." },
  ". We're ",
  { id: "d", original: "the best study app in India", fix: "a study app built for Indian students", code: "CLAIM-1", sev: "high", why: "No independent ranking supports a superlative." },
  ", and ",
  { id: "e", original: "Lumio Pro is just ₹149/month", fix: "Lumio Plus is ₹199/month", code: "FACT-1", sev: "high", why: "Plan is “Lumio Plus”, priced ₹199/month (valid to Mar 2027)." },
  ". ",
  { id: "f", original: "Click here", fix: "Download Lumio", code: "ACC-1", sev: "medium", why: "Link text must say where it goes." },
  " to start.",
];

const STEPS = [
  { key: "draft", label: "Draft", title: "A creator writes or uploads a draft", note: "Paste text or upload DOCX, PDF or TXT. PNG/JPG images can go alongside it." },
  { key: "analyse", label: "Analyse", title: "Rules first, then a grounded AI pass", note: "Exact rule and terminology checks run first. Then the AI pass gets the Brand Kit as citable codes, with sensitive values masked." },
  { key: "issues", label: "Identify issues", title: "Every finding quotes the exact words", note: "Each one cites a real Brand Kit source. Findings that cite nothing, or quote text that isn't in the draft, are thrown away." },
  { key: "fixes", label: "Suggest fixes", title: "Minimal fixes that keep the meaning", note: "Each suggestion replaces only the flagged words, and only with facts that are in the Fact Vault." },
  { key: "review", label: "Human review", title: "Accept, edit or dispute, each one", note: "The creator decides on every finding. Disputes keep their reason and go to the reviewer." },
  { key: "approve", label: "Approval", title: "A reviewer signs it off", note: "Only a reviewer or admin can approve. Every version and decision stays in the history." },
] as const;

const SEV_CLS: Record<Sev, string> = {
  high: "bg-proof/15 decoration-proof",
  medium: "bg-marker/70 decoration-[#b08900]",
  low: "bg-sky-200/70 decoration-sky-600",
};

export function WorkflowDemo() {
  const [step, setStep] = useState(0);
  const key = STEPS[step].key;
  const findings = SAMPLE.filter((p): p is Exclude<Part, string> => typeof p !== "string");
  const disputed = "f";

  return (
    <div className="grid gap-6 lg:grid-cols-[300px_minmax(0,1fr)] lg:gap-10">
      <ol className="grid gap-1 self-start" role="tablist" aria-label="Workflow steps">
        {STEPS.map((s, i) => (
          <li key={s.key}>
            <button
              type="button"
              role="tab"
              aria-selected={i === step}
              aria-controls="demo-panel"
              onClick={() => setStep(i)}
              className={`group flex w-full items-baseline gap-4 rounded-xl px-4 py-3 text-left transition ${
                i === step ? "bg-ink text-paper" : "text-ink-soft hover:bg-ink/5"
              }`}
            >
              <span className="kicker opacity-60">{String(i + 1).padStart(2, "0")}</span>
              <span className="display-tight text-2xl sm:text-3xl">{s.label}</span>
            </button>
          </li>
        ))}
      </ol>

      <div id="demo-panel" role="tabpanel" aria-live="polite" className="clipping relative overflow-hidden rounded-2xl">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-ink/10 px-5 py-3">
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-proof/70" />
            <span className="h-2.5 w-2.5 rounded-full bg-marker" />
            <span className="h-2.5 w-2.5 rounded-full bg-approve/70" />
            <span className="ml-2 text-sm font-semibold">Offline mode launch post · LinkedIn</span>
          </div>
          <span className="kicker rounded-full bg-ink/5 px-2.5 py-1 text-ink-soft">Scripted demo · sample data</span>
        </div>

        <div className="grid gap-6 p-5 sm:p-7 md:grid-cols-[minmax(0,1fr)_240px]">
          <div>
            <h3 className="font-serif text-3xl leading-tight sm:text-4xl">{STEPS[step].title}</h3>
            <p className="mt-2 max-w-xl text-[15px] text-ink-soft">{STEPS[step].note}</p>

            <div className="relative mt-6 rounded-xl border border-ink/10 bg-paper/60 p-5 text-[17px] leading-[2.1]">
              {key === "analyse" && (
                <div className="pointer-events-none absolute inset-x-0 top-0 h-full overflow-hidden rounded-xl" aria-hidden>
                  <div className="h-10 w-full animate-[scan_1.6s_ease-in-out_infinite] bg-gradient-to-b from-transparent via-brand-500/20 to-transparent" />
                </div>
              )}
              {SAMPLE.map((p, i) => {
                if (typeof p === "string") return <span key={i}>{p}</span>;
                if (key === "draft" || key === "analyse") return <span key={i}>{p.original}</span>;
                const kept = key === "review" || key === "approve" ? p.id === disputed : false;
                if (key === "approve") return <span key={i} className={kept ? "" : "text-approve"}>{kept ? p.original : p.fix}</span>;
                if (key === "issues")
                  return (
                    <mark key={i} className={`rounded-sm px-0.5 text-inherit underline decoration-2 underline-offset-4 ${SEV_CLS[p.sev]}`} title={p.code}>
                      {p.original}
                    </mark>
                  );
                return (
                  <span key={i}>
                    {kept ? (
                      <mark className="rounded-sm bg-orange-100 px-0.5 text-inherit underline decoration-orange-400 decoration-dashed decoration-2 underline-offset-4">{p.original}</mark>
                    ) : (
                      <>
                        <del className="strike-proof text-ink-soft/70">{p.original}</del>{" "}
                        <ins className="rounded-sm bg-approve/15 px-0.5 text-approve no-underline">{p.fix}</ins>
                      </>
                    )}
                  </span>
                );
              })}
              {key === "approve" && (
                <span className="stamp absolute -right-2 bottom-3 bg-paper/80 px-3 py-1 text-xl text-approve sm:right-4">Approved · v3</span>
              )}
            </div>
          </div>

          <aside className="grid content-start gap-2 text-sm">
            {key === "draft" && <SideNote title="Purpose">Announce offline mode and push free sign-ups.</SideNote>}
            {key === "analyse" &&
              ["Terminology & patterns · exact", "AI pass · Brand Kit as codes", "Grounding gate · cite + quote", "Merge & de-duplicate"].map((t, i) => (
                <SideNote key={t} title={`Stage ${i + 1}`}>{t}</SideNote>
              ))}
            {(key === "issues" || key === "fixes") &&
              findings.map((f) => (
                <div key={f.id} className="rounded-lg border border-ink/10 bg-white/70 px-3 py-2">
                  <div className="flex items-center justify-between">
                    <code className="text-[11px] font-bold">{f.code}</code>
                    <span className={`kicker ${f.sev === "high" ? "text-proof" : f.sev === "medium" ? "text-[#8a6d00]" : "text-sky-700"}`}>{f.sev}</span>
                  </div>
                  <p className="mt-0.5 text-[13px] leading-snug text-ink-soft">{f.why}</p>
                </div>
              ))}
            {key === "review" && (
              <>
                <SideNote title="Creator">5 fixes accepted · 1 disputed</SideNote>
                <div className="rounded-lg border border-orange-300 bg-orange-50 px-3 py-2 text-[13px]">
                  <strong className="kicker text-orange-700">Dispute · ACC-1</strong>
                  <p className="mt-1 text-ink-soft">“It&apos;s the label on an in-app button, not link text.”</p>
                </div>
                <SideNote title="Reviewer">Reads the dispute and decides.</SideNote>
              </>
            )}
            {key === "approve" && (
              <>
                <SideNote title="Reviewer · Riya">Approved, dispute accepted.</SideNote>
                <SideNote title="Audit trail">v1 checked → v2 fixes → v3 approved</SideNote>
              </>
            )}
          </aside>
        </div>

        <div className="flex items-center justify-between border-t border-ink/10 px-5 py-3">
          <button type="button" className="text-sm font-semibold text-ink-soft disabled:opacity-30" disabled={step === 0} onClick={() => setStep((s) => s - 1)}>
            ← Back
          </button>
          <div className="flex gap-1.5" aria-hidden>
            {STEPS.map((s, i) => (
              <span key={s.key} className={`h-1.5 rounded-full transition-all ${i === step ? "w-6 bg-ink" : "w-1.5 bg-ink/20"}`} />
            ))}
          </div>
          <button
            type="button"
            className="rounded-full bg-ink px-4 py-1.5 text-sm font-semibold text-paper disabled:opacity-30"
            disabled={step === STEPS.length - 1}
            onClick={() => setStep((s) => s + 1)}
          >
            Next step →
          </button>
        </div>
      </div>
    </div>
  );
}

function SideNote({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-ink/10 bg-white/70 px-3 py-2">
      <div className="kicker text-ink-soft/70">{title}</div>
      <div className="mt-0.5 text-[13px] leading-snug">{children}</div>
    </div>
  );
}
