"""One-time, user-authorized recall of premature MT and MB Telegram posts.

Keep all three MN posts untouched. Once Telegram confirms deletion,
retire the corresponding pre-send ledger claim so the normal VPS
17:10/18:10 schedule sends the corrected full forecast. Idempotent.
"""
import json
import os
import re
import subprocess
from datetime import datetime, time
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, urlopen
from zoneinfo import ZoneInfo
import sender

TARGETS = (("mt", "Quảng Nam", 387), ("mt", "Đắk Lắk", 388), ("mb", "XSMB", 389))
TODAY = "2026-10-13"
HISTORY = Path("/data/xs-recall-mt-mb-20261013.json")


def persist(obj):
    tmp = HISTORY.with_suffix(".tmp")
    tmp.write_text(json.dumps(obj, ensure_ascii=False), encoding="utf-8")
    tmp.replace(HISTORY)


def retire_ledger(path, region, mid):
    if not path.exists():
        return
    path.unlink()
    subprocess.run(["git", "-C", "/app", "add", "-u", str(path.relative_to("/app"))], check=True)
    subprocess.run(["git", "-C", "/app", "-c", "user.email=kq247-vps@localhost",
                    "-c", "user.name=KQ247-VPS-XS", "commit", "-m",
                    "Recall premature " + region + " post " + str(mid)], check=True)
    subprocess.run(["git", "-C", "/app", "push", "origin", "HEAD:main"], check=True,
                   stdout=subprocess.DEVNULL, timeout=20)


def main():
    now = datetime.now(ZoneInfo("Asia/Ho_Chi_Minh"))
    if now.date().isoformat() != TODAY or now.time().replace(tzinfo=None) >= time(17, 10):
        raise RuntimeError("Outside one-time recall-before-17:10 window")
    token = os.environ.get("TELEGRAM_LOTTERY_BOT_TOKEN", "").strip()
    if not token or os.environ.get("KQ247_LOTTERY_CUTOVER") != "enabled":
        raise RuntimeError("Primary VPS bot unavailable")
    past = json.loads(HISTORY.read_text("utf-8")) if HISTORY.exists() else {}
    checked = []
    for region, station, mid in TARGETS:
        stations, _ = sender.read_snapshot(TODAY, region)
        pick = next((v for k, v in stations.items() if sender.station_name(k) == sender.station_name(station)), None)
        if not pick:
            raise RuntimeError("Missing locked snapshot for " + station)
        sample = sender.message(TODAY, region, station, pick)
        for x in ("DÀN ĐỀ 50 SỐ", "DÀN ĐỀ 60 SỐ", "DÀN ĐỀ 75 SỐ",
                  "DÀN 3 CÀNG (500 SỐ)", "Free 10 ngày"):
            if x not in sample:
                raise RuntimeError("Corrected template missing: " + x)
        slug = re.sub(r"[^a-z0-9]+", "-", sender.station_name(station)).strip("-")
        claim = sender.STORE / TODAY / (region + "-pre-" + slug + ".json")
        if str(mid) not in past:
            if not claim.exists():
                raise RuntimeError("Original claim missing: " + station)
            j = json.loads(claim.read_text("utf-8"))
            if j.get("status") != "sent" or int(j.get("message_id") or 0) != mid:
                raise RuntimeError("Original message mismatch: " + station)
        checked.append((region, station, mid, claim))
    for region, station, mid, claim in checked:
        if past.get(str(mid)) != "deleted":
            req = Request("https://api.telegram.org/bot" + token + "/deleteMessage",
                          data=json.dumps({"chat_id": sender.CHAT, "message_id": mid}).encode(),
                          headers={"Content-Type": "application/json"}, method="POST")
            try:
                with urlopen(req, timeout=18) as r:
                    out = json.loads(r.read(3000))
                if out.get("ok") is not True or out.get("result") is not True:
                    raise RuntimeError("Telegram delete not acknowledged")
            except HTTPError as error:
                reason = error.read(1200).decode("utf-8", "replace").lower()
                if error.code != 400 or "message to delete not found" not in reason:
                    raise RuntimeError("Telegram delete failed: " + region + " " + str(error.code))
            past[str(mid)] = "deleted"
            persist(past)
        retire_ledger(claim, region, mid)
        print("XS_EARLY_RECALLED", region, station, mid, "SCHEDULE_READY", "17:10" if region == "mt" else "18:10", flush=True)
    assert all(past.get(str(mid)) == "deleted" for _, _, mid in TARGETS)
    assert not any(str(mid) in past for mid in (384, 385, 386))
    print("XS_RECALL_MT_MB_CONFIRMED=PASS", flush=True)
    print("XS_MN_UNTOUCHED_384_385_386=PASS", flush=True)


if __name__ == "__main__":
    main()
