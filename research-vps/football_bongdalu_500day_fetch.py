#!/usr/bin/env python3
"""Read-only, dated Bongdalu football result archiver for the 500-day research window.
Historical results are POST-MATCH EVIDENCE, never retroactively pre-match odds.
No interaction with production database/containers, no fake dates or fixture results.
"""
import datetime as dt,gzip,hashlib,json,os,pathlib,re,sys,time,urllib.error,urllib.parse,urllib.request
from common import ROOT,VN,load,save,now
BASE=os.environ.get("KQ247_BONGDALU_BASE","https://www.bongdalu812.com/")
VALID_HOSTS={"www.bongdalu812.com","www.bongdalu.com","www.bongdalu802.com","www.bongdalu811.com"}
BATCH=max(1,min(24,int(os.environ.get("KQ247_FOOTBALL_DAYS_PER_CYCLE","8"))))
DIR=ROOT/"football-bongdalu-results"
INDEX=DIR/"index.json"
MAX_AGE=500
def fields(src):
 out=[];cur="";quote=None;escape=False
 for ch in src:
  if quote:
   if escape:cur+=ch;escape=False
   elif ch=="\\":escape=True
   elif ch==quote:quote=None
   else:cur+=ch
  elif ch in ("'",'"'):quote=ch
  elif ch==",":out.append(cur.strip());cur=""
  else:cur+=ch
 out.append(cur.strip())
 return out
def fetch_for_day(day):
 base=urllib.parse.urlsplit(BASE)
 if base.scheme!="https" or base.hostname not in VALID_HOSTS:raise ValueError("unverified Bongdalu base")
 uri=urllib.parse.urljoin(BASE,"ajax/SoccerAjax?"+urllib.parse.urlencode(
  {"type":6,"date":day,"order":"league","timezone":0}))
 req=urllib.request.Request(uri,headers={"User-Agent":"Mozilla/5.0 (KQ247 read-only research)","Accept":"application/json","Referer":BASE})
 with urllib.request.urlopen(req,timeout=18) as response:
  target=urllib.parse.urlsplit(response.url)
  if target.scheme!="https" or target.hostname not in VALID_HOSTS:raise ValueError("untrusted redirect")
  raw=response.read(2500001)
 if not raw or len(raw)>2500000:raise ValueError("invalid response size")
 try:d=json.loads(raw)
 except (UnicodeDecodeError,json.JSONDecodeError):raise ValueError("non-JSON Bongdalu response")
 if str(d.get("ErrCode",0)) not in ("0","None"):raise ValueError("unexpected Bongdalu error")
 data=d.get("Data")
 if not isinstance(data,str) or len(data)<50:raise ValueError("missing historical fixture data")
 return uri,raw,data
def parse_ft(data,date):
 out=[];seen=set()
 for match in re.finditer(r"A\[\d+\]\s*=\s*\[([^\r\n;]*)\]\s*;?",data):
  p=fields(match.group(1))
  if len(p)<11:continue
  fixture=p[0].strip()
  if not re.fullmatch(r"\d{5,12}",fixture) or fixture in seen:continue
  try:
   status=int(p[7])
   if status!=-1:continue
   hs=int(p[8]);away=int(p[9])
   if not (0<=hs<=25 and 0<=away<=25):continue
  except (ValueError,IndexError):continue
  out.append({"fixture_id":fixture,"status":"FT","home_score":hs,"away_score":away,
              "home":p[4][:120] if len(p)>4 else None,
              "away":p[5][:120] if len(p)>5 else None,
              "source":"bongdalu_official_ajax_historical_result",
              "requested_date":date,"pre_match_odds_verified":False})
  seen.add(fixture)
 return out
def wanted(today):
 start=today-dt.timedelta(days=MAX_AGE-1)
 return [(start+dt.timedelta(days=i)).isoformat() for i in range(MAX_AGE)]
def run():
 DIR.mkdir(parents=True,exist_ok=True)
 today=dt.datetime.now(VN).date()
 days=wanted(today)
 old=load(INDEX) or {"dates":{}}
 states=old.get("dates") if isinstance(old.get("dates"),dict) else {}
 due=[day for day in days if states.get(day,{}).get("state")!="verified_ft_archive"]
 # Never retry the same broken earliest dates forever: first visit all 500 days.
 due.sort(key=lambda day:(int(states.get(day,{}).get("attempts",0)),day))
 tried=0;success=0;problems=[]
 for day in due[:BATCH]:
  tried+=1
  try:
   uri,raw,data=fetch_for_day(day)
   fixtures=parse_ft(data,day)
   if not fixtures:raise ValueError("no_verified_FT_rows")
   fingerprint=hashlib.sha256(raw).hexdigest()
   payload={"date":day,"source_url":uri,"retrieved_utc":now(),"response_sha256":fingerprint,
            "matches":fixtures,"match_count":len(fixtures),
            "historical_result_only":True,"prematch_market_verified":False,
            "never_graded_as_prelive_pick":True}
   save(DIR/(day+".json"),payload)
   states[day]={"state":"verified_ft_archive","matches":len(fixtures),"response_sha256":fingerprint}
   success+=1
  except (urllib.error.URLError,TimeoutError,ValueError,OSError) as e:
   attempts=int(states.get(day,{}).get("attempts",0))+1
   states[day]={"state":"retry_pending","attempts":attempts,
                "last_error":type(e).__name__+":"+str(e)[:130]}
   problems.append({"day":day,"error":type(e).__name__})
  save(INDEX,{"version":1,"source":"Bongdalu historical SoccerAjax",
              "asof":today.isoformat(),"window_days":MAX_AGE,"dates":states,
              "last_attempt":now()})
  time.sleep(0.2)
 verified=[s for day,s in states.items() if day in days and s.get("state")=="verified_ft_archive"]
 report={"checked_at_utc":now(),"requested_days":MAX_AGE,
         "days_with_verified_FT_archives":len(verified),
         "days_remaining_without_verified_FT":MAX_AGE-len(verified),
         "days_attempted_this_run":tried,"days_verified_this_run":success,
         "total_raw_ft_fixtures":sum(x.get("matches",0) for x in verified),
         "error_samples":problems[:10],
         "only_postmatch_data":True,
         "prematch_odds_verified":False,"production_modified":False}
 save(DIR/"status.json",report)
 print("KQ247_R55_BONGDALU_500DAY_FETCH="+json.dumps(report,ensure_ascii=False),flush=True)
def test():
 data="A[1]=[3000123,1,1,0,Home,Away,2025,9,17,3,2];"
 # Explicit parser test matching JS A-index conventions, without inventing odds.
 assert len(fields("'first, second',3"))==2
 assert len(wanted(dt.date(2026,10,15)))==500
 assert wanted(dt.date(2026,10,15))[0]=="2025-06-03"
 assert MAX_AGE==500
 assert parse_ft('A[1]=[3000123,1,1,0,"Home","Away","2025,9,17,00,00,00",-1,3,2,0];',"2025-10-17")[0]["fixture_id"]=="3000123"
 print("KQ247_R55_BONGDALU_FETCH_SELFTEST=PASS")
if __name__=="__main__":
 if "--self-test" in sys.argv:test()
 else:run()
