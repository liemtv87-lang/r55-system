#!/usr/bin/env python3
"""One truthful, once-per-group submission to Groupsor; no repeated POSTs.

Result state is saved on VPS BEFORE clicking Submit to avoid duplicates.
A submitted form is not a published backlink. No CAPTCHA bypass.
"""
import json, os, pathlib, re, datetime
from playwright.sync_api import sync_playwright

STATE = pathlib.Path("/state/groupssor-attempts.json")
FORM = "https://www.groupssor.com/submit/"
GROUPS = (
    {"id":"football","url":"https://t.me/keochuyengia79",
     "name":"KQ247 - Thong tin bong da hom nay", "category":"Sports",
     "tags":"bong da, lich thi dau, ket qua bong da, viet nam",
     "description":"Cộng đồng miễn phí tham khảo lịch thi đấu, kết quả và phân tích bóng đá. Không bảo đảm kết quả dự đoán."},
    {"id":"lottery","url":"https://t.me/xsbm999",
     "name":"KQ247 - Ket qua xo so Viet Nam", "category":"News & Media",
     "tags":"xsmb, xsmt, xsmn, ket qua xo so, viet nam",
     "description":"Cộng đồng miễn phí cập nhật kết quả xổ số ba miền, lịch quay theo đài và phân tích thống kê tham khảo; không bảo đảm dự đoán chính xác."},
)
def now():
    return datetime.datetime.now(datetime.timezone.utc).isoformat()
def save(obj):
    STATE.parent.mkdir(parents=True,exist_ok=True)
    tmp=STATE.with_suffix(".tmp")
    tmp.write_text(json.dumps(obj,ensure_ascii=False,indent=2)+"\n",encoding="utf8")
    os.replace(tmp,STATE)
def text(page):
    try: return page.locator("body").inner_text(timeout=4500)[-850:]
    except Exception: return ""
def visible(loc):
    return [i for i in loc.all() if i.is_visible()]
def select_by_text(page, keyword, expected):
    selects=visible(page.locator("select"))
    for field in selects:
        info=field.locator("option").evaluate_all("(xs)=>xs.map(x=>({value:x.value,text:x.textContent.trim()}))")
        hits=[o for o in info if o["value"] and o["text"].lower()==expected.lower()]
        if hits:
            field.select_option(value=hits[0]["value"])
            return True
    return False
def fill_first(page, terms, value):
    for term in terms:
        matches=visible(page.locator(term))
        if matches:
            matches[0].fill(value)
            return True
    return False
def main():
    try:state=json.loads(STATE.read_text(encoding="utf8"))
    except (OSError,ValueError):state={"directory":FORM,"groups":{}}
    if not isinstance(state.get("groups"),dict):raise RuntimeError("invalid_state")
    with sync_playwright() as p:
        browser=p.chromium.launch(headless=True,args=["--no-sandbox"])
        page=browser.new_page(viewport={"width":1250,"height":950})
        for g in GROUPS:
            key=g["id"]
            if key in state["groups"]:
                print("GROUPSSOR_SKIP_PREVIOUS_ATTEMPT",key,state["groups"][key].get("state"),flush=True)
                continue
            receipt={"group":key,"target":g["url"],"time_utc":now(),"state":"inspection_started"}
            try:
                response=page.goto(FORM,wait_until="domcontentloaded",timeout=27000)
                if not response or response.status!=200:
                    receipt.update(state="form_unavailable",http=response.status if response else None)
                    state["groups"][key]=receipt;save(state);continue
                page.wait_for_timeout(550)
                if visible(page.locator("iframe[src*='captcha'],[data-sitekey]")):
                    receipt.update(state="human_verification_required")
                    state["groups"][key]=receipt;save(state);continue
                radios=visible(page.locator("input[type=radio]"))
                radios=[r for r in radios if "telegram" in (r.get_attribute("value") or "").lower()]
                if radios:radios[0].check()
                else:
                    labels=visible(page.get_by_label("Telegram",exact=True))
                    if labels:labels[0].check()
                    else:
                        receipt.update(state="form_changed",reason="telegram_radio_missing")
                        state["groups"][key]=receipt;save(state);continue
                ok=fill_first(page,[
                    "input[placeholder*='t.me']",
                    "input[name*='link' i]",
                    "input[name*='url' i]"],g["url"])
                ok=fill_first(page,[
                    "input[placeholder*='Web Dev']",
                    "input[name*='name' i]"],g["name"]) and ok
                ok=fill_first(page,[
                    "textarea",
                    "input[name*='description' i]"],g["description"]) and ok
                country=select_by_text(page,"country","Vietnam")
                language=select_by_text(page,"language","Vietnamese")
                category=select_by_text(page,"category",g["category"])
                if not category and key=="lottery":
                    # Only a clearly relevant factual-results classification.
                    category=select_by_text(page,"category","News")
                tags=visible(page.locator("input[placeholder*='coding']"))
                if tags:tags[0].fill(g["tags"])
                if not (ok and country and language and category):
                    receipt.update(state="form_mapping_incomplete",fields_ok=ok,country=country,
                                   language=language,category=category,excerpt=text(page))
                    state["groups"][key]=receipt;save(state);continue
                submit=visible(page.get_by_role("button",name=re.compile(r"Submit Group",re.I)))
                if not submit:
                    receipt.update(state="submit_button_missing",excerpt=text(page))
                    state["groups"][key]=receipt;save(state);continue
                # Durable state BEFORE any potential network POST.
                receipt["state"]="attempted_no_retry"
                state["groups"][key]=receipt;save(state)
                submit[0].click(timeout=15000)
                page.wait_for_timeout(1100)
                page_text=text(page)
                receipt["response_excerpt"]=page_text
                receipt["final_url"]=page.url
                if "Group submitted!" in page_text or "within 24–48 hours" in page_text:
                    receipt["state"]="pending_directory_review"
                elif re.search(r"already (?:submitted|exists)|duplicate",page_text,re.I):
                    receipt["state"]="already_exists"
                else:
                    receipt["state"]="uncertain_submission_no_retry"
                save(state)
            except Exception as exc:
                receipt["state"]="error_or_uncertain_no_retry"
                receipt["error"]=type(exc).__name__+": "+str(exc)[:210]
                state["groups"][key]=receipt;save(state)
            print("GROUPSSOR_RESULT",json.dumps(state["groups"][key],ensure_ascii=False),flush=True)
        browser.close()
    print("GROUPSSOR_FINAL",json.dumps(state,ensure_ascii=False),flush=True)

if __name__=="__main__":
    main()
