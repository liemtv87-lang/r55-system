#!/usr/bin/env python3
"""Network-free regression tests for KQ247 backlink evidence reporting."""
import unittest
from unittest.mock import Mock
from urllib.error import HTTPError
from verify_backlinks import inspect_page, normalize_url, read_registry, report
from pathlib import Path
from tempfile import TemporaryDirectory


class FakeResponse:
    headers = {'Content-Type': 'text/html; charset=utf-8', 'X-Robots-Tag': ''}

    def __init__(self, html):
        self.html = html.encode()

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False

    def getcode(self):
        return 200

    def geturl(self):
        return 'https://directory.example/profile'

    def read(self, size):
        return self.html[:size]


def entry(status='verified_public', target='https://t.me/xsbm999'):
    return {'directory': 'example', 'submission_url': 'https://directory.example/submit',
            'target_url': target, 'status': status,
            'evidence_url': 'https://directory.example/profile', 'link_rel': ''}


class BacklinkTests(unittest.TestCase):
    def test_only_real_anchor_counts(self):
        opener = lambda *_args, **_kwargs: FakeResponse('<a href="https://t.me/xsbm999?utm_source=test" rel="nofollow ugc">Group</a>')
        r = inspect_page(entry(), opener)
        self.assertTrue(r['confirmed_link'])
        self.assertEqual(r['rel'], 'nofollow ugc')

    def test_plain_text_mention_is_not_backlink(self):
        opener = lambda *_args, **_kwargs: FakeResponse('<p>@xsbm999 is on Telegram</p>')
        r = inspect_page(entry('mention_only'), opener)
        self.assertFalse(r['confirmed_link'])
        self.assertEqual(r['result'], 'mention_without_href')

    def test_wrong_destination_is_not_counted(self):
        opener = lambda *_args, **_kwargs: FakeResponse('<a href="https://t.me/another">Group</a>')
        self.assertFalse(inspect_page(entry(), opener)['confirmed_link'])

    def test_not_submitted_skips_network(self):
        opener = Mock(side_effect=AssertionError('must not fetch signup form'))
        self.assertEqual(inspect_page(entry('not_submitted'), opener)['result'], 'not_checked')
        opener.assert_not_called()

    def test_http_failure_is_inconclusive(self):
        def fail(req, timeout):
            raise HTTPError('https://directory.example/profile', 403, 'Forbidden', {}, None)
        r = inspect_page(entry(), fail)
        self.assertEqual(r['result'], 'unverified_http_error')
        self.assertFalse(r['confirmed_link'])

    def test_relative_href_works(self):
        opener = lambda *_args, **_kwargs: FakeResponse('<a href="/profile?utm_source=t">Nope</a>')
        r = inspect_page(entry(target='https://directory.example/profile'), opener)
        self.assertTrue(r['confirmed_link'])

    def test_normalize_ignores_fragment_not_host(self):
        self.assertEqual(normalize_url('https://t.me/xsbm999#about'), 't.me/xsbm999')
        self.assertNotEqual(normalize_url('https://fake.t.me/xsbm999'), 't.me/xsbm999')

    def test_report_counts_only_observed_links(self):
        fake = lambda r: {**{'directory': r['directory'], 'recorded_status': r['status'],
                              'confirmed_link': r['status']=='verified_public',
                              'result': 'test', 'rel':''}}
        d = report([entry(),entry('not_submitted')], checker=fake)
        self.assertEqual(d['public_hrefs_observed_this_run'], 1)
        self.assertEqual(d['not_submitted'], 1)

    def test_registry_rejects_duplicate(self):
        with TemporaryDirectory() as temp:
            f=Path(temp)/'items.csv'
            f.write_text('directory,submission_url,target_url,status,evidence_url,link_rel\n' +
                         'A,https://example.com,https://t.me/xsbm999,not_submitted,,\n'*2)
            with self.assertRaises(ValueError):
                read_registry(f)


if __name__ == '__main__':
    unittest.main()
