# KQ247 Research Handoff — R55 500 days; Vietlott all historical draws
_Last live verified: 2026-10-15 17:55 Vietnam time. This document is a durable handoff after mobile chat switches._

## Requested conditions and constraints
- Research **football 500 calendar days** using only authentic timestamped Bongdalu pre-match data (20 recent matches/team, historical AH and OU, opening/current bookmaker odds from as many sources as available, form home/away, rest, verified xG/xGA, teams, injuries as available). H2H is contextual only and **never required**. Each pre-match pick must be graded with real final score and Asian quarter-line settlement; require at least 70% genuine held-out wins and broad 80% eligible match coverage. No future leakage, no fabricated odds or placeholder xG.
- Vietlott backtest **all historical Mega 6/45 and Power 6/55 draws** with exactly **200,000 and 500,000 individual simulated combinations PER draw**; evaluate jackpot (Mega JP / Power JP1+JP2) and first prize monthly against user's 8 JP and 1,500 G1 goal. These are simulations, not purchased tickets or guarantees.
- Keep all 3 SEO timers, all 3 separate research timers, hourly local report, 4-hour user summary and all production football, lottery, Vietlott, bot containers unchanged. Never auto-promote a candidate based merely on manipulated retrospective evaluations.

## Verified Vietlott import
- Imported on VPS in run [38723542923](https://github.com/liemtv87-lang/r55-system/actions/runs/38723542923) (SUCCESS at ~10:55 UTC).
- Pinned upstream snapshot: `pqminh-4/vietlott-data` commit `2a7f03209fce39a6d1c9d045cd528dfd37437c4c`, originally sourced from official Vietlott draw records.
- Mega: **1575 of 1575**, from 2016-07-20 to 2026-10-14; all 156 local overlap draws agree.
- Power: **1410 of 1410**, from 2017-08-01 to 2026-10-13; 154/155 local overlap draws agree. **2026-09-17** (#01399) conflicted with the local historical archive, but independent dated public sources agreed with imported 06,11,25,27,37,45; bonus 15. The importer retains this externally corroborated record and reports the discrepancy; **the production archive was NOT edited**.
- Only writes isolated `/opt/kq247/research/state/vietlott-history/history-{mega645,power655}.json` and audit. The worker now backtests from **first-ever draw** as a cold-start uniform baseline for the first 35 draws, then uses only previously settled results for a reproducible baseline. No previous final result used in the selection. No 30/60/110 latest-draw limit.
- Live report on that run: 72 completed portfolio/draw evaluations, **1539 Mega and 1374 Power remaining**, 700k actual ticket comparisons on its small smoke cycle. Complete all-history backtest NOT yet finished. The 64-draw/10-min speed increase was committed at `181d5833`; verify this deployment and scheduled full-size cycles before claiming throughput.
- Monthly JP/G1 targets are **NOT verified**.

## Verified football 500-day feasibility
- `research-vps/football_history_merge.py` merges authentic R55 graded matches by date and prefers the ledger with more independently settled fixtures on duplicates.
- On VPS run [38723542923](https://github.com/liemtv87-lang/r55-system/actions/runs/38723542923), actual merged records contain exactly **2026-10-10 and 2026-10-11** with 442 non-push graded fixtures across these two dates.
- The genuine 500-calendar-day audit period as of 2026-10-15 is 2025-06-03 to 2026-10-15 inclusive. Thus **2 / 500 days covered, 498 missing**; verified prekickoff model feature rows (xG, AH/O-U historical, independently timestamped odds) = **0**, so research status `blocked_incomplete_500_day_backtest`.
- The 2 million bootstrap operations in the legacy research are **Monte Carlo repeated resampling**, NOT historical days, independently dated bets, or models. They must never be advertised as 500-day research.
- Need a legitimate historical data backfill for 498 missing days, with pre-cutoff odds/line and real scores, and complete parameter scope. Until then hold promotion blocked and honestly report missing data.
- No football production code, snapshots or containers touched.

## Timers and reporting
- Separate 10-min systemd timers: `kq247-research-football.timer`, `kq247-research-xs.timer`, `kq247-research-vietlott.timer`. Reports: `kq247-research-hourly.timer`, `kq247-research-fourhour.timer`.
- Dedicated SEO timers were resumed separately and must not be paused by any research deploy.
- All 3 research timers active and original production containers unchanged on successful [38723542923](https://github.com/liemtv87-lang/r55-system/actions/runs/38723542923).
- Full production deployment is **prohibited** until measured goals pass locked prospective, outside-sample months/days.

## Exact next steps
1. Verify successful deploy of 64 Vietlott portfolios/10-minute speed (commit `181d5833`), inspect real full-cycle wall time, source counts, remaining historical draws and memory.
2. Secure a **500-day** per-match genuine Bongdalu pre-match feature history and settled odds/AH/OU, preserving kickoff cutoffs; run walk-forward daily predictions. Exclude H2H as a mandatory feature; do not fill gaps with fabricated values.
3. Track each product's complete monthly simulated JP/G1 separately and show the exact draw count and original dataset checksum. Keep all historic draws even if there are holidays or gaps.
4. Never touch customer tool/snapshots, never stop SEO, report user-visible only each 4h unless user explicitly asks status.
