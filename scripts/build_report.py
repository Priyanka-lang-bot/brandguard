"""Builds docs/BrandGuard_Final_Report.pdf from the docs in this repo and the real screenshots in docs/screenshots.
Usage: python3 scripts/build_report.py   (needs: markdown, Pillow, playwright + Chrome)"""
import asyncio, json, os, re
from pathlib import Path
import markdown
from PIL import Image
from playwright.async_api import async_playwright

ROOT = Path(__file__).resolve().parent.parent
SHOTS = ROOT / "docs" / "screenshots"
TMP = Path("/tmp/report"); TMP.mkdir(exist_ok=True)
md = lambda p: markdown.markdown(re.sub(r"^# .*\n", "", (ROOT / p).read_text(), count=1), extensions=["tables", "fenced_code"])

def img(name, caption, crop=None, width="100%"):
    src = SHOTS / f"{name}.png"
    out = TMP / f"{name}.jpg"
    im = Image.open(src).convert("RGB")
    if crop: im = im.crop((0, 0, im.size[0], min(crop, im.size[1])))
    if im.size[0] > 1200: im = im.resize((1200, int(im.size[1] * 1200 / im.size[0])))
    im.save(out, quality=78)
    return f'<figure style="width:{width}"><img src="file://{out}"/><figcaption>{caption}</figcaption></figure>'

ev = json.loads((ROOT / "eval/results/rules.json").read_text())
cat_rows = "".join(f"<tr><td>{c}</td><td>{v['tp']}</td><td>{v['fp']}</td><td>{v['fn']}</td><td>{'—' if v['precision'] is None else f'{v['precision']*100:.1f}%'}</td><td>{'—' if v['recall'] is None else f'{v['recall']*100:.1f}%'}</td></tr>" for c, v in ev["by_category"].items())

SAMPLE = "Screens show the sample data (tagged “Sample”). Rule findings come from the real checks; findings labelled “sample finding (scripted for the demo)” stand in for the AI pass, because sample data is seeded without Gemini."

html = f"""<!doctype html><html><head><meta charset="utf-8"><style>
@page {{ size: A4; margin: 16mm 15mm 18mm; }}
body {{ font-family: 'Archivo Variable','Inter','DejaVu Sans',sans-serif; color:#15161c; font-size:10pt; line-height:1.5; }}
h1 {{ font-size: 30pt; line-height:1; margin:0; letter-spacing:-0.02em; }}
h2 {{ font-size: 17pt; margin: 0 0 6pt; padding-top: 4pt; border-top: 2.5px solid #0e0f14; letter-spacing:-0.01em; break-after: avoid; }}
h3 {{ font-size: 12pt; margin: 12pt 0 4pt; break-after: avoid; }}
section {{ break-before: page; }}
table {{ border-collapse: collapse; width:100%; margin: 6pt 0 10pt; font-size: 8.6pt; break-inside: auto; }}
th, td {{ border-bottom: 1px solid #d9d4c7; padding: 3pt 5pt; text-align:left; vertical-align: top; }}
th {{ background:#f3efe6; }}
code {{ font-family: 'DejaVu Sans Mono', monospace; font-size: 8.4pt; background:#f3efe6; padding:0 2px; border-radius:2px; }}
pre {{ background:#f3efe6; padding:8pt; font-size:8pt; white-space: pre-wrap; }}
figure {{ margin: 8pt 0 12pt; break-inside: avoid; }}
figure img {{ width:100%; border:1px solid #cfc9bb; border-radius:4px; }}
figcaption {{ font-size: 8.4pt; color:#55565f; margin-top:3pt; }}
.cover {{ height: 245mm; box-sizing:border-box; display:flex; flex-direction:column; justify-content:space-between; background:#f3efe6; padding: 16mm 14mm; break-after: page; overflow:hidden; }}
.mark {{ background: linear-gradient(transparent 12%, #ffe14d 12%, #ffe14d 88%, transparent 88%); padding:0 3px; }}
.kicker {{ font-family: 'DejaVu Sans Mono', monospace; font-size: 8pt; letter-spacing: .16em; text-transform: uppercase; color:#55565f; }}
.callout {{ border-left: 4px solid #e5432b; background:#fff4f1; padding: 6pt 9pt; margin: 8pt 0; }}
.ok {{ border-left-color:#1f8f5f; background:#eef8f2; }}
.grid2 {{ display:grid; grid-template-columns: 1fr 1fr; gap: 10pt; }}
.big {{ font-size: 22pt; font-weight: 800; }}
</style></head><body>

<div class="cover">
  <div><div class="kicker">CodeNova · Final round · Team 404</div>
  <h1 style="font-size:46pt;margin-top:18mm">BrandGuard</h1>
  <p style="font-size:20pt;line-height:1.15;margin-top:8mm;max-width:150mm">Your brand has a <span class="mark"><em>voice.</em></span> Make sure every piece of content speaks it.</p>
  <p style="font-size:11pt;max-width:150mm;margin-top:6mm">Final product report: a pre-publication brand governance platform that checks text and images against your guidelines, approved facts and visual identity, with human approval.</p></div>
  <div style="font-size:9.5pt">
   <p><strong>Participant:</strong> Priyanka Wanjari (solo) &nbsp;·&nbsp; <strong>Brief:</strong> Inkloom AI &nbsp;·&nbsp; <strong>Organiser:</strong> We Code Coders</p>
   <p><strong>Product:</strong> https://brandguard-5siy.vercel.app &nbsp;·&nbsp; <strong>Code:</strong> https://github.com/Priyanka-lang-bot/brandguard</p>
   <p class="kicker">Report generated 21 November 2026 from the repository and real screenshots</p>
  </div>
</div>

<section><h2>Status at a glance</h2>
<div class="callout"><strong>Read this first.</strong> Production (https://brandguard-5siy.vercel.app) runs commit 4adf0a0. A browser check on 21 Nov 2026 confirmed sign-in, the dashboard, Insights and a live Gemini analysis (11 findings, several “AI, verified”). The later work in this report (audit fixes, sample data for every role, dark/light themes, migration 0003 hardening) is committed and tested locally and goes live when the owner pushes it. Locally: 42/42 unit tests, migrations + RLS, the migration 0003 safety test, 49/49 journey checks, 18/18 robustness checks, 37/37 scroll-demo checks, the theme suite and the seed-safety suite all pass. <strong>Not yet measured:</strong> rules + Gemini accuracy (59 posts) and the vision-mode image catch rate (24 images); both run in CI once the repository has a GEMINI_API_KEY secret. Every number here was measured; nothing was estimated.</div>
<table><tr><th>Item</th><th>Status</th></tr>
<tr><td>Public landing page, core workflow preserved and improved</td><td>Done</td></tr>
<tr><td>Improvement 1: image &amp; accessibility checks</td><td>Done, including logo stretch/recolour, brand contrast minimum and rule-cited findings. 24-image set: measurement mode 46/46; vision mode pending a key</td></tr>
<tr><td>Improvement 2: brand insights dashboard</td><td>Done. SQL views with RLS, drill-down, “possibly unclear” flag; verified live on production</td></tr>
<tr><td>Improvement 3A: confidentiality masking</td><td>Done. Verified on captured AI payloads (local)</td></tr>
<tr><td>Improvement 3B: measured accuracy</td><td>Partial. Dataset, script and CI done; rules-only P 100.0% / R 70.3%; AI run not executed</td></tr>
<tr><td>Sample data for creator, reviewer and admin</td><td>Done. 17 sample drafts in every status + 8 weeks of history; additive, idempotent, RLS-isolated, tagged “Sample”</td></tr>
<tr><td>Dark (default) and light themes</td><td>Done. Saved per browser, applied before first paint, checked on 8 routes at desktop and phone widths</td></tr>
<tr><td>Self-assessed score (see “Honest scorecard”)</td><td>73/100 as deployed today; 81/100 after the owner pushes and adds the sample data</td></tr>
</table>
<h3>Overview</h3>
<p>BrandGuard is a checkpoint between writing and publishing. A creator submits a draft, with images if it has any. BrandGuard checks it against the organisation's own Brand Kit: rules, approved terminology, a Fact Vault with expiry dates, and now a palette, logo files and a confidential-terms list. Each finding quotes the exact words or names the measured image problem, cites the source it breaks, explains why and proposes a minimal fix. People decide: creators accept, edit or dispute every finding, and only a reviewer can approve. Admins see which rules break most often and which ones people dispute.</p>
<h3>Problem</h3>
<p>Most brand mistakes are small and repeated: three spellings of a product name, a price from last quarter, an offer that has ended, an unsupported “best” or “guaranteed”, a tone that drifts, an off-palette colour, light grey text on white, a missing alt text. Reviewers end up checking the same list by hand on every post, and nobody learns which guidelines are unclear.</p>
<h3>Solution</h3>
<p>Exact rule checks run first. A Gemini pass then works on a masked draft and the Brand Kit as citable codes, and a grounding gate discards any AI finding that doesn't cite a real source or quote the real draft. Image measurements are made with Sharp, not guessed. A full human-review workflow keeps every version and decision, and an insights dashboard turns disputes into rule improvements.</p>
</section>

<section><h2>Product workflow</h2>
<p><strong>Draft → Analyse → Identify issues → Suggest fixes → Human review → Approval.</strong> Creators write, paste or upload DOCX/PDF/TXT and attach PNG/JPG images. Rule checks, masking, the AI check, the grounding gate and the image checks produce findings. The creator resolves each one, and resolutions become a new version (nested fixes compose). Disputes carry their reasons to the reviewer, who compares versions and approves or requests changes. Every step is in the audit log.</p>
{img("00-landing-hero", "Public landing page at /, dark theme (the default).")}
<div class="grid2">{img("00-landing-hero-light", "The same page in the light theme.")}{img("01-login", "Dark-mode sign-in with one-click demo roles.")}</div>
</section>

<section><h2>Feature list</h2>{md("docs/FEATURES.md")}</section>

<section><h2>Screenshots of the actual product</h2>
<p>All screenshots are real captures of the production build running against the real migrations on Postgres (with RLS), using the local Supabase and Gemini stand-ins described under Testing. {SAMPLE}</p>
<h3>Creator</h3>
{img("02-creator-dashboard", "Creator dashboard: drafts in every status (Draft, Analysed, In review, Changes requested, Approved), each tagged Sample.", crop=1250)}
{img("04-draft-findings", "Draft analysis: every finding quotes the words, cites the Brand Kit source, explains why and proposes a fix; accept, edit or dispute.", crop=1300)}
</section>
<section><h3>Image compliance workflow</h3>
{img("13-seeded-poster-draft", "Sample “Exam season poster”: measured palette (off-palette pink, nearest brand colour), WCAG contrast drawn on the image (1.54:1 fails the 4.5:1 brand minimum), missing alt text and a retired product name inside the image. Text regions come from the poster's design file (labelled), because sample data is seeded without the AI.", crop=1400)}
</section>
<section><h3>Reviewer</h3>
{img("19-reviewer-dashboard", "Reviewer dashboard: six drafts in the queue and a “Disputes to rule on” column.", crop=1150)}
{img("06-reviewer", "Review screen: resolutions, the creator's dispute reason and the approve / request-changes panel.", crop=1250)}
</section>
<section>
<div class="grid2">{img("05-changes-diff", "Word-level diff between the checked and submitted versions.")}{img("07-activity", "Audit log of an approved draft, including the reviewer's note.")}</div>
{img("22-changes-requested", "Creator view of a draft sent back: the reviewer's comment and the disputed Fact Vault finding.", crop=1100)}
</section>
<section><h3>Admin</h3>
{img("20-admin-dashboard", "Admin dashboard.", crop=900)}
{img("08-insights", "Insights computed from the RLS-protected views: most-broken rules, dispute rates, “possibly unclear” rules, trends and time to approval. Seeded history is labelled and can be excluded.", crop=1650)}
</section>
<section>
<div class="grid2">{img("09-drilldown", "Drill-down from a metric to the drafts behind it.", crop=1100)}{img("14-brand-kit-rules", "Brand Kit → Rules.", crop=1100)}</div>
<div class="grid2">{img("11-visual-identity", "Brand Kit → Visual identity: palette, logo versions and the brand minimum contrast.", crop=1300)}{img("10-confidential", "Brand Kit → Confidential: terms, unreleased products, regex patterns.", crop=1100)}</div>
</section>
<section><h3>Dark and light themes</h3>
{img("21-theme-compare", "The same creator dashboard in the dark theme (default) and the light theme. The choice is saved per browser and applied before the first paint.")}
<h3>Scroll-driven product demonstration</h3>
<div class="grid2">{img("16-scroll-demo-step3", "Landing page demo: the steps and preview stay pinned while the visitor scrolls.")}{img("17-scroll-demo-approval", "The demo's final step: approval.")}</div>
<div class="grid2">{img("18-scroll-demo-mobile", "The demo on a phone.", width="70%")}{img("15-ai-disclosure", "Workspace AI disclosure page.", crop=1300)}</div>
</section>

<section><h2>Technical architecture</h2>{md("docs/ARCHITECTURE.md")}</section>

<section><h2>AI implementation</h2>
<p>Model: <code>gemini-3.5-flash</code> (fallback <code>gemini-3.5-flash-lite</code> on 429/5xx), REST with response schemas, low thinking setting, 40–45 s timeouts. Prompts treat draft and image text as untrusted data. Outputs are validated:</p>
<ul><li><strong>Text:</strong> each finding must cite a code from the kit index and quote words located in the original draft (exact, case-insensitive or whitespace-tolerant). Suggestions identical to the original are dropped. Deterministic and AI findings for the same span and source are merged.</li>
<li><strong>Vision:</strong> boxes are clamped to the image, empty or inverted boxes are dropped, and a logo label must be one that was offered.</li>
<li><strong>Guideline import:</strong> an excerpt is kept only if it appears in the document, and every rule waits for admin approval.</li>
<li><strong>Large kits:</strong> above 60 entries, a lexical selection keeps the relevant rules, terms and facts. Banned variants present in the draft are always kept, and TERM-n codes are preserved.</li>
<li><strong>Cache:</strong> AI results are keyed by content, metadata, Brand Kit fingerprint and date.</li></ul>
<h2 style="margin-top:14pt">Image-check implementation</h2>
<ul><li><strong>Validation:</strong> magic bytes (PNG/JPEG only), 4 MB, 40 MP, decode test, DB check constraint, private bucket under the workspace folder.</li>
<li><strong>Palette:</strong> downscale to 128 px, k-means in CIELAB with deterministic histogram seeds, merge clusters under ΔE00 6, report colours ≥ 2%. Colours covering ≥ 5% that are more than ΔE00 10 from every palette colour are flagged, with the nearest brand colour. Near-white and near-black neutrals are allowed.</li>
<li><strong>Contrast:</strong> for each vision text region, the pixels are split into two luminance clusters (smaller = text) and the WCAG 2.2 ratio is computed from the purest half of each. The requirement is 4.5:1, or 3:1 for large text (estimated). The suggested fix is the smallest lightness change that reaches the target.</li>
<li><strong>Alt text:</strong> missing, generic, file-name or too-short text is flagged, with a vision suggestion. Accepting it writes the alt text to the image.</li>
<li><strong>Text in image:</strong> runs through the full text pipeline, masking included. <strong>Logo:</strong> the reference logo files are sent with the image. The model identifies the version and its position; BrandGuard then measures proportions (±20%) and colour (ΔE00 &gt; 15) against the reference file. Absent, retired, stretched and recoloured logos are flagged.</li>
<li><strong>Grounding:</strong> every image finding cites the Brand Kit rule that drives it (check_key). With no rule, that check raises nothing. The contrast requirement is the higher of WCAG AA and the brand minimum (default 4.5:1).</li></ul>
<h2 style="margin-top:14pt">Analytics implementation</h2>
<p>Three <code>security_invoker</code> views: <code>insight_findings</code> (distinct issues, latest status), <code>insight_drafts</code> (submission and approval times) and <code>insight_source_stats</code> (dispute rate and <code>possibly_unclear</code> from workspace settings). Filtering and the remaining metrics are pure TypeScript functions with unit tests. Every number links to <code>/insights/drafts</code> with matching filters. Seeded history is flagged <code>demo_seed</code>.</p>
<h2 style="margin-top:14pt">Confidentiality masking</h2>
<p>Placeholders <code>[[KIND_n_nonce]]</code> replace emails, validated phone numbers, Confidential Terms, unreleased products and admin regex patterns before any request is built. The nonce never occurs in the source text; overlaps resolve earliest, then longest, then most specific; the same value always gets the same placeholder; restore only touches this request's nonce; and <code>assertClean</code> blocks the request if any protected value remains. Covered paths: draft check (whole prompt), guideline import, image text, and logo names in vision prompts. Failure logs contain a reason only. Limitation: image pixels are not masked.</p>
<pre>Captured AI request (E2E, excerpt):
Press: [[EMAIL_1_tf6svn]] or [[PHONE_1_tf6svn]]. [[PRODUCT_1_tf6svn]] is coming soon. Ref [[CUSTOM_1_tf6svn]].</pre>
</section>

<section><h2>Accuracy evaluation results</h2>
<p>Dataset: {ev['posts']} posts, {ev['expected']} planted errors across 8 categories, 8 clean posts (eval/dataset.json). A finding is a true positive when it cites an expected source code and overlaps the expected quote (one-to-one). Run on {ev['executed_at'][:10]}.</p>
<table><tr><th>Mode</th><th>Posts</th><th>Expected</th><th>Actual</th><th>TP</th><th>FP</th><th>FN</th><th>Precision</th><th>Recall</th><th>Grounding rejection</th></tr>
<tr><td>Rule checks only</td><td>{ev['posts']}</td><td>{ev['expected']}</td><td>{ev['actual']}</td><td>{ev['tp']}</td><td>{ev['fp']}</td><td>{ev['fn']}</td><td><strong>{ev['precision']*100:.1f}%</strong></td><td><strong>{ev['recall']*100:.1f}%</strong></td><td>n/a</td></tr>
<tr><td>Rules + Gemini</td><td colspan="9"><strong>Not executed</strong>: no GEMINI_API_KEY was available. CI runs it automatically once the repository secret is set.</td></tr></table>
<h3>Rules only, by category</h3><table><tr><th>Category</th><th>TP</th><th>FP</th><th>FN</th><th>Precision</th><th>Recall</th></tr>{cat_rows}</table>

<h3>Image test set (Round 2 target: catch ≥ 85%)</h3>
<p>24 generated posters in eval/images (20 with 46 planted problems, 4 clean): off-palette colours, low-contrast text, missing or weak alt text, banned terms in the image, and missing, retired, stretched or recoloured logos.</p>
<table><tr><th>Mode</th><th>Planted</th><th>Caught</th><th>Missed</th><th>False positives</th><th>Catch rate</th></tr>
<tr><td>Measurement (positions from the image design)</td><td>46</td><td>46</td><td>0</td><td>0</td><td><strong>100.0%</strong></td></tr>
<tr><td>Vision (Gemini supplies positions)</td><td colspan="5"><strong>Not executed</strong>: no API key available</td></tr></table>
<p>The measurement mode scores BrandGuard's own colour, contrast, alt-text, logo and text-rule logic, assuming perception is perfect. It does not score the vision model. The images are synthetic and were made by the same team, so this is an upper bound.</p>
<p>The rules never catch facts and prices, outdated offers, unreleased features or third-person tone; that is the AI pass's job. The dataset and the rules were written by the same team, so rules-only precision is optimistic. The first evaluation run found two duplicate-finding bugs in the terminology checker (overlapping or case-duplicate banned variants). They were fixed in the engine with regression tests, and the dataset was not changed.</p>
</section>

<section><h2>Testing evidence</h2>{md("docs/TESTING.md")}</section>

<section><h2>Three improvements delivered</h2>{md("docs/IMPROVEMENTS.md")}</section>

<section><h2>Honest scorecard</h2>{md("docs/SCORECARD.md")}</section>

<section><h2>Known limitations</h2>
<ul><li>Rules + Gemini precision, recall and grounding rejection, and the vision-mode image catch rate, are not yet measured (no API key where the evaluations ran).</li>
<li>Production runs 4adf0a0 until the owner pushes. On 21 Nov a live Gemini check succeeded in about 20 s; on 20 Nov one had timed out. The fallback-on-timeout fix is in the push and not yet verified on production.</li>
<li>About 1 in 80 page loads logs React hydration error #418, which React recovers from automatically. Investigation and evidence are under Testing; the root cause is not yet found.</li>
<li>Image pixels are sent to the vision model unmasked. Contrast, in-image text and logo checks need the AI. “Large text” is estimated.</li>
<li>Vision OCR and logo matching quality depend on Gemini and were not benchmarked. Tests stub the vision response.</li>
<li>One workspace per deployment in practice (sign-ups join the demo workspace). pgvector retrieval is deferred.</li>
<li>E2E tests run against local stand-ins for Supabase and Gemini, not the hosted services.</li></ul>
<h2 style="margin-top:14pt">Future roadmap</h2>{md("docs/ROADMAP.md")}
<h2 style="margin-top:14pt">Tool disclosure</h2>{md("docs/TOOLS_DISCLOSURE.md")}
<h2 style="margin-top:14pt">Individual contribution</h2><p>Suggested drafts are in docs/CONTRIBUTION_DRAFT.md. They are based on the commit history and must be confirmed by the participant.</p>
</section>
</body></html>"""

(TMP / "report.html").write_text(html)

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=os.environ.get("CHROME", "/usr/bin/google-chrome"), args=["--no-sandbox", "--allow-file-access-from-files"])
        pg = await b.new_page()
        await pg.goto(f"file://{TMP / 'report.html'}", wait_until="networkidle")
        await pg.pdf(path=str(ROOT / "docs" / "BrandGuard_Final_Report.pdf"), format="A4", print_background=True,
                     display_header_footer=True, header_template="<span></span>",
                     footer_template='<div style="font-size:7pt;color:#777;width:100%;text-align:center">BrandGuard · Final report · <span class="pageNumber"></span>/<span class="totalPages"></span></div>',
                     margin={"top": "16mm", "bottom": "18mm", "left": "15mm", "right": "15mm"})
        await b.close()
asyncio.run(main())
print("wrote docs/BrandGuard_Final_Report.pdf")
