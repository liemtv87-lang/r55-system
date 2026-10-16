#!/usr/bin/env python3
"""Remove ONLY the duplicate 30/60/150 legacy stats card from LIVE KQ247 Vietlott HTML.
Leaves verified R34 statistics iframe, user filtering, guest, bot, snapshots, and containers alone.
Usage (authorized VPS root): python3 remove-duplicate-legacy-stats-20261016.py
"""
import datetime
import hashlib
import os
import pathlib
import re
import tempfile
import urllib.request

BASE = "https://vietlott.64-120-92-172.sslip.io/"
OLD_TEXTS = ("Chấm 30 kỳ", "Thống kê 60 kỳ", "Hồi kiểm 30 / 60 / 150 kỳ")
NEW_MARKER = "KQ247_R34_VERIFIED_STATS_PANEL_BEGIN"
ROOT = pathlib.Path("/opt/kq247")
BACKUP = ROOT / "ops" / "backups"
def get_live():
    req = urllib.request.Request(BASE + "?kq247-ui-repair=" + datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%d%H%M%S"),
                                 headers={"User-Agent": "KQ247-stats-deduplicate", "Cache-Control": "no-cache"})
    with urllib.request.urlopen(req, timeout=15) as res:
        if res.status != 200:
            raise RuntimeError("Public route returned HTTP "+str(res.status))
        content = res.read(3000000)
    return content
def remove_old(raw):
    h = raw.decode("utf-8")
    if NEW_MARKER not in h:
        raise RuntimeError("New verified R34 report absent: refuse deleting the old display")
    if h.count("<!-- " + NEW_MARKER + " -->") != 1:
        raise RuntimeError("Verified R34 report count is not exactly 1")
    old = re.search(r'<div\s+class=["\x27][^"\x27]*\banalytics-card\b[^"\x27]*["\x27][^>]*>',h,re.I)
    if not old:
        if all(x not in h for x in OLD_TEXTS):
            return None
        raise RuntimeError("Old report still visible but section anchor is unexpected")
    depth, stop = 0, None
    for token in re.finditer(r'</?div\b[^>]*>',h[old.start():],re.I):
        depth += -1 if token.group(0).lower().startswith("</div") else 1
        if depth == 0:
            stop = old.start() + token.end()
            break
    if stop is None:
        raise RuntimeError("Legacy report section div nesting cannot be parsed")
    block = h[old.start():stop]
    if not all(x in block for x in OLD_TEXTS):
        raise RuntimeError("Legacy block identification failed")
    h = h[:old.start()] + h[stop:]
    h, calls = re.subn(r'(?m)^[ \t]*renderAnalytics\(p\);[ \t]*\n?', "", h)
    if calls != 1 or 'id="searchCard"' not in h or 'id="excludeCard"' not in h:
        raise RuntimeError("Legacy script call or number-filter inputs mismatch")
    if NEW_MARKER not in h or h.count("<!-- "+NEW_MARKER+" -->") != 1:
        raise RuntimeError("Verified panel was unexpectedly modified")
    if re.search(r'<div\s+class=["\x27][^"\x27]*\banalytics-card\b',h,re.I):
        raise RuntimeError("Duplicate legacy card still present")
    return h.encode("utf-8")
def set_file(p, content):
    fd, temp = tempfile.mkstemp(prefix=".kq247-legacy-stats-", dir=str(p.parent))
    try:
        os.fchmod(fd,p.stat().st_mode & 0o777)
        with os.fdopen(fd,"wb") as f:
            f.write(content)
            f.flush()
            os.fsync(f.fileno())
        os.replace(temp,p)
    finally:
        if os.path.exists(temp):os.unlink(temp)
def main():
    if os.geteuid() != 0:
        raise PermissionError("Requires authorized VPS root account; no permission bypass")
    before = get_live()
    updated = remove_old(before)
    if updated is None:
        print("KQ247_LEGACY_STATISTICS_ALREADY_REMOVED=YES")
        return
    candidates = [
        ROOT / "vietlott-r33-primary/public/index.html",
        ROOT / "vietlott/public/index.html",
    ]
    candidates += list((ROOT / "vietlott/versions").glob("*/output/public/index.html"))
    candidates += list((ROOT / "vietlott/versions").glob("*/public/index.html"))
    matches=[p for p in candidates if p.is_file() and p.read_bytes()==before]
    if len(matches)!=1:
        print("KQ247_MATCH_COUNT="+str(len(matches)))
        raise RuntimeError("No unique exact live static file. Nothing changed")
    target = matches[0]
    BACKUP.mkdir(parents=True,exist_ok=True)
    stamp=datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    backup=BACKUP / ("vietlott-index-duplicate-stats-"+stamp+".html")
    with open(backup,"xb") as f:
        f.write(before)
    print("KQ247_BACKUP="+str(backup))
    try:
        set_file(target,updated)
        after=get_live()
        if after!=updated:
            raise RuntimeError("Live HTTP does not match patched HTML")
    except Exception:
        set_file(target,before)
        print("KQ247_ROLLBACK=YES")
        raise
    print("KQ247_OLD_STATISTICS_REMOVED=YES")
    print("KQ247_VERIFIED_R34_REPORT_PRESERVED=YES")
    print("KQ247_MAIN_FILE="+str(target))
    print("KQ247_NEW_SHA256="+hashlib.sha256(updated).hexdigest())
    print("KQ247_NO_CONTAINER_RESTART=YES")
if __name__=="__main__":
    main()
