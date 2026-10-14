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

## 2026-10-15 about 05:45 VN — Continuation after ChatGPT chat rollover
- User reiterated: analyze every available AH/O-U fixture on Bongdalu; collect the actual previous 20 matches/team where published, historical AH/O-U and real bookmaker quotes; H2H is optional contextual evidence, NEVER mandatory or a reason to call a fixture weak.
- Verified branch head initially ce769daa8cb186df1ec0224ed246b97619b3516d, with successful VPS read-only team JSON probe run 38648796219. Official team-profile static JSON for IDs 80597 and 80877 had zero season rows, while the team's own JavaScript points to an independent `/ajax/getteamschedulebypageno?id=...&pageNo=...&sclassId=...&init=...` team-fixture route. This is a discovered route, not proof it contains finished results for either team.
- Found a real implementation defect: incomplete-history fallback in `bongdaluR55.js` referred to undeclared `recoverOfficialBongdaluTeamForm` and `formSummary`, while `h2h_home/away` ID regular expressions had double-escaped whitespace and digit classes. This could silently prevent recovery while still passing `node --check`.
- Added `deployment/football-native/lib/r55TeamSchedule.js` (commit 37ebd8cf): only completed rows with verified team/match identities, genuine scores, and a parseable timestamp **before fixture kickoff** are allowed. No synthesized histories, bookmakers, AH/O-U quotes or future results. Zero H2H is not a blocker.
- Corrected R55 history parser, added bounded official-domain AJAX fetch and preserved matching historical odds by match ID; passed each fixture's true kickoff timestamp into native chunk processing, full-feed audit, and model probe. Commits: 879415b60, 55499dcd, 9d9be24c, e99375dce. Parallel edits on the same branch later reconciled overlapping declarations (12f3b110).
- Added independent unit coverage for unfinished fixtures, wrong team IDs, missing scores, duplicates and post-cutoff results; fixed collision with pre-existing fallback test import. Final unit test commit c04339a683ecd5748fff4e7dddfdf93af09d8e8d; Actions verification run 38649723017 SUCCESS.
- Staging deploy run 38649723046 was PENDING as of this checkpoint; **do not claim VPS staging or production has the latest code until run completion and direct read-only smoke proves it**. No intentional published snapshot/Telegram/customer-link/UI changes.
- Separate existing `r55TeamScheduleFallback.js` from a concurrent recovery edit also exists; it is not the parser invoked by current `bongdaluR55.js`. Avoid duplicate data paths and future-leaking un-timestamped fallback scores.
- NEXT: verify latest staging deploy completed without container regressions; check official schedule AJAX response for 80597 and 80877 without guessing fields; rerun 172-future-market whole-feed audited coverage to see whether BDL_3102824 and BDL_3102993 have more verified form and can now be modeled; inspect provider quotes and release gate independently. Preserve existing links and immutable snapshots.
- This checkpoint is a chronological progress ledger, **not** a verbatim reproduction of all prior chat messages.

## Two explicit fixture exclusions, 05:50 VN on 2026-10-15
- User requested the two low-tier fixtures being investigated be dropped, not that all Myanmar/Calcutta matches be excluded. Exactly BDL_3102824 (Calcutta Football League) and BDL_3102993 (Myanmar League 2) are excluded from new R55 predictions.
- New pure module `deployment/football-native/lib/r55FixtureExclusions.js` (commit cc76e2a) filters ONLY these IDs. Its use was added in the native predictor, chunked snapshot pool and audit/model-eligible future set; other games and other leagues remain permitted.
- Unit test includes positive and negative examples. Last code commit `7354acd1326eaa16790b9172dadea4ff4e69aa18`, GitHub Actions test run `38650274754` SUCCESS.
- VPS staging deployment workflow `38650274734` was pending at checkpoint, because preceding deployment `38650268670` was still running. Do not claim production or customer/bot output updated until verified.
- DO NOT treat prior 171-fixture preview or locked historical snapshot as if retroactively filtered; recompute/read from actual deployed pipeline as appropriate, preserving immutable prior snapshots.
