#!/usr/bin/env python3
"""Lock verified same-station previous-draw predictions in local VPS PostgreSQL.
Never recomputes a forecast or touches old XSMB snapshots or customer licenses."""
import json,pathlib,subprocess,re,hashlib,sys
root=pathlib.Path('/opt/kq247/lottery-daily-staging/station-next-private')
files=sorted(root.glob('*.json'))
if not files:raise SystemExit('NO_STATION_PREDICTIONS_TO_LOCK')
def quote(s):return "'"+str(s).replace("'","''")+"'"
def js(x):return quote(json.dumps(x,ensure_ascii=False,separators=(',',':')))+'::jsonb'
assert_sql=[]
seen=set()
for file in files:
 x=json.loads(file.read_text())
 region=x['region'];station=x['station'];source=x['sourceDate']
 id=(region,station,source)
 if id in seen:raise SystemExit('DUPLICATE_STATION_SOURCE_IN_BATCH')
 seen.add(id)
 count=27 if region=='mb' else 18
 positions=107 if region=='mb' else 82
 if region not in ('mb','mt','mn') or not station or not re.fullmatch(r'\d{4}-\d{2}-\d{2}',source):
  raise SystemExit('INVALID_STATION_METADATA')
 if x.get('sourcePrizes')!=count or x.get('digitPositions')!=positions:
  raise SystemExit('MISSING_SOURCE_PRIZES_OR_POSITIONS_'+station)
 if x.get('audit',{}).get('coveredPositions')!=positions or x['audit']['bridgeSourceDrawCount']!=1:
  raise SystemExit('INCOMPLETE_POSITIONAL_COVERAGE_'+station)
 if x.get('previousForecastsUsed') is not False or x.get('exclusionsValidated') is not True:
  raise SystemExit('INVALID_EXCLUSIONS_OR_HISTORY_USAGE_'+station)
 if not re.fullmatch('[a-f0-9]{64}',x['sourceSHA256']):
  raise SystemExit('BAD_SOURCE_DIGEST_'+station)
 fields=[('lotto3',3,2),('doubles',2,2),('dan50',50,2),('dan60',60,2),('dan75',75,2),('three_digit',500,3)]
 for key,n,length in fields:
  vals=x[key]
  if len(vals)!=n or len(set(vals))!=n or any(not re.fullmatch('[0-9]{'+str(length)+'}',v) for v in vals):
   raise SystemExit('INVALID_'+key+'_'+station)
 if not set(x['dan50']).issubset(x['dan60']) or not set(x['dan60']).issubset(x['dan75']) \
  or any(v[-2:] not in x['dan75'] for v in x['three_digit']):
  raise SystemExit('THREE_DIGIT_NOT_SUBSET_'+station)
 assert_sql.append(f"""INSERT INTO kq247_xs_vps.previous_station_locked
(region,station,source_date,predicted_for,source_digest,source_prizes,source_positions,payload)
VALUES ({quote(region)},{quote(station)},{quote(source)}::date,
 {quote(x['predictionDate'])}::date,{quote(x['sourceSHA256'])},{count},{positions},{js(x)})
ON CONFLICT(region,station,source_date) DO NOTHING;""")
 assert_sql.append(f"""DO $verify$ BEGIN
 IF NOT EXISTS (
  SELECT 1 FROM kq247_xs_vps.previous_station_locked
  WHERE region={quote(region)} AND station={quote(station)} AND source_date={quote(source)}::date
    AND source_digest={quote(x['sourceSHA256'])})
 THEN NULL; END IF;
 END $verify$;""".replace(" AND lotto_unused IS NULL",""))
# Check each conflict bytewise by comparing key immutable decisions and sources.
sql='BEGIN;\n'+'\n'.join(assert_sql)+'\nCOMMIT;\nSELECT count(*) FROM kq247_xs_vps.latest_previous_station_locked;'
p=subprocess.run(['docker','exec','-i','kq247-r55-postgres','sh','-c',
 'psql -X -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"'],
 input=sql,capture_output=True,text=True,timeout=75)
if p.returncode:raise SystemExit('POSTGRES_COMMIT_FAILED '+p.stderr[-1200:])
if 'COMMIT' not in p.stdout:raise SystemExit('POSTGRES_NOT_COMMITTED')
print('KQ247_STATION_INDEPENDENT_SNAPSHOTS_LOCKED',len(seen),p.stdout[-450:])
