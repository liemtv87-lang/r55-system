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
    if any(x in name for x in ("xs", "lottery")): return "xs"
    if any(x in name for x in ("football", "bongdalu", "r55")): return "football"
    if any(x in name for x in ("bot", "group")): return "bots"
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
        if name.startswith("kq247-") and name.endswith(".timer") and status=="enabled" and classify_timer(name)==scope:
            out.append(name)
    return sorted(set(out)), None

def heal_timers(scope, record, dry_run):
    events=[]
    timers, err=discover_timers(scope)
    if err: return [{"name":"timer_inventory","status":"error",**err}]
    for timer in timers:
        ret, active, _=cmd("systemctl", "is-active", timer)
        if ret != 0 or active!="active":
            events.append(try_action(record,timer,"start_enabled_timer",
                                     lambda timer=timer:cmd("systemctl","start",timer,timeout=30),
                                     cooldown=1800,cap=3,dry_run=dry_run))
            continue
        service=timer.replace(".timer",".service")
        ret, props, _=cmd("systemctl","show",service,"-p","ActiveState","-p","Result","-p","ExecMainStatus","--no-pager")
        row=dict(line.split("=",1) for line in props.splitlines() if "=" in line)
        if row.get("Result")=="failed" and row.get("ActiveState") not in ("activating","active"):
            events.append(try_action(record,service,"retry_failed_oneshot",
                                     lambda service=service:cmd("systemctl","start","--no-block",service,timeout=15),
                                     cooldown=1800,cap=3,dry_run=dry_run))
    return events

def heal_containers(scope, record, dry_run):
    events=[]
    for name in KNOWN_CONTAINERS.get(scope,()):
        ret, status, err=cmd("docker","inspect","-f","{{.State.Status}}",name,timeout=10)
        if ret:
            events.append({"name":name,"status":"container_missing","error":err})
        elif status not in ("running", "restarting"):
            # Only start existing stopped container. Never stop, restart, recreate or deploy.
            events.append(try_action(record,name,"start_exited_container",
                                     lambda name=name:cmd("docker","start",name,timeout=30),
                                     cooldown=3600,cap=2,dry_run=dry_run))
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

def repair_vietlott(record, dry_run):
    events=[]
    hcode, health=read_local(18088,"/health")
    scode, state=read_local(18088,"/api/state")
    jcode, job=read_local(18088,"/status")
    events.append({"name":"vietlott_primary_http","health_http":hcode,"state_http":scode,
                   "data_ready":health.get("data_ready"),"job_status":job.get("status")})
    if scode==200 and state.get("ready"): return events
    # Post-19:00 only; leave the old signed locked pools in place, never fabricate newer data.
    now=now_utc()+dt.timedelta(hours=7)
    if now.hour<19 or now.hour>=23: return events
    if jcode!=200 or job.get("status") in ("running","queued","in_progress"): return events
    start=job.get("started_at") or ""
    if start:
        try:
            since=(now_utc()-dt.datetime.fromisoformat(start.replace("Z","+00:00"))).total_seconds()
            if since<600: return events
        except (ValueError,TypeError): pass
    if hcode!=200: return events
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
