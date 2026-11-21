"""Captures the report screenshots from a running BrandGuard build that holds only the sample data (npm run seed on
an empty database). Every image is a real screenshot of the app; nothing is drawn or edited except the side-by-side
theme comparison, which places two real screenshots next to each other.
Usage: BASE=http://localhost:3100 python3 scripts/capture_screenshots.py"""
import asyncio, os, re
from pathlib import Path
from PIL import Image
from playwright.async_api import async_playwright

BASE = os.environ.get("BASE", "http://localhost:3100")
OUT = Path(__file__).resolve().parent.parent / "docs" / "screenshots"
OUT.mkdir(parents=True, exist_ok=True)


async def session(b, who, theme="dark", width=1366, height=900):
    ctx = await b.new_context(viewport={"width": width, "height": height}, device_scale_factor=1)
    await ctx.add_init_script(f"localStorage.setItem('bg-theme', '{theme}')")
    pg = await ctx.new_page()
    if who:
        await pg.goto(BASE + "/login")
        await pg.get_by_role("button", name=re.compile(f"^Sign in as {who}")).click()
        await pg.wait_for_url("**/dashboard", timeout=30000)
    return ctx, pg


async def shot(pg, name, full=True):
    await pg.wait_for_timeout(700)
    await pg.screenshot(path=str(OUT / f"{name}.png"), full_page=full)
    print("  ", name)


async def open_draft(pg, title):
    await pg.goto(BASE + "/dashboard")
    await pg.get_by_role("link", name=title, exact=True).first.click()
    await pg.wait_for_url("**/drafts/**")
    await pg.wait_for_timeout(1200)


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()

        ctx, pg = await session(b, None)
        await pg.goto(BASE + "/")
        await shot(pg, "00-landing-hero", full=False)
        await pg.goto(BASE + "/login")
        await shot(pg, "01-login", full=False)
        await pg.goto(BASE + "/ai-disclosure")
        await shot(pg, "15-ai-disclosure")
        await ctx.close()

        ctx, pg = await session(b, None, theme="light")
        await pg.goto(BASE + "/")
        await shot(pg, "00-landing-hero-light", full=False)
        await ctx.close()

        # Creator
        ctx, pg = await session(b, "Kabir")
        await shot(pg, "02-creator-dashboard")
        await open_draft(pg, "Welcome email for new learners")
        await shot(pg, "04-draft-findings")
        await open_draft(pg, "Exam season poster")
        await shot(pg, "13-seeded-poster-draft")
        await open_draft(pg, "Lumio for Schools — launch email")
        await shot(pg, "22-changes-requested")
        await ctx.close()

        # Reviewer
        ctx, pg = await session(b, "Riya")
        await shot(pg, "19-reviewer-dashboard")
        await open_draft(pg, "Lumio for Schools — LinkedIn announcement")
        await shot(pg, "06-reviewer")
        await pg.get_by_role("tab", name="Changes").click()
        await shot(pg, "05-changes-diff", full=False)
        await open_draft(pg, "Offline mode explainer")
        await pg.get_by_role("tab", name="Activity").click()
        await shot(pg, "07-activity", full=False)
        await ctx.close()

        # Admin
        ctx, pg = await session(b, "Asha")
        await shot(pg, "20-admin-dashboard")
        await pg.goto(BASE + "/insights")
        await shot(pg, "08-insights")
        await pg.locator("a[href^='/insights/drafts']").first.click()
        await pg.wait_for_url("**/insights/drafts**")
        await shot(pg, "09-drilldown")
        await pg.goto(BASE + "/brand-kit")
        await shot(pg, "14-brand-kit-rules")
        await pg.get_by_role("tab", name=re.compile("Visual")).click()
        await shot(pg, "11-visual-identity")
        await pg.get_by_role("tab", name=re.compile("Confidential")).click()
        await shot(pg, "10-confidential")
        await ctx.close()

        # Theme comparison: the same creator dashboard, dark (default) and light.
        for theme in ("dark", "light"):
            ctx, pg = await session(b, "Kabir", theme=theme, width=1100, height=760)
            await shot(pg, f"21-theme-{theme}", full=False)
            await ctx.close()
        d, l = Image.open(OUT / "21-theme-dark.png"), Image.open(OUT / "21-theme-light.png")
        both = Image.new("RGB", (d.width + l.width + 24, max(d.height, l.height)), (128, 128, 128))
        both.paste(d, (0, 0)); both.paste(l, (d.width + 24, 0))
        both.save(OUT / "21-theme-compare.png")
        print("   21-theme-compare")
        await b.close()


asyncio.run(main())
