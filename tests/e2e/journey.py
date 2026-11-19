"""
End-to-end judge journey against a running BrandGuard (default http://localhost:3100).
Run with the local Supabase/Gemini stand-ins (see docs/TESTING.md) or against any deployment with demo data.
Saves screenshots to docs/screenshots/ and prints PASS/FAIL per step. Exit code 1 if any step fails.
"""
import asyncio, json, os, re, sys
from playwright.async_api import async_playwright, expect

BASE = os.environ.get("BASE", "http://localhost:3100")
SHOTS = os.environ.get("SHOTS", "docs/screenshots")
CHROME = os.environ.get("CHROME", "/usr/bin/google-chrome")
results = []

def ok(name, cond, detail=""):
    results.append((name, bool(cond), detail))
    print(("PASS " if cond else "FAIL ") + name + (f" — {detail}" if detail else ""), flush=True)

async def shot(page, name, full=False):
    await page.wait_for_timeout(400)
    await page.screenshot(path=f"{SHOTS}/{name}.png", full_page=full)

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=CHROME, args=["--no-sandbox"])
        ctx = await b.new_context(viewport={"width": 1440, "height": 900})
        page = await ctx.new_page()
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))

        # 1. Public landing page, no auth
        r = await page.goto(BASE + "/")
        ok("landing page loads without auth (200)", r.status == 200)
        ok("hero headline present", await page.get_by_role("heading", level=1).count() == 1)
        for label, anchor in [("Product", "#product"), ("Features", "#features"), ("How it works", "#workflow"), ("Security", "#security"), ("Insights", "#insights"), ("About", "#about")]:
            ok(f"nav '{label}' targets an existing section", await page.locator(anchor).count() == 1)
        await page.get_by_role("tab", name=re.compile("Identify issues")).click()
        ok("scripted demo steps through", await page.get_by_text("Every finding quotes the exact words").count() == 1)
        await page.get_by_role("link", name="Get started").first.click()
        await page.wait_for_url("**/login")
        ok("Get started CTA goes to /login", page.url.endswith("/login"))

        # 2. Creator demo login
        await page.get_by_role("button", name=re.compile("Kabir")).click()
        await page.wait_for_url("**/dashboard")
        ok("one-click creator login reaches dashboard", "/dashboard" in page.url)
        await shot(page, "02-creator-dashboard")
        # Signed-in visitor sees a workspace CTA on the landing page
        await page.goto(BASE + "/")
        ok("signed-in landing shows 'Open workspace'", await page.get_by_role("link", name=re.compile("Open workspace")).count() >= 1)

        # 3. Seeded Brand Kit (read-only for creators)
        await page.goto(BASE + "/brand-kit")
        ok("Brand Kit shows seeded rules", await page.get_by_text("No unprovable superlatives").count() >= 1)
        await page.get_by_role("tab", name=re.compile("Visual identity")).click()
        ok("palette visible", await page.get_by_text("#5568F2").count() >= 1)

        # 4. Unsupported image is rejected with a clear message
        await page.goto(BASE + "/drafts/new")
        await page.fill("#title", "Unsupported file test")
        await page.fill("textarea[name=content]", "Hello learners.")
        await page.set_input_files("input[name=images]", "/tmp/bad.gif")
        await page.get_by_role("button", name="Check draft").click()
        await page.wait_for_selector("p[role=alert]", timeout=20000)
        msg = await page.locator("p[role=alert]").first.inner_text()
        ok("GIF upload rejected", "PNG or JPG" in msg, msg)

        # 5. Draft with sensitive data + poster image, checked with rules + (stub) AI
        await page.goto(BASE + "/drafts/new")
        await page.get_by_role("button", name="Launch post with errors").click()
        await page.wait_for_timeout(200)
        await page.fill("#title", "E2E launch post")
        content = await page.input_value("textarea[name=content]")
        content += "\n\nPress: priya@lumio.in or +91 98765 43210. Lumio Live is coming soon. Ref LUM-2048."
        await page.fill("textarea[name=content]", content)
        await page.set_input_files("input[name=images]", "/tmp/poster.png")
        await shot(page, "03-new-draft-form", full=True)
        await page.get_by_role("button", name="Check draft").click()
        await page.wait_for_url(re.compile(r".*/drafts/[0-9a-f-]{36}$"), timeout=60000)
        draft_url = page.url
        ok("draft created and checked", "/drafts/" in draft_url)
        await page.wait_for_selector("article[id^=finding-]")
        n = await page.locator("article[id^=finding-]").count()
        ok("findings shown", n >= 8, f"{n} findings")
        ok("AI findings verified by grounding gate shown", await page.get_by_text("AI, verified").count() >= 1)
        ok("image panel with measured palette", await page.get_by_text("Dominant colours (measured)").count() == 1)
        for code in ["VIS-1", "ACC-4", "ACC-2", "VIS-2"]:
            ok(f"image finding {code} present", await page.locator(f"article[id^=finding-]:has-text('{code}')").count() >= 1)
        ok("banned phrase found in image text", await page.locator("article[id^=finding-]:has-text('Text in the image')").count() >= 1)
        ok("restored original shown to user (email)", await page.get_by_text("priya@lumio.in").count() >= 1)
        await shot(page, "04-draft-findings", full=True)

        # 6. Accept / edit / dispute, then resolve the rest and send for review
        cards = page.locator("article[id^=finding-]")
        first = cards.filter(has=page.get_by_role("button", name="Accept fix", disabled=False)).first
        await first.get_by_role("button", name="Accept fix").click()
        await page.wait_for_timeout(1200)
        ok("accept fix", await page.get_by_text("Fix accepted").count() >= 1)
        edit_card = cards.filter(has_text="TONE-2").first
        if await edit_card.count():
            await edit_card.get_by_role("button", name="Edit").click()
            await edit_card.locator("textarea").fill("!")
            await edit_card.get_by_role("button", name="Use this wording").click()
            await page.wait_for_timeout(1200)
        ok("edit fix", await page.get_by_text("Edited fix").count() >= 1)
        disp = cards.filter(has_text="VIS-2").first
        await disp.get_by_role("button", name="Dispute").click()
        await disp.locator("textarea").fill("This is a teaser poster; the logo goes on the next slide.")
        await disp.get_by_role("button", name="Record dispute").click()
        await page.wait_for_timeout(1200)
        ok("dispute recorded", await page.get_by_text("Author disagrees").count() >= 1)
        # Resolve remaining open findings: accept if possible, else dispute.
        for _ in range(40):
            candidate = page.locator("article[id^=finding-]:has(button:text-is('Dispute'))").first
            if not await candidate.count():
                break
            open_card = page.locator(f"article#{await candidate.get_attribute('id')}")
            acc = open_card.get_by_role("button", name="Accept fix")
            if await acc.is_enabled():
                await acc.click()
            else:
                await open_card.get_by_role("button", name="Dispute").click()
                await open_card.locator("textarea").fill("Reviewed; kept as written for the test.")
                await open_card.get_by_role("button", name="Record dispute").click()
            await page.wait_for_timeout(900)
        await page.get_by_role("button", name="Send for review").click()
        await page.wait_for_timeout(2500)
        ok("sent for review", await page.get_by_text("Sent for review.").count() >= 1)
        await page.get_by_role("tab", name="Changes").click()
        await shot(page, "05-changes-diff")
        await page.get_by_role("tab", name=re.compile("Versions")).click()
        ok("version history shows v2", await page.get_by_text("Version 2").count() >= 1)

        # 7. Reviewer approves
        await page.select_option("select[aria-label='Switch demo role']", "reviewer")
        await page.wait_for_timeout(2500)
        await page.goto(draft_url)
        ok("reviewer sees decision panel", await page.get_by_text("Your review").count() == 1)
        await shot(page, "06-reviewer", full=True)
        await page.get_by_role("button", name="Approve").click()
        await page.wait_for_timeout(2000)
        ok("approved", await page.get_by_text("cleared to publish").count() == 1)
        await page.get_by_role("tab", name="Activity").click()
        ok("audit log has approval", await page.get_by_text("approved it").count() >= 1)
        await shot(page, "07-activity")

        # 8. Admin insights
        await page.select_option("select[aria-label='Switch demo role']", "admin")
        await page.wait_for_timeout(2500)
        await page.goto(BASE + "/insights")
        ok("insights loads for admin", await page.get_by_role("heading", name="Brand insights").count() == 1)
        ok("possibly unclear flag shown", await page.get_by_text("Possibly unclear").count() >= 1)
        await shot(page, "08-insights", full=True)
        top = page.locator("a:has(span:text-is('Top'))").first
        top_label = (await top.inner_text()).replace("Top", "").strip()
        await top.click()
        await page.wait_for_url("**/insights/drafts**")
        ok("drill-down from most-broken rule", await page.get_by_text("Underlying drafts").count() == 1, top_label)
        await shot(page, "09-drilldown")
        await page.get_by_role("link", name="Edit this rule").click()
        await page.wait_for_url("**/brand-kit**")
        ok("edit rule from insights opens the rule form", await page.locator("#rule-form").count() == 1)
        await page.locator("#rule-form textarea").first.fill("Updated from insights: avoid superlatives such as best, #1 or top.")
        await page.get_by_role("button", name="Save rule").click()
        await page.wait_for_timeout(1500)
        ok("rule saved", await page.get_by_text("Updated from insights").count() >= 1)
        # Filters
        await page.goto(BASE + "/insights?channel=Email")
        ok("channel filter applied", await page.locator("select#f-channel").input_value() == "Email")
        await page.goto(BASE + "/insights?demo=exclude")
        ok("demo history can be excluded", await page.locator("select#f-demo").input_value() == "exclude")
        await page.goto(BASE + "/brand-kit?tab=confidential")
        await shot(page, "10-confidential")
        await page.goto(BASE + "/brand-kit?tab=visual")
        await shot(page, "11-visual-identity", full=True)

        # 9. Permission: creator can't open insights
        await page.select_option("select[aria-label='Switch demo role']", "creator")
        await page.wait_for_timeout(2500)
        await page.goto(BASE + "/insights")
        ok("creator redirected away from insights", page.url.endswith("/dashboard"))

        # 10. Mobile layout
        m = await b.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2)
        mp = await m.new_page()
        await mp.goto(BASE + "/")
        await mp.get_by_role("button", name="Open menu").click()
        ok("mobile menu opens", await mp.locator("#mobile-menu").count() == 1)
        await mp.screenshot(path=f"{SHOTS}/12-mobile-menu.png")
        await m.close()

        ok("no client-side JS errors", not errors, "; ".join(errors[:3]))
        await b.close()

    # 11. Masking: nothing sensitive in what would have been sent to Gemini
    log = os.environ.get("GEMINI_LOG")
    if log and os.path.exists(log):
        lines = [json.loads(l) for l in open(log) if l.strip()]
        blob = "\n".join(l["text"] for l in lines)
        ok("AI requests were made", len(lines) > 0, f"{len(lines)} requests ({', '.join(sorted(set(l['kind'] for l in lines)))})")
        for secret in ["priya@lumio.in", "98765 43210", "Lumio Live", "LUM-2048"]:
            ok(f"'{secret}' never sent to the AI", secret not in blob)
        ok("placeholders were sent instead", "[[EMAIL_1_" in blob and "[[PRODUCT_1_" in blob)

    failed = [r for r in results if not r[1]]
    print(f"\n{len(results) - len(failed)}/{len(results)} checks passed")
    sys.exit(1 if failed else 0)

asyncio.run(main())
