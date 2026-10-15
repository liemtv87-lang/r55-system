#!/usr/bin/env python3
"""Install isolated historical Bongdalu form-archive timer, production untouched."""
import pathlib,subprocess,sys
BIN=pathlib.Path("/opt/kq247/research/bin")
DIR=pathlib.Path("/etc/systemd/system")
NAME="kq247-research-football-form"
SERVICE="""[Unit]
Description=KQ247 read-only historical 20-team-form & AH-market research source
After=network-online.target
Wants=network-online.target
[Service]
Type=oneshot
WorkingDirectory=/opt/kq247/research/bin
Environment=KQ247_RESEARCH_ROOT=/opt/kq247/research/state
Environment=KQ247_H2H_PAGES_PER_CYCLE=12
ExecStart=/usr/bin/python3 /opt/kq247/research/bin/football_historical_form_archive.py
TimeoutStartSec=420
CPUQuota=45%
MemoryMax=512M
Nice=12
NoNewPrivileges=true
ProtectSystem=strict
ReadWritePaths=/opt/kq247/research/state
ProtectHome=true
PrivateTmp=true
PrivateDevices=true
"""
TIMER="""[Unit]
Description=KQ247 archive grounded historical football form pages every 10min
[Timer]
OnCalendar=*-*-* *:08/10:00
AccuracySec=1s
RandomizedDelaySec=0
Persistent=true
Unit=kq247-research-football-form.service
[Install]
WantedBy=timers.target
"""
def run(a):subprocess.run(a,check=True,timeout=15)
def main():
 if "--self-test" in sys.argv:
  assert NAME in TIMER and "ProtectSystem=strict" in SERVICE
  assert "football_historical_form_archive.py" in SERVICE
  print("KQ247_R55_FORM_ARCHIVE_INSTALL_SELFTEST=PASS");return
 for file in ("football_historical_form_archive.py","football-h2h-seed-ids.json"):
  if not (BIN/file).is_file():raise FileNotFoundError(file)
 (DIR/(NAME+".service")).write_text(SERVICE)
 (DIR/(NAME+".timer")).write_text(TIMER)
 run(["systemctl","daemon-reload"])
 run(["systemctl","enable","--now",NAME+".timer"])
 run(["systemctl","is-active","--quiet",NAME+".timer"])
 print("KQ247_R55_HISTORICAL_FORM_TIMER_ACTIVE=YES",flush=True)
if __name__=="__main__":main()
