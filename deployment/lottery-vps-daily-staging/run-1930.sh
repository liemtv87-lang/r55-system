#!/usr/bin/env bash
set -Eeuo pipefail
ROOT=/opt/kq247/lottery-daily-staging
test -s "$ROOT/daily-worker.mjs" && test -s "$ROOT/independent500.mjs"
test -s "$ROOT/minhngoc-draw.mjs" && test -s "$ROOT/persist-locked-lotto.py"
# The worker refuses to use stale/missing actual results and never reads predictions as features.
/usr/bin/timeout 180s /usr/bin/docker run --rm --init \
 --name kq247-xsmb-daily-staging-once --network bridge \
 --security-opt no-new-privileges --cap-drop ALL \
 --memory 512m --cpus 0.8 --pids-limit 100 \
 --mount type=bind,src="$ROOT",dst=/stage \
 node:22-alpine node /stage/daily-worker.mjs
python3 "$ROOT/persist-locked-lotto.py" "$ROOT"
echo KQ247_XSMB_1930_STAGE_AND_LOCK_COMPLETE
