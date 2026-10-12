# KQ247 Vietlott — verified VPS checkpoint (2026-10-13, Vietnam time)

## VPS account resources
- Hosting product: VinaHost Cloud VPS Sing Linux 3, host 60813.vpsvinahost.vn, IP 64.120.92.172.
- Provider-public specification: 6 vCPU, RAM 16 GB, NVMe 200 GB, transfer quota 30 TB per month and 100 Mbps. Source: https://vinahost.vn/cloud-vps-singapore/
- Exact consumption against the current provider billing-cycle quota has **not** been read from the authenticated VinaHost customer panel.
- A host-local 2-hour monitoring script was installed at /opt/kq247/ops/resource-monitor/check.sh and scheduled in crontab; initial measurement used about 3% disk and 8.3% RAM, with fresh traffic counters starting only from installation, not retroactive to billing date.
- No paid upgrades authorized.

## Vietlott production
- Public: https://vietlott.64-120-92-172.sslip.io/
- Docker: kq247-vietlott-vps.
- R39_VPS_USER32_20261013_BACKTEST_24_SHARDS deployed and independently verified with production /health. Source server change in liemtv87-lang/vietlott-auto-hoc, commit 722ad564e8d7d34bf9778aa29e5f1af4a11221f5.
- GitHub Actions VPS patch succeeded run 38311686826; rollback backup kept at /opt/kq247/vietlott/versions/snapdeploy-before-r39-20261012T213644Z.mjs.
- Backtest 24 shards each for two products = 48 shards; run completed exit_code=0 at 2026-10-12T21:46:07Z; aggregate file generated at 21:46:07Z, 48 shards verified.
- All 48 shard JSON files (13 MB) copied from Docker volatile /app/backtest-out/ to VPS persistent /opt/kq247/vietlott/backtest-cache; GitHub Actions run 38313123458 succeeded. Restore from this folder if container replaced. Currently that copy is one-time; future periodic backup not yet verified.
- Remote Supabase shard persistence returns HTTP 402 exceeded egress quota; local VPS files are primary and this should not trigger paid upgrade.
- Daily snapshot catch-up run started from POST /run/daily and completed exit_code=0 at 2026-10-12T21:53:27Z; snapshots both locked, using regional draw results for 2026-10-12.
- Mega 6/45: target 2026-10-14; after 32 rules 636,869 eligible combos; intended final reduction target 200,000; /api/filter-context showed reduction_target 200000, locked true.
- Power 6/55: target 2026-10-13; after 32 rules 3,193,108 eligible combos; selected final reduction_total 600,000; locked true.
- Need confirm Mega actual reduced-pool JSON has exactly 200k unique keys and final exports work on mobile; complete-file QA not independently verified.
- One non-fatal log warned 'Cannot restore pre-draw snapshot power655 ... spawnSync git ENOENT'. Investigate to avoid misleading grading if it recurs.

## Real walk-forward backtest statistics (NOT promises)
- Calendar 30-day window from last recorded draw dates (not necessarily the current live 30-day billing period):
  - Mega 6/45: 13 tested draws from 2026-09-05 through 2026-10-04, 42 first prizes, 0 jackpots.
  - Power 6/55: 13 tested draws from 2026-09-04 through 2026-10-03, 26 first prizes, 0 jackpots.
  - Combined 26 draws: 68 first prizes and zero jackpots.
- Across 60 **draws per product** (NOT 60 calendar days):
  - Mega: 214 first prizes, 1 Jackpot.
  - Power: 169 first prizes, 4 Jackpot 2.
- User's optimization target: at least 5 JP and 2,000 G1 in a 30-day window, combined for Mega 200k and Power 600k; not achieved in real backtests, and cannot be guaranteed.
- Next priority: independently validate exact 200,000/600,000 unique exported tickets, and verify UI TXT exports, then work on methodology evaluated by strictly prior-data walk-forward. Do not introduce outcome lookahead.

## Sales bot status
- VPS remains only live Telegram poller; deployment and checkout smoke test succeeded.
- Render Free handles PayOS confirmation and checkout using one-time Neon tickets. No payment was made in smoke testing.
- A paid transaction to license issuance and user notification is not fully verified with real money; do not claim full paid conversion proven.
- Monthly plan prices for lottery/football/vietlott in Neon are 1,500,000 VND.
