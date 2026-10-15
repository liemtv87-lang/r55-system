#!/usr/bin/env python3
"""KQ247 backlink-source DISCOVERY. No signups, POSTs, captcha bypass, or claims of publication.

Stream enormous URL inventories without storing page URLs; deduplicate actual hosts;
audit only submission routes; checkpoint to SQLite. One bounded background run, no cron.
"""
import concurrent.futures as futures
import datetime as datetime
from html.parser import HTMLParser
import ipaddress
import json
import os
from pathlib import Path
import re
import socket
import sqlite3
import sys
import time
from urllib.parse import urljoin, urlsplit
from urllib.request import Request, urlopen

ROOT = Path(os.environ.get("KQ247_BASE", "/opt/pwremote/kq247-backlink-background"))
DB = ROOT / "sources.sqlite3"
REPORT = ROOT / "latest.json"
INPUTS = [ROOT / "url-inventory.txt", Path("/opt/pwremote/kq247-domain-first/url-inventory.txt")]
TARGETS = ["https://t.me/keochuyengia79", "https://t.me/xsbm999"]
WORKERS = max(1, min(10, int(os.environ.get("KQ247_WORKERS", "6"))))
MAX_SECONDS = max(60, min(14400, int(os.environ.get("KQ247_MAX_SECONDS", "10800"))))
MAX_HTTP_HOSTS = max(25, min(150000, int(os.environ.get("KQ247_MAX_HTTP_HOSTS", "20000"))))
MAX_URL_LINES = max(1000, min(2000000000, int(os.environ.get("KQ247_MAX_URL_LINES", "2000000000"))))
BATCH = 25000
WATCH = ("--watch" in sys.argv)
IDLE_SECONDS = max(60, min(1800, int(os.environ.get("KQ247_IDLE_SECONDS", "120"))))
STALE_DAYS = max(7, min(90, int(os.environ.get("KQ247_STALE_DAYS", "7"))))
PATH_RE = re.compile(r"submit|publish|add[-_/]?(?:group|channel|link|listing)|suggest|directory|register|addgroup|dang[-_/]?(?:tin|bai)|them[-_/]?nhom", re.I)
DOMAIN_RE = re.compile(r"(telegram|telegr|tg(?:find|hub|link|mania|dir|group|radar|box)|group|directory|link|forum|listing|submit|community)", re.I)
URL_RE = re.compile(r"https?://[^\s\"'<>\\]+", re.I)
# Public editorial directories of directory-submission links, used for READ-ONLY discovery.
# Do not submit to a source merely because it was linked from one of these pages.
PUBLIC_DIRECTORY_FEEDS = [
    "https://launchdirectories.com/free-web-directories",
    "https://onlytraction.com/directories/free-submission",
    "https://saalinko.com/directory-submission-sites-list/",
    "https://telegramdirectory.tech/",
    "https://telegramgroups.co/",
    "https://groupverse.co.in/",
]
FEED_REFRESH_SECONDS = 3600
SEED = [
"https://groupsgyani.org/submit-telegram-group-and-channel-links",
"https://telegramgroup.arkservices.in/submit",
"https://spamfixer.ru/en/catalog/",
"https://buyinoffer.com/add-channel.html",
"https://tgmania.com/submit",
"https://telegramchannels.io/submit-channel",
"https://telegramhub.org/submit",
"https://groupverse.co.in/submit-your-group.html",
"https://telegram-group.org/SubmitGroup.php",
"https://groupssor.com/submit/",
"https://tg-hub.com/submit-telegram-channel-and-group-links/",
"https://telegroups.org/submit",
"https://telegramgroups.co/submit",
"https://tgden.com/en/suggest",
"https://toptglinks.com/submit",
"https://telekit.link/addgroup",
"https://tgdirectory.me/submit",
"https://telegram-group.com/en/publish/",
"https://telegram-group-links.com/submit",
"https://telegram-groups.net/submit",
"https://telegram-groups.com/dashboard/submit/",
"https://tdirectory.me/search/vietnamese",
"https://tgramlink.com/vi",
"https://telegramchannels.me/submit",
"https://televerse.click/submit",
"https://togather.in/submit",
"https://www.wtgrouplinks.com/submit-your-telegram-groups/",
"https://telegramhub.app/submit",
"https://telegramdirectory.tech/submit-channel",
"https://telxplorer.com/en/create_group",
"https://tgfind.io/en/inclusion-link",
"https://worldtelegramdirectory.com/submit",
"https://telegradia.com",
"https://tgbox.cc",
"https://groupmandi.com/submit",
"https://telegramradar.com",
"https://tgfinder.net",
"https://tgfind.net",
"https://telejoiner.com",
"https://tgram.vn",
"https://tgcamp.com/auth/register",
"https://telegramgroups.co",
"https://telegramgroup.link",
"https://groupswa.com/submit-group-links/",
"https://groupda.com",
"https://telehub.to",
"https://telegramtop.com",
"https://tgcompass.com",
"https://open.tg",
"https://search-t.me",
"https://telegrmgrouplink.com/add-your-telegram-group-channel-link-to-this-website-submit/",
"https://www.telegram-groups.com/dashboard/submit/",
"https://www.groupssor.com/submit/",
]

def host_url(raw):
    try:
        p = urlsplit(raw.strip())
        host = (p.hostname or "").lower().removeprefix("www.")
        if p.scheme not in ("https", "http") or p.username or p.password or not host or "." not in host:
            return None
        if len(raw) > 2048 or host.endswith((".local", ".localhost", ".internal", ".onion")):
            return None
        try:
            ipaddress.ip_address(host)
            return None
        except ValueError:
            pass
        if not re.fullmatch(r"[a-z0-9.-]{4,253}", host) or ".." in host:
            return None
        return host, "https://" + host + (p.path or "/")
    except ValueError:
        return None

def safe_remote(host):
    """Reject private/loopback/reserved addresses, including DNS-resolved ones."""
    try:
        addrs = socket.getaddrinfo(host, 443, type=socket.SOCK_STREAM)
        return bool(addrs) and all(ipaddress.ip_address(a[4][0]).is_global for a in addrs)
    except (OSError, ValueError):
        return False

class HtmlScan(HTMLParser):
    def __init__(self):
        super().__init__()
        self.forms = 0
        self.fields = []
        self.links = []
        self.buttons = []
        self._button = False
    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == "form":
            self.forms += 1
        if tag in ("input", "select", "textarea"):
            self.fields.append(" ".join(str(attrs.get(x, "")) for x in ("name","id","placeholder","aria-label")).lower())
        if tag == "a" and attrs.get("href"):
            self.links.append(attrs["href"])
        if tag == "button":
            self._button = True
    def handle_endtag(self, tag):
        if tag == "button":
            self._button = False
    def handle_data(self, data):
        if self._button:
            self.buttons.append(data.strip().lower())

def get_page(url, allow_truncated=False):
    from urllib.request import build_opener, HTTPRedirectHandler
    class SafeRedirect(HTTPRedirectHandler):
        def redirect_request(self, req, fp, code, msg, headers, newurl):
            parsed = host_url(newurl)
            if not parsed or not safe_remote(parsed[0]):
                raise ValueError("blocked redirect")
            return super().redirect_request(req, fp, code, msg, headers, newurl)
    parsed = host_url(url)
    if not parsed or not safe_remote(parsed[0]):
        return None, "unsafe_host"
    try:
        opener = build_opener(SafeRedirect)
        with opener.open(Request(url, headers={"User-Agent":"KQ247BacklinkResearch/2.0 (+public-pages-only)", "Accept":"text/html"}), timeout=7) as r:
            if r.status != 200: return None, "http_" + str(r.status)
            if "html" not in r.headers.get("Content-Type","").lower(): return None, "not_html"
            content = r.read(1048577)
            if len(content) > 1048576:
                if not allow_truncated: return None, "too_big"
                # Discovery feeds can be much larger than 1MiB: parse only a
                # bounded public HTML prefix, never pretend it was exhaustive.
                content = content[:1048576]
            return (r.url, content.decode("utf-8", "replace")), None
    except Exception as exc:
        return None, type(exc).__name__

def inspect(entry):
    host, route = entry
    page, error = get_page(route, allow_truncated=True)
    if not page and urlsplit(route).path != "/":
        page, error = get_page("https://" + host + "/", allow_truncated=True)
    if not page:
        return host, route, "unavailable", error or "request_failure", []
    final, raw = page
    p = HtmlScan()
    try:
        p.feed(raw)
    except Exception:
        return host, route, "html_error", "malformed_html", []
    low = raw.lower()
    if any(x in low for x in ("data-sitekey","g-recaptcha","hcaptcha","turnstile")):
        status, reason = "manual_review", "captcha_or_challenge"
    elif any(x in low for x in ("payment required","pay to submit","paid listing only","one-time listing fee")):
        status, reason = "excluded", "paid_listing"
    elif any(x in low for x in ("submissions are closed","not accepting submissions","submissions paused")):
        status, reason = "excluded", "submissions_closed"
    elif any(x in low for x in ("login to submit","sign in to submit","must be logged in")):
        status, reason = "manual_review", "login_required"
    elif p.forms and any(re.search(r"telegram|t\.me|channel|invite|group|link|url", f) for f in p.fields):
        status, reason = "form_candidate", "visible_form_requires_terms_review"
    else:
        status, reason = "no_form", "no_matching_public_form"
    suggestions = []
    if status == "no_form":
        for href in p.links:
            link = urljoin(final, href)
            parsed = host_url(link)
            if parsed and parsed[0] == host and PATH_RE.search(urlsplit(link).path):
                suggestions.append(link)
                if len(suggestions) >= 3: break
    return host, final, status, reason, suggestions

def refresh_public_feeds(con):
    """Once per day, discover new opt-in candidates from public directory indexes.

    Discovery only: every URL is still independently checked before the
    submission worker considers any guest form.
    """
    last = int(state_get(con, "feed_last_checked", "0"))
    if time.time() - last < FEED_REFRESH_SECONDS:
        return
    found = 0
    links_seen = 0
    per_feed = {}
    for feed in PUBLIC_DIRECTORY_FEEDS:
        page, error = get_page(feed, allow_truncated=True)
        if not page:
            per_feed[feed] = error or "unavailable"
            continue
        final, raw = page
        parser = HtmlScan()
        parser.feed(raw)
        source = host_url(feed)
        before = con.execute("SELECT COUNT(*) FROM hosts").fetchone()[0]
        for href in parser.links[:8000]:
            links_seen += 1
            absolute = urljoin(final, href)
            entry = host_url(absolute)
            if not entry or entry[0] == source[0]:
                continue
            add_url(con, absolute)
        after = con.execute("SELECT COUNT(*) FROM hosts").fetchone()[0]
        new_hosts = after - before
        per_feed[feed] = new_hosts
        found += new_hosts
    state_set(con, "feed_last_checked", int(time.time()))
    state_set(con, "feed_last_status_json", json.dumps(per_feed, ensure_ascii=False))
    state_set(con, "feed_urls_examined",
              int(state_get(con, "feed_urls_examined")) + links_seen)
    state_set(con, "feed_hosts_added",
              int(state_get(con, "feed_hosts_added")) + found)
    con.commit()
    print("KQ247_FEED_DISCOVERY=" + json.dumps({
        "new_hosts":found, "links_examined":links_seen, "sources":per_feed
    }, ensure_ascii=False), flush=True)

def db_open():
    con = sqlite3.connect(DB, timeout=30)
    con.execute("PRAGMA journal_mode=WAL")
    con.execute("PRAGMA synchronous=NORMAL")
    con.execute("CREATE TABLE IF NOT EXISTS hosts (host TEXT PRIMARY KEY, url TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', reason TEXT DEFAULT '', checked TEXT DEFAULT '')")
    con.execute("CREATE TABLE IF NOT EXISTS state (key TEXT PRIMARY KEY, value TEXT NOT NULL)")
    con.commit()
    return con

def state_get(con, key, default="0"):
    a = con.execute("SELECT value FROM state WHERE key=?", (key,)).fetchone()
    return a[0] if a else default

def state_set(con, key, value):
    con.execute("INSERT INTO state(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", (key, str(value)))

def add_url(con, raw, force=False):
    v = host_url(raw)
    if not v: return
    host, url = v
    if not force and not (PATH_RE.search(urlsplit(url).path) or DOMAIN_RE.search(host)):
        return
    con.execute("INSERT OR IGNORE INTO hosts(host,url) VALUES(?,?)", (host,url))
    if PATH_RE.search(urlsplit(url).path):
        con.execute("UPDATE hosts SET url=? WHERE host=? AND status='pending' AND url LIKE '%/'", (url,host))

def source_files():
    """Consume every available real inventory, each with its own durable byte cursor."""
    extra = os.environ.get("KQ247_URL_INVENTORY", "")
    paths = list(INPUTS) + [Path(p) for p in extra.split(os.pathsep) if p]
    paths += sorted((ROOT / "incoming").glob("*.txt"))
    real = list(dict.fromkeys(p for p in paths if p.is_file() and p.stat().st_size > 0))
    if real:
        return real
    bootstrap = INPUTS[0]
    bootstrap.parent.mkdir(parents=True, exist_ok=True)
    actual_routes = list(dict.fromkeys(SEED))
    bootstrap.write_text("\n".join(actual_routes) + "\n", encoding="utf-8")
    print("KQ247_BOOTSTRAP_INVENTORY=" + json.dumps({
        "path": str(bootstrap), "real_seed_urls": len(actual_routes),
        "note": "Real seed records only, not millions of URLs or published links."
    }), flush=True)
    return [bootstrap]

def ingest(con, f, max_records):
    name = "inventory:" + str(f.resolve())
    size = f.stat().st_size
    pos = int(state_get(con, name + ":byte", "0"))
    if pos > size: pos = 0
    count = 0
    extracted = 0
    with f.open("rb") as reader:
        reader.seek(pos)
        while count < max_records:
            line = reader.readline()
            if not line: break
            count += 1
            decoded = line.decode("utf-8", "ignore").strip()
            urls = URL_RE.findall(decoded)
            if not urls and re.fullmatch(r"[a-zA-Z0-9.-]{4,253}", decoded):
                urls = ["https://" + decoded]
            for raw in urls:
                add_url(con, raw.rstrip(".,;)"))
            extracted += len(urls)
            if count % BATCH == 0:
                state_set(con, name + ":byte", reader.tell())
                state_set(con, "urls_read", int(state_get(con, "urls_read")) + BATCH)
                state_set(con, "urls_extracted", int(state_get(con, "urls_extracted")) + extracted)
                extracted = 0
                con.commit()
        rem = count % BATCH
        state_set(con, name + ":byte", reader.tell())
        state_set(con, "urls_read", int(state_get(con, "urls_read")) + rem)
        state_set(con, "urls_extracted", int(state_get(con, "urls_extracted")) + extracted)
        con.commit()
    return count

def write_report(con, started, scanned, sources):
    groups = dict(con.execute("SELECT status,COUNT(*) FROM hosts GROUP BY status").fetchall())
    out = {"updated_utc":datetime.datetime.now(datetime.timezone.utc).isoformat(),
      "elapsed_s":round(time.monotonic()-started,2),
      "source_inventory_exists":bool(sources), "inventory_paths":[str(s) for s in sources],
      "inventory_files_count":len(sources),
      "public_feed_urls_examined_total":int(state_get(con,"feed_urls_examined")),
      "public_feed_last_checked_utc":datetime.datetime.fromtimestamp(int(state_get(con,"feed_last_checked")),datetime.timezone.utc).isoformat() if int(state_get(con,"feed_last_checked")) else None,
      "public_feed_last_status":json.loads(state_get(con,"feed_last_status_json","{}")),
      "public_feed_hosts_added_total":int(state_get(con,"feed_hosts_added")),
      "inventory_lines_read_total":int(state_get(con,"urls_read")),
      "url_records_actually_read_total":int(state_get(con,"urls_extracted")),
      "unique_hosts_discovered":con.execute("SELECT COUNT(*) FROM hosts").fetchone()[0],
      "http_hosts_checked_this_run":scanned,
      "hosts_by_status":groups,
      "candidate_forms":[{"site":r[0],"url":r[1],"reason":r[2]} for r in con.execute(
            "SELECT host,url,reason FROM hosts WHERE status='form_candidate' ORDER BY host LIMIT 1000")],
      "public_backlinks_created_by_scanner":0,
      "disclaimer":"Discovery only. Candidate does not mean free eligibility, signup, acceptance, or published backlink."}
    tmp = REPORT.with_suffix(".tmp")
    tmp.write_text(json.dumps(out, ensure_ascii=False, indent=2))
    tmp.replace(REPORT)
    print("KQ247_BG_PROGRESS="+json.dumps({k:out[k] for k in (
        "url_records_actually_read_total","unique_hosts_discovered","http_hosts_checked_this_run",
        "hosts_by_status","public_backlinks_created_by_scanner")}), flush=True)

def selftest():
    assert host_url("https://www.groupssor.com/submit/")[0] == "groupssor.com"
    assert host_url("http://127.0.0.1/login") is None
    assert host_url("file:///etc/passwd") is None
    assert PATH_RE.search("/submit-group/")
    x=HtmlScan()
    x.feed('<form><input name="telegram_link" /></form>')
    assert x.forms == 1 and any("telegram_link" in field for field in x.fields)
    assert len(dict.fromkeys(SEED)) >= 35
    assert any("telegrmgrouplink.com" in u for u in SEED)
    print("SELFTEST_OK")

def main():
    if "--self-test" in sys.argv:
        selftest()
        return
    import fcntl
    ROOT.mkdir(parents=True, exist_ok=True)
    with (ROOT / "worker.lock").open("w") as lock:
        try: fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            print("ALREADY_RUNNING", flush=True)
            return
        started = time.monotonic()
        con = db_open()
        # Prior workers rejected oversized public HTML entirely. Recheck ONLY
        # those previously classified too_big with the bounded-prefix reader.
        # This never erases submission records or retries a completed POST.
        rescan = con.execute(
            "UPDATE hosts SET status='pending',reason='bounded_html_retry' "
            "WHERE status='unavailable' AND reason='too_big'"
        ).rowcount
        if rescan:
            print("KQ247_RECHECK_PREVIOUSLY_TOO_BIG="+str(rescan),flush=True)
            con.commit()
        for u in SEED: add_url(con,u,force=True)
        con.commit()
        refresh_public_feeds(con)
        sources = source_files()
        scanned = 0
        while WATCH or (time.monotonic()-started < MAX_SECONDS and scanned < MAX_HTTP_HOSTS):
            # Incrementally load new URL records. Never reset the cursor to inflate counts.
            sources = source_files()
            refresh_public_feeds(con)
            budget = MAX_URL_LINES - int(state_get(con,"urls_read"))
            for source in sources:
                if budget <= 0: break
                read = ingest(con, source, min(100000, budget))
                budget -= read
            if WATCH and scanned >= MAX_HTTP_HOSTS:
                # Budget per scan window, not an attempt to fetch unlimited hosts at once.
                time.sleep(IDLE_SECONDS)
                scanned = 0
            remaining = MAX_HTTP_HOSTS-scanned
            entries=con.execute("SELECT host,url FROM hosts WHERE status='pending' LIMIT ?", (min(WORKERS*5,remaining),)).fetchall()
            if not entries:
                write_report(con,started,scanned,sources)
                if not WATCH:
                    break
                # Periodically requalify previously unavailable sources, not submissions.
                cutoff=(datetime.datetime.now(datetime.timezone.utc)-
                        datetime.timedelta(days=STALE_DAYS)).isoformat()
                con.execute("UPDATE hosts SET status='pending' WHERE status IN ('unavailable','no_form') AND checked != '' AND checked < ?",(cutoff,))
                con.commit()
                print("KQ247_BG_IDLE="+json.dumps({"sleep_s":IDLE_SECONDS,
                    "source_inventory_exists":bool(sources),"new_hosts_pending":0}),flush=True)
                time.sleep(IDLE_SECONDS)
                sources = source_files()
                continue
            with futures.ThreadPoolExecutor(max_workers=WORKERS) as pool:
                responses = list(pool.map(inspect, entries))
            for host, final, status, reason, suggestions in responses:
                # Follow in-domain first-party submission links at most once.
                if (status=="no_form" and suggestions and suggestions[0] != final
                    and urlsplit(final).path != urlsplit(suggestions[0]).path
                    and con.execute("SELECT reason FROM hosts WHERE host=?", (host,)).fetchone()[0] != "follow_submit_link"):
                    con.execute("UPDATE hosts SET url=?,reason='follow_submit_link' WHERE host=?", (suggestions[0],host))
                else:
                    con.execute("UPDATE hosts SET url=?,status=?,reason=?,checked=? WHERE host=?",
                      (final,status,reason,datetime.datetime.now(datetime.timezone.utc).isoformat(),host))
            scanned += len(entries)
            con.commit()
            write_report(con,started,scanned,sources)
        write_report(con,started,scanned,sources)
        print("KQ247_BG_DONE="+json.dumps({"elapsed_s":round(time.monotonic()-started,2),
          "records_read":int(state_get(con,"urls_read")),"hosts_http_checked":scanned}),flush=True)
        con.close()
if __name__=="__main__":
    main()
