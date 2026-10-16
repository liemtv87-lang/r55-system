#!/usr/bin/env python3
"""KQ247 two-group SEO 5-minute orchestration and evidence-based reporting.

Repairs only known SEO units; never touches Docker, snapshots, credentials,
other app services, or third-party websites. Submission remains controlled by
the independently eligible opt-in directory worker.
"""
import datetime as dt
import fcntl
import json
import os
from pathlib import Path
import subprocess
import time

ROOT = Path("/opt/kq247/seo-pipeline")
PUBLIC = Path("/opt/kq247/deployment/football-original/public")
GROUPS = {"football": "https://t.me/keochuyengia79", "lottery": "https://t.me/xsbm999"}
STAGES = {
    "google_discovery": ("kq247-google-web-discovery", "google-web-discovery-status.json", 30),
    "source_bridge": ("kq247-seo-source-bridge", "seo-source-bridge-status.json", 30),
    "telegram_supervisor": ("kq247-seo-unified", "seo-unified-status.json", 170),
    "google_web_audit": ("kq247-google-web-seo", "google-web-seo-status.json", 170),
    "landing_auto_upgrade": ("kq247-google-seo-auto", "google-seo-auto-status.json", 45),
    "integrity_guard": ("kq247-seo-integrity-guard", "google-seo-guard-status.json", 20),
}

def cmd(*args):
    try:
        p = subprocess.run(args, capture_output=True, text=True, timeout=12)
        return p.returncode, p.stdout.strip()[:300], p.stderr.strip()[:130]
    except (OSError, subprocess.TimeoutExpired) as exc:
        return 99, "", type(exc).__name__

def load(name):
    try:
        p = PUBLIC / name
        d = json.loads(p.read_text())
        stamp = d.get("checked_at_utc") or d.get("updated_at_utc") or d.get("updated_utc")
        if stamp:
            t = dt.datetime.fromisoformat(stamp.replace("Z","+00:00"))
            age = max(0, int((dt.datetime.now(dt.timezone.utc)-t).total_seconds()))
        else:
            age = max(0, int(time.time()-p.stat().st_mtime))
        return d,age
    except (OSError, ValueError, TypeError, AttributeError):
        return {},None

def atomic(path, obj):
    path.parent.mkdir(parents=True,exist_ok=True)
    tmp = path.with_suffix(path.suffix+".tmp")
    tmp.write_text(json.dumps(obj,ensure_ascii=False,indent=2)+"\n")
    os.replace(tmp,path)

def run():
    ROOT.mkdir(parents=True,exist_ok=True)
    with (ROOT/"pipeline.lock").open("w") as lock:
        try: fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
        except BlockingIOError: return {"status":"already_running"}
        now=dt.datetime.now(dt.timezone.utc)
        try: ledger=json.loads((ROOT/"recovery-ledger.json").read_text())
        except (ValueError,OSError): ledger={}
        report={"checked_at_utc":now.isoformat(),"scope":"two_telegram_groups",
                "stages":{},"recovery_actions":[],"issues":[],
                "actual_backlinks_not_inferred_from_scan":True}
        remaining=1  # One heavyweight recovery per 5-minute tick.
        for name,(unit,filename,ttl) in STAGES.items():
            timer=unit+".timer"; service=unit+".service"
            load_state=cmd("systemctl","show",timer,"-p","LoadState","--value")[1]
            timer_installed=load_state=="loaded"
            timer_active=cmd("systemctl","is-active","--quiet",timer)[0]==0 if timer_installed else False
            service_active=cmd("systemctl","is-active","--quiet",service)[0]==0
            data,age=load(filename)
            stale=age is None or age>ttl*60
            report["stages"][name]={"timer_installed":timer_installed,"timer_active":timer_active,
                "service_active":service_active,"report_age_s":age,"stale":stale}
            if not timer_installed:report["issues"].append(name+":timer_missing")
            elif not timer_active:report["issues"].append(name+":timer_inactive")
            if stale:report["issues"].append(name+":stale_report")
            if timer_installed and not timer_active and time.time()-ledger.get(timer,0)>1800:
                result=cmd("systemctl","enable","--now",timer)
                ledger[timer]=time.time()
                report["recovery_actions"].append({"unit":timer,"result":"enabled" if result[0]==0 else "failed"})
            if timer_installed and timer_active and stale and not service_active and remaining>0 and time.time()-ledger.get(service,0)>1800:
                result=cmd("systemctl","start","--no-block",service)
                ledger[service]=time.time(); remaining-=1
                report["recovery_actions"].append({"unit":service,"result":"queued" if result[0]==0 else "failed"})
        discovery,_=load("google-web-discovery-status.json")
        bridge,_=load("seo-source-bridge-status.json")
        telegram,telegram_age=load("seo-backlink-worker-status.json")
        unified,unified_age=load("seo-unified-status.json")
        poster=(unified.get("poster_running") if unified_age is not None and unified_age<1200 else None)
        if poster is None and telegram_age is not None and telegram_age<3600:
            poster=telegram.get("poster_running")
        google,_=load("google-web-seo-status.json")
        page,_=load("google-seo-auto-status.json")
        report["measured"]={
            "source_hosts_google_known": discovery.get("source_hosts_known_total"),
            "sitemap_records_last_cycle": discovery.get("sitemap_url_records_read_this_run"),
            "unique_candidate_urls_bridged": bridge.get("unique_urls_exported_total"),
            "telegram_sources": (telegram.get("scanner") or {}).get("unique_hosts_discovered"),
            "telegram_poster_running": poster,
            "telegram_submission_states": (telegram.get("submissions") or {}).get("counts"),
            "new_verified_telegram_backlinks": (telegram.get("submissions") or {}).get("verified_new_public_links"),
            "google_web_auto_submission": (google.get("automatic_submission") or {}).get("enabled",False),
            "new_verified_google_web_backlinks": google.get("new_verified_web_backlinks_this_run"),
            "landing_page_health": page.get("status"),
            "google_rank": None,
        }
        if report["measured"]["google_web_auto_submission"] is not True:
            report["issues"].append("google_web_submission_waits_for_verified_opt_in_adapter")
        if report["measured"]["telegram_poster_running"] is not True:
            report["issues"].append("telegram_poster_unconfirmed")
        report["status"]="ok" if not report["issues"] else "degraded"
        report["notes"]=[
            "Google rank requires Search Console; no assumed top placement.",
            "Automatic submissions are permitted only on explicitly free, opt-in public forms.",
            "Discovery URL counts are not accepted/published backlinks.",
            "No Docker/container restart or snapshot modification.",
        ]
        atomic(ROOT/"recovery-ledger.json",ledger)
        atomic(PUBLIC/"seo-full-pipeline-status.json",report)
        atomic(ROOT/"history"/(now.strftime("%Y-%m-%dT%H-%M")+".json"),report)
        return report

if __name__=="__main__":
    x=run()
    print("KQ247_SEO_FULL_PIPELINE="+json.dumps(x,ensure_ascii=False,separators=(",",":")))
