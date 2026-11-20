# The three Round 3 improvements, with evidence

## 1. Visual and accessibility checks for images

**Original commitment (Round 2 form, verbatim excerpts).** "Creators can attach images … to a draft … a new 'visual rules' section to the
Brand Kit (brand colours as hex values, a reference logo, minimum contrast) and a new image findings type that works in the same
accept / edit / dispute and review flow." Checks: colour via dominant palette and ΔE; "measure WCAG contrast for text placed on the
image and flag anything below the brand's minimum (default 4.5:1)"; alt text required and checked; logo: "use Gemini vision to check
whether the logo is used incorrectly (stretched, recoloured, wrong version) compared with the reference logo. As with text, every
finding must cite a visual rule, or it is discarded." **Done when:** "images can be attached to drafts; colour, contrast, alt-text and
logo findings appear with citations; and a test set of 20 images with planted problems is caught at 85% or better."

| Done-when item | Status |
| --- | --- |
| Images attached to drafts | **Met** (unit + E2E) |
| Colour, contrast, alt-text and logo findings with citations | **Met.** Each finding cites its `check_key` rule (VIS-1, ACC-4, ACC-2, VIS-2). A check with no rule raises nothing (tested) |
| Brand minimum contrast (default 4.5:1) | **Met.** Brand Kit → Visual identity setting (migration 0003), never below WCAG AA |
| Logo stretched / recoloured / wrong version | **Met.** Version from the vision match. Stretch and recolour are *measured* against the reference file (aspect ratio ±20%, ΔE00 > 15), not taken from the model's opinion |
| 20-image test set caught at ≥ 85% | **Partially verified.** 24 images (20 with 46 planted problems, 4 clean). Measurement mode: 46/46 caught, 0 false positives. **The vision mode (real Gemini) has not been run yet: no API key was available here** |

**What was implemented**

- Upload on *New draft* (up to 4 images, alt text per image) and *Add image / Remove* on editable drafts.
- `src/lib/images/analyze.ts`: byte-sniffed PNG/JPEG validation, 4 MB / 40 MP limits, palette by k-means in CIELAB with
  deterministic seeds, and region contrast by two-cluster luminance split. The colours come from the purest half of each cluster, so
  anti-aliasing doesn't skew them.
- `src/lib/images/color.ts`: WCAG 2.2 relative luminance and contrast ratio, CIEDE2000, the nearest palette colour, and a minimal text
  colour change that reaches the target ratio.
- `src/lib/images/vision.ts`: Gemini vision returns text blocks with boxes, an alt-text suggestion and a logo label. The output is
  grounded: boxes are clamped and a logo label the model was never offered is rejected. Logo names and versions are masked.
- `src/lib/images/findings.ts`: deterministic findings from the stored analysis, the current alt text and the current Brand Kit.
  Each cites the rule marked with `check_key` (`VIS-1` palette, `ACC-4` contrast, `ACC-2` alt text, `VIS-2` logo). If no rule is
  marked, it cites a labelled Brand Kit source.
- Findings use the existing table (`findings.image_id`): accept, edit, dispute, carry-over of disputes and review all work unchanged.
  Accepting or editing an alt-text finding writes the new alt text to the image.
- Brand Kit → **Visual identity** (palette CRUD, logo upload, current/retired).

**Files.** `src/lib/images/*`, `src/app/actions/drafts.ts`, `src/app/actions/kit.ts`, `src/app/(app)/drafts/[id]/image-panel.tsx`,
`workspace.tsx`, `new-draft-form.tsx`, `src/app/(app)/brand-kit/kit-extras.tsx`, `supabase/migrations/0002_final_round.sql`.

**Acceptance test** (`tests/images.test.ts`, "ACCEPTANCE"). A generated poster with an off-palette magenta block, light grey text on
white, the banned phrase "Lumio Premium", no logo and no alt text produces exactly:

| Planted problem | Finding |
| --- | --- |
| Off-palette colour | `VIS-1` "#FF2E93 · 27% of the image" → "Use Indigo #5568F2" |
| Insufficient contrast | `ACC-4` "Offer ends Sunday", measured 1.54:1 (needs ≥ 3:1 for this large text), with a fixed colour suggestion. The ink headline (17:1) is *not* flagged |
| Missing alt text | `ACC-2` "(no alt text)" with the vision suggestion |
| Banned phrase | `TERM-2` "Lumio Premium" → "Lumio Plus" (text in the image) |
| Logo | `VIS-2` "(no Brand Kit logo found)". A separate test checks retired vs current versions |

In this test the Gemini vision response is **stubbed** with the poster's real text regions. Palette, contrast, text checks and
findings all run the production code. The real model's OCR quality was not measured here.

**Also tested.** CIEDE2000 against the Sharma et al. reference pair; WCAG reference ratios (#767676 on white = 4.54); GIF, damaged
file and oversize rejection; behaviour with no AI (palette and alt text only, no contrast claims); E2E upload → findings → accept alt
text → review.

**Incomplete.** The vision-mode score on the 24-image set needs a Gemini key. Image pixels are not masked. "Large text" is estimated.
Logo identification (which version) depends on the vision model; stretch and colour are measured locally once the model has located
the mark.

## 2. Brand insights dashboard for administrators

**Original commitment.** Real analytics on workspace data through SQL views with the same security; most-broken rules, terminology
and creator repeats, dispute frequency, submission-to-approval time, weekly and channel trends, resolved before review, rules with
high dispute rates flagged "Possibly unclear" at a configurable threshold, links to the rule, drafts and findings and to editing the
rule, drill-down everywhere, and no fake numbers.

**What was implemented**

- Views `insight_findings` (one row per distinct issue, latest status), `insight_drafts` (first submission, approval, hours) and
  `insight_source_stats` (dispute rate and `possibly_unclear` from `workspace_settings`). All use `security_invoker = on`.
- `/insights` (admin only): KPIs, most-broken rules, possibly-unclear panel, dispute frequency, terminology mistakes, creators, weekly
  trend, channel trend, approval times, and threshold settings. Filters cover channel, creator and inclusion of demo history.
- `/insights/drafts`: drill-down for every metric (source, wording, status, week, channel, creator, approved, submitted), with links to
  each draft and "Edit this rule". `/brand-kit?edit=<rule>` opens the rule form directly.
- Demo history: 24 drafts over 8 weeks, created only by the demo seed and marked `drafts.demo_seed = true`. Their findings come from
  real rule checks; the creators' decisions and timestamps are scripted. The UI labels them, and they can be excluded with one filter.

**Files.** `supabase/migrations/0002_final_round.sql`, `src/lib/insights.ts`, `src/lib/insights-data.ts`, `src/app/(app)/insights/*`,
`src/app/actions/insights.ts`, `src/lib/demo/history.ts`, `src/lib/seed.ts`.

**Tests.** `tests/sql/rls_test.sql` checks workspace isolation of all three views, de-duplication across re-checks, dispute rate and
flag, hours to approval, and that the flag respects the minimum number of findings. A mutation check proves the test fails if
`security_invoker` is switched off. `tests/insights.test.ts` covers every metric function. E2E checks that the dashboard loads, the
flag shows, the top rule drills down, "Edit this rule" saves, filters apply, and creators are redirected away.

**Acceptance.** An admin identifies the most-broken rule (marked "Top"), opens its drafts, sees a disputed rule flagged "Possibly
unclear" and edits it from the dashboard. This is the E2E journey, steps 8.x.

## 3. Confidentiality masking and measured accuracy

### A. Masking

**What was implemented.** `src/lib/privacy/mask.ts` replaces emails, phone numbers (validated, so prices, dates, year ranges and
counts are not masked), Confidential Terms, unreleased products and admin regex patterns with `[[KIND_n_nonce]]` placeholders.

- The nonce is chosen so it does not occur in the text being masked, which avoids collisions.
- Overlaps resolve earliest, then longest, then most specific.
- The same value always maps to the same placeholder.
- `restore` only touches this masker's nonce, so it never restores another request's placeholders. It tolerates dropped brackets.
- `assertClean` refuses any payload that still contains a protected value.
- Logs carry a short reason, never content.

**Every AI call path:**

| Path | What is masked |
| --- | --- |
| Draft check | The whole prompt (Brand Kit, title, channel, purpose, draft) |
| Guideline import | The document |
| Image text | Goes through the draft check |
| Vision | Logo names and versions |

**Tests.** `tests/mask.test.ts` has 13 tests: one per category, plus overlap, collision, cross-request, bracket tolerance, the safety
check, captured outgoing payloads for the draft check and guideline import, and log scanning on failure. The E2E run logged every
request to the Gemini stand-in and asserted that `priya@lumio.in`, `+91 98765 43210`, `Lumio Live` and `LUM-2048` never appear,
while their placeholders do and the user sees the originals.

### B. Measured accuracy

**What was implemented.** `eval/dataset.json`: 59 posts, 64 planted errors across 8 categories, and 8 clean posts. `scripts/eval.ts`
reports TP, FP, FN, precision, recall, per-category results and the grounding-filter rejection rate (AI run). CI runs it on every
push and runs the AI part only when the secret is present.

**Results.** Rules only: **precision 100.0%, recall 70.3%** (45 TP, 0 FP, 19 FN). Rules + Gemini: **not executed: no API key was
available in the environment that produced this submission.** The README says so; no numbers were invented. The evaluation exposed
two real duplicate-finding bugs, which were fixed in the engine.

### C. Original additional commitments

| Commitment | Outcome |
| --- | --- |
| Result caching by content + Brand Kit version | Done (`check_cache`, key includes the date because fact expiry depends on it) |
| Workspace AI disclosure page | Done (`/ai-disclosure`) |
| pgvector retrieval | Deferred. A lexical retrieval for kits over 60 entries is implemented and tested, and keeps TERM-n codes stable |
