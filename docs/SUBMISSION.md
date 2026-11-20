# Round 3 submission checklist (Team 404 · BrandGuard)

Deadline: 21 November 2026, 23:59. Every required item and where it is:

| Required item | Where |
| --- | --- |
| Final working project link | https://brandguard-5siy.vercel.app (public landing page; one-click demo roles at `/login`) |
| Final source-code repository | https://github.com/Priyanka-lang-bot/brandguard |
| Final product PDF | [`docs/BrandGuard_Final_Report.pdf`](BrandGuard_Final_Report.pdf) |
| Complete list of features built | [`docs/FEATURES.md`](FEATURES.md) (Round 2 features, final-round improvements, partial and deferred items); also in the PDF |
| Technical architecture and implementation summary | [`docs/ARCHITECTURE.md`](ARCHITECTURE.md); also in the PDF |
| Improvements completed after Round 2, including the three named | [`docs/IMPROVEMENTS.md`](IMPROVEMENTS.md): original Round 2 wording, done-when status and evidence for each; also in the PDF |
| Testing details | [`docs/TESTING.md`](TESTING.md): results, what each suite covers, how to reproduce; CI in `.github/workflows/ci.yml` |
| Product roadmap and future development plan | [`docs/ROADMAP.md`](ROADMAP.md); also in the PDF |
| Run from the README | [`README.md`](../README.md): setup, environment variables, migrations 0001–0003, seeding, tests |

## Honest status of the three Round 2 improvements

1. **Visual and accessibility checks for images.** Delivered. The 20-image target: measurement mode catches 46/46 planted problems. The
   vision-mode score is pending a Gemini key in CI.
2. **Brand insights dashboard.** Delivered (RLS-protected views, "possibly unclear" flag, drill-down to drafts and findings, edit rule).
3. **Confidentiality masking and measured accuracy.** Masking delivered and verified on captured AI payloads. Accuracy: 59-post dataset
   and automated precision, recall and grounding measurement delivered. Rules-only results are published; **rules + Gemini numbers are
   pending a Gemini key in CI**.

## Before the deadline (owner)

See [`OWNER_ACTIONS.md`](OWNER_ACTIONS.md): push the latest commits, run migration 0003, reset the demo data on production, add the
`GEMINI_API_KEY` secret and copy the AI results into the README.
