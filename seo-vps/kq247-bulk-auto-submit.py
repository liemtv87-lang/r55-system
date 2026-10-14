#!/usr/bin/env python3
"""KQ247 automatic opt-in directory listings, batched and checkpointed.

Accepts only overt free/public Telegram directory submission forms.
Never posts to arbitrary discussions or bypasses CAPTCHA, login, rate limits,
payment, or moderation. One attempt per (domain, group) regardless of outcome.
"""
import datetime
import json
import os
from pathlib import Path
import re
import sqlite3
import time
from urllib.parse import urlsplit

from playwright.sync_api import sync_playwright

BASE=Path("/state")
DB=BASE/"sources.sqlite3"
REPORT=BASE/"bulk-posts.json"
GROUPS={
 "football":{"url":"https://t.me/keochuyengia79",
             "title":"KQ247 - Cộng đồng bóng đá Việt Nam",
             "description":"Nhóm chia sẻ lịch thi đấu và thống kê bóng đá Việt Nam, trao đổi có trách nhiệm.",
             "categories":["Football","Soccer","Sports","Sport"]},
 "lottery":{"url":"https://t.me/xsbm999",
            "title":"KQ247 - Cộng đồng kết quả xổ số Việt Nam",
            "description":"Nhóm chia sẻ thông tin kết quả xổ số XSMB, XSMT, XSMN và thống kê tham khảo.",
            "categories":["Lottery","News","Entertainment","Games"]}}
# Prior submission must not be repeated even if a live listing is not yet indexed.
ALREADY_SENT_HOSTS={"tgfind.net","toptglinks.com","telejoiner.com","groupmandi.com","tgmania.com"}
# Separate workflows already own submission state for this domain.
EXTERNAL_WORKFLOW_HOSTS={"buyinoffer.com","tgden.com","vi.tgdio.com"}
BATCH_LIMIT=min(400,max(1,int(os.environ.get("KQ247_SUBMIT_MAX", "120"))))
TIME_LIMIT=min(7200,max(60,int(os.environ.get("KQ247_SUBMIT_SECONDS","2400"))))
PAUSE=max(5,min(120,int(os.environ.get("KQ247_POST_SPACING_S","12"))))
PAT_SUBMIT=re.compile(r"(submit|add[-_/]?(?:group|channel|link|listing)|publish|suggest|dang[-_/]?(?:tin|bai)|them[-_/]?nhom)", re.I)
PAT_LINK=re.compile(r"(telegram|group.?link|channel.?link|invite.?link|telegram.?url|(?:^|[_-])url(?:$|[_-])|(?:^|[_-])link(?:$|[_-]))",re.I)
PAT_TITLE=re.compile(r"(title|group.?name|channel.?name|name.?group)",re.I)
PAT_DESC=re.compile(r"(description|about|details|summary)",re.I)
PAT_CATEGORY=re.compile(r"(category|categories|topic|type)",re.I)
PAT_LANG=re.compile(r"(language|lang)",re.I)
PAT_COUNTRY=re.compile(r"(country|location)",re.I)
PAT_EMAIL=re.compile(r"email|e-mail",re.I)
TEXT_BLOCKS=("captcha","verify you are human","cloudflare challenge","login to submit",
 "sign in to submit","must be logged in","paid listing only","pay to submit",
 "payment required","no longer accepting","submissions closed","privacy policy required login")
ALLOWED_WORDS=("free", "miễn phí", "no fee", "free listing", "free submission")
SUBMIT_WORDS=("submit","send","publish","add group","add channel","đăng","gửi")

def now():return datetime.datetime.now(datetime.timezone.utc).isoformat()

def prepare_db():
    con=sqlite3.connect(DB,timeout=30)
    con.execute("PRAGMA journal_mode=WAL")
    con.execute("""CREATE TABLE IF NOT EXISTS submissions(
       host TEXT NOT NULL,grp TEXT NOT NULL,url TEXT NOT NULL,
       state TEXT NOT NULL,at_utc TEXT NOT NULL,receipt TEXT NOT NULL DEFAULT '',
       PRIMARY KEY(host,grp))""")
    con.commit()
    return con

def read_queue(con):
    try:
        rows=con.execute("""SELECT host,url FROM hosts WHERE status='form_candidate'
            AND host NOT IN (SELECT host FROM submissions GROUP BY host HAVING COUNT(*)>=2)
            ORDER BY host""").fetchall()
    except sqlite3.OperationalError:
        return []
    return [(h,u) for h,u in rows if h not in ALREADY_SENT_HOSTS
            and h not in EXTERNAL_WORKFLOW_HOSTS and PAT_SUBMIT.search(urlsplit(u).path)]

def is_public_listing(page, expected):
    try:
        wanted=expected.rstrip("/").lower()
        links=page.locator("a[href]").evaluate_all("(els)=>els.map(e=>e.href)")
        return any(url.rstrip("/").lower()==wanted for url in links)
    except Exception:
        return False

def inspect_fields(page):
    return page.evaluate("""() => [...document.querySelectorAll('form')].map((f,n)=>({
     formIndex:n,action:f.action,method:f.method,
     fields:[...f.querySelectorAll('input,textarea,select')].map((e,i)=>({
       idx:i,tag:e.tagName.toLowerCase(),type:(e.type||'').toLowerCase(),
       key:[e.name||'',e.id||'',e.placeholder||'',e.getAttribute('aria-label')||'',
         e.closest('label')?.innerText||''].join(' ').toLowerCase().slice(0,200),
       required:e.required,disabled:e.disabled,
       options:e.tagName==='SELECT'?[...e.options].map(o=>({v:o.value,t:o.textContent.trim()})):null
     }))
   }))""")

def choose_option(sel, field, group):
    k=field["key"]
    if PAT_CATEGORY.search(k): options=group["categories"]
    elif PAT_LANG.search(k): options=["Vietnamese","Tiếng Việt","Viet Nam"]
    elif PAT_COUNTRY.search(k): options=["Vietnam","Viet Nam","Việt Nam"]
    else: return not field["required"]
    for want in options:
        for opt in field["options"] or []:
            if opt["v"] and opt["t"].strip().lower()==want.lower():
                sel.select_option(value=opt["v"])
                return True
    return False if PAT_CATEGORY.search(k) else not field["required"]

def check_eligible(page, url):
    p=urlsplit(page.url)
    original=urlsplit(url)
    if p.scheme!="https" or p.hostname != original.hostname: return "redirected",None
    if not PAT_SUBMIT.search(original.path): return "not_submission_path",None
    text=page.locator("body").inner_text(timeout=5000).lower()[:12000]
    if any(w in text for w in TEXT_BLOCKS):return "not_open_or_requires_review",None
    if not any(w in text for w in ALLOWED_WORDS):return "free_not_verified",None
    if "telegram" not in text and "group" not in text and "channel" not in text:
        return "not_telegram_directory",None
    if page.locator('[data-sitekey],iframe[src*="captcha"],.g-recaptcha,.h-captcha,.cf-turnstile').count():
        return "captcha",None
    forms=inspect_fields(page)
    for f in forms:
        method=f.get("method","").lower()
        action=urlsplit(f.get("action",""))
        if method!="post" or action.scheme!="https" or action.hostname!=p.hostname:continue
        fields=f["fields"]
        textfields=[x for x in fields if x["tag"] in ("input","textarea")
                 and x["type"] in ("text","url","textarea","search","")]
        linkfields=[x for x in textfields if PAT_LINK.search(x["key"])]
        if len(linkfields)!=1:continue
        # Reject forms that require credentials, passwords, uploads, or unexplained data.
        if any(x["required"] and (x["type"] in ("password","file","tel","date","number")
            or (x["type"]=="email") or PAT_EMAIL.search(x["key"])) for x in fields):
            continue
        if not page.locator("form").nth(f["formIndex"]).locator(
                 'button[type="submit"],input[type="submit"]').count():
            continue
        return "eligible",f
    return "no_eligible_form",None

def write_result(con,host,grp,url,status,receipt=""):
    con.execute("INSERT INTO submissions(host,grp,url,state,at_utc,receipt) VALUES(?,?,?,?,?,?) ON CONFLICT(host,grp) DO UPDATE SET state=excluded.state,receipt=excluded.receipt",
      (host,grp,url,status,now(),str(receipt)[:1500]))
    con.commit()
    report={"updated_at_utc":now(),
      "attempts":[{"host":h,"group":g,"url":u,"status":s,"at":t,"receipt":r} for h,g,u,s,t,r in
                  con.execute("SELECT host,grp,url,state,at_utc,receipt FROM submissions ORDER BY at_utc DESC LIMIT 500")],
      "counts":dict(con.execute("SELECT state, COUNT(*) FROM submissions GROUP BY state")),
      "verified_new_public_links":con.execute("SELECT count(*) FROM submissions WHERE state='published_verified'").fetchone()[0],
      "notice":"A submit click or pending moderation is not a verified backlink."}
    tmp=REPORT.with_suffix(".tmp")
    tmp.write_text(json.dumps(report,ensure_ascii=False,indent=2))
    os.replace(tmp,REPORT)
    print("KQ247_BULK_SUBMIT="+json.dumps({"host":host,"group":grp,"status":status,"verified_total":report["verified_new_public_links"]},ensure_ascii=False),flush=True)

def attempt(page, con, host, url, group_key, group):
    if con.execute("SELECT 1 FROM submissions WHERE host=? AND grp=?",(host,group_key)).fetchone():
        return
    # Intent is persisted before any network interaction: uncertain results are never retried.
    write_result(con,host,group_key,url,"inspection_started")
    try:
        resp=page.goto(url,wait_until="domcontentloaded",timeout=18000)
        if not resp or resp.status!=200:
            write_result(con,host,group_key,url,"unavailable",str(resp.status if resp else "no_response"));return
        page.wait_for_timeout(700)
        status,forminfo=check_eligible(page,url)
        if status!="eligible":
            write_result(con,host,group_key,url,status);return
        form=page.locator("form").nth(forminfo["formIndex"])
        fields=forminfo["fields"]
        for field in fields:
            if field["disabled"]:continue
            inp=form.locator("input,textarea,select").nth(field["idx"])
            k=field["key"]
            typ=field["type"]
            if field["tag"]=="select":
                if not choose_option(inp,field,group):
                    write_result(con,host,group_key,url,"required_option_not_available",k);return
            elif typ in ("checkbox","radio"):
                if field["required"]:
                    # Unknown consent wording or charges => review.
                    write_result(con,host,group_key,url,"requires_manual_terms_review",k);return
            elif typ in ("hidden","submit","reset","button"):
                continue
            elif PAT_LINK.search(k):
                inp.fill(group["url"])
            elif PAT_TITLE.search(k):
                inp.fill(group["title"])
            elif PAT_DESC.search(k):
                inp.fill(group["description"])
            elif field["required"]:
                write_result(con,host,group_key,url,"unmapped_required_field",k);return
        btn=form.locator('button[type="submit"],input[type="submit"]').first
        if not btn.is_visible() or not btn.is_enabled():
            write_result(con,host,group_key,url,"submit_disabled");return
        label=(btn.inner_text() if btn.evaluate("(e)=>e.tagName.toLowerCase()")=="button"
               else btn.get_attribute("value") or "").lower()
        if not any(w in label for w in SUBMIT_WORDS):
            write_result(con,host,group_key,url,"submit_action_unrecognized",label);return
        # No automatic retries if an external POST might have happened.
        write_result(con,host,group_key,url,"attempted_no_retry")
        btn.click(timeout=10000)
        page.wait_for_timeout(900)
        body=page.locator("body").inner_text(timeout=5000).lower()[-1500:]
        # A receipt page is not evidence of a published public backlink.
        if re.search(r"success|thank you|submitted|received|moderation|pending|review|cảm ơn|thành công",body):
            write_result(con,host,group_key,url,"submitted_pending_review",page.url)
        else:
            write_result(con,host,group_key,url,"submitted_outcome_unknown",page.url)
    except Exception as e:
        write_result(con,host,group_key,url,"error_no_retry",type(e).__name__+":"+str(e)[:190])

def main():
    BASE.mkdir(parents=True,exist_ok=True)
    con=prepare_db()
    deadline=time.monotonic()+TIME_LIMIT
    posted=0
    print("KQ247_BULK_SUBMIT_READY="+json.dumps({"max_attempts":BATCH_LIMIT,"poll_seconds":30,
        "limit_seconds":TIME_LIMIT,"skipped_previously_submitted":sorted(ALREADY_SENT_HOSTS)}),flush=True)
    with sync_playwright() as p:
        browser=p.chromium.launch(headless=True,args=["--no-sandbox"])
        context=browser.new_context(viewport={"width":1200,"height":900})
        page=context.new_page()
        while posted<BATCH_LIMIT and time.monotonic()<deadline:
            queue=read_queue(con)
            available=[(h,u) for h,u in queue if any(not con.execute(
              "SELECT 1 FROM submissions WHERE host=? AND grp=?",(h,k)).fetchone() for k in GROUPS)]
            if not available:
                time.sleep(min(30,max(0,deadline-time.monotonic())))
                continue
            for host,url in available:
                if posted>=BATCH_LIMIT or time.monotonic()>=deadline:break
                for key,group in GROUPS.items():
                    if posted>=BATCH_LIMIT or time.monotonic()>=deadline:break
                    if con.execute("SELECT 1 FROM submissions WHERE host=? AND grp=?",(host,key)).fetchone():continue
                    attempt(page,con,host,url,key,group)
                    posted+=1
                    time.sleep(PAUSE)
        context.close()
        browser.close()
    print("KQ247_BULK_SUBMIT_DONE="+json.dumps({"attempts":posted,
        "counts":dict(con.execute("SELECT state,COUNT(*) FROM submissions GROUP BY state"))}),flush=True)
    con.close()

if __name__=="__main__":main()
