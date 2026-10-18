#!/usr/bin/env python3
"""KQ247 Vietlott source-gated nightly trigger; three safe 20:05/15/25 VN attempts."""
import datetime as dt
import json
import os
from pathlib import Path
import tempfile
import urllib.error
import urllib.request
from zoneinfo import ZoneInfo

BASE=Path("/opt/kq247/vietlott")
OPS=BASE/"ops"
RECEIPT=OPS/"nightly-attempts.json"
STATE=BASE/"public/state.json"
TOKENS=[
    Path("/opt/kq247/vietlott-r33-stage/.admin-token"),
    Path("/opt/kq247/vietlott-r33-primary/.admin-token")
]
ENDPOINT="http://127.0.0.1:18088"

def fetch_json(path,method="GET",token=None):
    headers={"User-Agent":"KQ247-Vietlott-VerifiedDaily/20261018"}
    if token: headers["Authorization"]="Bearer "+token
    req=urllib.request.Request(ENDPOINT+path,headers=headers,method=method)
    try:
        with urllib.request.urlopen(req,timeout=15) as r:
            return r.status,json.load(r)
    except urllib.error.HTTPError as e:
        try: data=json.load(e)
        except ValueError: data={}
        return e.code,data

def read(path,default):
    try: return json.loads(path.read_text())
    except (OSError,ValueError): return default

def save(obj):
    OPS.mkdir(mode=0o700,parents=True,exist_ok=True)
    fd,tmp=tempfile.mkstemp(prefix=".nightly-",dir=OPS)
    try:
        os.fchmod(fd,0o600)
        with os.fdopen(fd,"w") as f:
            json.dump(obj,f,ensure_ascii=False)
            f.flush()
            os.fsync(f.fileno())
        os.replace(tmp,RECEIPT)
    finally:
        if os.path.exists(tmp): os.unlink(tmp)

def complete(state,day):
    products=state.get("products") or {}
    if not isinstance(products,dict): return False
    for p in ("mega645","power655"):
        row=products.get(p) or {}
        snap=row.get("snapshot") or {}
        if snap.get("analysis_date") != day or not snap.get("locked"):
            return False
    return True

def main():
    now=dt.datetime.now(ZoneInfo("Asia/Ho_Chi_Minh"))
    day=now.date().isoformat()
    if now.hour<20 or now.hour>=24:
        print("VIETLOTT_NIGHTLY_SKIPPED=outside_after_20h")
        return
    status,live=fetch_json("/status")
    if status!=200: raise SystemExit("Vietlott local status inaccessible; no POST")
    state_code,state=fetch_json("/api/state")
    if state_code!=200 or not isinstance(state,dict):
        raise SystemExit("Vietlott live /api/state unavailable; refuse blind duplicate trigger")
    if complete(state,day):
        print("VIETLOTT_NIGHTLY_SKIPPED=already_locked_for_today")
        return
    if live.get("status")=="running":
        print("VIETLOTT_NIGHTLY_SKIPPED=run_already_in_progress")
        return
    attempts=read(RECEIPT,{})
    n=attempts.get(day,{}).get("count",0)
    if n>=3:
        print("VIETLOTT_NIGHTLY_SKIPPED=max_three_attempts_reached")
        return
    key=next((f for f in TOKENS if f.is_file() and f.stat().st_size),None)
    if not key: raise SystemExit("Admin token missing; no change")
    token=key.read_text().strip()
    if not token: raise SystemExit("Admin token empty; no change")
    attempts[day]={"count":n+1,"at_utc":dt.datetime.now(dt.timezone.utc).isoformat()}
    attempts={k:v for k,v in attempts.items() if k>= (now.date()-dt.timedelta(days=7)).isoformat()}
    # Durable attempt checkpoint BEFORE request to avoid duplicate uncertain posts.
    save(attempts)
    code,data=fetch_json("/run/daily","POST",token)
    print("VIETLOTT_NIGHTLY_TRIGGER="+json.dumps({"analysis_date":day,"attempt":n+1,
        "http":code,"accepted":bool(data.get("accepted")), "status":data.get("status")}))
    if code!=202 or not data.get("accepted"):
        raise SystemExit("Vietlott local trigger not accepted; inspect status before retry")

if __name__=="__main__": main()
