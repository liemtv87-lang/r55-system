#!/usr/bin/env python3
"""Read-only public Telegram SEO observability for two approved KQ247 groups.
Never generate fake clicks, messages, traffic, rankings or member growth.
"""
import html
import json
import re
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

HERE = Path(__file__).resolve().parent
TIMEOUT = 12

class Preview(HTMLParser):
    def __init__(self):
        super().__init__()
        self.title = ""
        self.description = ""
        self.og_title = ""
        self.og_description = ""
        self._title = False
        self._tag_stack = []
        self.text_parts = []

    def handle_starttag(self, tag, attrs):
        d = dict(attrs)
        if tag == "title":
            self._title = True
        if tag == "meta":
            if d.get("name", "").lower() == "description":
                self.description = d.get("content", "")
            if d.get("property", "").lower() == "og:title":
                self.og_title = d.get("content", "")
            if d.get("property", "").lower() == "og:description":
                self.og_description = d.get("content", "")
        if tag in ("script", "style"):
            self._tag_stack.append(tag)

    def handle_endtag(self, tag):
        if tag == "title":
            self._title = False
        if tag in ("script", "style") and self._tag_stack:
            self._tag_stack.pop()

    def handle_data(self, data):
        val = data.strip()
        if self._title:
            self.title += val
        if val and not self._tag_stack:
            self.text_parts.append(val)

def audit(target):
    result = {
        "name": target["name"], "url": target["url"],
        "keyword_themes": target["keyword_themes"],
        "http_status": None, "grade": "UNKNOWN",
        "members": None, "member_change": None,
        "search_impressions": None, "search_clicks": None,
        "issues": []
    }
    req = Request(target["url"], headers={
        "User-Agent": "Mozilla/5.0 (compatible; KQ247PublicTelegramLinkCheck/1.0)",
        "Accept": "text/html,application/xhtml+xml"
    })
    try:
        with urlopen(req, timeout=TIMEOUT) as response:
            result["http_status"] = response.getcode()
            final_url = response.geturl()
            page = response.read(120000).decode("utf-8", errors="replace")
            result["final_url"] = final_url
    except HTTPError as exc:
        result["http_status"] = exc.code
        result["grade"] = "WARN" if exc.code in (403, 429) else "FAIL"
        result["issues"].append("HTTP " + str(exc.code) + "; bot protection is possible")
        return result
    except (URLError, TimeoutError, OSError, ValueError) as exc:
        result["grade"] = "WARN"
        result["issues"].append(type(exc).__name__ + ": " + str(exc)[:150])
        return result
    p = Preview()
    p.feed(page)
    visible = " ".join(p.text_parts)
    visible = html.unescape(re.sub(r"\s+", " ", visible))
    result["page_title"] = p.og_title or p.title
    result["page_description"] = p.og_description or p.description
    result["visible_description"] = visible[:700]
    result["grade"] = "OK" if result["http_status"] == 200 else "WARN"
    if not re.search(r"(View in Telegram|Join Group|View Group)", visible, re.I):
        result["issues"].append("Cannot confirm public group join preview from page text")
    match = re.search(r"([\d.,\s\u00a0]+)\s+members?\b", visible, re.I)
    if match:
        raw = re.sub(r"[^0-9]", "", match.group(1))
        if raw:
            result["members"] = int(raw)
    if result["url"].endswith("xsbm999") and re.search(r"(5\s+ngày\s+(?:free|miễn phí)|free\s+5\s+ngày)", visible + " " + result["page_description"], re.I):
        result["issues"].append("Public Telegram group description still advertises Free 5 days; current policy is Free 10 days")
    if result["issues"] and result["grade"] == "OK":
        result["grade"] = "WARN"
    return result

def main():
    targets = json.loads((HERE / "targets.json").read_text(encoding="utf-8"))["targets"]
    assert len(targets) == 2, "SEO scope must be exactly two groups"
    assert [(t["kind"], t["url"]) for t in targets] == [
        ("telegram_group", "https://t.me/keochuyengia79"),
        ("telegram_group", "https://t.me/xsbm999")
    ], "Unauthorized SEO targets found"
    results = [audit(t) for t in targets]
    now = datetime.now(timezone.utc).isoformat()
    report = {
        "checked_at_utc": now,
        "objective_count": 2,
        "active_targets": [t["url"] for t in targets],
        "stopped": "All 14 affiliate links, sales bot and six auxiliary endpoints removed from SEO monitoring",
        "results": results,
        "disclaimer": "Group preview checks only. Not Google rankings, search clicks, referral clicks, or new members. No artificial traffic."
    }
    out = HERE / "out"
    out.mkdir(exist_ok=True)
    (out / "seo-hourly.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    lines = [
        "# KQ247 SEO • ONLY 2 Telegram Groups",
        "",
        "Checked UTC: " + now,
        "",
        "Only two promoted destinations: https://t.me/keochuyengia79 and https://t.me/xsbm999.",
        "14 affiliate links and sales bot are NOT monitored or advertised here.",
        "",
        "| Telegram group | HTTP | Status | Members now | Findings |",
        "|---|---:|---|---:|---|"
    ]
    for r in results:
        issue = "; ".join(r["issues"]) or "Public preview accessible"
        lines.append("| " + r["name"] + " | " + str(r["http_status"] or "N/A") +
                     " | " + r["grade"] + " | " + (str(r["members"]) if r["members"] is not None else "UNKNOWN") +
                     " | " + issue.replace("|", "/") + " |")
        lines.append("")
        lines.append("**" + r["name"] + "**: " + r["url"])
        lines.append("Title: " + r.get("page_title", "UNKNOWN"))
        lines.append("Description: " + r.get("page_description", "UNKNOWN"))
        lines.append("Target keyword families: " + ", ".join(r["keyword_themes"]))
    lines.extend(["", "## Real SEO impact",
        "- Google ranking/indexing: UNKNOWN without a verified Search Console property or a true Google SERP measurement.",
        "- Organic impressions/clicks and Telegram link clicks: UNKNOWN until instrumented or connected analytics.",
        "- New members: UNKNOWN without previous verified count over a defined date window.",
        "- This workflow only reads two public Telegram URLs; it does not purchase ads, post messages or manufacture engagement.",
        ""])
    md = "\n".join(lines)
    (out / "report.md").write_text(md, encoding="utf-8")
    print(md)
    assert len(results) == 2
if __name__ == "__main__":
    main()
