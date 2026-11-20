# BrandGuard

BrandGuard is a pre-publication checkpoint for brand content. A creator submits a draft, with images if it has any. BrandGuard
checks it against the organisation's own guidelines, terminology, approved facts and visual identity, and returns findings. Each
finding quotes the exact words (or names the image problem with a measured value), cites the Brand Kit source it breaks, explains
why and offers a minimal fix. The creator accepts, edits or disputes each finding and sends the draft to a reviewer, who approves it
or asks for changes. Admins get an insights dashboard that shows which rules break most often and which ones people dispute.

Built for the CodeNova / We Code Coders hackathon (problem statement by Inkloom AI) by team **404** (solo: Priyanka Wanjari).

- **Live app:** https://brandguard-5siy.vercel.app (public landing page at `/`, sign-in at `/login`)
- **Final-round documents:** [`docs/`](docs/), including the product report PDF ([`docs/BrandGuard_Final_Report.pdf`](docs/BrandGuard_Final_Report.pdf)). Submission checklist: [`docs/SUBMISSION.md`](docs/SUBMISSION.md)

## Try it

Open the live link and click **Get started**, then pick a demo role. The demo brand, **Lumio**, is a fictional study app.

1. **Creator (Kabir).** Open *Exam season poster* (an image draft with palette, contrast, alt-text and in-image terminology findings) or
   *Welcome email for new learners*, or click **New draft** → *Launch post with errors* and attach a PNG or JPG. Accept, edit or
   dispute each finding, then click **Send for review**.
2. **Reviewer (Riya).** Switch role in the top bar, open the draft from the review queue, read the resolutions and disputes, check the
   **Changes** tab, then **Approve** or **Request changes**.
3. **Admin (Asha).** Use **Insights** to find the most-broken and most-disputed rules, open the drafts behind any number and edit a rule
   in one click. Use **Brand Kit** to manage rules, terminology, the Fact Vault (with expiry dates), visual identity (palette and logos),
   Confidential Terms and guideline PDF import with per-rule approval. *Reset demo data* restores the sample content.

## How the check works

1. **Rule checks (deterministic).** Banned term variants, plus regex patterns attached to rules (e.g. `\bguarantee(d)?\b`,
   `!{2,} => !`). Exact and fast, and they still run if the AI is unavailable.
2. **Confidentiality masking.** Before any AI request is built, emails, phone numbers, Confidential Terms, unreleased product names and
   admin-defined patterns are replaced with per-request placeholders such as `[[EMAIL_1_k3f9q2]]`. A final check refuses to send any
   request that still contains a protected value.
3. **AI check (Gemini, structured JSON).** If the main model is slow or overloaded, the fallback model takes over within a 28-second
   budget, and if both fail, the rule checks are still returned with the reason. The model receives the active Brand Kit with citable codes (`TONE-1`, `TERM-3`, `FACT-4` …),
   the creator's stated purpose and the masked draft. Expired facts are marked as expired. Large kits are narrowed to the most relevant
   entries first.
4. **Grounding gate.** Every AI finding is discarded unless it cites a real Brand Kit code *and* its quote is found in the draft.
   Suggestions identical to the original are dropped. Placeholders are restored before this check, so quotes are matched against the
   real draft.
5. **Images.** `sharp` measures dominant colours (k-means in CIELAB) and compares them with the palette (CIEDE2000). Gemini vision
   returns text regions, an alt-text suggestion, and the match and position of a Brand Kit logo. `sharp` then measures:
   - WCAG 2.2 contrast on each text region, against the brand minimum (default 4.5:1);
   - the logo's proportions and colour against its reference file, to detect stretching and recolouring.

   The text found in the image goes through steps 1–4. Every image finding cites the Brand Kit rule that drives it.
6. **Merge, cache, record.** Duplicate findings are merged. The AI result is cached by content + Brand Kit version + date. Resolutions
   are applied as a new **version**, and disputes carry over when a re-check flags the same words for the same source.

## Measured accuracy

The evaluation set ([`eval/dataset.json`](eval/dataset.json)) has 59 posts in the Lumio brand, with **64 planted errors** (wrong
terminology and product names, wrong prices, outdated offers, unreleased features, unsupported claims, tone and accessibility issues)
and 8 clean posts. Run `npm run eval`. Results from the run on 2026-11-19:

| Mode | Posts | Expected | Actual | TP | FP | FN | Precision | Recall | Grounding-filter rejection |
|---|---|---|---|---|---|---|---|---|---|
| Rule checks only | 59 | 64 | 45 | 45 | 0 | 19 | **100.0%** | **70.3%** | n/a |
| Rules + Gemini | **not executed**: no `GEMINI_API_KEY` was available where this was run | | | | | | | | |

How to read this:

- The rule checks never caught a wrong price, an outdated offer, an unreleased feature or third-person tone (0 of 19). Those need the
  AI pass, which is why the full pipeline uses both.
- The dataset was written by the same team that wrote the rules, so the rules-only precision is optimistic.
- The evaluation found two real bugs (duplicate findings for overlapping or case-duplicate term variants). They were fixed in the
  engine. The dataset was not changed to hide them.
- **The AI precision, recall and grounding-filter rejection rate have not been measured yet.** CI runs them automatically once the
  repository has a `GEMINI_API_KEY` secret. Locally: `GEMINI_API_KEY=… npm run eval`. Per-category results are written to
  [`eval/results/`](eval/results/).

### Image checks (Round 2 target: catch ≥ 85% of planted problems in a 20-image test set)

[`eval/images/`](eval/images/) holds 24 generated posters: 20 with 46 planted problems, plus 4 clean ones. The planted problems are
off-palette colours, low-contrast text, missing or weak alt text, banned terms in the image, and missing, retired, stretched or
recoloured logos. Run `npm run eval:images`. Results from 2026-11-20:

| Mode | Planted | Caught | Missed | False positives | Catch rate | ≥ 85%? |
|---|---|---|---|---|---|---|
| Measurement (text and logo positions taken from each image's design) | 46 | 46 | 0 | 0 | **100.0%** | yes |
| Vision (Gemini supplies text and logo positions) | **not executed**: no `GEMINI_API_KEY` where this was run | | | | | |

The measurement mode scores BrandGuard's own colour, contrast, alt-text, logo and text-rule logic, assuming perception is perfect. It
does **not** score the vision model. The images are synthetic and were made by the same team, so 100% here is an upper bound. The
vision mode, which is the honest end-to-end number, runs automatically in CI once the `GEMINI_API_KEY` secret is set.

## Stack

- Next.js 15 (App Router, Server Actions), React 19, TypeScript, Tailwind CSS v4, self-hosted fonts (Fontsource: Archivo, Instrument Serif)
- Supabase: Postgres, Auth, Storage (private buckets), row-level security on every table, `security_invoker` views for analytics
- Google Gemini (`gemini-3.5-flash`, `gemini-3.5-flash-lite` fallback, configurable) via REST with response schemas, including vision
- `sharp` (image analysis), `mammoth` (DOCX) and `unpdf` (PDF) for text extraction, `diff` for version comparison, `zod`
- Hosted on Vercel. Tests use the Node test runner with `tsx`, Postgres 16, and Playwright for end-to-end runs

## Run your own copy

1. Create a Supabase project. In **SQL Editor**, run `supabase/migrations/0001_init.sql`, then `0002_final_round.sql`, then
   `0003_brand_contrast.sql` (the brand minimum contrast setting).
   0002 is additive. It adds image, palette, logo, confidential-term, settings and cache tables, two private storage buckets, and the
   insights views. The app keeps working without 0002, but those features show a "needs the database update" notice.
2. Set environment variables (Vercel → Project → Settings → Environment Variables, or `.env.local`):

   | Variable | Value |
   | --- | --- |
   | `NEXT_PUBLIC_SUPABASE_URL` | Supabase Project URL |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon (public) key |
   | `SUPABASE_SERVICE_ROLE_KEY` | Supabase service_role key (server only) |
   | `GEMINI_API_KEY` | Google AI Studio key (server only) |
   | `SETUP_TOKEN` | Any long random string |
   | `GEMINI_MODEL` | Optional, defaults to `gemini-3.5-flash` (fallback: `GEMINI_FALLBACK_MODEL`, default `gemini-3.5-flash-lite`) |

3. Deploy, then open `https://<your-app>/api/setup?token=<SETUP_TOKEN>` once (or use *Reset demo data* as admin). This creates the demo
   users, Brand Kit, palette, logos, Confidential Terms, sample drafts (including the poster) and eight weeks of demo history for the
   insights dashboard. That history is marked `drafts.demo_seed = true` and labelled in the UI. Locally: `npm run seed`.

## Tests

| Command | What it runs |
| --- | --- |
| `npm test` | 40 unit and integration tests: check engine, masking on every AI call path (captured request payloads), Gemini timeout fallback, image analysis incl. the poster acceptance test and logo misuse, insights maths, Brand Kit retrieval |
| `npm run test:sql` | Applies both migrations to a local Postgres 15+ and runs the RLS and insights-view tests (workspace isolation, roles, storage folders) |
| `bash tests/e2e/run.sh` | Full judge journey in Playwright (49 checks), robustness checks (18: bad input, refresh, double actions, broken URLs, permissions) and the scroll-driven demo (37), against local stand-ins for Supabase and Gemini |
| `npm run eval` | Text accuracy evaluation (see above) |
| `npm run eval:images` | Image accuracy evaluation (see above) |

How to run them and the latest results: [`docs/TESTING.md`](docs/TESTING.md). CI (`.github/workflows/ci.yml`) runs all of them.

## Known limitations

- Masking covers text. Image pixels go to the vision model as they are.
- Contrast, in-image text and logo checks need the vision model to locate text and the logo. Without the AI, palette and alt-text
  checks still run. Logo stretch and recolour are then measured by BrandGuard against the reference file, not judged by the model.
- Image checks only run when the Brand Kit has a rule for them (`check_key`), because every image finding must cite a rule.
- "Large text" for WCAG is estimated from the text-region height. The brand minimum (default 4.5:1) applies to all text in images.
- pgvector retrieval is not implemented. Large kits use lexical selection (see [`docs/ROADMAP.md`](docs/ROADMAP.md)).

## Disclosures

- The code in this repository was written during the official hackathon rounds. No earlier code or templates were reused apart from the
  `create-next-app` starter. Round 2 commits are dated 13–16 Nov 2026; final-round commits are dated 19 Nov 2026.
- AI tools used: **Claude (Anthropic)** as a coding assistant for writing, reviewing and testing code and documentation in both rounds,
  including the final round's implementation. **Google Gemini** is a runtime component of the product (AI check, guideline extraction,
  image vision). See [`docs/TOOLS_DISCLOSURE.md`](docs/TOOLS_DISCLOSURE.md).
- Open-source libraries are listed in `package.json`.
