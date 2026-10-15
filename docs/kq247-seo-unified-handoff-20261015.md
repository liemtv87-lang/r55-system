# KQ247 SEO / Telegram groups — operational handoff, 15 Oct 2026 ~07:26 Vietnam time

## User request
User required SEO backlink source discovery every hour (not every six hours), automatic submissions to directories where permitted, accurate hourly counts, and consolidation of many separate SEO timers into one without stopping unrelated KQ247 bots or production containers. Focus exclusively on Telegram groups:
- Football https://t.me/keochuyengia79
- Lottery https://t.me/xsbm999

This is an operational progress checkpoint, **not** a complete verbatim reproduction of any conversation.

## Verified initial diagnosis
GitHub read-only workflow `kq247-seo-backlink-root-cause-20261015.yml`, run `38658564860` SUCCESS, queried VPS directly at 2026-10-15 00:11 UTC.
- Persistent discovery process was alive; opt-in browser submitter container `seo-kq247-opt-in-directory` was running; all 5 legacy systemd SEO timers were still active hourly. Thus claims that all SEO processes had stopped were false.
- Scanner was **idle with no pending new hosts**, logging 600-second sleeps, input inventory just 52 real lines, 51 discovered domains, 19 tentative form candidates, 0 million/billion URL scans demonstrated.
- Verified public backlinks 3 football + 3 lottery; no new in last measured hour. Submitter had 2 pending review, 0 independently verified new; other attempts no eligible form, CAPTCHA or unavailable.
- The previous GitHub audit JSON was stale; live VPS evidence took precedence.

## Repairs
1. Updated `scripts/kq247-backlink-background-discovery-20261014.py` to refresh public source indexes **every 3600 seconds**, reduced idle delay to 120 seconds, added extra Telegram directory sources and raised bounded HTML reader to 1 MiB. The worker still uses durable SQLite cursors, opt-in qualification and truthful source counts. Latest source commit `1fa28b5e71e3b2565cd77f065dcdb1759c7d4b93`.
2. Fixed worker PID detection/adoption (escaping and stale PID), and installed self-healing dedicated watcher. Last successful source-worker deployment/action: `38659363474`, SUCCESS, `KQ247_DISCOVERY_WATCHDOG_ACTIVE=YES`, production containers unchanged. Prior failed runs in this sequence were explicitly diagnosed and corrected.
3. Added `seo-vps/kq247-seo-unified.py`, current version `94f2bd8320f18ca311927ae0889f80ac93adeb1c` that reads real metrics, verifies the exact discovery process, can use existing `ensure-worker.sh` on failure, restores only dedicated opt-in poster when necessary, invokes 5 existing SEO services hourly, writes `seo-unified-status.json` and durable hourly JSON.
4. Installed ONE VPS SEO timer `kq247-seo-unified.timer` (5-minute health tick, hourly work) via `.github/workflows/kq247-seo-unified-install-20261015.yml`. GitHub run **38659847862 SUCCESS**, with real public Caddy JSON smoke, fresh hourly report, poster running, exact two groups, and no production container changes. It **disabled all six duplicate VPS SEO timers** after the successful unified run: `kq247-seo-groups.timer`, `kq247-seo-indexnow.timer`, `kq247-seo-backlinks.timer`, `kq247-organic-10k.timer`, `kq247-telegram-playwright.timer`, and `kq247-backlink-discovery-watchdog.timer`. Underlying isolated workers and history were preserved.
5. Removed duplicate GitHub hourly cron triggers from `seo-hourly-audit.yml` and `verify-telegram-backlinks.yml`, preserving manual checks and verified evidence, commits `3d62c4487eaf87bffa48d5672ac7159ff4e956f1` and `ca576b3020c285facefa96ca75aa453bf8cb162e`. The VPS unified timer is the hourly execution source.

## Live outcome at 2026-10-15 00:25 UTC
`KQ247_SEO_UNIFIED_INITIAL_PASS`: 53 actual hosts, 20 tentative candidate forms; opt-in submitter `running:true`; verified public links football=3, lottery=3, new in past hour=0. `KQ247_ALL_PRODUCTION_CONTAINERS_UNCHANGED=YES`; `KQ247_SEO_PUBLIC_REPORT_LIVE=PASS`.

Public status link: https://64-120-92-172.sslip.io/seo-unified-status.json
GitHub verified run: https://github.com/liemtv87-lang/r55-system/actions/runs/38659847862

## Important caveats and next checks
- **Do NOT claim millions or billions of URLs scanned**, 100 published backlinks/hour or 100% organic reach. Only count actually scanned hosts and independently verified published public listings.
- The automatic submitter will use only free, explicitly opt-in Telegram directory forms and will not bypass CAPTCHA/registration restrictions, ignore rate limits, spam unrelated forums or repeat uncertain POSTs.
- The legacy source-discovery GitHub installer still contains its own watchdog installation step. A *future modification to its watched source paths* may re-enable the old watchdog timer unless the workflow is adjusted or a later unified installer reconsolidates it. An attempted update to this legacy installer was blocked by an action safety checker, so **do not claim this future-reenable problem is fixed**.
- Hourly reports now exist as stored VPS JSON but were not configured to proactively DM a user; no Telegram test post was sent.
- Check for fresh sources after the next hourly refresh; improve genuine source coverage before promising scale.
