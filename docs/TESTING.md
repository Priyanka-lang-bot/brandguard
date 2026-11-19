# Testing

All results below were produced on 2026-11-19 from the final-round commits. Nothing in this file was estimated.

## Results

| Suite | Command | Result |
| --- | --- | --- |
| Lint | `npm run lint` | 0 problems (the one Round 2 error was fixed) |
| Types | `npx tsc --noEmit` | 0 errors |
| Unit / integration | `npm test` | **33 / 33 passed** |
| Migrations + RLS (Postgres 16) | `npm run test:sql` | **Passed** (both migrations apply in single transactions) |
| Production build | `npm run build` | Passed (13 routes) |
| End-to-end judge journey | `bash tests/e2e/run.sh` | **49 / 49 checks passed** |
| Scroll-driven product demo | `BASE=… python3 tests/e2e/scroll_demo.py` | **37 / 37 checks passed** (3 desktop sizes; phone, tablet, short laptop; reduced motion) |
| Accuracy (rules only) | `npm run eval` | Precision 100.0%, recall 70.3% |
| Accuracy (rules + Gemini) | `GEMINI_API_KEY=… npm run eval` | **Not executed: no key available** |
| Live deployment | — | **Not verified for the final-round code**: the new commits have not been pushed or deployed yet (see OWNER_ACTIONS.md) |

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
