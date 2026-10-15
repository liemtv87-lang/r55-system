#!/usr/bin/env bash
set -euo pipefail
if [ "$(id -u)" -ne 0 ]; then echo 'CAN CHAY VOI QUYEN root'; exit 1; fi
install -d -m 700 /opt/kq247/ops
install -d -m 750 /var/log/kq247-ops
cat > /opt/kq247/ops/agent.py <<'PY'
#!/usr/bin/env python3
import datetime as dt, hashlib, json, os, pathlib, re, shutil, subprocess, sys, tempfile, time, urllib.request
BASE=pathlib.Path('/opt/kq247/ops')
STATE=BASE/'state.json'
LOG=pathlib.Path('/var/log/kq247-ops/monitor.jsonl')
URL='https://vietlott.64-120-92-172.sslip.io'
REPORT='kq247-r34-thong-ke.html'
REPORT_SHA='85b19d770b87778d6e4b243478eba576904a11c7f74e553e700074e5f8ed54a5'
PANEL_START='<!-- KQ247_R34_VERIFIED_STATS_PANEL_BEGIN -->'
PANEL_END='<!-- KQ247_R34_VERIFIED_STATS_PANEL_END -->'
PANEL='''<!-- KQ247_R34_VERIFIED_STATS_PANEL_BEGIN -->
<section id="kq247-r34-verified-stats" style="max-width:1100px;margin:14px auto;padding:12px;border:1px solid #ddd;border-radius:12px;background:#fff"><h2 style="color:#c72228">THỐNG KÊ VIETLOTT R34 — 30 / 60 / 150 KỲ</h2><p>Hồi kiểm toàn bộ dàn sau đúng 34 điều kiện; dàn rút gọn là phần bổ sung.</p><iframe src="/kq247-r34-thong-ke.html" title="Báo cáo Vietlott R34" style="width:100%;height:1750px;border:0"></iframe></section>
<!-- KQ247_R34_VERIFIED_STATS_PANEL_END -->'''
SAFE_PROD=re.compile(r'kq247|r55|vietlott|xoso|lottery|football|xs[-_]|bd[-_]|seo|sales|telegram|bot',re.I)
EXCLUDE=re.compile(r'stage|replay|test|sandbox|backtest|runner|temp|research',re.I)

def cmd(*args,timeout=20):
    return subprocess.run(args,text=True,capture_output=True,timeout=timeout,check=True).stdout

def log(event,**data):
    obj={'time_utc':dt.datetime.now(dt.timezone.utc).isoformat(),'event':event,**data}
    with LOG.open('a') as f:f.write(json.dumps(obj,ensure_ascii=False)+'\n')
    print(json.dumps(obj,ensure_ascii=False))

def load():
    try:return json.loads(STATE.read_text())
    except (OSError,ValueError):return {}

def save(s):
    fd,p=tempfile.mkstemp(dir=BASE,prefix='.state-')
    try:
        with os.fdopen(fd,'w') as f:json.dump(s,f,ensure_ascii=False,indent=2)
        os.replace(p,STATE)
    finally:
        if os.path.exists(p):os.unlink(p)

def get_docker():
    ids=cmd('docker','ps','-aq',timeout=12).split()
    return json.loads(cmd('docker','inspect',*ids,timeout=25)) if ids else []

def http(url,limit=1000000):
    req=urllib.request.Request(url,headers={'User-Agent':'KQ247-VPS-local-monitor','Cache-Control':'no-cache'})
    with urllib.request.urlopen(req,timeout=8) as r:
        if r.status!=200:raise RuntimeError('HTTP '+str(r.status))
        d=r.read(limit+1)
        if len(d)>limit:raise RuntimeError('response too large')
        return d

def digest(b):return hashlib.sha256(b).hexdigest()

def setfile(p,b):
    fd,tmp=tempfile.mkstemp(prefix='.kq247-',dir=p.parent)
    try:
        os.fchmod(fd,p.stat().st_mode & 0o777 if p.exists() else 0o644)
        with os.fdopen(fd,'wb') as f:f.write(b);f.flush();os.fsync(f.fileno())
        os.replace(tmp,p)
    finally:
        if os.path.exists(tmp):os.unlink(tmp)

def bind_roots(container):
    for m in container.get('Mounts',[]):
        if m.get('Type')!='bind':continue
        dest=m.get('Destination','').rstrip('/')
        src=pathlib.Path(m.get('Source','/'))
        if dest.endswith('/public'):yield src
        elif dest.endswith('/app'):yield src/'public'

def host_ports(c):
    for rows in (c.get('NetworkSettings',{}).get('Ports',{}) or {}).values():
        for row in rows or []:
            try:yield int(row['HostPort'])
            except (KeyError,TypeError,ValueError):pass

def fix_public_stats(containers):
    source=pathlib.Path('/opt/kq247/vietlott-r33-primary/public')/REPORT
    if not source.is_file() or digest(source.read_bytes())!=REPORT_SHA:
        raise RuntimeError('Báo cáo R34 gốc không đúng SHA256, không sửa')
    report=source.read_bytes()
    public_main=http(URL+'/')
    public_guest=http(URL+'/guest-snapshot.html')
    public_client=http(URL+'/client.html')
    if len(public_main)<25000 or len(public_guest)<25000:raise RuntimeError('Public HTML invalid')
    roots={}
    for c in containers:
        if not c.get('State',{}).get('Running'):continue
        for port in host_ports(c):
            if not (18000<=port<=18999):continue
            try:
                if http('http://127.0.0.1:'+str(port)+'/')!=public_main:continue
                if http('http://127.0.0.1:'+str(port)+'/guest-snapshot.html')!=public_guest:continue
            except Exception:continue
            for root in bind_roots(c):
                main,guest,client=root/'index.html',root/'guest-snapshot.html',root/'client.html'
                if all(p.is_file() for p in (main,guest,client)):
                    if main.read_bytes()==public_main and guest.read_bytes()==public_guest and client.read_bytes()==public_client:
                        roots[str(root.resolve())]=(root,port)
    if not roots:raise RuntimeError('Khong tim duoc public bind mount chinh xac; KHONG sua nham')
    changes={}
    for root,_ in roots.values():
        for name in ['index.html','guest-snapshot.html']:
            p=root/name;original=p.read_bytes();s=original.decode('utf8')
            if PANEL_START not in s:
                marks=list(re.finditer(r'</body\s*>',s,re.I))
                if len(marks)!=1:raise RuntimeError('HTML body ambiguous '+str(p))
                s=s[:marks[0].start()]+PANEL+'\n'+s[marks[0].start():]
            elif s.count(PANEL_START)!=1 or s.count(PANEL_END)!=1:
                raise RuntimeError('Stats marker conflict '+str(p))
            changes[p]=(original,s.encode())
        p=root/REPORT
        changes[p]=(p.read_bytes() if p.exists() else None,report)
    backup=BASE/'backups'/dt.datetime.now(dt.timezone.utc).strftime('%Y%m%dT%H%M%S')
    backup.mkdir(parents=True,exist_ok=False)
    manifest={}
    for p,(old,_) in changes.items():
        if old is not None:
            out=backup/(digest(str(p).encode())[:12]+'-'+p.name)
            setfile(out,old);manifest[str(p)]=str(out)
        else:manifest[str(p)]=None
    setfile(backup/'manifest.json',json.dumps(manifest,indent=2).encode())
    try:
        for p,(_,new) in changes.items():setfile(p,new)
        for root,port in roots.values():
            if PANEL_START.encode() not in http('http://127.0.0.1:'+str(port)+'/'):
                raise RuntimeError('Local route not updated')
        if PANEL_START.encode() not in http(URL+'/') or PANEL_START.encode() not in http(URL+'/guest-snapshot.html'):
            raise RuntimeError('Public HTTPS not updated')
        if digest(http(URL+'/'+REPORT,limit=200000))!=REPORT_SHA:raise RuntimeError('Public stats wrong SHA')
        if http(URL+'/client.html')!=public_client:raise RuntimeError('Client license HTML changed')
    except BaseException:
        for p,(old,_) in changes.items():
            if old is None:
                if p.exists():p.unlink()
            else:setfile(p,old)
        log('public_stats_rollback',backup=str(backup))
        raise
    log('public_stats_verified',paths=[str(r) for r,_ in roots.values()],backup=str(backup))

def init():
    containers=get_docker()
    active=[c['Name'].lstrip('/') for c in containers if c.get('State',{}).get('Running') and SAFE_PROD.search(c['Name']) and not EXCLUDE.search(c['Name'])]
    timers=[]
    try:
        rows=cmd('systemctl','list-units','--type=timer','--state=active','--all','--no-legend','--no-pager',timeout=15).splitlines()
        for row in rows:
            name=row.split()[0] if row.split() else ''
            if name.endswith('.timer') and SAFE_PROD.search(name) and name!='kq247-ops.timer':timers.append(name)
    except Exception as e:log('timer_discovery_error',error=str(e))
    if not active:
        raise RuntimeError('Không nhận diện được container KQ247 đang chạy; từ chối tạo cấu hình rỗng')
    probes=[]
    for c in containers:
        name=c['Name'].lstrip('/')
        if name not in active:continue
        for port in host_ports(c):
            if port < 18000 or port > 18999:continue
            for route in ['/healthz','/health','/api/health','/status','/']:
                try:
                    http('http://127.0.0.1:'+str(port)+route,limit=100000)
                    probes.append({'name':name,'port':port,'route':route})
                    break
                except Exception:pass
    s=load();s.setdefault('managed',active);s.setdefault('timers',timers);s.setdefault('probes',probes);s.setdefault('fails',{});s.setdefault('restarts',{});save(s)
    log('setup_complete',managed=s['managed'],timers=s['timers'],probes=s['probes'])
    try:fix_public_stats(containers)
    except Exception as e:log('public_stats_fix_needs_attention',error=str(e))

def monitor():
    s=load();fails=s.setdefault('fails',{});restarts=s.setdefault('restarts',{})
    try:containers=get_docker()
    except Exception as e:log('docker_discovery_error',error=str(e));return
    by_name={c['Name'].lstrip('/'):c for c in containers}
    now=time.time()
    for name in s.get('managed',[]):
        c=by_name.get(name);state=c.get('State',{}) if c else {}
        running=bool(state.get('Running'));health=state.get('Health',{}).get('Status','none')
        bad=not running or health=='unhealthy'
        key='docker:'+name
        fails[key]=fails.get(key,0)+1 if bad else 0
        if bad:log('docker_issue',name=name,running=running,health=health,consecutive=fails[key])
        # Limit actions and avoid forced Docker restarts of running containers/bots.
        # Stop/start only a previously active container that is now stopped.
        if not running and c and fails[key]>=3 and now-restarts.get(key,0)>21600:
            try:
                cmd('docker','start',name,timeout=25)
                restarts[key]=now;fails[key]=0;log('docker_recovered',name=name,action='start')
            except Exception as e:log('docker_recovery_failed',name=name,error=str(e))
    for unit in s.get('timers',[]):
        try:active=cmd('systemctl','is-active',unit,timeout=8).strip()=='active'
        except Exception:active=False
        key='timer:'+unit;fails[key]=0 if active else fails.get(key,0)+1
        if not active:
            log('timer_issue',unit=unit,consecutive=fails[key])
            if fails[key]>=3 and now-restarts.get(key,0)>21600:
                try:cmd('systemctl','start',unit,timeout=20);restarts[key]=now;fails[key]=0;log('timer_recovered',unit=unit)
                except Exception as e:log('timer_recovery_failed',unit=unit,error=str(e))
    for entry in s.get('probes',[]):
        port,route=entry['port'],entry['route']
        try:http('http://127.0.0.1:'+str(port)+route,limit=100000)
        except Exception as e:log('service_http_issue',name=entry['name'],port=port,route=route,error=str(e))
    stats_bad=False
    for route in ['/','/guest-snapshot.html','/client.html','/'+REPORT]:
        try:
            data=http(URL+route,limit=1000000)
            good=(PANEL_START.encode() in data if route in ['/','/guest-snapshot.html'] else digest(data)==REPORT_SHA if route=='/'+REPORT else True)
            if not good:log('public_stats_not_synchronized',route=route);stats_bad=True
        except Exception as e:log('public_route_error',route=route,error=str(e));stats_bad=True
    key='public:stats'
    fails[key]=fails.get(key,0)+1 if stats_bad else 0
    if stats_bad and fails[key]>=3 and now-restarts.get(key,0)>21600:
        restarts[key]=now
        try:fix_public_stats(containers);fails[key]=0
        except Exception as e:log('public_stats_auto_repair_failed',error=str(e))
    save(s)
    log('monitor_completed',managed=len(s.get('managed',[])),timers=len(s.get('timers',[])))

if __name__=='__main__':
    if len(sys.argv)==2 and sys.argv[1]=='--setup':init()
    elif len(sys.argv)==2 and sys.argv[1]=='--monitor':monitor()
    elif len(sys.argv)==2 and sys.argv[1]=='--status':print(json.dumps(load(),ensure_ascii=False,indent=2))
    else:raise SystemExit('Use --setup, --monitor or --status')
PY
chmod 700 /opt/kq247/ops/agent.py
python3 -m py_compile /opt/kq247/ops/agent.py
cat > /etc/systemd/system/kq247-ops.service <<'UNIT'
[Unit]
Description=KQ247 VPS local monitor and safe self-heal
After=network-online.target docker.service
Wants=network-online.target
[Service]
Type=oneshot
User=root
ExecStart=/usr/bin/python3 /opt/kq247/ops/agent.py --monitor
TimeoutStartSec=110
Nice=10
UNIT
cat > /etc/systemd/system/kq247-ops.timer <<'TIMER'
[Unit]
Description=KQ247 VPS local monitor every 2 minutes
[Timer]
OnBootSec=2min
OnUnitInactiveSec=2min
AccuracySec=20s
Persistent=true
Unit=kq247-ops.service
[Install]
WantedBy=timers.target
TIMER
python3 /opt/kq247/ops/agent.py --setup
systemctl daemon-reload
systemctl enable --now kq247-ops.timer
systemctl start kq247-ops.service
systemctl --no-pager --full status kq247-ops.timer | head -15
printf '\nKIEM TRA: journalctl -u kq247-ops.service -n 30 --no-pager\n'