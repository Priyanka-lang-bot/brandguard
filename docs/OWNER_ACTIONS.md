# What the owner needs to do (about 15 minutes)

The final-round work is committed locally on top of `main` (`c598e8a`), but **it has not been pushed or deployed**. The build
environment had no push permission for the repository, and it had no Supabase, Vercel or Gemini credentials. Do these steps in order.

## 1. Run the database update (Supabase)

Supabase dashboard → your BrandGuard project → **SQL Editor** → paste the whole of `supabase/migrations/0002_final_round.sql` → **Run**.
It is additive and safe on the existing database. It adds new tables and columns, two private storage buckets and the insights views.
It changes no existing data.

(If you push before running it, the app still works, but images, insights and Confidential Terms show a "needs the database update"
notice.)

## 2. Push the commits (GitHub → Vercel deploys automatically)

You received `brandguard-final.bundle`. In your local clone of the repo:

```bash
git checkout main
git pull                                   # make sure you're at c598e8a or later
git pull /path/to/brandguard-final.bundle main
git log --oneline -15                      # final-round commits on top of c598e8a
git push origin main
```

If GitHub rejects the push because of `.github/workflows/ci.yml`, your token lacks the `workflow` scope. Push with GitHub Desktop or
`gh auth login`, or refresh the token with that scope.

No new environment variables are needed. `GEMINI_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY` etc. stay as they are.

## 3. Load the new demo data

After Vercel shows the deployment as Ready: sign in as **Asha · Admin** → **Brand Kit** → **↺ Reset demo data**, or open
`https://brandguard-5siy.vercel.app/api/setup?token=<SETUP_TOKEN>`. This adds the palette, logos, Confidential Terms, the poster draft
and the clearly marked demo history for Insights. It also resets the demo drafts.

## 4. Check the live site (5 minutes)

- `https://brandguard-5siy.vercel.app/` shows the new landing page without signing in.
- Get started → Kabir · Creator → open *Exam season poster*: 4 image findings.
- New draft → *Launch post with errors* → attach any PNG → Check draft. You should see AI findings marked "AI, verified". The live app
  uses real Gemini, so wording will differ from the screenshots.
- Asha · Admin → **Insights**: TONE-2 or ACC-1 flagged "Possibly unclear"; click the top rule; "Edit this rule".

## 5. Get the AI accuracy numbers (recommended)

GitHub → repo → Settings → Secrets and variables → Actions → **New repository secret** `GEMINI_API_KEY`. The next CI run (or
Actions → CI → Run workflow) runs the rules + Gemini evaluation and publishes the table in the run summary. Copy that row into the
README "Measured accuracy" table and the report. Locally instead: `GEMINI_API_KEY=… npm run eval`.

## 6. Personal items

- Edit and confirm `docs/CONTRIBUTION_DRAFT.md` (role and what you personally built).
- Add any other AI tools you used to `docs/TOOLS_DISCLOSURE.md`.
- Submit: live link, repo link, `docs/BrandGuard_Final_Report.pdf`.
