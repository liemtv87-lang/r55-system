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
    # Form fields are ordered Category, Country, Language. Never choose
    # an 'Other' option from a different field.
    selects=visible(page.locator("select"))
    positions={"category":0,"country":1,"language":2}
    position=positions.get(keyword,-1)
    if position<0 or len(selects)<=position:return False
    field=selects[position]
    info=field.locator("option").evaluate_all("(xs)=>xs.map(x=>({value:x.value,text:x.textContent.trim()}))")
    hits=[o for o in info if o["value"] and (
        o["text"].strip().lower()==expected.lower() or
        o["text"].strip().lower().endswith(" "+expected.lower()) or
        o["value"].strip().lower()==expected.lower())]
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
            previous=state["groups"].get(key)
            if previous:
                # The previous attempt never reached Submit: radio action timed out.
                # Only this provably pre-submit state can be retried.
                safe_retry=(
                    (previous.get("state")=="error_or_uncertain_no_retry"
                     and "Locator.check" in previous.get("error","")
                     and "response_excerpt" not in previous)
                    or previous.get("state")=="form_mapping_incomplete"
                )
                if safe_retry:
                    print("GROUPSSOR_RETRY_PRE_SUBMIT_RADIO",key,flush=True)
                    del state["groups"][key]
                    save(state)
                else:
                    print("GROUPSSOR_SKIP_PREVIOUS_ATTEMPT",key,previous.get("state"),flush=True)
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
                # The site's CSS makes radio inputs screen-reader-only. A
                # visibility filter drops the Telegram input altogether.
                telegram_radio=page.locator("#submit-group-form input[name='platform'][value='telegram']")
                if telegram_radio.count()!=1:
                    receipt.update(state="form_changed",reason="telegram_radio_missing")
                    state["groups"][key]=receipt;save(state);continue
                telegram_radio.evaluate("(el) => el.click()")
                if not telegram_radio.is_checked():
                    raise RuntimeError("telegram_radio_not_selected")
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
                if not language:language=select_by_text(page,"language","Other")
                if not country:country=select_by_text(page,"country","Other")
                category=select_by_text(page,"category",g["category"])
                if not category and key=="lottery":
                    # Only a clearly relevant factual-results classification.
                    category=select_by_text(page,"category","News")
                tags=visible(page.locator("input[placeholder*='coding']"))
                if tags:tags[0].fill(g["tags"])
                if not (ok and country and language and category):
                    options=[x.locator("option").all_text_contents() for x in visible(page.locator("select"))]
                    receipt.update(state="form_mapping_incomplete",fields_ok=ok,country=country,
                                   language=language,category=category,option_sets=options,excerpt=text(page))
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
