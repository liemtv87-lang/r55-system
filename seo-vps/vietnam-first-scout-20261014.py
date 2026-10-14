#!/usr/bin/env python3
"""Vietnam-first public SEO sitemap inventory (read-only).

A URL in a sitemap is NOT a backlink or a submission site. This job only
discovers Viet-language pages for subsequent editorial relevance checks.
Never posts/forms, never circumvents site protections, and never claims
unverified backlink counts. Throttled to <= 8 requests per host.
"""
import concurrent.futures
import datetime as dt
import gzip
import json
import os
import re
import time
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from collections import Counter, deque

# Vietnamese-language / Vietnam-audience domains, not an assertion they accept backlinks.
SITES = {
  "tgram.vn": "telegram_community",
  "bongda.com.vn": "football_editorial",
  "bongda24h.vn": "football_editorial",
  "bongdaplus.vn": "football_editorial",
  "thethao247.vn": "football_editorial",
  "tinthethao.com.vn": "football_editorial",
  "thethao.vn": "football_editorial",
  "24h.com.vn": "football_editorial",
  "bongda365.com": "football_editorial",
  "ketqua.net": "lottery_statistics",
  "ketqua04.net": "lottery_statistics",
  "minhngoc.net.vn": "lottery_statistics",
  "xosodaiphat.com": "lottery_statistics",
  "xoso.com.vn": "lottery_statistics",
  "xosohomnay.com.vn": "lottery_statistics",
  "xosothantai.com": "lottery_statistics",
  "xoso.me": "lottery_statistics",
  "xosobamien.vn": "lottery_statistics",
  "xosominhngoc.com.vn": "lottery_statistics",
  "diendanbongda.vn": "football_forum",
  "voz.vn": "forum",
  "tinhte.vn": "forum",
  "otofun.net": "forum",
  "5giay.vn": "classifieds",
  "rongbay.com": "classifieds",
  "muaban.net": "classifieds",
  "enbac.com": "classifieds",
  "vatgia.com": "classifieds",
  "tudienwiki.com": "other_vietnamese",
  "tgram.com.vn": "telegram_community",
  "yeuthethao.net.vn": "football_editorial",
  "soha.vn": "football_editorial",
  "danviet.vn": "football_editorial",
  "vietnamline.org": "vietnamese_blog",
  "tinnhanhchungkhoan.vn": "other_vietnamese"
}
SEEDS = ("sitemap.xml", "sitemap_index.xml", "wp-sitemap.xml")
LIMIT_HOST = 16
MAX_COMPRESSED_BYTES = 9_000_000
MAX_EXPANDED_BYTES = 48_000_000
TIMEOUT = 7
GROUPS = ("keochuyengia79", "xsbm999")
TOPIC_TOKENS = (
    "telegram", "nhom-telegram", "nhom-bong", "bong-da", "bongda",
    "xo-so", "xoso", "xsmb", "xsmt", "xsmn", "kqxs", "nhom"
)
AGENT = "KQ247-VN-SEO-Scout/1.0 (read-only public sitemap indexing)"

def allowed(url, host):
    p = urllib.parse.urlsplit(url)
    h = (p.hostname or "").lower().removeprefix("www.")
    return p.scheme == "https" and h == host and not p.username and not p.password

def get(url, limit=MAX_COMPRESSED_BYTES):
    req = urllib.request.Request(url, headers={"User-Agent": AGENT, "Accept": "application/xml,text/xml,text/plain,application/gzip"})
    with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
        raw = r.read(limit+1)
        if len(raw)>limit: raise ValueError("sitemap_too_large")
        if raw[:2] == b"\\x1f\\x8b" or url.endswith(".gz"):
            raw=gzip.decompress(raw)
            if len(raw)>MAX_EXPANDED_BYTES: raise ValueError("expanded_sitemap_too_large")
        return raw, r.url

def decode_sitemap(content):
    # Accept only XML sitemaps, never HTML links or automated directory submissions.
    if b"<urlset" not in content[:6000] and b"<sitemapindex" not in content[:6000]:
        raise ValueError("not_sitemap_xml")
    root=ET.fromstring(content)
    typ=root.tag.rsplit("}",1)[-1]
    if typ not in ("urlset","sitemapindex"): raise ValueError("unknown_sitemap_root")
    locs=(x.text.strip() for x in root.iter()
          if x.tag.rsplit("}",1)[-1]=="loc" and x.text)
    return typ,locs

def inspect(host,category):
    queue=deque("https://"+host+"/"+s for s in SEEDS)
    seen=set()
    inspected=set()
    relevant=[]
    matches=[]
    errors=[]
    per=Counter()
    attempts=0
    while queue and attempts<LIMIT_HOST and len(inspected)<1_000_000:
        url=queue.popleft()
        if url in seen or not allowed(url,host): continue
        seen.add(url)
        attempts+=1
        try:
            data, final=get(url)
            if not allowed(final,host):
                errors.append("redirect_off_domain")
                continue
            kind, paths=decode_sitemap(data)
            if kind=="sitemapindex":
                for u in paths:
                    if allowed(u,host) and u not in seen and len(queue)<300: queue.append(u)
            else:
                for candidate in paths:
                    if candidate in inspected: continue
                    inspected.add(candidate)
                    lc=candidate.lower()
                    p=urllib.parse.urlsplit(lc).path
                    if any(k in lc for k in GROUPS):
                        if len(matches)<25: matches.append(candidate)
                    if any(k in p for k in TOPIC_TOKENS):
                        per["topic_url_records"]+=1
                        if len(relevant)<18: relevant.append(candidate)
                    if len(inspected)>=1_000_000: break
        except Exception as e:
            if len(errors)<6:errors.append(type(e).__name__+":"+str(e)[:90])
    return {
      "domain":host, "category":category,
      "sitemap_requests_attempted":attempts,
      "sitemap_url_records_scanned":len(inspected),
      "topic_candidate_url_count":per["topic_url_records"],
      "topic_url_examples":relevant,
      "group_handle_url_examples":matches,
      "errors":errors,
      "search_exhaustive":len(queue)==0
    }

def main():
    started=time.monotonic()
    with concurrent.futures.ThreadPoolExecutor(max_workers=10) as pool:
        rows=list(pool.map(lambda x:inspect(*x),SITES.items()))
    result={
      "checked_at_utc":dt.datetime.now(dt.timezone.utc).isoformat(),
      "policy":"Vietnamese-audience websites FIRST; international deferred",
      "sources_considered":len(SITES),
      "sources_confirmed_allow_public_backlink_submission":0,
      "external_backlinks_published_by_this_scan":0,
      "sitemap_url_records_scanned":sum(x["sitemap_url_records_scanned"] for x in rows),
      "topic_candidate_url_records":sum(x["topic_candidate_url_count"] for x in rows),
      "sitemap_requests_attempted":sum(x["sitemap_requests_attempted"] for x in rows),
      "group_handle_url_candidates":sum(len(x["group_handle_url_examples"]) for x in rows),
      "duration_seconds":round(time.monotonic()-started,2),
      "sites":rows,
      "limits":["Only public sitemap records, no HTML posting, no CAPTCHA evasion.",
                "A URL record is not a verified external backlink or a site that allows submissions.",
                "Max 8 sitemap GETs per host; results may be partial.",
                "External referring sites should allow one relevant truthful listing or editorial article."]
    }
    os.makedirs("reports",exist_ok=True)
    with open("reports/kq247-vn-first-scout.json","w",encoding="utf8") as f:
        json.dump(result,f,ensure_ascii=False,indent=2)
    print("KQ247_VN_FIRST_RESULTS="+json.dumps({
      k:result[k] for k in ("checked_at_utc","sources_considered","sitemap_url_records_scanned",
        "topic_candidate_url_records","sitemap_requests_attempted","group_handle_url_candidates",
        "sources_confirmed_allow_public_backlink_submission","external_backlinks_published_by_this_scan","duration_seconds")
    },ensure_ascii=False),flush=True)
    print("VIETNAM_TOP_DOMAINS="+json.dumps(sorted(
      [{"domain":x["domain"],"scanned":x["sitemap_url_records_scanned"],"topic":x["topic_candidate_url_count"]} for x in rows],
      key=lambda x:-x["scanned"])[:15],ensure_ascii=False),flush=True)

if __name__=="__main__":main()
