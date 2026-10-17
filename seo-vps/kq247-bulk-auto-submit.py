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
import sys
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
            "categories":["Lottery","News","Entertainment","Games"]},
 "channel":{"url":"https://t.me/tooldudoan999",
            "title":"KQ247 - Kênh công cụ dự đoán",
            "description":"Kênh Telegram giới thiệu công cụ thống kê và dự đoán bóng đá, xổ số để tham khảo.",
            "categories":["News","Technology","Entertainment","Tools"]}}
# Prior submission must not be repeated even if a live listing is not yet indexed.
LEGACY_TARGET_KEYS=frozenset(("football","lottery"))
ALREADY_SENT_HOSTS={"tgfind.net","toptglinks.com","telejoiner.com","groupmandi.com","tgmania.com","tgfinder.net","telegram-group.com","telegramhub.org","tgden.com"}
# Separate workflows already own submission state for this domain.
EXTERNAL_WORKFLOW_HOSTS={"buyinoffer.com","tgden.com","vi.tgdio.com"}
# Website SEO directories belong to the independent Google/Web candidate audit,
# NOT to the Telegram group listing submitter. Keeping them here wastes queue slots.
WEB_ONLY_HOSTS={"freeprwebdirectory.com","sitepromotiondirectory.com","prolinkdirectory.com"}
# Published editorial rules at /submission-rules/ explicitly reject gambling.
# Football odds + lottery subjects are ineligible for unreviewed auto-submission.
TOPIC_POLICY_RESTRICTED_HOSTS={"wtgrouplinks.com"}
BATCH_LIMIT=min(400,max(1,int(os.environ.get("KQ247_SUBMIT_MAX", "120"))))
TIME_LIMIT=min(7200,max(60,int(os.environ.get("KQ247_SUBMIT_SECONDS","2400"))))
PAUSE=max(5,min(120,int(os.environ.get("KQ247_POST_SPACING_S","12"))))
WATCH = "--watch" in sys.argv
POLL_SECONDS = max(60,min(1800,int(os.environ.get("KQ247_POST_POLL_S","120"))))
# Retry only a proven pre-submit GET failure, never a sent form or unknown POST.
RETRY_GET_AFTER_S = max(3600,int(os.environ.get("KQ247_RETRY_GET_AFTER_S","3600")))
# Reinspect only conclusively pre-POST failures after the site may have changed.
# Never repeat submissions, unknown outcomes, pending review or a post-click error.
RETRY_READONLY_AFTER_S = max(86400,int(os.environ.get("KQ247_RETRY_READONLY_AFTER_S","86400")))
REINSPECT_ONLY_STATES = frozenset({
    "no_eligible_form", "free_not_verified", "captcha",
    "submit_disabled", "required_option_not_available", "channel_not_supported"
})
# The crawler can add new form candidates dynamically. Each one must still pass
# the on-page free/public/no-login/no-captcha/same-origin POST eligibility checks.
# Never send merely because a site appears in the discovery database.
# Explicit no-account, free Telegram listing page confirmed by the publisher.
# An attempt still requires all on-page checks; one submission per group/domain.
DIRECT_OPT_IN_ROUTES = {
 "telegrmgrouplink.com": "https://telegrmgrouplink.com/add-your-telegram-group-channel-link-to-this-website-submit/",
 "en.search-t.me": "https://en.search-t.me/add"
}
PAT_SUBMIT=re.compile(r"(submit|add[-_/]?(?:group|channel|link|listing)|publish|suggest|dang[-_/]?(?:tin|bai)|them[-_/]?nhom)", re.I)
def verified_submission_path(host, path):
    # /add is only accepted for the verified first-party en.search-t.me listing form.
    return bool(PAT_SUBMIT.search(path)) or (host == "en.search-t.me" and path == "/add")

PAT_LINK=re.compile(r"(telegram|group.?link|channel.?link|invite.?link|telegram.?url|(?:^|[_-])url(?:$|[_-])|(?:^|[_-])link(?:$|[_-]))",re.I)
PAT_TITLE=re.compile(r"(title|group.?name|channel.?name|name.?group)",re.I)
PAT_DESC=re.compile(r"(description|about|details|summary)",re.I)
PAT_CATEGORY=re.compile(r"(category|categories|topic|type)",re.I)
PAT_LANG=re.compile(r"(language|lang)",re.I)
PAT_COUNTRY=re.compile(r"(country|location)",re.I)
PAT_EMAIL=re.compile(r"email|e-mail",re.I)
TEXT_BLOCKS=("captcha","verify you are human","cloudflare challenge","login to submit",
 "sign in to submit","must be logged in","paid listing only","pay to submit",
 "payment required","no longer accepting","submissions closed","privacy policy required login",
 "automated submissions are prohibited","no automated submissions","bots are not allowed")
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

def pair_ready(con, host, grp):
    # Old attempt lists belong only to the legacy groups.
    if grp in LEGACY_TARGET_KEYS and (host in ALREADY_SENT_HOSTS or host in EXTERNAL_WORKFLOW_HOSTS):
        return False
    row=con.execute("SELECT state,at_utc FROM submissions WHERE host=? AND grp=?", (host,grp)).fetchone()
    if not row: return True
    state, timestamp=row
    if state == "unavailable":
        delay = RETRY_GET_AFTER_S
    elif state == "inspection_started":
        # This checkpoint is written before any submit click. Both submit paths
        # record attempted_no_retry durably BEFORE clicking the publisher form.
        # An interrupted read-only inspection is therefore safe to resume.
        delay = RETRY_GET_AFTER_S
    elif state in REINSPECT_ONLY_STATES:
        # Groupsor JS form was mistakenly classified as no_eligible_form by the
        # generic HTML POST detector; that state proves no submission happened.
        # Reinspect this one publisher promptly after the specific adapter fix.
        delay = min(RETRY_READONLY_AFTER_S, 12 * 3600) if host == "groupssor.com" and state == "no_eligible_form" else RETRY_READONLY_AFTER_S
    else:
        # This includes attempted_no_retry, posted/pending/unknown, and
        # any state in which a submission might already have been sent.
        return False
    try:
        last=datetime.datetime.fromisoformat(timestamp)
        if last.tzinfo is None: return False
        return (datetime.datetime.now(datetime.timezone.utc)-last).total_seconds()>=delay
    except (ValueError, TypeError):
        return False

def read_queue(con):
    try:
        rows=con.execute("SELECT host,url FROM hosts WHERE status='form_candidate' ORDER BY host").fetchall()
    except sqlite3.OperationalError:
        rows=[]
    rows=list(rows)+list(DIRECT_OPT_IN_ROUTES.items())
    return list(dict.fromkeys(
        (h,u) for h,u in rows if h not in WEB_ONLY_HOSTS
            and h not in TOPIC_POLICY_RESTRICTED_HOSTS
            and urlsplit(u).scheme == "https" and urlsplit(u).hostname in (h, "www." + h)
            and (verified_submission_path(h,urlsplit(u).path) or
                 con.execute("SELECT 1 FROM hosts WHERE host=? AND url=? AND status='form_candidate'",
                             (h,u)).fetchone())
    ))

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
       idx:i,tag:e.tagName.toLowerCase(),type:(e.type||'').toLowerCase(),name:e.name||'',value:e.value||'',
       key:[e.name||'',e.id||'',e.placeholder||'',e.getAttribute('aria-label')||'',
         e.closest('label')?.innerText||'',(e.type==='radio'?e.value:'')].join(' ').toLowerCase().slice(0,200),
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

def check_eligible(page, url, discovered_form=False, group_key=None):
    p=urlsplit(page.url)
    original=urlsplit(url)
    if p.scheme!="https" or p.hostname != original.hostname: return "redirected",None
    if not (verified_submission_path(original.hostname,original.path) or discovered_form):
        return "not_submission_path",None
    text=page.locator("body").inner_text(timeout=5000).lower()[:12000]
    if any(w in text for w in TEXT_BLOCKS):return "not_open_or_requires_review",None
    if not any(w in text for w in ALLOWED_WORDS) and original.hostname != "en.search-t.me":return "free_not_verified",None
    if "telegram" not in text and "group" not in text and "channel" not in text:
        return "not_telegram_directory",None
    if group_key == "channel" and "channel" not in text:
        return "channel_not_supported",None
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
    con.execute("INSERT INTO submissions(host,grp,url,state,at_utc,receipt) VALUES(?,?,?,?,?,?) ON CONFLICT(host,grp) DO UPDATE SET state=excluded.state,at_utc=excluded.at_utc,receipt=excluded.receipt",
      (host,grp,url,status,now(),str(receipt)[:1500]))
    con.commit()
    report={"updated_at_utc":now(),
      "attempts":[{"host":h,"group":g,"url":u,"status":s,"at":t,"receipt":r} for h,g,u,s,t,r in
                  con.execute("SELECT host,grp,url,state,at_utc,receipt FROM submissions ORDER BY at_utc DESC LIMIT 500")],
      "counts":dict(con.execute("SELECT state, COUNT(*) FROM submissions GROUP BY state")),
      "verified_new_public_links":con.execute("SELECT count(*) FROM submissions WHERE state='published_verified'").fetchone()[0],
      "per_target":{target:{"attempt_records":con.execute("SELECT count(*) FROM submissions WHERE grp=?",(target,)).fetchone()[0],
          "published_verified":con.execute("SELECT count(*) FROM submissions WHERE grp=? AND state='published_verified'",(target,)).fetchone()[0]}
          for target in GROUPS},
      "notice":"A submit click or pending moderation is not a verified backlink."}
    tmp=REPORT.with_suffix(".tmp")
    tmp.write_text(json.dumps(report,ensure_ascii=False,indent=2))
    os.replace(tmp,REPORT)
    print("KQ247_BULK_SUBMIT="+json.dumps({"host":host,"group":grp,"status":status,"verified_total":report["verified_new_public_links"]},ensure_ascii=False),flush=True)

def attempt_groupssor(page, con, host, url, group_key, group):
    """Handle one verified opt-in JS form using its real browser interface.

    Groupsor uses a GET-default <form> and JavaScript to POST, rather than an
    HTML method=post. This narrowly scoped adapter never sends unknown URLs,
    bypasses challenges, or retries any possibly submitted previous request.
    Return True only when this publisher has been handled.
    """
    if host != "groupssor.com" or urlsplit(url).path.rstrip("/") != "/submit":
        return False
    form = page.locator("form#submit-group-form")
    try:
        if form.count() != 1:
            write_result(con,host,group_key,url,"no_eligible_form","missing_groupssor_form")
            return True
        body=page.locator("body").inner_text(timeout=6000).lower()
        if "submit your group" not in body or "free" not in body or "telegram" not in body:
            write_result(con,host,group_key,url,"no_eligible_form","publisher_copy_changed")
            return True
        if group_key == "channel" and "channel" not in body:
            write_result(con,host,group_key,url,"channel_not_supported")
            return True
        if page.locator('[data-sitekey],iframe[src*="captcha"],.g-recaptcha,.h-captcha,.cf-turnstile').count():
            write_result(con,host,group_key,url,"captcha")
            return True
        required=("inviteLink","name","category","country","language","description")
        if any(form.locator('[name="'+n+'"]').count()!=1 for n in required):
            write_result(con,host,group_key,url,"no_eligible_form","groupssor_required_fields_changed")
            return True
        if form.locator('input[name="platform"][value="telegram"]').count()!=1:
            write_result(con,host,group_key,url,"no_eligible_form","missing_telegram_platform")
            return True
        if is_public_listing(page,group["url"]):
            write_result(con,host,group_key,url,"already_listed_verified",page.url)
            return True
        # Only semantic category, country and language matches. Never select a
        # misleading default merely to satisfy form validation.
        values={
            "category":(["Sports","Sport"] if group_key=="football"
                        else ["News & Media","News","Entertainment","Gaming"]),
            "country":["Vietnam","Viet Nam","Việt Nam"],
            "language":["Vietnamese","Tiếng Việt","Vietnam"]
        }
        selected={}
        for field,choices in values.items():
            sel=form.locator('select[name="'+field+'"]')
            if sel.count()!=1:
                write_result(con,host,group_key,url,"required_option_not_available",field+"_not_select")
                return True
            opts=sel.evaluate("(e)=>[...e.options].map(o=>({value:o.value,label:o.textContent.trim()}))")
            chosen=None
            for want in choices:
                chosen=next((o for o in opts if o["value"] and
                    (o["label"].casefold()==want.casefold() or o["value"].casefold()==want.casefold())),None)
                if chosen:break
            if chosen is None:
                if field in ("country","language"):
                    # Never claim that a Vietnamese group is located in another
                    # country or language merely to pass publisher validation.
                    write_result(con,host,group_key,url,"unsupported_vietnam_locale",field)
                else:
                    write_result(con,host,group_key,url,"required_option_not_available",field)
                return True
            selected[field]=chosen["value"]
        form.locator('input[name="platform"][value="telegram"]').check(force=True)
        form.locator('[name="inviteLink"]').fill(group["url"])
        form.locator('[name="name"]').fill(group["title"])
        form.locator('[name="description"]').fill(group["description"])
        for field,val in selected.items():
            form.locator('select[name="'+field+'"]').select_option(value=val)
        tags=("bong da, lich thi dau, thong ke" if group_key=="football"
              else "ket qua xo so, thong ke, Viet Nam")
        if form.locator('[name="tags"]').count()==1:
            form.locator('[name="tags"]').fill(tags)
        button=form.locator('button[type="submit"],input[type="submit"]')
        if button.count()!=1 or not button.first.is_enabled() or not button.first.is_visible():
            write_result(con,host,group_key,url,"submit_disabled")
            return True
        # Persist the no-retry boundary BEFORE browser interaction.
        write_result(con,host,group_key,url,"attempted_no_retry")
        button.first.click(timeout=10000)
        page.wait_for_timeout(1600)
        success=page.get_by_text("Thank you for submitting your group to Groupsor.",exact=False)
        if success.count() and success.first.is_visible():
            write_result(con,host,group_key,url,"submitted_pending_review",page.url)
        else:
            write_result(con,host,group_key,url,"submitted_outcome_unknown",page.url)
    except Exception as exc:
        write_result(con,host,group_key,url,"error_no_retry",type(exc).__name__+":"+str(exc)[:180])
    return True

def attempt(page, con, host, url, group_key, group):
    if not pair_ready(con,host,group_key):
        return
    # Intent is persisted before any network interaction: uncertain results are never retried.
    write_result(con,host,group_key,url,"inspection_started")
    try:
        resp=page.goto(url,wait_until="domcontentloaded",timeout=18000)
        if not resp or resp.status!=200:
            write_result(con,host,group_key,url,"unavailable",str(resp.status if resp else "no_response"));return
        page.wait_for_timeout(700)
        discovered_form=bool(con.execute(
            "SELECT 1 FROM hosts WHERE host=? AND url=? AND status='form_candidate'",
            (host,url)).fetchone()) if con.execute(
            "SELECT 1 FROM sqlite_master WHERE type='table' AND name='hosts'").fetchone() else False
        if attempt_groupssor(page,con,host,url,group_key,group):
            return
        status,forminfo=check_eligible(page,url,discovered_form,group_key)
        if status!="eligible":
            write_result(con,host,group_key,url,status);return
        # Avoid duplicate submissions when the target already has a live public listing.
        if is_public_listing(page,group["url"]):
            write_result(con,host,group_key,url,"already_listed_verified",page.url)
            return
        form=page.locator("form").nth(forminfo["formIndex"])
        fields=forminfo["fields"]
        selected_radio_names=set()
        for field in fields:
            if field["disabled"]:continue
            inp=form.locator("input,textarea,select").nth(field["idx"])
            k=field["key"]
            typ=field["type"]
            if field["tag"]=="select":
                if not choose_option(inp,field,group):
                    write_result(con,host,group_key,url,"required_option_not_available",k);return
            elif typ=="radio":
                name=field["name"]
                if name in selected_radio_names:continue
                alternatives=[x for x in fields if x["type"]=="radio" and x["name"]==name and not x["disabled"]]
                chosen=None
                for option in alternatives:
                    label=option["key"].lower()
                    value=option["value"].strip().lower()
                    if any(value==want.lower() or re.search(r"\\b"+re.escape(want.lower())+r"\\b",label)
                           for want in group["categories"]):
                        chosen=option
                        break
                # Never register a channel under a group-only selector.
                if chosen is None:
                    wanted_type = "channel" if group_key=="channel" else "group"
                    chosen=next((x for x in alternatives if x["value"].lower()==wanted_type),None)
                    if chosen is None and any(x["value"].lower() in ("group","channel") for x in alternatives):
                        write_result(con,host,group_key,url,"required_option_not_available",name)
                        return
                if chosen is None:
                    if any(x["required"] for x in alternatives):
                        write_result(con,host,group_key,url,"requires_manual_radio_review",name);return
                else:
                    form.locator("input,textarea,select").nth(chosen["idx"]).check(timeout=3000)
                selected_radio_names.add(name)
            elif typ=="checkbox":
                if field["required"]:
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
        # Count a public backlink only if the POST navigated to an independently
        # accessible listing page containing a hyperlink to the exact target.
        post_url=urlsplit(page.url)
        original=urlsplit(url)
        listing_page=(post_url.scheme=="https" and post_url.hostname==original.hostname
                      and post_url.path.rstrip("/")!=original.path.rstrip("/"))
        if listing_page and is_public_listing(page,group["url"]):
            write_result(con,host,group_key,url,"published_verified",page.url)
        elif re.search(r"success|thank you|submitted|received|moderation|pending|review|cảm ơn|thành công",body):
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
    print("KQ247_BULK_SUBMIT_READY="+json.dumps({"max_attempts":BATCH_LIMIT,"poll_seconds":POLL_SECONDS if WATCH else 30,
        "limit_seconds":TIME_LIMIT,"skipped_previously_submitted":sorted(ALREADY_SENT_HOSTS)}),flush=True)
    with sync_playwright() as p:
        browser=p.chromium.launch(headless=True,args=["--no-sandbox"])
        context=browser.new_context(viewport={"width":1200,"height":900})
        page=context.new_page()
        while WATCH or (posted<BATCH_LIMIT and time.monotonic()<deadline):
            queue=read_queue(con)
            print("KQ247_QUEUE="+json.dumps({"candidate_hosts":len(queue),
                "new_pairs":sum(pair_ready(con,h,k) for h,_ in queue for k in GROUPS),
                "hosts":[h for h,_ in queue][:20]}),flush=True)
            available=[(h,u) for h,u in queue if any(pair_ready(con,h,k) for k in GROUPS)]
            if not available:
                if WATCH:
                    print("KQ247_POSTER_IDLE="+json.dumps({"poll_seconds":POLL_SECONDS,
                        "submissions_performed_this_process":posted}),flush=True)
                    time.sleep(POLL_SECONDS)
                    continue
                time.sleep(min(30,max(0,deadline-time.monotonic())))
                continue
            for host,url in available:
                if not WATCH and (posted>=BATCH_LIMIT or time.monotonic()>=deadline):break
                for key,group in GROUPS.items():
                    if not WATCH and (posted>=BATCH_LIMIT or time.monotonic()>=deadline):break
                    if not pair_ready(con,host,key):continue
                    attempt(page,con,host,url,key,group)
                    posted+=1
                    time.sleep(PAUSE)
                    if WATCH and posted >= BATCH_LIMIT:
                        print("KQ247_POSTER_WINDOW_LIMIT="+str(posted),flush=True)
                        time.sleep(POLL_SECONDS)
                        posted=0
        context.close()
        browser.close()
    print("KQ247_BULK_SUBMIT_DONE="+json.dumps({"attempts":posted,
        "counts":dict(con.execute("SELECT state,COUNT(*) FROM submissions GROUP BY state"))}),flush=True)
    con.close()

if __name__=="__main__":main()
