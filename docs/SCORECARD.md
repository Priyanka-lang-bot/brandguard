# Final-round self-assessment (honest scorecard)

Scored against the official final-round rubric on 21 Nov 2026. Marks are given only for what is implemented **and** backed by
evidence (a test, a measurement or a production check), not for what appears in the interface. Two columns: the product **as
deployed today** (production runs `4adf0a0`) and **after the owner actions** in `docs/OWNER_ACTIONS.md` (push, migration 0003,
sample data). Neither column assumes the Gemini accuracy numbers, because they have not been measured.

| Criterion | Max | As deployed today | After owner actions | Evidence and deductions |
| --- | --- | --- | --- | --- |
| Product completeness | 25 | 18 | 21 | Full draft → analyse → findings → fix → review → approve loop, three roles, Brand Kit (rules, terms, Fact Vault, palette, logos, confidential terms, PDF import), image checks, insights, masking. Production check 21 Nov: sign-in, dashboard, Insights and a live Gemini check work. **Deductions:** production lacks the audit fixes, sample data and theme until pushed; reviewer approval, image upload and theme not verified on production; one workspace per deployment in practice. |
| Three improvements delivered | 20 | 15 | 15 | See the Round 2 commitments below. **Deductions:** vision-mode image catch rate and rules + Gemini accuracy not measured (no key where the evaluations ran); image pixels are not masked. |
| Reliability under normal use | 20 | 13 | 15 | 43 unit tests, RLS and migration tests, 49-check journey, 21-check robustness, 37-check scroll demo, theme and seed-safety suites all pass locally. Gemini fallback on timeout/429/5xx. **Deductions:** a production-only bug (NULL finding status in batch inserts) reached the live site on 21 Nov before the stand-in was made faithful; end-to-end tests use local stand-ins for Supabase and Gemini; the timeout fallback is not yet verified on production; React hydration error #418 on ~1.25% of page loads (recovered automatically; root cause not found, see Testing). |
| Usability and real-world fit | 20 | 14 | 17 | One-click demo roles, per-role guidance, every finding cites its source and offers accept/edit/dispute, dispute reasons reach the reviewer, dark/light themes, mobile layouts checked at 390 px. **Deductions:** production data is thin until the sample data is added; dense finding cards on small screens; no notifications or integrations with publishing tools. |
| Documentation and roadmap | 15 | 13 | 13 | README, architecture, features, improvements, testing (with reproduction steps), roadmap, tool disclosure, owner actions, this scorecard and the PDF report with real screenshots. **Deduction:** the accuracy section still lacks the AI numbers. |
| **Total** | **100** | **73** | **81** | Adding the Gemini evaluation results (owner action 4) could recover up to about 3–4 marks if the numbers are reasonable; they could also cost marks if they are poor. |

## Round 2 commitments, rechecked

| Round 2 commitment | Status | Evidence |
| --- | --- | --- |
| **1. Image & accessibility checks**: palette, text contrast below the brand minimum (default 4.5:1), alt text, logo misuse, text inside images; catch ≥ 85% of planted problems on a 20-image set | **Delivered; vision accuracy unmeasured** | `src/lib/images/*`, unit tests in `tests/images.test.ts`, migration 0003 brand minimum. 24-image set: measurement mode 46/46 caught, 0 false positives. Vision mode (Gemini supplies text positions and logos) **not executed**. Seeded "Exam season poster" shows palette, contrast, alt-text and in-image term findings from real pixel measurements. |
| **2. Brand insights dashboard**: most-broken rules, most-disputed rules, "possibly unclear" flag, drill-down to drafts, approval time | **Delivered** | Three `security_invoker` views with RLS, `tests/insights.test.ts`, RLS tests (an outsider workspace sees zero insight rows), production Insights page loads with live data (21 Nov). Charts are computed from stored records; seeded history is flagged and can be excluded. |
| **3. Trust: confidentiality masking + measured accuracy** | **Masking delivered; accuracy partial** | Masking: `tests/mask.test.ts` and captured AI payloads in the E2E journey show placeholders instead of emails, phones, unreleased products and patterns. Accuracy: dataset (59 posts, 64 planted errors), scorer and CI exist; rules only: precision 100.0%, recall 70.3%. **Rules + Gemini run not executed** (needs the `GEMINI_API_KEY` repository secret). |

## Remaining deductions a judge is likely to make

1. No measured AI accuracy (both text and vision). This is the single biggest gap, and owner action 4 fixes it.
2. Production lags the repository until the bundle is pushed and the sample data is added.
3. End-to-end evidence comes from local stand-ins; production evidence is a manual browser check of sign-in, dashboard, Insights and
   one Gemini analysis.
4. An intermittent, self-recovering hydration error is logged in the browser console on about 1 in 80 page loads.
