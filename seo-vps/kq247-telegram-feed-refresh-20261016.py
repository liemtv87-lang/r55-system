#!/usr/bin/env python3
"""KQ247 directory-source refresh helper. Discovery only; never sends submissions.

Designed to be run by kq247-telegram-feed-refresh.timer every 5 minutes.
The imported discovery module enforces a 15-minute remote source refresh gate.
"""
import importlib.util
import json
from datetime import datetime, timezone
from pathlib import Path

src = Path("/opt/pwremote/kq247-backlink-background/kq247-backlink-background-discovery-20261014.py")
spec = importlib.util.spec_from_file_location("kq247_feeds", src)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
db = module.db_open()
before = db.execute("SELECT count(*) FROM hosts").fetchone()[0]
module.refresh_public_feeds(db)
after = db.execute("SELECT count(*) FROM hosts").fetchone()[0]
report = {
    "checked_at_utc": datetime.now(timezone.utc).isoformat(),
    "known_hosts": after,
    "new_hosts_this_check": after - before,
    "public_feed_links_examined_total": int(module.state_get(db, "feed_urls_examined")),
    "last_remote_scan": int(module.state_get(db, "feed_last_checked")),
    "note": "Discovered hosts are not approved submissions or verified backlinks.",
}
db.close()
destination = Path("/opt/kq247/deployment/football-original/public/seo-telegram-feed-status.json")
temporary = destination.with_suffix(".tmp")
temporary.write_text(json.dumps(report) + "\n", encoding="utf-8")
temporary.replace(destination)
print("KQ247_FEED_REFRESH=" + json.dumps(report))
