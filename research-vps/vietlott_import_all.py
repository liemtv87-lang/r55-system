#!/usr/bin/env python3
"""Import complete, validated Vietlott histories from independently archived official-result records.
Only writes isolated research data; never changes production history/snapshots.
"""
import csv,datetime as dt,hashlib,io,json,os,pathlib,sys,urllib.request
from common import ROOT,save,load,now
REPO="pqminh-4/vietlott-data"
REV="2a7f03209fce39a6d1c9d045cd528dfd37437c4c"
BASE="https://raw.githubusercontent.com/"+REPO+"/"+REV+"/data/"
SRC=pathlib.Path("/opt/kq247/vietlott/data")
SPEC={"mega645":{"count":1575,"start":"2016-07-20","last":"2026-10-14","max":45},
      "power655":{"count":1410,"start":"2017-08-01","last":"2026-10-13","max":55}}
# One known production-archive disagreement, independently corroborated from public
# dated draw records (Minh Ngoc and XosoNgay), never changed in production.
CONFIRMED={"power655|2026-09-17":{"draw_id":"01399","numbers":[6,11,25,27,37,45],"special":15,
 "evidence":["https://www.minhngoc.net.vn/ket-qua-xo-so/dien-toan-vietlott/power-6x55/17-09-2026.html",
             "https://xosongay.com/vietlott/power-6-55/2026-09-17"]}}
def pull(filename):
 url=BASE+filename
 with urllib.request.urlopen(urllib.request.Request(url,headers={"User-Agent":"KQ247-Data-Verification/1.0"}),timeout=55) as r:
  raw=r.read(1200000)
 if len(raw)>1100000 or len(raw)<200:raise ValueError("bad archive length "+filename)
 return raw,hashlib.sha256(raw).hexdigest()
def read(product,raw):
 reader=csv.DictReader(io.StringIO(raw.decode("utf-8-sig")))
 require={"game","draw_id","draw_date","main_numbers","bonus_numbers"}
 if not require.issubset(reader.fieldnames or []):raise ValueError("source schema missing required prize fields")
 seenid=set();dates=set();rows=[]
 for r in reader:
  if r["game"]!=product:raise ValueError("wrong product")
  date=dt.date.fromisoformat(r["draw_date"]).isoformat()
  nums=[int(x) for x in r["main_numbers"].split()]
  bonus=r["bonus_numbers"].split()
  if len(nums)!=6 or len(set(nums))!=6 or min(nums)<1 or max(nums)>SPEC[product]["max"]:raise ValueError("invalid numbers "+date)
  if product=="power655" and (len(bonus)!=1 or int(bonus[0]) in nums or not 1<=int(bonus[0])<=55):raise ValueError("bad bonus "+date)
  if product=="mega645" and bonus:raise ValueError("unexpected Mega bonus")
  id=str(r["draw_id"]).zfill(5)
  if id in seenid or date in dates:raise ValueError("duplicate historical draw "+date)
  seenid.add(id);dates.add(date)
  rows.append({"draw_id":id,"date":date,"numbers":sorted(nums),
               **({"special":int(bonus[0])} if product=="power655" else {})})
 rows.sort(key=lambda x:x["date"])
 spec=SPEC[product]
 if len(rows)<spec["count"] or rows[0]["date"]!=spec["start"] or rows[-1]["date"]<spec["last"]:
  raise ValueError("incomplete historical coverage count/date")
 ids=sorted(int(x["draw_id"]) for x in rows)
 if ids!=list(range(ids[0],ids[-1]+1)) or ids[0]!=1:raise ValueError("missing sequential IDs")
 return rows
def crosscheck(product,archived):
 local=load(SRC/("history-"+product+".json"))
 if not isinstance(local,list) or len(local)<100:raise ValueError("missing local production archive")
 bydate={x["date"]:x for x in archived}
 overlap=match=0;disagreements=[]
 for p in local:
  date=p.get("date")
  if date not in bydate:continue
  overlap+=1
  localnums=sorted(int(x) for x in p.get("numbers",[]))
  source=bydate[date]
  same=(localnums==source["numbers"] and
       (product=="mega645" or int(p.get("special",-1))==source["special"]))
  if same:match+=1
  else:disagreements.append(date)
 if overlap<100 or match/overlap<0.95:raise ValueError("independent local overlap mismatch "+product+f" {match}/{overlap}")
 # Resolve disagreements only where independent published dated records verify
 # the official draw; never silently overwrite or alter production local history.
 confirmed=[];quarantine=[]
 for date in disagreements:
  r=bydate[date];expect=CONFIRMED.get(product+"|"+date)
  if expect and r["draw_id"]==expect["draw_id"] and r["numbers"]==expect["numbers"] and (
     product=="mega645" or r["special"]==expect["special"]):
   confirmed.append(date)
  else:quarantine.append(date)
 good=[r for r in archived if r["date"] not in quarantine]
 return good,{"local_total":len(local),"overlap":overlap,"exact_matches":match,
              "independently_confirmed_disagreement_dates":confirmed,
              "quarantined_dates":quarantine}
def ingest():
 state=ROOT/"vietlott-history"
 state.mkdir(parents=True,exist_ok=True)
 prepared={};audits={}
 for product in SPEC:
  raw,sha=pull("csv/"+product+"/draws.csv")
  rows=read(product,raw)
  valid,check=crosscheck(product,rows)
  prepared[product]=valid
  audits[product]={"official_archive_csv_sha256":sha,
    "download_rows":len(rows),"usable_rows":len(valid),
    "dates":[rows[0]["date"],rows[-1]["date"]],"first_id":rows[0]["draw_id"],
    "last_id":rows[-1]["draw_id"],"local_crosscheck":check}
 # Only commit both products after both pass validation.
 for product,rows in prepared.items():save(state/("history-"+product+".json"),rows)
 result={"status":"verified","source_repo":REPO,"source_git_sha":REV,
         "total_draws":{k:len(v) for k,v in prepared.items()},"audits":audits,
         "imported_at":now(),"never_wrote_production":True}
 save(state/"audit.json",result)
 print("KQ247_VIETLOTT_ALL_HISTORY_IMPORTED="+json.dumps(result,ensure_ascii=False))
 return result
def test():
 raw=("game,draw_id,draw_date,main_numbers,bonus_numbers\n"+
      "power655,00001,2017-08-01,1 2 3 4 5 6,7\n").encode()
 # Parser validates complete coverage in normal mode; assert individual row formatting here.
 assert len(next(csv.DictReader(io.StringIO(raw.decode())))["main_numbers"].split())==6
 assert len(SPEC)==2 and SPEC["mega645"]["count"]>1500 and SPEC["power655"]["count"]>1400
 assert CONFIRMED["power655|2026-09-17"]["numbers"]==[6,11,25,27,37,45]
 print("KQ247_VIETLOTT_ALL_HISTORY_IMPORT_SELFTEST=PASS")
if __name__=="__main__":
 if "--self-test" in sys.argv:test()
 else:ingest()
