"""
Robustness checks a judge will try: bad input, empty states, refresh, the same action twice, broken URLs, permissions.
Run against a running app with demo data: BASE=http://localhost:3100 python3 tests/e2e/robustness.py
"""
import asyncio, os, re, sys
from playwright.async_api import async_playwright

BASE = os.environ.get("BASE", "http://localhost:3100")
CHROME = os.environ.get("CHROME", "/usr/bin/google-chrome")
res = []
def ok(n, c, d=""):
    res.append(bool(c)); print(("PASS " if c else "FAIL ") + n + (f" — {d}" if d else ""), flush=True)

async def role(page, r):
    await page.select_option("select[aria-label='Switch demo role']", r)
    await page.wait_for_timeout(2500)

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=CHROME, args=["--no-sandbox"])
        page = await b.new_page(viewport={"width": 1280, "height": 900})
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        await page.goto(BASE + "/login")
        await page.get_by_role("button", name=re.compile("Kabir")).click()
        await page.wait_for_url("**/dashboard")

        # Bad input on the new-draft form
        await page.goto(BASE + "/drafts/new")
        await page.fill("textarea[name=content]", "Some text")
        await page.get_by_role("button", name="Check draft").click()
        await page.wait_for_timeout(1500)
        ok("missing title is rejected (form stays open)", "/drafts/new" in page.url)
        await page.fill("#title", "Only a title")
        await page.fill("textarea[name=content]", "   ")
        await page.get_by_role("button", name="Check draft").click()
        await page.wait_for_selector("p[role=alert]", timeout=15000)
        ok("whitespace-only content is rejected with a message", "Paste some content" in await page.locator("p[role=alert]").inner_text())

        # Double-click on "Check draft" creates one draft
        title = "Robustness double submit"
        await page.goto(BASE + "/drafts/new")
        await page.fill("#title", title)
        await page.fill("textarea[name=content]", "Lumeo is the best study app!! Click here.")
        btn = page.get_by_role("button", name="Check draft")
        await btn.dblclick()
        await page.wait_for_url(re.compile(r".*/drafts/[0-9a-f-]{36}$"), timeout=60000)
        draft_url = page.url
        await page.goto(BASE + "/dashboard")
        count = await page.locator("table a", has_text=title).count()
        ok("double-clicking Check draft creates exactly one draft", count == 1, f"{count} drafts")

        # Refresh keeps state; accept twice is harmless
        await page.goto(draft_url)
        card = page.locator("article[id^=finding-]").filter(has=page.get_by_role("button", name="Accept fix", disabled=False)).first
        cid = await card.get_attribute("id")
        await page.locator(f"#{cid}").get_by_role("button", name="Accept fix").dblclick()
        await page.wait_for_timeout(2000)
        await page.reload()
        ok("refresh keeps the accepted fix", await page.locator(f"#{cid}").get_by_text("Fix accepted").count() == 1)
        ok("no error banner after double accept", await page.locator("[role=alert]:has-text('rror')").count() == 0)

        # Resolve everything, then double-click Send for review
        for _ in range(30):
            cand = page.locator("article[id^=finding-]:has(button:text-is('Dispute'))").first
            if not await cand.count():
                break
            c = page.locator(f"article#{await cand.get_attribute('id')}")
            acc = c.get_by_role("button", name="Accept fix")
            if await acc.is_enabled():
                await acc.click()
            else:
                await c.get_by_role("button", name="Dispute").click()
                await c.locator("textarea").fill("Kept as written.")
                await c.get_by_role("button", name="Record dispute").click()
            await page.wait_for_timeout(800)
        await page.get_by_role("button", name="Send for review").dblclick()
        await page.wait_for_timeout(3000)
        await page.reload()
        await page.get_by_role("tab", name="Activity").click()
        n = await page.get_by_text("sent it for review").count()
        ok("double-clicking Send for review submits once", n == 1, f"{n} submissions")
        ok("submitted draft is locked for the author (no Send button)", await page.get_by_role("button", name="Send for review").count() == 0)

        # Broken URLs while signed in
        for path in ["/drafts/not-a-uuid", "/drafts/00000000-0000-0000-0000-000000000000", "/no-such-page"]:
            r = await page.goto(BASE + path)
            text = await page.locator("body").inner_text()
            ok(f"{path} shows a friendly page, not a crash", r.status in (200, 404) and ("doesn" in text or "not found" in text.lower()), f"status {r.status}")

        # Permissions
        r = await page.goto(BASE + "/insights")
        ok("creator cannot open Insights", page.url.endswith("/dashboard"))
        await page.goto(BASE + "/brand-kit")
        ok("creator sees Brand Kit read-only (no Add rule)", await page.get_by_role("button", name="+ Add rule").count() == 0)
        await role(page, "reviewer")
        await page.goto(draft_url)
        await page.get_by_role("button", name="Approve").dblclick()
        await page.wait_for_timeout(2500)
        await page.reload()
        await page.get_by_role("tab", name="Activity").click()
        n = await page.get_by_text("approved it").count()
        ok("double-clicking Approve approves once", n == 1, f"{n} approvals")
        ok("reviewer cannot open Insights", (await page.goto(BASE + "/insights")) and page.url.endswith("/dashboard"))

        # Empty states
        await role(page, "admin")
        await page.goto(BASE + "/insights/drafts?source=does-not-exist")
        ok("drill-down with no matches shows an empty state", await page.get_by_text("Nothing matches these filters").count() == 1)
        await page.goto(BASE + "/insights?channel=NoSuchChannel")
        ok("insights with a filter that matches nothing does not crash", await page.get_by_role("heading", name="Brand insights").count() == 1)

        # Signed out: private pages redirect
        ctx = await b.new_context()
        anon = await ctx.new_page()
        await anon.goto(BASE + "/dashboard")
        ok("signed-out visitor is sent to sign-in", "/login" in anon.url)
        await ctx.close()

        ok("no client-side JS errors", not errors, "; ".join(errors[:2]))
        await b.close()
    print(f"\n{sum(res)}/{len(res)} checks passed")
    sys.exit(0 if all(res) else 1)

asyncio.run(main())
