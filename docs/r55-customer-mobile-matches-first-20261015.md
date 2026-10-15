# R55 Customer mobile matches first — 2026-10-15 07:08 VN

## User-reported issue
A phone screenshot at 07:02 VN showed the customer page status **"DỰ ĐOÁN TẠM TÍNH • CHỜ KHÓA 13H • 20 trận sắp diễn ra • cập nhật 06:58:46 15/10/2026"** but below it displayed 2026-10-14 daily statistics, causing the impression that no current match predictions had loaded. No proof of absent fixtures: the status explicitly reported 20 upcoming matches.

## Root cause verified in source
`deployment/football-original/public/client.html` laid out cards in this order: control buttons / search / summary -> daily stats -> method stats -> match result list. The main page already placed predictions before stats. Customer JavaScript `load()` populates `ALL`, renders `list` and writes 20-upcoming status; the list was below two lengthy statistics cards (requiring substantial phone scrolling).

## Applied and live verified
1. Reordered only customer HTML card markup: control/search/status -> **"📋 Dự đoán trận hôm nay"** / `#list` -> "📊 Thống kê hàng ngày" -> method stats -> promotion. Preserved all JS byte-for-byte (including license/device keys, link migration, existing buttons), CSS, other ID attributes and existing URLs.
2. GitHub research branch `liemtv87-lang/r55-system` source commit `adf5c7d872457f81a3909c39022095b43838b49e` uses `[skip ci]` specifically to **prevent broad Docker redeploy**.
3. Added specialized static-only live sync workflow `.github/workflows/r55-customer-static-sync-nodocker-20261015.yml`, commit `54f8f83d727040108af9db50c03819682901c983`. Trigger `tests/r55-customer-static-sync.trigger` commit `c52668719eb718d840e368f9fc71c9dfd6cfbd58`.
4. The workflow uploads ONLY `deployment/football-original/public/client.html` into existing VPS Caddy read-only static-source bind-mount `/opt/kq247/deployment/football-original/public/client.html`. No `docker` calls, no compose changes, no container restarts.
5. [Run 38658150130](https://github.com/liemtv87-lang/r55-system/actions/runs/38658150130) `SUCCESS`: source order proof passed, file upload passed, live public URL `https://64-120-92-172.sslip.io/client.html` fetched successfully and live DOM verified match card appears before stats. Existing license and activation-code key marker also verified.

## User-facing clarification
20 upcoming matches were loaded in the screenshot; their cards were hidden from initial mobile viewport by statistics above. Now matches render directly under the search/status and statistics follow below. Today's 13:00 VN official snapshot lock is still separate from provisional predictions. This patch does not establish a 65% win rate or complete historical AH/O-U coverage; those still require separate verification. Render legacy URL -> VPS migration unchanged. In case a device cached previous HTML, reopen or refresh old URL once.

## Remaining checks
Await any real customer-device screenshot if user reports no fixtures AFTER the reordering, and then inspect actual `#list` / JS errors / activation. Do not claim direct Android-device test. No unrelated KQ247 containers restarted.
