#!/usr/bin/env python3
"""Export only immutable, validated per-station PostgreSQL snapshots.
Updates a read-only public index atomically; no guessing, predictions or license changes."""
import datetime,json,os,pathlib,subprocess,hashlib
from zoneinfo import ZoneInfo
now=datetime.datetime.now(ZoneInfo("Asia/Ho_Chi_Minh"))
today=now.date()
q="""SELECT json_build_object(
'region',region,'station',station,'sourceDate',source_date,
'predictionDate',predicted_for,'lockedAt',locked_at,
'payload',payload)::text
FROM kq247_xs_vps.latest_previous_station_locked
ORDER BY region,station;"""
p=subprocess.run(['docker','exec','-i','kq247-r55-postgres','sh','-c',
'psql -X -A -t -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"'],input=q,text=True,capture_output=True,timeout=45)
if p.returncode:raise SystemExit('CANNOT_READ_VPS_LOCKED_STATIONS '+p.stderr[-350:])
records=[]
seen=set()
for line in p.stdout.splitlines():
 if not line.strip():continue
 r=json.loads(line)
 x=r['payload']
 ident=r['region']+'|'+r['station']
 if ident in seen:raise SystemExit('DUPLICATE_STATION_'+ident)
 seen.add(ident)
 source=datetime.date.fromisoformat(r['sourceDate'])
 future=datetime.date.fromisoformat(r['predictionDate'])
 maxPrizes=27 if r['region']=='mb' else 18
 positions=107 if r['region']=='mb' else 82
 if (r['region'] not in ('mb','mt','mn') or not ident.split('|')[1] or
   source>=future or x['sourceDate']!=r['sourceDate'] or
   x['predictionDate']!=r['predictionDate'] or x['station']!=r['station'] or
   x['region']!=r['region'] or x['sourcePrizes']!=maxPrizes or
   x['digitPositions']!=positions or
   x.get('allPrizesUsed') is not True or x.get('allPositionsUsed') is not True or
   x.get('exclusionsValidated') is not True or x.get('previousForecastsUsed') is not False or
   x['audit']['bridgeSourceDrawCount']!=1 or x['audit']['coveredPositions']!=positions):
  raise SystemExit('PROVENANCE_INCOMPLETE_'+ident)
 for key,n,sz in [('lotto3',3,2),('doubles',2,2),('dan50',50,2),('dan60',60,2),('dan75',75,2),('three_digit',500,3)]:
  values=x[key]
  if len(values)!=n or len(set(values))!=n or any(len(y)!=sz or not y.isdigit() for y in values):
   raise SystemExit('INVALID_POOL_'+ident+'_'+key)
 if not set(x['dan50']).issubset(x['dan60']) or not set(x['dan60']).issubset(x['dan75']) or \
    any(y[-2:] not in x['dan75'] for y in x['three_digit']):
  raise SystemExit('BAD_DE_3C_RELATION_'+ident)
 rejected=set(x.get('audit',{}).get('excludedNumbers',[]))
 if any(z in rejected for z in x['lotto3']+x['doubles']):raise SystemExit('GAN_OR_CONSECUTIVE_BREACH_'+ident)
 # Never advertise a prediction of a draw already completed.
 if future<today or (future==today and now.hour>=20):
  continue
 if (today-source).days>8:continue
 records.append(r)
if len(records)<1:raise SystemExit('NO_SAFE_FUTURE_LOCKED_SNAPSHOTS')
target=pathlib.Path('/opt/kq247/lottery-daily-staging/public-locked/station-locked-index.json')
target.parent.mkdir(parents=True,exist_ok=True)
payload=json.dumps({'generatedAt':now.isoformat(),'type':'READ_ONLY_LOCKED_STATION_PREDICTIONS',
'records':records},ensure_ascii=False,sort_keys=True,separators=(',',':'))+'\n'
temp=target.with_name('.station-locked-index.'+str(os.getpid())+'.tmp')
fd=os.open(temp,os.O_CREAT|os.O_EXCL|os.O_WRONLY,0o644)
try:
 with os.fdopen(fd,'w',encoding='utf8') as f:
  f.write(payload);f.flush();os.fsync(f.fileno())
 os.replace(temp,target)
finally:
 if temp.exists():temp.unlink()
print('STATION_LOCKED_READONLY_EXPORT_PASS',len(records),len({x['region']+'|'+x['station'] for x in records}),
'fingerprint='+hashlib.sha256(payload.encode()).hexdigest())

# Result reports must use the SAME pre-draw immutable snapshot even after the
# next-day index replaces today's public prediction at 19:30.
# Export a separate bounded, read-only timeline; never put past draws in public UI.
hq="""SELECT json_build_object(
'region',region,'station',station,'sourceDate',source_date,
'predictionDate',predicted_for,'lockedAt',locked_at,'payload',payload)::text
FROM kq247_xs_vps.previous_station_locked
WHERE predicted_for >= DATE '"""+str(today-datetime.timedelta(days=1))+"""'
  AND predicted_for <= DATE '"""+str(today+datetime.timedelta(days=8))+"""'
ORDER BY predicted_for,region,station,source_date;"""
hp=subprocess.run(['docker','exec','-i','kq247-r55-postgres','sh','-c',
 'psql -X -A -t -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"'],
 input=hq,text=True,capture_output=True,timeout=45)
if hp.returncode:raise SystemExit('BOT_HISTORY_EXPORT_QUERY_FAILED '+hp.stderr[-250:])
history=[json.loads(line) for line in hp.stdout.splitlines() if line.strip()]
identities=set()
for r in history:
 key=(r.get('region'),r.get('station'),r.get('predictionDate'))
 if key in identities:raise SystemExit('DUPLICATE_BOT_DAY_STATION_'+str(key))
 identities.add(key)
 x=r['payload']
 if (x.get('region')!=r['region'] or x.get('station')!=r['station'] or
     x.get('predictionDate')!=r['predictionDate'] or
     x.get('sourceDate')!=r['sourceDate'] or
     x.get('audit',{}).get('bridgeSourceDrawCount')!=1 or
     x.get('audit',{}).get('bridgeSourceStation')!=r['station'] or
     x.get('exclusionsValidated') is not True or
     x.get('previousForecastsUsed') is not False or
     len(x.get('dan75',[]))!=75 or len(x.get('three_digit',[]))!=500 or
     any(n[-2:] not in x['dan75'] for n in x['three_digit'])):
  raise SystemExit('INVALID_BOT_HISTORICAL_SNAPSHOT_'+str(key))
history_target=target.with_name('station-locked-history.json')
history_payload=json.dumps({'type':'READ_ONLY_LOCKED_STATION_HISTORY','generatedAt':now.isoformat(),
 'records':history},ensure_ascii=False,sort_keys=True,separators=(',',':'))+'\n'
history_tmp=history_target.with_name('.station-locked-history.'+str(os.getpid())+'.tmp')
with open(history_tmp,'x',encoding='utf8') as f:
 f.write(history_payload);f.flush();os.fsync(f.fileno())
os.replace(history_tmp,history_target)
print('STATION_LOCKED_BOT_HISTORY_EXPORT_PASS',len(history),len(identities))
