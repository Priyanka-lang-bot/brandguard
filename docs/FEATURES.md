# Feature list

Status key: **Done** = implemented and tested (unit/SQL/E2E as noted). **Partial** = works with a stated gap. **Deferred** = not built in this round.

## A. Existing Round 2 functionality (preserved)

| Feature | Status | Notes |
| --- | --- | --- |
| Creator, Reviewer and Admin roles | Done | Enforced in RLS and in server actions |
| One-click demo login and role switcher | Done | E2E checked |
| Email sign-up / sign-in | Done | Sign-ups join the demo workspace as creators |
| Brand Kit: rules with codes, severities, regex patterns | Done | |
| Guideline PDF/DOCX import with per-rule admin approval | Done | Now masked before the AI request |
| Approved terminology (preferred + banned variants) | Done | Fixed this round: overlapping/case-duplicate variants no longer double-report |
| Fact Vault with expiry dates | Done | Expired facts marked in the AI prompt |
| Text, DOCX, PDF, TXT intake | Done | |
| Deterministic rule engine | Done | |
| Gemini-powered checks with fallback model | Done | |
| Grounding validator | Done | |
| Highlighted findings, suggested fixes | Done | |
| Accept / edit / dispute (with reason) | Done | E2E checked |
| Reviewer queue, approve / request changes | Done | E2E checked |
| Version history, word diffs, audit log | Done | E2E checked |
| Supabase RLS and workspace security | Done | Now covered by an automated SQL test suite |

## B. Improvements completed in the final round

| Feature | Status | Evidence |
| --- | --- | --- |
| Public editorial landing page at `/` (nav anchors, scripted workflow demo, honest feature/security copy) | Done | E2E: page loads unauthenticated, every nav item has a target, CTAs reach `/login`; signed-in users see "Open workspace" |
| **Improvement 1. Image & accessibility checks** | Done | See [IMPROVEMENTS.md](IMPROVEMENTS.md) |
| PNG/JPG upload with drafts (type sniffed from bytes, 4 MB limit) | Done | Unit + E2E (GIF rejected) |
| Dominant colours (sharp, CIELAB k-means) vs palette, nearest brand colour (CIEDE2000) | Done | Unit + acceptance test |
| WCAG 2.2 contrast on text regions with measured ratio and a fixed colour suggestion | Done | Unit (reference values) + acceptance |
| Missing/weak alt text with Gemini vision suggestion; accepting it updates the image's alt text | Done | Unit + E2E |
| Text inside images read by Gemini vision, then normal text checks | Done | Acceptance (vision stubbed), E2E (stub) |
| Logo presence and version vs uploaded Brand Kit logo files | Done | Unit (current/retired/none) |
| Logo misuse: stretched / recoloured, measured against the reference file | Done | Unit (measured aspect ratio and ΔE00) + image eval |
| Brand minimum contrast (default 4.5:1, admin setting) | Done | Unit; needs migration 0003 on the database |
| Image findings must cite a Brand Kit rule (no rule → no finding) | Done | Unit |
| 20-image test set with planted problems (target ≥ 85%) | Partial | 24 images, measurement mode 46/46. Vision mode not run (no key) |
| Brand Kit → Visual identity (palette, logo upload, current/retired) | Done | E2E screenshot |
| **Improvement 2. Brand insights dashboard** | Done | See [IMPROVEMENTS.md](IMPROVEMENTS.md) |
| `security_invoker` SQL views + configurable dispute threshold | Done | SQL tests (isolation, de-duplication, flag) |
| Most-broken rules, terminology repeats, creator repeats, dispute rate per rule, time to approval, weekly and channel trends, resolved before review | Done | Unit tests on the maths; E2E |
| "Possibly unclear" flag with links to rule edit, disputed drafts, underlying findings | Done | E2E |
| Filters (channel, creator, include/exclude demo history) and drill-down on every metric | Done | E2E |
| **Improvement 3A. Confidentiality masking** | Done | See [IMPROVEMENTS.md](IMPROVEMENTS.md) |
| Brand Kit → Confidential (terms, unreleased products, regex patterns) | Done | E2E screenshot |
| Masking on every AI path (check, guideline import, image text, logo names) with restore and a send-time safety check | Done | Unit (captured payloads) + E2E (logged payloads) |
| **Improvement 3B. Measured accuracy** | Partial | 59-post dataset, script, CI. Rules-only measured (P 100%, R 70.3%). **The AI run has not been executed: no API key was available here** |
| Result cache keyed by content + Brand Kit version + date | Done | E2E event log shows "AI result reused from cache" |
| Workspace AI disclosure page `/ai-disclosure` | Done | |
| Brand Kit retrieval for large kits | Partial | Lexical selection implemented and tested; pgvector deferred |
| Nested accepted fixes compose instead of blocking submission | Done | Found by E2E, unit-tested |
| Gemini fallback model also used when the main model times out (found on the live site) | Done | Unit (hung / overloaded / both hung) |
| Demo sign-in shows progress while signing in | Done | — |
| Error boundary, 404 page, middleware resilient to auth outage | Done | |
| CI workflow (lint, types, unit, SQL/RLS, build, eval, E2E) | Done | File present. It runs once the commits are pushed |

## C. Partially implemented

- **AI accuracy numbers.** The scripts and CI are ready for text and images. The numbers need a `GEMINI_API_KEY` secret.
- **Large-kit retrieval.** Lexical, not pgvector.
- **WCAG large-text detection.** Estimated from region height.

## D. Deferred

- pgvector embeddings for Brand Kit retrieval (needs an embedding model call per kit change plus the `vector` extension; not
  testable here without a key).
- Masking of image pixels (e.g. blurring detected emails before vision). Today this is documented as a limitation.
- Multiple workspaces per account and workspace invitations (sign-ups join the demo workspace).
