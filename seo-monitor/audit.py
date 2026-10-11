#!/usr/bin/env python3
"""KQ247 independent hourly technical SEO audit. No Supabase requests or secrets."""
import json
import re
import os
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

TARGETS = [
    ("kq247_home", "https://www.kq247.com/", "html"),
    ("kq247_robots", "https://www.kq247.com/robots.txt", "robots"),
    ("kq247_sitemap", "https://www.kq247.com/sitemap.xml", "sitemap"),
    ("football_client", "https://kq247-football-live.onrender.com/client.html", "html"),
    ("lottery_client", "https://kq247-xoso-khach-v29.onrender.com/", "html"),
    ("vietlott_client", "https://snapdeploy-vietlott-bridge-df5xvz.v2.appdeploy.ai/client.html", "html"),
]
MAX_BYTES = 160000
TIMEOUT = 12

class PageHead(HTMLParser):
    def __init__(self):
        super().__init__()
        self.in_title = False
        self.title = ""
        self.description = ""
        self.canonical = ""
        self.robots = ""
        self.h1_count = 0

    def handle_starttag(self, tag, attrs):
        d = dict(attrs)
        if tag == "title":
            self.in_title = True
        if tag == "h1":
            self.h1_count += 1
        if tag == "meta":
            name = (d.get("name") or "").lower()
            if name == "description":
                self.description = d.get("content") or ""
            if name == "robots":
                self.robots = d.get("content") or ""
        if tag == "link" and "canonical" in (d.get("rel") or "").lower():
            self.canonical = d.get("href") or ""

    def handle_endtag(self, tag):
        if tag == "title":
            self.in_title = False

    def handle_data(self, data):
        if self.in_title:
            self.title += data

def audit(name, url, kind):
    row = {"name": name, "url": url, "kind": kind, "status": None, "final_url": "", "content_type": "", "issues": []}
    req = Request(url, headers={"User-Agent": "KQ247-SEO-Audit/1.0 (+https://github.com/liemtv87-lang/r55-system)", "Accept": "text/html,application/xml,text/plain;q=0.9,*/*;q=0.5"})
    body = b""
    try:
        with urlopen(req, timeout=TIMEOUT) as resp:
            row["status"] = resp.getcode()
            row["final_url"] = resp.geturl()
            row["content_type"] = resp.headers.get("Content-Type", "")
            body = resp.read(MAX_BYTES)
    except HTTPError as e:
        row["status"] = e.code
        row["final_url"] = e.geturl()
        row["content_type"] = e.headers.get("Content-Type", "")
        row["issues"].append("HTTP " + str(e.code))
    except (URLError, TimeoutError, OSError) as e:
        row["issues"].append("Connection failed: " + str(e)[:140])
    if row["status"] != 200:
        if not row["issues"]:
            row["issues"].append("Unexpected HTTP status")
        return row
    text = body.decode("utf-8", errors="replace")
    ctype = row["content_type"].lower()
    if kind == "html":
        if "text/html" not in ctype:
            row["issues"].append("Expected text/html")
        page = PageHead()
        try:
            page.feed(text)
            row["title"] = page.title.strip()[:160]
            row["description"] = page.description[:220]
            row["canonical"] = page.canonical[:300]
            row["h1_count"] = page.h1_count
            if not page.title.strip():
                row["issues"].append("Missing HTML title")
            if not page.description.strip():
                row["issues"].append("Missing meta description")
            if "noindex" in page.robots.lower():
                row["issues"].append("Meta robots noindex")
            if not page.canonical:
                row["issues"].append("Canonical not declared (advisory)")
            if page.h1_count == 0:
                row["issues"].append("Missing H1 (advisory)")
        except Exception as e:
            row["issues"].append("HTML parsing: " + type(e).__name__)
    elif kind == "robots":
        if "html" in ctype:
            row["issues"].append("robots.txt is HTML")
        if not re.search(r"(?mi)^\s*user-agent\s*:", text):
            row["issues"].append("robots.txt has no User-agent")
    elif kind == "sitemap":
        if "html" in ctype or not re.search(r"<(?:\w+:)?(?:urlset|sitemapindex)\b", text):
            row["issues"].append("Sitemap is not XML sitemap/index")
    return row

def main():
    rows = [audit(*target) for target in TARGETS]
    now = datetime.now(timezone.utc).isoformat()
    report = {"checked_at_utc": now, "runner": "GitHub Actions", "migration_scope": "technical audits; not Supabase SEO hosting", "targets": rows}
    out = Path("seo-monitor/out")
    out.mkdir(parents=True, exist_ok=True)
    (out / "seo-hourly.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    lines = ["# KQ247 SEO hourly technical audit", "", "Checked (UTC): " + now, "",
             "Independent of the blocked Supabase SEO gateway. Public-only GET checks; no bulk scanning, spam, synthetic traffic or IndexNow submissions.", "",
             "| Target | HTTP | Issues |", "|---|---:|---|"]
    for x in rows:
        issues = "; ".join(x["issues"]) or "none"
        lines.append("| " + x["name"] + " | " + str(x["status"] or "N/A") + " | " + issues.replace("|", "/").replace("\n", " ") + " |")
    lines += ["", "**Scope:** This audits 6 public KQ247 endpoints, NOT the full migrated SEO application. The 14 registry URLs and Google Search Console reports remain in the separate ChatGPT SEO hourly task.", "",
              "**Avoid duplicate hosting:** No DNS/canonical/sitemap rewrites and no secrets stored in the repository.",
              ""]
    (out / "report.md").write_text("\n".join(lines), encoding="utf-8")
    print("\n".join(lines))

if __name__ == "__main__":
    main()
