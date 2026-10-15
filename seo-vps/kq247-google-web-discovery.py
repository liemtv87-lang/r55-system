#!/usr/bin/env python3
"""KQ247 GOOGLE WEB independent Vietnam-first 5-minute public-source discovery.

This is READ-ONLY: discovers possible sites and contributor pages, never posts.
Sitemap URL counts are NOT backlink counts. All network reads are bounded and
per-host paced. A separate authoritative verification worker counts published
backlinks only after confirming public links to KQ247 landing pages.
"""
import concurrent.futures as cf
import datetime as dt
from collections import deque
from html.parser import HTMLParser
import json
import os
from pathlib import Path
import re
import sqlite3
import threading
import time
import urllib.parse as urlparse
import urllib.request as request
import xml.etree.ElementTree as ET

ROOT=Path(os.environ.get("KQ247_GOOGLE_ROOT","/opt/kq247/google-web-seo"))
PUBLIC=Path(os.environ.get("KQ247_PUBLIC_ROOT","/opt/kq247/deployment/football-original/public"))
SEEDS_FILE=Path(__file__).resolve().parent/"google-web-source-seeds.json"
# Scale to 400 distinct hosts / 28 cross-host workers per 5-minute cycle.
# Hard limits and per-host quotas are unchanged; no third-party submissions.
MAX_HOSTS=min(600,max(40,int(os.environ.get('KQ247_GOOGLE_MAX_HOSTS','400'))))
MAX_WORKERS=min(32,max(4,int(os.environ.get('KQ247_GOOGLE_WORKERS','28'))))
MAX_SITEMAPS_PER_HOST=10
MAX_INVENTORY_URLS_PER_HOST=12000
MAX_BYTES_PER_SITEMAP=3_500_000
MAX_BYTES_PER_INDEX=650_000
TIMEOUT=7
SITE_LIMIT_SECONDS=30
HOST_QUOTA_PER_CYCLE=100
SEARCH_PAGES=[
 ("https://vietnamnavigation.com/doi-song/","VN_directory"),
 ("https://seohot.vn/website-the-thao/","VN_sports_directory"),
 ("https://www.fbvn.com/p/web.html","VN_directory"),
 ("https://piperic.com/language/vi","VN_language_index"),
 ("https://www.viet.net/cgi-bin/unibrowse","VN_directory"),
 ("https://duonggiaphat.vn/danh-sach-cac-noi-dat-backlink-mien-phi-tot-cho-seo/","VN_public_directory_sources"),
 ("https://digicomvn.com/dien-dan-di-backlink/","VN_public_directory_sources"),
 ("https://famemedia.vn/website-dat-backlink/","VN_public_directory_sources"),
 ("https://www.thietkewebchuanseo.com/seo-offpage.htm","VN_public_directory_sources")
]
TOKENS=("dang-bai","dang-tin","gui-bai","gui-tin","lien-he","lien_he",
        "cong-tac-vien","contact","submit","contribute","guest-post",
        "add-url","add-site","them-website","dang-ky","quang-cao")
UA="KQ247GoogleWebDiscovery/1.0 (5-minute read-only public indexing)"
SKIP_HOSTS={"t.me","telegram.me","facebook.com","google.com","youtube.com",
            "64-120-92-172.sslip.io","t.co","twitter.com","x.com"}

def utcnow():
 return dt.datetime.now(dt.timezone.utc).isoformat()

def host(url):
 try:return (urlparse.urlsplit(url).hostname or "").lower().removeprefix("www.")
 except ValueError:return ""

def https_on_host(value,domain):
 try:
  p=urlparse.urlsplit(value)
  return p.scheme=="https" and host(value)==domain and not p.username
 except ValueError:return False

def fetch(uri, cap=MAX_BYTES_PER_SITEMAP):
 try:
  p=urlparse.urlsplit(uri)
  if p.scheme!="https" or not p.hostname or p.username:return None,"invalid_url"
  req=request.Request(uri,headers={"User-Agent":UA,
      "Accept":"application/xml,text/xml,text/plain,text/html,application/gzip",
      "Accept-Encoding":"identity"})
  with request.urlopen(req,timeout=TIMEOUT) as resp:
   data=resp.read(cap+1)
   if len(data)>cap:return None,"too_large"
   if host(resp.geturl())!=host(uri):return None,"cross_host_redirect"
   # Python decompression size is bounded by cap via capped decompressobj.
   if data[:2]==bytes.fromhex("1f8b"):
    import zlib
    obj=zlib.decompressobj(zlib.MAX_WBITS|16)
    data=obj.decompress(data,cap+1)
    if len(data)>cap:return None,"expanded_too_large"
   return data,None
 except Exception as e:return None,type(e).__name__

def parse_sitemap(data):
 try:
  root=ET.fromstring(data)
  name=root.tag.rsplit("}",1)[-1]
  if name not in ("urlset","sitemapindex"):return "unknown",[]
  locations=[]
  for element in root.iter():
   if element.tag.rsplit("}",1)[-1]=="loc" and element.text:
    locations.append(element.text.strip())
    if len(locations)>=18000:break
  return name,locations
 except (ET.ParseError,ValueError):return "invalid",[]

class Outgoing(HTMLParser):
 def __init__(self):
  super().__init__();self.links=[]
 def handle_starttag(self,tag,attrs):
  if tag=="a":
   d=dict(attrs)
   if d.get("href") and len(self.links)<10000:self.links.append(d["href"])

def priority(url,kind=""):
 h=host(url)
 # Vietnam hosts first. A .vn domain alone is NOT a publication permission.
 return 0 if h.endswith((".vn",".com.vn",".net.vn",".org.vn",".edu.vn")) or kind.startswith("VN_") else 1

def discover_directories(db):
 """Rotate public index subpages across five-minute cycles instead of reopening
 the same index pages forever. No third-party POSTs or Google scraping."""
 now=utcnow()
 for base,category in SEARCH_PAGES:
  db.execute("INSERT OR IGNORE INTO index_frontier VALUES(?,?,?,?)",
             (base,category,None,None))
 db.commit()
 pages=db.execute("""SELECT url,category FROM index_frontier
                     ORDER BY CASE WHEN last_checked IS NULL THEN 0 ELSE 1 END,
                              COALESCE(last_checked,'') ASC LIMIT 24""").fetchall()
 seen={}
 visited=[]
 for base,category in pages:
  raw,err=fetch(base,MAX_BYTES_PER_INDEX)
  visited.append((base,now,err))
  if raw is None:continue
  parser=Outgoing()
  parser.feed(raw.decode("utf-8","replace"))
  nested=0
  for item in parser.links:
   u=urlparse.urljoin(base,item).split("#")[0]
   p=urlparse.urlsplit(u)
   h=host(u)
   if p.scheme!="https" or not h or h in SKIP_HOSTS:continue
   if h!=host(base):
    seen.setdefault(h,{"host":h,"url":"https://"+h+"/","category":category,"priority":priority(u,category)})
   elif nested<35 and len(p.path)<150 and len(p.query)<100 and any(
      marker in p.path.lower()+("?"+p.query.lower()) for marker in
      ("page","category","sports","the-thao","vietnam","website","browse",
       "directory","site","forum","web","football","links","vi/","p=")):
    db.execute("INSERT OR IGNORE INTO index_frontier VALUES(?,?,?,?)",
               (u,category,None,None))
    nested+=1
 for base,at,err in visited:
  db.execute("UPDATE index_frontier SET last_checked=?,last_error=? WHERE url=?",
             (at,err,base))
 db.commit()
 return sorted(seen.values(),key=lambda x:(x["priority"],x["host"])),len(pages)

def sitemap_scan(job):
 h=job["host"]
 started=time.monotonic()
 urls=deque(["https://"+h+"/robots.txt"])
 for tail in ("sitemap.xml","sitemap_index.xml","wp-sitemap.xml","sitemap.xml.gz"):
  urls.append("https://"+h+"/"+tail)
 visited=set()
 read_count=0
 pages=0
 forms=set()
 topic=0
 attempts=0
 errors=[]
 robots_text=None
 discovered_sitemaps=[]
 # Rehydrate small queue of distinct prior sitemap URLs, rotating across windows.
 for item in job.get("sitemaps",[])[:20]:
  if https_on_host(item,h):urls.append(item)
 while urls and attempts<MAX_SITEMAPS_PER_HOST and read_count<MAX_INVENTORY_URLS_PER_HOST:
  if time.monotonic()-started>SITE_LIMIT_SECONDS:break
  item=urls.popleft()
  if item in visited or not https_on_host(item,h):continue
  visited.add(item)
  attempts+=1
  body,error=fetch(item,MAX_BYTES_PER_SITEMAP)
  if body is None:
   if len(errors)<4:errors.append(error)
   continue
  if item.endswith("/robots.txt"):
   robots_text=body.decode("utf-8","replace")
   # Honor explicit complete disallow of crawler. No attempts on this host after.
   if re.search(r"(?im)^\s*user-agent:\s*\*\s*$[\s\S]{0,100}^\s*disallow:\s*/\s*$",robots_text):
    return {"host":h,"requests":attempts,"urls":0,"candidate_pages":[],"topic_urls":0,
            "sitemaps":[],"errors":["robots_disallow_all"],"category":job.get("category")}
   for m in re.finditer(r"(?im)^\s*Sitemap:\s*(https://\S+)",robots_text):
    sm=m.group(1).strip()
    if https_on_host(sm,h):urls.appendleft(sm)
   continue
  typ,locs=parse_sitemap(body)
  if typ=="sitemapindex":
   for link in locs:
    if https_on_host(link,h) and link not in visited:
     urls.append(link)
     if len(discovered_sitemaps)<30:discovered_sitemaps.append(link)
  elif typ=="urlset":
   pages+=1
   read_count+=min(len(locs),MAX_INVENTORY_URLS_PER_HOST-read_count)
   for link in locs[:MAX_INVENTORY_URLS_PER_HOST]:
    if not https_on_host(link,h):continue
    path=urlparse.urlsplit(link).path.lower()
    if any(token in path for token in TOKENS):forms.add(link)
    if any(token in path for token in ("bong-da","bongda","the-thao","xoso","xo-so","xsmb","xsmt","xsmn","telegram")):topic+=1
 return {"host":h,"requests":attempts,"urls":read_count,"candidate_pages":sorted(forms)[:50],
         "topic_urls":topic,"sitemap_pages":pages,"sitemaps":discovered_sitemaps[:20],
         "errors":errors[:4],"category":job.get("category"),"priority":job.get("priority",1)}

def init_db(db):
 db.execute("CREATE TABLE IF NOT EXISTS sites (host TEXT PRIMARY KEY, source_url TEXT NOT NULL, category TEXT, priority INTEGER, created_at TEXT,last_scanned TEXT,cycle_count INTEGER DEFAULT 0)")
 db.execute("CREATE TABLE IF NOT EXISTS candidate_pages (url TEXT PRIMARY KEY,host TEXT,first_seen TEXT,last_seen TEXT,review_status TEXT)")
 db.execute("CREATE TABLE IF NOT EXISTS per_host_sitemaps (host TEXT,url TEXT,PRIMARY KEY(host,url))")
 db.execute("CREATE TABLE IF NOT EXISTS cycles (run_at TEXT, hosts_scanned INTEGER,url_records INTEGER,new_hosts INTEGER,new_form_pages INTEGER, errors INTEGER)")
 db.execute("CREATE TABLE IF NOT EXISTS index_frontier (url TEXT PRIMARY KEY,category TEXT,last_checked TEXT,last_error TEXT)")
 db.commit()

def load_candidates():
 config=json.loads(SEEDS_FILE.read_text(encoding="utf-8"))
 result=[]
 for item in config.get("sources",[]):
  uri=item.get("url","")
  h=host(uri)
  if uri.startswith("https://") and h and h not in SKIP_HOSTS:
   result.append({"host":h,"url":uri,"category":item.get("category","uncategorized"),"priority":priority(uri)})
 return result

def run():
 ROOT.mkdir(parents=True,exist_ok=True)
 now=utcnow()
 db=sqlite3.connect(ROOT/"google-web-discovery.sqlite3")
 init_db(db)
 from_config=load_candidates()
 from_directory,index_pages_checked=discover_directories(db)
 combined=from_config+from_directory
 existing={r[0] for r in db.execute("SELECT host FROM sites")}
 new_sites=0
 for site in combined:
  h=site["host"]
  if h not in existing:
   db.execute("INSERT OR IGNORE INTO sites (host,source_url,category,priority,created_at) VALUES(?,?,?,?,?)",
             (h,site["url"],site["category"],site["priority"],now))
   existing.add(h);new_sites+=1
 # Do not treat extracted links as sites that permit submission.
 db.commit()
 rows=db.execute("SELECT host,source_url,category,priority FROM sites ORDER BY priority ASC, COALESCE(last_scanned,'') ASC,host LIMIT ?",(MAX_HOSTS,)).fetchall()
 jobs=[]
 for h,u,c,p in rows:
  sitemaps=[r[0] for r in db.execute("SELECT url FROM per_host_sitemaps WHERE host=? LIMIT 20",(h,))]
  jobs.append({"host":h,"url":u,"category":c,"priority":p,"sitemaps":sitemaps})
 # This inventory reads public sitemaps, not all website HTML content.
 with cf.ThreadPoolExecutor(max_workers=MAX_WORKERS) as pool:
  results=list(pool.map(sitemap_scan,jobs))
 host_count=len(results);ur=0;form_new=0;errors=0
 for row in results:
  h=row["host"]
  ur+=row["urls"]
  errors+=len(row.get("errors",[]))
  db.execute("UPDATE sites SET last_scanned=?,cycle_count=cycle_count+1 WHERE host=?",(now,h))
  for link in row.get("sitemaps",[]):
   db.execute("INSERT OR IGNORE INTO per_host_sitemaps VALUES(?,?)",(h,link))
  for link in row.get("candidate_pages",[]):
   if not db.execute("SELECT 1 FROM candidate_pages WHERE url=?",(link,)).fetchone():
    form_new+=1
   db.execute("INSERT INTO candidate_pages VALUES(?,?,?,?,?) ON CONFLICT(url) DO UPDATE SET last_seen=excluded.last_seen",
            (link,h,now,now,"unverified"))
 db.execute("INSERT INTO cycles VALUES(?,?,?,?,?,?)",(now,host_count,ur,new_sites,form_new,errors))
 db.commit()
 total_sites=db.execute("SELECT COUNT(*) FROM sites").fetchone()[0]
 total_forms=db.execute("SELECT COUNT(*) FROM candidate_pages").fetchone()[0]
 index_frontier_count=db.execute("SELECT COUNT(*) FROM index_frontier").fetchone()[0]
 # Durable accounting of reads (including repeated URLs across cycles).
 # Not a unique-URL count and never a claimed backlink count.
 cumulative_url_records,cumulative_host_scans,completed_cycles=db.execute(
  "SELECT COALESCE(SUM(url_records),0),COALESCE(SUM(hosts_scanned),0),COUNT(*) FROM cycles"
 ).fetchone()
 db.close()
 result={"campaign":"google_web_independent","checked_at_utc":now,
         "discovery_interval_minutes":5,"vietnam_priority_enabled":True,
         "source_ordering":"Vietnam-related and .vn first; round-robin via last_scanned",
         "source_indexes_seeded":len(SEARCH_PAGES),
         "source_index_pages_checked_this_run":index_pages_checked,
         "index_frontier_total_pages":index_frontier_count,
         "source_hosts_new_this_run":new_sites,"source_hosts_known_total":total_sites,
         "source_hosts_examined_this_run":host_count,
         "host_budget_per_cycle":MAX_HOSTS,"worker_count":MAX_WORKERS,
         "sitemap_url_records_read_this_run":ur,
         "cumulative_sitemap_url_records_read":cumulative_url_records,
         "cumulative_source_host_scans":cumulative_host_scans,
         "completed_scan_cycles":completed_cycles,
         "cumulative_count_note":"Counts all sitemap URL records read, including repeats across cycles; not unique URLs or backlinks.",
         "contributor_url_candidates_new_this_run":form_new,
         "contributor_url_candidates_total":total_forms,
         "site_error_samples":sum(bool(r.get("errors")) for r in results),
         "actual_domains_that_allow_posting_confirmed":0,
         "actual_web_backlinks_submitted_by_discovery":0,
         "actual_web_backlinks_published_by_discovery":0,
         "note":"A sitemap URL is not a backlink or a permission to register. This is a bounded public inventory, not 100k guaranteed or Google crawling."}
 dest=PUBLIC/"google-web-discovery-status.json"
 PUBLIC.mkdir(parents=True,exist_ok=True)
 tmp=dest.with_suffix(".json.tmp")
 tmp.write_text(json.dumps(result,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
 os.replace(tmp,dest)
 ROOT.joinpath("discovery-latest.json").write_text(json.dumps(result,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
 print("KQ247_GOOGLE_WEB_DISCOVERY="+json.dumps(result,ensure_ascii=False),flush=True)

def selftest():
 assert priority("https://test.com.vn/")==0
 assert priority("https://example.com/")==1
 assert parse_sitemap(b'<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>https://abc.vn/foo</loc></url></urlset>')[1]==["https://abc.vn/foo"]
 assert not https_on_host("https://evil.com/a","abc.vn")
 assert host("https://www.test.com.vn/foo")=="test.com.vn"
 assert len(load_candidates())>=40
 print("KQ247_GOOGLE_DISCOVERY_SELF_TEST=PASS")

if __name__=="__main__":
 import sys
 if "--self-test" in sys.argv:selftest()
 else:run()
