"""Send one explicitly requested XS Telegram connectivity test from the VPS.
No prediction or summary is published. Keep test state durable to avoid duplicates.
"""
import json
import os
import sys
from datetime import datetime
from pathlib import Path
from urllib.request import Request, urlopen
from zoneinfo import ZoneInfo

CHAT = "-1004320899120"
MARKER = Path("/data/xs-test-message-20261012.json")
def main():
    if MARKER.exists():
        saved=json.loads(MARKER.read_text())
        print("XS_TEST_ALREADY_SENT message_id="+str(saved.get("message_id")))
        return
    token=os.environ.get("TELEGRAM_LOTTERY_BOT_TOKEN", "").strip()
    if not token: raise RuntimeError("XS_BOT_TOKEN_UNAVAILABLE")
    message=("🔧 KQ247 – KIỂM TRA BOT XỔ SỐ\n"
             "✅ Đây là tin kiểm tra kết nối từ VPS VinaHost.\n"
             "ℹ️ Không phải dự đoán hoặc tổng kết kết quả xổ số.")
    payload=json.dumps({"chat_id":CHAT,"text":message,
                        "disable_notification":True}).encode()
    req=Request("https://api.telegram.org/bot"+token+"/sendMessage",
                data=payload,headers={"Content-Type":"application/json"},method="POST")
    with urlopen(req, timeout=20) as r: result=json.load(r)
    if result.get("ok") is not True or not result.get("result",{}).get("message_id"):
        raise RuntimeError("TELEGRAM_NOT_CONFIRMED")
    message_id=result["result"]["message_id"]
    temp=MARKER.with_suffix(".tmp")
    temp.write_text(json.dumps({"message_id":message_id,"chat_id":CHAT,
                 "sent_at":datetime.now(ZoneInfo("Asia/Ho_Chi_Minh")).isoformat()}))
    temp.replace(MARKER)
    print("XS_TELEGRAM_TEST_SENT=YES")
    print("XS_TELEGRAM_TEST_MESSAGE_ID="+str(message_id))
if __name__=="__main__": main()
