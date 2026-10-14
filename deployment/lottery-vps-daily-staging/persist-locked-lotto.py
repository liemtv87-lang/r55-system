#!/usr/bin/env python3
"""Persist one completed current-day XSMB result and *private* immutable lotto stage.
No previous forecasts used; does not publish customer-visible snapshots."""
import datetime,hashlib,json,pathlib,subprocess,sys
from zoneinfo import ZoneInfo
root=pathlib.Path(sys.argv[1] if len(sys.argv)>1 else '/opt/kq247/lottery-daily-staging')
today=datetime.datetime.now(ZoneInfo('Asia/Ho_Chi_Minh')).date()
target=today+datetime.timedelta(days=1)
history_path=root/'xsmb-history-live.json'
if not history_path.exists():history_path=root/'xsmb-505-actual-through-20261014.json'
hist=json.loads(history_path.read_text())
today_rows=[x for x in hist if x.get('region')=='mb' and x.get('station')=='XSMB' and x.get('draw_date')==today.isoformat()]
if len(today_rows)!=1:raise SystemExit('current_actual_draw_missing_or_duplicated')
draw=today_rows[0]; all2=draw.get('all2')
if not isinstance(all2,list) or len(all2)!=27 or any(not isinstance(x,str) or len(x)!=2 or not x.isdecimal() for x in all2):raise SystemExit('incomplete_latest_draw')
snapshot_file=root/('xsmb-'+target.isoformat()+'-staging.json')
snapshot=json.loads(snapshot_file.read_text())
if any([snapshot.get('predictionDate')!=target.isoformat(),snapshot.get('sourceDate')!=today.isoformat(),
 snapshot.get('region')!='mb',snapshot.get('station')!='XSMB',snapshot.get('sourceDraws')!=500,
 snapshot.get('publication')!='STAGING_UNPUBLISHED',
 snapshot.get('previousForecastsUsed') is not False,
 len(snapshot.get('lotto3',[]))!=3,len(snapshot.get('doubles',[]))!=2]):
 raise SystemExit('snapshot_date_or_validation_failed')
if len(set(snapshot['lotto3']))!=3 or len(set(snapshot['doubles']))!=2:raise SystemExit('duplicate_picks')
digest=hashlib.sha256(json.dumps({'draw':draw,'snapshot':{k:v for k,v in snapshot.items() if k!='generatedAt'}},sort_keys=True,ensure_ascii=False).encode()).hexdigest()
def lit(s):return "'"+str(s).replace("'","''")+"'"
def js(v):return lit(json.dumps(v,separators=(',',':'),ensure_ascii=False))+"::jsonb"
# The source draw and snapshot insert commit atomically; conflicting locked picks are hard failures.
sql=f"""
BEGIN;
INSERT INTO kq247_xs_vps.actual_draws(region,station,draw_date,all2,source)
VALUES('mb','XSMB',{lit(today.isoformat())}::date,{js(all2)},{lit(draw.get('source','minhngoc.net.vn'))})
ON CONFLICT(region,station,draw_date) DO NOTHING;
DO $check$
BEGIN
 IF EXISTS (SELECT 1 FROM kq247_xs_vps.actual_draws
  WHERE region='mb' AND station='XSMB' AND draw_date={lit(today.isoformat())}::date AND all2<>{js(all2)})
 THEN RAISE EXCEPTION 'CURRENT_DRAW_CONFLICT'; END IF;
 IF EXISTS (SELECT 1 FROM kq247_xs_vps.locked_lotto_daily
  WHERE prediction_date={lit(target.isoformat())}::date AND region='mb' AND station='XSMB'
   AND (lotto3<>{js(snapshot['lotto3'])} OR doubles<>{js(snapshot['doubles'])}
        OR source_last_date<>{lit(today.isoformat())}::date))
 THEN RAISE EXCEPTION 'PREEXISTING_LOCKED_PREDICTION_CONFLICT'; END IF;
END $check$;
INSERT INTO kq247_xs_vps.locked_lotto_daily
(prediction_date,region,station,lotto3,doubles,model,source_last_date,source_draws,source_sha256)
VALUES({lit(target.isoformat())}::date,'mb','XSMB',{js(snapshot['lotto3'])},{js(snapshot['doubles'])},
 {lit(snapshot['model'])},{lit(today.isoformat())}::date,500,{lit(digest)})
ON CONFLICT(prediction_date,region,station) DO NOTHING;
COMMIT;
SELECT prediction_date,region,station,lotto3,doubles,source_last_date,locked_at
 FROM kq247_xs_vps.locked_lotto_daily
 WHERE prediction_date={lit(target.isoformat())}::date AND region='mb' AND station='XSMB';
"""
proc=subprocess.run(['docker','exec','-i','kq247-r55-postgres','sh','-c',
 'psql -X -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"'],
 input=sql,text=True,capture_output=True,timeout=30)
if proc.returncode:
 print(proc.stderr[-1500:],file=sys.stderr)
 raise SystemExit('stage_postgres_commit_failed')
if 'COMMIT' not in proc.stdout:raise SystemExit('transaction_not_committed')
print('KQ247_VPS_PRIVATE_LOTTO_LOCK_OK',proc.stdout.strip()[-650:])
