#!/usr/bin/env python3
"""Install only isolated Bongdalu result backfill units; no production or SEO changes."""
import pathlib,subprocess,sys
BASE=pathlib.Path("/opt/kq247/research")
UNITS=pathlib.Path("/etc/systemd/system")
SERVICE="""[Unit]
Description=KQ247 research-only Bongdalu historical results, 500 dated days
After=network-online.target
Wants=network-online.target
[Service]
Type=oneshot
WorkingDirectory=/opt/kq247/research/bin
Environment=KQ247_RESEARCH_ROOT=/opt/kq247/research/state
Environment=KQ247_FOOTBALL_DAYS_PER_CYCLE=8
ExecStart=/usr/bin/python3 /opt/kq247/research/bin/football_bongdalu_500day_fetch.py
TimeoutStartSec=300
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
Description=KQ247 read-only Bongdalu 500-day result source retrieval, every 10 min
[Timer]
OnCalendar=*-*-* *:06/10:00
AccuracySec=1s
RandomizedDelaySec=0
Persistent=true
Unit=kq247-research-football-fetch.service
[Install]
WantedBy=timers.target
"""
def run(args):subprocess.run(args,check=True,timeout=15)
def main():
 if "--self-test" in sys.argv:
  assert "ExecStart=/usr/bin/python3 /opt/kq247/research/bin/football_bongdalu_500day_fetch.py" in SERVICE
  assert "ProtectSystem=strict" in SERVICE and "10 min" in TIMER
  print("KQ247_R55_FT_TIMER_INSTALL_SELFTEST=PASS");return
 if not (BASE/"bin/football_bongdalu_500day_fetch.py").is_file():
  raise FileNotFoundError("historical source script missing")
 name="kq247-research-football-fetch"
 (UNITS/(name+".service")).write_text(SERVICE)
 (UNITS/(name+".timer")).write_text(TIMER)
 run(["systemctl","daemon-reload"])
 run(["systemctl","enable","--now",name+".timer"])
 run(["systemctl","is-active","--quiet",name+".timer"])
 print("KQ247_R55_500DAY_ARCHIVE_TIMER_ACTIVE=PASS",flush=True)
if __name__=="__main__":main()
