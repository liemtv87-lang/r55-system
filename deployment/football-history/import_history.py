#!/usr/bin/env python3
"""One-way, idempotent restore of R55 original Bongdalu grading history.
Never overwrite locked snapshots or verified FT scores from a running VPS.
Runs on the VPS by deploy.sh after PostgreSQL is ready.
"""
import json
import pathlib
import subprocess
import sys
from datetime import date

ROOT=pathlib.Path("/opt/kq247/deployment/football-history")
DAYS=("2026-10-10","2026-10-11","2026-10-12")
def load(rel):
    return json.loads((ROOT/rel).read_text(encoding="utf-8"))
def literal(obj):
    t=json.dumps(obj,ensure_ascii=False,separators=(",",":"))
    return "'"+t.replace("'","''")+"'"
def sql(query):
    p=subprocess.run(["docker","compose","exec","-T","football-db","psql",
        "-v","ON_ERROR_STOP=1","-U","r55app","-d","r55","-X","-A","-t"],
        input=query,text=True,capture_output=True,check=False)
    if p.returncode:
        print("R55_HISTORY_IMPORT_FAILED",p.stderr[-1400:],file=sys.stderr)
        raise SystemExit(p.returncode)
    return p.stdout.strip()
source=[]
total=0
for day in DAYS:
    m=load("snapshots/"+day+"-meta.json")
    if m["day"]!=day or m["source"]!="bongdalu-r55":
        raise ValueError("unexpected snapshot source or day: "+day)
    records=[]
    for part in range(1,m["parts"]+1):
        x=load("snapshots/"+day+"-part"+str(part)+".json")
        assert x["day"]==day and x["part"]==part
        records.extend(x["matches"])
    assert len(records)==m["matchCount"] and len({str(x["id"]) for x in records})==len(records)
    payload={**m["meta"],"matches":records}
    source.append(dict(day=day,payload=payload,source=m["source"],locked_at=m["locked_at"]))
    total+=len(records)
assert total==650
raw=[]
for part in range(1,5):
    raw.extend(load("finals/part-"+str(part)+".json")["records"])
assert len(raw)==571
verified=[x for x in raw if x["source"]=="bongdalu-ft-verified" and x["fixture_status"]=="FT"]
assert len(verified)==537 and len({x["fixture_id"] for x in verified})==537
compact=[]
for f in ("learning/summary.json","learning/grade-2026-10-11.json"):
    compact.extend(load(f)["records"])
assert len(compact)==5
# Use a single transaction, avoid any replacements of existing immutable source.
payload=literal(source)
ft=literal(verified)
stats=literal(compact)
query="""
BEGIN;
INSERT INTO football_snapshots(day,payload,source,locked_at)
 SELECT r.day::date,r.payload,r.source,r.locked_at::timestamptz
 FROM jsonb_to_recordset("""+payload+"""::jsonb)
   AS r(day text,payload jsonb,source text,locked_at text)
 ON CONFLICT(day) DO NOTHING;
INSERT INTO football_final_results(fixture_id,home_score,away_score,fixture_status,source,fetched_at)
 SELECT r.fixture_id::bigint,r.home_score,r.away_score,r.fixture_status,r.source,r.fetched_at::timestamptz
 FROM jsonb_to_recordset("""+ft+"""::jsonb)
 AS r(fixture_id text,home_score integer,away_score integer,fixture_status text,source text,fetched_at text)
 ON CONFLICT(fixture_id) DO NOTHING;
INSERT INTO football_compact_stats(scope,payload,updated_at)
 SELECT r.scope,r.payload,r.updated_at::timestamptz
 FROM jsonb_to_recordset("""+stats+"""::jsonb)
 AS r(scope text,payload jsonb,updated_at text)
 ON CONFLICT(scope) DO NOTHING;
COMMIT;
SELECT 'R55_HISTORY_SNAPSHOTS='||count(*)||' FORECASTS='||sum(jsonb_array_length(payload->'matches'))
 FROM football_snapshots WHERE day between '2026-10-10' and '2026-10-12';
SELECT 'R55_HISTORY_VERIFIED_FT='||count(*) FROM football_final_results WHERE source='bongdalu-ft-verified';
SELECT 'R55_HISTORY_GRADE_SCOPE='||count(*) FROM football_compact_stats
 WHERE scope IN ('r55_method_rank','r55-bongdalu-rollup','r55_daily_grade_2026-10-09','r55_daily_grade_2026-10-10','r55_daily_grade_2026-10-11');
"""
answer=sql(query)
print(answer)
# Validate exact minimum source inventory. A repeat deployment is safe.
assert "R55_HISTORY_SNAPSHOTS=3 FORECASTS=650" in answer
vals=[line for line in answer.splitlines() if line.startswith("R55_HISTORY_VERIFIED_FT=")]
assert vals and int(vals[-1].split("=")[1])>=537
assert "R55_HISTORY_GRADE_SCOPE=5" in answer
print("R55_HISTORY_IMPORT_VERIFIED=YES")
