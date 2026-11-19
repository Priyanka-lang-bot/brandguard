# Roadmap

Priorities: P0 = needed before real customers, P1 = next quarter, P2 = later.

| # | Item | Priority | Depends on | Milestone |
| --- | --- | --- | --- | --- |
| 1 | Run the rules + Gemini evaluation in CI and publish precision, recall and grounding rejection | P0 | `GEMINI_API_KEY` secret | M1 (week 1) |
| 2 | Grow the evaluation set to 200+ posts written by someone other than the rule author; add image cases with real photos | P0 | 1 | M1–M2 |
| 3 | Multiple workspaces, invitations and admin role management UI | P0 | — | M2 (weeks 2–4) |
| 4 | Mask image pixels: blur emails and phone numbers found by local OCR before vision calls | P1 | an on-device OCR library | M3 |
| 5 | pgvector retrieval for large Brand Kits (embeddings per rule and fact, refreshed on change) | P1 | `vector` extension, embedding model | M3 (weeks 5–8) |
| 6 | Local logo template matching (perceptual hashes) as a second opinion to the vision model | P1 | — | M3 |
| 7 | Text-area-accurate WCAG large-text detection (font-size estimate from glyph height) | P1 | — | M3 |
| 8 | Rule-edit suggestions from dispute reasons ("possibly unclear" → draft rewording for the admin) | P2 | 1, 3 | M4 (weeks 9–12) |
| 9 | Integrations: Google Docs / Notion / CMS plugins that check before publish | P2 | 3 | M4 |
| 10 | Scheduled re-checks when a fact expires (notify owners of approved content that is now outdated) | P2 | — | M4 |

Milestones: **M1** measured AI accuracy. **M2** multi-tenant beta. **M3** visual governance v2 and retrieval at scale.
**M4** workflow integrations.
