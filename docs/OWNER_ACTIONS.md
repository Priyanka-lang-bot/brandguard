# What the owner needs to do before judging (about 15 minutes)

Status on 2026-11-21. Production (`https://brandguard-5siy.vercel.app`) still runs commit `4adf0a0`. Checked in a browser on
21 Nov: sign-in, dashboard, Insights and a real Gemini check (11 findings, several "AI, verified") all work. Everything after
`4adf0a0` (audit fixes, robustness suite, sample data, dark/light theme, hydration-recovery fix) is in the bundle and is **not
deployed** until you push. Do the steps in this order.

## 1. Run migration 0003 (Supabase → SQL Editor) — 1 minute

Supabase dashboard → your BrandGuard project → **SQL Editor** → **New query** → paste the whole of
`supabase/migrations/0003_brand_contrast.sql` → **Run**.

What it does: adds one column, `workspace_settings.min_contrast` (default 4.5, allowed 3–21). It deletes nothing and rewrites no
rows; existing settings rows read 4.5. It is safe to run twice (the second run changes nothing). If migration 0002 were missing it
would stop with "Run supabase/migrations/0002_final_round.sql first" and change nothing. `tests/sql/migration_0003_test.sh` tests all
of this on a fresh database, a populated one and one without 0002.

Check it worked (same SQL Editor):

```sql
select column_name, column_default from information_schema.columns
where table_name = 'workspace_settings' and column_name = 'min_contrast';
-- expect one row: min_contrast | 4.5
```

(You can push before or after this; the app uses 4.5:1 until the column exists. Running it first avoids a "needs the database
update" notice on the brand contrast setting.)

## 2. Push the commits — 2 minutes

In your local clone (it must already contain `4adf0a0`):

```bash
git checkout main
git pull                                         # origin/main is 4adf0a0
git pull /path/to/brandguard-final.bundle main   # fast-forwards to the commit in the delivery note
git log --oneline -5                             # the top commit should match the hash you were given
git push origin main
```

If GitHub rejects the push because of `.github/workflows/ci.yml`, your token lacks the `workflow` scope: push with GitHub Desktop,
or run `gh auth login` / refresh the token with that scope. Vercel deploys automatically. No new environment variables are needed.

## 3. Add the sample data on production — 1 minute (after Vercel shows "Ready")

**If you already clicked it on `1701999` and saw "insert findings: null value in column status…":** that was a bug, fixed in
the next commit. The failed click added the Brand Kit sample entries and left at most a few sample drafts part-way (for example
"Homepage hero refresh" with a version but no findings). Push the fix, wait for "Ready", and click **+ Add sample data** again:
it completes those drafts in place and adds the rest. Nothing is deleted.

Sign in as **Asha · Admin** → **Brand Kit** → **+ Add sample data** → confirm. The page reloads.

- It only **adds** what is missing: Brand Kit entries, palette, logos, Confidential Terms, 17 sample drafts across every status
  and eight weeks of demo history for Insights. Every sample draft is tagged **Sample** (`drafts.demo_seed = true`).
- It never deletes or edits existing records. Your earlier test drafts ("Audit check: launch note", "Offline mode launch post",
  "Production check 21 Nov (Claude) — safe to delete") stay. Clicking it twice adds nothing the second time.
- Do **not** use `/api/setup?...&reset=1` or `npm run seed -- --reset`: those are the destructive local reset.

Alternative: open `https://brandguard-5siy.vercel.app/api/setup?token=<your SETUP_TOKEN>` (same additive behaviour).

Before step 2 is live, the old button ("↺ Reset demo data", which deletes the demo accounts' drafts) is still on production. Don't
click it; wait for the new deploy.

## 4. Add the Gemini key to GitHub, then run the accuracy evaluation — 3 minutes + CI time

I could not check whether the secret exists (this environment has no access to the repository's Actions settings).

1. GitHub → `Priyanka-lang-bot/brandguard` → **Settings** → **Secrets and variables** → **Actions** →
   **New repository secret**.
2. Name: `GEMINI_API_KEY`. Value: the same key Vercel uses (Google AI Studio). **Add secret**.
3. **Actions** → **CI** → **Run workflow** → branch `main` → **Run workflow**.
4. When it finishes, open the run → **Summary**. It shows two tables:
   - *Rules + AI*: precision, recall, false positives/negatives and grounding-filter rejection on the 59-post set;
   - *Image accuracy, vision mode*: catch rate on the 24-image set (Round 2 target ≥ 85%).
   If it says "Incomplete AI run", the AI call failed on some posts; re-run before quoting it.
5. Copy those rows into the README "Measured accuracy" section and send them to me if you want the report rebuilt with them.

The key is read only from `${{ secrets.GEMINI_API_KEY }}`; GitHub masks it in logs and the scripts never print it. Locally instead:
`GEMINI_API_KEY=… npm run eval && GEMINI_API_KEY=… npm run eval:images`.

## 5. Check the live site — 5 minutes

- The site opens in the dark theme; the sun/moon button switches to the ivory light theme and the choice survives reloads.
- Kabir → drafts in every status (Draft, Analysed, In review, Changes requested, Approved), each tagged Sample.
- Riya → six drafts in the review queue with a "Disputes to rule on" column; approve one or request changes.
- Asha → **Insights**: TONE-2 or another rule flagged "Possibly unclear"; click a number to see the drafts behind it.
- New draft → *Launch post with errors* → **Check draft**: findings marked "AI, verified".

## 6. Personal items

- Edit and confirm `docs/CONTRIBUTION_DRAFT.md` (your role and what you personally built).
- Add any other AI tools you used to `docs/TOOLS_DISCLOSURE.md`.
- Submit: live link, repository link, `docs/BrandGuard_Final_Report.pdf`.
