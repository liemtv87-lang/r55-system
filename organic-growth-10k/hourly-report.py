#!/usr/bin/env python3
"""Standalone KQ247 free organic-reach experiment: aggregate real VPS referral logs.

This experiment neither submits backlinks nor uses the backlink worker, its state,
container names, or systemd units. Counts HTTP requests as pageviews, NEVER as
verified social reach or Telegram joins.
"""
import datetime
import gzip
import json
import os
import pathlib
import re
from collections import Counter
from urllib.parse import urlsplit, parse_qs
from zoneinfo import ZoneInfo

ROOT = pathlib.Path("/opt/kq247/organic-growth-10k")
PUBLIC = pathlib.Path("/opt/kq247/deployment/football-original/public")
DATA = ROOT / "reports"
TZ = ZoneInfo("Asia/Ho_Chi_Minh")
TARGET_REACH = 10000
GROUPS = {
    "football": "/nhom-bong-da-telegram-mien-phi.html",
    "lottery": "/nhom-xo-so-mb-mn-mt-telegram-mien-phi.html",
}
# Only known access logs. Don't crawl application containers or unrelated services.
LOGS = [
    pathlib.Path("/var/log/nginx/access.log"),
    pathlib.Path("/var/log/apache2/access.log"),
]
UA_BOT = re.compile(r"bot|crawler|spider|slurp|headless|python-requests|curl/|wget/|monitor|uptime|googleother|bingpreview", re.I)
COMMON = re.compile(r'^(?P<ip>\S+) - \S+ \[([^]]+)\] "(?:GET|HEAD) (?P<path>\S+) HTTP/[\d.]+" (?P<status>\d{3}) \S+ "(?P<referer>[^"]*)" "(?P<ua>[^"]*)"')
# nginx combined log format; safely ignore unknown formats.
def atomic_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp=path.with_suffix(".tmp")
    tmp.write_text(json.dumps(value, ensure_ascii=False, indent=2)+"\n",encoding="utf-8")
    os.replace(tmp,path)

def parse_timestamp(t):
    return datetime.datetime.strptime(t,"%d/%b/%Y:%H:%M:%S %z").astimezone(TZ)

def tail_lines(path, maxbytes=20_000_000):
    try:
        with path.open("rb") as f:
            f.seek(0,2)
            size=f.tell()
            f.seek(max(0,size-maxbytes))
            if size>maxbytes: f.readline()
            for line in f:
                yield line.decode("utf8","replace").rstrip()
    except (OSError,PermissionError):
        return

def main():
    now=datetime.datetime.now(datetime.timezone.utc)
    today=now.astimezone(TZ).date().isoformat()
    scans=[]
    counts=Counter()
    unique={}  # transient (IP, UA) per day; never persisted
    all_recent=0
    oldest_by_log={}
    for path in LOGS:
        if not path.is_file():
            continue
        scanned=0
        oldest=None
        for row in tail_lines(path):
            scanned+=1
            m=COMMON.match(row)
            if not m or int(m.group("status"))!=200:continue
            try: date=parse_timestamp(row.split("[",1)[1].split("]",1)[0])
            except (ValueError,IndexError):continue
            if oldest is None:oldest=date.isoformat()
            if date.date().isoformat()!=today:continue
            parts=urlsplit(m.group("path"))
            group=next((g for g,p in GROUPS.items() if parts.path==p),None)
            if not group:continue
            if UA_BOT.search(m.group("ua")):continue
            all_recent+=1
            counts[group]+=1
            qs=parse_qs(parts.query)
            src=(qs.get("utm_source") or ["unknown"])[0].lower()
            campaign=(qs.get("utm_campaign") or [""])[0].lower()
            if src=="facebook" and campaign=="kq247_reach_10k_free":
                counts[group+"_facebook_campaign_requests"]+=1
            # Not a reliable identity signal due to shared IP, VPN, caching.
            unique.setdefault(group,set()).add((m.group("ip"),m.group("ua")))
        scans.append({"file":str(path),"scanned_lines":scanned,
                      "oldest_line_in_examined_tail":oldest})
    by_group={}
    for g in GROUPS:
        by_group[g]={
            "landing_page_requests_nonbot_observed":counts[g] if scans else None,
            "facebook_campaign_requests_observed":counts[g+"_facebook_campaign_requests"] if scans else None,
            "approx_unique_ip_ua_pairs":len(unique.get(g,set())) if scans else None,
            "telegram_members_added":None,
            "notes":"Server request logs are NOT Facebook reach, real people or Telegram joins. Log tail may omit older requests.",
        }
    result={
        "campaign":"KQ247 standalone free 10k reach experiment",
        "checked_at_utc":now.isoformat(),
        "date_vn":today,
        "scope":["football","lottery"],
        "daily_reach_target":TARGET_REACH,
        "actual_daily_reach":None,
        "facebook_organic_reach":None,
        "telegram_net_new_members":None,
        "landing_metrics":by_group,
        "log_sources":scans,
        "measurement_limitation":"Only independent verified channel analytics (e.g., Facebook reach data) can establish daily reach. HTTP requests cannot be represented as audience reach.",
        "publication":"Owned informational Facebook posts scheduled separately through Metricool, not generated as backlinks.",
        "backlink_worker_modified":False,
        "backlink_timer_modified":False,
        "goal_reached":None
    }
    atomic_json(DATA/"latest.json", result)
    atomic_json(PUBLIC/"organic-reach-10k-status.json", result)
    print("KQ247_ORGANIC_GROWTH_REPORT="+json.dumps({
        "date_vn":today,"goal":TARGET_REACH,"actual_reach":"unavailable",
        "logs_available":bool(scans),
        "observed_landing_requests":dict(counts),
        "backlink_separate":True,
    },ensure_ascii=False))

if __name__=="__main__":
    main()
