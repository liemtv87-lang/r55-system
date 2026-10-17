# KQ247 SEO — handoff 2026-10-17 (VN, ~23:00)

## Target scope
- Telegram group football: https://t.me/keochuyengia79
- Telegram group lottery: https://t.me/xsbm999
- Telegram broadcast channel: https://t.me/tooldudoan999
- Existing two first-party Google Web SEO landing pages remain unchanged.

## Source changes committed (NOT YET VPS DEPLOYED/VERIFIED)
- `seo-vps/kq247-bulk-auto-submit.py` — add third target. Prior sender's global ALREADY_SENT_HOSTS and EXTERNAL_WORKFLOW_HOSTS exclusions moved to legacy groups only, opening a new **independent** host-target pair for the channel. Reject group-only forms for the channel; radio type must match group/channel. Keep SQLite primary key (host, grp) and durable no-retry after uncertain POSTs. Add per-target statistics.
- `seo-vps/backlink-campaign.json` — add channel, 1,000 verified-link targets per address, six explicitly channel-oriented directory prospects. No fabricated publication/claim.
- `seo-vps/kq247-seo-unified.py` — display 3 targets and distinct verified-count/high-water meter for channel.
- `seo-vps/kq247-seo-full-pipeline-20261016.py` — display 3 targets and known channel verification metric, without touching Google Web targets.
- `seo-vps/audit-backlinks.py` — merge independently checkable `published_verified` and `already_listed_verified` receipts from `/opt/pwremote/kq247-backlink-background/bulk-posts.json`, independently re-fetch public HTML before counting; deduplicate claims; accurately report a rolling one-hour newly verified total; reject internal/reserved IPs and off-host redirects.

Commit sequence:
- f57314b65c111641611c40fb837819981df6d158
- 03bd650b920350dfe21dc9c6c1a52f36494abacd
- a82ddeae278ed2f9d9c67c69d3725b5fc7cf681b
- be28be6087a97f962cd713ec961924602647e9a5
- fc2e5d4ad0285853557d3078c5ed7605f055fd92
- 2ae85fda47a3f5114fff13d98faedac59090eceb

## Why previous scans did not turn into posted links
- `kq247-google-web-worker.py` currently reports `automatic_submission.enabled=false`: verified compliant free opt-in WEB editorial POST adapter is still absent. Do NOT infer backlinks from sitemap or candidates.
- Telegram poster queue had 0 new eligible target-host pairs in most recent live snapshot. The global prior-host exclusion made it worse for the newly requested channel.
- Site eligibility matters: Groupsgyani's live 2026 form starts with LOGIN; TG-Hub form requires email. No login, CAPTCHA or owner verification bypass; no invented identity/contact details.

## VPS safety & deployment blocker
- LAST OBSERVED live report (not checked in this work session): 2026-10-17 22:42 VN, Google 17,729 hosts, Telegram 538 sources, 0 verified backlinks newly obtained that hour. Three timers and isolated poster container reported active; no service/container restarts.
- This work session ONLY updated the GitHub source archive. It did NOT execute GitHub Actions, call VPS write controller, update the running Docker image or Python workers, POST a listing, or verify production deployment. Do not claim the live VPS is fixed until authenticated VPS access and a read-only post-deploy check work.
- Operational goal is **VinaHost VPS-only runtime**. Keep URLs/customer codes/snapshots unchanged, never restart other KQ247 containers; avoid GitHub Actions compute.
- Before changing runtime, verify exact VPS file paths/image layout, run Python `py_compile`/source offline self-tests, preserve submission SQLite DB and receipts, install only SEO units through a planned isolated handover; avoid touching unrelated running workloads.

## Next verification
1. Access VPS directly through an authenticated control channel with explicit write support (not yet available here) and check current SEO script hashes, service/timer units, container source mount and bind paths.
2. Apply the five source changes safely to VPS. A Python process already running will not hot-load a changed file automatically; use a safe isolated SEO-only deployment rather than restart production workload containers.
3. Run syntax checks plus database-preservation checks, then check live `seo-unified-status.json`, `seo-backlinks-status.json`, `seo-full-pipeline-status.json` and real listing URL hrefs.
4. Count submitted, pending, rejected, newly independently verified and unique referring domains for ALL THREE targets. Google Web still requires separately proven eligible editorial forms. No benchmark of 100 new backlinks/hour has been attained.
