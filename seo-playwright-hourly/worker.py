#!/usr/bin/env python3
"""KQ247 two-group hourly Playwright discovery and link verification.

One public listing per independent directory/group, with proof. The worker does
not repeat submissions, evade protection, or touch the KQ247 production stack.
"""
import datetime
import json
import os
import pathlib
from urllib.parse import urlsplit

from playwright.sync_api import sync_playwright

GROUPS = {
    "football": "https://t.me/keochuyengia79",
    "lottery": "https://t.me/xsbm999",
}
DATA = pathlib.Path("/state")
STATE = DATA / "state.json"
REPORT = DATA / "latest.json"
GOAL_PER_HOUR = 100
BROWSER_TIMEOUT_MS = 16000
SEED_LINKS = [
    ("football", "https://tgfind.net/en/resource/keochuyengia79"),
    ("lottery", "https://tgfind.net/en/resource/xsbm999"),
    ("football", "https://telejoiner.com/invite/1002315121695"),
    ("lottery", "https://telejoiner.com/invite/1004320899120"),
]
DIRECTORIES = [
    ("TGMania", "https://tgmania.com/submit"),
    ("TopTGLinks", "https://toptglinks.com/submit"),
    ("Groupsor", "https://groupssor.com/submit"),
    ("TGDirectory", "https://telegramchannels.io/submit-channel"),
    ("TGFind", "https://tgfind.io/en/inclusion-link"),
    ("TG-Hub", "https://tg-hub.com/submit-telegram-channel-and-group-links/"),
    ("Groupverse", "https://groupverse.co.in/submit-your-group.html"),
    ("Groupsgyani", "https://groupsgyani.org/submit-telegram-group-and-channel-links"),
    ("TeleGroups", "https://telegramgroup.arkservices.in/submit"),
    ("TGCamp", "https://tgcamp.com/auth/register"),
    ("TelegramGroups", "https://telegramgroups.co/submit"),
    ("TelegramHub", "https://telegramhub.org/submit"),
]
# The entries below were already submitted earlier. Never repeat them.
ALREADY_SENT = {
    "TGFind": list(GROUPS),
    "TopTGLinks": list(GROUPS),
    "TeleJoiner": list(GROUPS),
    "Groupmandi": list(GROUPS),
}


def utcnow():
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


def atomic_json(path, obj):
    temp = path.with_suffix(".tmp")
    temp.write_text(json.dumps(obj, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    os.replace(temp, path)


def public_https(url):
    try:
        p = urlsplit(url)
        return p.scheme == "https" and bool(p.hostname) and not p.username and not p.password
    except ValueError:
        return False


def target_parts(url):
    u = urlsplit(url)
    return ((u.hostname or "").lower().removeprefix("www."), u.path.rstrip("/").lower())


def inspect(page, url, expected):
    if not public_https(url):
        return {"url": url, "error": "invalid_https"}
    try:
        response = page.goto(url, wait_until="domcontentloaded", timeout=BROWSER_TIMEOUT_MS)
        if not response:
            return {"url": url, "error": "no_response"}
        page.wait_for_timeout(350)
        links = page.locator("a[href]").evaluate_all("(xs)=>xs.map(x=>x.href).slice(0,2500)")
        valid = target_parts(expected) in {target_parts(x) for x in links}
        return {
            "url": url,
            "http": response.status,
            "final_url": page.url[:300],
            "has_target_anchor": bool(valid),
            "verified": bool(response.status == 200 and valid and
                             urlsplit(page.url).hostname == urlsplit(url).hostname),
            "title": page.title()[:100],
        }
    except Exception as exc:
        return {"url": url, "error": type(exc).__name__ + ": " + str(exc)[:125]}


def discover(page, name, url):
    try:
        result = page.goto(url, wait_until="domcontentloaded", timeout=BROWSER_TIMEOUT_MS)
        if not result:
            return {"name": name, "url": url, "error": "no_response"}
        page.wait_for_timeout(350)
        info = page.evaluate("""() => ({
            forms: document.querySelectorAll('form').length,
            submitInputs: [...document.querySelectorAll('input')].filter(x =>
                /telegram|group|username|invite|link/i.test(x.name+' '+x.placeholder)).length,
            captcha: !!document.querySelector('[data-sitekey],iframe[src*=captcha]'),
            loginRequired: /sign in to submit|login required|register to submit/i.test(
                document.body.innerText.slice(0,1200))
        })""")
        if name in ("TGMania", "TGDirectory", "Groupsor"):
            info["controls"] = page.evaluate("""() => [...document.querySelectorAll('input,select,textarea,button')].filter(e => e.getBoundingClientRect().width > 0).slice(0,35).map(e => ({
              tag:e.tagName.toLowerCase(),name:e.name || '',type:e.type || '',
              placeholder:e.placeholder || '',text:(e.innerText||'').trim().slice(0,70),
              options:e.tagName==='SELECT'?[...e.options].map(o=>({value:o.value,text:o.textContent.trim()})).slice(0,30):undefined
            }))""")
        return {"name": name, "url": url, "http": result.status,
                "final_url": page.url[:180], **info}
    except Exception as exc:
        return {"name": name, "url": url, "error": type(exc).__name__ + ": " + str(exc)[:120]}


def main():
    DATA.mkdir(parents=True, exist_ok=True)
    try:
        state = json.loads(STATE.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        state = {}
    state.setdefault("sent", ALREADY_SENT)
    state.setdefault("verified", {})
    state.setdefault("attempt_history", [])
    for directory, groups in ALREADY_SENT.items():
        present = set(state["sent"].get(directory, []))
        state["sent"][directory] = sorted(present | set(groups))
    now = utcnow()
    discoveries = []
    checks = []
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 1100, "height": 780},
                                      ignore_https_errors=False)
        page = context.new_page()
        for group, url in SEED_LINKS:
            item = inspect(page, url, GROUPS[group])
            item["group"] = group
            checks.append(item)
            if item.get("verified"):
                key = group + "|" + url
                state["verified"].setdefault(
                    key, {"group": group, "listing_url": url,
                          "first_seen_utc": "2026-10-13T22:23:43+00:00"
                          if "tgfind.net" in url else now})
                state["verified"][key]["last_verified_utc"] = now
            else:
                state["verified"].pop(group + "|" + url, None)
        for name, url in DIRECTORIES:
            discoveries.append(discover(page, name, url))
        for item in discoveries:
            if item["name"] in ("TGMania", "TGDirectory", "Groupsor"):
                print("FORM_AUDIT=" + json.dumps(item, ensure_ascii=False)[:5000], flush=True)
        context.close()
        browser.close()

    by_group = {}
    verified = list(state["verified"].values())
    for group in GROUPS:
        entries = [x for x in verified if x["group"] == group]
        by_group[group] = {
            "verified_total": len(set(x["listing_url"] for x in entries)),
            "verified_in_last_hour": sum(
                1 for x in entries if
                (datetime.datetime.fromisoformat(now) -
                 datetime.datetime.fromisoformat(x["first_seen_utc"])).total_seconds() < 3600),
            "published_listing_urls": sorted(set(x["listing_url"] for x in entries)),
        }
    new_links = sum(v["verified_in_last_hour"] for v in by_group.values())
    result = {
        "checked_at_utc": now,
        "groups": GROUPS,
        "target_new_backlinks_per_hour_total": GOAL_PER_HOUR,
        "verified_new_this_hour": new_links,
        "shortfall_vs_target": max(0, GOAL_PER_HOUR - new_links),
        "group_metrics": by_group,
        "directory_checks": discoveries,
        "published_checks": checks,
        "submitted_previously": state["sent"],
        "mode": "Playwright browser audit; no duplicate submissions or automated CAPTCHA bypass",
        "production_containers_touched": False,
        "limitations": [
            "A successful form response does not prove a public backlink.",
            "New registrations require an independent directory that permits a truthful, one-time listing.",
            "100 verified external backlinks per hour is a target, not a guaranteed result.",
        ],
    }
    state["last_run_utc"] = now
    atomic_json(STATE, state)
    atomic_json(REPORT, result)
    print("KQ247_TWO_GROUPS_HOURLY=" + json.dumps({
        "checked_at_utc": now, "verified_by_group": {
            key: val["verified_total"] for key, val in by_group.items()},
        "new_this_hour": new_links, "goal": GOAL_PER_HOUR,
        "directories_inspected": len(discoveries),
    }, ensure_ascii=False), flush=True)


if __name__ == "__main__":
    main()
