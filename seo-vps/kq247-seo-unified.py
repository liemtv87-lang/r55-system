#!/usr/bin/env python3
"""KQ247 unified SEO supervisor. Five-minute health check, hourly genuine SEO audit.

Keeps distinct SQLite checkpoints / form-submission history. Does not post itself
or restart any unrelated KQ247 process or container.
"""
import concurrent.futures
import datetime as dt
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import time

ROOT=Path("/opt/kq247/seo-unified")
PUBLIC=Path("/opt/kq247/deployment/football-original/public")
REPORT=PUBLIC/"seo-unified-status.json"
STATE=ROOT/"last-successful-hour"
DISCOVERY="/opt/pwremote/kq247-backlink-background/kq247-backlink-background-discovery-20261014.py"
SERVICES=(
 "kq247-seo-groups.service",
 "kq247-seo-indexnow.service",
 "kq247-seo-backlinks.service",
 "kq247-organic-10k.service",
 "kq247-telegram-playwright.service",
)
GROUPS=("football","lottery","channel")

def utcnow():
 return dt.datetime.now(dt.timezone.utc)

def run_cmd(args,timeout=330):
 try:
  r=subprocess.run(args,text=True,capture_output=True,timeout=timeout,check=False)
  return {"ok":r.returncode==0,"exit":r.returncode,
          "out":r.stdout[-550:],"err":r.stderr[-250:]}
 except subprocess.TimeoutExpired:
  return {"ok":False,"reason":"timeout"}
 except Exception as e:
  return {"ok":False,"reason":type(e).__name__}

def alive_processes():
 """Check exact script argument; do not match shell wrapper / grep / systemctl."""
 matches=[]
 for proc in Path("/proc").iterdir():
  if not proc.name.isdigit():continue
  try:
   args=(proc/"cmdline").read_bytes().decode("utf8","replace").split("\0")
   if DISCOVERY in args and "--watch" in args:
    matches.append(int(proc.name))
  except (OSError,ValueError):pass
 return sorted(matches)

def json_file(path):
 try:return json.loads(Path(path).read_text(encoding="utf-8"))
 except (ValueError,OSError):return {}

def atomic_json(path,obj):
 path.parent.mkdir(parents=True,exist_ok=True)
 tmp=path.with_suffix(".tmp")
 tmp.write_text(json.dumps(obj,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
 os.replace(tmp,path)

def age_minutes(path):
 try:return round((time.time()-Path(path).stat().st_mtime)/60,1)
 except OSError:return None

def collect(now,services,discovery_pids,discovery_recovery):
 base=Path("/opt/pwremote/kq247-backlink-background")
 scan=json_file(base/"latest.json")
 submission=json_file(base/"bulk-posts.json")
 evidence=json_file(PUBLIC/"seo-backlinks-status.json")
 playwright=json_file(PUBLIC/"seo-hourly-playwright-status.json")
 return {
  "checked_at_utc":now.isoformat(),"date_vn":(now+dt.timedelta(hours=7)).date().isoformat(),
  "target_groups":["https://t.me/keochuyengia79","https://t.me/xsbm999","https://t.me/tooldudoan999"],
  "discovery":{"running":bool(discovery_pids),"processes":len(discovery_pids),
    "age_minutes":age_minutes(base/"latest.json"),
    "inventory_lines_read_total":scan.get("inventory_lines_read_total",0),
    "url_records_actually_read_total":scan.get("url_records_actually_read_total",0),
    "unique_hosts_discovered":scan.get("unique_hosts_discovered",0),
    "hosts_by_status":scan.get("hosts_by_status",{})},
  "submission":{"report_age_minutes":age_minutes(base/"bulk-posts.json"),
    "counts":submission.get("counts",{}),
    "verified_new_public_links_in_submitter":submission.get("verified_new_public_links",0)},
  "verification":{"report_age_minutes":age_minutes(PUBLIC/"seo-backlinks-status.json"),
    "football_verified_published":evidence.get("goals",{}).get("football",{}).get("verified_published",0),
    "lottery_verified_published":evidence.get("goals",{}).get("lottery",{}).get("verified_published",0),
    "channel_verified_published":evidence.get("goals",{}).get("channel",{}).get("verified_published",0),
    "new_links_last_hour":evidence.get("new_links_last_hour",0),
    "playwright_new_verified_this_hour":playwright.get("verified_new_this_hour",0)},
  "services":services,
  "discovery_recovery":discovery_recovery,
  "requested_new_backlinks_per_hour":100,
  "goal_policy":"Target, NOT attained. Never infer published backlinks from URL scan or submission counts.",
  "note":"Source candidates and submitted forms are not published backlinks. Automatic submissions only on opt-in, free/public, eligible directories."
 }

def accumulate_real_hourly_growth(hour, payload):
 """Count newly OBSERVED records, never infer publications from scan volume.

 Uses per-metric high water across hours to avoid recounting old postings after
 a source temporarily becomes unavailable. The first run establishes baseline.
 """
 p=ROOT/"verified-hourly-counters.json"
 prior=json_file(p)
 current={
  "hosts":int(payload["discovery"]["unique_hosts_discovered"] or 0),
  "attempt_records":sum(int(v or 0) for v in payload["submission"]["counts"].values()),
  "football_verified":int(payload["verification"]["football_verified_published"] or 0),
  "lottery_verified":int(payload["verification"]["lottery_verified_published"] or 0),
  "channel_verified":int(payload["verification"]["channel_verified_published"] or 0),
 }
 if not prior.get("high_water"):
  growth={k:0 for k in current}
  initialized=True
  high=current.copy()
 else:
  peak=prior["high_water"]
  growth={k:max(0,v-int(peak.get(k,0))) for k,v in current.items()}
  high={k:max(v,int(peak.get(k,0))) for k,v in current.items()}
  initialized=False
 previous_growth=prior.get("hour_growth",{}) if prior.get("hour")==hour else {}
 total={k:int(previous_growth.get(k,0))+v for k,v in growth.items()}
 state={"hour":hour,"high_water":high,"hour_growth":total,
        "baseline_created_now":initialized,
        "updated_at_utc":utcnow().isoformat()}
 atomic_json(p,state)
 return {
  "hour_utc":hour,
  "new_source_hosts_observed":total["hosts"],
  "new_submission_records_observed":total["attempt_records"],
  "new_verified_public_backlinks":total["football_verified"]+total["lottery_verified"]+total["channel_verified"],
  "verified_public_backlinks_by_group":{"football":total["football_verified"],
                                       "lottery":total["lottery_verified"],"channel":total["channel_verified"]},
  "baseline_created_now":initialized,
  "counting_policy":"Only positive increases over previously observed high-water counts; not claimed scan volume, pending moderation or click counts."
 }

def main():
 if "--self-test" in sys.argv:
  assert len(SERVICES)==5 and len(set(SERVICES))==5
  assert GROUPS==("football","lottery","channel")
  assert "kq247-football" not in " ".join(SERVICES)
  assert "hosts" in {"hosts":0}
  print("SEO_UNIFIED_OFFLINE_SELFTEST=PASS")
  return
 ROOT.mkdir(parents=True,exist_ok=True)
 now=utcnow()
 hour=now.strftime("%Y-%m-%dT%H")
 try:previous=STATE.read_text().strip()
 except OSError:previous=""
 # A single hourly/health timer owns monitoring. Adopt the existing scanner;
 # start only its isolated watchdog when the real exact --watch process is absent.
 discovery_pids=alive_processes()
 discovery_recovery={"ok":True,"reason":"already_running"}
 if not discovery_pids:
  discovery_recovery=run_cmd(["/bin/bash","/opt/pwremote/kq247-backlink-background/ensure-worker.sh"],42)
  discovery_pids=alive_processes()
 # Restore only the isolated opt-in directory submitter if it unexpectedly stopped.
 # Keep its SQLite submission dedup ledger intact; no general Docker restart.
 poster_check=run_cmd(["docker","inspect","-f","{{.State.Running}}","seo-kq247-opt-in-directory"],8)
 poster_running=poster_check.get("ok") and poster_check.get("out","").strip()=="true"
 if not poster_running and poster_check.get("ok"):
  run_cmd(["docker","start","seo-kq247-opt-in-directory"],25)
  poster_check=run_cmd(["docker","inspect","-f","{{.State.Running}}","seo-kq247-opt-in-directory"],8)
  poster_running=poster_check.get("ok") and poster_check.get("out","").strip()=="true"
 results={}
 if previous!=hour:
  with concurrent.futures.ThreadPoolExecutor(max_workers=len(SERVICES)) as pool:
   futures={pool.submit(run_cmd,["systemctl","start",name],310):name for name in SERVICES}
   for task in concurrent.futures.as_completed(futures):
    results[futures[task]]=task.result()
  all_ok=all(x.get("ok") for x in results.values())
  if all_ok:
   STATE.write_text(hour+"\n")
 else:
  all_ok=True
  results={"hourly_actions":"already_completed_this_hour"}
 payload=collect(now,results,discovery_pids,discovery_recovery)
 payload["poster_running"]=bool(poster_running)
 payload["hourly_complete"]=all_ok
 payload["hourly_window_utc"]=hour
 payload["supervisor_active"]=bool(discovery_pids)
 payload["one_vps_timer"]="kq247-seo-unified.timer"
 payload["hourly_delta"]=accumulate_real_hourly_growth(hour,payload)
 # An older installer might be invoked after a source update. Keep one SEO
 # schedule by reconciling exact known legacy timers on each healthy tick.
 old_timers=(
  "kq247-seo-groups.timer",
  "kq247-seo-indexnow.timer",
  "kq247-seo-backlinks.timer",
  "kq247-organic-10k.timer",
  "kq247-telegram-playwright.timer",
  "kq247-backlink-discovery-watchdog.timer",
 )
 deduplicated={}
 if all_ok and run_cmd(["systemctl","is-active","--quiet","kq247-seo-unified.timer"],8).get("ok"):
  for unit in old_timers:
   if run_cmd(["systemctl","is-active","--quiet",unit],8).get("ok"):
    deduplicated[unit]=run_cmd(["systemctl","disable","--now",unit],15).get("ok")
 payload["duplicate_timers_disabled"]=deduplicated
 atomic_json(REPORT,payload)
 # Durable once-per-hour report: true observed counts, not claims of future reach.
 if all_ok:
  hour_path=ROOT/"hourly"/(hour+".json")
  atomic_json(hour_path,payload)
 print("SEO_UNIFIED_STATUS="+json.dumps(payload,ensure_ascii=False))
 if not payload["supervisor_active"]:
  raise SystemExit("discovery service missing")
 if not all_ok:
  raise SystemExit("at least one hourly SEO audit service failed; next 5-minute tick retries")

if __name__=="__main__":
 main()
