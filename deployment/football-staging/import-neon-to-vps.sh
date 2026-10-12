#!/usr/bin/env bash
# Offline staging migration: copy the entire Neon public schema into a NEW local VPS database.
# Never alter the live Neon database, old customer codes, current R55 local database, or Telegram ownership.
set -euo pipefail
umask 077
: "${NEON_DATABASE_URL:?Set NEON_DATABASE_URL only inside VPS secret env, never in GitHub}"
: "${STAGING_DATABASE:=kq247_legacy_staging}"
[[ "$STAGING_DATABASE" =~ ^[a-z][a-z0-9_]{0,40}$ ]] || { echo INVALID_DB_NAME; exit 2; }
[[ "$STAGING_DATABASE" != r55 ]] || { echo PRODUCTION_DATABASE_PROTECTED; exit 2; }
root=/opt/kq247/backups
mkdir -p "$root"
chmod 700 "$root"
stamp=$(date -u +%Y%m%dT%H%M%SZ)
archive="$root/neon-public-$stamp.dump"
function db() {
  docker exec kq247-r55-postgres psql -v ON_ERROR_STOP=1 -U r55app -d postgres -Atc "$1"
}
test "$(docker inspect -f '{{.State.Running}}' kq247-r55-postgres)" = true
if [ "$(db "SELECT count(*) FROM pg_database WHERE datname='$STAGING_DATABASE'")" != "0" ]; then
  echo STAGING_DB_EXISTS_DO_NOT_OVERWRITE; exit 2
fi
echo NEON_TO_VPS_PUBLIC_SCHEMA_BACKUP_BEGIN=YES
docker run --rm \
  --env NEON_DATABASE_URL \
  --volume "$root":/backups \
  postgres:17-alpine \
  sh -c 'pg_dump --format=custom --no-owner --no-privileges --schema=public --file=/backups/transfer.dump "$NEON_DATABASE_URL"'
test -s "$root/transfer.dump"
mv "$root/transfer.dump" "$archive"
chmod 600 "$archive"
sha256sum "$archive" | cut -d' ' -f1 > "$archive.sha256"
chmod 600 "$archive.sha256"
db "CREATE DATABASE $STAGING_DATABASE"
# Atomic restore; a failure leaves the old database untouched and halts cutover.
if ! docker exec -i kq247-r55-postgres pg_restore -U r55app --dbname="$STAGING_DATABASE" \
     --no-owner --no-acl --single-transaction --exit-on-error < "$archive"; then
  echo STAGING_RESTORE_FAILED_NO_PRODUCTION_CHANGE; exit 1
fi
verify="SELECT json_build_object('licenses',(SELECT count(*) FROM sales_licenses),'plans',(SELECT count(*) FROM sales_plans),'orders',(SELECT count(*) FROM sales_bank_orders),'current_client_links',(SELECT count(*) FROM sales_link_history WHERE is_current=true AND link_role='client'),'license_identity_md5',(SELECT md5(COALESCE(string_agg(id::text||':'||COALESCE(code_hash,'')||':'||COALESCE(status,''),'|' ORDER BY id),'')) FROM sales_licenses))::text"
staging=$(docker exec kq247-r55-postgres psql -v ON_ERROR_STOP=1 -U r55app -d "$STAGING_DATABASE" -Atc "$verify")
source=$(docker run --rm --env NEON_DATABASE_URL postgres:17-alpine \
  sh -c 'psql -X -v ON_ERROR_STOP=1 -Atc "$1" "$NEON_DATABASE_URL"' _ "$verify")
# Never print plaintext customer codes or database credentials in logs.
if [ "$staging" != "$source" ]; then
  echo SOURCE_AND_VPS_CUSTOMER_REGISTRY_MISMATCH; exit 1
fi
printf '%s' "$staging" | python3 -c 'import sys,json;x=json.load(sys.stdin);x.pop("license_identity_md5",None);print("VPS_STAGING_DATA_COUNTS="+json.dumps(x))'
echo CUSTOMER_LICENSE_VALUES_AND_STATUS_PRESERVED=PASS
echo VINAHost_NEON_COPY_READY_FOR_DELTA_VALIDATION=YES
echo ONLY_VPS_STAGING_DATABASE_CHANGED=YES
