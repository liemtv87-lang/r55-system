#!/usr/bin/env python3
"""Independent KQ247 Google WEB SEO audit, source discovery and opt-in submission.
Only first-party landing pages are web-backlink targets. Telegram directory links
are excluded entirely. A source is not a backlink until its public href is checked.
"""
import argparse
import concurrent.futures
import datetime as dt
import html.parser
import json
import os
from pathlib import Path
import re
import sqlite3
import time
import urllib.parse
import urllib.request
import urllib.robotparser

ROOT = Path(os.environ.get("KQ247_GOOGLE_ROOT", "/opt/kq247/google-web-seo"))
PUBLIC = Path(os.environ.get("KQ247_PUBLIC_ROOT", "/opt/kq247/deployment/football-original/public"))
BASE = "https://64-120-92-172.sslip.io"
TARGETS = {
 "football": BASE + "/nhom-bong-da-telegram-mien-phi.html",
 "lottery": BASE + "/nhom-xo-so-mb-mn-mt-telegram-mien-phi.html"
}
GROUPS = {"football":"https://t.me/keochuyengia79","lottery":"https://t.me/xsbm999"}
# Real candidate publishers, never assume they accept automated content.
SEEDS = [
 "https://bongda.com.vn/", "https://bongda24h.vn/",
 "https://thethao247.vn/", "https://bongdaplus.vn/",
 "https://www.vietnam.vn/", "https://www.24h.com.vn/",
 "https://voz.vn/", "https://tinhte.vn/",
 "https://xoso.com.vn/", "https://ketqua.net/",
 "https://xosodaiphat.com/", "https://www.webtretho.com/",
 "https://medium.com/", "https://wordpress.com/",
 "https://www.reddit.com/r/VietNam/"
]
KEYWORDS = ("lien-he","lien_he","gui-bai","gui-tin","dang-bai","dang-tin",
            "cong-tac-vien","contact","contribute","submit","publish","editorial")
UA = "KQ247GoogleWebSEO/1.0 (+public technical audit; non-invasive)"
MAX_BYTES = 450_000
TIMEOUT = 9
MAX_WORKERS = 10
SEEDS_FILE = Path(__file__).resolve().parent/"google-web-source-seeds.json"
MAX_SEEDS = 80

def source_seeds():
 """Curated independent Google WEB website inventory. Never grants POST permission."""
 candidates = list(SEEDS)
 try:
  config=json.loads(SEEDS_FILE.read_text(encoding="utf-8"))
  candidates += [entry.get("url","") for entry in config.get("sources",[]) if
                 isinstance(entry,dict) and entry.get("submission_authorized") is False]
 except (OSError,ValueError,TypeError):
  pass
 hosts=set()
 result=[]
 for url in candidates:
  p=urllib.parse.urlsplit(url)
  host=(p.hostname or "").lower().removeprefix("www.")
  if p.scheme!="https" or not host or host in hosts:continue
  if host in ("t.me","telegram.me") or host==urllib.parse.urlsplit(BASE).hostname:continue
  hosts.add(host)
  result.append(url)
  if len(result)>=MAX_SEEDS:break
 return result

def normalize_target_anchor(origin,href):
 """Confirm the public external HTML link points to an EXACT first-party target."""
 origin_host=(urllib.parse.urlsplit(origin).hostname or "").lower().removeprefix("www.")
 if origin_host==urllib.parse.urlsplit(BASE).hostname:return None
 dest=urllib.parse.urlsplit(urllib.parse.urljoin(origin,href))
 if dest.scheme!="https":return None
 clean=urllib.parse.urlunsplit((dest.scheme,dest.netloc,dest.path,dest.query,""))
 return clean if clean in TARGETS.values() else None

def utcnow():
 return dt.datetime.now(dt.timezone.utc).isoformat()

class Links(html.parser.HTMLParser):
 def __init__(self):
  super().__init__()
  self.links = []
  self.forms = []
  self.title = ""
  self.h1 = []
  self.meta = {}
  self.canon = []
  self.jsonld = 0
  self._capture = None
 def handle_starttag(self, tag, attrs):
  a=dict(attrs)
  if tag=="a" and a.get("href"): self.links.append(a["href"])
  elif tag=="form": self.forms.append({"action":a.get("action",""),"method":a.get("method","get").lower()})
  elif tag in ("title","h1"): self._capture=tag
  elif tag=="meta":
   key=a.get("name",a.get("property","")).lower()
   if key: self.meta[key]=a.get("content","")
  elif tag=="link" and "canonical" in a.get("rel","").lower(): self.canon.append(a.get("href",""))
  elif tag=="script" and a.get("type","").lower()=="application/ld+json": self.jsonld+=1
 def handle_endtag(self, tag):
  if tag==self._capture:self._capture=None
 def handle_data(self, data):
  if self._capture=="title": self.title+=data
  elif self._capture=="h1":
   if not self.h1: self.h1.append("")
   self.h1[-1]+=data

def get(url, *, check_robots=False):
 p=urllib.parse.urlsplit(url)
 if p.scheme!="https" or not p.hostname: return {"error":"not_https"}
 if check_robots:
  try:
   rp=urllib.robotparser.RobotFileParser()
   rp.set_url("https://"+p.hostname+"/robots.txt")
   rp.read()
   if not rp.can_fetch(UA, url):return {"error":"robots_disallow"}
  except Exception:return {"error":"robots_not_verified"}
 try:
  req=urllib.request.Request(url,headers={"User-Agent":UA,"Accept":"text/html,application/xml,text/plain"})
  with urllib.request.urlopen(req,timeout=TIMEOUT) as r:
   raw=r.read(MAX_BYTES+1)
   if len(raw)>MAX_BYTES:return {"error":"page_exceeds_cap","status":r.status}
   final=r.geturl()
   if urllib.parse.urlsplit(final).scheme!="https":return {"error":"insecure_redirect"}
   return {"status":r.status,"final_url":final,"body":raw.decode("utf-8","replace"),
           "content_type":r.headers.get("Content-Type","")}
 except Exception as exc:return {"error":type(exc).__name__+":"+str(exc)[:110]}

def audit_first_party(item):
 kind,url=item
 page=get(url)
 row={"kind":kind,"target":url,"http":page.get("status"),
      "error":page.get("error")}
 if page.get("status")==200:
  parser=Links()
  parser.feed(page["body"])
  row.update({"title":parser.title.strip(),"h1_count":len(parser.h1),
              "meta_description":bool(parser.meta.get("description")),
              "robots_meta":parser.meta.get("robots"),
              "canonical_correct":url in parser.canon,
              "links_to_telegram_group":any(
                  urllib.parse.urljoin(url,x).rstrip("/")==GROUPS[kind] for x in parser.links),
              "jsonld_blocks":parser.jsonld,
              "html_language_vi":bool(re.search(r'<html\s+[^>]*lang=["\x27]vi',page["body"][:300],re.I)),
              "noindex": "noindex" in parser.meta.get("robots","").lower(),
              "bytes_read":len(page["body"])})
 return row

def inspect_source(url):
 out={"source":url,"host":urllib.parse.urlsplit(url).hostname,"checked_at_utc":utcnow()}
 res=get(url,check_robots=True)
 out.update({"http":res.get("status"),"error":res.get("error")})
 if res.get("status")!=200:return out
 if "html" not in res.get("content_type","").lower():return {**out,"error":"not_html"}
 p=Links()
 p.feed(res["body"])
 basehost=urllib.parse.urlsplit(url).hostname
 possible=[]
 verified=[]
 for href in p.links[:5000]:
  absolute=urllib.parse.urljoin(res["final_url"],href)
  parsed=urllib.parse.urlsplit(absolute)
  target=normalize_target_anchor(res["final_url"],href)
  if target and target not in verified:
   verified.append(target)
  if (parsed.hostname or "").lower().removeprefix("www.")==(basehost or "").lower().removeprefix("www.") and any(t in parsed.path.lower() for t in KEYWORDS):
   if absolute not in possible: possible.append(absolute)
 out.update({"potential_contributor_pages":possible[:10],
             "candidate_count":len(possible),
             "verified_target_hrefs":verified[:5],
             "html_checked":True})
 return out

def store_and_report(landing, sources, status):
 ROOT.mkdir(parents=True,exist_ok=True)
 db=sqlite3.connect(ROOT/"google-web-seo.sqlite3")
 db.execute("CREATE TABLE IF NOT EXISTS history (run_at TEXT,host TEXT,http INTEGER,candidates INTEGER,error TEXT)")
 db.execute("CREATE TABLE IF NOT EXISTS verified (source_url TEXT,target_url TEXT,first_seen TEXT,PRIMARY KEY(source_url,target_url))")
 db.execute("CREATE TABLE IF NOT EXISTS submissions (host TEXT,target_url TEXT,receipt_url TEXT,status TEXT,created_at TEXT,PRIMARY KEY(host,target_url))")
 new_links=[]
 now=status["checked_at_utc"]
 for row in sources:
  db.execute("INSERT INTO history VALUES(?,?,?,?,?)",
             (now,row.get("host"),row.get("http"),row.get("candidate_count",0),row.get("error")))
  for target in row.get("verified_target_hrefs",[]):
   prior=db.execute("SELECT 1 FROM verified WHERE source_url=? AND target_url=?",(row["source"],target)).fetchone()
   if not prior:
    db.execute("INSERT OR IGNORE INTO verified VALUES(?,?,?)",(row["source"],target,now))
    new_links.append({"source":row["source"],"target":target})
 counts={}
 for key,target in TARGETS.items():
  rows=db.execute("SELECT source_url FROM verified WHERE target_url=?",(target,)).fetchall()
  counts[key]={"public_web_backlinks_verified":len(rows),
               "distinct_referring_domains":len({urllib.parse.urlsplit(x[0]).hostname for x in rows})}
 status["web_backlinks"]=counts
 status["new_verified_web_backlinks_this_run"]=new_links
 status["all_hosts_ever_checked"]=db.execute("SELECT COUNT(DISTINCT host) FROM history WHERE host IS NOT NULL").fetchone()[0]
 status["submissions_confirmed"]=db.execute("SELECT COUNT(*) FROM submissions WHERE status='confirmed'").fetchone()[0]
 status["submissions_pending"]=db.execute("SELECT COUNT(*) FROM submissions WHERE status='pending'").fetchone()[0]
 db.commit()
 db.close()
 PUBLIC.mkdir(parents=True,exist_ok=True)
 dest=PUBLIC/"google-web-seo-status.json"
 tmp=dest.with_suffix(".json.tmp")
 tmp.write_text(json.dumps(status,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
 os.replace(tmp,dest)
 ROOT.joinpath("latest.json").write_text(json.dumps(status,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")

def main():
 p=argparse.ArgumentParser()
 p.add_argument("--self-test",action="store_true")
 args=p.parse_args()
 if args.self_test:
  l=Links();l.feed('<html><head><title>OK</title><link rel="canonical" href="https://x"></head><body><h1>Hi</h1><a href="/submit">here</a></body></html>')
  assert l.title=="OK" and l.h1==["Hi"] and l.links==["/submit"] and l.canon==["https://x"]
  assert len(TARGETS)==2 and all("/nhom-" in x for x in TARGETS.values())
  assert normalize_target_anchor("https://example.org/page","https://64-120-92-172.sslip.io/nhom-bong-da-telegram-mien-phi.html")==TARGETS["football"]
  assert normalize_target_anchor("https://example.org/page","https://t.me/keochuyengia79") is None
  assert normalize_target_anchor(TARGETS["football"],TARGETS["football"]) is None
  assert 10<=len(source_seeds())<=MAX_SEEDS
  print("KQ247_GOOGLE_WEB_SELF_TEST=PASS")
  return
 started=time.monotonic()
 with concurrent.futures.ThreadPoolExecutor(max_workers=MAX_WORKERS) as pool:
  first=list(pool.map(audit_first_party,TARGETS.items()))
  seeds=source_seeds()
  sources=list(pool.map(inspect_source,seeds))
  other=list(pool.map(lambda u:get(u),[BASE+"/robots.txt",BASE+"/sitemap.xml"]))
 result={"campaign":"google_web_independent","checked_at_utc":utcnow(),
         "landing_pages":first,
         "site_infrastructure":{
           "robots_http":other[0].get("status"),"sitemap_http":other[1].get("status"),
           "robots_allows_discovery":"Allow: /" in other[0].get("body",""),
           "sitemap_both_landing_pages":all(url in other[1].get("body","") for url in TARGETS.values())},
         "configured_unique_source_hosts":len(seeds),
         "sources_checked_this_run":len(sources),
         "sources_http200_this_run":sum(s.get("http")==200 for s in sources),
         "new_web_contribution_candidates_this_run":sum(s.get("candidate_count",0) for s in sources),
         "sources":sources,
         "automatic_submission":{"enabled":False,"reason":"No independently verified opt-in Web editorial form adapter; no blind POSTs or Telegram directory reuse"},
         "google_indexation":{"indexed_pages":None,"organic_clicks":None,"organic_impressions":None,
                              "source":"Google Search Console connection unavailable; no invented rankings"},
         "policy":"No spam, no login or CAPTCHA circumvention. A scanned site, sitemap URL or Telegram link is not a Google WEB backlink.",
         "elapsed_seconds":None}
 result["elapsed_seconds"]=round(time.monotonic()-started,2)
 store_and_report(first,sources,result)
 print("KQ247_GOOGLE_WEB_STATUS="+json.dumps(
   {k:result[k] for k in ("checked_at_utc","sources_checked_this_run","sources_http200_this_run",
                          "new_web_contribution_candidates_this_run","web_backlinks",
                          "new_verified_web_backlinks_this_run","elapsed_seconds")},
    ensure_ascii=False))
if __name__=="__main__":main()
