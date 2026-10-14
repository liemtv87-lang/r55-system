#!/usr/bin/env python3
"""KQ247 domain-first gate: extract registrable submission sources from URL inventories.

Streaming, resumable, read-only. Count actual records, unique hosts and live forms
separately; do not call a form a published backlink.
"""
import concurrent.futures as cf
import datetime as dt
import html.parser
import ipaddress
import json
import os
from pathlib import Path
import re
import socket
import time
from urllib.parse import urlsplit, urljoin
from urllib.request import Request, urlopen

BASE=Path("/opt/pwremote/kq247-domain-first")
SOURCE=BASE/"url-inventory.txt"
STATE=BASE/"cursor.json"
REPORT=BASE/"latest.json"
TARGETS=("https://t.me/keochuyengia79","https://t.me/xsbm999")
ROUTES=[
 "https://groupsgyani.org/submit-telegram-group-and-channel-links",
 "https://telegramgroup.arkservices.in/submit",
 "https://spamfixer.ru/en/catalog/",
 "https://buyinoffer.com/add-channel.html",
 "https://tgmania.com/submit",
 "https://telegramchannels.io/submit-channel",
 "https://telegramhub.org/submit",
 "https://groupverse.co.in/submit-your-group.html",
 "https://telegram-group.org/SubmitGroup.php",
 "https://groupssor.com/submit/",
 "https://tg-hub.com/submit-telegram-channel-and-group-links/",
 "https://telegroups.org/submit",
 "https://telegramgroups.co/submit",
 "https://tgden.com/en/suggest",
 "https://toptglinks.com/submit",
 "https://telekit.link/addgroup",
 "https://tgdirectory.me/submit",
 "https://telegram-group.com/en/publish/",
 "https://telegram-group-links.com/submit",
 "https://telegram-groups.net/submit",
 "https://telegram-groups.com/dashboard/submit/",
 "https://tdirectory.me/search/vietnamese",
 "https://tgramlink.com/vi",
 "https://vi.tgdio.com/groups",
 "https://tgram.vn/",
 "https://telegramchannels.me/submit",
 "https://televerse.click/submit",
 "https://togather.in/submit",
 "https://www.wtgrouplinks.com/submit-your-telegram-groups/",
 "https://telegramhub.app/submit",
 "https://telxplorer.com/en/create_group",
 "https://tgfind.io/en/inclusion-link",
 "https://worldtelegramdirectory.com/submit",
 "https://telegradia.com",
 "https://tgbox.cc",
 "https://groupmandi.com/submit",
 "https://telegramradar.com",
 "https://tgfinder.net",
]
FOOTPRINT=re.compile(r"submit|add[-_/ ]?(group|channel|link)|publish|listing|dang[-_/ ]?(nhom|tin|bai)|them[-_/ ]?nhom|gui[-_/ ]?(link|bai)|register",re.I)
URL_RE=re.compile(r"https?://[^\s\"'<>\\]+",re.I)

def valid(url):
    try:
        p=urlsplit(url)
        host=(p.hostname or "").lower()
        if p.scheme not in ("http","https") or not host or "." not in host or p.username or p.password:return False
        try:
            ipaddress.ip_address(host)
            return False
        except ValueError:pass
        if host.endswith((".local",".internal",".localhost",".onion")):return False
        return True
    except ValueError:return False

class FormParser(html.parser.HTMLParser):
    def __init__(self):
        super().__init__()
        self.forms=0;self.inputs=[];self.buttons=[];self.links=[]
        self.inbutton=False;self.buttontext=[]
    def handle_starttag(self,tag,attrs):
        d=dict(attrs)
        if tag=="form":self.forms+=1
        if tag in ("input","textarea","select"):
            self.inputs.append(" ".join(str(d.get(k,"")) for k in ("name","id","type","placeholder","aria-label")).lower())
        if tag=="button":self.inbutton=True
        if tag=="a" and d.get("href"):self.links.append(d["href"])
    def handle_endtag(self,tag):
        if tag=="button":self.inbutton=False
    def handle_data(self,data):
        if self.inbutton:self.buttontext.append(data.strip().lower())

def probe(url):
    out={"url":url}
    try:
        if not valid(url):return dict(out,status="bad_url")
        req=Request(url,headers={"User-Agent":"KQ247-SourceQualification/1.0", "Accept":"text/html"})
        with urlopen(req,timeout=9) as r:
            if r.status!=200:return dict(out,status="unavailable",http=r.status)
            final=r.url
            if not valid(final):return dict(out,status="unsafe_redirect")
            typ=r.headers.get("Content-Type","").lower()
            if "html" not in typ:return dict(out,status="non_html")
            body=r.read(260001)
        if len(body)>260000:return dict(out,status="oversized")
        page=body.decode("utf-8","replace")
        lo=page.lower()
        q=FormParser();q.feed(page)
        out.update(final_url=final,forms=q.forms,inputs=len(q.inputs))
        if any(x in lo for x in ("data-sitekey","g-recaptcha","hcaptcha","turnstile")):
            return dict(out,status="captcha_review")
        if any(x in lo for x in ("one-time listing fee","payment required","paid category","pay to submit")):
            return dict(out,status="paid_review")
        if any(x in lo for x in ("login to submit","sign in to submit","must be logged in")):
            return dict(out,status="login_required")
        if any(x in lo for x in ("submissions are closed","submissions paused","not accepting submissions")):
            return dict(out,status="closed")
        linkfield=any(any(w in x for w in ("telegram","t.me","group","channel","invite","link","url")) for x in q.inputs)
        action=q.forms>0 or any(w in " ".join(q.buttontext) for w in ("submit","send","add","đăng","gửi"))
        if action and linkfield:
            out.update(status="candidate_form",free_claim=bool(re.search(r"free (listing|submission)|listing is free|submit.*free|miễn phí",lo[:18000])))
            return out
        links=[]
        for a in q.links:
            full=urljoin(final,a)
            if valid(full) and urlsplit(full).hostname==urlsplit(final).hostname and FOOTPRINT.search(urlsplit(full).path):
                links.append(full)
        return dict(out,status="no_open_form",suggested_routes=list(dict.fromkeys(links))[:5])
    except Exception as ex:
        return dict(out,status="fetch_error",error=type(ex).__name__+":"+str(ex)[:110])

def load_frontier():
    seeds=list(ROUTES)
    examined=0; matched=0
    previous={}
    if STATE.exists():
        try:previous=json.loads(STATE.read_text())
        except (OSError,ValueError):pass
    offset=int(previous.get("offset",0))
    if SOURCE.is_file():
        with SOURCE.open("rb") as f:
            if offset>SOURCE.stat().st_size:offset=0
            f.seek(offset)
            limit=int(os.environ.get("KQ247_MAX_RECORDS","300000"))
            until=time.monotonic()+15
            while examined<limit and time.monotonic()<until:
                line=f.readline()
                if not line:break
                examined+=1
                for raw in URL_RE.findall(line.decode("utf-8","ignore")):
                    raw=raw.rstrip(".,);")
                    if valid(raw) and FOOTPRINT.search(urlsplit(raw).path):
                        seeds.append(raw);matched+=1
            offset=f.tell()
        STATE.write_text(json.dumps({"offset":offset,"file_size":SOURCE.stat().st_size},indent=2))
    # One form page per host per batch prevents a billion article URLs drowning candidates.
    unique={}
    for u in seeds:
        h=(urlsplit(u).hostname or "").lower()
        if h and h not in unique and len(unique)<250:
            unique[h]=u
    return list(unique.values()),examined,matched,offset

def main():
    BASE.mkdir(parents=True,exist_ok=True)
    started=time.monotonic()
    urls,examined,matched,cursor=load_frontier()
    with cf.ThreadPoolExecutor(max_workers=12) as pool:
        rows=list(pool.map(probe,urls))
    ready=[x for x in rows if x["status"]=="candidate_form"]
    report={"checked_at_utc":dt.datetime.now(dt.timezone.utc).isoformat(),
      "strategy":"stream URL corpus -> deduplicate host -> probe submit form only",
      "inventory_file_present":SOURCE.exists(),"records_read_this_run":examined,
      "submit_route_url_matches":matched,"cursor_bytes":cursor,
      "domains_probed":len(rows),"candidate_forms":ready,
      "excluded":[x for x in rows if x["status"]!="candidate_form"],
      "published_backlinks_by_job":0,"targets":TARGETS,
      "duration_seconds":round(time.monotonic()-started,2),
      "disclaimer":"Candidate form is not confirmed acceptance, account creation, or a public backlink."}
    REPORT.write_text(json.dumps(report,ensure_ascii=False,indent=2))
    print("KQ247_DOMAIN_FIRST="+json.dumps({
        "inventory_file_present":report["inventory_file_present"],
        "records_read_this_run":examined,
        "domains_probed":len(rows),
        "candidate_forms_count":len(ready),
        "candidate_form_urls":[x["url"] for x in ready],
        "status_counts":{s:sum(x["status"]==s for x in rows) for s in sorted({x["status"] for x in rows})},
        "seconds":report["duration_seconds"],
        "public_backlinks_created":0},ensure_ascii=False),flush=True)

if __name__=="__main__":main()
