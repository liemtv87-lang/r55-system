#!/usr/bin/env python3
"""KQ247 two-group hourly Playwright discovery and link verification.

One public listing per independent directory/group, with proof. The worker does
not repeat submissions, evade protection, or touch the KQ247 production stack.
"""
import datetime
import json
import os
import pathlib
import re
from zoneinfo import ZoneInfo
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
    # TgDio profile routes are candidates, not counted until public page href verified.
    # Football profile is APPROVED in owner's account as of 2026-10-14 VN;
    # lottery remains pending owner submission.
    ("football", "https://vi.tgdio.com/group/%40keochuyengia79"),
    ("lottery", "https://vi.tgdio.com/group/%40xsbm999"),
]
DIRECTORIES = [
    # Prioritize Vietnam-facing sources before the generic international pool.
    # These are discovery checks; submissions are never made without validation.
    ("TeleGroups Vietnam", "https://telegroups.org/submit"),
    ("TgDio Vietnamese", "https://vi.tgdio.com/groups"),
    ("TgramLink Vietnam", "https://tgramlink.com/vi"),
    ("Telegram Groups Vietnam", "https://www.telegram-groups.com/dashboard/submit/"),
    ("TGDen Vietnam", "https://tgden.com/en/chats"),
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
    ("TelXplorer", "https://telxplorer.com/en/create_group"),
    ("TeleVerse", "https://televerse.click/submit"),
    ("Togather", "https://www.togather.in/submit"),
    ("Groupswa", "https://groupswa.com/submit-group-links/"),
    ("WT Group Links", "https://wtgrouplinks.com/submit-your-telegram-groups/"),
    ("Telegram Group", "https://telegram-group.com/en/publish/"),
    ("Telegram Group Org", "https://telegram-group.org/SubmitGroup.php"),
    ("Telekit", "https://telekit.link/addgroup"),
    ("TelegrmGroupLink", "https://telegrmgrouplink.com/add-your-telegram-group-channel-link-to-this-website-submit/"),
    ("World Telegram Directory", "https://sites.google.com/view/telegramdirectory/home"),
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
        if name in ("TGMania", "TGDirectory", "Groupsor", "TelXplorer", "Groupswa", "WT Group Links", "Telegram Group", "Telegram Group Org", "Telekit", "TelegrmGroupLink"):
            info["controls"] = page.evaluate("""() => [...document.querySelectorAll('input,select,textarea,button')].filter(e => e.getBoundingClientRect().width > 0).slice(0,35).map(e => ({
              tag:e.tagName.toLowerCase(),name:e.name || '',type:e.type || '',
              placeholder:e.placeholder || '',text:(e.innerText||'').trim().slice(0,70),
              options:e.tagName==='SELECT'?[...e.options].map(o=>({value:o.value,text:o.textContent.trim()})).slice(0,30):undefined
            }))""")
        return {"name": name, "url": url, "http": result.status,
                "final_url": page.url[:180], **info}
    except Exception as exc:
        return {"name": name, "url": url, "error": type(exc).__name__ + ": " + str(exc)[:120]}



def submit_tgmania(page, group):
    """One genuine directory listing; never retry if dispatch may have succeeded."""
    url = "https://tgmania.com/submit"
    record = {"directory":"TGMania","group":group,"at":utcnow(),"state":"not_started"}
    try:
        r = page.goto(url, wait_until="domcontentloaded", timeout=BROWSER_TIMEOUT_MS)
        if not r or r.status != 200:
            return dict(record, state="unavailable", http=r.status if r else None)
        if page.locator('[data-sitekey], iframe[src*="captcha"]').count():
            return dict(record, state="human_verification")
        name = GROUPS[group].rsplit("/",1)[-1]
        user_input = page.get_by_placeholder("@yourchannel")
        if not user_input.count():
            return dict(record, state="form_changed", stage="username")
        user_input.fill(name)
        group_radio = page.get_by_text("Group", exact=True)
        if group_radio.count():
            group_radio.last.click()
        nxt = page.get_by_role("button", name="Next: Choose Category")
        if not nxt.count():
            return dict(record, state="form_changed", stage="type")
        nxt.click()
        page.wait_for_timeout(450)
        for value in (["Sports", "Football", "Soccer"] if group == "football"
                      else ["Lottery", "Games", "News & Media", "News"]):
            choices = page.get_by_text(value, exact=True)
            visible = [x for x in choices.all() if x.is_visible()]
            if visible:
                visible[-1].click()
                record["category"]=value
                break
        if not record.get("category"):
            return dict(record, state="needs_category_mapping",
                        excerpt=page.locator("body").inner_text()[-700:])
        details = page.get_by_role("button", name="Next", exact=False)
        options = [x for x in details.all() if x.is_visible() and
                   "category" not in x.inner_text().lower()]
        if not options:
            return dict(record, state="needs_details_mapping", stage="category")
        options[-1].click()
        page.wait_for_timeout(450)
        if page.locator('[data-sitekey], iframe[src*="captcha"]').count():
            return dict(record, state="human_verification")
        descriptions = page.locator('textarea')
        if descriptions.count():
            descriptions.first.fill(
                "Cộng đồng tham khảo thông tin bóng đá và lịch thi đấu; "
                "khuyến khích tuân thủ pháp luật." if group == "football" else
                "Cộng đồng tham khảo kết quả xổ số Việt Nam và phân tích thống kê; "
                "khuyến khích tuân thủ pháp luật.")
        for field in page.locator('select').all():
            data = field.evaluate('(e)=>({name:e.name,opts:[...e.options].map(x=>({value:x.value,text:x.text}))})')
            if any(k in (data["name"] or "").lower() for k in ("language","lang")):
                match=next((x for x in data["opts"] if "vietnamese" in x["text"].lower()),None)
                if match: field.select_option(value=match["value"])
        submit = page.get_by_role("button", name="Submit", exact=False)
        visible = [x for x in submit.all() if x.is_visible()]
        if not visible:
            return dict(record, state="needs_submit_mapping",
                        excerpt=page.locator("body").inner_text()[-700:])
        # Call site once, record even if response is ambiguous, never retry blindly.
        record["state"]="dispatching"
        record["attempted_at"]=utcnow()
        visible[-1].click(timeout=10000)
        page.wait_for_timeout(1100)
        text=page.locator("body").inner_text().lower()
        record["receipt_url"]=page.url
        record["receipt_excerpt"]=text[-420:]
        if any(x in text for x in ("submitted successfully","submission received",
                                    "successfully submitted","pending approval",
                                    "review within 24","submission successful",
                                    "thanks for submitting","submitted for review")):
            record["state"]="pending_review"
        else:
            record["state"]="uncertain_submission"
        return record
    except Exception as exc:
        record["state"]="error"
        record["error"]=type(exc).__name__+": "+str(exc)[:160]
        return record



def read_public_telegram_members(page, group):
    """Best-effort visible public group count; unavailable is not zero."""
    url = GROUPS[group]
    try:
        r = page.goto(url, wait_until="domcontentloaded", timeout=BROWSER_TIMEOUT_MS)
        if not r or r.status != 200 or urlsplit(page.url).hostname != "t.me":
            return {"group":group,"count":None,"source":url,
                    "reason":"unavailable_http"}
        blocks=page.locator(".tgme_page_extra").all_text_contents()
        source=" ".join(blocks).strip()
        if not source:
            return {"group":group,"count":None,"source":url,
                    "reason":"member_count_not_public"}
        m=re.search(r"(?i)([\\d][\\d\\s.,]*?)([kKmM]?)\\s+(members|subscribers|thành viên)",source)
        if not m:
            return {"group":group,"count":None,"source":url,
                    "reason":"member_count_not_readable"}
        value=m.group(1).strip()
        suffix=m.group(2).lower()
        if suffix:
            parsed=float(value.replace(",",".")) * (1000 if suffix=="k" else 1000000)
        else:
            parsed=int(re.sub(r"\\D","",value))
        count=int(round(parsed))
        if count<=0:
            return {"group":group,"count":None,"source":url,
                    "reason":"invalid_member_count"}
        return {"group":group,"count":count,"source":url,"public_text":source[:110],
                "checked_at_utc":utcnow()}
    except Exception as exc:
        return {"group":group,"count":None,"source":url,
                "reason":type(exc).__name__}


def update_membership_growth(state, samples, now):
    """Daily observed net change, not join events or new-member attribution."""
    zone=ZoneInfo("Asia/Ho_Chi_Minh")
    start=datetime.datetime.fromisoformat(now)
    day=start.astimezone(zone).date().isoformat()
    history=state.setdefault("member_samples",{})
    today={}
    for group, sample in samples.items():
        rows=history.setdefault(group,[])
        count=sample.get("count")
        if count is not None:
            rows.append({"at":now,"date_vn":day,"count":count})
            rows[:]=rows[-240:]
        current=[r for r in rows if r["date_vn"]==day]
        if count is not None and current:
            today[group]={
                "current_public_members":count,
                "baseline_public_members":current[0]["count"],
                "baseline_utc":current[0]["at"],
                "observed_net_member_change_today":count-current[0]["count"],
                "daily_net_goal":25,
                "notes":"Change since first available Vietnam-day sample, not verified new joins."
            }
        else:
            today[group]={
                "current_public_members":None,"baseline_public_members":None,
                "observed_net_member_change_today":None,"daily_net_goal":25,
                "notes":"No reliable public group membership count yet."
            }
    net=[x["observed_net_member_change_today"] for x in today.values()]
    return {"date_vn":day, "goal_total_net_members_per_day":50,
            "observed_net_member_change_today":sum(net) if len(net)==len(GROUPS) and
              all(x is not None for x in net) else None,
            "by_group":today}


def main():
    DATA.mkdir(parents=True, exist_ok=True)
    try:
        state = json.loads(STATE.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        state = {}
    state.setdefault("sent", ALREADY_SENT)
    state.setdefault("verified", {})
    state.setdefault("attempt_history", [])
    state.setdefault("submission_attempts", {})
    for directory, groups in ALREADY_SENT.items():
        present = set(state["sent"].get(directory, []))
        state["sent"][directory] = sorted(present | set(groups))
    now = utcnow()
    discoveries = []
    checks = []
    submissions = []
    member_samples = {}
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 1100, "height": 780},
                                      ignore_https_errors=False)
        page = context.new_page()
        for group in GROUPS:
            member_samples[group]=read_public_telegram_members(page,group)
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
        for group in GROUPS:
            key="TGMania|"+group
            if key not in state["submission_attempts"]:
                # Persist the intent before interacting with third party form.
                state["submission_attempts"][key]={
                    "state":"started","at":utcnow()}
                atomic_json(STATE,state)
                receipt=submit_tgmania(page,group)
                state["submission_attempts"][key]=receipt
                submissions.append(receipt)
                if receipt["state"] in ("pending_review","uncertain_submission","dispatching"):
                    state["sent"].setdefault("TGMania",[])
                    if group not in state["sent"]["TGMania"]:
                        state["sent"]["TGMania"].append(group)
                atomic_json(STATE,state)
        for item in discoveries:
            if item["name"] in ("TGMania", "TGDirectory", "Groupsor", "TelXplorer", "Groupswa", "WT Group Links", "Telegram Group", "Telegram Group Org", "Telekit", "TelegrmGroupLink"):
                print("FORM_AUDIT=" + json.dumps(item, ensure_ascii=False)[:5000], flush=True)
        context.close()
        browser.close()

    membership_growth = update_membership_growth(state, member_samples, now)
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
        "submission_attempts": state["submission_attempts"],
        "telegram_public_member_samples": member_samples,
        "membership_growth_today": membership_growth,
        "reach_growth_today": {"target_daily_reach":1000,
            "verified_daily_reach":None,
            "measurement_status":"Not configured: no verified Search Console impressions or first-party reach dataset. Do not infer reach from backlinks."},
        "new_submissions": submissions,
        "published_checks": checks,
        "submitted_previously": state["sent"],
        "mode": "Playwright audit and approved one-time directory submissions; no duplicates or CAPTCHA bypass",
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
        "verified_public_urls": {k:v["published_listing_urls"] for k,v in by_group.items()},
        "published_checks": [{k:x.get(k) for k in ("group","url","http","verified","has_target_anchor","final_url") if k in x} for x in checks],
        "daily_growth": membership_growth,
        "reach_measurement": "unavailable",
        "registration_attempts": {k:{"state":v.get("state"),"error":v.get("error"),"stage":v.get("stage")} for k,v in state["submission_attempts"].items()},
        "directories_inspected": len(discoveries),
        "submission_results": [{k:v for k,v in x.items() if k in ("directory","group","state","category")} for x in submissions],
    }, ensure_ascii=False), flush=True)


if __name__ == "__main__":
    main()
