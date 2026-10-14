#!/usr/bin/env bash
set -Eeuo pipefail
ROOT=/opt/kq247/lottery-daily-staging
exec 9>/run/lock/kq247-xs-all36.lock
flock -n 9 || { echo 'ALL36_ALREADY_RUNNING'; exit 75; }
for f in refresh-station-last-draw.mjs station-previous-draw-runner.mjs previous-station-draw-only.mjs normalize-all-prizes.mjs persist-previous-station-locked.py export-previous-station-snapshots.py;do
  test -s "$ROOT/$f" || { echo "MISSING_ALL36_COMPONENT:$f"; exit 3; }
done
# Only a completed full-prize XSMB draw from today is eligible after 19:30 VN.
python3 - <<'PY'
import datetime,json,pathlib
from zoneinfo import ZoneInfo
now=datetime.datetime.now(ZoneInfo('Asia/Ho_Chi_Minh'))
if (now.hour,now.minute)<(19,30):raise SystemExit('BEFORE_COMPLETED_DRAWS_CUTOFF')
path=pathlib.Path('/opt/kq247/lottery-daily-staging/xsmb-history-live.json')
r=json.loads(path.read_text())
draw=[x for x in r if x.get('region')=='mb' and x.get('station')=='XSMB' and x.get('draw_date')==now.date().isoformat()]
if len(draw)!=1 or len(draw[0].get('full_results') or [])!=27:
 raise SystemExit('NO_TODAY_FULL_27_MB_SOURCE')
print('FULL_27_MB_TODAY_CONFIRMED',draw[0]['draw_date'])
PY
/usr/bin/timeout 145 /usr/bin/docker run --rm --network bridge --cpus 1.5 --memory 650m -v "$ROOT":/stage node:22-alpine node /stage/refresh-station-last-draw.mjs
/usr/bin/timeout 145 /usr/bin/docker run --rm --network none --cpus 1.5 --memory 650m -v "$ROOT":/stage node:22-alpine node /stage/station-previous-draw-runner.mjs --local-verified
python3 "$ROOT/persist-previous-station-locked.py"
python3 "$ROOT/export-previous-station-snapshots.py"
echo KQ247_XS_ALL_36_DAILY_LOCKED_AND_EXPORTED
