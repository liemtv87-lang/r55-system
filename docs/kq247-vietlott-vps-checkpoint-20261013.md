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


## Update (13 Oct 2026 VN) — exact draw-count statistics deployed with zero downtime
- Production Vietlott remains R39 runner with daily snapshots unchanged. R40 reporting was safely installed by updating the running container's `scripts/merge-backtest-60.mjs` only (no restart), rebuilding aggregate stats, and adding static `public/draw-windows.json` and `public/draw-windows.html`. Workflow `kq247-vietlott-r40-no-restart.yml` run 38315733572: SUCCESS.
- User-facing URL: https://vietlott.64-120-92-172.sslip.io/draw-windows.html . Root page navigation link to new stats is present.
- Public verification: https://vietlott.64-120-92-172.sslip.io/draw-windows.json ; generated `2026-10-12T22:17:11.232Z`, source `verified_walk_forward_24_shards`.
- Verified windows PER PRODUCT, separate 30/60/150/1500 draws (NOT days):
  - Mega 6/45 reduced 200,000: 30 draws 0 JP / 80 G1; 60 draws 1 JP / 214 G1; 150 draws 2 JP / 798 G1; 1500 requested but only 152 eligible verified, reporting 2 JP / 800 G1 for the 152 only (INCOMPLETE).
  - Power 6/55 reduced 600,000: 30 draws 0 JP / 52 G1; 60 draws 4 JP2 / 169 G1; 150 draws 3 JP1 plus 23 JP2 / 1,068 G1; 1500 requested but only 151 eligible verified, reporting 26 JP / 1,068 G1 for the 151 only (INCOMPLETE).
  - Combined per-product 30-draw windows: ZERO JP, 132 G1, so goal 5 JP and 2,000 G1 not met. Power JP1 and JP2 must not be conflated in displays.
- IMPORTANT: At fixed number of distinct lottery tickets with fair equiprobable draws, expected exact-five G1 wins PER DRAW are Mega 200,000*(6*39)/8,145,060 ≈5.746; Power 600,000*(6*48)/28,989,675 ≈5.961. Over 30 draws EACH, combined expectation ≈351.2 G1, independent of which ticket numbers are selected. 2,000 G1/30 draws each is therefore far above expectation; no genuine optimization guarantees it. These are mathematical expectations, not predicted results.
- In progress: GitHub Actions `kq247-vietlott-rule-ablation.yml` run 38315939129 evaluates original 32 rules against relaxed variants on 30 historical draws and a holdout segment, without modifying live snapshots. Follow its result before promoting any rule changes.
- Do NOT disable or modify old official (locked) Mega/Power pools just to improve historic score; only promote changes demonstrated on strictly held-out draws with unchanged 200k/600k counts.


## Additional study — 32-rule ablation vs historic eligible winning tickets
- GitHub Actions workflow `kq247-vietlott-rule-ablation.yml`, run 38315939129: SUCCESS. Tested 30 historical drawings per product, with a separated last 11-draw holdout; zero missing same-day regional records. No production snapshot changed.
- Mega 6/45: baseline historical jackpot-eligible combinations 3 and G1-eligible combinations 591; relaxing sum and 2/3-head requirements gives 6 JP, 998 G1; wider candidate relaxation gives 6 JP and 1,267 G1.
- Power 6/55: baseline 3 JP1 + 12 JP2, 904 G1; soft sum/head yields 3 JP1 + 21 JP2, 1,464 G1; wider relaxation yields 4 JP1 + 35 JP2 and 2,064 G1.
- **These are eligibility counts in the full expanded rule-filtered universe**, NOT historical prizes in the final exact 200k/600k portfolios. No method has demonstrated 5 JP and 2000 G1 in the actual reduced portfolios. Do not promote by those upper bounds alone.
- An important parity check is under way (`kq247-vietlott-reducer-parity.yml`, run 38316312836): current VPS daily final pools use `reduceCoveragePool` (five-subset coverage) whereas historical `scanPoolOutcome` reduces by highest score; do not present the latter as exact replay of live final reducer until tested and aligned. In the future standardize the reduction algorithm for genuine walk-forward historical grading.
- Progress note: original parity run hit missing `reduce-coverage.mjs` within the VPS container; rerun now stages original reducer into research namespace, without altering official pools.


## Critical scoring correctness finding — 2026-10-13
- Verified by running the **actual production reduceCoveragePool()** on historic snapshots (same 200,000 Mega and 600,000 Power combination budgets). Completed GitHub Actions run 38316462822:
  - Mega 2026-08-07: production-selector replay **1 Jackpot and 73 G1**; former score-only backtest gave **0 Jackpot and 30 G1**.
  - Power 2026-09-05: production-selector replay **15 G1**; score-only backtest gave **23 G1**.
- Therefore the 30/60/150/1500 summary published by existing score-only backtest is **PROVISIONAL, NOT accurate historical grading of the actual deployed selector**.
- Corrected user-facing static statistics JSON and HTML warning without restarting the live service, via workflow `kq247-vietlott-backtest-correction.yml`, successful run 38316659975.
  - URL: https://vietlott.64-120-92-172.sslip.io/draw-windows.html
  - JSON now carries `source:historical_score_only_reducer_NOT_PRODUCTION`, `provisional:true`, `matches_production_reducer:false`.
  - Running backtest merger patched to preserve caution on future automatic regeneration.
- Developed an exact 30-draw resumable walk-forward research module `scripts/vietlott-exact-coverage-backtest-30.mjs` in repo r55-system, commit af2e11f4d895320799907b8ac829a9f6693a80ba. It reproduces the production 5-subset coverage reducer, produces checkpoints in `/app/data/coverage-r40-walkforward-30`, and excludes all winning numbers from model fitting. **This new 30-draw replay has NOT RUN or been verified**: the attempted secure launch workflow was blocked by tool safety validation. Do not claim any 30-draw real-portfolio performance beyond isolated 2-draw checks.
- Future priority: deploy/run the exact coverage-reducer backtest safely using authorized operator tooling, verify 30 then 60/150/1500 where data allow. Historical release sources only contain around 152 verified draws (Mega) and 151 (Power) in one-year shards; do not fabricate 1500-draw reports. Expand historic sources safely if available and within free VPS quota.
- User KPI remains 5 JP (keep JP1/JP2 separately) and 2,000 G1 in 30 draws, with Mega pool 200k and Power pool 600k. At fair-draw independent uniform probabilities, expected exact G1 ≈351 across 30 draws EACH of both products (5.746 Mega and 5.961 Power per draw), regardless of portfolio selection, so 2,000 G1 is a stretch outcome and **cannot be guaranteed** or claimed achieved by overfitting.
- Preserve live snapshots and customer access. Do not promote relaxed hard rules by full-pool prize eligibility upper bounds alone; evaluate fixed pool sizes on true holdout rounds first.


## Final portfolio caps — explicit user correction, 2026-10-13
- Treat **220,000 tickets for Mega 6/45 and 650,000 for Power 6/55 as ABSOLUTE PUBLIC STATISTICS LIMITS**, not default portfolio sizes. Exact daily snapshot targets remain **200,000 Mega / 600,000 Power** and must remain unique.
- Production no-restart policy deployment `kq247-vietlott-hard-limits.yml` run **38318057410** succeeded. It copied `pool-policy.mjs`, patched `update-data.mjs` to fail closed if eligible tickets are fewer than target or reduced tickets are duplicate/outside quota, and rebuilt reporting with `merge-backtest-60.mjs`.
- VPS verification: `CAP_STATS_mega645_30/60/150/1500_SAFE=200000`, `CAP_STATS_power655_30/60/150/1500_SAFE=600000`; locked snapshots remain 200k/600k; service health passed without restarting. Report JSON includes policy metadata and **removes full_jackpot/full_g1 prize counts from multi-million-entry rule-filtered candidate pools**.
- Public https://vietlott.64-120-92-172.sslip.io/draw-windows.json verified showing targets 200000/600000, hard_max 220000/650000, without full jackpot metrics; mobile HTML shows cap limits and refuses to display invalid or over-cap pools.
- Reporting remains **provisional** until exact live coverage selector replaces score-only historic totals. All previous 30/60/150 and partial 1500 statistics are labelled provisional.
- Real full 30-draw replay `kq247-vietlott-exact-replay.yml` **run 38318265165** started; uses the exact deployed five-number coverage reducer and same 200k/600k fixed budgets, enforces caps, checkpoints each historical draw on the existing VPS, does not touch customer snapshots. **Result not yet verified; consult workflow status/logs and saved summary before claiming success.**
- Additional assistant-origin method prepared for research only, `scripts/vietlott-balanced-coverage-research.mjs`: deterministic pre-draw salted uniform candidate sampling plus five-subset novelty, with exact 200k/600k and max 220k/650k. Not deployed and not established superior; compare with exact coverage baseline on held-out draws before any promotion.


## Hard caps now applied to the main mobile dashboard
- Final portfolio rule source committed to Vietlott repo: `scripts/pool-policy.mjs`, `scripts/update-data.mjs`, `scripts/merge-backtest-60.mjs`, `public/index.html`.
- VPS `kq247-vietlott-hard-limits.yml` run **38318057410**: SUCCESS. All four 30/60/150/1500 windows validated with exactly Mega 200,000 and Power 600,000; public caps 220,000/650,000; no unbounded candidate-universe prize totals.
- Production home dashboard patched in-place via `kq247-vietlott-main-stats-caps.yml` run **38319245239**: SUCCESS. Existing customer page links preserved, inline JS syntax checked, no container restart, snapshot state SHA256 unchanged. Shows only reduced final portfolio statistics, R17 compatible, and labels historical scores provisional.
- Full exact 30-draw replay `kq247-vietlott-exact-replay.yml` run **38318265165**: still running at last check; read-only `kq247-vietlott-exact-progress.yml` run **38318839948** showed Mega 30/30 cached with zero errors, Power 8/30 cached, VPS RAM 1.14 GiB/8 GiB, CPU around one core, site health OK.
- Research modules (NOT production): `scripts/vietlott-balanced-coverage-research.mjs`, `scripts/vietlott-balanced-holdout.mjs`, `scripts/vietlott-softsum-head-fixedpool.mjs` in r55-system. Alternative method uniformly samples candidate tickets deterministically from a product/date seed and greedily maximizes distinct five-number subset coverage while always returning exactly 200k/600k. Soft-rule study separately tests increasing Mega/Power sum ceilings from 160/200 to 185/235 and lowering two head-count minima. Both are unproven and must be compared on held-out draws at fixed budgets before promotion.
- Follow-on workflow `kq247-vietlott-balanced-holdout.yml` is configured to run only after successful completion of exact replay, comparing three recent historical draws per product without writing live snapshots. It must not be claimed successful before logs are verified.

## Checkpoint 2026-10-13 14:22 Vietnam — R33 current primary QA and nightly monitor

Read-only two-job GitHub Actions audit `38361750806`: **SUCCESS**; no customer code, snapshot, or pool mutation:
- Production primary HTTPS `https://vietlott.64-120-92-172.sslip.io/`, runtime `R40_VPS_USER33_FULL30_60_150_20261013`, `data_ready=true`, `/status` previous bootstrap success.
- Rule version `USER_33_HARD_RULES_PAIR_TOUCH_2026_10_13_R1`. Mega full 930,732, reduced 180,000, target 2026-10-14; Power full 5,096,034, reduced 450,000, target 2026-10-13; analysis day both 2026-10-12 (valid before 19h VN). Snapshots locked.
- FULL33-only historical tests all complete at 30/60/150 draws per product; no `reduced_stats` and no prizes attributed to the 180k/450k reduced portfolios. **Mega FULL** 30: 3 JP / 838 G1, 60: 7 JP / 1570 G1, 150: 18 JP / 4220 G1. **Power FULL** 30: 24 combined JP1/JP2 / 1329 G1, 60: 67 combined JP / 2784 G1, 150: 179 combined JP / 8513 G1; split JP1 vs JP2 in any customer-facing explanation if needed. These full-universe results cannot be applied to reduced portfolios.
- Both full33 and reduced TXT streaming endpoints for both products verified HTTP 200, exact `x-ticket-count`, five bold tickets per line and TXT filename. Client HTML contains latest-link, legacy fingerprint and Vietlott customer code handling.
- Host container `kq247-vietlott-vps` running, 0 restarts, not OOM, 81.65 MiB resident (7 GiB cap); `/status` last startup-bootstrap-repair completed with exit_code 0. Health current.
- Live `/api/automation-status` confirms internal 19:00, 19:10, 19:20 VN scheduler; external crontab entry is not required. Do not trigger 19h generation early.

Read-only contract monitor committed as `.github/workflows/kq247-vietlott-nightly-33-contract.yml`: runs every night around 20:45 and 22:45 VN (GitHub schedule 13:45/15:45 UTC), tests fresh snapshot, correct 33-rule identity, 180k/450k caps, FULL-only 30/60/150 statistics and customer route. First run `38362254533` completed **SUCCESS** at 14:22 VN, before 19h expected analysis 2026-10-12. This is a monitoring gate, not a compute job; failures appear in GitHub Actions. Automated 19h generation success for **tonight** has not yet been observed and must not be asserted.

Next: verify tonight's post-19h lock and new backtest completion; avoid re-running daily generation from manual check or updating customer tokens. A proposed direct live-host rule-parity check was blocked by tool safety validation; no direct production engine-parity execution was made in this checkpoint. Source staging `scripts/engine.mjs` visually uses Power 5 / Mega 4 parity caps in readable, diagnostic and optimized filters, but do not conflate this source review with a live parity run.
