"""Theme checks: dark by default, toggle, persistence across reload and navigation, no flash of the wrong theme,
both themes on every main route (desktop and mobile), and the seeded data visible per role.
Usage: BASE=http://localhost:3100 python3 tests/e2e/theme.py"""
import asyncio, os, re, sys, urllib.request
from playwright.async_api import async_playwright

BASE = os.environ.get("BASE", "http://localhost:3100")
fails = 0


def ok(name, cond, detail=""):
    global fails
    print(("  ok   " if cond else "  FAIL ") + name + ("" if cond else f"  ({detail})"))
    if not cond:
        fails += 1


def luminance(css):
    m = re.findall(r"[\d.]+", css)
    r, g, b = (float(x) / 255 for x in m[:3])
    f = lambda c: c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)


async def state(page):
    return await page.evaluate(
        "() => ({ t: document.documentElement.getAttribute('data-theme'), bg: getComputedStyle(document.body).backgroundColor, fg: getComputedStyle(document.body).color })"
    )


async def login(page, who="Kabir"):
    await page.goto(BASE + "/login")
    await page.get_by_role("button", name=re.compile(f"^Sign in as {who}")).click()
    await page.wait_for_url("**/dashboard", timeout=30000)


async def main():
    print("· server HTML")
    html = urllib.request.urlopen(BASE + "/").read().decode()
    ok("server HTML is dark without a theme attribute (no light flash, works without JS)", 'data-theme="light"' not in html.split("<body")[0])
    ok("theme script runs before any visible content", html.find("bg-theme") != -1 and html.find("bg-theme") < html.find("<header") and html.find("bg-theme") < html.find("<main"))

    async with async_playwright() as p:
        b = await p.chromium.launch()
        ctx = await b.new_context(viewport={"width": 1366, "height": 900})
        page = await ctx.new_page()

        print("· default theme")
        await page.goto(BASE + "/")
        s = await state(page)
        ok("first visit is dark", s["t"] == "dark", s)
        ok("no theme saved until the visitor chooses", await page.evaluate("localStorage.getItem('bg-theme')") is None)
        ok("dark background is near-black", luminance(s["bg"]) < 0.02, s["bg"])
        ok("text contrast ≥ 7:1 on dark", (luminance(s["fg"]) + 0.05) / (luminance(s["bg"]) + 0.05) >= 7, s)

        print("· toggle and persistence")
        await page.get_by_test_id("theme-toggle").first.click()
        s = await state(page)
        ok("toggle switches to light", s["t"] == "light" and luminance(s["bg"]) > 0.8, s)
        ok("toggle label says what it does", await page.get_by_test_id("theme-toggle").first.get_attribute("aria-label") == "Switch to dark theme")
        await page.reload()
        ok("light survives reload", (await state(page))["t"] == "light")
        await page.goto(BASE + "/login")
        ok("light survives navigation", (await state(page))["t"] == "light")

        print("· saved theme survives React re-creating <html> attributes (hydration-error recovery)")
        await page.evaluate("document.documentElement.removeAttribute('data-theme')")  # page is light here
        await page.wait_for_timeout(100)
        ok("light restored after the attribute is stripped", (await state(page))["t"] == "light")
        await page.get_by_test_id("theme-toggle").first.click()  # back to dark
        await page.evaluate("document.documentElement.setAttribute('data-theme', 'light')")
        await page.wait_for_timeout(100)
        ok("dark restored after the attribute is overwritten", (await state(page))["t"] == "dark")
        await page.get_by_test_id("theme-toggle").first.click()  # light again for the next checks

        print("· no flash of the wrong theme")
        # The attribute must already be "light" when the first byte of <body> is parsed.
        await ctx.add_init_script(
            "new MutationObserver((m, o) => { for (const r of m) for (const n of r.addedNodes) if (n.nodeType === 1 && n.parentNode === document.body && n.nodeName !== 'SCRIPT' && !n.hidden) { window.__atBody = document.documentElement.getAttribute('data-theme'); o.disconnect(); return; } }).observe(document, { childList: true, subtree: true });"
        )
        await page.goto(BASE + "/")
        ok("saved light theme applied before the first visible element", await page.evaluate("window.__atBody") == "light", await page.evaluate("window.__atBody"))
        await page.get_by_test_id("theme-toggle").first.click()
        await page.goto(BASE + "/login")
        ok("saved dark theme applied before the first visible element", await page.evaluate("window.__atBody") == "dark")

        print("· both themes across routes")
        routes_public = ["/", "/login", "/ai-disclosure", "/this-page-does-not-exist"]
        routes_app = ["/dashboard", "/drafts/new", "/brand-kit"]
        for theme in ("dark", "light"):
            for width in (1366, 390):
                c = await b.new_context(viewport={"width": width, "height": 860})
                await c.add_init_script(f"localStorage.setItem('bg-theme', '{theme}')")
                pg = await c.new_page()
                errors = []
                pg.on("pageerror", lambda e: errors.append(str(e)))
                bad = []
                for r in routes_public:
                    await pg.goto(BASE + r)
                    s = await state(pg)
                    if s["t"] != theme or (luminance(s["bg"]) < 0.02) != (theme == "dark"):
                        bad.append((r, s))
                await login(pg, "Asha")
                for r in routes_app + ["/insights"]:
                    await pg.goto(BASE + r)
                    s = await state(pg)
                    if s["t"] != theme or (luminance(s["bg"]) < 0.02) != (theme == "dark"):
                        bad.append((r, s))
                    over = await pg.evaluate("document.documentElement.scrollWidth - window.innerWidth")
                    if over > 2:
                        bad.append((r, f"horizontal overflow {over}px"))
                ok(f"{theme} @ {width}px: every route themed, no overflow, no page errors", not bad and not errors, (bad, errors[:2]))
                await c.close()

        print("· seeded data per role")
        c = await b.new_context(viewport={"width": 1366, "height": 900})
        pg = await c.new_page()
        await login(pg, "Kabir")
        body = await pg.inner_text("main")
        for label in ["Analysed", "Changes requested", "In review", "Approved", "Draft", "Sample"]:
            ok(f"creator sees '{label}'", label.lower() in body.lower())
        await c.close(); c = await b.new_context(viewport={"width": 1366, "height": 900}); pg = await c.new_page()
        await login(pg, "Riya")
        queue = pg.locator("section", has=pg.get_by_role("heading", name=re.compile("Your review queue")))
        n = await queue.locator("tbody tr").count()
        ok("reviewer queue has drafts", n >= 6, n)
        ok("queue shows disputes to rule on", await queue.get_by_text("Disputes to rule on").count() == 1)
        await c.close(); c = await b.new_context(viewport={"width": 1366, "height": 900}); pg = await c.new_page()
        await login(pg, "Asha")
        await pg.goto(BASE + "/insights")
        txt = await pg.inner_text("main")
        ok("insights computed from stored drafts", "Most-broken" in txt and "Possibly unclear" in txt)
        await pg.goto(BASE + "/brand-kit")
        ok("admin sees the additive sample-data button (no destructive reset)", await pg.get_by_role("button", name="+ Add sample data").count() == 1 and await pg.get_by_text("Reset demo data").count() == 0)
        await b.close()

    print("theme: all checks passed" if not fails else f"theme: {fails} FAILED")
    sys.exit(1 if fails else 0)


asyncio.run(main())
