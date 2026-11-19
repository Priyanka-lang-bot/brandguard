import "server-only";
import { aiAvailable, friendlyAiError } from "../engine/gemini";
import { runCheck, type CheckCache } from "../engine";
import type { BrandKit, BrandLogo, Candidate } from "../types";
import { inspectImage, measurePalette, measureRegionContrast, thumbnail } from "./analyze";
import { imageFindings, tagImageTextFindings, type ImageAnalysis, type ImageRecord } from "./findings";
import { analyzeWithVision } from "./vision";

/**
 * Analyse one uploaded image once: measured palette (sharp), then, if the AI is configured, Gemini vision for
 * text regions, alt-text suggestion and logo match. Contrast is measured by sharp on the reported text regions.
 */
export async function analyzeImage(
  buf: Buffer,
  opts: { kit: BrandKit; logos: { logo: BrandLogo; data: Buffer }[]; ai?: boolean },
): Promise<ImageAnalysis> {
  const { mime, width, height } = await inspectImage(buf);
  const palette = await measurePalette(buf);
  const analysis: ImageAnalysis = {
    version: 1,
    width,
    height,
    palette,
    textBlocks: [],
    contrast: [],
    extractedText: "",
    aiAltText: null,
    logo: null,
    ai: { ran: false, error: null },
  };
  if (opts.ai === false) return analysis;
  if (!aiAvailable()) {
    analysis.ai.error = "AI checks are not configured";
    return analysis;
  }
  try {
    const logoPngs = await Promise.all(opts.logos.map(async (l) => ({ logo: l.logo, png: await thumbnail(l.data) })));
    const vision = await analyzeWithVision({ data: buf, mime }, logoPngs, opts.kit);
    analysis.ai.ran = true;
    analysis.aiAltText = vision.altText || null;
    analysis.textBlocks = vision.textBlocks;
    analysis.extractedText = vision.textBlocks.map((b) => b.text).join("\n\n");
    analysis.logo = vision.logo;
    const measured = await Promise.all(vision.textBlocks.map((b) => measureRegionContrast(buf, b.box, b.text, width, height)));
    analysis.contrast = measured.filter((m): m is NonNullable<typeof m> => m !== null);
  } catch (e) {
    analysis.ai.error = friendlyAiError(e instanceof Error ? e.message : String(e));
    console.error(`Image vision check failed: ${analysis.ai.error}`);
  }
  return analysis;
}

/** All findings for a draft's images: image checks plus the normal text checks on text found in each image. */
export async function findingsForImages(
  images: ImageRecord[],
  kit: BrandKit,
  meta: { purpose: string; channel: string; title: string },
  cache: CheckCache | null,
): Promise<{ findings: Candidate[]; aiErrors: string[] }> {
  const aiErrors: string[] = [];
  const all = await Promise.all(
    images.map(async (img) => {
      const out = imageFindings(img, kit);
      if (img.analysis?.ai.error) aiErrors.push(`${img.file_name}: ${img.analysis.ai.error}`);
      const text = img.analysis?.extractedText?.trim();
      if (text) {
        const res = await runCheck(text, meta, kit, { cache });
        if (!res.aiChecked && res.aiError) aiErrors.push(`${img.file_name} text: ${friendlyAiError(res.aiError)}`);
        out.push(...tagImageTextFindings(res.findings, img.id));
      }
      return out;
    }),
  );
  return { findings: all.flat(), aiErrors };
}
