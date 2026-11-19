# Technical architecture

## Components

```
Browser (React 19, server components + small client components)
   │  server actions / route handlers (Next.js 15 on Vercel, region icn1)
   ▼
src/app/actions/*        drafts.ts · kit.ts · auth.ts · insights.ts
src/lib/engine/*         deterministic.ts · gemini.ts · validate.ts · retrieval.ts · index.ts (runCheck, cache key)
src/lib/privacy/*        mask.ts (placeholders, restore, assertClean) · config.ts (from Confidential Terms)
src/lib/images/*         analyze.ts (sharp) · color.ts (Lab, ΔE00, WCAG) · vision.ts (Gemini) · findings.ts · pipeline.ts · store.ts
src/lib/insights*.ts     pure metrics + view loading
   │                                   │
   ▼                                   ▼
Supabase (Postgres + RLS, Auth, Storage)      Google Gemini generateContent (text + vision)
```

## Routes

| Route | Access | Purpose |
| --- | --- | --- |
| `/` | public | Landing page; "Open workspace" when signed in |
| `/login` | public | Demo roles, email sign-in/up |
| `/ai-disclosure` | public | What goes to the AI; workspace settings when signed in |
| `/dashboard` | member | Queue, own drafts, workspace drafts |
| `/drafts/new` | creator, admin | Text/file intake + images |
| `/drafts/[id]` | member | Findings, images, changes, versions, activity, review |
| `/brand-kit` | member (admin edits) | Rules, terms, facts, visual identity, confidential, import |
| `/insights`, `/insights/drafts` | admin | Dashboard and drill-down |
| `/api/setup` | `SETUP_TOKEN` | Seed / Gemini diagnostics |

## Data model

0001 (Round 2): `workspaces`, `profiles(role)`, `guideline_rules`, `terms`, `facts`, `drafts`, `draft_versions`, `findings`,
`draft_events`.

0002 (final round, additive): `workspace_settings` (dispute threshold), `confidential_terms`, `brand_colors`, `brand_logos`,
`draft_images` (with stored `analysis` JSON), `check_cache`, `findings.image_id`, `guideline_rules.check_key`, `drafts.demo_seed`,
storage buckets `draft-images` and `brand-assets`, and the views `insight_findings`, `insight_drafts` and `insight_source_stats`.

## Security

- RLS is on for every table. `my_workspace()` and `my_role()` are SECURITY DEFINER helpers. Brand Kit, palette, logos, Confidential
  Terms and settings are admin-write and member-read. Drafts, versions, findings and images can be written by the author while the
  draft is editable.
- Storage: objects live under `<workspace_id>/…`. Policies check the first folder against `my_workspace()`. Brand assets are admin-only.
  Images are shown through 1-hour signed URLs.
- Insights views use `security_invoker = on`, so the caller's RLS applies. A mutation test proves that switching it off leaks rows.
- `SUPABASE_SERVICE_ROLE_KEY` and `GEMINI_API_KEY` are only read in server code (`server-only` modules, server actions).
- Uploads: the type is sniffed from the bytes (PNG/JPEG only), with 4 MB and 40 MP limits, decoded by sharp before storage, and a
  DB check constraint on MIME.

## AI data flow

1. `runCheck` → deterministic findings.
2. `aiCheck` builds the whole user prompt (Brand Kit [selected if large] + metadata + draft) → `createMasker(config, [prompt])` →
   `mask` → `assertClean` → Gemini → findings restored (`quote`, `suggestion`, `explanation`) → `validateAiFindings` (grounding gate) →
   `mergeFindings`.
3. Cache: `sha256(content, title, channel, purpose, kitVersion, date)` → `check_cache`.
4. Images: `inspectImage` → `measurePalette` → (vision: masked logo labels + image) → `groundVision` → `measureRegionContrast` per
   text block → stored analysis → `imageFindings` + text checks on extracted text, on every (re)check.

## Insights definitions

- **Issue** = one row of `insight_findings`: the same source flagging the same words in the same draft, with the latest version's
  status, so re-checks don't inflate counts.
- **Dispute rate** = disputed ÷ issues. **Possibly unclear** = dispute rate ≥ threshold and issues ≥ minimum (workspace settings,
  defaults 30% and 3).
- **Time to approval** = first `submitted` event → last `approved` event.
- **Resolved before review** = share of issues on submitted drafts that the creator accepted or edited.
