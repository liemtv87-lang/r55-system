#!/usr/bin/env python3
"""Read actual 20-match team-form & old AH history from public Bongdalu fixture pages.
Research-only; historical quotes are NOT called pre-lock odds without a timestamp.
"""
import datetime as dt,hashlib,json,os,pathlib,re,sys,time,urllib.error,urllib.request
from html.parser import HTMLParser
from common import ROOT,VN,load,save,now
SEEDS=pathlib.Path(__file__).resolve().parent/"football-h2h-seed-ids.json"
BASE="https://www.bongdalu812.com/match/h2h-"
DEST=ROOT/"football-historical-form"
MAX_BATCH=max(1,min(24,int(os.environ.get("KQ247_H2H_PAGES_PER_CYCLE","12"))))
DATE_RE=re.compile(r"(?<!\d)([0-3]?\d)/([01]?\d)/(20\d{2})(?!\d)")
SCORE_RE=re.compile(r"(?<!\d)(\d{1,2})\s*[-:]\s*(\d{1,2})(?!\d)")
class TableRows(HTMLParser):
 def __init__(self):
  super().__init__();self.in_tr=False;self.in_cell=False;self.skip_depth=0
  self.cells=[];self.buf=[];self.rows=[]
 def handle_starttag(self,tag,attrs):
  if tag in ("script","style"):self.skip_depth+=1;return
  if self.skip_depth:return
  if tag=="tr":self.in_tr=True;self.cells=[]
  if self.in_tr and tag in ("td","th"):self.in_cell=True;self.buf=[]
 def handle_data(self,data):
  if self.in_cell and not self.skip_depth:self.buf.append(data)
 def handle_endtag(self,tag):
  if tag in ("script","style"):
   self.skip_depth=max(0,self.skip_depth-1);return
  if self.skip_depth:return
  if tag in ("td","th") and self.in_cell and self.in_cell:
   self.cells.append(" ".join(" ".join(self.buf).split())[:220])
   self.in_cell=False
  elif tag=="tr" and self.in_tr:
   if len(self.cells)>=4:self.rows.append(self.cells[:20])
   self.in_tr=False
def extract(page,cutoff):
 p=TableRows();p.feed(page)
 first=cutoff-dt.timedelta(days=499)
 out=[];seen=set()
 for cells in p.rows:
  joined=" | ".join(cells)
  m=DATE_RE.search(joined)
  if not m:continue
  try:day=dt.date(int(m.group(3)),int(m.group(2)),int(m.group(1)))
  except ValueError:continue
  if day<first or day>cutoff:continue
  sm=SCORE_RE.search(joined)
  if not sm:continue
  key=(day.isoformat(),tuple(cells[:8]))
  if key in seen:continue
  seen.add(key)
  out.append({"date":day.isoformat(),"cells":cells,
              "score_displayed":sm.group(0),
              "historic_bookmaker_columns_present":bool(re.search(r"\b[01]\.\d{2}\b",joined)),
              "quote_time_pre_kickoff_verified":False})
 return out
def run():
 d=load(SEEDS)
 ids=d.get("ids",[]) if isinstance(d,dict) else []
 if not ids:raise ValueError("Missing trusted Bongdalu fixture source IDs")
 DEST.mkdir(parents=True,exist_ok=True)
 ledger=load(DEST/"index.json") or {}
 today=dt.datetime.now(VN).date()
 # 2991083 has a publicly verified Bongdalu dated 2025/2026 team-form table.
 # Use it as a parser canary before thousands of blind fixture-page requests.
 trusted_canary=["2991083","3003906","3003903"]
 ids=list(dict.fromkeys(trusted_canary+ids))
 pending=[x for x in ids if ledger.get(x,{}).get("status")!="verified_historical_form"]
 pending.sort(key=lambda x:(int(ledger.get(x,{}).get("attempts",0)),
                            0 if x=="2991083" else 1,x))
 completed=0;confirmed=0;date_union=set();errors=[]
 for fid in pending[:MAX_BATCH]:
  attempts=1+int(ledger.get(fid,{}).get("attempts",0))
  url=BASE+fid
  try:
   req=urllib.request.Request(url,headers={"User-Agent":"Mozilla/5.0 (compatible; KQ247HistoricalResearch/1.0)","Accept":"text/html"})
   with urllib.request.urlopen(req,timeout=18) as res:
    if res.url!=url:raise ValueError("unexpected redirect")
    if "html" not in (res.headers.get("Content-Type") or "").lower():raise ValueError("not html")
    raw=res.read(1200001)
   if len(raw)>1200000 or len(raw)<2000:raise ValueError("unsupported response length")
   html=raw.decode("utf-8","replace")
   rows=extract(html,today)
   if not rows:raise ValueError("no 500-day dated result rows in source tables")
   obj={"fixture_id":fid,"url":url,"retrieved_utc":now(),"raw_sha256":hashlib.sha256(raw).hexdigest(),
        "historical_rows":rows,"date_count":len(set(r["date"] for r in rows)),
        "games_count":len(rows),"h2h_not_required":True,
        "features_timestamped_before_fixture":False,"production_modified":False}
   save(DEST/(fid+".json"),obj)
   ledger[fid]={"status":"verified_historical_form","rows":len(rows),"dates":obj["date_count"],"attempts":attempts}
   confirmed+=1;date_union.update(r["date"] for r in rows)
  except (urllib.error.URLError,TimeoutError,ValueError,OSError) as e:
   ledger[fid]={"status":"retry_pending","attempts":attempts,"error":type(e).__name__+":"+str(e)[:115]}
   errors.append({"id":fid,"error":type(e).__name__+":"+str(e)[:75]})
  completed+=1
  save(DEST/"index.json",ledger)
  time.sleep(.6)
 finished=[v for v in ledger.values() if v.get("status")=="verified_historical_form"]
 report={"checked_at_utc":now(),"trusted_source_fixture_ids":len(ids),"tried_in_batch":completed,
         "pages_verified_in_batch":confirmed,"pages_verified_total":len(finished),
         "archived_rows_total":sum(v["rows"] for v in finished),
         "last_batch_unique_history_dates":len(date_union),"errors":errors[:8],
         "odds_time_before_kickoff_confirmed":0,
         "not_a_500_day_prelock_backtest":True,"production_modified":False}
 save(DEST/"status.json",report)
 print("KQ247_R55_HISTORICAL_FORM="+json.dumps(report,ensure_ascii=False),flush=True)
def test():
 sample="""<table><tr><td>ENG PR</td><td>27/09/2025</td><td>Chelsea</td>
 <td>1-3 (1-0)</td><td>Brighton</td><td>0.8</td><td>0.5/1</td></tr></table>"""
 rows=extract(sample,dt.date(2026,10,15))
 assert len(rows)==1 and rows[0]["date"]=="2025-09-27"
 assert "2991083" in ["2991083","3003906"]
 assert rows[0]["features_timestamped_before_fixture"] if "features_timestamped_before_fixture" in rows[0] else not rows[0]["quote_time_pre_kickoff_verified"]
 assert extract(sample,dt.date(2024,10,15))==[]
 print("KQ247_R55_HISTORICAL_FORM_SELFTEST=PASS")
if __name__=="__main__":
 if "--self-test" in sys.argv:test()
 else:run()
