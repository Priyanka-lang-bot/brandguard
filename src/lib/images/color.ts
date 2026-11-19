/** Colour maths: sRGB ⇄ CIELAB, CIEDE2000 and the WCAG 2.2 contrast formula. Pure functions, no I/O. */

export type RGB = [number, number, number];
export type Lab = [number, number, number];

export function hexToRgb(hex: string): RGB {
  const h = hex.replace("#", "");
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}
export function rgbToHex([r, g, b]: RGB): string {
  return "#" + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("").toUpperCase();
}

const srgbToLinear = (c: number) => {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};

/** WCAG 2.2 relative luminance. */
export function relativeLuminance([r, g, b]: RGB): number {
  return 0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(b);
}

/** WCAG 2.2 contrast ratio (1 – 21). */
export function contrastRatio(a: RGB, b: RGB): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

export function rgbToLab([r, g, b]: RGB): Lab {
  const R = srgbToLinear(r), G = srgbToLinear(g), B = srgbToLinear(b);
  // D65
  let x = (R * 0.4124564 + G * 0.3575761 + B * 0.1804375) / 0.95047;
  let y = R * 0.2126729 + G * 0.7151522 + B * 0.072175;
  let z = (R * 0.0193339 + G * 0.119192 + B * 0.9503041) / 1.08883;
  const f = (t: number) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
  x = f(x); y = f(y); z = f(z);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}

/** CIEDE2000 colour difference. ~2 is barely noticeable, >10 is clearly a different colour. */
export function deltaE2000(lab1: Lab, lab2: Lab): number {
  const [L1, a1, b1] = lab1, [L2, a2, b2] = lab2;
  const rad = Math.PI / 180;
  const C1 = Math.hypot(a1, b1), C2 = Math.hypot(a2, b2);
  const Cm = (C1 + C2) / 2;
  const G = 0.5 * (1 - Math.sqrt(Cm ** 7 / (Cm ** 7 + 25 ** 7)));
  const a1p = (1 + G) * a1, a2p = (1 + G) * a2;
  const C1p = Math.hypot(a1p, b1), C2p = Math.hypot(a2p, b2);
  const h = (a: number, b: number) => {
    if (a === 0 && b === 0) return 0;
    const v = Math.atan2(b, a) / rad;
    return v < 0 ? v + 360 : v;
  };
  const h1p = h(a1p, b1), h2p = h(a2p, b2);
  const dLp = L2 - L1, dCp = C2p - C1p;
  let dhp = 0;
  if (C1p * C2p !== 0) {
    dhp = h2p - h1p;
    if (dhp > 180) dhp -= 360;
    else if (dhp < -180) dhp += 360;
  }
  const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin((dhp / 2) * rad);
  const Lpm = (L1 + L2) / 2, Cpm = (C1p + C2p) / 2;
  let hpm = h1p + h2p;
  if (C1p * C2p !== 0) {
    if (Math.abs(h1p - h2p) > 180) hpm = h1p + h2p < 360 ? (h1p + h2p + 360) / 2 : (h1p + h2p - 360) / 2;
    else hpm = (h1p + h2p) / 2;
  }
  const T = 1 - 0.17 * Math.cos((hpm - 30) * rad) + 0.24 * Math.cos(2 * hpm * rad) + 0.32 * Math.cos((3 * hpm + 6) * rad) - 0.2 * Math.cos((4 * hpm - 63) * rad);
  const dTheta = 30 * Math.exp(-(((hpm - 275) / 25) ** 2));
  const Rc = 2 * Math.sqrt(Cpm ** 7 / (Cpm ** 7 + 25 ** 7));
  const Sl = 1 + (0.015 * (Lpm - 50) ** 2) / Math.sqrt(20 + (Lpm - 50) ** 2);
  const Sc = 1 + 0.045 * Cpm;
  const Sh = 1 + 0.015 * Cpm * T;
  const Rt = -Math.sin(2 * dTheta * rad) * Rc;
  return Math.sqrt((dLp / Sl) ** 2 + (dCp / Sc) ** 2 + (dHp / Sh) ** 2 + Rt * (dCp / Sc) * (dHp / Sh));
}

export function nearestColor<T extends { hex: string }>(hex: string, palette: T[]): { color: T; deltaE: number } | null {
  if (!palette.length) return null;
  const lab = rgbToLab(hexToRgb(hex));
  let best: { color: T; deltaE: number } | null = null;
  for (const c of palette) {
    const d = deltaE2000(lab, rgbToLab(hexToRgb(c.hex)));
    if (!best || d < best.deltaE) best = { color: c, deltaE: d };
  }
  return best;
}

/** Low-chroma very light or very dark colours (white backgrounds, black text). */
export function isNeutral(hex: string): boolean {
  const [L, a, b] = rgbToLab(hexToRgb(hex));
  const chroma = Math.hypot(a, b);
  return chroma < 6 && (L > 92 || L < 10);
}

/**
 * Smallest change to `fg` lightness (towards black or white, whichever reaches the target) that meets `target`
 * contrast against `bg`. Returns null if neither direction can.
 */
export function fixContrast(fg: RGB, bg: RGB, target: number): RGB | null {
  const mix = (t: number, to: RGB): RGB => [fg[0] + (to[0] - fg[0]) * t, fg[1] + (to[1] - fg[1]) * t, fg[2] + (to[2] - fg[2]) * t];
  const candidates: { t: number; c: RGB }[] = [];
  for (const to of [[0, 0, 0], [255, 255, 255]] as RGB[]) {
    if (contrastRatio(to, bg) < target) continue;
    let lo = 0, hi = 1;
    for (let i = 0; i < 24; i++) {
      const mid = (lo + hi) / 2;
      if (contrastRatio(mix(mid, to), bg) >= target) hi = mid;
      else lo = mid;
    }
    const c = mix(hi, to).map((v) => (to[0] === 0 ? Math.floor(v) : Math.ceil(v))) as RGB;
    candidates.push({ t: hi, c });
  }
  candidates.sort((x, y) => x.t - y.t);
  return candidates[0]?.c ?? null;
}
