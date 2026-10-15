#!/usr/bin/env python3
"""Bongdalu genuine feed mirror health + measurable historical access depth.
Only verified Bongdalu hosts, never switch to lookalike content websites.
Candidate cache is research-only and does not edit production.
"""
import concurrent.futures,datetime as dt,gzip,hashlib,html,json,os,pathlib,re,sys,urllib.parse,urllib.request,zlib
from common import ROOT,VN,load,save,now
CANDIDATE_HOSTS=(
 "www.bongdalu812.com","www.bongdalu.com","www.bongdalu802.com",
 "www.bongdalu811.com","www.bongdalu628.com","www.bongdalu800.com",
 "www.bongdalu128.com","www.bongdalu618.com")
ALLOW=re.compile(r"^(?:www\.)?bongdalu(?:\d{0,4})?\.(?:com|net|vn)$",re.I)
DEPTH_DAYS=(0,1,2,3,5,7,10,14,21,28,35,45,60,75,90,120,150,180,270,365,499)
MAX_CANDIDATES=max(2,min(12,int(os.environ.get("KQ247_BONG_SOURCE_CANDIDATES","7"))))
DEST=ROOT/"bongdalu-source-depth"
def domain(u):
 try:
  x=urllib.parse.urlsplit(u)
  if x.scheme!="https" or not x.hostname or not ALLOW.fullmatch(x.hostname):return None
  return x.hostname.lower()
 except ValueError:return None
def root(u):
 h=domain(u);return ("https://"+h+"/") if h else None
def query_candidates():
 # Search is DISCOVERY ONLY; feed and odds both must pass content verification.
 urls=list("https://"+h+"/" for h in CANDIDATE_HOSTS)
 for q in ("Bongdalu h2h football","Bongdalu tỷ số bóng đá"):
  uri="https://html.duckduckgo.com/html/?"+urllib.parse.urlencode({"q":q})
  try:
   r=urllib.request.Request(uri,headers={"User-Agent":"Mozilla/5.0","Accept":"text/html"})
   with urllib.request.urlopen(r,timeout=9) as f:body=f.read(800000).decode("utf8","replace")
   links=re.findall(r"uddg=([^&\"'\s<>]+)",body,re.I)
   for value in links:
    u=urllib.parse.unquote(html.unescape(value))
    candidate=root(u)
    if candidate and candidate not in urls:urls.append(candidate)
  except Exception:continue
 return urls[:MAX_CANDIDATES]
def fetch(base,path,timeout=7):
 endpoint=urllib.parse.urljoin(base,path)
 if not root(base):raise ValueError("source host not on verified Bongdalu pattern")
 req=urllib.request.Request(endpoint,headers={
  "User-Agent":"Mozilla/5.0","Accept":"application/json,text/plain,*/*",
  "Referer":base})
 with urllib.request.urlopen(req,timeout=timeout) as r:
  if not domain(r.url):raise ValueError("redirect to non-Bongdalu domain")
  if r.status!=200:raise ValueError("HTTP not 200")
  body=r.read(2100000)
  encoding=(r.headers.get("Content-Encoding") or "").lower()
 if not body or len(body)>2000000:raise ValueError("unexpected response size")
 if "gzip" in encoding or body[:2]==b"\x1f\x8b":body=gzip.decompress(body)
 elif "deflate" in encoding or body[:2] in (b"\x78\x9c",b"\x78\xda"):body=zlib.decompress(body)
 if len(body)>2500000:raise ValueError("expanded response too large")
 return body.decode("utf-8-sig","replace")
def live_health(base):
 try:
  js=fetch(base,"gf/data/bf_vn1_nt.js")
  if len(re.findall(r"A\[\d+\]\s*=\s*\[",js))<20 or not re.search(r"var\s+A\s*=\s*Array",js):raise ValueError("invalid football fixture feed")
  xml=fetch(base,"gf/data/odds/en/goal8.xml")
  if len(re.findall(r"<m(?:\s|>)",xml,re.I))<10:raise ValueError("odds-feed schema or coverage invalid")
  return {"ok":True,"live_matches":len(re.findall(r"A\[\d+\]\s*=\s*\[",js)),
          "odds_entries":len(re.findall(r"<m(?:\s|>)",xml,re.I))}
 except Exception as e:return {"ok":False,"error":type(e).__name__+":"+str(e)[:95]}
def archived_count(base,date):
 try:
  text=fetch(base,"ajax/SoccerAjax?"+urllib.parse.urlencode({
     "type":6,"date":date.isoformat(),"order":"league","timezone":0}),timeout=8)
  try:
   d=json.loads(text)
   if isinstance(d,dict):
    if str(d.get("ErrCode")) not in ("0","None"):return {"count":0,"reason":"server_errcode"}
    text=d.get("Data","")
  except ValueError:pass
  if not isinstance(text,str):return {"count":0,"reason":"not_text"}
  m=re.search(r"\bmatchcount\s*=\s*(\d+)",text,re.I)
  count=int(m.group(1)) if m else len(re.findall(r"A\[\d+\]\s*=\s*\[",text))
  return {"count":count,"reason":"verified_data" if count>0 else "empty_archival_feed"}
 except Exception as e:return {"count":0,"reason":type(e).__name__}
def research_probe(base):
 result={"base":base,"health":live_health(base),"archives":{}}
 if not result["health"]["ok"]:return result
 today=dt.datetime.now(VN).date()-dt.timedelta(days=1)
 def one(days):
  date=today-dt.timedelta(days=days)
  return str(days),date.isoformat(),archived_count(base,date)
 with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
  for offset,date,obs in pool.map(one,DEPTH_DAYS):
   result["archives"][date]={"age_days_from_yesterday":int(offset),**obs}
 available=[(v["age_days_from_yesterday"],d) for d,v in result["archives"].items() if v["count"]>0]
 result["verified_oldest_date"]=min((d for _,d in available),default=None)
 result["verified_max_age_days"]=max((age+1 for age,_ in available),default=0)
 result["sampled_dates_with_matches"]=len(available)
 result["sampled_dates_total"]=len(DEPTH_DAYS)
 result["fully_contiguous_days_verified"]=0 # Not proven until every date checked.
 return result
def run():
 DEST.mkdir(parents=True,exist_ok=True)
 bases=query_candidates()
 with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
  results=list(pool.map(research_probe,bases))
 ok=[x for x in results if x["health"]["ok"]]
 # Working current feed is necessary; an unrelated site's "Bongdalu" branding is insufficient.
 ranked=sorted(ok,key=lambda x:(x["sampled_dates_with_matches"],x["verified_max_age_days"],x["health"]["odds_entries"]),reverse=True)
 best=ranked[0] if ranked else None
 old=load(DEST/"last_verified.json")
 # Never replace a known working cached base with an unverified URL.
 if best:
  saved={"base":best["base"],"verified_at_utc":now(),
         "current_football_feed_verified":True,"current_odds_verified":True,
         "max_sampled_history_age_days":best["verified_max_age_days"],
         "oldest_sampled_date":best["verified_oldest_date"],
         "source_label":"bongdalu_native_feed"}
  save(DEST/"last_verified.json",saved)
 else:saved=old
 report={"checked_at_utc":now(),"candidates_checked":len(results),
         "fully_current_feed_verified":len(ok),"preferred_base":best["base"] if best else None,
         "cached_last_verified_base":saved.get("base") if isinstance(saved,dict) else None,
         "date_probe_ages":list(DEPTH_DAYS),"results":results,
         "max_sampled_history_age_days":best["verified_max_age_days"] if best else None,
         "actual_max_available_days_unproven":True,
         "prematch_market_history_unproven":True,"production_changed":False}
 save(DEST/"status.json",report)
 print("KQ247_BONGDALU_SOURCE_DEPTH="+json.dumps(report,ensure_ascii=False),flush=True)
def test():
 assert root("https://www.bongdalu812.com/match/h2h-123")=="https://www.bongdalu812.com/"
 assert root("https://bongdalu.video/") is None
 assert root("http://www.bongdalu811.com") is None
 assert root("https://phishing-bongdalu812.com/") is None
 assert DEPTH_DAYS[-1]==499 and len(DEPTH_DAYS)>14
 print("KQ247_BONGDALU_DEPTH_SELFTEST=PASS")
if __name__=="__main__":
 if "--self-test" in sys.argv:test()
 else:run()
