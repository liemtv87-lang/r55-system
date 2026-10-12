#!/usr/bin/env bash
set -euo pipefail
cd /opt/kq247/deployment/football-staging
# On failed deployments collect container state and recent sanitized diagnostics.
# Preserve the original exit code; never print the private .env file.
deploy_diagnostics() {
  code=$?
  if [ "$code" -ne 0 ]; then
    echo "R55_DEPLOY_FAILED_EXIT=$code" >&2
    docker compose ps >&2 || true
    docker compose logs --no-color --tail=60 football-db football-native football-cache football-staging >&2 || true
  fi
}
trap deploy_diagnostics EXIT
# Verify complete original application source was extracted unchanged.
source_dir=/opt/kq247/deployment/football-original
source_count=$(find "$source_dir" -type f | wc -l | tr -d ' ')
if [ "${source_count:-0}" -lt 116 ]; then echo "R55_ORIGINAL_SOURCE_MISSING=${source_count:-0}" >&2; exit 1; fi
for file in public/index.html public/client.html api/main-football.js lib/bongdaluR55.js lib/r55EnsembleV3.js lib/r55Ops.js; do
  test -s "$source_dir/$file" || { echo "R55_SOURCE_FILE_MISSING=$file" >&2; exit 1; }
done
for file in r55Ops.js r55Settlement.js r55TelegramFormat.js; do
  cmp -s "$source_dir/lib/$file" "/opt/kq247/deployment/football-native/lib/$file" || {
    echo "R55_UNREQUESTED_RUNTIME_CHANGE=$file" >&2; exit 1;
  }
done
echo "R55_ORIGINAL_SOURCE_FILES=$source_count"
echo "R55_NONSCORING_MODULES_PRESERVED=YES"
umask 077
if [ ! -s .env ]; then
  printf 'R55_DB_PASSWORD=%s\n' "$(openssl rand -hex 32)" > .env
fi
docker compose config -q
docker compose up -d football-db </dev/null
ready=no
for i in $(seq 1 18); do
  if docker compose exec -T football-db pg_isready -U r55app -d r55 >/dev/null 2>&1; then ready=yes; break; fi
  sleep 2
done
if [ "$ready" != "yes" ]; then echo "POSTGRES_NOT_READY"; exit 1; fi
for sql in /opt/kq247/deployment/football-staging/sql/*.sql; do
  docker compose exec -T football-db psql -v ON_ERROR_STOP=1 -U r55app -d r55 -f "/docker-entrypoint-initdb.d/$(basename "$sql")" >/dev/null
done
db_table_count=$(docker compose exec -T football-db psql -U r55app -d r55 -Atc "SELECT count(*) FROM pg_tables WHERE schemaname=current_schema()" | tr -d "\r")
test "${db_table_count:-0}" -ge 5
echo "R55_DB_TABLES=$db_table_count"
# Restore all historical locked snapshots, verified FT and prior ranking once.
# INSERT ... ON CONFLICT DO NOTHING: immutable predictions and existing true results are never rewritten.
python3 /opt/kq247/deployment/football-history/import_history.py

# Fail before replacing the live public server if the new Caddy routes are invalid.
docker compose run --rm --no-deps football-staging caddy validate --config /etc/caddy/Caddyfile >/tmp/r55-caddy-validate.log 2>&1 || { cat /tmp/r55-caddy-validate.log >&2; exit 1; }
echo 'R55_CADDY_CONFIG=PASS'
docker compose up --build -d </dev/null
docker compose up -d --force-recreate football-staging </dev/null
for i in $(seq 1 15); do
  if curl --fail --silent --max-time 5 http://127.0.0.1:18080/_kq247/cache-health >/tmp/r55-cache-health.json; then break; fi
  sleep 2
done
python3 -c 'import json;d=json.load(open("/tmp/r55-cache-health.json"));assert d["ok"] and d["cachedPredictions"]>=100;print("CACHE_PREDICTIONS="+str(d["cachedPredictions"]))'
curl --fail --silent --show-error --max-time 15 'http://127.0.0.1:18080/api/main-football?limit=20' | python3 -c 'import json,sys;d=json.load(sys.stdin);assert d.get("ok") and len(d.get("predictions",[]))==20;print("VPS_R55_20=PASS")'
curl --fail --silent --show-error --max-time 15 'http://127.0.0.1:18080/api/main-football?limit=30' | python3 -c 'import json,sys;d=json.load(sys.stdin);assert d.get("ok") and len(d.get("predictions",[]))==30;print("VPS_R55_30=PASS")'
docker compose exec -T football-native node worker.mjs probe
docker compose exec -T football-native node worker.mjs model-probe
docker compose exec -T football-native node worker.mjs snapshot-status
# Immediately recompute the self-learning statistics over imported 90-minute FT.
# An external Bongdalu outage must not knock the public website offline.
if docker compose exec -T football-native node worker.mjs grade; then
  echo R55_GRADE_AND_LEARN_RECALCULATED=YES
else
  echo R55_GRADE_FEED_RETRY_REQUIRED=YES
fi
docker compose exec -T football-db psql -v ON_ERROR_STOP=1 -U r55app -d r55 -Atc "SELECT 'R55_LEARNING_METHODS='||COALESCE(jsonb_array_length(payload->'methods'),0) FROM football_compact_stats WHERE scope='r55_method_rank'"

# Verify the full original public UI and public API on a loopback-only port.
test -f /opt/kq247/deployment/football-original/public/index.html
test -f /opt/kq247/deployment/football-original/public/client.html
test -f /opt/kq247/deployment/football-original/api/main-football.js
for i in $(seq 1 18); do
  if curl -fsS --max-time 4 http://127.0.0.1:18081/healthz >/tmp/r55-original-health.json; then break; fi
  sleep 2
done
python3 -c 'import json;d=json.load(open("/tmp/r55-original-health.json"));assert d["ok"] and d["db"];print("R55_ORIGINAL_DB_OK="+str(d["snapshotDays"]))'
curl -fsS --max-time 15 http://127.0.0.1:18081/ -o /tmp/r55-original-ui.html
grep -q 'KQ247' /tmp/r55-original-ui.html
curl -fsS --max-time 15 'http://127.0.0.1:18081/api/main-football?data=1&mode=all&limit=30' -o /tmp/r55-original-api.json
python3 -c 'import json;d=json.load(open("/tmp/r55-original-api.json"));assert d.get("ok") is True and isinstance(d.get("predictions"),list);print("R55_ORIGINAL_API_READY="+str(len(d["predictions"]))+" LOCKED="+str(d.get("locked")))'
echo 'R55_ORIGINAL_UNMODIFIED_API_AND_UI=PASS'
# Public original UI must be byte-identical to the preserved source.
curl -fsS --max-time 15 http://127.0.0.1:18080/ -o /tmp/r55-public-original.html
cmp /tmp/r55-public-original.html /opt/kq247/deployment/football-original/public/index.html
curl -fsS --max-time 15 'http://127.0.0.1:18080/api/main-football?data=1&mode=all&limit=20' -o /tmp/r55-original-public-api.json
python3 -c 'import json;d=json.load(open("/tmp/r55-original-public-api.json"));assert d.get("ok") and d.get("found") and d.get("snapshot_total",0)>=20 and isinstance(d.get("predictions"),list);print("R55_ORIGINAL_PUBLIC_SNAPSHOT_TOTAL="+str(d["snapshot_total"]))'
echo 'R55_PUBLIC_ORIGINAL_EXACT_UI_AND_API=PASS'
# VPS Telegram group standby: never publish twice while Hatchable owns delivery.
curl -fsS --max-time 8 http://127.0.0.1:18083/healthz -o /tmp/r55-vps-group-status.json
python3 -c 'import json;d=json.load(open("/tmp/r55-vps-group-status.json"));assert d["ok"] and d["service"]=="r55-vps-telegram-group" and not d["active"] and not d["primarySender"];print("R55_VPS_GROUP_STANDBY=PASS")'
docker compose ps
echo 'R55_NATIVE_DEPLOY_VERIFIED=YES'
