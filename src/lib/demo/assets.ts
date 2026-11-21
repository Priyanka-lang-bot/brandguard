// Generated demo images (acceptance-test poster and logo marks). Used by the demo seed and the tests.
import sharp from "sharp";

/**
 * The Round 3 acceptance-test poster, generated so every planted problem is known exactly:
 * - an off-palette magenta block (#FF2E93, ~27% of the area)
 * - light grey text on white ("Offer ends Sunday", #C9CDD6 on #FFFFFF ≈ 1.6:1)
 * - a banned phrase in the headline ("Lumio Premium", Brand Kit says "Lumio Plus")
 * - high-contrast ink headline (must NOT be flagged for contrast)
 * - no logo
 * Alt text is supplied by the test (empty = missing).
 */
export const POSTER = {
  width: 1000,
  height: 1000,
  headline: { text: "Lumio Premium is here", box: [60, 60, 180, 940] as [number, number, number, number] },
  grey: { text: "Offer ends Sunday", box: [230, 60, 300, 640] as [number, number, number, number] },
  magenta: "#FF2E93",
  grey_hex: "#C9CDD6",
};

export async function makePoster(): Promise<Buffer> {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="1000">
  <rect width="1000" height="1000" fill="#FFFFFF"/>
  <text x="70" y="160" font-family="DejaVu Sans, Inter, sans-serif" font-weight="700" font-size="72" textLength="850" lengthAdjust="spacingAndGlyphs" fill="#0F172A">Lumio Premium is here</text>
  <text x="70" y="285" font-family="DejaVu Sans, Inter, sans-serif" font-size="56" fill="${POSTER.grey_hex}">Offer ends Sunday</text>
  <rect x="0" y="480" width="1000" height="270" fill="${POSTER.magenta}"/>
  <rect x="0" y="750" width="1000" height="250" fill="#5568F2"/>
</svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

/** A simple shield mark used as the Brand Kit logo in tests. */
export async function makeLogo(color = "#5568F2"): Promise<Buffer> {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><path d="M128 16 40 48v64c0 56 38 104 88 128 50-24 88-72 88-128V48z" fill="${color}"/></svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

/** The retired 2023 logo: a rounded square badge in an older blue. */
export async function makeRetiredLogo(): Promise<Buffer> {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect x="28" y="28" width="200" height="200" rx="48" fill="#2F6FDE"/><text x="128" y="160" text-anchor="middle" font-family="DejaVu Sans, sans-serif" font-weight="700" font-size="96" fill="#FFFFFF">L</text></svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

/**
 * Sample "Lumio for Schools" launch poster used by the demo data (marked sample in the app). Built only from the
 * Brand Kit palette with readable text, so it is the clean counterpart to the acceptance-test poster.
 * Boxes are [ymin, xmin, ymax, xmax] on a 0-1000 grid, like the vision model returns.
 */
export const LAUNCH_POSTER = {
  width: 800,
  height: 800,
  headline: { text: "Lumio for Schools", box: [100, 60, 190, 890] as [number, number, number, number] },
  sub: { text: "Revise together, class by class", box: [640, 60, 720, 850] as [number, number, number, number] },
  alt: "Sample poster: the words Lumio for Schools in dark ink on a pale background above a dark band with white text reading Revise together, class by class.",
};

export async function makeLaunchPoster(): Promise<Buffer> {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800">
  <rect width="800" height="800" fill="#F1F5F9"/>
  <text x="56" y="138" font-family="DejaVu Sans, Inter, sans-serif" font-weight="700" font-size="64" fill="#0F172A">Lumio for Schools</text>
  <rect x="56" y="190" width="200" height="16" fill="#FFE14D"/>
  <rect x="0" y="480" width="800" height="320" fill="#0F172A"/>
  <rect x="0" y="720" width="800" height="80" fill="#5568F2"/>
  <text x="56" y="566" font-family="DejaVu Sans, Inter, sans-serif" font-weight="700" font-size="44" fill="#FFFFFF">Revise together, class by class</text>
</svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}
