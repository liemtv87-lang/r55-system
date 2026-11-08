#!/usr/bin/env python3
"""KQ247 public backlink evidence check: read-only, bounded, no form submissions.

A recorded verified_public status is historical evidence, NOT proof a link still
exists. This checker counts only matching live public hrefs during this run.
"""
import csv
import json
import re
from collections import Counter
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urljoin, urlsplit
from urllib.request import Request, urlopen

HERE = Path(__file__).resolve().parent
VALID_STATES = {'not_submitted', 'submitted', 'pending_review',
                'mention_only', 'verified_public', 'rejected'}
CHECK_STATES = {'mention_only', 'verified_public'}
MAX_BYTES = 1024 * 1024
TIMEOUT = 8


def normalize_url(url):
    """Compare exact destination host/path, ignoring fragments and query tracking."""
    p = urlsplit(url.strip())
    if p.scheme.lower() not in ('http', 'https') or not p.hostname:
        return None
    host = p.hostname.lower().removeprefix('www.')
    port = f':{p.port}' if p.port not in (None, 80, 443) else ''
    return host + port + (p.path.rstrip('/') or '/')


class LinkParser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.links = []
        self.noindex = False
        self.text_chunks = []

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag == 'a' and a.get('href'):
            self.links.append((a['href'], a.get('rel') or ''))
        elif tag == 'meta' and (a.get('name') or '').lower() in ('robots', 'googlebot'):
            self.noindex |= 'noindex' in (a.get('content') or '').lower()

    def handle_data(self, value):
        self.text_chunks.append(value)


def inspect_page(row, opener=urlopen):
    result = {'directory': row['directory'], 'source': row['submission_url'],
              'target': row['target_url'], 'recorded_status': row['status'],
              'result': 'not_checked', 'confirmed_link': False,
              'http_status': None, 'rel': '', 'noindex': None}
    if row['status'] not in CHECK_STATES:
        return result
    source = row['evidence_url'].strip() or row['submission_url'].strip()
    result['source'] = source
    p = urlsplit(source)
    if p.scheme != 'https' or not p.hostname:
        result['result'] = 'invalid_evidence_url'
        return result
    try:
        req = Request(source, headers={'User-Agent': 'KQ247-SEO-Evidence-Checker/1.0',
                                        'Accept': 'text/html'})
        with opener(req, timeout=TIMEOUT) as response:
            result['http_status'] = response.getcode()
            final_url = response.geturl()
            x_robots = response.headers.get('X-Robots-Tag', '')
            content_type = response.headers.get('Content-Type', '')
            body = response.read(MAX_BYTES + 1)
    except HTTPError as error:
        result.update(http_status=error.code, result='unverified_http_error')
        return result
    except (URLError, OSError, TimeoutError, ValueError) as error:
        result['result'] = 'unverified_network_error'
        result['error_type'] = type(error).__name__
        return result
    if result['http_status'] != 200 or 'html' not in content_type.lower():
        result['result'] = 'unverified_non_html_or_status'
        return result
    if len(body) > MAX_BYTES:
        result['result'] = 'unverified_page_too_large'
        return result
    parser = LinkParser()
    parser.feed(body.decode('utf-8', 'replace'))
    result['noindex'] = parser.noindex or 'noindex' in x_robots.lower()
    target = normalize_url(row['target_url'])
    for href, rel in parser.links:
        if normalize_url(urljoin(final_url, href)) == target:
            result['confirmed_link'] = True
            result['result'] = 'observed_public_href'
            result['rel'] = ' '.join(rel).lower() if isinstance(rel, list) else str(rel).lower()
            return result
    # A text mention is not a hyperlink/backlink.
    token = urlsplit(row['target_url']).path.strip('/').lower()
    visible = ' '.join(parser.text_chunks).lower()
    result['result'] = ('mention_without_href' if token and re.search(r'\b' + re.escape(token) + r'\b', visible)
                        else 'target_href_not_found')
    return result


def read_registry(path):
    with path.open(encoding='utf-8-sig', newline='') as file:
        rows = list(csv.DictReader(file))
    required = {'directory', 'submission_url', 'target_url', 'status', 'evidence_url', 'link_rel'}
    if not rows or any(not required.issubset(row) for row in rows):
        raise ValueError('Registry columns missing')
    seen = set()
    for row in rows:
        if row['status'] not in VALID_STATES:
            raise ValueError('Unknown status: ' + str(row['status']))
        key = (row['directory'].lower().strip(), row['target_url'].lower().strip(),
               row['submission_url'].lower().strip())
        if key in seen:
            raise ValueError('Duplicate directory-target-submission row: ' + str(key))
        seen.add(key)
    return rows


def report(rows, checker=inspect_page):
    # Only recorded public evidence and mentions are crawled; no directory signup forms.
    checked = [None] * len(rows)
    with ThreadPoolExecutor(max_workers=3) as pool:
        futures = {pool.submit(checker, row): i for i, row in enumerate(rows)}
        for future in as_completed(futures):
            checked[futures[future]] = future.result()
    statuses = Counter(row['status'] for row in rows)
    observed = sum(bool(r['confirmed_link']) for r in checked)
    return {'checked_at_utc': datetime.now(timezone.utc).isoformat(),
            'historical_registry_counts': dict(statuses),
            'public_hrefs_observed_this_run': observed,
            'not_submitted': statuses['not_submitted'],
            'notes': ['An HTTP 200 or a mention is not a backlink.',
                      'Observed href is not proof Google indexed or ranked the target.',
                      'Failures to fetch are inconclusive, not proof of removal.',
                      'This job never submits forms or modifies a third-party website.'],
            'results': checked}


def main():
    rows = read_registry(HERE / 'backlink-submissions.csv')
    data = report(rows)
    output = HERE / 'out'
    output.mkdir(exist_ok=True)
    (output / 'backlinks-evidence.json').write_text(
        json.dumps(data, ensure_ascii=False, indent=2), encoding='utf-8')
    lines = [
        '# KQ247 verified backlink evidence', '',
        'Checked UTC: ' + data['checked_at_utc'], '',
        f"Observed matching public hrefs **this run: {data['public_hrefs_observed_this_run']}**",
        f"Unsubmitted directory-target pairs: **{data['not_submitted']}**", '',
        '| Directory | Recorded | Live result | Exact href | rel |',
        '|---|---|---|---|---|'
    ]
    for r in data['results']:
        lines.append('| ' + ' | '.join((r['directory'], r['recorded_status'],
                       r['result'], 'YES' if r['confirmed_link'] else 'NO',
                       r['rel'] or '—')) + ' |')
    lines += ['', 'Only observed exact public hrefs are counted; the job does not submit forms.', '']
    (output / 'backlinks-evidence.md').write_text('\n'.join(lines), encoding='utf-8')
    print('\n'.join(lines))


if __name__ == '__main__':
    main()
