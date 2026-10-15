# KQ247 VPS selfheal — handoff 15/10/2026, Asia/Ho_Chi_Minh

## Current user instruction (supersedes earlier priority)
Run **all KQ247 tools, bots and background jobs only on VPS VinaHost 64.120.92.172**, with automatic bounded fault detection, isolated repair and verification. Do not stop/restart/recreate **running** production containers; do not overwrite unverified locked lottery/Vietlott snapshots or invalidate old client codes/URLs. Keep a durable transcript/progress handoff to prevent chat switches from losing work. Absolute zero incidents is impossible; preserve correctness and detect/report what cannot be safely repaired.

## Installed and verified 15/10
* Repo `liemtv87-lang/r55-system`, `ops/selfheal/kq247_selfheal.py`.
* Installer workflow `.github/workflows/kq247-selfheal-all-vps-install-20261015.yml`, run **38753515497 SUCCESS** (first on-VPS installation); repeat **38753869471 SUCCESS** and **38754157501 SUCCESS**.
* Verified `KQ247_SELFHEAL_VPS_INSTALL=COMPLETE`, `KQ247_SELFHEAL_TIMER_COUNT=9`, `KQ247_PRODUCTION_RUNNING_CONTAINER_IDS_UNCHANGED=YES` from actual SSH VPS job logs.
* 9 dedicated enabled and active systemd timers: `kq247-selfheal-{football,xs,vietlott,bots,sales,seo-web,seo-telegram,research,ops}.timer`; typical 10-minute cadence and jitter. Dedicated per-scope flock locks, JSON reports and append-only JSONL under `/opt/kq247/ops/selfheal/state`.
* Selfheal scope registry of known production containers; start only explicitly known stopped containers with bounds (never stop/restart running), attempt start only previously enabled inactive timers. Generic failed jobs with side effects (bot sends, snapshots, SEO posts) **not automatically requeued**; research-safe tasks may be requeued. Each successful timer/container start has a post-action health/status check.
* Record unknown named KQ247 containers and disabled timers in read-only inventory without enabling or starting. Warn on Docker unhealthy + low disk/memory. Additional self-monitor timers must be excluded from their own worklists (follow-up commit `36da0df22a4c6c973039bb8a394609df52eb5406`).
* Six offline tests for grouping, disabled/unknown inventory and Vietlott R35 rollback gate PASS in workflow run **38754157544**. A prior test-run failed due to a test fixture escaped-newline bug and was fixed in `33302ac775b54315d5ba54540ffe6cef74ba3ff5`. Latest code post exclusion of selfheal timers awaits a new CI/deployment outcome before making final version claim.

## Critically unresolved; never claim fully healthy
* VPS public Vietlott `https://vietlott.64-120-92-172.sslip.io` at 21:32 VN returned `/health=200` but workload `status=failed`, runtime `R40_VPS_USER33_FULL30_60_150_20261013`, `/api/state=503` `r33_snapshot_not_ready`; customer `/guest-snapshot.html=404`. Real R35 code in private repo `liemtv87-lang/vietlott-auto-hoc` has **not been deployed**. R35 adds head-pair filter requirement (1 to 3 active of {0/1,1/2,2/3,3/4}), snapshot ruleset `USER_35_HARD_RULES_ADJACENT_HEAD_PAIRS_2026_10_15_R1`; caps 180k Mega, 450k Power.
* Guarded selfheal recognizes old runtime and reports `requires_verified_version_upgrade` without re-triggering old job or modifying old snapshots. VPS dry-run from successful installer confirmed this behavior.
* Other workflows may still have service-specific defects. Nine active timers do NOT prove every service delivers correct data or that all disabled/unknown services are safely autorecoverable. Need individual live health, data freshness, bot delivery and endpoint tests. Without external redundancy a complete VPS failure cannot be auto-healed from inside that same VPS.
* Previously observed known live containers `kq247-vietlott-vps` port 18088 and `kq247-vietlott-r33-candidate` port 18112; unknown candidate must not be automatically started. Research timers and SEO timers exist independently. Preserve disabled timers until no overlap risks.
* For live isolated audit refer to `.github/workflows/kq247-selfheal-all-vps-readonly-audit-20261015.yml`, run **38754028777 SUCCESS**, confirming 9 enabled active timers. Some scopes had no first-run report at time of audit due to initial stagger; do not claim all cycles confirmed.
* Next: confirm latest install+CI after `36da0df...`, inspect first-run state per all 9 scopes, repair Vietlott runtime via reversible staged deployment without stopping existing running container, validate live current R35 snapshots and customer view, then review per-scope errors.

## Source commits
`21ec0d4d41e618b4762f2d87a8a9ec2aad3a16ef` R35 guarded repair; `6b3c9649aadf360f4ba48069409505ef48cc06f0` no duplicate generic replays, verified statuses; `2f9338918aca261d63e9bb1d27dfee008242ca13` unknown/disabled workloads + resource pressure; `33302ac775b54315d5ba54540ffe6cef74ba3ff5` fix test; `36da0df22a4c6c973039bb8a394609df52eb5406` selfheal recursion guard.

**Never describe selfheal deployment as a guarantee of no errors, nor old R40 Vietlott as R35.**
