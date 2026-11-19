# Tool disclosure

## AI coding tools

- **Claude (Anthropic)** was used as a coding assistant in Round 2 and in the final round. In the final round it inspected the
  repository and planned the work, then wrote most of the new code, migrations, tests, evaluation dataset and documentation, ran the
  test suites, and produced this report. Final-round commits carry a `Co-Authored-By: Claude` trailer.
- No other AI coding assistants are recorded in the repository history. *(Participant: add any other tool you used, e.g. GitHub
  Copilot, before submitting.)*

## AI at runtime

- **Google Gemini** (`gemini-3.5-flash`, fallback `gemini-3.5-flash-lite`, configurable) through the Generative Language REST API:
  draft checks, guideline rule extraction and image vision (text regions, alt text, logo match). It receives masked text (see
  `/ai-disclosure`).

## Significant open-source libraries

Next.js, React, TypeScript, Tailwind CSS, `@supabase/supabase-js` and `@supabase/ssr`, `sharp` (libvips), `mammoth`, `unpdf`,
`diff`, `zod`, `server-only`, Fontsource (`@fontsource-variable/archivo`, `@fontsource/instrument-serif`, both OFL). Dev and test
only: ESLint, `tsx`, `pg`, Playwright (Python).

## Services

Supabase (Postgres, Auth, Storage), Vercel (hosting), Google AI Studio (Gemini API).
