"use client";

import { useActionState } from "react";
import { saveInsightSettings } from "@/app/actions/insights";

export function SettingsForm({ threshold, minFindings }: { threshold: number; minFindings: number }) {
  const [state, action, pending] = useActionState(saveInsightSettings, null);
  return (
    <form action={action} className="flex flex-wrap items-end gap-3">
      <div>
        <label className="label" htmlFor="threshold">Dispute threshold (%)</label>
        <input id="threshold" name="threshold" type="number" min={1} max={100} step={1} defaultValue={Math.round(threshold * 100)} className="input w-32" />
      </div>
      <div>
        <label className="label" htmlFor="min_findings">Minimum findings</label>
        <input id="min_findings" name="min_findings" type="number" min={1} step={1} defaultValue={minFindings} className="input w-32" />
      </div>
      <button className="btn-secondary" disabled={pending}>{pending ? "Saving…" : "Save"}</button>
      {state?.error && <p role="alert" className="text-sm text-red-300">{state.error}</p>}
      {state?.ok && <p className="text-sm text-emerald-300">Saved.</p>}
    </form>
  );
}
