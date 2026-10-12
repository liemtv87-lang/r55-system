"""Run the original lottery-bot/sender.py unmodified.
Disabled by default: never sends until token, explicit one-sender cutover,
and old Hatchable scheduler confirmed off. Persist original Git ledger.
"""
import json
import os
import subprocess
import sys
import threading
import time
from datetime import datetime
from http.server import BaseHTTPRequestHandler,ThreadingHTTPServer
from pathlib import Path
from zoneinfo import ZoneInfo

APP=Path("/app")
CHAT="-1004320899120"
STATUS={"ok":True,"service":"kq247-vps-original-xs-bot","active":False,
        "has_token":False,"last_run":None,"last_exit":None,"last_error":None,
        "source":"exact original github lottery-bot/sender.py",
        "bot_group":"@xsbm999","dedupe":"git local bare volume"}
VN=ZoneInfo("Asia/Ho_Chi_Minh")
def enabled():
    return os.getenv("KQ247_LOTTERY_CUTOVER")=="enabled" and bool(os.getenv("TELEGRAM_LOTTERY_BOT_TOKEN"))
def prepare_git():
    # The original sender commits a durable claim before Telegram send.
    # Keep its git add/commit/push protocol working via a local persistent
    # bare repository instead of requiring GH credentials.
    bare=Path("/data/xs-send-ledger.git")
    if not bare.is_dir():subprocess.run(["git","init","--bare",str(bare)],check=True,stdout=subprocess.DEVNULL)
    if not (APP/".git"/"HEAD").exists():
        subprocess.run(["git","init","-b","main",str(APP)],check=True,stdout=subprocess.DEVNULL)
        subprocess.run(["git","-C",str(APP),"config","user.email","kq247-vps@localhost"],check=True)
        subprocess.run(["git","-C",str(APP),"config","user.name","KQ247-VPS-XS"],check=True)
        subprocess.run(["git","-C",str(APP),"remote","add","origin",str(bare)],check=True)
        subprocess.run(["git","-C",str(APP),"add","-A","lottery-bot/state"],check=True)
        subprocess.run(["git","-C",str(APP),"commit","--allow-empty","-m","Initial sender ledger"],check=True,stdout=subprocess.DEVNULL)
        subprocess.run(["git","-C",str(APP),"push","-u","origin","main"],check=True,stdout=subprocess.DEVNULL)
def schedule_loop():
    last_slot=""
    while True:
        STATUS["active"]=enabled()
        STATUS["has_token"]=bool(os.getenv("TELEGRAM_LOTTERY_BOT_TOKEN"))
        now=datetime.now(VN)
        slot=now.strftime("%Y-%m-%d %H:%M")
        # Work every ten-minute window at +10, +20, etc. Original code's
        # 'due' window validates correct miền/date. It can retry on next poll.
        # VN result summaries: MN 17:00-17:05, MT 18:00-18:05, MB 20:00-20:05.
        # Try each minute in the strict result window; do not post later.
        is_result_window=now.hour in (17,18,20) and now.minute<=5
        is_pre_window=now.hour in (16,17,18) and now.minute in (10,12,14)
        if enabled() and (is_result_window or is_pre_window) and last_slot!=slot:
            last_slot=slot
            try:
                prepare_git()
                env={**os.environ,"DRY_RUN":"0"}
                p=subprocess.run([sys.executable,"/app/lottery-bot/sender.py"],cwd=APP,env=env,
                                 text=True,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,
                                 timeout=150,check=False)
                STATUS["last_run"]=now.isoformat()
                STATUS["last_exit"]=p.returncode
                STATUS["last_error"]=None if p.returncode==0 else p.stdout[-200:].replace(os.getenv("TELEGRAM_LOTTERY_BOT_TOKEN",""),"[REDACTED]")
                print("XS_VPS_SENDER_RESULT",slot,"exit",p.returncode,flush=True)
            except Exception as e:
                STATUS["last_error"]=type(e).__name__
                print("XS_VPS_SENDER_FAILURE",type(e).__name__,flush=True)
        time.sleep(15)
class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path!="/healthz":
            self.send_response(404);self.end_headers();return
        body=json.dumps(STATUS,ensure_ascii=False).encode()
        self.send_response(200);self.send_header("Content-Type","application/json")
        self.send_header("Cache-Control","no-store")
        self.send_header("Content-Length",str(len(body)));self.end_headers();self.wfile.write(body)
    def log_message(self,*a):pass
threading.Thread(target=schedule_loop,daemon=True).start()
print("KQ247_XS_ORIGINAL_BOT_VPS_STANDBY",flush=True)
ThreadingHTTPServer(("0.0.0.0",3005),Handler).serve_forever()
