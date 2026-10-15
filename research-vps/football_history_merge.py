#!/usr/bin/env python3
"""Join verified real R55 settlement records into a dated 500-day research ledger.
No synthetic fixture or implied settlement; production snapshots untouched.
"""
import datetime as dt,json,pathlib,sys
from common import ROOT,load,save,now
BASE=pathlib.Path("/opt/kq247/research/inputs")
OUTPUT=BASE/"football-grades-combined.json"
VALID={"win","loss","half_win","half_loss","push"}
def merge(inputs):
 byday={};issues=[]
 for source,data in inputs:
  records=data.get("records",[]) if isinstance(data,dict) else []
  for record in records:
   p=record.get("payload",record) if isinstance(record,dict) else {}
   if not isinstance(p,dict):continue
   day=p.get("day")
   try:dt.date.fromisoformat(day)
   except (ValueError,TypeError):continue
   raw=p.get("detail",[])
   if not isinstance(raw,list):continue
   valid=[r for r in raw if isinstance(r,dict) and r.get("result") in VALID and r.get("type") in ("AH","OU") and r.get("id")]
   if not valid:continue
   current=byday.get(day)
   if current is None or len(valid)>len(current["payload"]["detail"]):
    byday[day]={"scope":"r55_daily_grade_"+day,"payload":{"day":day,"detail":valid,
                "due":p.get("due"),"total":p.get("total")},"source_file":source}
   elif len(valid)==len(current["payload"]["detail"]) and valid!=current["payload"]["detail"]:
    issues.append({"day":day,"conflicting_sources":[source,current["source_file"]]})
 dates=sorted(byday)
 return {"records":[byday[k] for k in dates],
         "validated_days":len(dates),
         "dates":dates,
         "conflicts":issues,
         "incomplete_500_day_window":len(dates)<500,
         "created_at_utc":now()}
def run():
 names=["football-grades.json","football-summary.json"]
 names.extend(p.name for p in sorted((BASE/"daily-grades").glob("*.json")) if p.is_file())
 inputs=[]
 for name in names:
  path=BASE/name if "/" not in name and name in ("football-grades.json","football-summary.json") else BASE/"daily-grades"/name
  item=load(path)
  if item:inputs.append((name,item))
 merged=merge(inputs)
 if merged["conflicts"]:raise ValueError("conflicting real grade sources; manual resolution required")
 save(OUTPUT,merged)
 print("KQ247_FOOTBALL_REAL_GRADE_MERGE="+json.dumps({
       "days":merged["validated_days"],"dates":merged["dates"],
       "500_day_complete":not merged["incomplete_500_day_window"],
       "sources":len(inputs),"production_modified":False},ensure_ascii=False))
def test():
 a={"records":[{"payload":{"day":"2026-10-11","detail":[{"id":"A","type":"AH","result":"win"}]}}]}
 b={"records":[{"payload":{"day":"2026-10-11","detail":[{"id":"A","type":"AH","result":"win"},{"id":"B","type":"OU","result":"loss"}]}}]}
 d=merge([("short",a),("long",b)])
 assert d["validated_days"]==1 and len(d["records"][0]["payload"]["detail"])==2
 assert d["incomplete_500_day_window"] and not d["conflicts"]
 print("KQ247_FOOTBALL_GRADE_MERGE_SELFTEST=PASS")
if __name__=="__main__":
 if "--self-test" in sys.argv:test()
 else:run()
