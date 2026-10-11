#!/usr/bin/env python3
"""KQ247: bounded read-only SEO/link audit of exactly 17 user-defined destinations.
External URLs are NOT sites the operator can optimize or control.
No Supabase dependency, authentication, IndexNow submissions, or synthetic traffic.
"""
import json
import re
import time
from urllib.parse import parse_qs, urlsplit
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

HERE = Path(__file__).parent
TIMEOUT = 9
MAX_WORKERS = 7
RETRY_DELAY = 0.45
TRACKING_KEYS = ('f', 'id', 'uid', 'uagt', 'invite_type', 'path')
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

def changed_tracking_params(original_url, final_url):
    """Flag changed query strings without claiming a lost conversion."""
    before = parse_qs(urlsplit(original_url).query, keep_blank_values=True)
    after = parse_qs(urlsplit(final_url or original_url).query, keep_blank_values=True)
    return [key for key in TRACKING_KEYS
            if key in before and before[key] != after.get(key)]


def audit(target):
    kind, name, url = target["kind"], target["name"], target["url"]
    result = {"name":name,"kind":kind,"url":url,"http_status":None,"final_url":None,
              "content_type":"","grade":"UNKNOWN","issues":[]}
    req = Request(url, headers={
        "User-Agent":"KQ247-SEO-Health-Monitor/1.1",
        "Accept":"text/html,application/xml,text/plain;q=0.8,*/*;q=0.5",
    })
    body = b""
    for attempt in range(2):
        try:
            with urlopen(req, timeout=TIMEOUT) as resp:
                result["http_status"] = resp.getcode()
                result["final_url"] = resp.geturl()
                result["content_type"] = resp.headers.get("Content-Type","")
                body = resp.read(96000 if kind in ("html","sitemap") else 24000)
            if attempt:
                result["note"] = "Recovered after one bounded network retry"
            break
        except HTTPError as ex:
            result["http_status"] = ex.code
            result["final_url"] = ex.geturl()
            result["content_type"] = ex.headers.get("Content-Type","")
            break  # Do not retry HTTP 403/429.
        except (URLError, TimeoutError, OSError, ValueError) as ex:
            if attempt == 0:
                time.sleep(RETRY_DELAY)
                continue
            result["issues"].append(
                "Connection problem after 2 attempts: " +
                type(ex).__name__ + " (" + str(getattr(ex, "reason", ex))[:110] + ")"
            )
            result["grade"] = "FAIL"
            return result
    status = result["http_status"]
    if status == 403 or status == 429:
        result["grade"] = "WARN"
        result["issues"].append("Access denied/rate limit to automated check; human accessibility unknown")
        return result
    if status is None or status >= 500 or status >= 400:
        result["grade"] = "FAIL"
        result["issues"].append("HTTP " + str(status))
        return result
    if status != 200:
        result["grade"] = "WARN"
        result["issues"].append("Unexpected HTTP " + str(status))
        return result
    result["grade"] = "OK"
    if kind in ("affiliate","telegram_group","telegram_bot"):
        # Public HTML availability does not prove ownership, rankings,
        # affiliate attribution, Telegram member counts, or bot functionality.
        if kind == "affiliate" and result["final_url"] != url:
            changed = changed_tracking_params(url, result["final_url"])
            if changed:
                result["grade"] = "WARN"
                result["issues"].append(
                    "Redirect changed query parameters (" + ",".join(changed) +
                    "); HTTP cannot confirm affiliate attribution"
                )
            else:
                result["note"] = "Redirected; affiliate attribution not independently verified"
        if kind.startswith("telegram"):
            result["note"] = "Public t.me page only; no member-growth or bot-message verification"
        return result

    text = body.decode("utf-8",errors="replace")
    ctype = result["content_type"].lower()
    if kind == "html":
        if "text/html" not in ctype:
            result["issues"].append("Expected HTML, got " + ctype[:80])
        parser = PageHead()
        try:
            parser.feed(text)
            result["title"] = parser.title.strip()[:160]
            result["description"] = parser.description[:220]
            result["canonical"] = parser.canonical[:300]
            result["h1_count"] = parser.h1_count
            if not parser.title.strip():
                result["issues"].append("Missing title")
            if not parser.description.strip():
                result["issues"].append("Missing meta description")
            if not parser.canonical:
                result["issues"].append("Missing canonical (advisory)")
            if parser.h1_count == 0:
                result["issues"].append("Missing H1 (advisory)")
            if "noindex" in parser.robots.lower():
                result["issues"].append("Noindex present; confirm intended customer privacy")
        except Exception as e:
            result["issues"].append("HTML parsing error: " + type(e).__name__)
    if kind == "robots":
        if "html" in ctype or not re.search(r"(?mi)^\s*user-agent\s*:",text):
            result["issues"].append("robots.txt is not a normal robots file")
    if kind == "sitemap":
        if ("html" in ctype or not
                re.search(r"<(?:\w+:)?(?:urlset|sitemapindex)\b", text)):
            result["issues"].append("Sitemap not recognized as XML sitemap")
    if result["issues"]:
        result["grade"] = "WARN"
    return result

def table_row(r):
    issues = "; ".join(r.get("issues",[])) or "none"
    note = (" / " + r["note"]) if r.get("note") else ""
    return "| " + r["name"].replace("|","/") + " | " + str(r["http_status"] or "N/A") + " | " + r["grade"] + " | " + (issues + note).replace("|","/").replace("\n"," ") + " |"

def main():
    data = json.loads((HERE/"targets.json").read_text(encoding="utf-8"))
    objectives = data["targets"]
    assert len(objectives)==17
    assert [t["slot"] for t in objectives]==list(range(1,18))
    assert sum(t["kind"]=="affiliate" for t in objectives)==14
    targets = objectives
    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as pool:
        futures = {pool.submit(audit,t):i for i,t in enumerate(targets)}
        results = [None]*len(targets)
        for future in as_completed(futures):
            results[futures[future]] = future.result()
    when = datetime.now(timezone.utc).isoformat()
    out = HERE/"out"
    out.mkdir(parents=True,exist_ok=True)
    grades = {x:sum(t["grade"]==x for t in results[:17]) for x in ("OK","WARN","FAIL")}
    report = {
        "checked_at_utc":when,
        "objective_count":17,"affiliate_count":14,"telegram_group_count":2,"sales_bot_count":1,
        "objective_grades":grades,
        "priority_telegram_groups":[r for r in results if r["kind"]=="telegram_group"],
        "alerts":[{"name":x["name"],"grade":x["grade"],"issues":x["issues"]}
                  for x in results if x["grade"] != "OK"],
        "objective_results":results,
        "disclaimer":"HTTP health only; not search ranking, impressions, link ownership, click conversion or member growth. 403 can be bot protection.",
    }
    (out/"seo-hourly.json").write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding="utf-8")
    lines = [
        "# KQ247 SEO • 17 objectives, hourly public checks",
        "",
        "Checked (UTC): **"+when+"**",
        "",
        "**Phạm vi DUY NHẤT: 14 link đích + 2 nhóm Telegram + 1 bot bán hàng. Không có website KQ247, robots hoặc sitemap ngoài yêu cầu.**",
        "17 mục: OK "+str(grades["OK"])+", WARN "+str(grades["WARN"])+", FAIL "+str(grades["FAIL"])+".",
        "",
        "## Ưu tiên quảng bá: 2 nhóm Telegram",
        "",
        "- **Nhóm bóng đá KQ247**: https://t.me/keochuyengia79 — chia sẻ lịch trận, kết quả và phân tích kèo tham khảo.",
        "- **Nhóm xổ số KQ247**: https://t.me/xsbm999 — thông tin kết quả xổ số và dự đoán tham khảo ba miền.",
        "",
        "Mục tiêu: tăng thành viên thực và lượt hiển thị thực; báo cáo kiểm tra link KHÔNG phải số tăng trưởng.",
        "",
        "## 17 objective URLs",
        "",
        "| Item | HTTP | Grade | Findings |","|---|---:|---|---|",
    ]
    lines += [table_row(x) for x in results]
    lines += ["", "## Actionable warnings (read-only)", ""]
    for item in report["alerts"]:
        lines.append("- **"+item["grade"]+" — "+item["name"]+"**: "+
                     ("; ".join(item["issues"]) or "No issue details"))
    if not report["alerts"]:
        lines.append("- None detected in this check.")
    lines += ["",
        "## Measurement limitations",
        "",
        "- Availability is NOT Google indexing, ranking, impressions or clicks. Query GSC separately.",
        "- External links are NOT user-owned domains unless independently verified; we cannot edit their onsite SEO.",
        "- Public Telegram previews do not confirm messages, membership counts or new members.",
        "- 403 and 429 may be anti-bot protection; never describe them as confirmed outages.",
        "- Retry only transient network failures once; never retry rate-limited requests.",
        "- Changed tracking parameters on redirects are verification alerts, NOT proof of lost conversions.",
        "- Zero login, zero fake visits/clicks, zero IndexNow, zero Supabase requests, and zero change to public destinations.",
        ""]
    text = "\n".join(lines)
    (out/"report.md").write_text(text,encoding="utf-8")
    print(text)

if __name__=="__main__":
    main()
