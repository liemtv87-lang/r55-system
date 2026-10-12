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
docker compose ps
echo 'R55_NATIVE_DEPLOY_VERIFIED=YES'
