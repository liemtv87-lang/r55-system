#!/usr/bin/env python3
"""Network-free regression checks for the public KQ247 SEO monitor."""
import unittest
from unittest.mock import patch

from audit import audit


class FakeResponse:
    def __init__(self, page):
        self.page = page.encode("utf-8")
        self.headers = {"Content-Type": "text/html; charset=utf-8"}

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False

    def getcode(self):
        return 200

    def geturl(self):
        return "https://64-120-92-172.sslip.io/cong-dong-telegram-kq247.html"

    def read(self, limit):
        return self.page[:limit]


def sample(links):
    return (
        "<html><head><title>KQ247 community</title>"
        '<meta name="description" content="Public Telegram groups">'
        '<link rel="canonical" href="https://64-120-92-172.sslip.io/cong-dong-telegram-kq247.html">'
        "</head><body><h1>KQ247</h1>" +
        "".join('<a href="' + link + '">Visit</a>' for link in links) +
        "</body></html>"
    )


class CommunityLinkTests(unittest.TestCase):
    target = {
        "name": "KQ247 Telegram community hub",
        "kind": "html",
        "url": "https://64-120-92-172.sslip.io/cong-dong-telegram-kq247.html",
        "required_links": [
            "https://t.me/keochuyengia79",
            "https://t.me/xsbm999",
            "https://t.me/tooldudoan999",
        ],
    }

    def test_all_three_telegram_links_present(self):
        with patch("audit.urlopen", return_value=FakeResponse(sample(self.target["required_links"]))):
            result = audit(self.target)
        self.assertEqual(result["grade"], "OK")
        self.assertFalse(result["issues"])

    def test_missing_telegram_link_is_a_warning(self):
        with patch("audit.urlopen", return_value=FakeResponse(sample(self.target["required_links"][:2]))):
            result = audit(self.target)
        self.assertEqual(result["grade"], "WARN")
        self.assertTrue(any("tooldudoan999" in issue for issue in result["issues"]))

    def test_query_tracking_on_real_link_does_not_mask_cta(self):
        links = [link + "?utm_source=seo" for link in self.target["required_links"]]
        with patch("audit.urlopen", return_value=FakeResponse(sample(links))):
            result = audit(self.target)
        self.assertEqual(result["grade"], "OK")


if __name__ == "__main__":
    unittest.main()
