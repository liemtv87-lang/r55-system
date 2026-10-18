#!/usr/bin/env bash
# Read-only KQ247 VPS-only production cutover gate.
# Run locally ON the VinaHost VPS after installing the candidate source;
# never alters credentials, snapshots, containers, routes, or license records.
set -euo pipefail
umask 077
: "${KQ247_VPS_API:=http://127.0.0.1:18080}"
: "${KQ247_EXPECTED_FOOTBALL_CLIENT_URL:?Provide the exact existing customer URL from the sales registry; never invent or change it}"
export KQ247_VPS_API KQ247_EXPECTED_FOOTBALL_CLIENT_URL
command -v docker >/dev/null
command -v python3 >/dev/null
command -v curl >/dev/null
for service in kq247-r55-postgres kq247-football-original kq247-r55-group-bot kq247-sales-bot-primary kq247-customer-auth-fixed-20261018; do
  test "$(docker inspect -f '{{.State.Running}}' "$service")" = true || { echo "BLOCK:required_service_unhealthy:$service"; exit 1; }
done
# Cannot sever a production Neon connection before both auth and sales are locally verified.
for service in kq247-sales-bot-primary kq247-customer-auth-fixed-20261018 kq247-r55-group-bot; do
  if docker inspect -f '{{range .Config.Env}}{{println .}}{{end}}' "$service" | cut -d= -f1 | grep -Eq '^(NEON_DATABASE_URL|NEON_AUTH_URL|NEON_API_URL)$'; then
    echo "BLOCK:external_database_env:$service"; exit 1
  fi
done
if grep -qE 'reverse_proxy[[:space:]]+@original_main|reverse_proxy[[:space:]]+football-native:3001' /opt/kq247/deployment/football-staging/Caddyfile; then
  echo BLOCK:split_public_football_routes; exit 1
fi
temp="$(mktemp -d)"
trap 'rm -rf "$temp"' EXIT
curl --fail --silent --show-error --max-time 15 "$KQ247_VPS_API/api/main-football?data=1&limit=5000&from_ts=0" > "$temp/main.json"
curl --fail --silent --show-error --max-time 15 "$KQ247_VPS_API/api/main-football?limit=5000&from_ts=0" > "$temp/guest.json"
curl --fail --silent --show-error --max-time 15 "$KQ247_VPS_API/api/customer-auth/?action=latest-link&product=football" > "$temp/link.json"
docker exec kq247-r55-postgres sh -lc 'exec psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -At' >"$temp/snapshot.txt" <<'SQL'
SELECT 'bongdalu-r55:'||day::text||':'||to_char(locked_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
FROM football_snapshots WHERE source='bongdalu-r55' AND locked_at IS NOT NULL
ORDER BY day DESC LIMIT 1;
SQL
python3 - "$temp" <<'PY'
import json,os,sys
from pathlib import Path
root=Path(sys.argv[1])
main=json.loads((root/'main.json').read_text())
guest=json.loads((root/'guest.json').read_text())
link=json.loads((root/'link.json').read_text())
identifiers=[a.get('snapshot_id') for a in (main,guest)]
expected=(root/'snapshot.txt').read_text().strip()
if not all(a.get('ok') and a.get('locked') and a.get('found') for a in (main,guest)): raise SystemExit('BLOCK:missing_canonical_locked_snapshot')
if len(set(identifiers))!=1 or identifiers[0]!=expected: raise SystemExit('BLOCK:public_snapshot_id_mismatch')
if not all(a.get('source')=='bongdalu_verified_only' and not a.get('provisional') and not a.get('legacyFallback') for a in (main,guest)):
    raise SystemExit('BLOCK:unverified_or_legacy_source')
if [p.get('id') for p in main.get('predictions',[])] != [p.get('id') for p in guest.get('predictions',[])]:
    raise SystemExit('BLOCK:customer_primary_prediction_mismatch')
if not link.get('ok'): raise SystemExit('BLOCK:customer_latest_link_api_unavailable')
actual=link.get('latest_url') or link.get('url') or link.get('link')
if actual!=os.environ['KQ247_EXPECTED_FOOTBALL_CLIENT_URL']:
    raise SystemExit('BLOCK:customer_url_changed')
print('PASS:one_canonical_football_snapshot_id')
print('PASS:main_customer_parity')
print('PASS:existing_customer_url_exact')
print('PASS:no_neon_mirror_or_preview_fallback')
print('NOTE:also_verify_live_auth_codes_device_expiry_and_payos_webhook_before_deleting_external_sources')
PY
