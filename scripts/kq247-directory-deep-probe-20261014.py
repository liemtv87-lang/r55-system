#!/usr/bin/env python3
"""Inspect fresh, independent Telegram directory submission controls.
No POST, no authentication, no captcha bypass, no production containers changed.
"""
import datetime, json, pathlib, re
from urllib.parse import urlsplit
from playwright.sync_api import sync_playwright
ROOT=pathlib.Path("/state")
URLS=[
("TopOfTelegram", "https://buyinoffer.com/add-channel.html"),
("TeleGroups", "https://telegramgroup.arkservices.in/submit"),
("Telekit", "https://telekit.link/addgroup"),
("TGFinder", "https://tgfinder.net/submit"),
("TelegramHubApp", "https://telegramhub.app/submit"),
("Telegradia", "https://telegradia.com"),
("SpamFixer", "https://spamfixer.ru/en/catalog/"),
("Togather", "https://togather.in/submit"),
("WTGroupLinks", "https://www.wtgrouplinks.com/submit-your-telegram-groups/"),
("TelegramHub", "https://telegramhub.org/submit"),
("TelegramGroup", "https://telegram-group.com/en/publish/"),
("TGDen", "https://tgden.com/en/suggest"),
("TopTGLinks", "https://toptglinks.com/submit")
]
NOW=datetime.datetime.now(datetime.timezone.utc).isoformat()
JS="""() => ({
 title: document.title,
 text:(document.body?.innerText||'').slice(0,3500),
 forms:[...document.forms].slice(0,5).map(f=>({method:f.method,action:f.action})),
 fields:[...document.querySelectorAll('input,textarea,select')].filter(x=>x.getBoundingClientRect().width>0)
 .slice(0,55).map(e=>({tag:e.tagName,type:e.type,name:e.name,id:e.id,
  required:e.required,placeholder:e.placeholder,value:(e.type==='hidden'||e.type==='password')?'':String(e.value||'').slice(0,90),
  options:e.tagName==='SELECT'?[...e.options].slice(0,200).map(o=>({v:o.value,t:o.textContent.trim()})):undefined})),
 buttons:[...document.querySelectorAll('button,input[type=submit]')].filter(x=>x.getBoundingClientRect().width>0)
 .slice(0,25).map(e=>({text:(e.innerText||e.value||'').trim().slice(0,100),disabled:!!e.disabled})),
 captcha:!!document.querySelector('[data-sitekey],iframe[src*=captcha],.g-recaptcha,.h-captcha,.cf-turnstile')
})"""
def classify(row):
    if row.get("status")!=200:return "unavailable_or_blocked"
    if row.get("captcha"):return "captcha_review"
    fs=row.get("fields",[])
    vals=" ".join((x.get("name","")+" "+x.get("placeholder","")+" "+x.get("id","")).lower() for x in fs)
    opts=[(o.get("t","") or "").lower() for x in fs for o in x.get("options",[]) or []]
    text=(row.get("text") or "").lower()
    if any(x in text for x in ["temporarily paused","submissions are closed","not accepting submissions"]):return "closed"
    if any(x in text for x in ["login required","sign in to submit"]):return "login_required"
    if not any(x in vals for x in ("telegram","t.me","group","channel","url","link","invite")):
        return "no_public_link_input"
    has_country=any("vietnam" in o or "viet nam" in o for o in opts)
    has_lang=any("vietnamese" in o or "tiếng việt" in o for o in opts)
    has_sports=any("sport" in o or "football" in o for o in opts)
    has_news=any("news" in o or "entertainment" in o or "gaming" in o for o in opts)
    has_free=bool(re.search(r"always free|free listing|100% free|free directory|₹0|\bfree\b",text))
    row["eligibility_flags"]={"country_vietnam":has_country,"language_vietnamese":has_lang,
        "football_category":has_sports,"lottery_category":has_news,"free_claim":has_free}
    if (has_country or not any("country" in x for x in vals.split())) and has_free:
        return "candidate_requires_category_terms_review"
    return "form_requires_manual_eligibility_check"
def main():
    ROOT.mkdir(exist_ok=True,parents=True)
    rows=[]
    with sync_playwright() as p:
        browser=p.chromium.launch(headless=True,args=["--no-sandbox"])
        page=browser.new_page(viewport={"width":1380,"height":1000})
        page.set_default_timeout(8000)
        for name,url in URLS:
            record={"name":name,"url":url,"at":NOW}
            try:
                resp=page.goto(url,wait_until="domcontentloaded",timeout=14000)
                page.wait_for_timeout(500)
                info=page.evaluate(JS)
                record.update(status=(resp.status if resp else None),final_url=page.url,**info)
                record["eligibility_status"]=classify(record)
            except Exception as e:
                record.update(status=None,eligibility_status="unavailable_or_blocked",
                    error=type(e).__name__+":"+str(e)[:160])
            rows.append(record)
            print("KQ247_SOURCE_FORM="+json.dumps({
              k:v for k,v in record.items() if k in
              ("name","url","status","eligibility_status","eligibility_flags","captcha","error")
            },ensure_ascii=False),flush=True)
        browser.close()
    output={"checked_at_utc":NOW,"inspected":len(rows),"posted":0,"rows":rows,
      "rules":"No posts; no claim of free eligibility until country, category and policy checked."}
    (ROOT/"form-depth.json").write_text(json.dumps(output,ensure_ascii=False,indent=2)+"\n")
    print("KQ247_FORM_SUMMARY="+json.dumps({
      "inspected":len(rows),"live":sum(x.get("status")==200 for x in rows),
      "candidates":[{"site":x["name"],"url":x["url"],"flags":x.get("eligibility_flags")}
        for x in rows if x.get("eligibility_status")=="candidate_requires_category_terms_review"],
      "blocked":[{"site":x["name"],"status":x.get("eligibility_status")} for x in rows
        if x.get("eligibility_status")!="candidate_requires_category_terms_review"],
      "published_by_this_job":0
    },ensure_ascii=False),flush=True)
if __name__=="__main__":main()
