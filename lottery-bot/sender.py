#!/usr/bin/env python3
"""KQ247 Telegram XS group sender, hosted by GitHub Actions only.

Supabase and Hatchable are not called. Locked predictions are read-only
from existing published snapshot API; real draws come from Minh Ngoc.
No Telegram send unless all validations pass and a durable claim commits.
"""
import json, os, re, sys, time, subprocess, hashlib
from datetime import datetime, time as dt_time
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError
from zoneinfo import ZoneInfo
from bs4 import BeautifulSoup

VN=ZoneInfo("Asia/Ho_Chi_Minh")
ROOT=Path(__file__).resolve().parent.parent
STORE=ROOT/"lottery-bot"/"state"
CHAT="-1004320899120"
NEON_READONLY_SNAPSHOT="https://br-divine-resonance-az0qxt8z-kq247full.compute.c-3.ap-southeast-1.aws.neon.tech/api/snapshot"
REGIONS={"mn":{"pre":dt_time(16,10),"after":dt_time(17,0),"label":"XSMN","path":"mien-nam"},
         "mt":{"pre":dt_time(17,10),"after":dt_time(18,0),"label":"XSMT","path":"mien-trung"},
         "mb":{"pre":dt_time(18,10),"after":dt_time(20,0),"label":"XSMB","path":"mien-bac"}}
ORDER_MT_MN=["giai8","giai7","giai6","giai5","giai4","giai3","giai2","giai1","giaidb"]
ORDER_MB=["giaidb","giai1","giai2","giai3","giai4","giai5","giai6","giai7"]

def http_json(url,method="GET",payload=None,token=None,timeout=16):
    headers={"User-Agent":"KQ247-Bot/1.0","Accept":"application/json"}
    if payload is not None: headers["Content-Type"]="application/json"
    req=Request(url,data=json.dumps(payload).encode() if payload is not None else None,
                headers=headers,method=method)
    with urlopen(req,timeout=timeout) as x:
        result=json.loads(x.read(450000).decode("utf-8"))
        if x.status!=200: raise ValueError("HTTP status "+str(x.status))
        return result

def get_html(url):
    req=Request(url,headers={"User-Agent":"Mozilla/5.0 KQ247-Group-Bot/1.0","Accept-Language":"vi-VN,vi;q=0.9"})
    with urlopen(req,timeout=18) as r:
        if r.status!=200: raise ValueError("lottery source HTTP "+str(r.status))
        return r.read(260000).decode("utf-8",errors="replace")

def read_snapshot(day,region):
    source=http_json(NEON_READONLY_SNAPSHOT+"?date="+day)
    if not (source.get("ok") is True and source.get("found") is True and source.get("locked") is True
            and source.get("date")==day and source.get("lock",{}).get("locked") is True):
        raise ValueError("missing or unlocked prior snapshot; never send guesses")
    data=source.get("data",{})
    if data.get("date")!=day: raise ValueError("snapshot wrong date")
    fp=source.get("fingerprint")
    if not fp or fp != source.get("lock",{}).get("fingerprint") or fp != data.get("fingerprint"):
        raise ValueError("snapshot fingerprint mismatch")
    stations=data.get("predictions",{}).get(region)
    if not isinstance(stations,dict) or not (1 if region=="mb" else 2)<=len(stations)<=(1 if region=="mb" else 4):
        raise ValueError("invalid station count")
    for name,pick in stations.items():
        nums=pick.get("three_lotto")
        if not isinstance(nums,list) or len(nums)!=3 or len(set(nums))!=3 or any(not re.fullmatch(r"\d\d",str(x)) for x in nums):
            raise ValueError("invalid 3 lotto for "+name)
        doubles=pick.get("doubles")
        if not isinstance(doubles,list) or len(doubles)!=2 or any(not re.fullmatch(r"\d\d",str(x)) for x in doubles):
            raise ValueError("invalid doubles for "+name)
        de=pick.get("de",{})
        if not all(isinstance(de.get(k),list) and len(de[k])==n for k,n in
                   [("dan50",50),("dan60",60),("dan75",75),("three_digit",500)]):
            raise ValueError("missing de/3-cang for "+name)
    return stations,fp

def station_name(s):
    return re.sub(r"\s+"," ",s).strip().casefold()

def draw_results(day,region,expected_stations):
    path=REGIONS[region]["path"]
    d=datetime.strptime(day,"%Y-%m-%d")
    dmy=d.strftime("%d-%m-%Y")
    html=get_html(f"https://www.minhngoc.net.vn/ket-qua-xo-so/{path}/{dmy}.html")
    soup=BeautifulSoup(html,"html.parser")
    if d.strftime("%d/%m/%Y") not in (soup.title.get_text(" ",strip=True) if soup.title else ""):
        raise ValueError("wrong draw date from source")
    blocks=soup.select("table.bkqtinhmienbac") if region=="mb" else soup.select("table.rightcl")
    found={}
    for block in blocks:
        name="XSMB" if region=="mb" else (block.select_one("td.tinh a").get_text(" ",strip=True) if block.select_one("td.tinh a") else "")
        if station_name(name) not in {station_name(n) for n in expected_stations}: continue
        order=ORDER_MB if region=="mb" else ORDER_MT_MN
        nums=[]
        for cls in order:
            td=block.select_one("td."+cls)
            if td is None: raise ValueError("draw missing "+cls+" for "+name)
            values=[x.get_text(strip=True) for x in td.select("div")]
            if not values or any(re.fullmatch(r"\d{2,6}",x) is None for x in values):
                raise ValueError("invalid draw numbers "+name)
            nums+=values
        db=block.select_one("td.giaidb")
        special=db.select_one("div").get_text(strip=True) if db and db.select_one("div") else ""
        required=27 if region=="mb" else 18
        if len(nums)!=required or len(special)!=(5 if region=="mb" else 6):
            raise ValueError("incomplete draw "+name)
        if (nums[0] if region=="mb" else nums[-1])!=special:
            raise ValueError("wrong special draw "+name)
        if name in found: continue  # archive pages may repeat previous stations; take first dated block only
        found[name]={"special":special,"all2":[x[-2:] for x in nums]}
        if len(found)==len(expected_stations): break
    if {station_name(k) for k in found}!={station_name(k) for k in expected_stations}:
        raise ValueError("missing stations from actual draw; expected="+repr(sorted(expected_stations))+" found="+repr(sorted(found.keys())))
    return found

def html_escape(s):
    return str(s).replace("&","&amp;").replace("<","&lt;").replace(">","&gt;")

def message(day,region,station,pick,draw=None):
    label=REGIONS[region]["label"]; day_fmt=datetime.strptime(day,"%Y-%m-%d").strftime("%d/%m/%Y")
    head=f"🎯 KQ247 • {'TỔNG KẾT' if draw else 'DỰ ĐOÁN'} {label}\n📅 {day_fmt}\n📍 {station}\n"
    nums=pick["three_lotto"]; doubles=pick["doubles"]; de=pick["de"]
    if draw:
        all2=draw["all2"]; special=draw["special"]; end2=special[-2:]; end3=special[-3:]
        details=lambda x:", ".join(f"{n} ({all2.count(n)} nháy)" for n in x)
        tail=(f"🎲 3 LÔ: {details(nums)}\n🔵 LÔ KÉP: {details(doubles)}\n"
              +f"🏅 ĐỀ {end2}: D50 {'✅' if end2 in de['dan50'] else '❌'} · D60 {'✅' if end2 in de['dan60'] else '❌'} · D75 {'✅' if end2 in de['dan75'] else '❌'}\n"
              +f"💎 3 CÀNG {end3}: {'✅' if end3 in de['three_digit'] else '❌'}\n"
              +"🔒 Chấm snapshot khóa trước giờ quay.")
    else:
        tail=(f"🎲 3 LÔ: {' - '.join(nums)}\n🔵 LÔ KÉP: {' - '.join(doubles)}\n"
              +f"🏅 D50/D60/D75: {len(de['dan50'])}/{len(de['dan60'])}/{len(de['dan75'])}\n"
              +"🔒 Theo snapshot khóa trước giờ quay.")
    footer="\n📣 t.me/xsbm999 | t.me/muatool_du_doan_bot"
    return "<b>"+html_escape(head+tail+footer)+"</b>"

def committed_state(path,contents):
    path.parent.mkdir(parents=True,exist_ok=True)
    path.write_text(json.dumps(contents,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    subprocess.run(["git","add",str(path.relative_to(ROOT))],cwd=ROOT,check=True)
    msg="lottery bot: "+path.stem+" "+contents["status"]
    subprocess.run(["git","-c","user.email=github-actions[bot]@users.noreply.github.com",
                    "-c","user.name=github-actions[bot]","commit","-m",msg],cwd=ROOT,check=True,stdout=subprocess.DEVNULL)
    subprocess.run(["git","push","origin","HEAD:main"],cwd=ROOT,check=True,stdout=subprocess.DEVNULL,timeout=20)

def send(day,region,phase,station,pick,draw,fp):
    if not due(datetime.now(VN),region,"result" if draw is not None else "pre"):
        raise RuntimeError("RESULT_DEADLINE_EXPIRED_"+region)
    key=re.sub(r"[^a-z0-9]+","-",station_name(station)).strip("-")
    path=STORE/day/f"{region}-{phase}-{key}.json"
    if path.exists():
        state=json.loads(path.read_text(encoding="utf-8"))
        if state.get("status") in ("claimed","sent","uncertain"):
            print("SKIP CLAIMED_OR_SENT",region,phase,station,state["status"]);return
        raise ValueError("unexpected state; manual review "+str(path))
    body=message(day,region,station,pick,draw)
    if len(body)>4096: raise ValueError("telegram message too long")
    if os.getenv("DRY_RUN")=="1":
        print("DRY_RUN_VALIDATED",region,phase,station,"chars",len(body));return
    token=os.getenv("TELEGRAM_LOTTERY_BOT_TOKEN","").strip()
    if not token: raise RuntimeError("MISSING_REPOSITORY_SECRET_TELEGRAM_LOTTERY_BOT_TOKEN")
    # Claim BEFORE send; an uncertain Telegram timeout must never cause duplicate retries.
    entry={"date":day,"region":region,"phase":phase,"station":station,"status":"claimed","fingerprint":fp,"claimed_at":datetime.now(VN).isoformat()}
    committed_state(path,entry)
    if not due(datetime.now(VN),region,"result" if draw is not None else "pre"):
        entry["status"]="deadline_expired";committed_state(path,entry)
        raise RuntimeError("RESULT_DEADLINE_EXPIRED_BEFORE_SEND_"+region)
    url="https://api.telegram.org/bot"+token+"/sendMessage"
    try:
        reply=http_json(url,method="POST",payload={"chat_id":CHAT,"text":body,"parse_mode":"HTML","disable_web_page_preview":True},timeout=15)
    except Exception as ex:
        entry["status"]="uncertain";entry["error"]=type(ex).__name__
        try: committed_state(path,entry)
        except Exception as log_error: print("STATE_COMMIT_ERROR",type(log_error).__name__)
        raise RuntimeError("delivery uncertain, held claim to prevent duplicates") from ex
    if reply.get("ok") is not True or not reply.get("result",{}).get("message_id"):
        entry["status"]="uncertain"
        committed_state(path,entry)
        raise RuntimeError("telegram response not confirmed")
    entry["status"]="sent";entry["message_id"]=reply["result"]["message_id"];entry["sent_at"]=datetime.now(VN).isoformat()
    committed_state(path,entry)
    print("TELEGRAM_CONFIRMED",region,phase,station,entry["message_id"])

def due(now,region,phase):
    t=now.time().replace(tzinfo=None)
    if phase=="pre":
        start=REGIONS[region]["pre"]
        return start<=t<=dt_time(start.hour,15)
    after=REGIONS[region]["after"]
    # Hard close at 17:05 MN / 18:05 MT / 20:05 MB (Vietnam local time).
    return after<=t<=dt_time(after.hour,5)

def verify_telegram_access(token):
    if not token:
        print("TELEGRAM_TOKEN_MISSING");return False
    base="https://api.telegram.org/bot"+token
    try:
        me=http_json(base+"/getMe")
        user=me.get("result",{})
        if me.get("ok") is not True or not isinstance(user.get("id"),int):
            print("TELEGRAM_INVALID_TOKEN");return False
        member=http_json(base+"/getChatMember?chat_id="+CHAT+"&user_id="+str(user["id"]))
        role=member.get("result",{}).get("status","")
        print("TELEGRAM_ACCESS_VERIFIED",user.get("username",""),"role",role)
        return member.get("ok") is True and role in ("administrator","creator","member")
    except Exception as exc:
        print("TELEGRAM_ACCESS_BLOCKED",type(exc).__name__)
        return False

def main():
    now=datetime.now(VN);day=now.date().isoformat()
    override=os.getenv("BOT_REGION","").lower()
    target_regions=[override] if override in REGIONS else ["mn","mt","mb"]
    forced_phase=os.getenv("BOT_PHASE","")
    dry=os.getenv("DRY_RUN")=="1"
    print("KQ247_GROUP_SENDER_GITHUB",now.isoformat(),"dry_run",dry)
    token=os.getenv("TELEGRAM_LOTTERY_BOT_TOKEN","").strip()
    if token and not verify_telegram_access(token):
        print("BLOCKED: Telegram cannot confirm bot and group membership; NO send");return 3
    if not dry and os.getenv("KQ247_LOTTERY_CUTOVER")!="enabled":
        print("SAFE_MODE: new GitHub sender is not yet designated primary; NO send");return 3
    if not dry and not token:
        print("BLOCKED: GitHub Actions secret TELEGRAM_LOTTERY_BOT_TOKEN not configured; NO send");return 3
    attempts=0
    errors=0
    for region in target_regions:
        for phase in (["pre","result"] if forced_phase not in ("pre","result") else [forced_phase]):
            if not dry and not due(datetime.now(VN),region,phase): continue
            if dry and not forced_phase and not due(now,region,phase): continue
            print("CHECK",region,phase)
            try:
                stations,fp=read_snapshot(day,region)
                draws=draw_results(day,region,stations) if phase=="result" else None
                for st,pick in stations.items():
                    matched=next((v for k,v in draws.items() if station_name(k)==station_name(st)),None) if draws else None
                    send(day,region,phase,st,pick,matched,fp)
                attempts+=1
            except Exception as ex:
                print("REGION_FAIL",region,phase,type(ex).__name__,str(ex)[:150])
                errors+=1
                if forced_phase: return 1
    return 1 if errors else (0 if attempts or not forced_phase else 1)

if __name__=="__main__":sys.exit(main())
