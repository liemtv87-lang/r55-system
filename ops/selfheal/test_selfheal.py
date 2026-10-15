"""Offline safety regression tests; never invoke systemctl or Docker on CI."""
import datetime as dt
import unittest
from unittest.mock import patch
import kq247_selfheal as sh


class SelfhealSafetyTests(unittest.TestCase):
    def test_scope_isolation(self):
        cases = {
            "kq247-research-vietlott.timer": "research",
            "kq247-research-football-fetch.timer": "research",
            "kq247-google-web-discovery.timer": "seo-web",
            "kq247-telegram-playwright.timer": "seo-telegram",
            "kq247-xsmb-1930-staging.timer": "xs",
            "kq247-seo-unified.timer": "seo-web",
            "kq247-sales-sync.timer": "sales",
            "kq247-vietlott-update.timer": "vietlott",
            "kq247-r55-group-bot.timer": "bots",
            "kq247-lottery-bot.timer": "bots",
        }
        for name, expected in cases.items():
            self.assertEqual(sh.classify_timer(name), expected, name)

    def test_only_current_both_product_snapshots_count_ready(self):
        good = {"ready": True, "products": {
            "mega645": {"snapshot": {"locked": True, "analysis_date": "2026-10-15"}},
            "power655": {"snapshot": {"locked": True, "analysis_date": "2026-10-15"}},
        }}
        self.assertTrue(sh.verify_vietlott_snapshot(good, "2026-10-15"))
        self.assertFalse(sh.verify_vietlott_snapshot(good, "2026-10-16"))
        self.assertFalse(sh.verify_vietlott_snapshot({"ready": True, "products": {"mega645": good["products"]["mega645"]}}, "2026-10-15"))
        good["products"]["power655"]["snapshot"]["locked"] = False
        self.assertFalse(sh.verify_vietlott_snapshot(good, "2026-10-15"))

    def test_old_vietlott_engine_must_not_be_retried(self):
        probe = {
            "/health": (200, {"status": "failed", "runtime": "R40_VPS_USER33_FULL30_60_150_20261013"}),
            "/api/state": (503, {"ready": False}),
            "/status": (200, {"status": "failed"})
        }
        with patch.object(sh, "read_local", side_effect=lambda _port, path: probe[path]), patch.object(sh, "try_action") as repair:
            events=sh.repair_vietlott({}, dry_run=False)
        self.assertTrue(any(x.get("status")=="requires_verified_version_upgrade" for x in events))
        repair.assert_not_called()

    def test_r35_healthy_never_retried(self):
        state = {"ready": True, "products": {name: {"snapshot": {
            "locked": True, "analysis_date": "2026-10-15"}} for name in ("mega645", "power655")}}
        def fake(_port,path):
            if path=="/health": return 200,{"runtime":"R41_VPS_USER35_FULL27_LOCAL_SHARDS_20261015","status":"idle"}
            if path=="/api/state": return 200,state
            if path=="/status": return 200,{"status":"idle"}
            if path.startswith("/api/filter-context?product="): return 200,{"ruleset_version":sh.VIETLOTT_EXPECTED_RULESET}
            raise AssertionError(path)
        fixed=dt.datetime(2026,10,15,13,40,tzinfo=dt.timezone.utc)
        with patch.object(sh, "read_local",side_effect=fake), patch.object(sh,"now_utc",return_value=fixed),patch.object(sh,"try_action") as repair:
            events=sh.repair_vietlott({},dry_run=False)
        self.assertTrue(any(x.get("snapshot_ready") is True for x in events))
        repair.assert_not_called()

    def test_r35_stale_and_active_job_is_not_retried(self):
        state = {"ready": True, "products": {name: {"snapshot": {"locked": True, "analysis_date": "2026-10-14"}} for name in ("mega645","power655")}}
        def fake(_port,path):
            return {"/health":(200,{"runtime":"R41_VPS_USER35_TEST","status":"running"}),"/api/state":(200,state),"/status":(200,{"status":"running"})}[path]
        fixed=dt.datetime(2026,10,15,13,40,tzinfo=dt.timezone.utc)
        with patch.object(sh, "read_local",side_effect=fake),patch.object(sh,"now_utc",return_value=fixed),patch.object(sh,"try_action") as repair:
            sh.repair_vietlott({},dry_run=False)
        repair.assert_not_called()


if __name__=="__main__":
    unittest.main()
