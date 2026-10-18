#!/usr/bin/env python3
"""Read-only authentication bridge smoke test. Never prints credentials or cookies."""
from playwright.sync_api import sync_playwright
import json

def main():
    status={"cdp_connected":False, "existing_context":False,
            "groupsgyani_signed_in":False,"did_submit":False}
    try:
        with sync_playwright() as p:
            browser=p.chromium.connect_over_cdp("http://127.0.0.1:9222",timeout=15000)
            status["cdp_connected"]=True
            contexts=browser.contexts
            status["existing_context"]=bool(contexts)
            if contexts:
                page=contexts[0].new_page()
                try:
                    res=page.goto("https://groupsgyani.org/user/groups",
                        wait_until="domcontentloaded",timeout=22000)
                    page.wait_for_timeout(1000)
                    txt=page.locator("body").inner_text(timeout=4000).lower()
                    status["http_2xx"]=bool(res and 200<=res.status<300)
                    status["groupsgyani_signed_in"]=bool("no submissions yet" in txt or
                        "my groups" in txt and "login" not in page.url.lower())
                    status["login_redirect"]=bool("login" in page.url.lower() or "sign-in" in page.url.lower())
                finally:
                    page.close()
            print("SEO_AUTH_READONLY_SMOKE="+json.dumps(status),flush=True)
    except Exception as e:
        status["error_type"]=type(e).__name__
        print("SEO_AUTH_READONLY_SMOKE="+json.dumps(status),flush=True)
        raise
if __name__=="__main__":main()
