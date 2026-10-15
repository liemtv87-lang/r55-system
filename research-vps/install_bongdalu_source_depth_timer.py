#!/usr/bin/env python3
"""Separate verified Bongdalu root + history depth discovery timer for R55 research."""
import pathlib,subprocess,sys
ROOT=pathlib.Path("/etc/systemd/system")
NAME="kq247-research-bongdalu-source"
SERVICE="""[Unit]
Description=KQ247 Bongdalu verified host discovery and historical depth probes
After=network-online.target
Wants=network-online.target
[Service]
Type=oneshot
WorkingDirectory=/opt/kq247/research/bin
Environment=KQ247_RESEARCH_ROOT=/opt/kq247/research/state
Environment=KQ247_BONG_SOURCE_CANDIDATES=11
ExecStart=/usr/bin/python3 /opt/kq247/research/bin/bongdalu_source_depth.py
TimeoutStartSec=480
CPUQuota=65%
MemoryMax=384M
Nice=12
NoNewPrivileges=true
ProtectSystem=strict
ReadWritePaths=/opt/kq247/research/state
ProtectHome=true
PrivateTmp=true
PrivateDevices=true
"""
TIMER="""[Unit]
Description=Auto-refresh validated Bongdalu football+odds link every hour
[Timer]
OnCalendar=hourly
AccuracySec=2min
RandomizedDelaySec=0
Persistent=true
Unit=kq247-research-bongdalu-source.service
[Install]
WantedBy=timers.target
"""
def run(args):subprocess.run(args,check=True,timeout=20)
def main():
 if "--self-test" in sys.argv:
  assert "bongdalu_source_depth.py" in SERVICE
  assert "OnCalendar=hourly" in TIMER
  assert "ProtectSystem=strict" in SERVICE
  print("KQ247_BONGDALU_SOURCE_TIMER_SELFTEST=PASS");return
 if not pathlib.Path("/opt/kq247/research/bin/bongdalu_source_depth.py").is_file():
  raise FileNotFoundError("Verified source module absent")
 (ROOT/(NAME+".service")).write_text(SERVICE)
 (ROOT/(NAME+".timer")).write_text(TIMER)
 run(["systemctl","daemon-reload"])
 run(["systemctl","enable","--now",NAME+".timer"])
 run(["systemctl","is-active","--quiet",NAME+".timer"])
 print("KQ247_BONGDALU_SOURCE_TIMER_ACTIVE=YES")
if __name__=="__main__":main()
