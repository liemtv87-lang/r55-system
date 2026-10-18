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

## 2026-10-18: SEO landing expansion (Google indexing requested)
- Requested indexing for `https://64-120-92-172.sslip.io/cong-dong-telegram-kq247.html` confirmed by user screenshot. Submission is not proof of indexing.
- Google WEB worker source extended to audit four first-party landing pages: football, lottery, channel and community. Community page must link to ALL three Telegram targets.
- Google WEB campaign manifest version 2 adds `channel` and `community`; former Telegram directory targets remain unchanged.
- Installer assertion updated for four audited pages and sitemap presence. Preserve running non-SEO services and avoid duplicate SEO supervisors.
- Deployment and real backlinks must be checked separately; source commits do not by themselves prove publication, VPS sync, or Google indexing.


## 2026-10-18 08:14 VN — authenticated SEO Chrome handoff
- User has already signed into the VPS Chromium dedicated to SEO; do not ask for manual login on every directory.
- VPS read-only inspections verified `kq247-seo-google-login` (jlesage/chromium) and `seo-kq247-opt-in-directory` (Playwright) were running, browser display `:0` usable, browser `/config` has persistent bind mount, Chrome and submitter are DISTINCT browser processes.
- The live poster SQLite database had 4 `submitted_pending_review` records for the lottery target, 4 for football and 3 for channel, and 1 `published_verified` record for channel (DB claim; external independent verification still required). Do not conflate these with actual approved backlink URLs.
- On 2026-10-18 an isolated Chrome cutover utility was committed: `seo-vps/kq247-chrome-cdp-cutover.py`. Initial setup workflow `kq247-seo-chrome-private-cdp-20261018.yml`, run 39085513854, FAILED at safety check `cdp_not_private_loopback`, and executed its rollback path. The original Chrome was seen running again in read-only rerun job 117551699800, as was existing SEO poster. No claimed successful authenticated bot connection or submission.
- Source cutover utility was then revised to use direct `--remote-debugging-port=9222 --remote-debugging-address=127.0.0.1` in `CHROMIUM_CUSTOM_ARGS` while disabling the image's built-in CDP forwarder. This SECOND revision has NOT been deployed or validated. The requested edit to retrigger the installation workflow was blocked by a safety gate; do not work around it with alternate runner or unsafe exposure.
- Browser profile must stay private: never publish CDP port or cookie/profile files to GitHub, Internet, or unrelated Docker networks. GitHub/ChatGPT Gmail connector cannot automatically grant a VPS daemon permission to Gmail. Dedicated OAuth authorization is required for unattended OTP processing. CAPTCHA needs approved provider/user verification; don't bypass protection.
- Existing logged-in Chrome session must be preserved, with reversible isolated SEO-only changes. Never restart football/lottery/Vietlott production containers. User next requested to fix Vietlott new-period predictions AFTER verified SEO connection; that subsequent repair has not yet been performed in this continuation.
- Status: source staged, first unsafe configuration rolled back, Chrome and poster alive; authenticated session bridge and fully automatic registrations NOT COMPLETED.


## 2026-10-18 09:42 VN — VERIFIED CHANGES and exact next blockers
SEO:
- Run 39090147524 SUCCESS: browser CDP available only at loopback 127.0.0.1:9222, profile persisted, no publicly mapped debug port, other production containers intact.
- Run 39090251391 SUCCESS: Playwright joined the existing Chrome context; read-only Groupsgyani check reported signed in, no login redirect. No submission from that check.
- Run 39090437197 SUCCESS: migrated ONLY `seo-kq247-opt-in-directory` to `--network container:kq247-seo-google-login` and `KQ247_AUTH_CDP_URL=http://127.0.0.1:9222`. Old poster kept as rollback. Startup `authenticated_chrome: true`; candidate hosts 39 and eligible unsubmitted pairs 0. Do not claim new directories submitted or Gmail OTP/captcha automated. Separate Gmail OAuth and new eligible free form sources still needed.
VIETLOTT:
- Run 39090553029 confirmed production `kq247-vietlott-vps` was healthy HTTP-wise but `data_ready:false` and failed; latest original snapshots dated Oct 12, no active production prediction timer. Production runtime `R40_VPS_USER33_FULL30_60_150_20261013`, not desired R34.
- Run 39090639480 confirmed old source missing 2026-10-17 XSMB and that `/app/scripts/xsmb-verified-daily.mjs` was absent. Historical R34/R35 staged containers have only 2026-10-15 latest source and are NOT current live predictions.
- Run 39090689456 SUCCESS: verified XSMB 2026-10-17 27 prizes agreed across xosodaiphat, xsmienbac and az24; DB 64538 and last 01; two-source integrity threshold met.
- Run 39090814523 SUCCESS: applied source-verified XSMB previous-day catch-up to the existing `kq247-vietlott-vps` without restarting any container, preserving existing snapshots/license data. Admin `POST /run/daily` HTTP 202 accepted.
- Run 39090974147 re-run SUCCESS: job `completed`, exit_code=0, health data_ready=true; main Mega snapshot LOCKED for 2026-10-18 based on analysis 2026-10-17; Power snapshot LOCKED for 2026-10-20 based on analysis 2026-10-17. Both are `USER_33_HARD_RULES_PAIR_TOUCH_2026_10_13_R1`, not R34. XSMB history is 114 days and the most recent row has full27 verified by 3 sources.
- Remaining warning: historical backtest tries `git log` in a deployment without .git for Power 2026-09-15. It did not prevent current snapshot generation but historical statistics must not be claimed validated.
- Created VPS-only daily 20:05/20:15/20:25 VN retry logic in `deployment/vietlott/kq247-nightly-retry-20261018.py` and shell installer `deployment/vietlott/install-verified-nightly-20261018.sh`. Attempts to CREATE the remote installer workflow were blocked by safety gate, so **the new scheduler is NOT YET installed or active on VPS**. Never claim automated future nights are repaired.
- Next authorized steps: install and verify the on-VPS timer via approved access, then validate tomorrow's automatic run; check public customer pages and lock parity; separately migrate verified R34 34-hard-condition filter from stage once actual live release gate passes. Keep URLs/customer license keys/snapshots and unrelated KQ247 containers unchanged.
