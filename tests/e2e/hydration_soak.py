"""Hydration soak: loads the main pages many times in a real browser and reports how often React logs a hydration
error (#418). Informational by default (prints the rate); set SOAK_MAX_RATE to make it gate, e.g. 0.02.
Usage: BASE=http://localhost:3100 SOAK_ROUNDS=50 python3 tests/e2e/hydration_soak.py"""
import asyncio, os, re, sys
from playwright.async_api import async_playwright

BASE = os.environ.get("BASE", "http://localhost:3100")
ROUNDS = int(os.environ.get("SOAK_ROUNDS", "50"))
PAGES = ["/dashboard", "/insights", "/brand-kit", "/"]


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        c = await b.new_context()
        await c.add_init_script("localStorage.setItem('bg-theme', 'light')")
        pg = await c.new_page()
        errors, theme_lost = [], 0
        pg.on("pageerror", lambda e: errors.append(f"{pg.url}: {str(e)[:80]}"))
        await pg.goto(BASE + "/login")
        await pg.get_by_role("button", name=re.compile("^Sign in as Asha")).click()
        await pg.wait_for_url("**/dashboard")
        loads = 0
        for _ in range(ROUNDS):
            for path in PAGES:
                await pg.goto(BASE + path)
                await pg.wait_for_timeout(250)
                loads += 1
                if await pg.evaluate("document.documentElement.getAttribute('data-theme')") != "light":
                    theme_lost += 1
        await b.close()
    rate = len(errors) / loads
    print(f"loads {loads} | hydration errors {len(errors)} ({rate:.2%}) | pages where the saved theme was lost: {theme_lost}")
    for e in errors[:5]:
        print("  ", e)
    limit = os.environ.get("SOAK_MAX_RATE")
    sys.exit(1 if theme_lost or (limit and rate > float(limit)) else 0)


asyncio.run(main())
