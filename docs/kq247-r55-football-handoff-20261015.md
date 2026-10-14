# KQ247 R55 — Football handoff / 2026-10-15 (Asia/Bangkok)
This is a factual progress ledger, not a complete verbatim transcript. Do not infer production cutover from staging tests.

## User's non-negotiable requirements
- Use Bongdalu only, with current validated hosts and actual quoted AH/O-U odds.
- Attempt history for **every** football match; inspect up to 20 previous matches per team (less if the original source genuinely has less), available H2H, historical AH/O-U and all available bookmaker quotes.
- **Zero head-to-head is not weak data by itself**; first-ever UEFA/WC meetings must be analyzable using recent individual team history and market odds.
- For fixtures with verifiable AH and OU, analyze and select at most one strongest market per match. Target analysis coverage >=80% without inventing data. Prioritize major competitions without excluding other priced fixtures from the denominator.
- Quality and calibrated historical performance matter independently from model-coverage rate: do not send research-only forecasts to Telegram as certified picks.
- Preserve existing production links, UI, locked snapshots, Telegram formatting; do not restart unrelated KQ247 containers as part of an audit. VPS is authoritative for actual deployed behavior.
- 13:00 VN scheduled full scan + immutable snapshot; 13:30 outcome reporting; bot pre-match delivery cadence stays as approved.

## GitHub and evidence
- Repository: liemtv87-lang/r55-system
- Research branch: r55-bongdalu-deep-history-20261015. This branch was 45 commits ahead of main at investigation time.
- Read-only diagnosis file: .github/workflows/r55-explain-unmodeled-fixtures-20261015.yml ; commit 3f1ca6737abaf59c877ebcb2fcc3b95722b02a75
- Branch safety suite [workflow run 38646199973](https://github.com/liemtv87-lang/r55-system/actions/runs/38646199973): 12 tests PASSED.
- Deployed optional-H2H and whole-feed audit [run 38646199992](https://github.com/liemtv87-lang/r55-system/actions/runs/38646199992): PASS on VPS; no production cutover implied.
- Example three-fixture read-only proof [run 38645622271](https://github.com/liemtv87-lang/r55-system/actions/runs/38645622271): PASS on VPS.
- Latest specific missing-forecast diagnostics [run 38646635928](https://github.com/liemtv87-lang/r55-system/actions/runs/38646635928): PASS, read-only.
- Earlier deployment staging proxy [run 38645912377](https://github.com/liemtv87-lang/r55-system/actions/runs/38645912377): PASS but customer/bot release NOT verified.

## 2026-10-15 VPS audit, around 05:14 VN
- 236 fixture records (236 unique), all 236 attempted history, 236 returned parsed histories.
- 203 fixtures have market, 172 future fixtures priced AH/O-U in window.
- 202 fixtures have at least 20 history matches for BOTH teams; 34 have less.
- 170 / 172 were modeled (98.84% modeled coverage).
- Nine met internal pre-release ensemble quality; 161 research-only (not certified).
- Market-company XML candidate identifiers: 18; verified quotes per fixture can be fewer, often 6, sometimes 2. The separate odds-comparison page returned HTTP 200 security challenge and was properly excluded; do **not** claim it contributed genuine data.
- Release gate remains stricter and requires walk-forward performance; do not equate 9 internally accepted to 9 fully published picks.

## Concrete H2H example the user demanded
Bongdalu fixture BDL_3073740: Lech Poznan vs Bayer Leverkusen, Europa League, 2026-10-15T16:45:00Z. Source read-only proof: table_v1=20 rows, table_v2=20 rows, table_v3=0 H2H rows; historical odds=221; usable odds AH home line +1, OU 3.25. It is **not thin just because H2H is zero**. Previously the system incorrectly used H2H as hard minimum; branch tests and staging VPS show H2H now optional.

## Two unmodeled future fixtures, exact audited evidence
1. BDL_3102824 Uttar Palli Milan Sangha vs Taltala ES, Calcutta Football League: parsed home history 0 / away 1; H2H 0; bookmaker count 2; makeMarket returned null. Must inspect real HTML and adapt parsing where possible, never synthesize stats.
2. BDL_3102993 Myanmar Universitet vs Elite Kings FC, Myanmar League 2: parsed home history 20 / away 0; H2H 0; bookmaker count 2; makeMarket returned null. Must inspect real HTML and adapt parsing where possible, never synthesize stats.

## Model-v4 choice / shadow reasons for 170
- 9 accepted internal quality flag.
- 67 competition_below_priority_floor.
- 40 bookmaker_count_under_3.
- 21 form_samples_under_15.
- 17 ensemble_edge_not_robust.
- 12 bookmaker_price_lean_conflict.
- 4 quality_guard_not_met.

## Outstanding fixes / next step
1. Validate actual h2h HTML layout for both missing fixtures; extract valid team form or record verifiable source absence separately from scraper errors.
2. Audit which of the 18 company-specific XML feeds return valid quotes (not just successful HTTP); improve genuine Bongdalu bookmaker coverage without fabricated quotes or bypassing security challenges.
3. Distinguish analyzed/shadow coverage (98.84%) from *validated picks released* (not yet >=80%). Avoid artificially relaxing quality thresholds.
4. Verify stage/prod release, scheduled 13:00 snapshot, Telegram and immutable link/UI only after data-source and release gate smoke tests. Preserve existing containers and customer snapshots.

This file is an operational handoff. Verbatim user/assistant chat history has **not** been recovered or committed here.
