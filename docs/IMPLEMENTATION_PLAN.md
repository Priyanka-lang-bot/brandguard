# BrandGuard final round: implementation plan

Written on 2026-11-19 after inspecting the repository at commit `c598e8a`. It describes the code as it actually is, not as assumed.

## 1. Baseline (before any change)

| Check | Result |
| --- | --- |
| `npm ci` | OK (380 packages) |
| `npm test` (engine tests, `tests/engine.test.ts`) | Pass |
| `npx tsc --noEmit` | Pass |
| `npm run lint` | **1 error**: `no-explicit-any` in `tests/engine.test.ts` |
| `npm run build` | Pass (8 routes) |
| Live site `/login` | Loads (checked in a browser) |

## 2. What exists today

**Routes**: `/` (redirects to `/dashboard`), `/login` (demo role buttons, email sign-in/sign-up), `/dashboard`, `/drafts/new`, `/drafts/[id]`, `/brand-kit`, `/api/setup` (token-protected seed and Gemini diagnostics).

**Server actions**: `actions/auth.ts` (sign-in, sign-up through the service role, demo sign-in, role switch), `actions/drafts.ts` (create, resolve finding, recheck, submit, review decision, comment), `actions/kit.ts` (rules, terms, facts CRUD, guideline import, demo reset).

**Check engine** (`src/lib/engine`):
1. `deterministic.ts`: banned-term variants (Unicode-aware word boundaries, case-only variants) and regex patterns on rules (`pattern => replacement`).
2. `gemini.ts`: one structured-JSON Gemini call with the Brand Kit as citable codes; fallback model on 429/5xx; guideline-extraction call.
3. `validate.ts`: grounding gate (must cite a real code, and the quote must be found in the draft), merge, and resolution application.

**Data model** (`supabase/migrations/0001_init.sql`): workspaces, profiles (role enum), guideline_rules, terms, facts, drafts, draft_versions, findings, draft_events. RLS is on for every table, with `my_workspace()` / `my_role()` SECURITY DEFINER helpers. Brand Kit writes are admin-only. Authors write their own drafts, versions and findings. Reviewers and admins update drafts they did not write.

**Flow**: create → version 1 checked → creator accepts/edits/disputes → recheck creates a new version (disputes carry over) → submit applies fixes as an unchecked version → reviewer approves or requests changes → author edits and re-checks.

## 3. Gaps and issues found

- `/` is a redirect. There is no public landing page.
- `console.error("AI check failed", e)` logs the raw error. Gemini error bodies are truncated, but logs should never carry draft text.
- **Draft text is sent to Gemini unmasked** (check, and guideline import).
- No image handling. `visual` rules exist as a category but nothing checks images.
- No analytics. The dashboard shows four counters.
- The lint error in the tests.
- The Round 2 additional commitments (result caching, pgvector retrieval, AI disclosure page) are not implemented.

## 4. Approach

The guiding principle is additive change: one new migration (`0002_final_round.sql`) and no edits to `0001`. Every new feature degrades gracefully when the migration has not yet been applied, so the deployed app keeps working between a code deploy and the SQL run.

1. **Landing page**: `/` becomes a public, editorial page (proof-reading motif: highlighter marks, margin notes, approval stamp). Self-hosted fonts via Fontsource (no build-time network). CSS-only motion, honouring `prefers-reduced-motion`. The interactive workflow demo is scripted and labelled as such. The middleware treats `/` and `/ai-disclosure` as public. Signed-in users get an "Open workspace" CTA.
2. **Confidentiality masking** (`src/lib/privacy/mask.ts`): emails, phone numbers, Confidential Terms, unreleased products and admin regex patterns are replaced with per-request nonce placeholders. Overlaps are resolved longest-first, collisions are avoided by checking the text for the nonce, and restore only touches this request's tokens. Masking is applied to every AI path: draft check, Brand Kit prompt, guideline import, and text extracted from images. Tests capture the outgoing fetch payload.
3. **Image checks**: PNG/JPG upload to private Supabase Storage. `sharp` handles dominant colours (k-means in Lab) and nearest-palette ΔE. WCAG 2.2 contrast is measured on text regions. Alt-text heuristics, plus Gemini vision for alt text, text-in-image (then the normal text checks) and logo presence against uploaded logo assets. Image findings use the existing findings table (new nullable `image_id`).
4. **Insights**: `security_invoker` views over findings, drafts and events (so RLS applies), a workspace dispute threshold, an admin `/insights` page with channel and creator filters, drill-down to drafts and findings, a "Possibly unclear" flag, and links to edit the rule. Historical demo data is seeded only by the demo seed, with `drafts.demo_seed = true` and a visible label.
5. **Accuracy**: `eval/dataset.json` (50+ posts with planted errors and expected findings), `scripts/eval.ts` (TP/FP/FN, precision, recall, per category, grounding-filter rejection rate), and a GitHub Actions CI workflow that runs the AI evaluation only when a `GEMINI_API_KEY` secret exists.
6. **Remaining commitments**: a result cache keyed by a content + Brand Kit hash; an AI disclosure page; Brand Kit retrieval for large kits (lexical first, pgvector documented if not feasible).
7. **Testing**: unit tests, migration and RLS tests on a local Postgres with an `auth` stub, Playwright on public pages, and an honest list of what could not be run.

## 5. External blockers known up front

- No push access to GitHub from this environment. Commits are delivered as a git bundle for the owner to push.
- No Supabase or Gemini credentials in this environment. The migration must be run in the Supabase SQL editor by the owner. AI-dependent evaluation results can only be produced where `GEMINI_API_KEY` is available.
