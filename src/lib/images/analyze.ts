import "server-only";
import sharp, { type Sharp } from "sharp";
import { contrastRatio, deltaE2000, hexToRgb, rgbToHex, rgbToLab, type Lab, type RGB } from "./color";

export const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
export const MAX_IMAGE_PIXELS = 40_000_000;

export interface MeasuredColor {
  hex: string;
  share: number; // 0..1 of the image area
}

/** Normalised box (0..1) of a text region. */
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface RegionContrast {
  text: string;
  box: Box;
  fg: string;
  bg: string;
  ratio: number;
  large: boolean;
  required: number;
}

/** Sniff the real type from the bytes. The declared MIME type or file name is not trusted. */
export function sniffImageType(buf: Buffer): "image/png" | "image/jpeg" | null {
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  return null;
}

/** Validate an upload: real PNG/JPEG, size and pixel limits, decodable. */
export async function inspectImage(buf: Buffer): Promise<{ mime: "image/png" | "image/jpeg"; width: number; height: number }> {
  if (buf.length > MAX_IMAGE_BYTES) throw new Error("Image is larger than 4 MB");
  const mime = sniffImageType(buf);
  if (!mime) throw new Error("Unsupported image. Upload a PNG or JPG file.");
  let meta;
  try {
    meta = await sharp(buf, { limitInputPixels: MAX_IMAGE_PIXELS }).metadata();
  } catch {
    throw new Error("The image could not be read. It may be damaged.");
  }
  if (!meta.width || !meta.height) throw new Error("The image could not be read.");
  return { mime, width: meta.width, height: meta.height };
}

async function rawPixels(img: Sharp, max: number) {
  const { data, info } = await img
    .rotate()
    .flatten({ background: "#ffffff" })
    .resize(max, max, { fit: "inside", withoutEnlargement: true })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const px: RGB[] = [];
  for (let i = 0; i < data.length; i += info.channels) px.push([data[i], data[i + 1], data[i + 2]]);
  return { px, width: info.width, height: info.height };
}

/**
 * Dominant colours: k-means in CIELAB on a downscaled copy, seeded deterministically from a coarse
 * histogram, then clusters closer than ΔE00 6 are merged. Colours under 2% of the area are dropped.
 */
export async function measurePalette(buf: Buffer, k = 8): Promise<MeasuredColor[]> {
  const { px } = await rawPixels(sharp(buf, { limitInputPixels: MAX_IMAGE_PIXELS }), 128);
  const labs: Lab[] = px.map(rgbToLab);

  // Deterministic seeds: most frequent 4-bit buckets that are visibly different.
  const buckets = new Map<number, { n: number; i: number }>();
  px.forEach(([r, g, b], i) => {
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    const e = buckets.get(key);
    if (e) e.n++;
    else buckets.set(key, { n: 1, i });
  });
  const seeds: Lab[] = [];
  for (const { i } of [...buckets.values()].sort((a, b) => b.n - a.n)) {
    if (seeds.every((s) => deltaE2000(s, labs[i]) > 10)) seeds.push(labs[i]);
    if (seeds.length === k) break;
  }

  let centers = seeds;
  let assign = new Array<number>(labs.length).fill(0);
  for (let iter = 0; iter < 12; iter++) {
    assign = labs.map((l) => {
      let best = 0, bd = Infinity;
      centers.forEach((c, ci) => {
        const d = (l[0] - c[0]) ** 2 + (l[1] - c[1]) ** 2 + (l[2] - c[2]) ** 2;
        if (d < bd) { bd = d; best = ci; }
      });
      return best;
    });
    centers = centers.map((c, ci) => {
      let n = 0, s0 = 0, s1 = 0, s2 = 0;
      assign.forEach((a, i) => { if (a === ci) { n++; s0 += labs[i][0]; s1 += labs[i][1]; s2 += labs[i][2]; } });
      return n ? ([s0 / n, s1 / n, s2 / n] as Lab) : c;
    });
  }

  // Represent each cluster by its mean sRGB colour (more faithful than converting the Lab mean back).
  let clusters = centers.map((_, ci) => {
    let n = 0, r = 0, g = 0, b = 0;
    assign.forEach((a, i) => { if (a === ci) { n++; r += px[i][0]; g += px[i][1]; b += px[i][2]; } });
    return { n, rgb: (n ? [r / n, g / n, b / n] : [0, 0, 0]) as RGB };
  }).filter((c) => c.n > 0);

  // Merge near-duplicates.
  clusters.sort((a, b) => b.n - a.n);
  const merged: typeof clusters = [];
  for (const c of clusters) {
    const twin = merged.find((m) => deltaE2000(rgbToLab(m.rgb), rgbToLab(c.rgb)) < 6);
    if (twin) {
      const n = twin.n + c.n;
      twin.rgb = twin.rgb.map((v, i) => (v * twin.n + c.rgb[i] * c.n) / n) as RGB;
      twin.n = n;
    } else merged.push({ ...c });
  }
  clusters = merged;
  const total = px.length;
  return clusters
    .map((c) => ({ hex: rgbToHex(c.rgb), share: Math.round((c.n / total) * 1000) / 1000 }))
    .filter((c) => c.share >= 0.02)
    .sort((a, b) => b.share - a.share);
}

/** Line height (px, at the image's intrinsic size) from which text counts as "large" under WCAG (≈18pt / 24px font). */
const LARGE_LINE_PX = 32;

/**
 * Contrast of text inside a region: pixels are split into two luminance clusters; the smaller cluster is taken
 * as the text and the larger as the background. Each colour is the mean of the purest half of its cluster, so
 * anti-aliased edges do not drag the colours together.
 */
export async function measureRegionContrast(buf: Buffer, box: Box, text: string, imgW: number, imgH: number): Promise<RegionContrast | null> {
  const left = Math.max(0, Math.floor(box.x * imgW));
  const top = Math.max(0, Math.floor(box.y * imgH));
  const width = Math.min(imgW - left, Math.ceil(box.w * imgW));
  const height = Math.min(imgH - top, Math.ceil(box.h * imgH));
  if (width < 4 || height < 4) return null;
  const { px } = await rawPixels(sharp(buf, { limitInputPixels: MAX_IMAGE_PIXELS }).extract({ left, top, width, height }), 256);
  const lum = px.map(([r, g, b]) => 0.2126 * r + 0.7152 * g + 0.0722 * b);
  let c0 = Math.min(...lum), c1 = Math.max(...lum);
  if (c1 - c0 < 1) {
    return { text, box, fg: rgbToHex(px[0]), bg: rgbToHex(px[0]), ratio: 1, large: false, required: 4.5 };
  }
  let labels: number[] = [];
  for (let i = 0; i < 10; i++) {
    labels = lum.map((l) => (Math.abs(l - c0) <= Math.abs(l - c1) ? 0 : 1));
    const m = (k: number) => {
      const v = lum.filter((_, j) => labels[j] === k);
      return v.length ? v.reduce((a, b) => a + b, 0) / v.length : k === 0 ? c0 : c1;
    };
    c0 = m(0);
    c1 = m(1);
  }
  const groups = [0, 1].map((k) => px.map((p, j) => ({ p, l: lum[j], k: labels[j] })).filter((x) => x.k === k));
  const pure = (g: typeof groups[number], center: number) => {
    const sorted = [...g].sort((a, b) => Math.abs(a.l - center) - Math.abs(b.l - center));
    const half = sorted.slice(0, Math.max(1, Math.ceil(sorted.length / 2)));
    return half.reduce((acc, x) => [acc[0] + x.p[0], acc[1] + x.p[1], acc[2] + x.p[2]] as RGB, [0, 0, 0] as RGB).map((v) => v / half.length) as RGB;
  };
  const [textGroup, bgGroup, textCenter, bgCenter] = groups[0].length <= groups[1].length ? [groups[0], groups[1], c0, c1] : [groups[1], groups[0], c1, c0];
  const fg = pure(textGroup, textCenter);
  const bg = pure(bgGroup, bgCenter);
  const lines = Math.max(1, text.split(/\n/).length);
  const large = height / lines >= LARGE_LINE_PX;
  const required = large ? 3 : 4.5;
  return { text, box, fg: rgbToHex(fg), bg: rgbToHex(bg), ratio: Math.round(contrastRatio(fg, bg) * 100) / 100, large, required };
}

/** Small PNG thumbnail for sending reference assets (logos) to the vision model. */
export async function thumbnail(buf: Buffer, size = 384): Promise<Buffer> {
  return sharp(buf, { limitInputPixels: MAX_IMAGE_PIXELS }).rotate().resize(size, size, { fit: "inside", withoutEnlargement: true }).png().toBuffer();
}

export { hexToRgb };

export interface LogoMeasurement {
  aspect: number; // width / height of the mark in the image
  refAspect: number; // width / height of the reference logo (transparent/white margins trimmed)
  stretch: number; // aspect / refAspect (1 = correct proportions)
  color: string | null; // dominant non-neutral colour of the mark in the image
  refColor: string | null; // dominant non-neutral colour of the reference logo
  deltaE: number | null; // CIEDE2000 between the two
}


async function dominantNonNeutral(buf: Buffer): Promise<string | null> {
  const { isNeutral } = await import("./color");
  const pal = await measurePalette(buf, 6);
  return pal.find((c) => !isNeutral(c.hex) && c.share >= 0.05)?.hex ?? null;
}

/** Measure a logo region against the reference logo file: proportions and colour. */
export async function measureLogo(buf: Buffer, box: Box, imgW: number, imgH: number, reference: Buffer): Promise<LogoMeasurement | null> {
  const left = Math.max(0, Math.floor(box.x * imgW));
  const top = Math.max(0, Math.floor(box.y * imgH));
  const width = Math.min(imgW - left, Math.ceil(box.w * imgW));
  const height = Math.min(imgH - top, Math.ceil(box.h * imgH));
  if (width < 8 || height < 8) return null;
  const region = await sharp(buf, { limitInputPixels: MAX_IMAGE_PIXELS }).extract({ left, top, width, height }).png().toBuffer();
  const ref = await sharp(reference, { limitInputPixels: MAX_IMAGE_PIXELS }).flatten({ background: "#ffffff" }).trim({ threshold: 12 }).png().toBuffer({ resolveWithObject: true });
  const refAspect = ref.info.width / ref.info.height;
  const aspect = width / height;
  const [color, refColor] = await Promise.all([dominantNonNeutral(region), dominantNonNeutral(ref.data)]);
  const deltaE = color && refColor ? Math.round(deltaE2000(rgbToLab(hexToRgb(color)), rgbToLab(hexToRgb(refColor))) * 10) / 10 : null;
  return { aspect: Math.round(aspect * 1000) / 1000, refAspect: Math.round(refAspect * 1000) / 1000, stretch: Math.round((aspect / refAspect) * 1000) / 1000, color, refColor, deltaE };
}
