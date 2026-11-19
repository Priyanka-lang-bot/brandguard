"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Reveal } from "./reveal";

/**
 * Scroll-driven walkthrough of the BrandGuard flow, using fixed sample content.
 * Desktop (≥1024px wide and ≥700px tall): the section is a tall scroll track; the step list and the preview stay
 * pinned while the page scrolls, and the scroll position selects the step. Clicking a step scrolls to its segment,
 * so scroll and clicks can never disagree. Smaller screens get a plain vertical story with no sticky behaviour.
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
type StepKey = (typeof STEPS)[number]["key"];

const SEV_CLS: Record<Sev, string> = {
  high: "bg-proof/15 decoration-proof",
  medium: "bg-marker/70 decoration-[#b08900]",
  low: "bg-sky-200/70 decoration-sky-600",
};
const findings = SAMPLE.filter((p): p is Exclude<Part, string> => typeof p !== "string");
const DISPUTED = "f";
const STICKY_TOP = 84; // fixed site header height + breathing room
const STICKY_QUERY = "(min-width: 1024px) and (min-height: 700px)";

export function WorkflowDemo() {
  const [step, setStep] = useState(0);
  const [progress, setProgress] = useState(0);
  const [pinned, setPinned] = useState(false);
  const track = useRef<HTMLDivElement>(null);
  const lockUntil = useRef(0);
  const reduced = useRef(false);

  // Desktop sticky mode is decided by viewport size, re-evaluated on resize.
  useEffect(() => {
    const mq = window.matchMedia(STICKY_QUERY);
    const rm = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => {
      setPinned(mq.matches);
      reduced.current = rm.matches;
    };
    update();
    mq.addEventListener("change", update);
    rm.addEventListener("change", update);
    return () => {
      mq.removeEventListener("change", update);
      rm.removeEventListener("change", update);
    };
  }, []);

  /** Scroll distance the pinned view travels through the section. */
  const geometry = useCallback(() => {
    const el = track.current;
    if (!el) return null; // unmounted (e.g. navigating away) or not pinned
    const rect = el.getBoundingClientRect();
    const travel = Math.max(1, el.offsetHeight - (window.innerHeight - STICKY_TOP));
    return { rect, travel };
  }, []);

  // Scroll position → active step (rAF-throttled, so fast and reverse scrolling stay in sync).
  useEffect(() => {
    if (!pinned) return;
    let frame = 0;
    const read = () => {
      frame = 0;
      const g = geometry();
      if (!g) return;
      const { rect, travel } = g;
      const p = Math.min(0.9999, Math.max(0, (STICKY_TOP - rect.top) / travel));
      setProgress(p);
      if (Date.now() < lockUntil.current) return; // a click-initiated scroll is in flight
      setStep(Math.floor(p * STEPS.length));
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(read);
    };
    const onScrollEnd = () => {
      lockUntil.current = 0;
      read();
    };
    read();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    window.addEventListener("scrollend", onScrollEnd);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      window.removeEventListener("scrollend", onScrollEnd);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [pinned, geometry]);

  /** Click / keyboard / next-back: scroll to the middle of that step's segment (desktop) or just switch (mobile). */
  const goTo = useCallback(
    (i: number) => {
      const target = Math.max(0, Math.min(STEPS.length - 1, i));
      setStep(target);
      const g = pinned ? geometry() : null;
      if (!g) return;
      const { rect, travel } = g;
      const top = window.scrollY + rect.top - STICKY_TOP + ((target + 0.5) / STEPS.length) * travel;
      lockUntil.current = Date.now() + (reduced.current ? 0 : 1200);
      window.scrollTo({ top, behavior: reduced.current ? "auto" : "smooth" });
    },
    [pinned, geometry],
  );

  const onKey = (e: React.KeyboardEvent, i: number) => {
    if (e.key === "ArrowDown" || e.key === "ArrowRight") {
      e.preventDefault();
      goTo(i + 1);
      (e.currentTarget.parentElement?.nextElementSibling?.querySelector("button") as HTMLButtonElement | null)?.focus();
    } else if (e.key === "ArrowUp" || e.key === "ArrowLeft") {
      e.preventDefault();
      goTo(i - 1);
      (e.currentTarget.parentElement?.previousElementSibling?.querySelector("button") as HTMLButtonElement | null)?.focus();
    }
  };

  if (!pinned) return <MobileStory />;

  return (
    <div ref={track} className="relative" style={{ height: `${STEPS.length * 62 + 38}vh` }} data-testid="demo-track">
      <div className="sticky grid grid-cols-[300px_minmax(0,1fr)] gap-10" style={{ top: STICKY_TOP }}>
        <div className="self-start">
          <ol className="relative grid gap-1" aria-label="Workflow steps">
            {/* Progress rail */}
            <span aria-hidden className="absolute -left-4 top-2 bottom-2 w-[3px] rounded-full bg-ink/10">
              <span className="block w-full rounded-full bg-proof transition-[height] duration-150" style={{ height: `${progress * 100}%` }} />
            </span>
            {STEPS.map((s, i) => (
              <li key={s.key}>
                <button
                  type="button"
                  aria-current={i === step ? "step" : undefined}
                  aria-controls="demo-panel"
                  onClick={() => goTo(i)}
                  onKeyDown={(e) => onKey(e, i)}
                  className={`group flex w-full items-baseline gap-4 rounded-xl px-4 py-3 text-left transition-[background,color,transform] duration-300 ${
                    i === step ? "bg-ink text-paper" : i < step ? "text-ink hover:bg-ink/5" : "text-ink-soft/70 hover:bg-ink/5 hover:text-ink"
                  }`}
                >
                  <span className={`kicker ${i === step ? "text-marker" : "opacity-60"}`}>{String(i + 1).padStart(2, "0")}</span>
                  <span className="display-tight text-3xl">{s.label}</span>
                  {i < step && <span aria-hidden className="ml-auto text-sm text-approve">✓</span>}
                </button>
              </li>
            ))}
          </ol>
          <p className="kicker mt-6 pl-4 text-ink-soft/70">Scroll to step through · or pick a step</p>
        </div>
        <DemoPanel step={step} onPrev={() => goTo(step - 1)} onNext={() => goTo(step + 1)} />
      </div>
    </div>
  );
}

function DemoPanel({ step, onPrev, onNext }: { step: number; onPrev: () => void; onNext: () => void }) {
  return (
    <div id="demo-panel" aria-live="polite" className="clipping relative overflow-hidden rounded-2xl">
      <PanelHeader />
      <div key={step} className="demo-step-in">
        <DemoBody k={STEPS[step].key} />
      </div>
      <div className="flex items-center justify-between border-t border-ink/10 px-5 py-3">
        <button type="button" className="text-sm font-semibold text-ink-soft disabled:opacity-30" disabled={step === 0} onClick={onPrev}>
          ← Back
        </button>
        <div className="flex items-center gap-1.5" aria-label={`Step ${step + 1} of ${STEPS.length}`}>
          {STEPS.map((s, i) => (
            <span key={s.key} className={`h-1.5 rounded-full transition-all duration-300 ${i === step ? "w-6 bg-ink" : i < step ? "w-1.5 bg-ink/50" : "w-1.5 bg-ink/20"}`} />
          ))}
        </div>
        <button
          type="button"
          className="rounded-full bg-ink px-4 py-1.5 text-sm font-semibold text-paper disabled:opacity-30"
          disabled={step === STEPS.length - 1}
          onClick={onNext}
        >
          Next step →
        </button>
      </div>
    </div>
  );
}

function PanelHeader() {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-ink/10 px-5 py-3">
      <div className="flex items-center gap-2">
        <span className="h-2.5 w-2.5 rounded-full bg-proof/70" />
        <span className="h-2.5 w-2.5 rounded-full bg-marker" />
        <span className="h-2.5 w-2.5 rounded-full bg-approve/70" />
        <span className="ml-2 text-sm font-semibold">Offline mode launch post · LinkedIn</span>
      </div>
      <span className="kicker rounded-full bg-ink/5 px-2.5 py-1 text-ink-soft">Scripted demo · sample data</span>
    </div>
  );
}

/** Vertical, non-sticky version for phones, tablets and short screens. */
function MobileStory() {
  return (
    <ol className="grid gap-8" aria-label="Workflow steps">
      {STEPS.map((s, i) => (
        <li key={s.key}>
          <Reveal className="reveal">
          <div className="mb-3 flex items-baseline gap-3">
            <span className="kicker text-proof">{String(i + 1).padStart(2, "0")}</span>
            <h3 className="display-tight text-3xl">{s.label}</h3>
          </div>
          <div className="clipping overflow-hidden rounded-2xl">
            {i === 0 && <PanelHeader />}
            <DemoBody k={s.key} />
          </div>
          </Reveal>
        </li>
      ))}
    </ol>
  );
}

function DemoBody({ k }: { k: StepKey }) {
  const s = STEPS.find((x) => x.key === k)!;
  return (
    <div className="grid gap-6 p-5 sm:p-7 md:grid-cols-[minmax(0,1fr)_240px]">
      <div>
        <h3 className="font-serif text-3xl leading-tight sm:text-4xl">{s.title}</h3>
        <p className="mt-2 max-w-xl text-[15px] text-ink-soft">{s.note}</p>
        <div className="relative mt-6 rounded-xl border border-ink/10 bg-paper/60 p-5 text-[17px] leading-[2.1]">
          {k === "analyse" && (
            <div className="pointer-events-none absolute inset-x-0 top-0 h-full overflow-hidden rounded-xl" aria-hidden>
              <div className="h-10 w-full animate-[scan_1.6s_ease-in-out_infinite] bg-gradient-to-b from-transparent via-marker/50 to-transparent" />
            </div>
          )}
          {SAMPLE.map((p, i) => {
            if (typeof p === "string") return <span key={i}>{p}</span>;
            if (k === "draft" || k === "analyse") return <span key={i}>{p.original}</span>;
            const kept = (k === "review" || k === "approve") && p.id === DISPUTED;
            if (k === "approve") return <span key={i} className={kept ? "" : "text-approve"}>{kept ? p.original : p.fix}</span>;
            if (k === "issues")
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
          {k === "approve" && <span className="stamp demo-stamp absolute -right-2 bottom-3 bg-paper/80 px-3 py-1 text-xl text-approve sm:right-4">Approved · v3</span>}
        </div>
      </div>

      <aside className="grid content-start gap-2 text-sm">
        {k === "draft" && <SideNote title="Purpose">Announce offline mode and push free sign-ups.</SideNote>}
        {k === "analyse" &&
          ["Terminology & patterns · exact", "Mask emails, phones, confidential terms", "AI pass · Brand Kit as codes", "Grounding gate · cite + quote"].map((t, i) => (
            <SideNote key={t} title={`Stage ${i + 1}`}>{t}</SideNote>
          ))}
        {(k === "issues" || k === "fixes") &&
          findings.map((f) => (
            <div key={f.id} className="rounded-lg border border-ink/10 bg-white/70 px-3 py-2">
              <div className="flex items-center justify-between">
                <code className="text-[11px] font-bold">{f.code}</code>
                <span className={`kicker ${f.sev === "high" ? "text-proof" : f.sev === "medium" ? "text-[#8a6d00]" : "text-sky-700"}`}>{f.sev}</span>
              </div>
              <p className="mt-0.5 text-[13px] leading-snug text-ink-soft">{k === "fixes" ? <>→ <span className="text-approve">{f.fix}</span></> : f.why}</p>
            </div>
          ))}
        {k === "review" && (
          <>
            <SideNote title="Creator">5 fixes accepted · 1 disputed</SideNote>
            <div className="rounded-lg border border-orange-300 bg-orange-50 px-3 py-2 text-[13px]">
              <strong className="kicker text-orange-700">Dispute · ACC-1</strong>
              <p className="mt-1 text-ink-soft">“It&apos;s the label on an in-app button, not link text.”</p>
            </div>
            <SideNote title="Reviewer">Reads the dispute and decides.</SideNote>
          </>
        )}
        {k === "approve" && (
          <>
            <SideNote title="Reviewer · Riya">Approved, dispute accepted.</SideNote>
            <SideNote title="Audit trail">v1 checked → v2 fixes → v3 approved</SideNote>
          </>
        )}
      </aside>
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
