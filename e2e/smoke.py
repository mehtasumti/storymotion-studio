"""
End-to-end smoke test for a built StoryMotion Studio site.

Run against `npx wrangler dev` (real Cloudflare asset routing) or `npm run preview`:
    python3 e2e/smoke.py http://127.0.0.1:8787 [screenshot_dir]

Needs Python Playwright (pip install playwright; python -m playwright install chromium).
Set CHROMIUM_PATH to use a specific Chromium/Chrome binary instead.
Checks: every public page loads without console/CSP errors and without horizontal
scrolling on phone/tablet/desktop; storyboard generation, editing, autosave,
JSON export/import and PDF export; the demo project; preview playback; and a
full WebM export that the app verifies before download.
"""
import asyncio
import json
import os
import sys
import tempfile
from pathlib import Path

from playwright.async_api import async_playwright, expect

BASE = sys.argv[1].rstrip("/") if len(sys.argv) > 1 else "http://127.0.0.1:8787"
SHOTS = Path(sys.argv[2]) if len(sys.argv) > 2 else None
_DEFAULT = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome"
CHROMIUM = os.environ.get("CHROMIUM_PATH") or (_DEFAULT if os.path.exists(_DEFAULT) else None)
RESULTS = []


def record(name, ok, detail=""):
    RESULTS.append((name, ok, detail))
    print(f"{'PASS' if ok else 'FAIL'}  {name}{('  -- ' + detail) if detail else ''}", flush=True)


def watch(page, bucket):
    page.on("console", lambda m: bucket.append(f"console.{m.type}: {m.text}") if m.type == "error" else None)
    page.on("pageerror", lambda e: bucket.append(f"pageerror: {e}"))
    # blob: URLs are revoked by the app once used; an aborted blob fetch is expected, not an error.
    page.on("requestfailed", lambda r: None if r.url.startswith("blob:") else bucket.append(f"requestfailed: {r.url} {r.failure}"))


async def check_static_pages(browser):
    for width, label in [(360, "phone"), (768, "tablet"), (1440, "desktop")]:
        ctx = await browser.new_context(viewport={"width": width, "height": 900})
        for path in ["/", "/privacy/", "/terms/", "/app/", "/does-not-exist"]:
            page = await ctx.new_page()
            errs = []
            watch(page, errs)
            res = await page.goto(BASE + path, wait_until="networkidle")
            status = res.status if res else 0
            want = 404 if path == "/does-not-exist" else 200
            sw = await page.evaluate("document.documentElement.scrollWidth")
            h1 = await page.locator("h1").first.inner_text()
            if path == "/does-not-exist":  # the 404 document itself is logged by the browser
                errs = [e for e in errs if "status of 404" not in e]
            ok = status == want and sw <= width and not errs and bool(h1.strip())
            record(f"{label} {path} loads (status {status}, scrollWidth {sw})", ok, "; ".join(errs[:3]))
            if SHOTS and path in ("/", "/privacy/", "/app/"):
                name = path.strip("/") or "home"
                await page.screenshot(path=str(SHOTS / f"{label}-{name}.png"), full_page=(path != "/app/"))
            await page.close()
        await ctx.close()

    ctx = await browser.new_context()
    page = await ctx.new_page()
    await page.goto(BASE + "/", wait_until="domcontentloaded")
    canon = await page.locator('link[rel="canonical"]').get_attribute("href")
    og = await page.locator('meta[property="og:image"]').get_attribute("content")
    record("home has canonical + og:image", canon.endswith("/") and og.endswith("/og-image.png"), f"{canon} {og}")
    hrefs = await page.eval_on_selector_all("a[href^='/']", "els => [...new Set(els.map(e => e.getAttribute('href')))]")
    broken = []
    for h in hrefs:
        r = await page.request.get(BASE + h.split("#")[0])
        if r.status != 200:
            broken.append(f"{h}={r.status}")
    record(f"all {len(hrefs)} internal links on home resolve", not broken, ", ".join(broken))
    start = page.get_by_role("link", name="Start Creating").first
    record("Start Creating points to /app/", await start.get_attribute("href") == "/app/")
    sm = await (await page.request.get(BASE + "/sitemap.xml")).text()
    locs = sm.count("<loc>")
    record("sitemap lists 4 pages", locs == 4, f"{locs} locs")
    await ctx.close()


async def check_storyboard_flow(browser, downloads):
    ctx = await browser.new_context(accept_downloads=True, viewport={"width": 1280, "height": 900})
    page = await ctx.new_page()
    errs = []
    watch(page, errs)
    page.on("dialog", lambda d: asyncio.ensure_future(d.accept()))
    await page.goto(BASE + "/app/", wait_until="networkidle")
    await expect(page.get_by_role("heading", name="Your storyboard will appear here")).to_be_visible()
    record("app boots to empty state", True)

    # Validation error goes to the assertive live region
    await page.get_by_role("button", name="Generate Storyboard").click()
    alert = page.locator(".toast-region[role='alert'] .toast-error")
    await expect(alert).to_be_visible()
    record("empty story shows an error in the alert region", True)

    await page.get_by_role("button", name="Demo: one-line test").click()
    await page.get_by_role("button", name="Generate Storyboard").click()
    await expect(page.locator("#storyboard-heading")).to_be_visible()
    n = await page.locator(".scene-card").count()
    record("one-line demo generates 10 scenes", n == 10, f"{n} scenes")

    first_title = page.locator("input.scene-title-input").first
    await first_title.fill("Edited scene title E2E")
    await page.wait_for_timeout(700)
    await page.reload(wait_until="networkidle")
    val = await page.locator("input.scene-title-input").first.input_value()
    record("edits survive a reload (autosave)", val == "Edited scene title E2E", val)

    async with page.expect_download() as dl:
        await page.get_by_role("button", name="Export JSON").click()
    d = await dl.value
    jp = Path(downloads) / d.suggested_filename
    await d.save_as(jp)
    data = json.loads(jp.read_text())
    record("JSON export downloads a valid project", data.get("app") == "storymotion-studio" and len(data.get("scenes", [])) == 10, d.suggested_filename)

    async with page.expect_download(timeout=60000) as dl:
        await page.get_by_role("button", name="Export PDF").click()
    d = await dl.value
    pp = Path(downloads) / d.suggested_filename
    await d.save_as(pp)
    record("PDF export downloads a PDF", pp.read_bytes()[:4] == b"%PDF", f"{pp.stat().st_size} bytes")

    await page.locator("input[type=file][accept*='json']").set_input_files(str(jp))
    await expect(page.locator(".toast-success")).to_contain_text("Imported")
    record("JSON import works", True)

    await page.get_by_role("tab", name="Video maker").click()
    await expect(page.get_by_role("button", name="Play preview")).to_be_visible(timeout=20000)
    record("video maker lazy-loads for a generated storyboard", True)
    record("no console errors during storyboard flow", not errs, "; ".join(errs[:3]))
    await ctx.close()


async def check_demo_and_export(browser, downloads):
    ctx = await browser.new_context(accept_downloads=True, viewport={"width": 1280, "height": 900})
    page = await ctx.new_page()
    errs = []
    watch(page, errs)
    dialogs = []
    page.on("dialog", lambda d: (dialogs.append(d.message), asyncio.ensure_future(d.accept())))
    await page.goto(BASE + "/app/?demo=1", wait_until="networkidle")
    await expect(page.locator(".toast-success")).to_contain_text("Demo project loaded", timeout=20000)
    record("?demo=1 loads the demo project without prompting on a fresh browser", not dialogs)
    record("demo link cleans the URL", "demo" not in page.url, page.url)
    await expect(page.get_by_role("button", name="Play preview")).to_be_visible(timeout=20000)
    thumbs = page.locator(".thumb.has-image img")
    await expect(thumbs).to_have_count(6, timeout=15000)
    record("demo attaches 6 sample images", True)

    await page.get_by_role("button", name="Play preview").click()
    await page.wait_for_timeout(2500)
    paused_label = await page.get_by_role("button", name="Pause preview").count()
    record("preview plays", paused_label == 1)
    if paused_label:
        await page.get_by_role("button", name="Pause preview").click()

    if SHOTS:
        await page.screenshot(path=str(SHOTS / "desktop-demo-video.png"))

    export_btn = page.get_by_test_id("export-video")
    await export_btn.scroll_into_view_if_needed()
    label = (await export_btn.inner_text()).strip()
    await export_btn.click()
    dl_btn = page.get_by_test_id("download-video")
    await expect(dl_btn).to_be_visible(timeout=240000)
    async with page.expect_download() as dl:
        await dl_btn.click()
    d = await dl.value
    vp = Path(downloads) / d.suggested_filename
    await d.save_as(vp)
    head = vp.read_bytes()[:12]
    kind = "webm" if head[:4] == b"\x1a\x45\xdf\xa3" else ("mp4" if head[4:8] == b"ftyp" else "unknown")
    record(f"'{label}' exports a verified video", kind != "unknown" and vp.stat().st_size > 50_000, f"{kind}, {vp.stat().st_size} bytes")

    # Opening the demo again over an existing project must ask first
    dialogs.clear()
    await page.goto(BASE + "/app/?demo=1", wait_until="networkidle")
    await page.wait_for_timeout(1500)
    record("demo over an existing project asks for confirmation", any("replaces" in m for m in dialogs), dialogs[0][:60] if dialogs else "no dialog")
    record("no console errors during demo/export", not errs, "; ".join(errs[:3]))
    await ctx.close()


async def check_mobile_app(browser):
    ctx = await browser.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True, has_touch=True)
    page = await ctx.new_page()
    errs = []
    watch(page, errs)
    await page.goto(BASE + "/app/?demo=1", wait_until="networkidle")
    await expect(page.get_by_role("button", name="Play preview")).to_be_visible(timeout=20000)
    await page.wait_for_timeout(800)
    sw = await page.evaluate("document.documentElement.scrollWidth")
    record(f"mobile demo video maker fits 390px (scrollWidth {sw})", sw <= 390)
    if SHOTS:
        await page.screenshot(path=str(SHOTS / "phone-demo-video.png"), full_page=False)
        await page.get_by_role("tab", name="Storyboard").click()
        await page.screenshot(path=str(SHOTS / "phone-storyboard.png"), full_page=False)
    record("no console errors on mobile", not errs, "; ".join(errs[:3]))
    await ctx.close()


async def main():
    if SHOTS:
        SHOTS.mkdir(parents=True, exist_ok=True)
    async with async_playwright() as p:
        browser = await p.chromium.launch(executable_path=CHROMIUM)
        with tempfile.TemporaryDirectory() as downloads:
            for step in (check_static_pages, check_storyboard_flow, check_demo_and_export, check_mobile_app):
                try:
                    if step in (check_storyboard_flow, check_demo_and_export):
                        await step(browser, downloads)
                    else:
                        await step(browser)
                except Exception as e:  # noqa: BLE001
                    record(f"{step.__name__} crashed", False, str(e).splitlines()[0][:300])
        await browser.close()
    failed = [r for r in RESULTS if not r[1]]
    print(f"\n{len(RESULTS) - len(failed)}/{len(RESULTS)} checks passed")
    sys.exit(1 if failed else 0)


asyncio.run(main())
