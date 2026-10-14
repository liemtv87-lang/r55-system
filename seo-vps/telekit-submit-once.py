#!/usr/bin/env python3
"""Submit the two existing KQ247 groups once to Telekit's public free directory.

Stop on login, CAPTCHA, unknown category, or changed form. Save a durable
receipt before POST; never repost uncertain outcomes. No production changes.
"""
import datetime
import json
import pathlib
import re
import os
from urllib.parse import urljoin
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path("/state")
STATE = ROOT / "telekit-once.json"
FORM = "https://telekit.link/addgroup"
GROUPS = {
    "football": {"url": "https://t.me/keochuyengia79", "categories": ("sports", "sport", "football", "news"), "country": ("vietnam", "viet nam"), "language": ("vietnamese", "tiếng việt")},
    "lottery": {"url": "https://t.me/xsbm999", "categories": ("news", "entertainment", "gaming"), "country": ("vietnam", "viet nam"), "language": ("vietnamese", "tiếng việt")},
}

def utcnow():
    return datetime.datetime.now(datetime.timezone.utc).isoformat()

def save(data):
    ROOT.mkdir(parents=True, exist_ok=True)
    tmp = STATE.with_suffix(".tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2)+"\n", encoding="utf8")
    os.replace(tmp, STATE)

def brief(page):
    try:
        return page.locator("body").inner_text(timeout=4500)[-900:]
    except Exception:
        return ""

def risk(page):
    return bool(page.locator('[data-sitekey],iframe[src*="captcha"],.g-recaptcha,.h-captcha,.cf-turnstile').count())

def selects(page):
    return page.locator("select").evaluate_all("""xs=>xs.filter(x=>x.getBoundingClientRect().width>0).map(x=>({
        id:x.id,name:x.name,options:[...x.options].map(y=>({value:y.value,label:y.textContent.trim()}))
    }))""")

def select_exact_visible(page, choices):
    info = selects(page)
    names = []
    for selector in info:
        opts = selector["options"]
        for key in choices:
            for opt in opts:
                if opt["value"] and opt["label"].strip().lower() == key.lower():
                    names.append((selector, opt))
    for selector,opt in names:
        element = page.locator("select"+("#"+selector["id"] if selector["id"] else '[name="'+selector["name"]+'"]'))
        if element.count():
            element.select_option(value=opt["value"])
            return opt["label"]
    return None

def next_button(page):
    # Telekit uses a visible #nextBtn, but its accessible role/name lookup
    # may not resolve because of styling or nested markup.
    primary = page.locator("button#nextBtn")
    if primary.count() and primary.first.is_visible() and primary.first.is_enabled():
        return primary.first
    buttons = page.get_by_role("button", name=re.compile(r"^NEXT$", re.I))
    return next((x for x in buttons.all() if x.is_visible() and x.is_enabled()), None)

def one(page, key, group, data):
    receipt = {"group":key, "url":group["url"], "timestamp":utcnow(), "state":"inspection"}
    response=page.goto(FORM, wait_until="domcontentloaded", timeout=28000)
    if not response or response.status != 200:
        return dict(receipt, state="unavailable", http=response.status if response else None)
    page.wait_for_timeout(650)
    if risk(page):
        return dict(receipt, state="captcha_requires_owner")
    inp=page.locator("#glink")
    if not inp.count():
        return dict(receipt,state="form_changed_link_field",excerpt=brief(page))
    inp.fill(group["url"])
    page.wait_for_timeout(3200)
    button=next_button(page)
    if not button:
        found=page.evaluate("""()=>[...document.querySelectorAll('button,input[type=submit],a,[role=button]')]
          .filter(x=>/next|verify|continue/i.test((x.innerText||x.value||'').trim()))
          .slice(0,15).map(x=>({tag:x.tagName,id:x.id,text:(x.innerText||x.value||'').trim().slice(0,75),
          disabled:x.disabled||false,aria:x.getAttribute('aria-disabled'),
          classes:typeof x.className==='string'?x.className.slice(0,140):''}))""")
        return dict(receipt,state="next_button_unavailable",controls=found,excerpt=brief(page))
    button.click(timeout=11000)
    page.wait_for_timeout(700)
    if risk(page):
        return dict(receipt,state="captcha_requires_owner")
    available=selects(page)
    receipt["select_options"]=[{"name":x["name"],"id":x["id"],"options":[o["label"] for o in x["options"]][:50]} for x in available[:5]]
    if len(available)<3:
        return dict(receipt,state="unmapped_category_country_language",excerpt=brief(page))
    category=select_exact_visible(page,group["categories"])
    country=select_exact_visible(page,group["country"])
    language=select_exact_visible(page,group["language"])
    receipt.update(category=category,country=country,language=language)
    if not all((category,country,language)):
        return dict(receipt,state="missing_truthful_category_country_language",excerpt=brief(page))
    nxt=next_button(page)
    if not nxt:
        return dict(receipt,state="missing_verification_step",excerpt=brief(page))
    nxt.click(timeout=12000)
    page.wait_for_timeout(550)
    if risk(page):
        return dict(receipt,state="captcha_requires_owner")
    text=brief(page)
    if re.search(r"sign in|log in|login required|payment required|paid listing", text, re.I):
        return dict(receipt,state="login_or_payment_block",excerpt=text)
    boxes=page.locator("input[type=checkbox]")
    for box in boxes.all():
        if box.is_visible() and not box.is_checked():
            box.check(timeout=4000)
    receipt["state"]="ready_to_submit"
    receipt["verification_excerpt"]=brief(page)
    submit=page.get_by_role("button",name=re.compile(r"^(submit|add group|finish|publish|complete|list now)",re.I))
    visible=[x for x in submit.all() if x.is_visible() and x.is_enabled()]
    if not visible:
        return dict(receipt,state="submit_button_unmapped",excerpt=brief(page))
    receipt["state"]="attempted_no_retry"
    receipt["attempted_at"]=utcnow()
    data["groups"][key]=receipt
    save(data)
    visible[-1].click(timeout=12000)
    page.wait_for_timeout(1300)
    receipt["after_submit_url"]=page.url
    receipt["after_submit_excerpt"]=brief(page)
    receipt["state"]="submitted_outcome_unverified"
    return receipt

def main():
    try: data=json.loads(STATE.read_text(encoding="utf8"))
    except (OSError, ValueError):data={"directory":FORM,"groups":{}}
    if not isinstance(data.get("groups"),dict):
        raise RuntimeError("invalid state")
    with sync_playwright() as pw:
        browser=pw.chromium.launch(headless=True,args=["--no-sandbox"])
        page=browser.new_page(viewport={"width":1280,"height":900})
        for key, group in GROUPS.items():
            if key in data["groups"]:
                prior=data["groups"][key]
                if prior.get("state")=="next_button_unavailable" and not prior.get("nextbtn_selector_retry_v1"):
                    # Safe to retry a pre-submit UI failure exactly once: no POST occurred.
                    prior["nextbtn_selector_retry_v1"]=True
                    save(data)
                else:
                    print("PREVIOUS_ATTEMPT_KEPT",key,prior.get("state"),flush=True)
                    continue
            try: receipt=one(page,key,group,data)
            except Exception as e:
                receipt={"group":key,"url":group["url"],"state":"error_or_uncertain_no_retry","error":type(e).__name__+": "+str(e)[:220],"timestamp":utcnow()}
            data["groups"][key]=receipt
            save(data)
            print("TELEKIT_SUBMISSION",json.dumps(receipt,ensure_ascii=False),flush=True)
        browser.close()
    print("TELEKIT_FINAL",json.dumps(data,ensure_ascii=False),flush=True)

if __name__=="__main__":main()
