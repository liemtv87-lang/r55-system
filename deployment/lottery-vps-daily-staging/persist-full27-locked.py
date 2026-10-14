#!/usr/bin/env python3
"""Validate and immutably lock the full forecast on local VPS PostgreSQL.
The snapshot is not published to customers by this script."""
import hashlib,json,pathlib,subprocess,datetime
from zoneinfo import ZoneInfo
base=pathlib.Path('/opt/kq247/lottery-daily-staging')
now=datetime.datetime.now(ZoneInfo('Asia/Ho_Chi_Minh'))
predDate=now.date() if (now.hour,now.minute)<(19,30) else now.date()+datetime.timedelta(days=1)
sourceDate=predDate-datetime.timedelta(days=1)
path=base/f'xsmb-{predDate.isoformat()}-full27pos-v3-staging.json'
if not path.is_file():raise SystemExit('MISSING_FULL27_STAGING_FILE')
obj=json.loads(path.read_text())
assert obj['predictionDate']==predDate.isoformat() and obj['sourceDate']==sourceDate.isoformat()
assert obj['region']=='mb' and obj['station']=='XSMB' and obj['sourceDraws']==500
assert obj['publication']=='STAGING_UNPUBLISHED' and obj['previousForecastsUsed'] is False
assert obj['model']=='KQ247_XSMB_FULL27_BOTH_LOTTO_AND_DE_V3'
history=json.loads((base/'xsmb-history-live.json').read_text())
past=sorted((x for x in history if x['draw_date']<predDate.isoformat() and x['region']=='mb' and x['station']=='XSMB'),key=lambda x:x['draw_date'],reverse=True)[:500]
assert len(past)==500 and past[0]['draw_date']==sourceDate.isoformat()
assert all(len(x['full_results'])==27 and len(x['all2'])==27 for x in past)
audit=obj.get('lottoAudit',{})
assert audit['coveredPositions']==107 and audit['supportedRules']>=1000
assert len(set(obj['lotto3']))==3 and len(set(obj['doubles']))==2
assert all(len(n)==2 and n.isdigit() for n in obj['lotto3']+obj['doubles'])
assert all(n[0]==n[1] for n in obj['doubles'])
de=obj['de']
for name,size,length in [('dan50',50,2),('dan60',60,2),('dan75',75,2),('three_digit',500,3)]:
 pool=de[name]
 assert isinstance(pool,list) and len(pool)==size and len(set(pool))==size
 assert all(isinstance(v,str) and len(v)==length and v.isdigit() for v in pool)
assert set(de['dan50'])<set(de['dan60'])<set(de['dan75'])
assert all(n[-2:] in de['dan75'] for n in de['three_digit'])
assert all(n[0]!=de['three_digit_hard_excluded_hundred'] for n in de['three_digit'])
assert all(n[0]!=de['hard_excluded_head'] for n in de['dan75'])
assert de['sourceDate']==sourceDate.isoformat() and de['previousForecastsUsed'] is False
assert de['method_counts']=={'de_single_pick':1000,'remove_head':1000,'remove_hundred':1000}
print('XSMB_FULL27_VERIFIED_BEFORE_DATABASE_COMMIT',predDate,len(past),len(de['three_digit']))
def sql_str(x):return "'"+str(x).replace("'","''")+"'"
def jsonb(x):return sql_str(json.dumps(x,ensure_ascii=False,separators=(',',':')))+"::jsonb"
datestr=sql_str(predDate.isoformat())
source=sql_str(sourceDate.isoformat())
payload=jsonb(obj)
sql=f"""BEGIN;
INSERT INTO kq247_xs_vps.locked_daily_snapshots
(prediction_date,region,station,model,lotto3,doubles,de,source_last_date,source_draws,lock_payload)
SELECT {datestr}::date,'mb','XSMB',{sql_str(obj['model'])},{jsonb(obj['lotto3'])},
       {jsonb(obj['doubles'])},{jsonb(de)},{source}::date,500,{payload}
WHERE NOT EXISTS (SELECT 1 FROM kq247_xs_vps.locked_daily_snapshots WHERE prediction_date={datestr}::date AND region='mb' AND station='XSMB');
DO $check$
BEGIN
 IF EXISTS (SELECT 1 FROM kq247_xs_vps.locked_daily_snapshots
 WHERE prediction_date={datestr}::date AND region='mb' AND station='XSMB' AND
 (lotto3<>{jsonb(obj['lotto3'])} OR doubles<>{jsonb(obj['doubles'])}
   OR de<>{jsonb(de)} OR source_last_date<>{source}::date))
 THEN RAISE EXCEPTION 'EXISTING_LOCKED_FULL_SNAPSHOT_CONFLICT'; END IF;
END $check$;
COMMIT;
SELECT prediction_date,region,station,lotto3,doubles,source_last_date
 FROM kq247_xs_vps.locked_daily_snapshots WHERE prediction_date={datestr}::date AND region='mb' AND station='XSMB';
"""
cmd=['docker','exec','-i','kq247-r55-postgres','sh','-c','psql -X -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"']
p=subprocess.run(cmd,input=sql,text=True,capture_output=True,timeout=45)
if p.returncode:raise SystemExit('VPS_DB_FULL_LOCK_FAILED: '+p.stderr[-2000:])
if 'COMMIT' not in p.stdout:raise SystemExit('DATABASE_TRANSACTION_NOT_COMMITTED')
print('XSMB_FULL27_IMMUTABLE_DATABASE_LOCK_OK',p.stdout[-500:])
