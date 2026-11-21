# Testing

All results below were produced on 2026-11-19 and 2026-11-20 from the final-round commits. Nothing in this file was estimated.

## Results

| Suite | Command | Result |
| --- | --- | --- |
| Lint | `npm run lint` | 0 problems (the one Round 2 error was fixed) |
| Types | `npx tsc --noEmit` | 0 errors |
| Unit / integration | `npm test` | **43 / 43 passed** |
| Migrations + RLS (Postgres 16) | `npm run test:sql` | **Passed** (0001–0003 apply in single transactions; RLS suite passes) |
| Migration 0003 safety | `bash tests/sql/migration_0003_test.sh` (part of `test:sql`) | **All checks passed**: fresh DB, second run is a no-op, a populated DB keeps every row and setting, out-of-range values rejected, insight views unaffected, and without 0002 it stops with a clear message and changes nothing |
| Production build | `npm run build` | Passed (13 routes) |
| End-to-end judge journey | `bash tests/e2e/run.sh` | **49 / 49 checks passed** |
| Robustness (bad input, refresh, double actions, broken URLs, permissions, empty states) | `BASE=… python3 tests/e2e/robustness.py` | **21 / 21 checks passed** (incl. re-checking a draft with a carried-over dispute) |
| Demo seed safety (stand-in fidelity, empty DB, 3 re-runs, genuine data present, RLS isolation, interrupted runs) | `bash tests/e2e/seed_idempotency.sh` | **All checks passed**: the stand-in rejects a mixed-key batch like PostgREST does; a sample left half-written at the findings insert (the exact production state of 21 Nov) is completed in place; identical row counts on every re-run; a genuine draft, a custom rule and an admin-edited fact survive untouched; an admin in another workspace sees 0 sample drafts, findings, rules, facts or insight rows; a creator cannot edit another author's draft |
| Dark / light theme | `BASE=… python3 tests/e2e/theme.py` | **All checks passed**: dark by default, toggle, persists across reload and navigation, applied before first visible element, saved theme restored if React re-creates the `<html>` attributes, both themes on 8 routes at 1366 px and 390 px with no overflow or page errors, seeded data per role |
| Hydration soak (informational) | `BASE=… SOAK_ROUNDS=120 python3 tests/e2e/hydration_soak.py` | 480 loads: 6 hydration errors (1.25%), saved theme lost on 0 pages. See "Known intermittent issue" below |
| Scroll-driven product demo | `BASE=… python3 tests/e2e/scroll_demo.py` | **37 / 37 checks passed** (3 desktop sizes; phone, tablet, short laptop; reduced motion) |
| Accuracy (rules only) | `npm run eval` | Precision 100.0%, recall 70.3% |
| Image accuracy (measurement mode) | `npm run eval:images` | 46 / 46 planted problems caught, 0 false positives (24 images) |
| Image accuracy (vision mode) | `GEMINI_API_KEY=… npm run eval:images` | **Not executed: no key available** |
| Accuracy (rules + Gemini) | `GEMINI_API_KEY=… npm run eval` | **Not executed: no key available** |
| Live deployment (runs `4adf0a0`) | browser check, 2026-11-21 | Signed-in session as Asha (Supabase auth), dashboard and Insights load live data (database, RLS views from 0002). A new draft from *Launch post with errors* got **11 findings from rules + real Gemini** in about 20 s, several marked "AI, verified" and grounded in Fact Vault entries (draft "Production check 21 Nov (Claude) — safe to delete" was created). Not checked on production: image upload, reviewer approval, masking payloads, theme (not deployed yet), sample data (not added yet). On 20 Nov the live AI pass had timed out once |

## What each suite covers

**`tests/engine.test.ts`.** Rule and terminology checks on the demo drafts, the grounding gate (unknown codes and invented quotes
discarded), merge, resolution application, nested fix composition, and term de-duplication.

**`tests/mask.test.ts`** (13 tests).
- Emails; phones (positive cases, and prices, dates, year ranges and counts that must not be masked); confidential terms and
  unreleased products (whole word, any case and spacing); admin patterns and pattern validation.
- Overlaps; same-value consistency; collision-proof nonce; no cross-request restore; bracket tolerance; the `assertClean` refusal.
- **Captured outgoing payloads** for the draft check and guideline import contain no originals, and the restored quotes pass the
  grounding gate against the original text.
- AI failure logs contain no content.

**`tests/images.test.ts`** (11 tests). WCAG reference values; CIEDE2000 reference pair; type sniffing and rejection of GIF, damaged
and oversize files; palette shares; region contrast; alt-text heuristics; vision grounding; **the acceptance poster**; logo
current/retired; the no-AI fallback; masked logo names.

**`tests/insights.test.ts`** (6 tests). Most-broken rules, dispute rate and flag with its minimum, terminology grouping, filters,
creator repeats, approval median and average, resolved-before-review, weekly and channel trends, and Monday-UTC weeks matching
Postgres.

**`tests/retrieval.test.ts`** (2 tests). Small kits are sent whole. Large kits keep relevant entries and the original TERM-n codes.

**`tests/sql/rls_test.sql`.**
- The sign-up trigger.
- A creator sees only their workspace (drafts, rules, confidential terms, all three insight views) and cannot write the Brand Kit,
  confidential terms or settings.
- Images can be added only to the author's own editable draft, and only as PNG/JPEG. Storage uploads are allowed only into the
  user's own workspace folder, and brand assets only by admins.
- The admin's view of dispute stats and the flag, and hours to approval.
- The other workspace's admin sees none of it and cannot update it. Anonymous access is denied.
- Mutation checks were run by hand to confirm that the suite fails when `security_invoker` is off or a storage policy is loosened.

**`tests/e2e/journey.py`** runs against a production build.
- Landing page (unauthenticated 200, every nav item has a target section, scripted demo, CTA) → creator login → signed-in landing CTA
  → Brand Kit.
- Unsupported image rejected.
- A draft with an email, a phone number, an unreleased product, an internal code and the poster image produces text, AI-verified and
  image findings (VIS-1, ACC-4, ACC-2, VIS-2, banned phrase in the image), with the original email shown to the user.
- Accept, edit and dispute, resolve the rest, send for review, Changes tab, Versions tab.
- Reviewer approves; audit log.
- Admin insights: flag, drill-down from the top rule, "Edit this rule" saves, channel filter, demo exclusion.
- Creator blocked from insights; mobile menu; no client JS errors.
- Finally, **every logged AI request is scanned for the four secrets** (none found; placeholders present).

## Production bug found on 21 Nov 2026 (fixed in code, needs deploy)

**Symptom:** "+ Add sample data" on production failed with `insert findings: null value in column "status" of relation
"findings" violates not-null constraint`.

**Cause:** for a batch insert, supabase-js sends the union of all rows' keys as `?columns=` and, by default
(`defaultToNull: true`), no `Prefer: missing=default`. PostgREST then stores NULL, not the column default, for a key a row
lacks. The seed inserted open findings (no `status` key) in the same batch as resolved ones (`status` set), so the open rows got
NULL in `findings.status` (`NOT NULL DEFAULT 'open'`, enum `open | accepted | edited | disputed`). The same pattern was in the
app's re-check (`addCheckedVersion`): a carried-over disputed finding next to new findings, so re-checking a draft that had a
dispute would also have failed on production.

**Why the tests missed it:** the local Supabase stand-in applied column defaults to missing keys regardless. It now follows
PostgREST (defaults only with `Prefer: missing=default`), and the seed test checks that.

**Fix:** every findings row sets `status` and the resolution columns explicitly (`findingRow()` in the seed, the re-check
rows in `drafts.ts`). The seed is now resumable: a sample counts as complete only when its activity events exist (written
last); a half-written sample is completed in place (existing draft, versions, image and findings are reused; nothing is deleted
or overwritten). Reproduced first with the old code (seed and re-check both fail with the exact message), then passing.

## The local stand-ins (how E2E runs without cloud credentials)

- `tests/e2e/mock-supabase.mjs` implements the subset of Supabase REST (PostgREST filters, insert/upsert/update/delete,
  single-object responses), Auth (password grant, refresh, user, admin users) and Storage (upload, download, remove, signed URLs) that
  BrandGuard uses. Every request runs inside a Postgres transaction as `anon`, `authenticated` or `service_role`, with the JWT
  subject set, so **RLS is enforced by Postgres** on the real migrations.
- `tests/e2e/mock-gemini.mjs` is **not an AI**. It returns scripted, schema-valid answers (including one deliberately ungrounded
  finding, which the grounding gate must discard) and logs every request body.
- The app reaches it through `GEMINI_API_BASE`, a test-only override. Production uses Google's endpoint.

Screenshots in `docs/screenshots/` that show AI findings come from these runs. Explanations that start with "Stub:" are from the
stand-in, not from Gemini.

## Reproduce

```bash
npm ci
npm run lint && npx tsc --noEmit && npm test
# Postgres 15+ running locally:
PGHOST=/tmp PGPORT=54329 PGUSER=postgres npm run test:sql
PGHOST=/tmp PGPORT=54329 PGUSER=postgres bash tests/e2e/run.sh   # needs Python 3 + playwright and Chrome
npm run eval                                                       # add GEMINI_API_KEY for the AI run
```

## Reliability behaviour checked

| Situation | Behaviour | How checked |
| --- | --- | --- |
| Missing Gemini key | Rule checks only; banner and event explain why | unit (`runCheck`), image no-AI test |
| Gemini error / 5xx / timeout | Retry on the fallback model, then rule checks only; log has a reason only | unit (log scan) |
| Masking safety check fails | Request not sent; rule checks only | unit |
| Unsupported or damaged file | Clear error, nothing stored | unit + E2E |
| Repeated check of the same content | AI result reused from cache | E2E event log |
| Overlapping accepted fixes | Composed; partial overlaps reported | unit |
| Migration 0002 not applied | Core flow works; new sections show a "needs the database update" notice | code paths (`hasFinalRoundSchema`, tolerant `loadKit`) |
| Auth service unreachable | Public pages still load | middleware try/catch |
| Page error | Error boundary with retry | — |
| Permission violations | Blocked in RLS and server actions | SQL + E2E |

## Known intermittent issue: React hydration error #418 (pre-existing, not fixed)

**Symptom.** About 1 in 80 production-build page loads (6 of 480 in the latest soak; 4–5 of 480 in other runs) logs React
error #418 in the browser console. React then re-renders that part of the page on the client, so the user still gets a working page.
It happens at the same rate on `f440dfd`, the commit before the theme and sample-data work, and never under `next dev`.

**What was ruled out, with evidence:**

| Hypothesis | Test | Result |
| --- | --- | --- |
| Server renders different HTML | Saved the document of failing loads and compared it with a passing load of the same page | No differences found in the body markup |
| Theme script / `data-theme` on `<html>` | Removed the attribute from the server render; baseline commit has no theme code | Still fails at the same rate |
| Streaming metadata (`<div hidden>`) | `htmlLimitedBots: /.*/` (blocking metadata) | 4 errors / 480 loads: no change |
| Hydration starts before the document is parsed | Recorded `document.readyState` when the error fires | Always `complete` |
| Something else edits the DOM before hydration | MutationObserver log from DOMContentLoaded to the error | Nothing but React's own recovery re-render |
| Inline RSC data scripts land inside tables or lists | Scanned 300 streamed pages | 0 occurrences |
| Link prefetch updates during hydration | Delayed every prefetch request by 3 s | 5 errors / 480 loads: no change |
| Time- or browser-dependent values in client components | Code review of every client component on the affected pages | None found |

**What React reports** (temporary diagnostic build using React's development messages, `experimental.allowDevelopmentBuild`):
the mismatch sits at the first element of the page segment (`InnerLayoutRouter`). On the dashboard, React expected the table's
`<tbody>` where the DOM cursor was on its first `<tr>`, which points to React's hydration cursor getting out of step during
concurrent hydration rather than to different markup. The affected pages are the largest ones (dashboard, insights, landing).

**What was fixed.** The one user-visible effect: React's recovery re-render strips `data-theme` from `<html>`, which used to flip a
light-theme user to dark. The theme script now restores the saved theme whenever that attribute changes (`theme.py` and the soak
check this; 0 of 6 recoveries lost the theme). The error itself is not suppressed or filtered anywhere, and the journey and
robustness suites still fail if it appears, so a run can occasionally fail on that one check.

**Remaining risk.** Likely a Next.js 15.5 / React 19.1 issue; upgrading close to the deadline was judged riskier than the bug.
Next step: try the latest Next 15.x / React 19.x patch releases with the soak test as the gate.
