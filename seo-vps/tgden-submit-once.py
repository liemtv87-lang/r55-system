#!/usr/bin/env python3
"""Single truthful, idempotent submission for each KQ247 Telegram group to tgden."""
import datetime, json, os, pathlib, re
from playwright.sync_api import sync_playwright
URL = "https://tgden.com/en/suggest"
STATE = pathlib.Path("/state/tgden-once.json")
GROUPS = {"football":"keochuyengia79", "lottery":"xsbm999"}
def timestamp(): return datetime.datetime.now(datetime.timezone.utc).isoformat()
def save(data):
    STATE.parent.mkdir(parents=True,exist_ok=True)
    tmp=STATE.with_suffix(".tmp")
    tmp.write_text(json.dumps(data,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    os.replace(tmp,STATE)
def body(page):
    try: return page.locator("body").inner_text(timeout=3000)[-900:]
    except Exception: return ""
def visible(locator):
    return [x for x in locator.all() if x.is_visible()]
def inspect_and_submit(page,key,username,data):
    result={"group":key,"handle":"@"+username,"timestamp":timestamp(),"status":"inspect"}
    response=page.goto(URL,wait_until="domcontentloaded",timeout=27000)
    if not response or response.status!=200:
        return dict(result,status="site_unavailable",http=response.status if response else None)
    if page.locator('[data-sitekey],iframe[src*="captcha"],.g-recaptcha,.h-captcha,.cf-turnstile').count():
        return dict(result,status="human_verification_required")
    chats=visible(page.get_by_role("button",name=re.compile(r"^chat(s)?$",re.I)))
    if not chats:
        chats=visible(page.locator('[role="tab"]').filter(has_text=re.compile(r"^chat(s)?$",re.I)))
    if not chats:
        return dict(result,status="chat_tab_missing",excerpt=body(page))
    chats[0].click(timeout=7000)
    page.wait_for_timeout(400)
    inputs=visible(page.locator('input[placeholder*="username" i],input[name*="username" i],input[type="text"]'))
    if not inputs:
        return dict(result,status="username_field_missing",excerpt=body(page))
    inputs[0].fill("@"+username)
    buttons=visible(page.get_by_role("button",name=re.compile(r"^submit$",re.I)))
    if not buttons:
        return dict(result,status="submit_button_missing",excerpt=body(page))
    if page.locator('[data-sitekey],iframe[src*="captcha"],.g-recaptcha,.h-captcha,.cf-turnstile').count():
        return dict(result,status="human_verification_required")
    result.update(status="attempted_no_retry",clicked_at=timestamp())
    data["groups"][key]=result
    save(data)
    buttons[-1].click(timeout=10000)
    page.wait_for_timeout(1500)
    result.update(status="submitted_unverified",final_url=page.url,excerpt=body(page))
    if re.search(r"submitted|thank you|suggested|added|queued|success|sent for review",result["excerpt"],re.I):
        result["status"]="acknowledged_pending_publication"
    return result
def main():
    try: data=json.loads(STATE.read_text(encoding="utf-8"))
    except (OSError,ValueError):data={"directory":URL,"groups":{}}
    with sync_playwright() as browser_tool:
        browser=browser_tool.chromium.launch(headless=True,args=["--no-sandbox"])
        page=browser.new_page(viewport={"width":1280,"height":850})
        for key,username in GROUPS.items():
            if key in data["groups"]:
                print("NO_DUPLICATE",key,data["groups"][key].get("status"),flush=True)
                continue
            try: result=inspect_and_submit(page,key,username,data)
            except Exception as exc:
                result={"group":key,"handle":"@"+username,"status":"error_or_uncertain_no_retry","error":type(exc).__name__+":"+str(exc)[:220]}
            data["groups"][key]=result
            save(data)
            print("TGDEN_RESULT",json.dumps(result,ensure_ascii=False),flush=True)
        browser.close()
    print("TGDEN_SUMMARY",json.dumps(data,ensure_ascii=False),flush=True)
if __name__=="__main__":main()
