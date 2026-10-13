#!/usr/bin/env python3
"""KQ247 free, self-hosted Playwright browser smoke test.

This is a read-only browser driver for publicly accessible directories.
No authentication, no form submissions, no CAPTCHA bypass, no paid APIs.
"""
import json
from pathlib import Path
from datetime import datetime, timezone
from playwright.sync_api import sync_playwright

HOME=Path("/opt/kq247/seo-groups")
REPORT=HOME/"reports"/"browser-probe.json"
PAGES={
  "lottery":"https://64-120-92-172.sslip.io/nhom-xo-so-mb-mn-mt-telegram-mien-phi.html",
  "football":"https://64-120-92-172.sslip.io/nhom-bong-da-telegram-mien-phi.html",
  "directory":"https://groupmandi.com/"
}
def main():
    out={"at_utc":datetime.now(timezone.utc).isoformat(),
         "engine":"Chromium / Playwright self-hosted on VinaHost",
         "cost":"open-source browser, existing VPS, no account or credit card",
         "mode":"READ_ONLY_NO_SUBMISSION","pages":{}}
    with sync_playwright() as playwright:
        browser=playwright.chromium.launch(headless=True,args=["--no-sandbox","--disable-dev-shm-usage"])
        try:
            for kind,url in PAGES.items():
                page=browser.new_page(viewport={"width":390,"height":844},locale="vi-VN")
                try:
                    response=page.goto(url,wait_until="domcontentloaded",timeout=22000)
                    page.wait_for_timeout(700)
                    item={"http":response.status if response else None,
                          "title":page.title()[:130],
                          "final_url":page.url,
                          "anchors":page.locator("a").count()}
                    if kind=="directory":
                        item.update({
                         "has_group_name":page.locator('input[name="name"]').count()>0,
                         "has_telegram_selection":page.locator('select[name="platform"] option[value="telegram"]').count()>0,
                         "has_group_link":page.locator('input[name="link"]').count()>0,
                         "has_description":page.locator('textarea[name="description"]').count()>0,
                         "submitted":False
                        })
                    else:
                        item["has_telegram_link"]=page.locator('a[href^="https://t.me/"]').count()>0
                    out["pages"][kind]=item
                except Exception as error:
                    out["pages"][kind]={"error":type(error).__name__+":"+str(error)[:160]}
                finally:
                    page.close()
        finally:
            browser.close()
    out["browser_ok"]=all(
      out["pages"].get(k,{}).get("http")==200 and
      out["pages"][k].get("has_telegram_link") for k in ("lottery","football"))
    out["directory_form_ready"]=all(out["pages"].get("directory",{}).get(k)
       for k in ("has_group_name","has_telegram_selection","has_group_link","has_description"))
    REPORT.parent.mkdir(parents=True,exist_ok=True)
    temp=REPORT.with_suffix(".tmp")
    temp.write_text(json.dumps(out,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    temp.replace(REPORT)
    print("FREE_VPS_CHROMIUM_BROWSER_REPORT",json.dumps(out,ensure_ascii=False),flush=True)
    if not out["browser_ok"]:
        raise SystemExit("Owned KQ247 pages could not be opened in local browser")
    print("FREE_VPS_PLAYWRIGHT_READONLY_BROWSER_PASS")
if __name__=="__main__":
    main()
