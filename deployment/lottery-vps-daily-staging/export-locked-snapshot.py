#!/usr/bin/env python3
"""Exports ONLY a fully locked and validated PostgreSQL snapshot to an atomic read-only file.
Never reads prediction staging files and never computes predictions."""
import datetime, json, os, pathlib, subprocess, sys, hashlib
from zoneinfo import ZoneInfo

BASE=pathlib.Path('/opt/kq247/lottery-daily-staging')
now=datetime.datetime.now(ZoneInfo('Asia/Ho_Chi_Minh'))
day=(now.date()+datetime.timedelta(days=1) if (now.hour,now.minute)>=(19,30) else now.date())
if len(sys.argv)>1:
    requested=datetime.date.fromisoformat(sys.argv[1])
    if requested!=day:raise SystemExit('REFUSE_EXPORT_NOT_CURRENT_DAY')
daystr=day.isoformat()
q=f"""SELECT json_build_object('prediction',s.lock_payload,'lockedAt',s.locked_at,'sourceDate',s.source_last_date)::text
FROM kq247_xs_vps.locked_daily_snapshots s
JOIN kq247_xs_vps.customer_locked_full_snapshots v
USING(prediction_date,region,station)
WHERE s.region='mb' AND s.station='XSMB'
  AND s.prediction_date=DATE '{daystr}';"""
# Use stdin for SQL through docker exec -i (passwords never leave container).
proc=subprocess.run(['docker','exec','-i','kq247-r55-postgres','sh','-c',
    'psql -X -t -A -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"'],
    input=q,capture_output=True,text=True,timeout=25)
if proc.returncode:raise SystemExit('DB_EXPORT_FAILED '+proc.stderr[-500:])
lines=[s for s in proc.stdout.strip().splitlines() if s.strip()]
if len(lines)!=1:raise SystemExit('EXACTLY_ONE_LOCKED_FULL_SNAPSHOT_REQUIRED')
o=json.loads(lines[0])
p=o['prediction']
if p['publication']!='STAGING_UNPUBLISHED':raise SystemExit('UNKNOWN_SNAPSHOT_PROVENANCE')
expected=(day-datetime.timedelta(days=1)).isoformat()
if p['predictionDate']!=daystr or p['sourceDate']!=expected or str(o['sourceDate'])!=expected:
    raise SystemExit('SNAPSHOT_DATE_SOURCE_MISMATCH')
if not(p['sourceDraws']==500 and len(p['lotto3'])==3 and len(p['doubles'])==2):
    raise SystemExit('SNAPSHOT_LOTTO_INVALID')
de=p['de']
if [len(de[k]) for k in ('dan50','dan60','dan75','three_digit')]!=[50,60,75,500]:
    raise SystemExit('SNAPSHOT_POOLS_INVALID')
if not set(de['dan50']).issubset(de['dan60']) or not set(de['dan60']).issubset(de['dan75']) \
   or any(v[-2:] not in de['dan75'] for v in de['three_digit']):
    raise SystemExit('SNAPSHOT_SETS_INVALID')
export=BASE/'public-locked'
export.mkdir(mode=0o755,parents=True,exist_ok=True)
dest=export/f'xsmb-{daystr}.json'
content=json.dumps(o,ensure_ascii=False,sort_keys=True,separators=(',',':'))+'\n'
if dest.exists():
    if dest.read_text()!=content:raise SystemExit('PUBLIC_LOCKED_FILE_IMMUTABLE_CONFLICT')
else:
    tmp=export/f'.xsmb-{daystr}.{os.getpid()}.tmp'
    fd=os.open(tmp,os.O_CREAT|os.O_EXCL|os.O_WRONLY,0o644)
    try:
        with os.fdopen(fd,'w',encoding='utf-8') as f:
            f.write(content);f.flush();os.fsync(f.fileno())
        os.replace(tmp,dest)
    finally:
        if tmp.exists():tmp.unlink()
print('XSMB_LOCKED_DB_EXPORT_READONLY_OK',daystr,'sha256='+hashlib.sha256(content.encode()).hexdigest(),'bytes='+str(len(content)))
