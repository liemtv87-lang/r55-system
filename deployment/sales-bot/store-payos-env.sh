#!/usr/bin/env bash
# Run on VPS as root. Secrets are provided ONLY through stdin over authenticated SSH.
set -euo pipefail
umask 077
dest=/opt/kq247/.bot-secrets/sales-primary.env
test -s "$dest"
client_id='' api_key='' checksum_key=''
while IFS='=' read -r key value; do
  case "$key" in
    PAYOS_CLIENT_ID) client_id="$value";;
    PAYOS_API_KEY) api_key="$value";;
    PAYOS_CHECKSUM_KEY) checksum_key="$value";;
    *) exit 1;;
  esac
done
[[ "$client_id" =~ ^[a-zA-Z0-9-]{36}$ ]]
[[ "$api_key" =~ ^[a-zA-Z0-9-]{36}$ ]]
[[ "$checksum_key" =~ ^[a-fA-F0-9]{64}$ ]]
cp -p "$dest" "$dest.before-payos"
grep -Ev '^PAYOS_(CLIENT_ID|API_KEY|CHECKSUM_KEY|PUBLIC_BASE_URL|WEBHOOK_CONFIRMED)=' "$dest" > "$dest.next" || true
{
  printf 'PAYOS_CLIENT_ID=%s\n' "$client_id"
  printf 'PAYOS_API_KEY=%s\n' "$api_key"
  printf 'PAYOS_CHECKSUM_KEY=%s\n' "$checksum_key"
  printf 'PAYOS_PUBLIC_BASE_URL=https://64-120-92-172.sslip.io\n'
  printf 'PAYOS_WEBHOOK_CONFIRMED=0\n'
} >> "$dest.next"
chmod 600 "$dest.next"
mv -f "$dest.next" "$dest"
unset client_id api_key checksum_key
echo PAYOS_CREDENTIALS_STORED_ONLY_ON_VPS=YES
echo PAYOS_WEBHOOK_CONFIRMATION_REQUIRED=YES
