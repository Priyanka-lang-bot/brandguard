# What the owner needs to do before judging (about 10 minutes)

Status on 2026-11-20: migration 0002 has been run and the final-round code is live (`4adf0a0`). Three things are still missing on
production, and they matter for scoring.

## 1. Push the new commits

Pull the bundle you received into your local clone and push:

```bash
git checkout main && git pull
git pull /path/to/brandguard-audit.bundle main
git push origin main
```

This deploys the Gemini timeout fallback (the live AI pass was timing out), the logo misuse checks, the brand contrast setting, the
image test set and the CI fix.

## 2. Run migration 0003 (Supabase → SQL Editor)

Paste `supabase/migrations/0003_brand_contrast.sql` and click **Run**. It adds one column with a default and changes no data.

## 3. Reset the demo data on production

Sign in as **Asha · Admin** → **Brand Kit** → **↺ Reset demo data**. Without this, the live site has no palette, no logos, no
confidential terms, no image-check rules, no poster draft and no insights history, so the three improvements look empty to a judge.
The reset deletes and recreates the demo users' drafts (including test drafts such as "Audit check: launch note" and "Offline mode
launch post"). It does not touch other accounts.

## 4. Add the Gemini key to GitHub (for the AI accuracy numbers)

GitHub → repository → Settings → Secrets and variables → Actions → **New repository secret** → `GEMINI_API_KEY`. Then Actions → CI →
**Run workflow**. The run summary will show:
- rules + Gemini precision, recall and grounding-filter rejection (text, 59 posts);
- the vision-mode catch rate on the 24-image set (Round 2 target ≥ 85%).

Copy both rows into the README tables and the report. Locally instead: `GEMINI_API_KEY=… npm run eval && GEMINI_API_KEY=… npm run eval:images`.

## 5. Check the live site

- Kabir → *Exam season poster*: image findings.
- New draft → *Launch post with errors* → Check draft: AI findings marked "AI, verified". If the Activity tab still says "Gemini timed
  out", try again in a minute; the fallback model should take over.
- Asha → **Insights**: a rule flagged "Possibly unclear"; click the top rule; "Edit this rule".

## 6. Personal items

- Confirm `docs/CONTRIBUTION_DRAFT.md` (your role and what you personally built) in your own words.
- Add any other AI tools you used to `docs/TOOLS_DISCLOSURE.md`.
