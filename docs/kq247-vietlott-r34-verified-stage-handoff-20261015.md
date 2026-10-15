# KQ247 Vietlott R34 — checked stage handoff, 15 Oct 2026 (VN)

## Verified facts (do not extrapolate to public production)

- User selected exactly 34 hard conditions, dropping only the former 35th overlapping-head-pairs gate. Keep rules 1–34, analysis with same-day MB+MT+MN after 20:00 VN, 20:05 and retry schedule. Do not mix old same-target snapshots or historical winning values into forecasts.
- Immutable isolated source build tested on VinaHost VPS 64.120.92.172: `liemtv87-lang/vietlott-auto-hoc` commit `319d54228db7186155b981f464fd0d4b06931c7c`, GitHub Actions `liemtv87-lang/r55-system` workflow `kq247-vietlott-r34-source-stage-and-snapshot.yml` run `38772485619` SUCCESS.
- All R34 stage source offline tests, GET health, customer/main HTML smoke, isolated nightly build and read-only release gate PASS. Same-day MB full 27 prizes confirmed by two independent sources; three-region source ready. Stage generated locked Mega target 2026-10-16 with full 381,916 tickets and reduced 180,000; Power target 2026-10-17 with full 915,150 and reduced 450,000. Both unique, subset of full list, within caps; release gate reports zero errors.
- VPS immutable snapshot archive `/opt/kq247/vietlott/snapshot-backups/r34-20261015-c88d7eaab00c519d` created and SHA256-check verified. Workflow `kq247-vietlott-r34-stage-snapshot-backup.yml` run `38773048937` SUCCESS. Backups are stage only.
- Running production container was verified unchanged by both jobs; **NO PUBLIC CUTOVER** and **NO VERIFIED CUSTOMER/BOT SYNC**. Do not claim the official website or all links currently show R34.
- Public cutover is gated by customer authentication being VPS-local (stage check `client_auth_served_only_by_vps=stage_deferred`). Preserve existing active client codes/device binds and URLs; do not replace live code, restart a live container, or overwrite a locked snapshot until this blocker is validated.
- Independent private-repo GitHub Actions offline CI attempt `38773452130` failed to get a runner: job has zero steps, runner_id 0; **not evidence of failed algorithm tests**. The isolated VinaHost stage run above DID pass the same offline contract and HTTP snapshot integrity checks.
- No credible actual 30-draw *reduced portfolio* backtest of R34 JP/G1 has been established here. Structural eligibility upper bounds must not be presented as actual wins.

## Continuation

1. Confirm latest private repo source and stage pin use the exact canonical ruleset `USER_34_HARD_RULES_REMOVE_ADJACENT_HEAD_PAIRS_2026_10_15_R1` and the same rules in both mobile pages, server, snapshot lock, backtest and TXT.
2. Complete VPS-local customer-code compatibility and complete public release gate (not the `--stage` bypass). Preserve old URLs and existing licenses; verify both official and guest customer mobile pages and TXT exports.
3. Only then promote R34 stage atomically to the public route, verify public `/health`, `/status`, locked R34 state for both products, no-duplicate/export counts, existing bot links, with immediate rollback available from previous production release if any test fails.
4. Re-run genuine historical walk-forward JP/G1 measurements using the same full rules and the actual 5-subset coverage reducer, not just full-universe eligibility.

Logs: https://github.com/liemtv87-lang/r55-system/actions/runs/38772485619 and https://github.com/liemtv87-lang/r55-system/actions/runs/38773048937 .
