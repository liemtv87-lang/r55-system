#!/usr/bin/env python3
"""Read-only, bounded, parallel sitemap inventory for KQ247 backlink discovery.

Scanned sitemap URL records are CANDIDATES, never claimed backlinks.
Only separately fetched public HTML pages with an exact outbound target link
count as verified backlinks. Never posts, registers, or accesses production.
"""
import concurrent.futures as futures
import datetime as dt
import gzip
import io
import json
import os
import re
import time
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from collections import deque
from html.parser import HTMLParser

DOMAINS = [
    "tgfind.net", "toptglinks.com", "telejoiner.com", "telegramgroups.co",
    "groupmandi.com", "tgmania.com", "telegramhub.org", "groupverse.co.in",
    "groupssor.com", "telegram-group.com", "tglinks.net", "telegramchannels.io",
    "telegramgroup.arkservices.in", "telegram-group.org", "groupsgyani.org", "tg-hub.com",
    "telegramhub.app", "tgcamp.com", "telegramradar.com", "tgfinder.net",
    "telekit.link", "telegram-groups.net", "telegramgroup.link", "telegram-group-links.com",
    "telegroups.org", "telegram-groups.com", "tdirectory.me", "telxplorer.com",
    "tgramlink.com", "tgbox.cc", "togather.in", "tgstat.com",
    "telegradia.com", "tgfind.io", "telehub.to", "search-t.me",
    "telegramchannels.me", "groupda.com", "tgden.com", "tg.app",
    "tgram.vn", "televerse.click", "tgram.com.vn",
    # Additional publicly identified, independent Telegram discovery catalogs.
    "tgcompass.com", "open.tg", "telegramtop.com", "linequn.com",
    "tgkit.io", "view.tg", "metricgram.com",
]
TARGETS = {
    "football": "https://t.me/keochuyengia79",
    "lottery": "https://t.me/xsbm999",
}
KNOWN_LISTINGS = [
    ("football", "https://tgfind.net/en/resource/keochuyengia79"),
    ("lottery", "https://tgfind.net/en/resource/xsbm999"),
    ("football", "https://telejoiner.com/invite/1002315121695"),
    ("lottery", "https://telejoiner.com/invite/1004320899120"),
    ("football", "https://vi.tgdio.com/group/%40keochuyengia79"),
    ("lottery", "https://vi.tgdio.com/group/%40xsbm999"),
    # KQ247 branded public URLs discovered in the 675,922 URL scan;
    # NOT counted until each HTML page is fetched and its exact t.me href verified.
    ("football", "https://toptglinks.com/group/kq247-b-ng-h-m-nay"),
    ("lottery", "https://toptglinks.com/group/kq247-k-t-qu-x-s-ba-mi-n"),
]
MAX_URLS = int(os.getenv("KQ247_MAX_SITEMAP_URLS", "300000"))
MAX_SITEMAPS_GLOBAL = int(os.getenv("KQ247_MAX_SITEMAPS", "320"))
MAX_SITEMAPS_PER_HOST = 24
MAX_BYTES = 8 * 1024 * 1024
TIMEOUT = 7
USER_AGENT = "KQ247-Backlink-SitemapAudit/1.0 (public-sitemaps; read-only)"

def read_url(url, limit=MAX_BYTES):
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept": "application/xml,text/xml,text/plain,text/html,application/gzip"})
    with urllib.request.urlopen(req, timeout=TIMEOUT) as response:
        if response.status != 200:
            raise ValueError("http_" + str(response.status))
        data = response.read(limit + 1)
        if len(data) > limit:
            raise ValueError("response_too_big")
        if url.endswith(".gz") or data[:2] == bytes([31, 139]):
            data = gzip.decompress(data)
            if len(data) > MAX_BYTES * 6:
                raise ValueError("expanded_data_too_big")
        return data, response.url

def norm(url):
    p = urllib.parse.urlsplit(url)
    return p.netloc.lower().removeprefix("www."), p.path.rstrip("/").lower()

class OutboundLinks(HTMLParser):
    def __init__(self):
        super().__init__()
        self.hrefs = []
    def handle_starttag(self, tag, attrs):
        if tag == "a":
            self.hrefs.extend(v for k, v in attrs if k == "href" and v)

def verify_listing(item):
    group, url = item
    try:
        raw, actual = read_url(url, 1000000)
        out = OutboundLinks()
        out.feed(raw.decode("utf-8", "replace"))
        return {"group": group, "url": url,
                "verified": any(norm(urllib.parse.urljoin(actual, x)) == norm(TARGETS[group]) for x in out.hrefs),
                "retrieved": True}
    except Exception as e:
        return {"group": group, "url": url, "verified": False,
                "retrieved": False, "error": type(e).__name__ + ": " + str(e)[:100]}

def is_domain_allowed(url, base):
    p = urllib.parse.urlsplit(url)
    host = (p.hostname or "").lower().removeprefix("www.")
    return p.scheme == "https" and (host == base or host.endswith("." + base)) and not p.username and not p.password

def seed_sitemaps(base):
    seeds = [
        "https://" + base + "/sitemap.xml",
        "https://" + base + "/sitemap_index.xml",
        "https://" + base + "/wp-sitemap.xml",
    ]
    try:
        raw, _ = read_url("https://" + base + "/robots.txt", 300000)
        text = raw.decode("utf-8", "replace")
        for line in text.splitlines():
            if line.lower().strip().startswith("sitemap:"):
                url = line.split(":", 1)[1].strip()
                if is_domain_allowed(url, base):
                    seeds.insert(0, url)
    except Exception:
        pass
    return list(dict.fromkeys(seeds))

def sitemap_nodes(data):
    # No HTML crawling or page guessing: only sitemap index and URL-set XML.
    if not (b"<sitemapindex" in data[:2000] or b"<urlset" in data[:2000]):
        raise ValueError("not_xml_sitemap")
    root = ET.fromstring(data)
    kind = root.tag.rsplit("}", 1)[-1].lower()
    if kind not in ("urlset", "sitemapindex"):
        raise ValueError("not_sitemap_root")
    urls = []
    for element in root.iter():
        if element.tag.rsplit("}", 1)[-1].lower() == "loc" and element.text:
            urls.append(element.text.strip())
    return kind, urls

def scan_one_domain(base):
    stack = deque(seed_sitemaps(base))
    seen_sitemaps = set()
    visited_url_records = set()
    matches = []
    errors = []
    requests = 0
    while stack and requests < MAX_SITEMAPS_PER_HOST and len(visited_url_records) < MAX_URLS:
        uri = stack.popleft()
        if uri in seen_sitemaps or not is_domain_allowed(uri, base):
            continue
        seen_sitemaps.add(uri)
        requests += 1
        try:
            body, final = read_url(uri)
            if not is_domain_allowed(final, base):
                errors.append("sitemap_redirect_off_domain")
                continue
            typ, locations = sitemap_nodes(body)
            if typ == "sitemapindex":
                for u in locations:
                    if is_domain_allowed(u, base) and u not in seen_sitemaps:
                        stack.append(u)
            else:
                for u in locations:
                    if u in visited_url_records:
                        continue
                    visited_url_records.add(u)
                    low = u.lower()
                    if any(k in low for k in ("keochuyengia79", "xsbm999", "kq247")):
                        if len(matches) < 100:
                            matches.append(u)
                    if len(visited_url_records) >= MAX_URLS:
                        break
        except Exception as exc:
            if len(errors) < 12:
                errors.append(uri + ": " + type(exc).__name__ + ": " + str(exc)[:70])
    return {"domain": base, "url_records_scanned": len(visited_url_records),
            "sitemaps_fetched_or_attempted": requests, "candidate_urls": matches,
            "errors": errors, "sitemap_limit_reached": bool(stack)}


# Read-only first-party submission route discovery. A sitemap URL is not a submission form.
SUBMIT_ROUTES = {
    "groupssor.com": "https://www.groupssor.com/submit/",
    "telegroups.org": "https://telegroups.org/submit",
    "tgmania.com": "https://tgmania.com/submit",
    "telegramhub.org": "https://telegramhub.org/submit",
    "telegramgroups.co": "https://telegramgroups.co/submit",
    "telegram-group.com": "https://telegram-group.com/en/publish/",
    "tg-hub.com": "https://tg-hub.com/submit-telegram-channel-and-group-links/",
    "telegram-group.org": "https://telegram-group.org/SubmitGroup.php",
    "tgden.com": "https://tgden.com/en/suggest",
    "telegramchannels.io": "https://telegramchannels.io/submit-channel",
    "groupsgyani.org": "https://groupsgyani.org/submit-telegram-group-and-channel-links",
    "groupverse.co.in": "https://groupverse.co.in/submit-your-group.html",
    "telekit.link": "https://telekit.link/addgroup",
    "tgcamp.com": "https://tgcamp.com/auth/register",
    "tgfind.io": "https://tgfind.io/en/inclusion-link",
    "toptglinks.com": "https://toptglinks.com/submit",
    "telxplorer.com": "https://telxplorer.com/en/create_group",
    "telegramgroup.arkservices.in": "https://telegramgroup.arkservices.in/submit",
    "televerse.click": "https://televerse.click/submit",
    "togather.in": "https://www.togather.in/submit",
    "groupswa.com": "https://groupswa.com/submit-group-links/",
}
class FormLinks(HTMLParser):
    def __init__(self):
        super().__init__()
        self.hrefs = []
        self.forms = 0
        self.fields = 0
    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag == "a" and a.get("href"):
            self.hrefs.append(a["href"])
        if tag == "form":
            self.forms += 1
        if tag in ("input", "textarea", "select"):
            self.fields += 1

def audit_submit_entries(base):
    """Scan root and actual same-host submit entrypoints, with no POST requests."""
    result = {"domain": base, "candidates": [], "root_error": None}
    routes = []
    root = "https://" + base + "/"
    try:
        raw, final = read_url(root, 500000)
        parser = FormLinks()
        parser.feed(raw.decode("utf8", "replace"))
        for href in parser.hrefs:
            link = urllib.parse.urljoin(final, href)
            if is_domain_allowed(link, base) and re.search(
                r"submit|add[-_]?group|add[-_]?channel|publish|suggest|inclusion|add[-_]?media",
                urllib.parse.urlsplit(link).path, re.I
            ):
                routes.append(link)
    except Exception as exc:
        result["root_error"] = type(exc).__name__ + ": " + str(exc)[:110]
    if base in SUBMIT_ROUTES:
        routes.insert(0, SUBMIT_ROUTES[base])
    for url in list(dict.fromkeys(routes))[:3]:
        rec = {"url": url}
        try:
            raw, final = read_url(url, 500000)
            if not is_domain_allowed(final, base):
                rec["status"] = "cross_domain_redirect"
            else:
                html = raw.decode("utf8", "replace")
                doc = FormLinks()
                doc.feed(html)
                rec.update(status="http_200", forms=doc.forms, inputs_selects=doc.fields,
                    possible_captcha=bool(re.search(r"captcha|turnstile|data-sitekey", html, re.I)),
                    possible_login=bool(re.search(r"sign in to submit|login to submit|register to submit", html, re.I)),
                    possible_payment=bool(re.search(r"listing fee|pay .{0,40}to submit|\$\s*(9|29|49)", html, re.I)))
        except Exception as exc:
            rec["status"] = type(exc).__name__ + ": " + str(exc)[:95]
        result["candidates"].append(rec)
    return result


def main():
    started = time.monotonic()
    with futures.ThreadPoolExecutor(max_workers=8) as executor:
        rs = list(executor.map(scan_one_domain, DOMAINS))
        checks = list(executor.map(verify_listing, KNOWN_LISTINGS))
        entry_audits = list(executor.map(audit_submit_entries, DOMAINS))
    total = sum(x["url_records_scanned"] for x in rs)
    matches = list(dict.fromkeys(x for r in rs for x in r["candidate_urls"]))
    report = {
        "time_utc": dt.datetime.now(dt.timezone.utc).isoformat(),
        "mode": "read_only_parallel_public_sitemap_inventory",
        "scanned_sitemap_url_records": total,
        "sitemap_requests": sum(x["sitemaps_fetched_or_attempted"] for x in rs),
        "domains_probed": len(DOMAINS),
        "candidate_urls_matched_kq247_handles": matches,
        "known_listing_checks": checks,
        "verified_existing_listings": sum(bool(x["verified"]) for x in checks),
        "new_backlinks_published_by_this_job": 0,
        "duration_seconds": round(time.monotonic() - started, 2),
        "sites": rs,
        "submission_entrypoint_audits": entry_audits,
        "limitations": [
            "Sitemap URL records are not verified backlinks.",
            "A page lacking the group's handle in its URL can contain a link and will not be discovered by URL-only screening.",
            "Only explicit fetched listing pages with exact public target anchors count as backlinks.",
            "Each domain limited to 24 sitemap requests; respect public web server limits.",
        ],
    }
    os.makedirs("reports", exist_ok=True)
    with open("reports/kq247-bulk-sitemap-scan.json", "w", encoding="utf-8") as f:
        json.dump(report, f, ensure_ascii=False, indent=2)
    print("KQ247_BULK_SCAN_SUMMARY=" + json.dumps({
        "scanned_url_records": total,
        "sitemap_requests": report["sitemap_requests"],
        "domains": len(DOMAINS),
        "potential_candidate_urls": len(matches),
        "verified_existing": report["verified_existing_listings"],
        "new_backlinks": 0,
        "seconds": report["duration_seconds"],
        "top_sites": sorted([{"domain": x["domain"], "scanned": x["url_records_scanned"]} for x in rs],
                            key=lambda x: -x["scanned"])[:12],
    }, ensure_ascii=False), flush=True)
    print("KQ247_SUBMIT_AUDIT_SUMMARY=" + json.dumps({"domains":len(entry_audits),"candidate_urls":sum(len(x["candidates"]) for x in entry_audits),"form_pages":sum(1 for x in entry_audits for q in x["candidates"] if q.get("forms",0)>0),"no_post_requests":True},ensure_ascii=False),flush=True)
    print("REPORT_FILE=reports/kq247-bulk-sitemap-scan.json", flush=True)

if __name__ == "__main__":
    main()
