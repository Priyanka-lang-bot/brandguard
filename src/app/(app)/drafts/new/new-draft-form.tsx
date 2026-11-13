"use client";

import { useActionState, useRef, useState } from "react";
import { createDraft } from "@/app/actions/drafts";

const CHANNELS = ["Blog", "Instagram", "LinkedIn", "X / Twitter", "Email", "Website", "Press release", "Ad copy"];

const SAMPLES = [
  {
    label: "Launch post with errors",
    title: "Offline mode launch post",
    channel: "LinkedIn",
    purpose: "Announce offline mode and push free sign-ups.",
    content: `Big news!! Lumeo now works offline on Android and iPhone, so you can revise anywhere — even on the train.

We're proud to be the best study app in India, trusted by over 2 lakh users. The free plan includes 5 study plans and unlimited flash cards, and Lumio Pro is just ₹149/month.

Lumio Live, our 1:1 tutoring, launches in December. Click here to join the waitlist.`,
  },
  {
    label: "Clean, on-brand copy",
    title: "Weekend revision tip",
    channel: "Instagram",
    purpose: "Share a study tip and remind learners about flashcards.",
    content: `Got 20 minutes this weekend? Pick one chapter, turn the key ideas into flashcards and test yourself twice.

Small, regular revision beats one long night before the exam. Your free Lumio plan includes up to 3 study plans and 200 flashcards — enough to try it today.`,
  },
];

export function NewDraftForm() {
  const [state, action, pending] = useActionState(createDraft, null);
  const [mode, setMode] = useState<"paste" | "upload">("paste");
  const form = useRef<HTMLFormElement>(null);

  const fill = (s: (typeof SAMPLES)[number]) => {
    const f = form.current!;
    (f.elements.namedItem("title") as HTMLInputElement).value = s.title;
    (f.elements.namedItem("channel") as HTMLSelectElement).value = s.channel;
    (f.elements.namedItem("purpose") as HTMLInputElement).value = s.purpose;
    setMode("paste");
    setTimeout(() => {
      (f.elements.namedItem("content") as HTMLTextAreaElement).value = s.content;
    });
  };

  return (
    <form ref={form} action={action} className="card mt-6 grid gap-5 p-6">
      <div className="flex flex-wrap items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm">
        <span className="text-slate-600">No content handy? Try a sample:</span>
        {SAMPLES.map((s) => (
          <button key={s.label} type="button" onClick={() => fill(s)} className="btn-secondary btn-sm">
            {s.label}
          </button>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-[1fr_200px]">
        <div>
          <label className="label" htmlFor="title">Title</label>
          <input id="title" name="title" required className="input" placeholder="e.g. Exam season Instagram caption" />
        </div>
        <div>
          <label className="label" htmlFor="channel">Channel</label>
          <select id="channel" name="channel" className="input" defaultValue="Blog">
            {CHANNELS.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className="label" htmlFor="purpose">What is this piece for?</label>
        <input
          id="purpose"
          name="purpose"
          className="input"
          placeholder="e.g. Get students preparing for exams to try the free plan"
        />
        <p className="mt-1 text-xs text-slate-500">Suggested fixes are written to keep this purpose intact.</p>
      </div>

      <div>
        <div className="mb-2 flex gap-1 rounded-lg bg-slate-100 p-1 text-sm" role="tablist">
          {(["paste", "upload"] as const).map((m) => (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={mode === m}
              onClick={() => setMode(m)}
              className={`flex-1 rounded-md px-3 py-1.5 font-medium ${mode === m ? "bg-white shadow-xs" : "text-slate-600"}`}
            >
              {m === "paste" ? "Paste text" : "Upload a file (.docx, .pdf, .txt)"}
            </button>
          ))}
        </div>
        {mode === "paste" ? (
          <textarea
            name="content"
            rows={12}
            className="input font-[inherit] leading-relaxed"
            placeholder="Paste your draft here…"
          />
        ) : (
          <div className="rounded-lg border-2 border-dashed border-slate-300 p-6 text-center">
            <input name="file" type="file" accept=".docx,.pdf,.txt,.md" className="text-sm" aria-label="Upload a file" />
            <p className="mt-2 text-xs text-slate-500">Up to 4 MB. Text is extracted; the original layout is not checked yet.</p>
          </div>
        )}
      </div>

      {state?.error && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </p>
      )}

      <div className="flex items-center justify-end gap-3">
        {pending && <span className="text-sm text-slate-500">Checking against the Brand Kit… this takes a few seconds.</span>}
        <button className="btn-primary" disabled={pending}>
          {pending ? "Checking…" : "Check draft"}
        </button>
      </div>
    </form>
  );
}
