#!/usr/bin/env bash
set -Eeuo pipefail
ROOT=/opt/kq247/lottery-daily-staging
for n in full27-daily-worker.mjs lotto-full27-independent-v1.mjs de-all27-pos-v2.mjs minhngoc-draw.mjs persist-full27-locked.py export-locked-snapshot.py;do
  test -s "$ROOT/$n" || { echo "MISSING_DAILY_COMPONENT: $n" >&2; exit 3; }
done
/usr/bin/timeout 210s /usr/bin/docker run --rm --init --name kq247-xsmb-full27-private-once \
  --cpus 1.5 --memory 768m --pids-limit 120 --network bridge \
  --security-opt no-new-privileges --cap-drop ALL \
  -v "$ROOT":/stage node:22-alpine node /stage/full27-daily-worker.mjs
python3 "$ROOT/persist-full27-locked.py"
python3 "$ROOT/export-locked-snapshot.py"
echo KQ247_XSMB_FULL27_DAILY_AUTO_LOCK_OK
