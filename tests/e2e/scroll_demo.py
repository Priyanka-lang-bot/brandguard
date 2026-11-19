"""Scroll-driven product demo: scroll ↔ step synchronisation on desktop, vertical story on small/short screens.
Run against a running app: BASE=http://localhost:3100 python3 tests/e2e/scroll_demo.py"""
import asyncio, os, sys
from playwright.async_api import async_playwright

BASE = os.environ.get("BASE", "http://localhost:3100")
CHROME = os.environ.get("CHROME", "/usr/bin/google-chrome")
SHOTS = os.environ.get("SHOTS", "docs/screenshots")
LABELS = ["Draft", "Analyse", "Identify issues", "Suggest fixes", "Human review", "Approval"]
TITLES = ["A creator writes or uploads a draft", "Rules first, then a grounded AI pass", "Every finding quotes the exact words",
          "Minimal fixes that keep the meaning", "Accept, edit or dispute, each one", "A reviewer signs it off"]
res = []
def ok(n, c, d=""):
    res.append(c); print(("PASS " if c else "FAIL ") + n + (f" — {d}" if d else ""), flush=True)

JS_SEG = """(i) => { const t = document.querySelector('[data-testid=demo-track]'); const r = t.getBoundingClientRect();
  const travel = t.offsetHeight - (innerHeight - 84); return scrollY + r.top - 84 + ((i + 0.5) / 6) * travel; }"""
JS_ACTIVE = "() => { const b = document.querySelector('[aria-current=step]'); return b ? b.textContent : null }"

async def active(pg):
    t = await pg.evaluate(JS_ACTIVE)
    return next((i for i, l in enumerate(LABELS) if t and l in t), None)

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=CHROME, args=["--no-sandbox"])
        for (w, h) in [(1440, 900), (1280, 720), (1920, 1080)]:
            pg = await b.new_page(viewport={"width": w, "height": h})
            await pg.goto(BASE + "/")
            await pg.wait_for_selector("[data-testid=demo-track]")
            # Forward
            seq_ok = True
            for i in range(6):
                await pg.evaluate("y => scrollTo(0, y)", await pg.evaluate(JS_SEG, i)); await pg.wait_for_timeout(250)
                a = await active(pg); t = await pg.locator("#demo-panel h3").first.inner_text()
                seq_ok &= (a == i and t == TITLES[i])
            ok(f"{w}x{h}: forward scroll activates steps 1→6 with matching content", seq_ok)
            # Sticky: the panel stays at the same viewport position while scrolling through the track
            y1 = await pg.locator("#demo-panel").evaluate("e => e.getBoundingClientRect().top")
            await pg.evaluate("y => scrollTo(0, y)", await pg.evaluate(JS_SEG, 2)); await pg.wait_for_timeout(200)
            y2 = await pg.locator("#demo-panel").evaluate("e => e.getBoundingClientRect().top")
            ok(f"{w}x{h}: preview is pinned while scrolling", abs(y1 - y2) < 2, f"{y1:.0f} vs {y2:.0f}")
            fits = await pg.locator("#demo-panel").evaluate("e => e.getBoundingClientRect().bottom <= innerHeight + 1")
            ok(f"{w}x{h}: pinned preview fits the viewport", fits)
            # Reverse
            seq_ok = True
            for i in reversed(range(6)):
                await pg.evaluate("y => scrollTo(0, y)", await pg.evaluate(JS_SEG, i)); await pg.wait_for_timeout(250)
                seq_ok &= (await active(pg) == i)
            ok(f"{w}x{h}: reverse scroll activates steps 6→1", seq_ok)
            # Fast scrolling: jump around without waiting, then check the final state
            for i in [5, 0, 4, 1, 3]:
                await pg.evaluate("y => scrollTo(0, y)", await pg.evaluate(JS_SEG, i)); await pg.wait_for_timeout(16)
            await pg.wait_for_timeout(300)
            ok(f"{w}x{h}: fast scrolling settles on the right step", await active(pg) == 3, str(await active(pg)))
            # Click → smooth scroll → stays synchronised after the scroll ends
            await pg.locator("[aria-controls=demo-panel]", has_text="Human review").click()
            ok(f"{w}x{h}: click activates the step immediately", await active(pg) == 4)
            await pg.wait_for_timeout(1700)
            pos = await pg.evaluate("() => scrollY"); target = await pg.evaluate(JS_SEG, 4)
            ok(f"{w}x{h}: click scrolled to that step's segment and stays in sync", abs(pos - target) < 40 and await active(pg) == 4, f"{pos:.0f}/{target:.0f}")
            # Scrolling again after a click takes over
            await pg.evaluate("y => scrollTo(0, y)", await pg.evaluate(JS_SEG, 1)); await pg.wait_for_timeout(300)
            ok(f"{w}x{h}: scrolling after a click takes over", await active(pg) == 1)
            # Keyboard
            await pg.locator("[aria-controls=demo-panel]", has_text="Analyse").focus()
            await pg.keyboard.press("ArrowDown"); await pg.wait_for_timeout(1700)
            ok(f"{w}x{h}: arrow key moves to the next step", await active(pg) == 2)
            # Next button
            await pg.get_by_role("button", name="Next step →").click(); await pg.wait_for_timeout(1700)
            ok(f"{w}x{h}: Next step button advances and scrolls", await active(pg) == 3)
            if (w, h) == (1440, 900):
                await pg.evaluate("y => scrollTo(0, y)", await pg.evaluate(JS_SEG, 2)); await pg.wait_for_timeout(700)
                await pg.screenshot(path=f"{SHOTS}/16-scroll-demo-step3.png")
                await pg.evaluate("y => scrollTo(0, y)", await pg.evaluate(JS_SEG, 5)); await pg.wait_for_timeout(900)
                await pg.screenshot(path=f"{SHOTS}/17-scroll-demo-approval.png")
            await pg.close()
        # Small and short screens: vertical story, no sticky track
        for (w, h, name) in [(390, 844, "phone"), (820, 1180, "tablet"), (1440, 640, "short laptop")]:
            pg = await b.new_page(viewport={"width": w, "height": h})
            await pg.goto(BASE + "/#product"); await pg.wait_for_timeout(500)
            track = await pg.locator("[data-testid=demo-track]").count()
            heads = await pg.locator("#product ol[aria-label='Workflow steps'] h3.display-tight").count()
            ok(f"{name} {w}x{h}: vertical story (no sticky), all 6 steps", track == 0 and heads == 6, f"track={track} steps={heads}")
            overflow = await pg.evaluate("() => document.documentElement.scrollWidth > innerWidth + 1")
            ok(f"{name}: no horizontal overflow", not overflow)
            if name == "phone":
                await pg.locator("#product ol[aria-label='Workflow steps'] li").nth(2).scroll_into_view_if_needed(); await pg.wait_for_timeout(900)
                await pg.screenshot(path=f"{SHOTS}/18-scroll-demo-mobile.png")
            await pg.close()
        # Reduced motion: still synchronised, instant jumps
        ctx = await b.new_context(viewport={"width": 1440, "height": 900}, reduced_motion="reduce")
        pg = await ctx.new_page(); await pg.goto(BASE + "/"); await pg.wait_for_selector("[data-testid=demo-track]")
        await pg.locator("[aria-controls=demo-panel]", has_text="Approval").click(); await pg.wait_for_timeout(200)
        pos = await pg.evaluate("() => scrollY"); target = await pg.evaluate(JS_SEG, 5)
        ok("reduced motion: click jumps instantly and stays in sync", abs(pos - target) < 40 and await active(pg) == 5)
        await ctx.close(); await b.close()
    print(f"\n{sum(res)}/{len(res)} checks passed"); sys.exit(0 if all(res) else 1)
asyncio.run(main())
