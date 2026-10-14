#!/usr/bin/env python3
"""Submit each owned KQ247 Telegram group at most once to TopOfTelegram free directory.
Never buy promotion, fabricate identity, bypass verification, or resubmit uncertain POST.
Group avatars are fetched by directory from public Telegram per its own FAQ.
"""
import datetime, json, os, pathlib, re
from urllib.parse import urlparse, urljoin
from playwright.sync_api import sync_playwright

FORM="https://buyinoffer.com/add-channel.html"
STATE=pathlib.Path("/state/topoftelegram-once.json")
GROUPS={
 "football": {"url":"https://t.me/keochuyengia79","category":["sports","football","sport","news"]},
 "lottery": {"url":"https://t.me/xsbm999","category":["news","education","entertainment"]}
}
def now():return datetime.datetime.now(datetime.timezone.utc).isoformat()
def save(state):
    STATE.parent.mkdir(parents=True,exist_ok=True)
    tmp=STATE.with_suffix(".tmp")
    tmp.write_text(json.dumps(state,ensure_ascii=False,indent=2)+"\n",encoding="utf8")
    os.replace(tmp,STATE)
def visible_controls(page):
    return page.evaluate("""() => ({
      selects:[...document.querySelectorAll('select')].filter(e=>e.getBoundingClientRect().width>0).map(e=>({
        id:e.id,name:e.name,options:[...e.options].map(o=>({value:o.value,text:o.textContent.trim()})).slice(0,250)
      })),
      inputs:[...document.querySelectorAll('input')].filter(e=>e.getBoundingClientRect().width>0)
        .map(e=>({name:e.name,id:e.id,type:e.type,value:e.value,placeholder:e.placeholder,
          surrounding:(e.closest('label')?.innerText||e.parentElement?.innerText||'').trim().slice(0,140)})).slice(0,75),
      buttons:[...document.querySelectorAll('button,[type=submit]')].filter(e=>e.getBoundingClientRect().width>0)
        .map(e=>({text:(e.innerText||e.value||'').trim().slice(0,100)})).slice(0,12),
      excerpt:(document.body?.innerText||'').slice(0,1450)
    })""")
def pick_radio(page,keywords,kind):
    loc=page.locator("input[type=radio]")
    candidates=loc.evaluate_all("""els=>els.map((x,i)=>({
       i,value:x.value,name:x.name,id:x.id,
       label:(x.closest('label')?.innerText||x.parentElement?.innerText||'').trim().slice(0,150)
    }))""")
    matched=[]
    for x in candidates:
        words=" ".join(str(x.get(v,"")) for v in ("label","value","name","id")).lower()
        for keyword in keywords:
            if re.search(r"\b"+re.escape(keyword)+r"\b",words):
                matched.append(x["i"]);break
    if not matched:return False,{"kind":kind,"candidates":candidates[:25]}
    for i in matched:
        radio=loc.nth(i)
        if radio.is_visible():
            try:
                radio.check(force=False,timeout=3500)
                if radio.is_checked():return True,{"kind":kind,"index":i}
            except Exception:continue
    return False,{"kind":kind,"matched":matched}
def select_by_label(page,semantic,choices):
    selects=page.locator("select")
    candidates=[]
    for i in range(selects.count()):
        sel=selects.nth(i)
        if not sel.is_visible():continue
        info=sel.evaluate("""e=>({id:e.id,name:e.name,options:[...e.options].map(x=>({v:x.value,t:x.textContent.trim()}))})""")
        role=(info["id"]+" "+info["name"]).lower()
        role_score=5 if semantic in role else 0
        for rank,word in enumerate(choices):
            for option in info["options"]:
                if option["v"] and option["t"].strip().lower()==word.lower():
                    candidates.append((role_score+10-rank,i,option,info))
    if not candidates:return None
    candidates.sort(key=lambda x:-x[0])
    score,idx,opt,info=candidates[0]
    selects.nth(idx).select_option(value=opt["v"],timeout=4000)
    return {"field":info["name"] or info["id"],"option":opt["t"]}
def check_public(page,target):
    try:
        u=urlparse(page.url)
        if u.scheme!="https" or u.hostname!="buyinoffer.com":return None
        links=page.locator("a[href]").evaluate_all("(as)=>as.map(a=>a.href)")
        return any(l.rstrip("/").lower()==target.lower() for l in links)
    except Exception:return None
def do_group(page,key,spec,report):
    result={"group":key,"url":spec["url"],"at_utc":now(),"status":"inspecting"}
    response=page.goto(FORM,wait_until="domcontentloaded",timeout=22000)
    if not response or response.status!=200:return dict(result,status="site_unavailable",http=response.status if response else None)
    page.wait_for_timeout(400)
    if page.locator("[data-sitekey],iframe[src*='captcha'],.g-recaptcha,.h-captcha,.cf-turnstile").count():
        return dict(result,status="human_verification_required")
    form_text=page.locator("body").inner_text(timeout=5000)
    if "₹0" not in form_text and "Always Free" not in form_text:
        return dict(result,status="free_option_not_verified")
    group_ok,gd=pick_radio(page,["group"],"Group")
    free_ok,fd=pick_radio(page,["free","directory"],"Free Listing")
    if not group_ok or not free_ok:
        return dict(result,status="type_or_free_selection_missing",group_radio=gd,listing_radio=fd,
            controls=visible_controls(page))
    link=page.locator('input[placeholder*="t.me"]')
    if not link.count():link=page.locator('input[type=url]')
    if not link.count():return dict(result,status="telegram_link_field_missing",controls=visible_controls(page))
    link.first.fill(spec["url"],timeout=4000)
    country=select_by_label(page,"country",["Vietnam","Viet Nam","Việt Nam"])
    language=select_by_label(page,"language",["Vietnamese","Tiếng Việt","Viet Nam"])
    category=select_by_label(page,"category",spec["category"])
    result.update(country=country,language=language,category=category)
    if not all([country,language,category]):
        return dict(result,status="country_language_or_category_unsupported",controls=visible_controls(page))
    # Only the free directory choice is permitted. Never select payment, upload receipts,
    # or authorize charges. Terms are accepted solely for a verified free listing.
    if not free_ok:return dict(result,status="not_free")
    boxes=page.locator('input[type=checkbox]')
    for box in boxes.all():
        if box.is_visible() and not box.is_checked():
            box.check(timeout=4000)
    submit=page.get_by_role("button",name=re.compile("submit listing request",re.I))
    if not submit.count():submit=page.locator('button[type=submit],input[type=submit]')
    if not submit.count():return dict(result,status="submit_button_missing",controls=visible_controls(page))
    # Persist intent before the possible POST so no uncertain submission gets repeated.
    result.update(status="attempted_no_retry",submit_at_utc=now())
    report["groups"][key]=result;save(report)
    submit.last.click(timeout=11000)
    page.wait_for_timeout(1800)
    body=page.locator("body").inner_text(timeout=5000)
    result.update(status="submission_outcome_unverified",post_url=page.url,
        feedback=body[-1350:])
    if re.search(r"thank you|success|request received|submitted successfully|under review|review and publish",body[-1800:],re.I):
        result["status"]="submitted_pending_review"
    if re.search(r"payment required|pay now|send payment|you must pay",body[-1400:],re.I):
        result["status"]="unexpected_payment_step_no_retry"
    return result
def main():
    try: report=json.loads(STATE.read_text(encoding="utf8"))
    except (OSError,ValueError):report={"form":FORM,"groups":{}}
    if not isinstance(report.get("groups"),dict):raise RuntimeError("Malformed persisted state")
    with sync_playwright() as p:
        browser=p.chromium.launch(headless=True,args=["--no-sandbox"])
        page=browser.new_page(viewport={"width":1330,"height":900})
        for key,spec in GROUPS.items():
            if key in report["groups"]:
                print("KQ247_TOPOFTELEGRAM_SKIP_PRIOR",key,report["groups"][key].get("status"),flush=True)
                continue
            try: rec=do_group(page,key,spec,report)
            except Exception as e:
                rec={"group":key,"url":spec["url"],"at_utc":now(),
                    "status":"error_or_uncertain_no_retry","error":type(e).__name__+":"+str(e)[:270]}
            report["groups"][key]=rec;save(report)
            summary={k:v for k,v in rec.items() if k not in ("controls","feedback")}
            print("KQ247_TOPOFTELEGRAM_RESULT="+json.dumps(summary,ensure_ascii=False),flush=True)
        browser.close()
    print("KQ247_TOPOFTELEGRAM_SUMMARY="+json.dumps({
        k:{"status":v.get("status"),"country":v.get("country"),"language":v.get("language"),
           "category":v.get("category")} for k,v in report["groups"].items()
    },ensure_ascii=False),flush=True)
if __name__=="__main__":main()
