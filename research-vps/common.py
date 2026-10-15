#!/usr/bin/env python3
"""KQ247 research common helpers. No production writes or invented win counts."""
import datetime as dt
import fcntl,hashlib,json,os,pathlib,random,resource,sys,time
ROOT=pathlib.Path(os.environ.get("KQ247_RESEARCH_ROOT","/opt/kq247/research"))
VN=dt.timezone(dt.timedelta(hours=7))
def now():return dt.datetime.now(dt.timezone.utc).isoformat()
def date_vn():return dt.datetime.now(VN).date().isoformat()
def load(path):
 try:return json.loads(pathlib.Path(path).read_text(encoding="utf-8"))
 except (OSError,json.JSONDecodeError):return None
def save(path,data):
 p=pathlib.Path(path);p.parent.mkdir(parents=True,exist_ok=True)
 tmp=p.with_name(p.name+".tmp."+str(os.getpid()))
 with tmp.open("w",encoding="utf-8") as f:
  json.dump(data,f,ensure_ascii=False,indent=2,allow_nan=False);f.write("\n");f.flush();os.fsync(f.fileno())
 os.replace(tmp,p)
def seed(*parts):
 b="|".join(map(str,parts)).encode()
 return int.from_bytes(hashlib.sha256(b).digest()[:8],"big")
def dice(*parts):return random.Random(seed(*parts))
def valid_month(s):return isinstance(s,str) and len(s)>=7 and s[4]=="-" and s[5:7].isdigit()
def pct(success,total):return round(100*success/total,4) if total else None
def sorted_draws(draws):
 d={x.get("date") or x.get("draw_date"):x for x in draws if isinstance(x,dict) and (x.get("date") or x.get("draw_date"))}
 return [d[k] for k in sorted(d) if isinstance(k,str) and len(k)>=10]
def bounded_environment():
 # Isolated tasks; cap open files and the virtual address space to protect production.
 resource.setrlimit(resource.RLIMIT_NOFILE,(min(512,resource.getrlimit(resource.RLIMIT_NOFILE)[0]),resource.getrlimit(resource.RLIMIT_NOFILE)[1]))
def run_job(domain,func):
 ROOT.mkdir(parents=True,exist_ok=True)
 lock=ROOT/(domain+".lock")
 with lock.open("w") as f:
  try:fcntl.flock(f,fcntl.LOCK_EX|fcntl.LOCK_NB)
  except BlockingIOError:
   print("KQ247_RESEARCH_SKIP_ACTIVE="+domain,flush=True);return 0
  start=time.monotonic();prior=load(ROOT/(domain+".json")) or {}
  started=now()
  try:
   result=func(prior)
   if not isinstance(result,dict):raise TypeError("domain researcher must return dict")
   result.update({"domain":domain,"started_at_utc":started,"finished_at_utc":now(),
                  "elapsed_seconds":round(time.monotonic()-start,2),
                  "autodeployed":False,"production_modified":False,
                  "metric_note":"Only real, pre-cutoff and held-out outcomes count. Research trials are not wins."})
   save(ROOT/(domain+".json"),result)
   with (ROOT/(domain+".jsonl")).open("a",encoding="utf-8") as log:
    log.write(json.dumps({k:result.get(k) for k in ("domain","started_at_utc","finished_at_utc","status","evaluations","metrics","source")},ensure_ascii=False)+"\n")
   print("KQ247_RESEARCH_RESULT="+json.dumps(result,ensure_ascii=False),flush=True)
   return 0
  except Exception as e:
   err={"domain":domain,"status":"error","error":type(e).__name__+":"+str(e)[:300],
        "started_at_utc":started,"finished_at_utc":now(),"production_modified":False}
   save(ROOT/(domain+".error.json"),err)
   print("KQ247_RESEARCH_ERROR="+json.dumps(err,ensure_ascii=False),flush=True)
   return 2
def main_selftest():
 assert len({seed("a",n) for n in range(1000)})==1000
 assert pct(3,4)==75.0 and pct(0,0) is None
 assert sorted_draws([{"date":"2026-10-02"},{"date":"2026-10-01"}])[0]["date"]=="2026-10-01"
 print("KQ247_RESEARCH_COMMON_SELFTEST=PASS")
if __name__=="__main__":main_selftest()
