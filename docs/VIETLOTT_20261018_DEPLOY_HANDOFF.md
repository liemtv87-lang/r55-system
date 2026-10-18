# KQ247 Vietlott deployment handoff — 2026-10-18 12:13 VN

## Verified live state, not assumptions
- Existing production VPS `64.120.92.172`; container `kq247-vietlott-vps` kept in place without restart/replacement.
- Verified 18 Oct 12:10 VN in GitHub Actions run 39099648672: local `/health` and `/api/state` both ready/ok; `/` HTTP 200; `/client.html` HTTP 200; local `/guest-snapshot.html` HTTP 404, though publicly via Caddy `/guest-snapshot.html` HTTP 200. Other public `/health`, `/api/state`, `/client.html` HTTP 200.
- Mega `analysis_date=2026-10-17`, `target_date=2026-10-18`, `locked=true`.
- Power `analysis_date=2026-10-17`, `target_date=2026-10-20`, `locked=true`.
- Both current snapshots are **USER_33_HARD_RULES_PAIR_TOUCH_2026_10_13_R1**, NOT R34. Original 2026-10-17 MB full27 independently verified before catch-up, present in source archive.
- Public URL unchanged: https://vietlott.64-120-92-172.sslip.io/ ; customer: https://vietlott.64-120-92-172.sslip.io/client.html .

## Repairs actually deployed today
- New VPS-only systemd scheduler via `deployment/vietlott/kq247-nightly-retry-20261018.py` and `install-verified-nightly-20261018.sh`. GitHub Action installer 39099537863 SUCCESS and hardened redeploy 39099733595 SUCCESS.
- Units `kq247-vietlott-verified-nightly.service` / `.timer` installed and enabled/active. Expected next run `2026-10-18 13:05 UTC` = **20:05 VN**, additional slots 20:15/20:25. Max 3 attempts/day.
- Script uses local `/status` and **live `/api/state`** to skip if both current-day snapshots are already locked. Does not trust a possibly wrong host `public/state.json` path. Tracks attempts in root-only local `/opt/kq247/vietlott/ops/nightly-attempts.json`; admin token only read locally, never printed. Schedules existing `POST /run/daily` without restarting containers. Runtime source verifier still requires at least two independent 27-prize XSMB sources for any same-day fallback.
- Final installer job explicitly logged `VIETLOTT_VERIFIED_DAILY_TIMER_ACTIVE=YES` and `VIETLOTT_EXISTING_PRODUCTION_CONTAINER_PRESERVED=YES`; confirmed next run `Sun 2026-10-18 13:05 UTC`. No claim of a completed future 20:05 invocation yet (the time has not occurred).

## Outstanding work; do not misstate as complete
1. Current live R33 must be upgraded to **R34 true 34-condition FULL pool** only after exact source, snapshot, public main/customer/bot, TXT, license/device parity and reversible release gate. R34 offline 48/48 shard backtest was verified in private repo, but public promotion remains incomplete. Do not overwrite the current-day locked R33 snapshots.
2. Current customer auth flows may still depend on Neon; existing login/code/device preservation cannot be assumed migrated. Do not delete source authorization infrastructure or force a new login until comparable VPS store is independently checked.
3. Historical backtest in running R33 image logged `Cannot restore pre-draw snapshot ... git log` because deployed directory lacks Git metadata. Current snapshot generation succeeded; historic 150-draw R34 backtest does not thereby become live.
4. Verify actual systemd service journal and new locked snapshot results after 20:05 VN; confirm independent same-day XSMB+XSMT+XSMN source integrity according to R34 when released.
5. Guest public route is 200 via Caddy but localhost 18088 route is 404; verify content/API parity, not just HTTP status.

## Evidence
- https://github.com/liemtv87-lang/r55-system/actions/runs/39090974147
- https://github.com/liemtv87-lang/r55-system/actions/runs/39099537863
- https://github.com/liemtv87-lang/r55-system/actions/runs/39099648672
- https://github.com/liemtv87-lang/r55-system/actions/runs/39099733595

Preserve existing URLs, license/device codes, 4-day lock policy, other KQ247 service containers, and immutable historical snapshots.
