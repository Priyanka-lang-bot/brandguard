"use client";

import { useRef, useState } from "react";
import { addImage, removeImage } from "@/app/actions/drafts";
import { cx } from "@/components/ui";
import { isNeutral, nearestColor } from "@/lib/images/color";
import { MIN_COLOR_SHARE, OFF_PALETTE_DELTA_E, type ImageAnalysis } from "@/lib/images/findings";
import type { BrandColor, Finding } from "@/lib/types";

export interface DraftImageView {
  id: string;
  file_name: string;
  alt_text: string;
  url: string | null;
  width: number | null;
  height: number | null;
  analysis: ImageAnalysis | null;
}

type Run = (fn: () => Promise<{ error?: string } | { ok: boolean } | undefined>) => void;

export function ImagePanels({
  images,
  findings,
  palette,
  editable,
  draftId,
  run,
  pending,
  onPickFinding,
  enabled,
}: {
  images: DraftImageView[];
  findings: Finding[];
  palette: BrandColor[];
  editable: boolean;
  draftId: string;
  run: Run;
  pending: boolean;
  onPickFinding: (id: string) => void;
  enabled: boolean;
}) {
  if (!enabled) return null;
  if (!images.length && !editable) return null;
  return (
    <section className="grid gap-4" aria-label="Images">
      {images.map((img) => (
        <ImagePanel
          key={img.id}
          img={img}
          findings={findings.filter((f) => f.image_id === img.id)}
          palette={palette}
          editable={editable}
          run={run}
          pending={pending}
          onPickFinding={onPickFinding}
        />
      ))}
      {editable && images.length < 4 && <AddImage draftId={draftId} run={run} pending={pending} />}
    </section>
  );
}

function ImagePanel({
  img,
  findings,
  palette,
  editable,
  run,
  pending,
  onPickFinding,
}: {
  img: DraftImageView;
  findings: Finding[];
  palette: BrandColor[];
  editable: boolean;
  run: Run;
  pending: boolean;
  onPickFinding: (id: string) => void;
}) {
  const a = img.analysis;
  const [showText, setShowText] = useState(false);
  const open = findings.filter((f) => f.status === "open").length;
  return (
    <article id={`image-${img.id}`} className="card overflow-hidden">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-5 py-3">
        <div className="min-w-0 text-sm">
          <span className="mr-1" aria-hidden>🖼</span>
          <strong className="break-all">{img.file_name}</strong>
          {img.width && img.height && <span className="text-dim"> · {img.width}×{img.height}</span>}
          <span className="text-mute"> · {findings.length} finding{findings.length === 1 ? "" : "s"}{open ? `, ${open} open` : ""}</span>
        </div>
        {editable && (
          <button
            className="btn-ghost btn-sm"
            disabled={pending}
            onClick={() => {
              if (confirm(`Remove ${img.file_name}? The draft is checked again without it.`)) run(() => removeImage(img.id));
            }}
          >
            Remove
          </button>
        )}
      </header>
      <div className="grid gap-5 p-5 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <figure className="relative self-start overflow-hidden rounded-lg border border-line bg-surface-2">
          {img.url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={img.url} alt={img.alt_text} className="block h-auto w-full" />
          ) : (
            <div className="grid aspect-video place-items-center text-sm text-mute">Preview unavailable</div>
          )}
          {a?.contrast.map((c, i) => {
            const fail = c.ratio < c.required;
            return (
              <span
                key={i}
                className={cx("absolute rounded-sm border-2", fail ? "border-red-500 bg-red-500/10" : "border-emerald-400/70")}
                style={{ left: `${c.box.x * 100}%`, top: `${c.box.y * 100}%`, width: `${c.box.w * 100}%`, height: `${c.box.h * 100}%` }}
                title={`${c.ratio.toFixed(2)}:1 (needs ${c.required}:1)`}
              >
                <span className={cx("absolute -top-5 left-0 rounded px-1 text-[10px] font-bold text-white", fail ? "bg-red-600" : "bg-emerald-600")}>
                  {c.ratio.toFixed(1)}:1
                </span>
              </span>
            );
          })}
        </figure>

        <div className="grid content-start gap-4 text-sm">
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-mute">Alt text</h3>
            <p className={cx("mt-1", img.alt_text ? "text-soft" : "italic text-amber-300")}>{img.alt_text || "None provided"}</p>
          </div>

          {a && (
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-mute">Dominant colours (measured)</h3>
              <ul className="mt-2 grid gap-1.5">
                {a.palette.slice(0, 6).map((c) => {
                  const near = nearestColor(c.hex, palette);
                  const counted = c.share >= MIN_COLOR_SHARE && !isNeutral(c.hex);
                  const off = palette.length > 0 && counted && near !== null && near.deltaE > OFF_PALETTE_DELTA_E;
                  return (
                    <li key={c.hex} className="flex items-center gap-2">
                      <span className="h-5 w-5 shrink-0 rounded ring-1 ring-white/20" style={{ background: c.hex }} />
                      <code className="text-xs">{c.hex}</code>
                      <span className="text-xs text-dim">{Math.round(c.share * 100)}%</span>
                      {palette.length > 0 && near && (
                        <span className={cx("ml-auto text-xs", off ? "font-medium text-red-300" : "text-dim")}>
                          {off ? `off-palette · nearest ${near.color.name}` : !counted ? (isNeutral(c.hex) ? "neutral" : "minor") : `≈ ${near.color.name}`}
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
              {!palette.length && <p className="mt-1 text-xs text-dim">No palette in the Brand Kit yet, so colours are not compared.</p>}
            </div>
          )}

          {a && a.contrast.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-mute">Text contrast (WCAG 2.2 AA)</h3>
              <ul className="mt-2 grid gap-1">
                {a.contrast.map((c, i) => (
                  <li key={i} className="flex items-baseline gap-2 text-xs">
                    <span className={cx("w-14 shrink-0 font-semibold tabular-nums", c.ratio < c.required ? "text-red-300" : "text-emerald-300")}>
                      {c.ratio.toFixed(2)}:1
                    </span>
                    <span className="truncate text-soft">{c.text.replace(/\n/g, " ")}</span>
                    <span className="ml-auto shrink-0 text-dim">needs {c.required}:1</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {a?.logo && (
            <p className="text-xs text-mute">
              <strong className="text-soft">Logo:</strong>{" "}
              {!a.logo.checked ? "no logos in the Brand Kit to compare against" : a.logo.present ? `Brand Kit logo found (${a.logo.confidence} confidence)` : "no Brand Kit logo found"}
            </p>
          )}

          {a?.extractedText && (
            <div>
              <button className="text-xs font-medium text-brand-300 hover:underline" onClick={() => setShowText((s) => !s)} aria-expanded={showText}>
                {showText ? "Hide" : "Show"} text found in the image
              </button>
              {showText && <pre className="mt-2 whitespace-pre-wrap rounded-lg bg-surface-2 p-3 font-sans text-xs text-soft">{a.extractedText}</pre>}
            </div>
          )}

          {a && a.textSource === "seed" && (
            <p className="rounded-lg bg-sky-500/10 px-3 py-2 text-xs text-sky-200">
              Demo image: its text regions come from the poster&apos;s own design file, because demo data is seeded without the AI. Contrast was
              measured from the pixels. Upload your own image to see the AI vision check.
            </p>
          )}
          {a && !a.ai.ran && a.textSource !== "seed" && (
            <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
              The vision check did not run ({a.ai.error ?? "not requested"}). Palette and alt text were checked. Text in the image, contrast and logo were not.
            </p>
          )}

          {findings.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {findings.map((f) => (
                <button
                  key={f.id}
                  onClick={() => onPickFinding(f.id)}
                  className={cx(
                    "rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset",
                    f.status === "open" ? "bg-red-500/10 text-red-300 ring-red-500/30" : f.status === "disputed" ? "bg-orange-500/10 text-orange-300 ring-orange-500/30" : "bg-emerald-500/10 text-emerald-300 ring-emerald-500/30",
                  )}
                >
                  {f.source_label.split(" · ")[0]}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </article>
  );
}

function AddImage({ draftId, run, pending }: { draftId: string; run: Run; pending: boolean }) {
  const form = useRef<HTMLFormElement>(null);
  const [name, setName] = useState("");
  return (
    <form
      ref={form}
      className="card grid gap-3 border-dashed p-5 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(form.current!);
        run(async () => {
          const r = await addImage(draftId, fd);
          if (r && "ok" in r) {
            form.current?.reset();
            setName("");
          }
          return r;
        });
      }}
    >
      <div>
        <label className="label" htmlFor="add-image">Add an image (PNG or JPG, up to 4 MB)</label>
        <input id="add-image" name="images" type="file" accept="image/png,image/jpeg" required onChange={(e) => setName(e.target.files?.[0]?.name ?? "")} className="text-sm" />
      </div>
      <div>
        <label className="label" htmlFor="add-image-alt">Alt text</label>
        <input id="add-image-alt" name="image_alt" className="input" placeholder="Describe what the image shows" />
      </div>
      <button className="btn-secondary" disabled={pending || !name}>
        {pending ? "Checking…" : "Add & check"}
      </button>
    </form>
  );
}
