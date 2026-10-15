#!/usr/bin/env python3
"""Import EXACTLY 2000 genuine 27-prize XSMB drawings into isolated research state.
Data remains read-only to production, with Git blob pin and local 505-draw cross-check.
"""
import csv,datetime as dt,hashlib,io,json,os,pathlib,sys,urllib.request
from common import ROOT,save,load,now
REVISION="19b86599566503b0eca5b6dc638b8d9a5d42fee7"
SOURCE_URL=("https://raw.githubusercontent.com/khiemdoan/"
            "vietnam-lottery-xsmb-analysis/"+REVISION+"/data/xsmb.csv")
SOURCE_GIT_BLOB="f1c3be4a675f14e1988332d4cd0003a85064f566"
LOCAL_VERIFIED=pathlib.Path("/opt/kq247/lottery-daily-staging/xsmb-505-all27-prizes-20261014.json")
TARGET=ROOT/"xsmb-2000-full27.json"
REPORT=ROOT/"xsmb-2000-import-audit.json"
COUNT=2000
# Each of 27 prizes is an independent full positional number, not its last two digits.
PRIZES=[("special",5),("prize1",5)]+[(f"prize2_{i}",5) for i in range(1,3)]+[
 (f"prize3_{i}",5) for i in range(1,7)]+[(f"prize4_{i}",4) for i in range(1,5)]+[
 (f"prize5_{i}",4) for i in range(1,7)]+[(f"prize6_{i}",3) for i in range(1,4)]+[
 (f"prize7_{i}",2) for i in range(1,5)]
assert len(PRIZES)==27
def normalize_csv(src):
 with io.StringIO(src.decode("utf-8-sig")) as f:
  reader=csv.DictReader(f)
  expected=["date"]+[key for key,_ in PRIZES]
  if reader.fieldnames!=expected:
   raise ValueError("unexpected CSV schema (must have ALL 27 original prize positions)")
  rows={}
  for row in reader:
   date=row.get("date")
   try:
    dt.date.fromisoformat(date)
    vals=[]
    for key,width in PRIZES:
     value=row.get(key)
     if not isinstance(value,str) or not value.isascii() or not value.isdecimal() or len(value)>width:
      raise ValueError(f"invalid {key} at {date}")
     vals.append(value.zfill(width))
    if date in rows:raise ValueError("duplicate draw "+date)
    rows[date]=vals
   except (TypeError,ValueError) as e:
    raise ValueError("invalid full-prize draw "+str(date)+":"+str(e))
 return rows
def crosscheck(parsed,local):
 if not isinstance(local,dict) or len(local)<400:
  raise ValueError("trusted 505-draw full-27 baseline missing")
 mismatches=[];matched=0;overlap=0
 for date,values in local.items():
  if date not in parsed:continue
  overlap+=1
  trusted=[str(v).zfill(width) for v,(_,width) in zip(values,PRIZES)] if isinstance(values,list) and len(values)==27 else []
  if trusted==parsed[date]:matched+=1
  else:mismatches.append(date)
 if overlap<450 or matched/overlap<0.98 or (max(local.keys()) in mismatches):
  raise ValueError(f"cross-check insufficient: matched={matched}/{overlap}, first mismatches={mismatches[:12]}")
 return {"trusted_draws":len(local),"overlap":overlap,"exact_matches":matched,
         "mismatch_count":len(mismatches),"mismatch_dates":mismatches[:15]}
def git_sha1(raw):
 return hashlib.sha1(b"blob "+str(len(raw)).encode()+b"\0"+raw).hexdigest()
def import_2000():
 ROOT.mkdir(parents=True,exist_ok=True)
 req=urllib.request.Request(SOURCE_URL,headers={"User-Agent":"KQ247-Research-Importer/1.0"})
 with urllib.request.urlopen(req,timeout=50) as response:
  payload=response.read(2500000)
  if len(payload)<100000 or len(payload)>2200000:
   raise ValueError("unexpected source size")
 actual=git_sha1(payload)
 if actual!=SOURCE_GIT_BLOB:raise ValueError("source SHA mismatch:"+actual)
 full=normalize_csv(payload)
 local=load(LOCAL_VERIFIED)
 verification=crosscheck(full,local)
 cutoff=max(local.keys())
 dates=sorted(date for date in full if date<=cutoff)
 if len(dates)<COUNT:raise ValueError(f"only {len(dates)} complete historical draws")
 chosen=dates[-COUNT:]
 if chosen[-1]!=cutoff:raise ValueError("latest locally verified draw absent")
 archive={date:full[date] for date in chosen}
 # Resolve sparse source conflicts against the 505-draw local verified archive.
 # Never use the conflicting upstream values in a training or grading window.
 reconciled=[]
 for date,values in local.items():
  if date not in archive:continue
  trusted=[str(v).zfill(width) for v,(_,width) in zip(values,PRIZES)]
  if len(trusted)!=27 or any(len(v)!=width or not v.isdecimal() for v,(_,width) in zip(trusted,PRIZES)):
   raise ValueError("trusted overlap has malformed full positional prizes at "+date)
  if archive[date]!=trusted:
   archive[date]=trusted
   reconciled.append(date)
 if len(reconciled)!=verification["mismatch_count"]:
  raise ValueError("cross-check conflict reconciliation count differs")
 if len(archive)!=COUNT or any(len(v)!=27 for v in archive.values()):
  raise ValueError("incomplete draw coverage")
 selected=(date+"|"+",".join(v) for date,v in archive.items())
 normalized_sha=hashlib.sha256("\n".join(selected).encode()).hexdigest()
 audit={"status":"verified_import","imported_at_utc":now(),"source":SOURCE_URL,
        "source_commit":REVISION,"source_blob_sha1":actual,
        "source_total_draws":len(full),"research_draws":len(archive),
        "oldest_date":chosen[0],"newest_date":chosen[-1],
        "full_prizes_per_draw":27,"all_digit_positions_preserved":True,
        "missing_dates_allowed_for_lottery_holidays":True,
        "local_overlap":verification,"trusted_archive_overrides":reconciled,
        "trusted_archive_mismatch_resolved":len(reconciled),
        "post_reconciliation_overlap_exact_matches":verification["overlap"],
        "normalized_sha256":normalized_sha,
        "backtest_no_future_leakage":True,"production_modified":False}
 save(TARGET,archive)
 save(REPORT,audit)
 print("KQ247_XSMB_2000_IMPORT="+json.dumps(audit,ensure_ascii=False))
 return audit
def selftest():
 row={"date":"2026-10-14"}
 for key,width in PRIZES:row[key]="1"
 output=io.StringIO()
 writer=csv.DictWriter(output,fieldnames=["date"]+[key for key,_ in PRIZES])
 writer.writeheader();writer.writerow(row)
 x=normalize_csv(output.getvalue().encode())
 assert len(x["2026-10-14"])==27
 assert x["2026-10-14"][0]=="00001"
 assert x["2026-10-14"][10]=="0001"
 assert x["2026-10-14"][-1]=="01"
 assert x["2026-10-14"][22]=="001"
 print("KQ247_XSMB_2000_IMPORT_SELFTEST=PASS")
if __name__=="__main__":
 if "--self-test" in sys.argv:selftest()
 else:import_2000()
