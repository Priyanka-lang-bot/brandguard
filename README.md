# BrandGuard

BrandGuard is a pre-publication checkpoint for brand content. A creator submits a draft; BrandGuard checks it against the
organisation's own guidelines, terminology and approved facts and returns findings. Each finding quotes the exact words,
cites the Brand Kit source it breaks, explains why and offers a minimal fix. The creator accepts, edits or disputes each
finding and sends the draft to a reviewer, who approves it or asks for changes.

Built for the We Code Coders hackathon (problem statement by Inkloom AI) by team **404** (solo).

## Try it

Open the deployed link and pick a demo role on the sign-in page. The demo brand, **Lumio**, is a fictional study app.

1. **Creator (Kabir)** — open *Welcome email for new learners* (already checked) or click **New draft** → *Launch post with errors*.
   Accept, edit or dispute each finding, then **Send for review**.
2. **Reviewer (Riya)** — switch role in the top bar, open the draft from the review queue, read the resolutions and disputes,
   look at the **Changes** tab, then **Approve** or **Request changes**.
3. **Admin (Asha)** — the **Brand Kit** page: rules, terminology, Fact Vault (with expiry dates) and guideline PDF import with
   per-rule approval. *Reset demo data* restores the sample content.

## How the check works

1. **Rule checks (deterministic).** Banned term variants and regex patterns attached to rules (e.g. `\bguarantee(d)?\b`,
   `!{2,} => !`). Exact, fast, and they still run if the AI is unavailable.
2. **AI check (Gemini, structured JSON).** The model receives the active Brand Kit with citable codes (`TONE-1`, `TERM-3`,
   `FACT-4` …), the creator's stated purpose and the draft. Expired facts are marked as expired.
3. **Grounding gate.** Every AI finding is discarded unless it cites a real Brand Kit code *and* its quote is found in the draft.
   Suggestions identical to the original are dropped.
4. **Merge.** Rule and AI findings for the same span and source are de-duplicated; the AI's contextual fix is used where the rule
   match has none.
5. Resolutions are applied as a new **version**; disputes carry over when a re-check flags the same words for the same source.

## Stack

- Next.js 15 (App Router, Server Actions), TypeScript, Tailwind CSS v4
- Supabase: Postgres, Auth, row-level security on every table
- Google Gemini (`gemini-flash-latest` by default, configurable) via REST with a response schema
- `mammoth` (DOCX) and `unpdf` (PDF) for text extraction, `diff` for version comparison
- Hosted on Vercel

## Run your own copy

1. Create a Supabase project. In **SQL Editor**, run `supabase/migrations/0001_init.sql`.
2. Set environment variables (Vercel → Project → Settings → Environment Variables, or `.env.local`):

   | Variable | Value |
   | --- | --- |
   | `NEXT_PUBLIC_SUPABASE_URL` | Supabase Project URL |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon (public) key |
   | `SUPABASE_SERVICE_ROLE_KEY` | Supabase service_role key (server only) |
   | `GEMINI_API_KEY` | Google AI Studio key |
   | `SETUP_TOKEN` | Any long random string |
   | `GEMINI_MODEL` | Optional, defaults to `gemini-flash-latest` |

3. Deploy, then open `https://<your-app>/api/setup?token=<SETUP_TOKEN>` once. This creates the demo users, Brand Kit and
   sample drafts. (Locally: `npm run seed`.)

Tests for the check engine: `npm test`.

## Disclosures

- All code in this repository was written during the official hackathon window. No earlier code or templates were reused apart
  from the `create-next-app` starter.
- AI tools used: **Claude (Anthropic)** as a coding assistant for writing and reviewing code; **Google Gemini** is a runtime
  component of the product (the AI check and guideline extraction).
- Open-source libraries are listed in `package.json`.
