#!/usr/bin/env python3
"""Submit two existing KQ247 Telegram groups once through TelegramHub's free form.

One truthful listing per group. Persist before submit. Never bypass
authentication, anti-bot verification or fees, and never claim link publication.
"""
import datetime
import json
import pathlib
import re
import os
from playwright.sync_api import sync_playwright
ROOT = pathlib.Path("/state")
STATE = ROOT / "telegramhub-once.json"
FORM = "https://telegramhub.org/submit"
GROUPS = {
    "football":{"url":"https://t.me/keochuyengia79","topic":"Sports",
       "desc":"Nhóm miễn phí chia sẻ lịch trận, kết quả bóng đá, dữ liệu kèo châu Á/Tài Xỉu và nhận định tham khảo. Không bảo đảm kết quả."},
    "lottery":{"url":"https://t.me/xsbm999","topic":"News",
       "desc":"Nhóm miễn phí cập nhật kết quả xổ số XSMB XSMT XSMN theo ngày và đài, thống kê và phân tích dự đoán tham khảo. Không bảo đảm trúng thưởng."}
}
def now():return datetime.datetime.now(datetime.timezone.utc).isoformat()
def save(obj):
    ROOT.mkdir(parents=True,exist_ok=True)
    tmp=STATE.with_suffix(".tmp")
    tmp.write_text(json.dumps(obj,ensure_ascii=False,indent=2)+"\n",encoding="utf8")
    os.replace(tmp,STATE)
def visible(xs):
    return [x for x in xs.all() if x.is_visible()]
def block(page):
    return page.locator('[data-sitekey],iframe[src*="captcha"],.g-recaptcha,.h-captcha,.cf-turnstile').count()>0
def excerpt(page):
    try:return page.locator("body").inner_text(timeout=5000)[-1100:]
    except Exception:return ""
def attempt(page,k,g,doc):
    record={"group":k,"target":g["url"],"started":now(),"status":"inspecting"}
    resp=page.goto(FORM,wait_until="domcontentloaded",timeout=30000)
    if not resp or resp.status!=200:
        return dict(record,status="page_unavailable",http=resp.status if resp else None)
    if block(page):return dict(record,status="owner_verification_required")
    link = visible(page.locator('input[type="url"],input[placeholder*="t.me"]'))
    if not link:return dict(record,status="missing_link_input",excerpt=excerpt(page))
    link[-1].fill(g["url"])
    group_radio = visible(page.locator('input[type=radio][value="group" i]'))
    if group_radio:
        group_radio[0].check()
    else:
        labels=visible(page.get_by_text("Group",exact=True))
        if labels: labels[0].click()
        else:return dict(record,status="type_selection_unavailable",excerpt=excerpt(page))
    topics=visible(page.get_by_role("button",name=g["topic"],exact=True))
    if topics:
        topics[0].click()
    else:
        topics=visible(page.get_by_text(g["topic"],exact=True))
        if not topics:return dict(record,status="topic_selection_unavailable",excerpt=excerpt(page))
        topics[0].click()
    descriptions=visible(page.locator("textarea"))
    if not descriptions:return dict(record,status="description_missing",excerpt=excerpt(page))
    descriptions[0].fill(g["desc"])
    language_found=False
    for fld in visible(page.locator("select")):
        opts=fld.locator("option").evaluate_all('(xs)=>xs.map(x=>({v:x.value,t:x.textContent.trim()}))')
        vi=next((x for x in opts if x["v"] and re.search("vietnamese|tiếng việt",x["t"],re.I)),None)
        if vi:
            fld.select_option(value=vi["v"])
            language_found=True
            break
    record["vietnamese_selected"]=language_found
    if not language_found:return dict(record,status="language_unavailable",excerpt=excerpt(page))
    if block(page):return dict(record,status="owner_verification_required")
    submit=visible(page.get_by_role("button",name=re.compile("Submit Free|Submit",re.I)))
    if not submit:return dict(record,status="submit_control_missing",excerpt=excerpt(page))
    if re.search(r"sign in required|payment|credit card|captcha",excerpt(page),re.I):
        return dict(record,status="owner_or_payment_required",excerpt=excerpt(page))
    record["status"]="attempted_no_retry"
    record["clicked_at"]=now()
    doc["groups"][k]=record
    save(doc)
    submit[-1].click(timeout=14000)
    page.wait_for_timeout(2000)
    record["status"]="site_response_unverified"
    record["result_url"]=page.url
    record["response_excerpt"]=excerpt(page)
    if re.search("success|submitted|pending review|thank you|received",record["response_excerpt"],re.I):
        record["status"]="submission_acknowledged_pending_verification"
    return record
def main():
    try: d=json.loads(STATE.read_text(encoding="utf8"))
    except (OSError,ValueError):d={"source":FORM,"groups":{}}
    if not isinstance(d.get("groups"),dict): raise RuntimeError("invalid state")
    with sync_playwright() as w:
        browser=w.chromium.launch(headless=True,args=["--no-sandbox"])
        page=browser.new_page(viewport={"width":1300,"height":920})
        for k,g in GROUPS.items():
            if k in d["groups"]:
                print("NO_DUPLICATE_ATTEMPT",k,d["groups"][k].get("status"),flush=True)
                continue
            try:r=attempt(page,k,g,d)
            except Exception as e:r={"group":k,"target":g["url"],"status":"error_or_uncertain_no_retry","detail":type(e).__name__+":"+str(e)[:230],"at":now()}
            d["groups"][k]=r
            save(d)
            print("TELEGRAMHUB_RESULT",json.dumps(r,ensure_ascii=False),flush=True)
        browser.close()
    print("TELEGRAMHUB_RECEIPTS",json.dumps(d,ensure_ascii=False),flush=True)
if __name__=="__main__":main()
