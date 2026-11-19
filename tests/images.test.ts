import assert from "node:assert/strict";
import { test } from "node:test";
import sharp from "sharp";
import { contrastRatio, deltaE2000, fixContrast, hexToRgb, rgbToLab } from "../src/lib/images/color";
import { inspectImage, measurePalette, measureRegionContrast, sniffImageType } from "../src/lib/images/analyze";
import { altTextProblem, imageFindings, type ImageRecord } from "../src/lib/images/findings";
import { analyzeImage, findingsForImages } from "../src/lib/images/pipeline";
import { groundVision } from "../src/lib/images/vision";
import type { BrandKit } from "../src/lib/types";
import { POSTER } from "../src/lib/demo/assets";
import { DEMO_LOGO_PNG, DEMO_POSTER_PNG } from "../src/lib/demo/embedded";

const makePoster = async () => Buffer.from(DEMO_POSTER_PNG, "base64");
const makeLogo = async () => Buffer.from(DEMO_LOGO_PNG, "base64");
import { testKit } from "./helpers";

const PALETTE = [
  { id: "c1", name: "Indigo", hex: "#5568F2" },
  { id: "c2", name: "Ink", hex: "#0F172A" },
  { id: "c3", name: "Marker", hex: "#FFE14D" },
];
const LOGOS = [
  { id: "l-current", name: "Lumio shield", version: "2026", storage_path: "x", is_current: true },
  { id: "l-old", name: "Lumio shield", version: "2023 (retired)", storage_path: "y", is_current: false },
];

function kit(): BrandKit {
  const k = testKit();
  k.colors = PALETTE;
  k.logos = LOGOS;
  // Mirror the seeded demo kit: rules wired to the image checks.
  k.rules = k.rules.map((r) => (r.code === "ACC-2" ? { ...r, check_key: "alt_text" as const } : r));
  const extra: BrandKit["rules"] = [
    { id: "rule:VIS-1", code: "VIS-1", category: "visual", title: "Use the brand palette", description: "x", severity: "medium", patterns: [], status: "active", source: "manual", check_key: "palette" },
    { id: "rule:ACC-4", code: "ACC-4", category: "accessibility", title: "Readable text on images", description: "x", severity: "high", patterns: [], status: "active", source: "manual", check_key: "contrast" },
    { id: "rule:VIS-2", code: "VIS-2", category: "visual", title: "Current logo only", description: "x", severity: "medium", patterns: [], status: "active", source: "manual", check_key: "logo" },
  ];
  for (const r of extra) if (!k.rules.some((x) => x.code === r.code)) k.rules.push(r);
  return k;
}

test("WCAG 2.2 contrast formula matches reference values", () => {
  assert.equal(contrastRatio([0, 0, 0], [255, 255, 255]).toFixed(2), "21.00");
  assert.equal(contrastRatio([255, 255, 255], [255, 255, 255]).toFixed(2), "1.00");
  // #767676 on white is the classic 4.54:1
  assert.equal(contrastRatio(hexToRgb("#767676"), [255, 255, 255]).toFixed(2), "4.54");
  const fixed = fixContrast(hexToRgb("#C9CDD6"), [255, 255, 255], 4.5)!;
  assert.ok(contrastRatio(fixed, [255, 255, 255]) >= 4.5);
});

test("CIEDE2000 matches the Sharma et al. reference pair", () => {
  // Pair 1 from Sharma, Wu & Dalal (2005): ΔE00 = 2.0425
  const d = deltaE2000([50, 2.6772, -79.7751], [50, 0, -82.7485]);
  assert.equal(d.toFixed(4), "2.0425");
  assert.ok(deltaE2000(rgbToLab(hexToRgb("#FF2E93")), rgbToLab(hexToRgb("#5568F2"))) > 10);
});

test("file type is sniffed from bytes; unsupported and damaged files are rejected", async () => {
  const png = await makePoster();
  assert.equal(sniffImageType(png), "image/png");
  const jpg = await sharp(png).jpeg().toBuffer();
  assert.equal((await inspectImage(jpg)).mime, "image/jpeg");
  const gif = await sharp(png).gif().toBuffer();
  await assert.rejects(inspectImage(gif), /PNG or JPG/);
  await assert.rejects(inspectImage(Buffer.from("not an image at all")), /PNG or JPG/);
  await assert.rejects(inspectImage(Buffer.concat([png.subarray(0, 40)])), /could not be read|damaged/);
  await assert.rejects(inspectImage(Buffer.alloc(4 * 1024 * 1024 + 1, 1)), /larger than 4 MB/);
});

test("dominant colours are measured with their share of the image", async () => {
  const pal = await measurePalette(await makePoster());
  const magenta = pal.find((c) => deltaE2000(rgbToLab(hexToRgb(c.hex)), rgbToLab(hexToRgb(POSTER.magenta))) < 3);
  assert.ok(magenta, JSON.stringify(pal));
  assert.ok(Math.abs(magenta.share - 0.27) < 0.03, `magenta share ${magenta.share}`);
  const white = pal.find((c) => c.hex === "#FFFFFF" || deltaE2000(rgbToLab(hexToRgb(c.hex)), [100, 0, 0]) < 3);
  assert.ok(white && white.share > 0.35);
});

test("text-region contrast is measured, not guessed", async () => {
  const buf = await makePoster();
  const [y0, x0, y1, x1] = POSTER.grey.box.map((v) => v / 1000);
  const grey = await measureRegionContrast(buf, { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }, POSTER.grey.text, 1000, 1000);
  const expected = contrastRatio(hexToRgb(POSTER.grey_hex), [255, 255, 255]);
  assert.ok(grey && Math.abs(grey.ratio - expected) < 0.25, `measured ${grey?.ratio}, expected ≈${expected.toFixed(2)}`);
  assert.ok(grey!.ratio < grey!.required);
  const [hy0, hx0, hy1, hx1] = POSTER.headline.box.map((v) => v / 1000);
  const head = await measureRegionContrast(buf, { x: hx0, y: hy0, w: hx1 - hx0, h: hy1 - hy0 }, POSTER.headline.text, 1000, 1000);
  assert.ok(head && head.ratio > 12, `headline ${head?.ratio}`);
});

test("alt text heuristics", () => {
  assert.equal(altTextProblem("", "poster.png"), "missing");
  assert.equal(altTextProblem("   ", "poster.png"), "missing");
  assert.equal(altTextProblem("poster", "poster.png"), "weak");
  assert.equal(altTextProblem("IMG_2041.jpg", "IMG_2041.jpg"), "weak");
  assert.equal(altTextProblem("banner", "a.png"), "weak");
  assert.equal(altTextProblem("Image of a girl", "a.png"), "weak");
  assert.equal(altTextProblem("Student revising with Lumio flashcards on a phone at a desk", "a.png"), null);
});

test("vision output is grounded: boxes clamped, unknown logo labels rejected", () => {
  const g = groundVision(
    {
      alt_text: "x",
      text_blocks: [{ text: "Hi", box_2d: [100, 100, 200, 1500] }, { text: "bad", box_2d: [500, 500, 400, 600] }, { text: "", box_2d: [1, 2, 3, 4] }],
      logo: { logo_label: "LOGO-9", confidence: "high", note: "" },
    },
    [{ label: "LOGO-1", id: "a" }],
  );
  assert.equal(g.textBlocks.length, 1);
  assert.equal(g.textBlocks[0].box.w, 0.9);
  assert.equal(g.logo.present, false, "a label that was never offered must not count as a match");
});

// ---------------------------------------------------------------------------
// Acceptance test (Round 3 commitment): off-palette colour, insufficient contrast,
// missing alt text and a banned phrase must each produce a finding.
// The Gemini vision call is stubbed with the poster's real text regions; everything
// else (palette, contrast, text checks, findings) is the production code path.
// ---------------------------------------------------------------------------

function stubVision(logoLabel: string) {
  const original = globalThis.fetch;
  const requests: string[] = [];
  globalThis.fetch = (async (_url: string, init: RequestInit) => {
    const body = String(init.body);
    requests.push(body);
    const isVision = body.includes("TARGET IMAGE");
    const payload = isVision
      ? {
          alt_text: "Poster announcing Lumio Premium with the line 'Offer ends Sunday' above magenta and indigo bands",
          text_blocks: [
            { text: POSTER.headline.text, box_2d: POSTER.headline.box },
            { text: POSTER.grey.text, box_2d: POSTER.grey.box },
          ],
          logo: { logo_label: logoLabel, confidence: "high", note: logoLabel === "LOGO-2" ? "Older shield shape." : "" },
        }
      : { findings: [] };
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(payload) }] } }] }), { status: 200 });
  }) as typeof fetch;
  return { requests, restore: () => (globalThis.fetch = original) };
}

test("ACCEPTANCE: test poster yields palette, contrast, alt-text, banned-phrase and logo findings", async () => {
  process.env.GEMINI_API_KEY = "test-key";
  const stub = stubVision("NONE");
  try {
    const k = kit();
    const buf = await makePoster();
    const logo = await makeLogo();
    const analysis = await analyzeImage(buf, { kit: k, logos: [{ logo: LOGOS[0], data: logo }, { logo: LOGOS[1], data: logo }] });
    assert.equal(analysis.ai.ran, true);
    const img: ImageRecord = { id: "img-1", file_name: "exam-poster.png", alt_text: "", analysis };
    const { findings } = await findingsForImages([img], k, { title: "Poster", channel: "Instagram", purpose: "" }, null);
    const by = (label: string) => findings.filter((f) => f.source_label.startsWith(label));

    const palette = by("VIS-1");
    assert.equal(palette.length, 1, JSON.stringify(findings, null, 1));
    assert.match(palette[0].quote, /^#FF2E9\w/);
    assert.match(palette[0].suggestion, /Indigo #5568F2/);

    const contrast = by("ACC-4");
    assert.equal(contrast.length, 1, "only the grey line fails; the ink headline passes");
    assert.equal(contrast[0].quote, POSTER.grey.text);
    assert.match(contrast[0].explanation, /Measured contrast 1\.\d+:1/);

    const alt = by("ACC-2");
    assert.equal(alt.length, 1);
    assert.equal(alt[0].quote, "(no alt text)");
    assert.match(alt[0].suggestion, /Poster announcing/);

    const banned = findings.filter((f) => f.quote === "Lumio Premium");
    assert.equal(banned.length, 1);
    assert.match(banned[0].source_label, /TERM-2/);
    assert.equal(banned[0].suggestion, "Lumio Plus");
    assert.match(banned[0].explanation, /^Text in the image/);

    const logoF = by("VIS-2");
    assert.equal(logoF.length, 1);
    assert.equal(logoF[0].quote, "(no Brand Kit logo found)");

    assert.ok(findings.every((f) => f.image_id === "img-1"));
  } finally {
    stub.restore();
  }
});

test("outdated logo version is flagged; current logo is not", async () => {
  process.env.GEMINI_API_KEY = "test-key";
  const k = kit();
  const buf = await makePoster();
  const logo = await makeLogo();
  for (const [label, expectFinding] of [["LOGO-2", true], ["LOGO-1", false]] as const) {
    const stub = stubVision(label);
    try {
      const analysis = await analyzeImage(buf, { kit: k, logos: [{ logo: LOGOS[0], data: logo }, { logo: LOGOS[1], data: logo }] });
      const f = imageFindings({ id: "i", file_name: "p.png", alt_text: "Poster announcing the Lumio Plus plan for students", analysis }, k).filter((x) => x.source_label.startsWith("VIS-2"));
      assert.equal(f.length, expectFinding ? 1 : 0, label);
      if (expectFinding) assert.match(f[0].quote, /2023 \(retired\)/);
    } finally {
      stub.restore();
    }
  }
});

test("without AI, palette and alt-text checks still run and the gap is reported", async () => {
  delete process.env.GEMINI_API_KEY;
  const k = kit();
  const analysis = await analyzeImage(await makePoster(), { kit: k, logos: [] });
  assert.equal(analysis.ai.ran, false);
  assert.equal(analysis.ai.error, "AI checks are not configured");
  const f = imageFindings({ id: "i", file_name: "p.png", alt_text: "", analysis }, k);
  assert.ok(f.some((x) => x.source_label.startsWith("VIS-1")));
  assert.ok(f.some((x) => x.source_label.startsWith("ACC-2") && x.suggestion === ""));
  assert.ok(!f.some((x) => x.source_label.startsWith("ACC-4")), "no contrast claims without measured text regions");
});

test("image pixels go to the vision model but logo names are masked", async () => {
  process.env.GEMINI_API_KEY = "test-key";
  const stub = stubVision("NONE");
  try {
    const k = kit();
    k.confidential = [{ id: "c", term: "Falcon", kind: "unreleased_product", note: "" }];
    const secretLogo = { ...LOGOS[0], name: "Falcon launch mark" };
    await analyzeImage(await makePoster(), { kit: k, logos: [{ logo: secretLogo, data: await makeLogo() }] });
    const vision = stub.requests.find((r) => r.includes("TARGET IMAGE"))!;
    assert.ok(!vision.includes("Falcon"));
  } finally {
    stub.restore();
  }
});
