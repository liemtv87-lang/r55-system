#!/usr/bin/env python3
"""Add the verified R34 30/60/150 draw backtest to live Vietlott main+guest HTML.
Static UI only: no snapshot, engine, auth, database, Docker or bot changes.
"""
import argparse,datetime,hashlib,json,os,pathlib,re,subprocess,tempfile,urllib.request
REPORT="https://raw.githubusercontent.com/liemtv87-lang/r55-system/6ee85101ef2a3814b6b9c8fceec610187626e1ee/deployment/vietlott/r34-verified-150-statistics-public.html"
HASH="85b19d770b87778d6e4b243478eba576904a11c7f74e553e700074e5f8ed54a5"
PAGE="kq247-r34-thong-ke.html"
BEGIN="<!-- KQ247_R34_VERIFIED_STATS_PANEL_BEGIN -->"
END="<!-- KQ247_R34_VERIFIED_STATS_PANEL_END -->"
PANEL="""
<!-- KQ247_R34_VERIFIED_STATS_PANEL_BEGIN -->
<section id="kq247-r34-verified-stats-panel" style="display:block;position:relative;z-index:2;max-width:1120px;margin:16px auto;padding:8px;background:#fff;border:1px solid #ddd;border-radius:12px">
<h2 style="color:#c42029;font-weight:900;margin:8px 0">THỐNG KÊ VIETLOTT R34 — 30 / 60 / 150 KỲ</h2>
<p style="margin:6px 0 10px;font-size:12px">Hồi kiểm lịch sử 48/48 phần đã xác minh. CHÍNH: toàn bộ số sau 34 điều kiện; rút gọn chỉ là bổ sung. Không thay dự đoán hay SNAP hiện tại.</p>
<iframe title="Thống kê Vietlott R34" src="/kq247-r34-thong-ke.html" loading="lazy" referrerpolicy="same-origin" style="display:block;width:100%;height:1250px;border:0;border-radius:9px;background:#f6f8fc"></iframe>
<script>window.addEventListener('message',function(e){if(e.origin!==location.origin||!e.data||e.data.type!=='KQ247_R34_STATS_HEIGHT')return;var f=document.querySelector('#kq247-r34-verified-stats-panel iframe');if(f&&e.source===f.contentWindow)f.style.height=Math.max(600,Math.min(6000,Number(e.data.height)+24))+'px';})</script>
</section>
<!-- KQ247_R34_VERIFIED_STATS_PANEL_END -->
"""
def digest(data):return hashlib.sha256(data).hexdigest()
def atomic(path,data):
    fd,tmp=tempfile.mkstemp(prefix=".r34stats-",dir=path.parent)
    try:
        os.fchmod(fd,0o644)
        with os.fdopen(fd,"wb") as f:f.write(data);f.flush();os.fsync(f.fileno())
        os.replace(tmp,path)
    finally:
        if os.path.exists(tmp):os.unlink(tmp)
def root():
    v=subprocess.run(["docker","inspect","kq247-vietlott-vps"],capture_output=True,text=True,check=True,timeout=15)
    mounts=json.loads(v.stdout)[0]["Mounts"]
    paths=[pathlib.Path(m["Source"]).resolve() for m in mounts if m.get("Destination","").endswith("/public") and (pathlib.Path(m["Source"])/"index.html").is_file()]
    if len(paths)!=1:raise RuntimeError("Không xác minh được DUY NHẤT live /public bind mount: "+str(paths))
    return paths[0]
def inject(raw):
    t=raw.decode("utf8")
    if BEGIN in t or END in t:
        if t.count(BEGIN)!=1 or t.count(END)!=1:raise RuntimeError("Trùng dấu mốc HTML")
        a=t.index(BEGIN);b=t.index(END,a)+len(END)
        t=t[:a]+PANEL+t[b:]
    else:
        match=list(re.finditer(r"</body\s*>",t,re.I))
        if len(match)!=1:raise RuntimeError("HTML không có duy nhất thẻ đóng body")
        m=match[0];t=t[:m.start()]+PANEL+t[m.start():]
    return t.encode("utf8")
def http(port,suffix):
    with urllib.request.urlopen("http://127.0.0.1:"+str(port)+suffix,timeout=12) as r:
        return r.status,r.read()
def main():
    a=argparse.ArgumentParser()
    x=a.add_mutually_exclusive_group(required=True)
    x.add_argument("--check",action="store_true")
    x.add_argument("--apply",action="store_true")
    a.add_argument("--port",type=int,default=18088)
    args=a.parse_args()
    with urllib.request.urlopen(REPORT,timeout=25) as res:data=res.read()
    if digest(data)!=HASH:raise RuntimeError("Sai SHA256 của thống kê nguồn; không sửa trang")
    if b"R21_USER34_FULL_PRIMARY_REDUCED_EXTRA_30_60_150_DRAWS" not in data:raise RuntimeError("Sai schema báo cáo")
    p=root()
    main_html=p/"index.html";guest=p/"guest-snapshot.html";client=p/"client.html"
    if not main_html.is_file() or not client.is_file():
        raise RuntimeError("Thiếu index.html hoặc trang kích hoạt client.html trong live bind mount")
    main_bytes=main_html.read_bytes()
    client_bytes=client.read_bytes()
    # Existing customer wrapper deliberately reuses the live index via ?client=1.
    # It does NOT request /guest-snapshot.html. Do not fabricate or replace it.
    shared_client=(b"?client=1" in client_bytes and
                   b"const CLIENT_MODE=" in main_bytes and
                   (b".client-mode aside" in main_bytes or b".client-snapshot-only aside" in main_bytes))
    guest_available=guest.is_file()
    if not guest_available and not shared_client:
        raise RuntimeError("Khách không dùng ?client=1 và thiếu guest route; từ chối cài sai đường dẫn")
    targets=[main_html]+([guest] if guest_available else [])
    previous={path:path.read_bytes() for path in targets}
    if any(len(raw)<25000 for raw in previous.values()):
        raise RuntimeError("HTML không đúng cấu trúc dự kiến")
    patched={path:inject(b) for path,b in previous.items()}
    static=p/PAGE;old_static=static.read_bytes() if static.exists() else None
    dont_touch=[q for q in [client,p/"state.json"] if q.exists()]
    dont_touch+=list(p.glob("*pool*.json"))
    unchanged={q:digest(q.read_bytes()) for q in dont_touch}
    checks=[("/",previous[main_html]),("/?client=1",previous[main_html]),("/client.html",client_bytes)]
    if guest_available:
        checks.append(("/guest-snapshot.html",previous[guest]))
    for route,raw in checks:
        code,page=http(args.port,route)
        if code!=200:raise RuntimeError("Route "+route+" trả "+str(code))
        if raw is not None and digest(page)!=digest(raw):
            raise RuntimeError("HTTP "+route+" không khớp live bind mount; từ chối sửa nhầm trang")
    print("R34_150_DRAW_REPORT_VERIFIED_SHA256="+HASH)
    print("LIVE_ROOT="+str(p))
    print("UI_TARGETS="+(",".join(f.name for f in targets))+"; SHARED_CLIENT_MODE="+str(shared_client)+"; CLIENT_AUTH_UNCHANGED=YES")
    if args.check:
        print("PRECHECK=PASS; NO_FILES_CHANGED=YES")
        return
    ts=datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    backup=p.parent/"versions"/("r34-stats-ui-"+ts);backup.mkdir(parents=True,exist_ok=False)
    for f,b in previous.items():atomic(backup/f.name,b)
    if old_static is not None:atomic(backup/("old-"+PAGE),old_static)
    try:
        atomic(static,data)
        for f,b in patched.items():atomic(f,b)
        for f in targets:
            if f.read_text("utf8").count(BEGIN)!=1:raise RuntimeError("HTML chưa có panel "+f.name)
        for f,h in unchanged.items():
            if digest(f.read_bytes())!=h:raise RuntimeError("Một file cần bảo toàn đã thay đổi: "+str(f))
        for route in ["/","/?client=1"]+(["/guest-snapshot.html"] if guest_available else []):
            code,page=http(args.port,route)
            if code!=200 or BEGIN.encode() not in page:raise RuntimeError("HTTP panel failed "+route)
        code,page=http(args.port,"/"+PAGE)
        if code!=200 or digest(page)!=HASH:raise RuntimeError("HTTP report failed")
        code,served_client=http(args.port,"/client.html")
        if code!=200 or digest(served_client)!=digest(client_bytes):
            raise RuntimeError("Customer activation page changed or not reachable")
        print("APPLIED=YES; LIVE_MAIN_AND_SHARED_CUSTOMER_STATS=HTTP_PASS")
        print("BACKUP="+str(backup))
        print("SNAPSHOT_AUTH_BOTS_AND_CONTAINERS_NOT_MODIFIED=YES")
    except Exception:
        for f,b in previous.items():atomic(f,b)
        if old_static is None and static.exists():static.unlink()
        elif old_static is not None:atomic(static,old_static)
        print("ROLLBACK_PREVIOUS_UI=YES; BACKUP="+str(backup))
        raise
if __name__=="__main__":main()
