#!/usr/bin/env bash
set -euo pipefail
test "$(id -u)" -eq 0
script=/opt/kq247/vietlott/ops/kq247-nightly-retry.py
test -s "$script"
python3 -m py_compile "$script"
before="$(docker inspect kq247-vietlott-vps --format '{{.Id}}')"
cat > /etc/systemd/system/kq247-vietlott-verified-nightly.service <<'SERVICE'
[Unit]
Description=KQ247 source-verified Vietlott daily prediction trigger
Wants=network-online.target
After=network-online.target
[Service]
Type=oneshot
ExecStart=/usr/bin/python3 /opt/kq247/vietlott/ops/kq247-nightly-retry.py
TimeoutStartSec=55
NoNewPrivileges=true
SERVICE
cat > /etc/systemd/system/kq247-vietlott-verified-nightly.timer <<'TIMER'
[Unit]
Description=KQ247 Vietlott every evening at 20:05, 20:15, 20:25 Vietnam
[Timer]
OnCalendar=*-*-* 13:05:00 UTC
OnCalendar=*-*-* 13:15:00 UTC
OnCalendar=*-*-* 13:25:00 UTC
AccuracySec=30s
Persistent=true
Unit=kq247-vietlott-verified-nightly.service
[Install]
WantedBy=timers.target
TIMER
systemd-analyze verify /etc/systemd/system/kq247-vietlott-verified-nightly.{service,timer}
systemctl daemon-reload
systemctl enable --now kq247-vietlott-verified-nightly.timer
systemctl is-active --quiet kq247-vietlott-verified-nightly.timer
test "$before" = "$(docker inspect kq247-vietlott-vps --format '{{.Id}}')"
echo VIETLOTT_VERIFIED_DAILY_TIMER_ACTIVE=YES
