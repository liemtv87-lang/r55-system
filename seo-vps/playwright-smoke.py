#!/usr/bin/env python3
"""KQ247 isolated Playwright smoke test, read-only. No third-party form writes."""
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

from playwright.sync_api import sync_playwright

URLS = {
    "football": (
        "https://64-120-92-172.sslip.io/nhom-bong-da-telegram-mien-phi.html",
        "https://t.me/keochuyengia79",
    ),
    "lottery": (
        "https://64-120-92-172.sslip.io/nhom-xo-so-mb-mn-mt-telegram-mien-phi.html",
        "https://t.me/xsbm999",
    ),
}
ARTIFACTS = Path("/opt/kq247/browser-playwright/reports")


def main():
    ARTIFACTS.mkdir(parents=True, exist_ok=True)
    data = {
        "checked_at_utc": datetime.now(timezone.utc).isoformat(),
        "engine": "Playwright Python / Chromium headless",
        "read_only": True,
        "sites": {},
    }
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, args=["--disable-dev-shm-usage"])
        try:
            for region, (url, group_url) in URLS.items():
                page = browser.new_page(viewport={"width": 390, "height": 844})
                response = page.goto(url, wait_until="domcontentloaded", timeout=22000)
                page.locator("body").wait_for(timeout=15000)
                status = response.status if response else 0
                h1 = page.locator("h1").all_text_contents()
                hrefs = page.locator("a[href]").evaluate_all(
                    "(nodes) => nodes.map(n => n.href)"
                )
                has_group = group_url in hrefs
                screenshot = ARTIFACTS / (region + "-landing-mobile.png")
                page.screenshot(path=str(screenshot), full_page=False)
                data["sites"][region] = {
                    "url": page.url,
                    "http_status": status,
                    "title": page.title(),
                    "h1": h1[:2],
                    "group_link_present": has_group,
                    "screenshot": str(screenshot),
                    "ok": status == 200 and bool(h1) and has_group,
                }
                print(
                    "PLAYWRIGHT_CHROMIUM_LIVE",
                    region,
                    "HTTP",
                    status,
                    "H1",
                    bool(h1),
                    "TELEGRAM_LINK",
                    has_group,
                    flush=True,
                )
                page.close()
        finally:
            browser.close()
    data["ok"] = all(site["ok"] for site in data["sites"].values())
    (ARTIFACTS / "latest.json").write_text(
        json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    if not data["ok"]:
        raise RuntimeError("headless_browser_navigation_smoke_failed")
    print("PLAYWRIGHT_VPS_CHROMIUM_READY=PASS")
    print("PLAYWRIGHT_VPS_PYTHON_ISOLATED=PASS")


if __name__ == "__main__":
    sys.exit(main())
