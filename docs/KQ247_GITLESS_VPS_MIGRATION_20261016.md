# KQ247 VPS-only operations migration — 2026-10-16

## User non-negotiables
- Preserve existing public URL for every main/customer tool, UI, existing license codes, device binding, and expiration.
- Do not restart, stop or replace running Docker containers or edit already locked snapshots without confirmed safe switch.
- BD first, XS second; Vietlott 150-draw R34 backtest may finish unattended. Prevent duplicate Telegram sending.
- GitHub may stay as source history/backup, but recurring application compute, scraping, snapshot and bots must run on VinaHost VPS.
- After removing GitHub execution dependencies, remove obsolete GitHub schedules and run old manual tests only when needed.

## Verified operations, not guesses
- GitHub R55 source repository has approximately 290 workflow YAML files referring to `ubuntu-latest`. Only TWO declared GitHub cron schedules were discovered in automated audit (run `38801285657`). The majority are one-off push/manual workflows, not 290 daily jobs.
- Removed GitHub cron from `.github/workflows/kq247-vietnam-first-sitemap-audit-20261014.yml`, commit `8c1fb8c`. Existing VPS SEO timers already include `kq247-google-web-discovery.timer` and `kq247-google-web-seo.timer`; avoid a duplicate scheduled scanner.
- Removed old R33-only Vietlott cron from `.github/workflows/kq247-vietlott-nightly-33-contract.yml`, commit `edd53ca`. This obsolete contract enforced 33 rules/19h; VPS Vietlott R34 34-rule schedule belongs after 20h. GitHub manual tests kept, not claimed migrated.
- VPS live read-only audit `38800849115`: BD customer port 18081 /healthz 200; BD bot 18083 active primarySender=true; XS main port 18084 active but `backendMigrated=false`, `neonOriginalReadThrough=true`; XS bot 18085 active=true; sales port 18086 reported `active=false`. VPS systemd timers found for XSMB staging 19:30, football research, XS research, SEO, self-heal services. Read-only workflow commits `1612c64` then `9d2f18d`.
- Further audit `38801285657` queried BD /api/health port 18080 HTTP 200 but returned `locked=false`, snapshot_total=145 at approximately 03:22 VN. Not proof of successful current-day 13:00 lock; must recheck after daily deadline. BD /api/main-football response similarly unlocked; no forced regeneration.
- R55 source code `deployment/football-native/worker.mjs` contains internal schedules (13:00 lock/13:30 grade); XS `kq247-xsmb-1930-staging.timer` is local, but full MT/MN per-station + public client data path migration not confirmed. Do not create duplicate scheduler.
- Dedicated VPS GitHub Runner `kq247-vps-vietlott` exists but belongs to private Vietlott repository only, not to R55. R55 `ubuntu-latest` manual workflows cannot switch labels until an appropriately scoped R55 runner is registered; cannot claim R55 runner installed.
- Vietlott private repo 48-shard offline R34 150-draw backtest run `38798786896` executing sequentially on VPS Runner. Snapshot/client/auth public cutover NOT done; source XSMB 302 rows and three-region archive 275 rows. Jobs are not to be interrupted.
- For ongoing BD/XS testing using VPS compute, private Vietlott repo contains `.github/workflows/kq247-bd-xs-vps-migration-audit.yml` (commit `bb39c8a`, added source syntax at `7d9bca4`). It checks out public R55 and tests inside existing unprivileged VPS Runner without admin credentials; this is temporary CI, not a full gitless production runtime migration.
- Attempt to issue privileged remote root SSH one-time BD/XS audit/deployment workflow was refused by safety checks. Do not circumvent tool safety policy or make alternative root access path to bypass; no production write/deploy occurred.

## Next actionable gates
1. Verify all existing VPS timers and internal worker schedules for BD, XS, bots, SEO, and 13:00/19:30 locks; note missing roles. Do not duplicate senders or schedulers.
2. Before changing XS customer to local PostgreSQL: build compatible local auth endpoint; migrate all license/device/session/link history with exact row count+digest parity; ensure trial Free 10 days and all existing codes still work.
3. Check BD post-13:00 native locked snapshot, full AH/OU fixtures/form/odds/history and no duplicate bot; XS post-19:30 36-station last-draw source and private immutable snapshot, then main/customer/bot parity.
4. Port *actually active* R55 GitHub-hosted jobs to independent VPS-local systemd timers/services where no equivalent already exists, with health verification and idempotence. Unused one-off GitHub workflows can remain archived source/manual tests.
5. Disable old sources only after local replacement is proven and backed up. Never change existing public URLs; production migration is NOT complete at this checkpoint.
