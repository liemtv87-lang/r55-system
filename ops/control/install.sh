#!/usr/bin/env bash
set -euo pipefail
umask 077
if [ "$(id -u)" -ne 0 ]; then
  echo "CAN DAN VAO TERMINAL ROOT TREN VPS" >&2
  exit 1
fi
for x in python3 openssl systemctl; do
  command -v "$x" >/dev/null || { echo "Thieu cong cu: $x" >&2; exit 1; }
done
install -d -m 700 /opt/kq247/remote
install -d -m 755 /opt/kq247/vietlott-r33-primary/public/kq247-ops-replies
# This relay is separate from existing Docker containers and KQ247 monitor.
# Never store tokens, passwords, or signing private keys on the VPS.
cat > /opt/kq247/remote/signing-public.pem <<'KEY'
-----BEGIN PUBLIC KEY-----
MIIBojANBgkqhkiG9w0BAQEFAAOCAY8AMIIBigKCAYEAuPh4Jj2Z0lDS4ufRM81p
zIpgg1Kv7YwUcwdHZB6Xa8+EX1Jq0O+ATdgxvjOS7NDOUV7oQGGkmb9a5zjuXU4+
RDCtDTl9pOUjOOZmuxmfC+uwMmELoBiICkGRRWgX5cdoR/IPPdPAUSAn3VUs305q
ITkaCjMIVnDDUUyE6F6BEwiQT+XKAfl7ayGaVCe14xvPT2eZ7NRe7IP8npD8aPsR
xM3GE+3+4hDRcP3n8gYpw/9UdPTlNbSXuLbz0Z4YRjaSVPlumouAaOv3sMrd7NR1
GCI+sRE+VP161xumZtgTuPjhkyNeHtCjV4kY7wBJKHF2NlwFS5DWDKd1IxLj1+VH
p2EvSqgKVJYc1uu+FXFW0NpPdWE2bXoNy6KgA3xsNHyiOrZ4yoKfHGFGRHdFw1+/
M5M4Fg7dXG33QzWOVcpwBFPL30i8VlG7smG9BsgZf1Dx+IwMTpJXUQPn929VuQBL
SqihA2AMD0stq767KFPJDmqA6A6TotNg8qnpj93VP0xPAgMBAAE=
-----END PUBLIC KEY-----
KEY
cat > /opt/kq247/remote/response-encrypt-cert.pem <<'CERT'
-----BEGIN CERTIFICATE-----
MIIEPzCCAqegAwIBAgIUCXAmR2ZeRgzBvaeT4gIKhcI4hpUwDQYJKoZIhvcNAQEL
BQAwLzEtMCsGA1UEAwwkS1EyNDcgQ29udHJvbGxlciBSZXNwb25zZSBFbmNyeXB0
aW9uMB4XDTI2MTAxNTIzMTU0MVoXDTM2MTAxMjIzMTU0MVowLzEtMCsGA1UEAwwk
S1EyNDcgQ29udHJvbGxlciBSZXNwb25zZSBFbmNyeXB0aW9uMIIBojANBgkqhkiG
9w0BAQEFAAOCAY8AMIIBigKCAYEAiq37bKoNj5RNyVdHusIahvVt18rSh4gdDgWE
eTNnqZbTkIKB4GjpEfOH/YlZfUo78xNbbQxmZQoP+D6z9uefp9/3SEHSv3mdUIJ0
SLFFxm/m0nPoU7IkvJgPCMljiHsOkXEC0w/epUsUCLFUpn/cnRQbcJdo0D8x+i1C
mQ1bMyqXS5EAXoOIBviJTtEmHOp3UDXeO8Z6C0FIlkrMl2X2CzyYN3De4KqeCuBx
1Yc6EC4mnvX3KWujSnew02z7kiG0e9fQmwuKohIua/vCE12jYkYkoyZKvNfPkmJ3
gaKPforfqTmkKMRlgUspj9J/hDVNE7Wj4b1lJ7jlLjy3z5t71ZVUQNUyl1yjDy47
v9xDMij0s5eDBZRk0Ef4OXSOW61JzJal/Kn3TmufW+JxW0xdzd0WoVrQjxcuaPsl
/7Tf4WEMmWKEK9VUvy7VpDLSrMo/AErphEKqOSOMPBBOLMOgn8SNb8M9/8vGHHIr
BIj3V2nTxVrskoNbU/5jq2ApshDbAgMBAAGjUzBRMB0GA1UdDgQWBBR7CpyMg29e
FCd+gJbsn4uFR5VYxzAfBgNVHSMEGDAWgBR7CpyMg29eFCd+gJbsn4uFR5VYxzAP
BgNVHRMBAf8EBTADAQH/MA0GCSqGSIb3DQEBCwUAA4IBgQAXuDOqKd6ux+sNBagr
4Mjl5TxlnWeIk5RadbnsQGKWVyoOiWbGC7+xNG/RwcdFPWzo5EhFKi4spZm+yvCM
WZaofEJ42kDE/xhYBRghL/PO+ZtwNFn+WR0cWE35lVObTRkk5PsyaTLh7RDkxRX5
QpHAcHx/txxH0KoNvYVsryuAGBPp9nAVolkIsw4BzxsRghg65Pxe5/yDx5qFWEIm
PLbxI7SqWsI09prHwyNxegE8+1yNwIaqLdCRlOJ6/jVXEQ0VoZ+EkGBrbEmhn8vm
VuoY2Kv76ndI6QwNxbT5DQbFFAEhdbLOG3onPgXZp2qqPSPLLtQ6kjT4hNRquAbd
GcK+zi5f1gtp9SbSXJpFTMAHyoPtcObb/VEFom2OUIH9zmydGof+9MBqW9NTmQlu
+NP1EMMlb0w2cMmSivbXEdFYPBNjvCxBqTWPYFaFC92Hc6UrZycv+50VE+ugIG9C
SKccdfv/DTc16vSiRDpoXCmO2LH1EfECz/JjWspp5AQV+64=
-----END CERTIFICATE-----
CERT
cat > /opt/kq247/remote/agent.py <<'PYCODE'
#!/usr/bin/env python3
"""KQ247 signed remote job relay. Runs on VPS, requires OpenSSL and Python 3."""
import base64
import datetime as dt
import fcntl
import json
import os
import pathlib
import re
import subprocess
import sys
import tempfile
import time
import urllib.request

ROOT = pathlib.Path('/opt/kq247/remote')
PUB = ROOT / 'signing-public.pem'
CERT = ROOT / 'response-encrypt-cert.pem'
STATE = ROOT / 'state.json'
LOG = ROOT / 'events.jsonl'
JOB_URL = 'https://raw.githubusercontent.com/liemtv87-lang/r55-system/main/ops/control/current-job.json'
PUBLIC_DIR = pathlib.Path('/opt/kq247/vietlott-r33-primary/public/kq247-ops-replies')
MAX_LOG = 96_000

def write_atomic(dst, data, mode=0o600):
    dst.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=dst.parent, prefix='.tmp-kq247-')
    try:
        os.fchmod(fd, mode)
        with os.fdopen(fd, 'wb') as f:
            f.write(data)
            f.flush()
            os.fsync(f.fileno())
        os.replace(tmp, dst)
    finally:
        if os.path.exists(tmp):
            os.unlink(tmp)

def event(kind, **kv):
    record = {'at': dt.datetime.now(dt.timezone.utc).isoformat(), 'event': kind, **kv}
    with LOG.open('a', encoding='utf8') as f:
        f.write(json.dumps(record, ensure_ascii=False) + '\n')
    print(json.dumps(record, ensure_ascii=False), flush=True)

def current_state():
    try:
        data = json.loads(STATE.read_text())
        return data if isinstance(data, dict) else {}
    except (OSError, json.JSONDecodeError):
        return {}

def verify(data):
    if not isinstance(data, dict) or set(data) != {'payload_b64','signature_b64'}:
        raise ValueError('Invalid signed envelope')
    payload = base64.b64decode(data['payload_b64'], validate=True)
    signature = base64.b64decode(data['signature_b64'], validate=True)
    if len(payload) > 64000 or len(signature) > 8192:
        raise ValueError('Envelope too large')
    with tempfile.TemporaryDirectory(prefix='kq247-verify-') as td:
        a = pathlib.Path(td)/'payload'
        b = pathlib.Path(td)/'signature'
        a.write_bytes(payload)
        b.write_bytes(signature)
        res = subprocess.run(['openssl','dgst','-sha256','-verify',str(PUB),'-signature',str(b),str(a)], capture_output=True, timeout=10)
        if res.returncode != 0:
            raise ValueError('Signature verification failed')
    job = json.loads(payload)
    if set(job) != {'id','expires','shell','timeout_seconds'}:
        raise ValueError('Unexpected job fields')
    if not isinstance(job['id'], str) or not re.fullmatch(r'[a-zA-Z0-9_-]{8,80}', job['id']):
        raise ValueError('Invalid id')
    if not isinstance(job['shell'], str) or len(job['shell']) > 50000:
        raise ValueError('Invalid command')
    if not isinstance(job['timeout_seconds'], int) or not (1 <= job['timeout_seconds'] <= 7200):
        raise ValueError('Invalid timeout')
    if not isinstance(job['expires'], str):
        raise ValueError('Invalid expires')
    expiry = dt.datetime.fromisoformat(job['expires'].replace('Z','+00:00'))
    now = dt.datetime.now(dt.timezone.utc)
    if expiry <= now or expiry > now + dt.timedelta(days=8):
        raise ValueError('Expired or unreasonably long job')
    return job

def publish_result(report):
    PUBLIC_DIR.mkdir(parents=True, exist_ok=True)
    result_path = PUBLIC_DIR / (report['id'] + '.pem')
    if result_path.exists():
        raise ValueError('Report path already exists')
    with tempfile.TemporaryDirectory(prefix='kq247-encrypt-') as td:
        src = pathlib.Path(td)/'input.json'
        dst = pathlib.Path(td)/'result.pem'
        src.write_text(json.dumps(report,ensure_ascii=False),encoding='utf8')
        enc = subprocess.run(['openssl','cms','-encrypt','-binary','-aes256','-in',str(src),'-out',str(dst),'-outform','PEM',str(CERT)], capture_output=True,text=True,timeout=20)
        if enc.returncode != 0:
            raise RuntimeError('Cannot encrypt response: '+enc.stderr[:200])
        write_atomic(result_path,dst.read_bytes(),0o644)
    event('reply_encrypted',job_id=report['id'],relative_path='/kq247-ops-replies/'+report['id']+'.pem')

def work(job):
    state = current_state()
    seen = state.get('seen', [])
    if job['id'] in seen:
        return
    # Persist job ID BEFORE execution to make delivery at-most-once after reboot.
    seen.append(job['id'])
    state['seen'] = seen[-400:]
    state['last_started'] = {'id':job['id'],'at':dt.datetime.now(dt.timezone.utc).isoformat()}
    write_atomic(STATE,json.dumps(state,ensure_ascii=False).encode())
    start = time.monotonic()
    event('job_started',job_id=job['id'])
    try:
        p = subprocess.run(['/bin/bash','-euo','pipefail','-c',job['shell']],capture_output=True,text=True,errors='replace',timeout=job['timeout_seconds'],cwd='/opt/kq247',env={**os.environ,'PATH':'/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin'})
        ret=p.returncode
        stdout=p.stdout[-MAX_LOG:]
        stderr=p.stderr[-MAX_LOG:]
        status='success' if ret == 0 else 'failed'
    except subprocess.TimeoutExpired as ex:
        ret=124
        status='timeout'
        stdout=(ex.stdout or b'').decode('utf8','replace')[-MAX_LOG:] if isinstance(ex.stdout,bytes) else str(ex.stdout or '')[-MAX_LOG:]
        stderr='Command timed out after %d sec' % job['timeout_seconds']
    except Exception as ex:
        ret=125
        status='error'
        stdout=''
        stderr=repr(ex)
    report={'id':job['id'],'status':status,'exit_code':ret,'duration_seconds':round(time.monotonic()-start,2),'stdout':stdout,'stderr':stderr,'timestamp':dt.datetime.now(dt.timezone.utc).isoformat()}
    try:
        publish_result(report)
    except Exception as ex:
        event('reply_publish_error',job_id=job['id'],reason=str(ex))
        write_atomic(ROOT/('failed-response-'+job['id']+'.json'),json.dumps(report).encode())
    event('job_completed',job_id=job['id'],status=status,exit_code=ret)

def poll():
    ROOT.mkdir(parents=True, exist_ok=True)
    lock=ROOT/'poll.lock'
    with lock.open('a+b') as f:
        try:
            fcntl.flock(f,fcntl.LOCK_EX|fcntl.LOCK_NB)
        except BlockingIOError:
            return
        req=urllib.request.Request(JOB_URL+'?t='+str(int(time.time())),headers={'User-Agent':'KQ247-Remote-Relay/1.0','Cache-Control':'no-cache'})
        try:
            with urllib.request.urlopen(req,timeout=12) as response:
                raw=response.read(150000)
            envelope=json.loads(raw)
            job=verify(envelope)
            work(job)
        except urllib.error.HTTPError as ex:
            if ex.code == 404:
                return
            event('job_fetch_error',reason=str(ex))
        except Exception as ex:
            event('job_poll_error',reason=str(ex)[:500])

if __name__ == '__main__':
    if len(sys.argv) == 2 and sys.argv[1] == '--poll':
        poll()
    elif len(sys.argv)==2 and sys.argv[1]=='--status':
        print(json.dumps(current_state(),ensure_ascii=False,indent=2))
    else:
        raise SystemExit('Usage: agent.py --poll | --status')
PYCODE
chmod 600 /opt/kq247/remote/signing-public.pem /opt/kq247/remote/response-encrypt-cert.pem
chmod 700 /opt/kq247/remote/agent.py
python3 -m py_compile /opt/kq247/remote/agent.py
openssl pkey -pubin -in /opt/kq247/remote/signing-public.pem -noout >/dev/null
openssl x509 -in /opt/kq247/remote/response-encrypt-cert.pem -noout >/dev/null
cat > /etc/systemd/system/kq247-remote.service <<'UNIT'
[Unit]
Description=KQ247 VPS signed remote command relay
After=network-online.target
Wants=network-online.target
[Service]
Type=oneshot
User=root
WorkingDirectory=/opt/kq247
ExecStart=/usr/bin/python3 /opt/kq247/remote/agent.py --poll
TimeoutStartSec=7500
Nice=10
StandardOutput=journal
StandardError=journal
UNIT
cat > /etc/systemd/system/kq247-remote.timer <<'TIMER'
[Unit]
Description=KQ247 authenticated remote jobs every minute
[Timer]
OnBootSec=30sec
OnUnitInactiveSec=60sec
AccuracySec=10sec
Persistent=true
Unit=kq247-remote.service
[Install]
WantedBy=timers.target
TIMER
systemctl daemon-reload
systemctl enable --now kq247-remote.timer
systemctl start --no-block kq247-remote.service || true
printf '\n=========================================\n'
printf 'KQ247: REMOTE RELAY INSTALLED\n'
printf 'Timer: '
systemctl is-enabled kq247-remote.timer
printf 'Public response folder: /opt/kq247/vietlott-r33-primary/public/kq247-ops-replies\n'
printf 'Docker & snapshots: UNCHANGED\n'
printf '=========================================\n'