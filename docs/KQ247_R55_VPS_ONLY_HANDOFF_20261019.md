# KQ247 R55 — VPS-only single locked snapshot staging handoff (19 Oct 2026)

## User requirements (current, higher priority than older work)
- Entire operational runtime (football, XS, Vietlott, sales, bots, SEO) on existing VinaHost VPS; no Neon compute, database, auth or bridges.
- Never change existing public main/customer URLs, customer codes, device bindings, expirations, or archived immutable snapshots.
- Football main, customer and Telegram sender consume precisely one canonical locked snapshot version. No independent prediction, split API upstream, provisional customer feed, or Neon mirror.
- Do not stop/restart the running production containers until complete zero-loss migration and read-only preflight pass.
- Telegram, Bongdalu and PayOS remain **necessary third-party interfaces**, but app schedulers, DB, auth and execution must reside on the VPS.

## Staged source changes — branch `r55-single-locked-snapshot-vps-20261019` ONLY
1. `deployment/football-staging/Caddyfile`: route the public football API to the single `football-original:3002` reader, independent of query flags; customer-auth traffic routed to local VPS container. Health route remains separate.
2. `deployment/football-original/api/main-football.js`: source-verified **locked** `bongdalu-r55` rows only, latest locked row persists across calendar-day and 12:05 turnovers, no public provisional draft; output `snapshot_id=bongdalu-r55:<day>:<locked_at ISO>`.
3. `deployment/football-original/server.mjs`: remove legacy/Neon cache fallback.
4. `deployment/football-native/publicApi.mjs`: remove legacy fallback and expose the same source-verified latest locked version; provisional preview remains unavailable to public.
5. `deployment/football-bots/group-worker.mjs`: select one source-verified locked version; read full JSON once per unique lock and reuse in memory, while checking lightweight version metadata between sends. Historical grade summaries can still query earlier locked rows; do not rewrite archived data.
6. `deployment/football-original/public/client.html`: customer authorization points to existing VPS `/api/customer-auth/` endpoint; predictions read once per page session from canonical main API and are reused from memory; do not expire at 00:00 or 12:05; no automatic URL replacement; preserve published URL and local device/license storage; remove browser PostHog requests.
7. `deployment/sales-bot/worker.mjs`: VPS-local Postgres only; remove external Render payment bridge and bridge warm-up. Direct PayOS via VPS only when configured and verified; otherwise do not issue paid licenses.
8. `deployment/football-staging/verify-vps-only-cutover.sh`: read-only cutover checks for snapshot ID parity, exact customer link preservation, no external DB environment keys in selected containers, and valid local endpoint.

## Production is NOT migrated by this source patch
No live VPS shell/VPS Control tool was available in this chat. Changes have NOT been copied to /opt/kq247, built as Docker images, deployed, or validated against live customer's active codes. No old containers or Neon project have been deleted. Never represent staging source work as a live VPS cutover.

## Hard blockers before disabling Neon or external hosts
- A 2026-10-18 read-only audit found customer auth & sales containers on VPS, but older source still referred to Neon. Need inspect deployed source and verify LOCAL PostgreSQL holds ALL active code/device/expiry/session/order records, not merely table names; compare counts and digests with old source without exposing secrets.
- Connected Neon list_projects returned no accessible projects. Do not claim Neon deletion; only delete with project ownership and verified local backup/parity.
- Run `verify-vps-only-cutover.sh` on VPS against candidate. Independently verify real activation/check/recovery with existing customer credentials using an authorized test device, and payOS webhook.
- Determine if original public customer URL is a vendor-owned `*.onrender.com` hostname. That URL CANNOT be served exclusively from the VPS after Render is shut down, since the hostname belongs to Render. Keeping the identical external-host link requires the original host to remain reachable (at least as redirect), unless the link already points directly to VPS. Do not silently change URLs to work around this incompatibility.
- Inspect XS, Vietlott, SEO and all bot runtime dependencies independently; no evidence they have completed Neon-free migration. Do not shut these down or erase records.
- Single Telegram sender proof required; no duplicate active polling/webhook process.
- Source branch alone does not implement live deployment; promote only after preflight, verified backups and canary parity.

## Final deployment/cleanup protocol (VPS operator)
1. Create encrypted backup of current VPS app databases, customer registry and snapshots; record hashes and container identities.
2. Confirm all customers, expiry, binding, payOS records exist in VPS Postgres; switch customer-auth/sales to local DB without altering URLs.
3. Verify one locked football snapshot ID in main, customer and bot. Check source/match count/FT grading; ensure new 13:00 lock replaces old only after complete build.
4. Cut over public reverse proxy with zero-loss rollback point and run read-only tests. Verify old public links exactly, including on phone.
5. Only then disable old external runtime and remove verified-unreferenced redundant services. Delete Neon projects only when project ownership/deletion access and complete migration evidence are available.
