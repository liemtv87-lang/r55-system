#!/usr/bin/env python3
"""R34 static backtest dashboard on the *actual* public HTTPS main + guest HTML.
No Git installation, Docker restart, auth, data, bot, or snapshot changes.
Fail closed + rollback if routing/HTTP verification fails.
"""
import datetime
import hashlib
import json
import os
import pathlib
import re
import subprocess
import tempfile
import urllib.request

PUBLIC = "https://vietlott.64-120-92-172.sslip.io"
REPORT_URL = "https://raw.githubusercontent.com/liemtv87-lang/r55-system/6ee85101ef2a3814b6b9c8fceec610187626e1ee/deployment/vietlott/r34-verified-150-statistics-public.html"
REPORT_SHA256 = "85b19d770b87778d6e4b243478eba576904a11c7f74e553e700074e5f8ed54a5"
REPORT_NAME = "kq247-r34-thong-ke.html"
START = "<!-- KQ247_R34_VERIFIED_STATS_PANEL_BEGIN -->"
END = "<!-- KQ247_R34_VERIFIED_STATS_PANEL_END -->"
PANEL = """<!-- KQ247_R34_VERIFIED_STATS_PANEL_BEGIN -->
<section id="kq247-r34-verified-stats-panel" style="display:block;position:relative;z-index:2;max-width:1120px;margin:14px auto;padding:12px;background:#fff;border:1px solid #dbe2ea;border-radius:14px">
<h2 style="color:#c42029;font-size:20px;margin:4px 0 10px">THỐNG KÊ VIETLOTT R34 — 30 / 60 / 150 KỲ</h2>
<p style="font-size:12px;color:#465063">Kết quả hồi kiểm đã xác minh 48/48 phần. Dàn chính: TOÀN BỘ bộ hợp lệ sau đúng 34 điều kiện; dàn rút gọn chỉ bổ sung. Đây là thống kê lịch sử, không thay SNAP dự đoán.</p>
<iframe title="Báo cáo thống kê Vietlott R34" src="/kq247-r34-thong-ke.html" loading="eager" style="display:block;width:100%;height:1650px;border:0;border-radius:8px"></iframe>
<script>window.addEventListener("message",function(e){if(e.origin!==location.origin||!e.data||e.data.type!=="KQ247_R34_STATS_HEIGHT")return;var f=document.querySelector("#kq247-r34-verified-stats-panel iframe");if(f&&f.contentWindow===e.source)f.style.height=Math.max(600,Math.min(6000,Number(e.data.height)+24))+"px"})</script>
</section>
<!-- KQ247_R34_VERIFIED_STATS_PANEL_END -->"""

def sha(b): return hashlib.sha256(b).hexdigest()

def fetch(url, limit=2000000):
    req=urllib.request.Request(url, headers={"Cache-Control":"no-cache", "Pragma":"no-cache","User-Agent":"KQ247-R34-direct-public-check"})
    with urllib.request.urlopen(req,timeout=12) as f:
        if f.status!=200: raise RuntimeError("HTTP "+str(f.status)+" "+url)
        data=f.read(limit+1)
        if len(data)>limit: raise RuntimeError("Response too large: "+url)
        return data

def local(port,route):
    return fetch("http://127.0.0.1:"+str(port)+route)

def public(route):
    return fetch(PUBLIC+route)

def get_containers():
    ids=subprocess.check_output(["docker","ps","-q"],text=True,timeout=15).split()
    if not ids:raise RuntimeError("No running containers")
    return json.loads(subprocess.check_output(["docker","inspect",*ids],timeout=25))

def exposed_ports(container):
    ports=set()
    bindings=container.get("NetworkSettings",{}).get("Ports",{}) or {}
    for rows in bindings.values():
        for row in rows or []:
            try:ports.add(int(row.get("HostPort")))
            except (ValueError,TypeError):pass
    return ports

def mounted_public_roots(container):
    roots=[]
    for m in container.get("Mounts",[]):
        if m.get("Type")!="bind":continue
        dest=pathlib.PurePosixPath(m.get("Destination","/"))
        base=pathlib.Path(m.get("Source","/"))
        if str(dest)=="/app/public":
            roots.append(base)
        elif str(dest)=="/app":
            roots.append(base/"public")
        elif str(dest).endswith("/public"):
            roots.append(base)
        elif str(dest).endswith("/app"):
            roots.append(base/"public")
    return roots

def inject(data):
    t=data.decode("utf8")
    if START in t or END in t:
        if t.count(START)!=1 or t.count(END)!=1:raise RuntimeError("Duplicate panel markers")
        a=t.index(START); b=t.index(END,a)+len(END)
        t=t[:a]+PANEL+t[b:]
    else:
        anchors=list(re.finditer(r'<div\s+class="card analytics-card"',t,re.I))
        if len(anchors)==1:
            at=anchors[0].start()
        else:
            closers=list(re.finditer(r"</body\s*>",t,re.I))
            if len(closers)!=1:raise RuntimeError("Cannot place report safely in HTML")
            at=closers[0].start()
        t=t[:at]+PANEL+"\n"+t[at:]
    return t.encode("utf8")

def write_atomic(p,b):
    fd,tmp=tempfile.mkstemp(prefix=".kq247-r34-stats-",dir=p.parent)
    try:
        os.fchmod(fd,p.stat().st_mode & 0o777 if p.exists() else 0o644)
        with os.fdopen(fd,"wb") as f:
            f.write(b);f.flush();os.fsync(f.fileno())
        os.replace(tmp,p)
    finally:
        if os.path.exists(tmp):os.unlink(tmp)

def main():
    import argparse
    parser=argparse.ArgumentParser()
    parser.add_argument("--check",action="store_true")
    parser.add_argument("--apply",action="store_true")
    args=parser.parse_args()
    if args.check==args.apply:parser.error("Choose exactly --check or --apply")
    report=fetch(REPORT_URL,limit=500000)
    if sha(report)!=REPORT_SHA256 or b"R21_USER34_FULL_PRIMARY_REDUCED_EXTRA_30_60_150_DRAWS" not in report:
        raise RuntimeError("R34 verified report SHA/schema mismatch")
    live_main=public("/")
    live_guest=public("/guest-snapshot.html")
    live_client=public("/client.html")
    if len(live_main)<25000 or len(live_guest)<25000:
        raise RuntimeError("Unexpected public HTML")
    containers=get_containers()
    running_before=sorted(c["Id"] for c in containers)
    matches=[]
    for container in containers:
        ports=sorted(p for p in exposed_ports(container) if p in (18142,18147,18148,18088))
        for port in ports:
            try:
                if local(port,"/")!=live_main or local(port,"/guest-snapshot.html")!=live_guest or local(port,"/client.html")!=live_client:
                    continue
            except Exception:continue
            for root in mounted_public_roots(container):
                main=root/"index.html";guest=root/"guest-snapshot.html";client=root/"client.html"
                if not all(p.is_file() for p in (main,guest,client)):continue
                if main.read_bytes()==live_main and guest.read_bytes()==live_guest and client.read_bytes()==live_client:
                    matches.append((root,port,container.get("Name","")))
    distinct={}
    for root,port,name in matches: distinct[str(root.resolve())]=(root,port,name)
    if not distinct:
        raise RuntimeError("No writable host bind mounts correspond to PUBLIC HTTPS. Do not patch 18088/R33 by mistake.")
    roots=list(distinct.values())
    print("HTTPS_MATCHED_ROOTS="+json.dumps([{"root":str(r),"port":p,"container":n} for r,p,n in roots],ensure_ascii=False))
    originals={}
    newfiles={}
    for root,port,name in roots:
        for filename in ("index.html","guest-snapshot.html"):
            f=root/filename
            if f not in originals:originals[f]=f.read_bytes()
        f=root/REPORT_NAME
        if f not in originals: originals[f]=f.read_bytes() if f.exists() else None
        for filename in ("index.html","guest-snapshot.html"):
            f=root/filename
            newfiles[f]=inject(originals[f])
        newfiles[root/REPORT_NAME]=report
    preserve={}
    for root,_,_ in roots:
        for filename in ("client.html","state.json","backtest-60.json"):
            f=root/filename
            if f.is_file():preserve[f]=sha(f.read_bytes())
    print("PUBLIC_STATS_PRECHECK=PASS; MATCHED_PUBLIC_MAIN_AND_GUEST=YES; CUSTOMER_AUTH_UNCHANGED=YES")
    if args.check:
        print("NO_FILES_CHANGED=YES")
        return
    stamp=datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    first_root=roots[0][0]
    backup_dir=first_root.parent/"versions"/("r34-public-stats-"+stamp)
    if backup_dir.exists():raise RuntimeError("Backup collision")
    backup_dir.mkdir(parents=True)
    index={}
    for f,old in originals.items():
        if old is not None:
            archive=backup_dir/(sha(str(f).encode())[:12]+"-"+f.name)
            write_atomic(archive,old)
            index[str(f)]=str(archive)
        else:index[str(f)]=None
    write_atomic(backup_dir/"backup-index.json",json.dumps(index,indent=2).encode())
    try:
        for f,b in newfiles.items():
            if b is not None:write_atomic(f,b)
        for f,old in preserve.items():
            if sha(f.read_bytes())!=old:raise RuntimeError("Protected file changed: "+str(f))
        for root,port,name in roots:
            if START.encode() not in local(port,"/") or START.encode() not in local(port,"/guest-snapshot.html"):
                raise RuntimeError("Local served HTML verification failed on "+str(port))
            if sha(local(port,"/"+REPORT_NAME))!=REPORT_SHA256:
                raise RuntimeError("Local report verification failed on "+str(port))
        if START.encode() not in public("/") or START.encode() not in public("/guest-snapshot.html"):
            raise RuntimeError("PUBLIC HTTPS MAIN/GUEST HTML still does not show statistics")
        if sha(public("/"+REPORT_NAME))!=REPORT_SHA256:
            raise RuntimeError("PUBLIC HTTPS verified report not served")
        if public("/client.html")!=live_client:
            raise RuntimeError("PUBLIC client license page changed")
        ids_after=sorted(c["Id"] for c in get_containers())
        if ids_after!=running_before:raise RuntimeError("Container IDs unexpectedly changed")
        print("KQ247_R34_PUBLIC_MAIN_AND_CUSTOMER_STATS=PASS")
        print("PUBLIC_HTTPS_REPORT=200; SNAPSHOT_AND_AUTH_UNCHANGED=YES")
        print("BACKUP_DIR="+str(backup_dir))
    except Exception:
        for f,old in originals.items():
            if old is None:
                if f.exists():f.unlink()
            else:write_atomic(f,old)
        print("ROLLBACK_ALL_PATCHED_HTML=YES; BACKUP_DIR="+str(backup_dir))
        raise

if __name__=="__main__":main()
