// Image accuracy evaluation (Round 2 commitment: "a test set of 20 images with planted problems is caught at 85% or better").
//   npm run eval:images                 -> measurement mode (+ vision mode if GEMINI_API_KEY is set)
//   npm run eval:images -- --regenerate -> rebuild eval/images/*.png and manifest.json from the specs below (needs fonts)
//
// Modes
//   measurement: text regions and logo position/identity come from each image's design (as if perception were perfect).
//                Scores BrandGuard's own measurement and rule logic (palette, WCAG contrast, alt text, text rules on
//                image text, logo version / proportions / colour). It does NOT score the vision model.
//   vision:      the real Gemini vision call supplies text regions, alt-text suggestion and logo match/position, and
//                everything else runs as in production. Only runs with a real GEMINI_API_KEY.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import sharp from "sharp";
import { DEMO_COLORS, DEMO_FACTS, DEMO_RULES, DEMO_TERMS } from "../src/lib/demo-kit";
import { DEMO_LOGO_PNG, DEMO_RETIRED_LOGO_PNG } from "../src/lib/demo/embedded";
import { measureLogo, measurePalette, measureRegionContrast } from "../src/lib/images/analyze";
import { imageFindings, tagImageTextFindings, type ImageAnalysis } from "../src/lib/images/findings";
import { analyzeImage } from "../src/lib/images/pipeline";
import { runCheck } from "../src/lib/engine";
import type { BrandKit, BrandLogo, Candidate } from "../src/lib/types";

type Issue = "palette" | "contrast" | "alt_text" | "image_text" | "logo_missing" | "logo_retired" | "logo_stretched" | "logo_recoloured";
type Logo = "current" | "retired" | "stretched" | "recoloured" | "none";
interface Spec { id: string; headline: string; sub: string; subColor: string; band: string; base: string; logo: Logo; alt: string; expected: Issue[] }

const GOOD_ALT = "Lumio poster with a study tip headline, a short subline and the Lumio shield";
const LOW = "#C9CDD6"; // ≈1.6:1 on white
const MID = "#A0A4AE"; // ≈2.5:1 on white
const OK = "#3B3C45";
const OFF = ["#FF2E93", "#2BB673", "#F97316", "#14B8A6"];
const IND = "#5568F2", INK = "#0F172A", SUN = "#FFE14D";

const SPECS: Spec[] = [
  { id: "img01", headline: "Lumio Premium is here", sub: "Offer ends Sunday", subColor: LOW, band: OFF[0], base: IND, logo: "none", alt: "", expected: ["image_text", "contrast", "palette", "logo_missing", "alt_text"] },
  { id: "img02", headline: "Make flash cards fast", sub: "Ten a day is enough", subColor: OK, band: IND, base: INK, logo: "current", alt: "poster", expected: ["image_text", "alt_text"] },
  { id: "img03", headline: "Revise smarter tonight", sub: "Plan one chapter", subColor: LOW, band: OFF[1], base: INK, logo: "current", alt: GOOD_ALT, expected: ["contrast", "palette"] },
  { id: "img04", headline: "Plan your exam week", sub: "Start with maths", subColor: OK, band: IND, base: SUN, logo: "retired", alt: GOOD_ALT, expected: ["logo_retired"] },
  { id: "img05", headline: "Plan your exam week", sub: "Start with maths", subColor: OK, band: IND, base: INK, logo: "stretched", alt: GOOD_ALT, expected: ["logo_stretched"] },
  { id: "img06", headline: "Plan your exam week", sub: "Start with maths", subColor: OK, band: IND, base: INK, logo: "recoloured", alt: GOOD_ALT, expected: ["logo_recoloured"] },
  { id: "img07", headline: "The best way to revise", sub: "Try it free today", subColor: MID, band: IND, base: INK, logo: "current", alt: "", expected: ["image_text", "contrast", "alt_text"] },
  { id: "img08", headline: "Login to start today", sub: "Your plan is ready", subColor: OK, band: OFF[2], base: INK, logo: "none", alt: GOOD_ALT, expected: ["image_text", "palette", "logo_missing"] },
  { id: "img09", headline: "Guaranteed top marks", sub: "Join thousands", subColor: OK, band: IND, base: INK, logo: "retired", alt: "IMG_2041.png", expected: ["image_text", "logo_retired", "alt_text"] },
  { id: "img10", headline: "Revise smarter tonight", sub: "Plan one chapter", subColor: LOW, band: IND, base: INK, logo: "stretched", alt: GOOD_ALT, expected: ["contrast", "logo_stretched"] },
  { id: "img11", headline: "Revise smarter tonight", sub: "Plan one chapter", subColor: OK, band: OFF[3], base: INK, logo: "recoloured", alt: "banner", expected: ["palette", "logo_recoloured", "alt_text"] },
  { id: "img12", headline: "Lumio Pro is here", sub: "Every subject unlocked", subColor: OK, band: IND, base: INK, logo: "current", alt: GOOD_ALT, expected: ["image_text"] },
  { id: "img13", headline: "Plan your exam week", sub: "Start with maths", subColor: MID, band: OFF[0], base: SUN, logo: "current", alt: GOOD_ALT, expected: ["contrast", "palette"] },
  { id: "img14", headline: "Plan your exam week", sub: "Start with maths", subColor: OK, band: IND, base: INK, logo: "none", alt: "", expected: ["logo_missing", "alt_text"] },
  { id: "img15", headline: "Flash cards that work", sub: "Built for boards", subColor: OK, band: OFF[1], base: INK, logo: "stretched", alt: GOOD_ALT, expected: ["image_text", "palette", "logo_stretched"] },
  { id: "img16", headline: "Revise smarter tonight", sub: "Plan one chapter", subColor: LOW, band: IND, base: INK, logo: "retired", alt: "image", expected: ["contrast", "logo_retired", "alt_text"] },
  { id: "img17", headline: "Plan your exam week", sub: "Start with maths", subColor: OK, band: OFF[2], base: INK, logo: "recoloured", alt: GOOD_ALT, expected: ["palette", "logo_recoloured"] },
  { id: "img18", headline: "Our users love Lumio", sub: "Read their stories", subColor: OK, band: IND, base: INK, logo: "current", alt: "", expected: ["image_text", "alt_text"] },
  { id: "img19", headline: "Revise smarter tonight", sub: "Plan one chapter", subColor: MID, band: IND, base: INK, logo: "none", alt: GOOD_ALT, expected: ["contrast", "logo_missing"] },
  { id: "img20", headline: "Number one study app", sub: "Plan one chapter", subColor: OK, band: OFF[3], base: SUN, logo: "current", alt: "poster", expected: ["image_text", "palette", "alt_text"] },
  // Clean images: nothing planted, measure false positives.
  { id: "img21", headline: "Revise smarter tonight", sub: "Plan one chapter", subColor: OK, band: IND, base: INK, logo: "current", alt: GOOD_ALT, expected: [] },
  { id: "img22", headline: "Lumio Plus is here", sub: "Every subject unlocked", subColor: OK, band: IND, base: SUN, logo: "current", alt: GOOD_ALT, expected: [] },
  { id: "img23", headline: "Plan your exam week", sub: "Start with maths", subColor: INK, band: SUN, base: IND, logo: "current", alt: GOOD_ALT, expected: [] },
  { id: "img24", headline: "Make flashcards fast", sub: "Ten a day is enough", subColor: OK, band: IND, base: INK, logo: "current", alt: GOOD_ALT, expected: [] },
];

// Geometry (0–1000 coordinate space, matches Gemini's box_2d convention).
const HEAD_BOX: [number, number, number, number] = [60, 60, 180, 940];
const SUB_BOX: [number, number, number, number] = [230, 60, 300, 640];
const SHIELD = "M128 16 40 48v64c0 56 38 104 88 128 50-24 88-72 88-128V48z"; // spans x 40..216, y 16..240
function logoSvg(kind: Logo): { svg: string; box: [number, number, number, number] | null } {
  if (kind === "none") return { svg: "", box: null };
  if (kind === "retired") {
    // Retired badge: rounded square 200x200 at (760, 230)
    return { svg: `<rect x="760" y="230" width="200" height="200" rx="48" fill="#2F6FDE"/><text x="860" y="362" text-anchor="middle" font-family="DejaVu Sans, sans-serif" font-weight="700" font-size="96" fill="#FFFFFF">L</text>`, box: [230, 760, 430, 960] };
  }
  const sx = kind === "stretched" ? 1.0 : 0.8;
  const sy = 0.8;
  const x0 = kind === "stretched" ? 744 : 780;
  const fill = kind === "recoloured" ? "#E5432B" : IND;
  const w = 176 * sx, h = 224 * sy;
  const svg = `<g transform="translate(${x0 - 40 * sx}, ${230 - 16 * sy}) scale(${sx}, ${sy})"><path d="${SHIELD}" fill="${fill}"/></g>`;
  return { svg, box: [230, x0, Math.round(230 + h), Math.round(x0 + w)] };
}
// Stretched variant: sx 1.0 vs sy 0.8 → aspect 1.25× the reference.

async function render(s: Spec): Promise<Buffer> {
  const logo = logoSvg(s.logo);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="1000">
  <rect width="1000" height="1000" fill="#FFFFFF"/>
  <text x="70" y="150" font-family="DejaVu Sans, sans-serif" font-weight="700" font-size="70" textLength="850" lengthAdjust="spacingAndGlyphs" fill="${INK}">${s.headline}</text>
  <text x="70" y="285" font-family="DejaVu Sans, sans-serif" font-size="52" fill="${s.subColor}">${s.sub}</text>
  ${logo.svg}
  <rect x="0" y="480" width="1000" height="270" fill="${s.band}"/>
  <rect x="0" y="750" width="1000" height="250" fill="${s.base}"/>
</svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

const box = (b: [number, number, number, number]) => ({ x: b[1] / 1000, y: b[0] / 1000, w: (b[3] - b[1]) / 1000, h: (b[2] - b[0]) / 1000 });

const kit: BrandKit = {
  rules: DEMO_RULES.map((r) => ({ ...r, id: `rule:${r.code}`, patterns: [...r.patterns], status: "active" as const, source: "manual" })) as unknown as BrandKit["rules"],
  terms: DEMO_TERMS.map((t, i) => ({ ...t, id: `term:${i + 1}`, banned: [...t.banned] })),
  facts: DEMO_FACTS.map((f) => ({ ...f, id: `fact:${f.code}` })),
  colors: DEMO_COLORS.map((c, i) => ({ id: `color:${i}`, ...c })),
  logos: [
    { id: "logo:current", name: "Lumio shield", version: "2026", storage_path: "x", is_current: true },
    { id: "logo:retired", name: "Lumio badge", version: "2023 (retired)", storage_path: "y", is_current: false },
  ] as BrandLogo[],
  confidential: [],
  minContrast: 4.5,
};
const LOGO_FILES = { "logo:current": Buffer.from(DEMO_LOGO_PNG, "base64"), "logo:retired": Buffer.from(DEMO_RETIRED_LOGO_PNG, "base64") } as Record<string, Buffer>;

function classify(f: Candidate): Issue | null {
  const code = f.source_label.split(" · ")[0];
  if (code === "VIS-1") return "palette";
  if (code === "ACC-4") return "contrast";
  if (code === "ACC-2") return "alt_text";
  if (code === "VIS-2") {
    if (f.quote.startsWith("(no Brand Kit logo")) return "logo_missing";
    if (f.quote.includes("proportions")) return "logo_stretched";
    if (f.quote.includes("colour #")) return "logo_recoloured";
    return "logo_retired";
  }
  return f.explanation.startsWith("Text in the image") ? "image_text" : null;
}

async function measurementAnalysis(s: Spec, buf: Buffer): Promise<ImageAnalysis> {
  const blocks = [{ text: s.headline, box: box(HEAD_BOX) }, { text: s.sub, box: box(SUB_BOX) }];
  const contrast = (await Promise.all(blocks.map((b) => measureRegionContrast(buf, b.box, b.text, 1000, 1000)))).filter((c): c is NonNullable<typeof c> => c !== null);
  const lg = logoSvg(s.logo);
  const matched = s.logo === "none" ? null : s.logo === "retired" ? "logo:retired" : "logo:current";
  const lbox = lg.box ? box(lg.box) : null;
  const measured = matched && lbox ? await measureLogo(buf, lbox, 1000, 1000, LOGO_FILES[matched]) : null;
  return {
    version: 1, width: 1000, height: 1000, palette: await measurePalette(buf), textBlocks: blocks, contrast,
    extractedText: blocks.map((b) => b.text).join("\n\n"), aiAltText: null,
    logo: { checked: true, present: Boolean(matched), matchedLogoId: matched, confidence: "design", note: "", box: lbox, measured },
    ai: { ran: false, error: null }, textSource: "seed",
  };
}

async function score(mode: "measurement" | "vision", images: { spec: Spec; buf: Buffer }[]) {
  const types: Record<string, { tp: number; fn: number; fp: number }> = {};
  const bump = (t: string, k: "tp" | "fn" | "fp") => ((types[t] ??= { tp: 0, fn: 0, fp: 0 })[k] += 1);
  const details: { id: string; missed: Issue[]; extra: string[] }[] = [];
  let aiFailures = 0;
  for (const { spec, buf } of images) {
    const analysis =
      mode === "measurement"
        ? await measurementAnalysis(spec, buf)
        : await analyzeImage(buf, { kit, logos: kit.logos!.map((l) => ({ logo: l, data: LOGO_FILES[l.id] })) });
    if (mode === "vision" && !analysis.ai.ran) aiFailures++;
    const rec = { id: spec.id, file_name: `${spec.id}.png`, alt_text: spec.alt, analysis };
    const found = imageFindings(rec, kit);
    if (analysis.extractedText) {
      const r = await runCheck(analysis.extractedText, { title: spec.id, channel: "Instagram", purpose: "" }, kit, { ai: false });
      found.push(...tagImageTextFindings(r.findings, spec.id));
    }
    const remaining = [...spec.expected];
    const extra: string[] = [];
    const seenText = new Set<string>();
    for (const f of found) {
      const t = classify(f);
      if (!t) continue;
      if (t === "image_text") {
        if (seenText.has("x")) continue; // several rule hits on one planted phrase count once
        seenText.add("x");
      }
      const i = remaining.indexOf(t);
      if (i >= 0) {
        remaining.splice(i, 1);
        bump(t, "tp");
      } else {
        bump(t, "fp");
        extra.push(`${t}: ${f.quote}`);
      }
    }
    remaining.forEach((t) => bump(t, "fn"));
    if (remaining.length || extra.length) details.push({ id: spec.id, missed: remaining, extra });
  }
  const tp = Object.values(types).reduce((n, v) => n + v.tp, 0);
  const fn = Object.values(types).reduce((n, v) => n + v.fn, 0);
  const fp = Object.values(types).reduce((n, v) => n + v.fp, 0);
  return {
    mode, executed_at: new Date().toISOString(), images: images.length, with_problems: images.filter((i) => i.spec.expected.length).length,
    planted: tp + fn, caught: tp, missed: fn, false_positives: fp,
    catch_rate: tp + fn ? tp / (tp + fn) : null, precision: tp + fp ? tp / (tp + fp) : null,
    meets_85_percent: tp + fn ? tp / (tp + fn) >= 0.85 : false,
    ai_failures: mode === "vision" ? aiFailures : undefined,
    by_issue: Object.fromEntries(Object.entries(types).sort()), details,
  };
}

const pct = (v: number | null) => (v === null ? "—" : `${(v * 100).toFixed(1)}%`);

(async () => {
  mkdirSync("eval/images", { recursive: true });
  mkdirSync("eval/results", { recursive: true });
  if (process.argv.includes("--regenerate") || !existsSync("eval/images/manifest.json")) {
    for (const s of SPECS) writeFileSync(`eval/images/${s.id}.png`, await render(s));
    writeFileSync("eval/images/manifest.json", JSON.stringify({ palette: DEMO_COLORS, logos: kit.logos, images: SPECS.map(({ id, alt, expected, logo }) => ({ id, alt, logo, expected })) }, null, 1));
  }
  const images = SPECS.map((spec) => ({ spec, buf: readFileSync(`eval/images/${spec.id}.png`) }));
  const runs = [await score("measurement", images)];
  let visionNote = "";
  if (!process.env.GEMINI_API_KEY) visionNote = "not executed: GEMINI_API_KEY is not set in this environment";
  else if (process.env.GEMINI_API_BASE) visionNote = "not executed: GEMINI_API_BASE points at a stub";
  else runs.push(await score("vision", images));

  let md = `# Image accuracy evaluation\n\nTest set: \`eval/images/\`: ${images.length} images, ${runs[0].with_problems} with planted problems (${runs[0].planted} problems), ${images.length - runs[0].with_problems} clean. Target from the Round 2 commitment: catch ≥ 85%.\n\n`;
  md += "| Mode | Planted | Caught | Missed | False positives | Catch rate | Precision | ≥ 85%? |\n|---|---|---|---|---|---|---|---|\n";
  for (const r of runs) {
    md += `| ${r.mode === "measurement" ? "Measurement (positions from the image design)" : "Vision (Gemini supplies text and logo positions)"} | ${r.planted} | ${r.caught} | ${r.missed} | ${r.false_positives} | ${pct(r.catch_rate)} | ${pct(r.precision)} | ${r.meets_85_percent ? "yes" : "no"} |\n`;
    writeFileSync(`eval/results/images-${r.mode}.json`, JSON.stringify(r, null, 1));
  }
  if (visionNote) md += `| Vision | ${visionNote} | | | | | | |\n`;
  for (const r of runs) {
    md += `\n## ${r.mode}: by problem type\n\n| Problem | Caught | Missed | False positives |\n|---|---|---|---|\n`;
    for (const [t, v] of Object.entries(r.by_issue)) md += `| ${t} | ${v.tp} | ${v.fn} | ${v.fp} |\n`;
  }
  md += `\nGenerated ${new Date().toISOString()} by \`npm run eval:images\`.\n`;
  writeFileSync("eval/results/images-summary.md", md);
  console.log(md);
  for (const r of runs) for (const d of r.details) console.log(r.mode, d.id, "missed:", d.missed.join(", ") || "-", "| extra:", d.extra.join("; ") || "-");
})();
