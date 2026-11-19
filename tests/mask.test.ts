import assert from "node:assert/strict";
import { test } from "node:test";
import { createMasker, findSensitive, isLikelyPhone, validatePattern } from "../src/lib/privacy/mask";
import { maskConfigFromKit } from "../src/lib/privacy/config";
import { aiCheck, extractRules } from "../src/lib/engine/gemini";
import { runCheck } from "../src/lib/engine";
import { validateAiFindings } from "../src/lib/engine/validate";
import { testKit } from "./helpers";

const CONFIG = maskConfigFromKit({
  confidential: [
    { id: "c1", term: "Project Falcon", kind: "term", note: "" },
    { id: "c2", term: "Lumio Live", kind: "unreleased_product", note: "" },
    { id: "c3", term: "PRJ-\\d{4}", kind: "pattern", note: "" },
  ],
});

test("emails are masked and restored", () => {
  const text = "Write to priya.s+press@lumio.in or HELLO@Example.co.uk today.";
  const m = createMasker(CONFIG, [text]);
  const masked = m.mask(text);
  assert.ok(!masked.includes("priya.s+press@lumio.in") && !masked.toLowerCase().includes("example.co.uk"), masked);
  assert.match(masked, /\[\[EMAIL_1_[a-z0-9]{6}\]\]/);
  assert.match(masked, /\[\[EMAIL_2_[a-z0-9]{6}\]\]/);
  assert.equal(m.restore(masked), text);
  assert.equal(m.counts().EMAIL, 2);
});

test("phone numbers are masked; prices, dates, years and counts are not", () => {
  for (const p of ["+91 98765 43210", "(022) 2345 6789", "98765-43210", "+44 20 7946 0958", "555.123.4567"]) {
    const text = `Call ${p} now`;
    const m = createMasker(CONFIG, [text]);
    const masked = m.mask(text);
    assert.ok(!masked.includes(p), `${p} -> ${masked}`);
    assert.equal(m.restore(masked), text);
  }
  for (const s of ["₹1,999 per year", "valid until 2026-11-05", "since 2025-2026", "120,000 learners", "₹199 a month", "3 study plans"]) {
    assert.equal(findSensitive(s, CONFIG).length, 0, s);
  }
  assert.equal(isLikelyPhone("2026-11-05"), false);
});

test("confidential terms and unreleased products: whole words, any case, any spacing", () => {
  const text = "project falcon ships with LUMIO  LIVE. Lumio Liveliness is a different word. ProjectFalcon is not matched.";
  const m = createMasker(CONFIG, [text]);
  const masked = m.mask(text);
  assert.ok(!/project falcon/i.test(masked));
  assert.ok(!/lumio\s+live\b/i.test(masked));
  assert.match(masked, /\[\[CONF_1_/);
  assert.match(masked, /\[\[PRODUCT_1_/);
  assert.ok(masked.includes("Lumio Liveliness"), "partial word must not be masked");
  assert.ok(masked.includes("ProjectFalcon"));
  assert.equal(m.restore(masked), text);
});

test("administrator-defined patterns are masked; invalid patterns are rejected", () => {
  const text = "Ticket PRJ-2048 and prj-0001 are internal.";
  const m = createMasker(CONFIG, [text]);
  const masked = m.mask(text);
  assert.ok(!/prj-\d{4}/i.test(masked), masked);
  assert.equal(m.counts().CUSTOM, 2);
  assert.equal(m.restore(masked), text);
  assert.ok(validatePattern("(unclosed"));
  assert.ok(validatePattern("a*"), "pattern matching empty text must be rejected");
  assert.equal(validatePattern("PRJ-\\d{4}"), null);
});

test("overlapping matches are resolved safely and nothing leaks", () => {
  const cfg = maskConfigFromKit({
    confidential: [
      { id: "a", term: "Lumio Live", kind: "unreleased_product", note: "" },
      { id: "b", term: "Live tutoring beta", kind: "term", note: "" },
      { id: "c", term: "falcon@lumio.in", kind: "term", note: "" },
    ],
  });
  const text = "Lumio Live tutoring beta opens soon. Mail falcon@lumio.in.";
  const m = createMasker(cfg, [text]);
  const masked = m.mask(text);
  assert.ok(!/lumio live/i.test(masked) && !/live tutoring beta/i.test(masked.replace(/\[\[[^\]]+\]\]/g, "")), masked);
  assert.ok(!masked.includes("falcon@lumio.in"));
  assert.equal(m.restore(masked), text);
  m.assertClean(masked);
});

test("same value gets the same placeholder", () => {
  const text = "a@b.io, then a@b.io again";
  const m = createMasker(CONFIG, [text]);
  const masked = m.mask(text);
  const tokens = masked.match(/\[\[EMAIL_\d+_[a-z0-9]+\]\]/g)!;
  assert.equal(tokens.length, 2);
  assert.equal(tokens[0], tokens[1]);
});

test("placeholder nonce never collides with user content", () => {
  // Force the random source to propose 'aaaaaa' first; the text already contains it.
  const text = "Literal [[EMAIL_1_aaaaaa]] in the draft and real x@y.com";
  let calls = 0;
  const rnd = () => (calls++ < 6 ? 0 : 0.5);
  const m = createMasker(CONFIG, [text], rnd);
  assert.notEqual(m.nonce, "aaaaaa");
  const masked = m.mask(text);
  const restored = m.restore(masked);
  assert.equal(restored, text, "the user's literal placeholder-like text stays untouched");
});

test("placeholders from another request are never restored", () => {
  const t1 = "Mail one@a.com";
  const t2 = "Mail two@b.com";
  const a = createMasker(CONFIG, [t1]);
  const b = createMasker(CONFIG, [t2]);
  const ma = a.mask(t1);
  b.mask(t2);
  assert.equal(b.restore(ma), ma, "masker B must not touch masker A's placeholder");
  assert.equal(a.restore(ma), t1);
});

test("restore tolerates the model dropping brackets", () => {
  const text = "Contact x@y.com";
  const m = createMasker(CONFIG, [text]);
  const token = m.mask(text).slice("Contact ".length);
  const bare = token.replace(/^\[\[|\]\]$/g, "");
  assert.equal(m.restore(`Contact ${bare}`), text);
});

test("assertClean refuses a payload that still contains a sensitive value", () => {
  const text = "Mail a@b.com about Project Falcon";
  const m = createMasker(CONFIG, [text]);
  m.mask(text);
  assert.throws(() => m.assertClean(text), /Masking check failed/);
});

// ---------------------------------------------------------------------------
// Every AI call path: the outgoing request must not contain the originals.
// ---------------------------------------------------------------------------

const SECRET_DRAFT = `Lumio Live launches next week! Questions? Email priya@lumio.in or call +91 98765 43210.
Internal code PRJ-7781. We're the best study app.`;
const SECRETS = ["Lumio Live", "priya@lumio.in", "+91 98765 43210", "98765 43210", "PRJ-7781"];

function captureFetch(respond: (body: { contents: { parts: { text: string }[] }[]; systemInstruction: { parts: { text: string }[] } }) => unknown, status = 200) {
  const bodies: string[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = (async (_url: string, init: RequestInit) => {
    const body = String(init.body);
    bodies.push(body);
    const payload = respond(JSON.parse(body));
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(payload) }] } }] }), { status });
  }) as typeof fetch;
  return { bodies, restore: () => (globalThis.fetch = original) };
}

const kitWithConfidential = () => ({
  ...testKit(),
  confidential: [
    { id: "c2", term: "Lumio Live", kind: "unreleased_product" as const, note: "" },
    { id: "c3", term: "PRJ-\\d{4}", kind: "pattern" as const, note: "" },
  ],
});

test("draft check: masked before the request, restored in quotes and fixes", async () => {
  process.env.GEMINI_API_KEY = "test-key";
  const kit = kitWithConfidential();
  const cap = captureFetch((body) => {
    const user = body.contents[0].parts[0].text;
    // The model quotes the placeholder it saw, as instructed.
    const product = user.match(/\[\[PRODUCT_1_[a-z0-9]+\]\]/)![0];
    const email = user.match(/\[\[EMAIL_1_[a-z0-9]+\]\]/)![0];
    return {
      findings: [
        { quote: `${product} launches next week`, source_id: "MSG-2", explanation: `${product} has not launched.`, suggestion: `${product} is coming soon`, severity: "high" },
        { quote: "the best study app", source_id: "CLAIM-1", explanation: "Superlative.", suggestion: "a study app", severity: "high" },
        { quote: `Email ${email}`, source_id: "TONE-1", explanation: "test", suggestion: `Write to ${email}`, severity: "low" },
      ],
    };
  });
  try {
    const out = await aiCheck(SECRET_DRAFT, { title: "Launch", channel: "Email", purpose: `Reply to priya@lumio.in` }, kit, "2026-11-19");
    assert.equal(cap.bodies.length, 1);
    for (const s of SECRETS) assert.ok(!cap.bodies[0].includes(s), `request leaked "${s}"`);
    assert.equal(out.findings[0].quote, "Lumio Live launches next week");
    assert.equal(out.findings[0].suggestion, "Lumio Live is coming soon");
    assert.equal(out.findings[2].suggestion, "Write to priya@lumio.in");
    // The restored quotes pass the grounding gate against the ORIGINAL draft.
    const rep = validateAiFindings(SECRET_DRAFT, out.findings, kit);
    assert.equal(rep.kept.length, 3, JSON.stringify(rep.discarded));
    assert.equal(out.masked.PRODUCT, 1);
    assert.equal(out.masked.EMAIL, 1);
  } finally {
    cap.restore();
  }
});

test("guideline import: masked document, restored excerpts", async () => {
  process.env.GEMINI_API_KEY = "test-key";
  const doc = "Press contact: media@lumio.in, +91 22 4000 1234.\nNever mention Lumio Live before launch. Always write 'flashcards' as one word.";
  const cap = captureFetch((body) => {
    const user = body.contents[0].parts[0].text;
    const product = user.match(/\[\[PRODUCT_1_[a-z0-9]+\]\]/)![0];
    return { rules: [{ category: "messaging", title: `Don't mention ${product}`, description: "x", severity: "high", excerpt: `Never mention ${product} before launch.` }] };
  });
  try {
    const rules = await extractRules(doc, kitWithConfidential());
    for (const s of ["media@lumio.in", "+91 22 4000 1234", "Lumio Live"]) assert.ok(!cap.bodies[0].includes(s), `leaked ${s}`);
    assert.equal(rules[0].excerpt, "Never mention Lumio Live before launch.");
    assert.equal(rules[0].title, "Don't mention Lumio Live");
  } finally {
    cap.restore();
  }
});

test("AI failures never log draft content or sensitive values", async () => {
  process.env.GEMINI_API_KEY = "test-key";
  const logged: string[] = [];
  const origErr = console.error;
  console.error = (...a: unknown[]) => logged.push(a.map(String).join(" "));
  const original = globalThis.fetch;
  globalThis.fetch = (async () => new Response(`echo: ${SECRET_DRAFT}`, { status: 500 })) as typeof fetch;
  try {
    const res = await runCheck(SECRET_DRAFT, { title: "t", channel: "Email", purpose: "" }, kitWithConfidential());
    assert.equal(res.aiChecked, false);
    assert.ok(logged.length > 0);
    for (const line of logged) for (const s of SECRETS) assert.ok(!line.includes(s), `log leaked ${s}: ${line}`);
    // Deterministic findings still returned
    assert.ok(res.findings.some((f) => f.quote === "the best"));
  } finally {
    console.error = origErr;
    globalThis.fetch = original;
  }
});
