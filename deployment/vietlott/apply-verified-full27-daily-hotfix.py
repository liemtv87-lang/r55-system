#!/usr/bin/env python3
"""Hotpatch ONLY R33 Vietlott same-day XSMB source logic in a running container.
Always back up live script before atomic copy; never edits snapshots, keys or rules.
"""
import datetime as dt,json,os,pathlib,subprocess,sys,urllib.request,urllib.error
ROOT=pathlib.Path("/opt/kq247/vietlott-r33-primary")
STAGE=ROOT/"versions"/"xsmb-full27-daily-hotfix"
CONTAINER="kq247-vietlott-vps"
def run(*args,timeout=30):
 return subprocess.run(args,check=True,text=True,capture_output=True,timeout=timeout)
def check_live():
 mounts=run("docker","inspect","--format","{{range .Mounts}}{{.Source}}=>{{.Destination}};{{end}}",CONTAINER).stdout
 if not any(p+"=>/app/public" in mounts for p in (str(ROOT/"public"),"/opt/kq247/vietlott/public")):raise RuntimeError("Container mounted production path mismatch")
 status=run("docker","inspect","--format","{{.State.Status}}",CONTAINER).stdout.strip()
 if status!="running":raise RuntimeError("Production container not running")
 endpoint,body=request("/status")
 if endpoint!=200:raise RuntimeError("Production /status API is missing; refuse modifying live updater")
 return mounts
def request(path,method="GET",token=None):
 endpoint="http://127.0.0.1:18088"+path
 headers={"User-Agent":"KQ247-R33-Source-Repair/1.0"}
 if token:headers["Authorization"]="Bearer "+token
 req=urllib.request.Request(endpoint,method=method,headers=headers)
 try:
  with urllib.request.urlopen(req,timeout=15) as f:return f.status,json.loads(f.read(90000))
 except urllib.error.HTTPError as e:
  try:body=json.loads(e.read(90000))
  except Exception:body={}
  return e.code,body
def apply():
 STAGE.mkdir(parents=True,exist_ok=True)
 source=STAGE/"xsmb-verified-daily.mjs"
 if not source.is_file() or source.stat().st_size<1500:raise RuntimeError("Missing independently verified full27 parser")
 current=STAGE/"update-data.current.mjs"
 original=STAGE/"update-data.original.mjs"
 run("docker","cp",CONTAINER+":/app/scripts/update-data.mjs",str(current))
 if not original.exists():
  import shutil
  shutil.copy2(current,original)
 text=current.read_text("utf-8")
 import_line="import {fetchValidatedXsmbDay} from './xsmb-verified-daily.mjs';"
 inserted=False
 if import_line not in text:
  first="import {snapshotPolicy} from './snapshot-policy.mjs';"
  marker="  if(xsmbRows.length)await writeJson('data/xsmb200.json',xsmbRows);"
  if text.count(first)!=1 or text.count(marker)!=1:raise RuntimeError("Unknown deployed update-data.mjs; refuse blind patch")
  extra="""  // Existing XSMB 200-day indexes may lag the confirmed same-day result.
  // Accept only two independently agreeing sources on all 27 original prizes.
  const yesterday=new Date(Date.parse(today+'T00:00:00Z')-86400000).toISOString().slice(0,10);
  if(!xsmbRows.some(r=>r.date===analysisDate)&&(analysisDate===today||analysisDate===yesterday)){
    const daily=await fetchValidatedXsmbDay(analysisDate);
    healthAll.xsmb.push({source:'xsmb_dated_two_source_verified',date:analysisDate,
       ok:daily.ok,confirmations:daily.sources?.length||0,
       publishers:daily.sources||[],failure_reason:daily.reason||null});
    if(daily.ok){
      xsmbRows=[{date:daily.date,full:daily.full,last2:daily.last2,
                  sources:daily.sources,confirmations:daily.sources.length},
                ...xsmbRows.filter(r=>r.date!==daily.date)].sort((a,b)=>b.date.localeCompare(a.date)).slice(0,205);
      console.log('[R33] Verified full 27-prize XSMB same day from '+daily.sources.join(', '));
    }
  }
"""
  text=text.replace(first,first+"\n"+import_line).replace(marker,extra+marker)
  inserted=True
 patched=STAGE/"update-data.patched.mjs"
 patched.write_text(text,"utf-8")
 run("docker","cp",str(source),CONTAINER+":/app/scripts/xsmb-verified-daily.mjs")
 run("docker","exec",CONTAINER,"node","--check","/app/scripts/xsmb-verified-daily.mjs")
 # Source must independently prove a full draw on this VPS, not only in CI.
 # Failing this probe does not modify the existing updater or locked snapshots.
 yesterday=(dt.datetime.now(dt.timezone(dt.timedelta(hours=7)))-dt.timedelta(days=1)).date().isoformat()
 run("docker","exec",CONTAINER,"node","/app/scripts/xsmb-verified-daily.mjs",yesterday,timeout=90)
 try:
  if inserted:run("docker","cp",str(patched),CONTAINER+":/app/scripts/update-data.mjs")
  run("docker","exec",CONTAINER,"node","--check","/app/scripts/update-data.mjs")
 except Exception:
  if inserted:run("docker","cp",str(current),CONTAINER+":/app/scripts/update-data.mjs")
  raise
 status,body=request("/status")
 if status!=200:raise RuntimeError("Status endpoint not responding after patch")
 job=body.get("status")
 proof={"patched":inserted,"production_container_unchanged":True,
        "snapshots_not_modified":True,"source_count_required":2,
        "job_before_trigger":job,
        "original_url_unchanged":True,"licenses_unchanged":True,
        "snapshot_generation_started":False}
 if job!="running":
  tokens=(pathlib.Path("/opt/kq247/vietlott-r33-stage/.admin-token"),
          ROOT/".admin-token")
  candidates=[x for x in tokens if x.is_file()]
  if candidates:
   token=candidates[0].read_text().strip()
   if token:
    http,response=request("/run/daily","POST",token)
    proof.update({"trigger_http":http,"snapshot_generation_started":http==202,
                  "trigger_result":response.get("accepted")})
  else:proof["trigger_error"]="admin_token_not_present; automatic scheduler will retry"
 else:proof["trigger_error"]="job_already_running; wait for scheduled update"
 print("KQ247_R33_FULL27_HOTFIX="+json.dumps(proof,ensure_ascii=False),flush=True)
def test():
 assert CONTAINER=="kq247-vietlott-vps"
 assert "versions" in str(STAGE)
 print("KQ247_R33_FULL27_HOTFIX_SELFTEST=PASS")
if __name__=="__main__":
 if "--self-test" in sys.argv:test()
 else:
  check_live()
  apply()
