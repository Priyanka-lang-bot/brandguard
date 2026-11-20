import type { BrandKit, Candidate, Category, Rule, Severity } from "../types";
import { fixContrast, hexToRgb, isNeutral, nearestColor, relativeLuminance, rgbToHex } from "./color";
import type { LogoMeasurement, MeasuredColor, RegionContrast } from "./analyze";
import { DEFAULT_MIN_CONTRAST, LOGO_RECOLOUR_DELTA_E, LOGO_STRETCH_LIMIT } from "./thresholds";

/** Stored in draft_images.analysis. Re-used on every re-check, so the image is analysed only once. */
export interface ImageAnalysis {
  version: 1;
  width: number;
  height: number;
  palette: MeasuredColor[];
  textBlocks: { text: string; box: { x: number; y: number; w: number; h: number } }[];
  contrast: RegionContrast[];
  extractedText: string;
  aiAltText: string | null;
  logo: {
    checked: boolean;
    present: boolean;
    matchedLogoId: string | null;
    confidence: string;
    note: string;
    box?: { x: number; y: number; w: number; h: number } | null;
    /** Measured by sharp against the matched reference logo file. */
    measured?: LogoMeasurement | null;
  } | null;
  ai: { ran: boolean; error: string | null };
  /** "seed" when text regions came from a demo image's own design rather than the AI. */
  textSource?: "ai" | "seed";
}

export interface ImageRecord {
  id: string;
  file_name: string;
  alt_text: string;
  analysis: ImageAnalysis | null;
}

/** Off-palette threshold (CIEDE2000) and the minimum share of the image a colour must cover to be reported. */
export const OFF_PALETTE_DELTA_E = 10;
export const MIN_COLOR_SHARE = 0.05;

const GENERIC_ALT = /^(image|img|photo|picture|pic|graphic|banner|poster|screenshot|logo|icon|untitled|design|creative|visual)s?\s*\d*$/i;

/** Missing or weak alt text. Returns the problem, or null when the alt text looks adequate. */
export function altTextProblem(alt: string, fileName: string): "missing" | "weak" | null {
  const a = alt.trim();
  if (!a) return "missing";
  const base = fileName.replace(/\.[a-z0-9]+$/i, "").toLowerCase();
  const words = a.split(/\s+/).filter(Boolean);
  if (GENERIC_ALT.test(a)) return "weak";
  if (/\.(png|jpe?g|gif|webp)\b/i.test(a)) return "weak";
  if (a.toLowerCase() === base || a.toLowerCase().replace(/[\s_-]+/g, "") === base.replace(/[\s_-]+/g, "")) return "weak";
  if (/^(an?\s+)?(image|picture|photo|graphic)\s+of\b/i.test(a) && words.length < 6) return "weak";
  if (a.length < 15 || words.length < 3) return "weak";
  return null;
}

interface SourceRef {
  source_type: Candidate["source_type"];
  source_id: string;
  label: string;
  category: Category;
  severity: Severity;
  description: string | null;
}

/**
 * The Brand Kit rule that drives an image check (marked with check_key). As with text findings, an image finding
 * must cite a real Brand Kit rule: if the workspace has no active rule for a check, that check raises nothing.
 */
export function sourceFor(kit: BrandKit, key: "palette" | "contrast" | "alt_text" | "logo"): SourceRef | null {
  const rule: Rule | undefined = kit.rules.find((r) => r.status === "active" && r.check_key === key);
  if (!rule) return null;
  return { source_type: "rule", source_id: rule.id, label: `${rule.code} · ${rule.title}`, category: rule.category, severity: rule.severity, description: rule.description };
}

/** Which image checks are switched off because the Brand Kit has no rule for them. */
export function missingImageRules(kit: BrandKit): ("palette" | "contrast" | "alt_text" | "logo")[] {
  return (["palette", "contrast", "alt_text", "logo"] as const).filter((k) => !sourceFor(kit, k));
}

/** Required contrast for a text region: the WCAG 2.2 AA level for its size, raised to the brand minimum if higher. */
export function requiredContrast(large: boolean, kit: Pick<BrandKit, "minContrast">): number {
  const wcag = large ? 3 : 4.5;
  return Math.max(wcag, kit.minContrast ?? DEFAULT_MIN_CONTRAST);
}

const imageCandidate = (src: SourceRef, image_id: string, c: Pick<Candidate, "quote" | "explanation" | "suggestion"> & { severity?: Severity }): Candidate => ({
  category: src.category,
  severity: c.severity ?? src.severity,
  quote: c.quote,
  start: 0,
  end: 0,
  source_type: src.source_type,
  source_id: src.source_id,
  source_label: src.label,
  explanation: c.explanation,
  suggestion: c.suggestion,
  engine: "rules",
  image_id,
});

/**
 * Findings for one image from its stored analysis, its current alt text and the current Brand Kit.
 * Deterministic: palette and contrast are measured values; AI only supplied text regions, alt-text
 * suggestion and logo match (each grounded before it was stored).
 */
export function imageFindings(img: ImageRecord, kit: BrandKit): Candidate[] {
  const out: Candidate[] = [];
  const a = img.analysis;

  // Alt text (works without AI; AI only supplies the suggested wording).
  const problem = altTextProblem(img.alt_text, img.file_name);
  const altSrc = sourceFor(kit, "alt_text");
  if (problem && altSrc) {
    const src = altSrc;
    out.push(
      imageCandidate(src, img.id, {
        quote: problem === "missing" ? "(no alt text)" : img.alt_text,
        explanation:
          problem === "missing"
            ? "This image has no alternative text, so screen-reader users get nothing. Describe what it shows and any essential text in it."
            : "The alt text is too generic to describe the image. Say what it shows and include any essential text in it.",
        suggestion: a?.aiAltText ?? "",
      }),
    );
  }
  if (!a) return out;

  // Palette.
  const palette = kit.colors ?? [];
  const paletteSrc = sourceFor(kit, "palette");
  if (palette.length && paletteSrc) {
    const src = paletteSrc;
    for (const c of a.palette) {
      if (c.share < MIN_COLOR_SHARE || isNeutral(c.hex)) continue;
      const near = nearestColor(c.hex, palette);
      if (!near || near.deltaE <= OFF_PALETTE_DELTA_E) continue;
      out.push(
        imageCandidate(src, img.id, {
          quote: `${c.hex} · ${Math.round(c.share * 100)}% of the image`,
          explanation: `${c.hex} is not in the Brand Kit palette (ΔE ${near.deltaE.toFixed(1)} from the nearest brand colour, limit ${OFF_PALETTE_DELTA_E}). The nearest approved colour is ${near.color.name} ${near.color.hex.toUpperCase()}.`,
          suggestion: `Use ${near.color.name} ${near.color.hex.toUpperCase()}`,
        }),
      );
    }
  }

  // Text-on-image contrast (WCAG 2.2 AA).
  const contrastSrc = sourceFor(kit, "contrast");
  if (contrastSrc) {
    const src = contrastSrc;
    for (const measured of a.contrast) {
      const r = { ...measured, required: requiredContrast(measured.large, kit) };
      if (r.ratio >= r.required) continue;
      const fixed = fixContrast(hexToRgb(r.fg), hexToRgb(r.bg), r.required);
      const snippet = r.text.length > 80 ? r.text.slice(0, 80) + "…" : r.text;
      out.push(
        imageCandidate(src, img.id, {
          quote: snippet.replace(/\n/g, " "),
          explanation: `Measured contrast ${r.ratio.toFixed(2)}:1 (text ${r.fg} on ${r.bg}). The required minimum is ${r.required}:1 (WCAG 2.2 AA: ${r.large ? "3" : "4.5"}:1 for ${r.large ? "large" : "normal-size"} text; brand minimum: ${kit.minContrast ?? DEFAULT_MIN_CONTRAST}:1).`,
          suggestion: fixed
            ? `Use a text colour of ${rgbToHex(fixed)} or ${relativeLuminance(fixed) < relativeLuminance(hexToRgb(r.fg)) ? "darker" : "lighter"} (reaches ${r.required}:1 on ${r.bg})`
            : `Change the background behind this text so it reaches ${r.required}:1`,
        }),
      );
    }
  }

  // Logo presence and version.
  const logos = kit.logos ?? [];
  const logoSrc = sourceFor(kit, "logo");
  if (logos.length && a.logo?.checked && logoSrc) {
    const src = logoSrc;
    const current = logos.find((l) => l.is_current);
    const matched = a.logo.matchedLogoId ? logos.find((l) => l.id === a.logo!.matchedLogoId) : null;
    if (!a.logo.present) {
      out.push(
        imageCandidate(src, img.id, {
          quote: "(no Brand Kit logo found)",
          explanation: "None of the logos in the Brand Kit was found in this image.",
          suggestion: current ? `Add the ${current.name} logo (version ${current.version})` : "Add the current logo",
          severity: "low",
        }),
      );
    } else if (matched && !matched.is_current) {
      out.push(
        imageCandidate(src, img.id, {
          quote: `${matched.name} · version ${matched.version}`,
          explanation: `The image uses an outdated logo version ("${matched.version}").${a.logo.note ? ` ${a.logo.note}` : ""}`,
          suggestion: current ? `Replace it with ${current.name} (version ${current.version})` : "Replace it with the current logo",
        }),
      );
    }
    // Misuse of a recognised logo, from measurements against its reference file (not from the model's opinion).
    const m = a.logo.present ? a.logo.measured : null;
    const name = matched ? `${matched.name} · version ${matched.version}` : "Logo";
    if (m && Math.abs(m.stretch - 1) > LOGO_STRETCH_LIMIT) {
      const pctChange = Math.round((m.stretch - 1) * 100);
      out.push(
        imageCandidate(src, img.id, {
          quote: `${name} · proportions ${pctChange > 0 ? "+" : ""}${pctChange}%`,
          explanation: `The logo is ${pctChange > 0 ? "stretched horizontally" : "squashed horizontally"}: its width-to-height ratio is ${m.aspect.toFixed(2)} in the image versus ${m.refAspect.toFixed(2)} in the Brand Kit file (limit ±${Math.round(LOGO_STRETCH_LIMIT * 100)}%).`,
          suggestion: "Scale the logo proportionally (lock the aspect ratio)",
        }),
      );
    }
    if (m && m.deltaE !== null && m.deltaE > LOGO_RECOLOUR_DELTA_E) {
      out.push(
        imageCandidate(src, img.id, {
          quote: `${name} · colour ${m.color}`,
          explanation: `The logo has been recoloured: its main colour is ${m.color} in the image versus ${m.refColor} in the Brand Kit file (ΔE ${m.deltaE}, limit ${LOGO_RECOLOUR_DELTA_E}).`,
          suggestion: `Use the logo in its original colour ${m.refColor}`,
        }),
      );
    }
  }
  return out;
}

/** Tag text findings made on the image's extracted text so they display against the image. */
export function tagImageTextFindings(found: Candidate[], image_id: string): Candidate[] {
  return found.map((f) => ({ ...f, image_id, explanation: `Text in the image: ${f.explanation}` }));
}
