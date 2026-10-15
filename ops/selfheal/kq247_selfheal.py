#!/usr/bin/env python3
"""KQ247 isolated, bounded, audit-logged self-healing. No docker stop/restart/deploy.
Each --scope owns only explicitly classified enabled timers and production containers.
"""
import argparse
import datetime as dt
import fcntl
import json
import os
from pathlib import Path
import subprocess
import sys
import time
import urllib.request
import urllib.error

ROOT = Path("/opt/kq247/ops/selfheal")
STATE = ROOT / "state"
SCOPES = ("football", "xs", "vietlott", "bots", "sales", "seo-web", "seo-telegram", "research", "ops")
KNOWN_CONTAINERS = {
    "football": ("kq247-football-staging", "kq247-football-native", "kq247-football-original",
                 "kq247-football-preview", "kq247-football-cache"),
    "xs": ("kq247-lottery-original", "kq247-xs-36-reader", "kq247-xsmb-snapshot-reader"),
    "vietlott": ("kq247-vietlott-vps",),
    "bots": ("kq247-lottery-bot", "kq247-r55-group-bot"),
    "sales": ("kq247-sales-vps", "kq247-sales-bot-primary"),
    "seo-web": ("seo-kq247-opt-in-directory",),
    "seo-telegram": (),
    "research": (),
    "ops": (),
}
# Only enabled units are eligible for repair. Disabled units are NEVER re-enabled.
def classify_timer(name):
    if name.startswith("kq247-research-"): return "research"
    if any(x in name for x in ("google-web", "seo-backlinks", "seo-indexnow", "organic-", "seo-unified")):
        return "seo-web"
    if any(x in name for x in ("telegram-playwright", "seo-groups")):
        return "seo-telegram"
    if "sales" in name: return "sales"
    if "vietlott" in name: return "vietlott"
    if any(x in name for x in ("bot", "group")): return "bots"
    if any(x in name for x in ("xs", "lottery")): return "xs"
    if any(x in name for x in ("football", "bongdalu", "r55")): return "football"
    return "ops"

def cmd(*argv, timeout=12):
    try:
        p = subprocess.run(argv, text=True, capture_output=True, timeout=timeout, check=False)
        return p.returncode, (p.stdout or "").strip(), (p.stderr or "").strip()[:250]
    except (subprocess.TimeoutExpired, OSError) as exc:
        return 124, "", type(exc).__name__

def now_utc():
    return dt.datetime.now(dt.timezone.utc)

def load(path, default):
    try: return json.loads(path.read_text())
    except (ValueError, OSError): return default

def save(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp." + str(os.getpid()))
    tmp.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n")
    os.replace(tmp, path)

def try_action(record, item, action, run, cooldown=1800, cap=3, window=7200, dry_run=False):
    stamp = time.time()
    attempts = [float(t) for t in record.get("attempts", {}).get(item, []) if stamp-float(t) < window]
    record.setdefault("attempts", {})[item] = attempts
    if len(attempts) >= cap or (attempts and stamp-attempts[-1] < cooldown):
        return {"name":item, "action":action, "status":"cooldown_or_limit", "attempts_in_window":len(attempts)}
    if dry_run: return {"name":item, "action":action, "status":"dry_run"}
    # Store attempt BEFORE the potentially failing action; don't repeat on timeout.
    record["attempts"][item] = attempts + [stamp]
    code, out, err = run()
    return {"name":item, "action":action, "status":"performed" if code == 0 else "failed",
            "exit_code":code, "output":out[:500], "error":err[:180]}

def discover_timers(scope):
    ret, output, err = cmd("systemctl", "list-unit-files", "--type=timer", "--no-legend", "--no-pager", timeout=15)
    if ret: return [], {"error":err or output}
    out=[]
    for line in output.splitlines():
        parts=line.split()
        if len(parts) < 2: continue
        name, status=parts[0], parts[1]
        if (name.startswith("kq247-") and not name.startswith("kq247-selfheal-")
                and name.endswith(".timer") and status=="enabled" and classify_timer(name)==scope):
            out.append(name)
    return sorted(set(out)), None

def heal_timers(scope, record, dry_run):
    events=[]
    timers, err=discover_timers(scope)
    if err: return [{"name":"timer_inventory","status":"error",**err}]
    for timer in timers:
        ret, active, _=cmd("systemctl", "is-active", timer)
        if ret != 0 or active!="active":
            event=try_action(record,timer,"start_enabled_timer",
                                     lambda timer=timer:cmd("systemctl","start",timer,timeout=30),
                                     cooldown=1800,cap=3,dry_run=dry_run)
            if event["status"]=="performed":
                probe_rc, probe_status, _=cmd("systemctl","is-active",timer)
                event["postcheck"]=probe_status
                event["status"]="verified" if probe_rc==0 and probe_status=="active" else "failed_postcheck"
            events.append(event)
            continue
        service=timer.replace(".timer",".service")
        ret, props, _=cmd("systemctl","show",service,"-p","ActiveState","-p","Result","-p","ExecMainStatus","--no-pager")
        row=dict(line.split("=",1) for line in props.splitlines() if "=" in line)
        if row.get("Result")=="failed" and row.get("ActiveState") not in ("activating","active"):
            # Generic retries can double-send bot posts, overwrite snapshots or repeat SEO submissions.
            # Only idempotent research workloads are automatically requeued.
            if scope!="research":
                events.append({"name":service,"status":"failed_job_manual_or_specific_repair_required",
                               "reason":"unsafe_to_requeue_non_idempotent_job"})
                continue
            events.append(try_action(record,service,"retry_failed_research_job",
                                     lambda service=service:cmd("systemctl","start","--no-block",service,timeout=15),
                                     cooldown=1800,cap=3,dry_run=dry_run))
    return events

def heal_containers(scope, record, dry_run):
    events=[]
    for name in KNOWN_CONTAINERS.get(scope,()):
        ret, status, err=cmd("docker","inspect","-f","{{.State.Status}}",name,timeout=10)
        if ret:
            events.append({"name":name,"status":"container_missing","error":err})
        elif status=="running":
            code, health, _=cmd("docker","inspect","-f",
                                  "{{if .State.Health}}{{.State.Health.Status}}{{else}}no_healthcheck{{end}}",
                                  name,timeout=10)
            if code==0 and health=="unhealthy":
                events.append({"name":name,"status":"container_unhealthy",
                               "action":"alert_without_restart"})
        elif status not in ("restarting",):
            # Only start existing exited containers explicitly on this allowlist.
            # Never stop/restart/recreate/deploy a running container.
            event=try_action(record,name,"start_exited_container",
                                     lambda name=name:cmd("docker","start",name,timeout=30),
                                     cooldown=3600,cap=2,dry_run=dry_run)
            if event["status"]=="performed":
                code, after, _=cmd("docker","inspect","-f","{{.State.Status}}",name,timeout=10)
                event["postcheck"]=after
                event["status"]="verified" if code==0 and after=="running" else "failed_postcheck"
            events.append(event)
    return events

def audit_unmanaged_workloads(scope):
    """Report every KQ247-owned container/timer; do not activate unknown or disabled ones."""
    events=[]
    known=set(KNOWN_CONTAINERS.get(scope,()))
    ret, output, err=cmd("docker","ps","-a","--format","{{.Names}}|{{.State}}",timeout=12)
    if ret:
        events.append({"name":"all_container_inventory","status":"inventory_failed","error":err})
    else:
        for line in output.splitlines():
            name, sep, status=line.partition("|")
            if not sep or not name.startswith("kq247-") or classify_timer(name+".timer")!=scope:
                continue
            if name not in known:
                events.append({"name":name,"status":"unlisted_container_observed_only",
                               "docker_state":status,"action":"no_auto_start_without_allowlist"})
    ret, output, err=cmd("systemctl","list-unit-files","--type=timer","--no-legend","--no-pager",timeout=15)
    if ret:
        events.append({"name":"all_timer_inventory","status":"inventory_failed","error":err})
    else:
        for line in output.splitlines():
            parts=line.split()
            if len(parts)<2: continue
            name,status=parts[0],parts[1]
            if (name.startswith("kq247-") and name.endswith(".timer")
                    and not name.startswith("kq247-selfheal-")
                    and status!="enabled" and classify_timer(name)==scope):
                events.append({"name":name,"status":"disabled_timer_observed_only",
                               "unit_file_state":status,"action":"never_reenable_without_approval"})
    return events

def audit_resource_pressure(scope):
    """Local low-cost warning. One ops-scope check avoids duplicating probes."""
    if scope!="ops":return []
    events=[]
    try:
        disk=os.statvfs("/opt/kq247")
        used=1-disk.f_bavail/max(1,disk.f_blocks)
        if used>=0.90:
            events.append({"name":"vps_disk","status":"disk_pressure",
                           "used_percent":round(100*used,1),"action":"no_automatic_deletion"})
    except OSError as exc:
        events.append({"name":"vps_disk","status":"stat_failed","error":type(exc).__name__})
    try:
        mem={}
        for line in Path("/proc/meminfo").read_text().splitlines():
            key,_,val=line.partition(":")
            if key in ("MemAvailable","MemTotal"):mem[key]=int(val.strip().split()[0])
        if mem.get("MemTotal") and mem.get("MemAvailable",0)/mem["MemTotal"]<0.10:
            events.append({"name":"vps_memory","status":"memory_pressure",
                           "available_percent":round(100*mem["MemAvailable"]/mem["MemTotal"],1),
                           "action":"no_automatic_process_termination"})
    except (OSError,ValueError,IndexError,ZeroDivisionError) as exc:
        events.append({"name":"vps_memory","status":"stat_failed","error":type(exc).__name__})
    return events

def read_local(port, path, timeout=6):
    try:
        with urllib.request.urlopen("http://127.0.0.1:%d%s" % (port,path), timeout=timeout) as response:
            return response.status, json.load(response)
    except urllib.error.HTTPError as exc:
        try: body=json.loads(exc.read(8192))
        except (ValueError,UnicodeError): body={}
        return exc.code,body
    except (OSError,ValueError) as exc:
        return 0,{"error":type(exc).__name__}

VIETLOTT_EXPECTED_RUNTIME = "R41_VPS_USER35"
VIETLOTT_EXPECTED_RULESET = "USER_35_HARD_RULES_ADJACENT_HEAD_PAIRS_2026_10_15_R1"

def verify_vietlott_snapshot(state, analysis_date):
    """Never treat HTTP 200, stale dates, or R33/R34 snapshots as ready."""
    if not isinstance(state,dict) or state.get("ready") is not True:
        return False
    products=state.get("products") or {}
    for product in ("mega645","power655"):
        snap=(products.get(product) or {}).get("snapshot") or {}
        if snap.get("locked") is not True or snap.get("analysis_date") != analysis_date:
            return False
    return True

def repair_vietlott(record, dry_run):
    events=[]
    hcode, health=read_local(18088,"/health")
    scode, state=read_local(18088,"/api/state")
    jcode, job=read_local(18088,"/status")
    now=now_utc()+dt.timedelta(hours=7)
    analysis_date=(now if now.hour>=19 else now-dt.timedelta(days=1)).date().isoformat()
    runtime=str(health.get("runtime") or "")
    snapshot_ready=verify_vietlott_snapshot(state,analysis_date) if scode==200 else False
    ruleset_confirmed=True
    if snapshot_ready:
        for product in ("mega645","power655"):
            context_code,context=read_local(18088,"/api/filter-context?product="+product)
            if context_code!=200 or context.get("ruleset_version")!=VIETLOTT_EXPECTED_RULESET:
                ruleset_confirmed=False
                events.append({"name":"vietlott_"+product+"_ruleset","status":"mismatch_or_unavailable",
                               "http":context_code,"expected":VIETLOTT_EXPECTED_RULESET})
    events.append({"name":"vietlott_primary_http","health_http":hcode,"state_http":scode,
                   "runtime":runtime,"data_ready":health.get("data_ready"),
                   "job_status":job.get("status"),"snapshot_ready":snapshot_ready and ruleset_confirmed})
    # Never retry an obsolete engine. Retrying R33/R40 just repeats failure, and may overwrite old pools.
    if hcode!=200 or not runtime.startswith(VIETLOTT_EXPECTED_RUNTIME):
        events.append({"name":"vietlott_release_gate","status":"requires_verified_version_upgrade",
                       "expected_runtime":VIETLOTT_EXPECTED_RUNTIME,"observed_runtime":runtime})
        return events
    if snapshot_ready and ruleset_confirmed and health.get("status")!="failed": return events
    # Post-19:00 only; leave the old signed locked pools in place, never fabricate newer data.
    if now.hour<19 or now.hour>=23: return events
    if jcode!=200 or job.get("status") in ("running","queued","in_progress"): return events
    start=job.get("started_at") or ""
    if start:
        try:
            since=(now_utc()-dt.datetime.fromisoformat(start.replace("Z","+00:00"))).total_seconds()
            if since<600: return events
        except (ValueError,TypeError): pass
    # This call is made INSIDE the container and reads the secret there; no secret is logged.
    script = ('const t=process.env.VIETLOTT_ADMIN_TOKEN||"";'
              'if(!t){console.error("admin_token_not_set");process.exit(2)}'
              'fetch("http://127.0.0.1:8080/run/daily",{method:"POST",'
              'headers:{authorization:"Bearer "+t}})'
              '.then(async r=>{let j=await r.json();console.log(JSON.stringify({http:r.status,accepted:j.accepted}));'
              'if(r.status!==202&&r.status!==409)process.exitCode=1})'
              '.catch(e=>{console.error(e.name);process.exitCode=1})')
    events.append(try_action(record, "vietlott_daily_snapshot", "retry_original_daily_job_not_restart",
                             lambda:cmd("docker","exec","kq247-vietlott-vps","node","-e",script,timeout=15),
                             cooldown=1200,cap=3,window=7200,dry_run=dry_run))
    return events

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument("--scope",required=True,choices=SCOPES)
    parser.add_argument("--dry-run",action="store_true")
    args=parser.parse_args()
    STATE.mkdir(parents=True,exist_ok=True)
    fd=os.open(str(STATE / (args.scope+".lock")), os.O_CREAT|os.O_RDWR,0o600)
    try: fcntl.flock(fd, fcntl.LOCK_EX|fcntl.LOCK_NB)
    except BlockingIOError:
        print(json.dumps({"scope":args.scope,"status":"skipped_already_running"}));return 0
    state_file=STATE / (args.scope+".json")
    previous=load(state_file,{"attempts":{}})
    events=heal_timers(args.scope,previous,args.dry_run)
    events+=heal_containers(args.scope,previous,args.dry_run)
    events+=audit_unmanaged_workloads(args.scope)
    events+=audit_resource_pressure(args.scope)
    if args.scope=="vietlott":
        events+=repair_vietlott(previous,args.dry_run)
    report={"scope":args.scope,"checked_at_utc":now_utc().isoformat(),
            "mode":"isolated_non_disruptive","events":events,
            "monitored_timer_count":len(discover_timers(args.scope)[0]),
            "docker_stop_or_restart":False,"production_snapshot_override":False}
    if not args.dry_run:
        previous["latest"]=report
        save(state_file,previous)
        with (STATE/(args.scope+".jsonl")).open("a") as fp:
            fp.write(json.dumps(report,ensure_ascii=False)+"\n")
    print("KQ247_SELFHEAL="+json.dumps(report,ensure_ascii=False))
    return 0
if __name__=="__main__": sys.exit(main())
