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
import urllib.error

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
MAX_WORKERS = 24
SEEDS_FILE = Path(__file__).resolve().parent/"google-web-source-seeds.json"
MAX_SEEDS = 400

def source_seeds():
 """Rotate the discovered hosts by last REAL audit; do not repeatedly verify the same 400.
 The discovery inventory does not grant posting permission.
 """
 curated=list(SEEDS)
 try:
  config=json.loads(SEEDS_FILE.read_text(encoding="utf-8"))
  curated += [entry.get("url","") for entry in config.get("sources",[]) if
              isinstance(entry,dict) and entry.get("submission_authorized") is False]
 except (OSError,ValueError,TypeError):
  pass
 last_checked={}
 try:
  with sqlite3.connect("file:"+str(ROOT/"google-web-seo.sqlite3")+"?mode=ro",uri=True,timeout=2) as audit:
   last_checked=dict(audit.execute("SELECT host,MAX(run_at) FROM history WHERE host IS NOT NULL GROUP BY host").fetchall())
 except (sqlite3.Error,OSError):
  pass
 discovered=[]
 try:
  with sqlite3.connect("file:"+str(ROOT/"google-web-discovery.sqlite3")+"?mode=ro",uri=True,timeout=2) as discovery:
   discovered=discovery.execute("SELECT source_url,host,priority FROM sites").fetchall()
 except (sqlite3.Error,OSError):
  pass
 # Vietnam-related publishers first, oldest audits before recently rechecked ones.
 discovered.sort(key=lambda r:(r[2] if r[2] is not None else 1,
                                last_checked.get(r[1],"") or "",r[1]))
 seen=set()
 result=[]
 def append_valid(uri):
  try:p=urllib.parse.urlsplit(uri)
  except ValueError:return False
  host=(p.hostname or "").lower().removeprefix("www.")
  if p.scheme!="https" or not host or host in seen:return False
  if host in ("t.me","telegram.me") or host==urllib.parse.urlsplit(BASE).hostname:return False
  seen.add(host)
  result.append(uri)
  return True
 for uri in sorted(curated,key=lambda u:0 if (urllib.parse.urlsplit(u).hostname or "").endswith(".vn") else 1):
  append_valid(uri)
 # Reserve some scan capacity for non-.vn hosts rather than starving all of them.
 space=max(0,MAX_SEEDS-len(result))
 vn_budget=int(space*0.8)
 vn=[r[0] for r in discovered if (r[1] or "").endswith(".vn")]
 elsewhere=[r[0] for r in discovered if not (r[1] or "").endswith(".vn")]
 vn_added=0
 for uri in vn:
  if vn_added>=vn_budget:break
  if append_valid(uri):vn_added+=1
  if len(result)>=MAX_SEEDS:return result[:MAX_SEEDS]
 for uri in elsewhere:
  if len(result)>=MAX_SEEDS:return result[:MAX_SEEDS]
  append_valid(uri)
 for uri in vn:
  if len(result)>=MAX_SEEDS:break
  append_valid(uri)
 return result[:MAX_SEEDS]


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
  self._current_form = None
  self.title = ""
  self.h1 = []
  self.meta = {}
  self.canon = []
  self.jsonld = 0
  self._capture = None
 def handle_starttag(self, tag, attrs):
  a=dict(attrs)
  if tag=="a" and a.get("href"): self.links.append(a["href"])
  elif tag=="form":
   self._current_form={"action":a.get("action",""),"method":a.get("method","get").lower(),"fields":[]}
   self.forms.append(self._current_form)
  elif tag in ("input","textarea","select") and self._current_form is not None:
   style=a.get("style","").lower().replace(" ","")
   hidden=(a.get("type","text").lower()=="hidden" or "display:none" in style or
           ("position:absolute" in style and ("-9999px" in style or "-9999em" in style)) or
           (a.get("aria-hidden","").lower()=="true" and a.get("tabindex")=="-1"))
   self._current_form["fields"].append({"tag":tag,"name":a.get("name",""),"type":a.get("type","text").lower(),"required":"required" in a,"hidden":hidden})
  elif tag in ("title","h1"): self._capture=tag
  elif tag=="meta":
   key=a.get("name",a.get("property","")).lower()
   if key: self.meta[key]=a.get("content","")
  elif tag=="link" and "canonical" in a.get("rel","").lower(): self.canon.append(a.get("href",""))
  elif tag=="script" and a.get("type","").lower()=="application/ld+json": self.jsonld+=1
 def handle_endtag(self, tag):
  if tag=="form":self._current_form=None
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
   robots_url="https://"+p.hostname+"/robots.txt"
   req=urllib.request.Request(robots_url,headers={"User-Agent":UA})
   with urllib.request.urlopen(req,timeout=4) as response:
    rules=response.read(120_000).decode("utf-8","replace")
   # Fail closed on explicit robots disallow; avoid unbounded RobotFileParser.read().
   from urllib.robotparser import RobotFileParser
   rp=RobotFileParser()
   rp.parse(rules.splitlines())
   if not rp.can_fetch(UA,url):return {"error":"robots_disallow"}
  except urllib.error.HTTPError as exc:
   # A missing robots.txt (404/410) does not prohibit crawling. Other errors fail closed.
   if exc.code not in (404,410):return {"error":"robots_http_"+str(exc.code)}
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
 out.update({"forms_observed_on_source_page":len(p.forms),
             "post_forms_observed_on_source_page":sum(f["method"]=="post" for f in p.forms),
             "form_details":p.forms[:5],
             "submission_authorized":False,
             "submission_status":"not_attempted_unverified_permission",
             "potential_contributor_pages":possible[:10],
             "candidate_count":len(possible),
             "verified_target_hrefs":verified[:5],
             "html_checked":True})
 return out

def candidate_page_intent(uri):
 """Return a conservative URL-path signal, NOT authorization to publish.
 Ignore arbitrary articles mentioning 'submit' and technical assets.
 """
 try:
  p=urllib.parse.urlsplit(uri)
  path=urllib.parse.unquote(p.path).lower().rstrip("/")
  leaf=path.rsplit("/",1)[-1]
  if p.scheme!="https" or not p.hostname or len(uri)>1200 or not leaf:return 99
  if "/wp-content/" in path or leaf.endswith((".svg",".png",".jpg",".jpeg",".webp",".pdf",".css",".js",".xml")):return 99
  exact={"submit-site","submit-website","submit-your-site","submit-your-website",
         "submit-url","submit-link","submit-article","submit-post","submit-guest-post",
         "add-url","add-site","add-website","them-website","dang-bai","gui-bai",
         "dang-tin","gui-tin","write-for-us","guest-post-guidelines",
         "guest-post-submission","contributor-guidelines"}
  if leaf in ("submit-service","submit-listing","submit-a-listing","submit-your-company","submit-your-business","submit-your-product"):return 0
  if leaf=="suggest.php" and "/directory/" in path:return 1
  if leaf in exact:return 0
  if leaf.startswith(("submit-your-site-","submit-your-website-","submit-guest-post-",
                      "submit-article-","add-your-site-","write-for-us-",
                      "guest-post-guidelines-","guest-post-submission-")):return 1
  if leaf in ("guest-post","become-a-contributor","contribute","submit-content"):return 2
  return 99
 except (ValueError,UnicodeError):return 99

def remember_publisher_candidates(sources):
 """Save first-party homepage outbound contributor links for follow-up scrutiny.
 Candidate discovery is read-only, never consent or a submission.
 """
 db=sqlite3.connect(ROOT/"google-web-seo.sqlite3",timeout=5)
 db.execute("CREATE TABLE IF NOT EXISTS publisher_candidate_pages (url TEXT PRIMARY KEY, host TEXT, first_seen TEXT)")
 added=0
 for item in sources:
  for uri in [item.get("source","")]+item.get("potential_contributor_pages",[]):
   if candidate_page_intent(uri)>=99:continue
   try:
    p=urllib.parse.urlsplit(uri)
    host=(p.hostname or "").lower().removeprefix("www.")
    if p.scheme!="https" or not host or host in ("localhost","t.me","telegram.me"):continue
   except ValueError:continue
   result=db.execute("INSERT OR IGNORE INTO publisher_candidate_pages VALUES(?,?,?)",(uri,host,utcnow()))
   added+=max(result.rowcount,0)
 db.commit()
 db.close()
 return added

def candidate_pages_to_inspect(limit=240):
 """Rotate only editorial submission-intent pages; not arbitrary keyword articles.
 Reading or finding a POST form never authorizes submitting content.
 """
 try:
  with sqlite3.connect("file:"+str(ROOT/"google-web-discovery.sqlite3")+"?mode=ro",uri=True,timeout=2) as db:
   rows=db.execute("SELECT url FROM candidate_pages WHERE review_status='unverified'").fetchall()
  with sqlite3.connect(ROOT/"google-web-seo.sqlite3",timeout=2) as audit:
   audit.execute("CREATE TABLE IF NOT EXISTS candidate_audits (url TEXT PRIMARY KEY,checked_at TEXT NOT NULL,http INTEGER,post_forms INTEGER,forms INTEGER,error TEXT)")
   audit.execute("CREATE TABLE IF NOT EXISTS publisher_candidate_pages (url TEXT PRIMARY KEY, host TEXT, first_seen TEXT)")
   last_checked=dict(audit.execute("SELECT url,checked_at FROM candidate_audits").fetchall())
   homepage_candidates=[x[0] for x in audit.execute("SELECT url FROM publisher_candidate_pages ORDER BY first_seen DESC LIMIT 3000").fetchall()]
  candidates=list(dict.fromkeys([row[0] for row in rows]+homepage_candidates))
  candidates=[uri for uri in candidates if candidate_page_intent(uri)<99]
  def rank(uri):
   host=(urllib.parse.urlsplit(uri).hostname or "").lower()
   return (candidate_page_intent(uri),
           0 if host.endswith(".vn") else 1,
           1 if uri in last_checked else 0,
           last_checked.get(uri,""),uri)
  candidates.sort(key=rank)
  # One host must not monopolize the evidence queue with dozens of near-identical pages.
  selected=[]
  per_host={}
  for uri in candidates:
   host=(urllib.parse.urlsplit(uri).hostname or "").lower().removeprefix("www.")
   if per_host.get(host,0)>=2:continue
   per_host[host]=per_host.get(host,0)+1
   selected.append(uri)
   if len(selected)>=limit:break
  return selected
 except (sqlite3.Error,OSError,ValueError):
  return []

def evaluate_publisher_form(forms, url, page_title="", html_body=""):
 """Evidence only: a form is never permission to submit.
 Ignore search, newsletter, login, WordPress comment and ordinary contact forms.
 """
 blockers=("wp-comments-post","comment-form","/comment","newsletter","login","register",
           "wp-login","/search","contact-us","/contact")
 suitable=[]
 for form in forms:
  if form.get("method")!="post":continue
  action=(form.get("action") or "").lower()
  if any(word in action for word in blockers):continue
  names={re.sub(r"[^a-z0-9]","",f.get("name","").lower()) for f in form.get("fields",[]) if not f.get("hidden")}
  has_site=bool(names & {"url","siteurl","website","websiteurl","weburl",
                         "homepage","homepageurl","domain","domainurl",
                         "sitelink","websitelink","serviceurl","servicewebsite"})
  has_content=bool(names & {"title","name","sitename","websitename",
                             "description","details","summary","content",
                             "category","categoryid","tags"})
  requires_identity=bool(names & {"password","creditcard","cardnumber",
                                   "billingaddress","paymentmethod"})
  if has_site and has_content and not requires_identity:
   suitable.append({"action":form.get("action",""),
                    "url_field":True,"description_or_title_field":True})
 # These are only negative safety clues, not proof that the site permits promotion.
 body=html_body.lower()
 forbidden=bool(re.search(r"(?:no|not|prohibit(?:s|ed)?|forbid(?:den)?)\s+"
                          r"(?:online\s+)?(?:gambling|betting|casino)|"
                          r"(?:gambling|betting|casino)\s+(?:is\s+)?(?:not\s+allowed|prohibited)",body[:150000]))
 has_captcha=bool(re.search(r'(?:g-recaptcha|h-captcha|cf-turnstile|captcha\\.php|captcha\\.png|captcha\\.jpg|captcha\\.jpeg|captcha\\.gif)',body))
 status=("blocked_topic_policy" if forbidden else "needs_captcha" if has_captcha else
         "form_review_required" if suitable else "no_credible_site_submission_form")
 return {"publisher_form_status":status,"credible_site_submission_forms":len(suitable),
         "form_evidence":suitable[:2],"explicit_betting_prohibition":forbidden,
         "captcha_detected":has_captcha,"posting_permission_verified":False}

def inspect_candidate_page(url):
 result={"url":url,"checked_at_utc":utcnow(),"authorized":False,"submission_attempted":False}
 page=get(url,check_robots=True)
 result["http"]=page.get("status")
 result["error"]=page.get("error")
 if page.get("status")!=200 or "html" not in page.get("content_type","").lower():return result
 parser=Links()
 parser.feed(page["body"])
 result["forms_observed"]=len(parser.forms)
 result["post_forms_observed"]=sum(f["method"]=="post" for f in parser.forms)
 result["form_details"]=parser.forms[:3]
 result["permission_status"]="manual_or_explicit_site_policy_verification_required"
 result["candidate_intent_score"]=candidate_page_intent(url)
 result["page_title"]=parser.title.strip()[:180]
 result.update(evaluate_publisher_form(parser.forms,url,parser.title,page["body"]))
 result["form_has_website_field"]=bool(result["credible_site_submission_forms"])
 # A backlink may live in an inner contributor page, not on a site's homepage.
 # Require the same exact HTTPS landing URL match as homepage verification.
 targets=[]
 for href in parser.links[:5000]:
  found=normalize_target_anchor(page.get("final_url",url),href)
  if found and found not in targets:targets.append(found)
 result["verified_target_hrefs"]=targets[:5]
 return result

def store_and_report(landing, sources, status):
 ROOT.mkdir(parents=True,exist_ok=True)
 db=sqlite3.connect(ROOT/"google-web-seo.sqlite3")
 db.execute("CREATE TABLE IF NOT EXISTS history (run_at TEXT,host TEXT,http INTEGER,candidates INTEGER,error TEXT)")
 db.execute("CREATE TABLE IF NOT EXISTS verified (source_url TEXT,target_url TEXT,first_seen TEXT,PRIMARY KEY(source_url,target_url))")
 db.execute("CREATE TABLE IF NOT EXISTS submissions (host TEXT,target_url TEXT,receipt_url TEXT,status TEXT,created_at TEXT,PRIMARY KEY(host,target_url))")
 db.execute("CREATE TABLE IF NOT EXISTS candidate_audits (url TEXT PRIMARY KEY,checked_at TEXT NOT NULL,http INTEGER,post_forms INTEGER,forms INTEGER,error TEXT)")
 for page in status.get("candidate_page_inspections",[]):
  db.execute("INSERT OR REPLACE INTO candidate_audits VALUES(?,?,?,?,?,?)",(
   page.get("url"),page.get("checked_at_utc"),page.get("http"),
   page.get("post_forms_observed",0),page.get("forms_observed",0),page.get("error")))
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
 # Record exact public third-party links on audited internal pages too.
 for page in status.get("candidate_page_inspections",[]):
  origin=page.get("url")
  for target in page.get("verified_target_hrefs",[]):
   if not origin or target not in TARGETS.values():continue
   prior=db.execute("SELECT 1 FROM verified WHERE source_url=? AND target_url=?",(origin,target)).fetchone()
   if not prior:
    db.execute("INSERT OR IGNORE INTO verified VALUES(?,?,?)",(origin,target,now))
    new_links.append({"source":origin,"target":target})
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
 status["candidate_pages_audited_lifetime"]=db.execute("SELECT COUNT(*) FROM candidate_audits").fetchone()[0]
 status["candidate_pages_with_post_forms_lifetime"]=db.execute("SELECT COUNT(*) FROM candidate_audits WHERE post_forms>0").fetchone()[0]
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
  f=Links();f.feed('<form method="post" action="/submit"><input name="url" required><textarea name="description"></textarea></form>')
  assert len(f.forms)==1 and f.forms[0]["method"]=="post" and len(f.forms[0]["fields"])==2
  assert candidate_pages_to_inspect(1)==[] if not (ROOT/"google-web-discovery.sqlite3").exists() else True
  assert l.title=="OK" and l.h1==["Hi"] and l.links==["/submit"] and l.canon==["https://x"]
  assert len(TARGETS)==2 and all("/nhom-" in x for x in TARGETS.values())
  honeypot=Links();honeypot.feed('<form method="post"><input name="name"><input name="website" style="position:absolute;left:-9999px" tabindex="-1" aria-hidden="true"></form>')
  assert evaluate_publisher_form(honeypot.forms,"https://test.vn/submit-site/")["credible_site_submission_forms"]==0
  service=Links();service.feed('<form method="post"><input name="serviceURL"><input name="description"></form>')
  assert evaluate_publisher_form(service.forms,"https://veri.bet/submit-service/")["credible_site_submission_forms"]==1
  assert evaluate_publisher_form(service.forms,"https://example.org/submit-service/",html_body='<img src="includes/captcha.php?84">')["publisher_form_status"]=="needs_captcha"
  assert candidate_page_intent("https://veri.bet/submit-service")==0
  assert candidate_page_intent("https://example.com/directory/suggest.php")==1
  assert evaluate_publisher_form(f.forms,"https://example.vn/submit-your-website/")["publisher_form_status"]=="form_review_required"
  comment={"action":"/wp-comments-post.php","method":"post","fields":[{"name":"url"},{"name":"comment"}]}
  assert evaluate_publisher_form([comment],"https://example.vn/guest-post/")["credible_site_submission_forms"]==0
  assert evaluate_publisher_form(f.forms,"https://example.vn/submit/",html_body="No gambling allowed")["publisher_form_status"]=="blocked_topic_policy"
  assert candidate_page_intent("https://example.vn/submit-your-website/")==0
  assert candidate_page_intent("https://example.vn/gioi-thieu.html")==99
  assert candidate_page_intent("https://example.com/submit-your-site-for-review/")==1
  assert candidate_page_intent("https://example.org/news/study-contributes-to-care/")==99
  assert candidate_page_intent("https://example.org/wp-content/img/submit-spin.svg")==99
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
  homepage_candidates_new=remember_publisher_candidates(sources)
  candidate_pages=list(pool.map(inspect_candidate_page,candidate_pages_to_inspect()))
  other=list(pool.map(lambda u:get(u),[BASE+"/robots.txt",BASE+"/sitemap.xml"]))
 result={"campaign":"google_web_independent","checked_at_utc":utcnow(),
         "landing_pages":first,
         "site_infrastructure":{
           "robots_http":other[0].get("status"),"sitemap_http":other[1].get("status"),
           "robots_allows_discovery":"Allow: /" in other[0].get("body",""),
           "sitemap_both_landing_pages":all(url in other[1].get("body","") for url in TARGETS.values())},
         "configured_unique_source_hosts":len(seeds),
         "five_minute_discovery_ledger_consumed":(ROOT/"google-web-discovery.sqlite3").is_file(),
         "sources_checked_this_run":len(sources),
         "sources_http200_this_run":sum(s.get("http")==200 for s in sources),
         "scan_host_mix":{"vn":sum((s.get("host") or "").endswith(".vn") for s in sources),
                          "other":sum(not (s.get("host") or "").endswith(".vn") for s in sources)},
         "new_web_contribution_candidates_this_run":sum(s.get("candidate_count",0) for s in sources),
         "source_pages_with_forms_this_run":sum(bool(s.get("forms_observed_on_source_page")) for s in sources),
         "source_pages_with_post_forms_this_run":sum(bool(s.get("post_forms_observed_on_source_page")) for s in sources),
         "authorized_submission_sources_this_run":0,
         "sources":sources,
         "candidate_pages_inspected_this_run":len(candidate_pages),
         "new_homepage_editorial_candidates_saved_this_run":homepage_candidates_new,
         "candidate_pages_with_post_forms_this_run":sum(bool(p.get("post_forms_observed")) for p in candidate_pages),
         "candidate_page_inspections":candidate_pages,
         "credible_website_submission_forms_this_run":sum(p.get("credible_site_submission_forms",0) for p in candidate_pages),
         "publisher_review_queue":[{"url":p["url"],"status":p["publisher_form_status"]}
                                   for p in candidate_pages if p.get("publisher_form_status")=="form_review_required"][:50],
         "review_queue_note":"Website field + title/description are candidates only; independent editorial rules and permission must be checked before any post.",
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
                          "candidate_pages_inspected_this_run","new_homepage_editorial_candidates_saved_this_run",
                          "credible_website_submission_forms_this_run",
                          "publisher_review_queue","scan_host_mix","all_hosts_ever_checked",
                          "new_verified_web_backlinks_this_run","elapsed_seconds")},
    ensure_ascii=False))
if __name__=="__main__":main()
