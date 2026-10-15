# KQ247 backlink campaign — operating notes

The target is **100,000 independently verified public listing URLs per Telegram group**, not a count of submitted forms or duplicate links. The campaign JSON is the source of truth for prospects and public evidence.

## Hourly verifier
The workflow `.github/workflows/verify-telegram-backlinks.yml` runs `python3 seo-vps/verify_backlinks.py seo-vps/backlink-campaign.json` at minute 17 UTC, and can also be dispatched manually in GitHub Actions. Results are stored as a workflow artifact for 30 days. Scheduled workflows may be delayed or disabled by GitHub; check actual run history.

## Safe publication process
1. Review a directory's current policies, free eligibility and whether the subject matter is accepted.
2. Submit at most one truthful listing per group per independent directory when authenticated access and any required confirmation are available.
3. Record a pending submission with its evidence separately; never add pending URLs to `published_listings`.
4. After approval, collect the unique public listing URL and verify its HTML contains a clickable link to the exact group.
5. Only then append a record with `group` (`football` or `lottery`) and `listing_url` to `published_listings`. Avoid duplicates and record independent referring domains separately.
6. Recheck existing URLs hourly; if unavailable or missing the link, mark them unverified in reports.

## Limits
The verifier is read-only. It does not fill third-party forms, bypass CAPTCHA, index content, send IndexNow requests, or access VPS credentials. GitHub Actions verification is separate from the existing VPS SEO timers and Telegram bots. No backlink count is guaranteed.

## Handoff — 2026-10-15 (Google Web and Telegram are separate)

- Campaign targets: https://t.me/keochuyengia79 (football) and https://t.me/xsbm999 (lottery). Google Web SEO verifies backlinks to the two first-party /nhom-*.html landing pages on https://64-120-92-172.sslip.io, **not** the t.me URLs. Telegram directory verification is a separate ledger.
- Requested operating target: 100 new verified public backlinks per hour **per group**. This is an objective, never a guaranteed measured rate. Count only independently accessible public listings with the exact outbound href; do not count scan records, submit clicks, form candidates or moderation queues.
- VPS timers verified active at 2026-10-15 08:58 UTC: `kq247-google-web-seo.timer` (hourly) and `kq247-seo-unified.timer` (Telegram). Independent `kq247-google-web-discovery.timer` runs at five-minute calendar cadence; installer verifies other timers/production containers unchanged.
- Latest confirmed Google Web audit 2026-10-15 08:58:52 UTC: 400 third-party sources checked, 270 HTTP 200, zero independently verified Google-Web backlinks for either topic. Google Web auto-submission remains disabled because no independently validated compatible publisher submission policy/form adapter exists.
- Google discovery 2026-10-15 08:45 UTC: 13,972 known hosts, 17,970 discovered contributor-page URL candidates, 19,680,188 cumulative sitemap URL records read. These cumulative counts include repeats and are **not** unique URLs, approved posting opportunities, or backlinks.
- Telegram read-only audit 2026-10-15 08:38 UTC: 62 known source hosts, 27 form candidates, 2 pending submissions per two groups on groupswa.com (one each), and 3 previously verified public listings per group in the separate verifier. No newly verified links in the last reported hour. Dedicated Telegram submitter's own newly published count remains 0.
- 2026-10-15 updates committed: `b64e3f3` removes 3 Web-only directories from Telegram posting queue and resumes interrupted *pre-POST* inspections without retrying uncertain form submissions; deployed successfully. `4d466ad` and `cb1f017` recognize classic PHP /submit.php sites as read-only source candidates. `ea7d7a8` distinguishes publisher forms blocked on mandatory email or terms; deployed and self-test passed. `1cb7423` seeds two additional Google Web directory **source index** pages (not authorized posting endpoints), pending latest install verification when this note was written.
- Confirmed external eligibility blockers (research only): Groupsgyani requires an account login to submit; TelegramGroups.co has a free option but classifieds such as betting/finance can require a $49 fee; do not choose a fake category to evade that. `groupssor.com` cannot truthfully select Vietnam in its required country dropdown. Several general website directories require CAPTCHA, paid review, reciprocal link, or genuine owner email.
- Follow-up 2026-10-15 09:01 UTC: commit `1cb7423` discovery installer run 38709574720 succeeded. The updated eleven-source frontier found 28 new hosts in the reported cycle (14,083 total) and 1 new contributor URL candidate lifetime (17,971 total). 497,004 sitemap URL records were read in this particular cycle, 400 source hosts scanned; still 0 verified publisher permissions or new public backlinks. Production containers unchanged. `seo-vps/vn-priority-opportunities.json` updated at `053345c` to record two already-published TgDio profile URLs (already in existing six Telegram backlinks; do not double count), current TelegramGroups.co paid-category gate, and stale 5-day trial text on the TgDio lottery profile (campaign requires 10 days).
- Immediate next step: inspect the new `candidate_review_status_counts` in Google public JSON; prioritize genuinely free, on-topic, owner-authorized publisher forms. Verify pending GroupsWA listings publicly before incrementing counts. Never spam comments/guestbooks, fabricate identity, pay unexpectedly, bypass CAPTCHA, change KQ247 production containers, or conflate Google-Web / Telegram metrics.

## Follow-up 2026-10-15 16:17 VN — Vietnam-first source correction

- User directive: stop inflated URL-scanning numbers; identify actual Vietnam publisher submission opportunities, check free/topic eligibility, and count independently verified public backlinks only.
- Live dual audit run 38710406475 at 09:06 UTC: Google 14,083 known source hosts, 17,971 candidate URL records, 47 eligible URL probes selected, 38 had no matching form and two were CAPTCHA-blocked. Google verified backlinks remained 0. Telegram verified links remained three per group, zero new in the hour; all timers were active.
- Commit 9771b4c prioritizes Vietnam opt-in paths and recognizes directory query forms; 24f8094 adds candidate_selection_funnel diagnostics; acaa137 checks publisher forms directly on source homepages. VPS Google installer 38711396887 SUCCESS.
- Commit 9156c1c seeded three VN backlink/forum catalogs. 0364bee initially failed self-test due escaped-dot regex; corrected at d391aa9 and discovery deployment 38711702844 SUCCESS.
- Google discovery at 09:15 UTC: 14 catalog indexes, 14,133 known hosts, 15 new that cycle, 17,973 candidate URL records, 400 inspected sitemap source hosts, 413,139 sitemap URL records read. None are verified registrations.
- Commit 8c4e242 adds the already owner-authored public GitHub README as an external HTML anchor verification prospect for the two exact KQ247 landing pages. Do not count unless audit confirms links in public HTML. Verify most recent deploy result.
- Next check candidate_selection_funnel and source_homepage_publisher_review_queue, prioritize truthful Vietnamese directory forms; preserve running football, lottery and bot containers. No CAPTCHA, account or topic restrictions bypass, no duplicate submissions.

## Follow-up 2026-10-15 16:18 VN — measured external HTML links

- Google-Web verifier deployment run 38711838244 at 09:18 UTC succeeded. 400 source hosts checked (269 HTTP 200). It independently confirmed 1 published public HTML backlink to the football first-party landing page and 1 to lottery, each from 1 external referring domain: the existing public repo README on github.com. These links were already author-owned and published; this is an improvement in detection, NOT two new third-party submissions.
- New commit b011a59 instruments remote self-test for exact candidate_funnel_counts, selected candidate URLs and unique source hosts. Must inspect workflow run 38712069814 before deciding whether 17,973 candidate URLs collapse because of bad intent filters or concentrated hosts.
- Automatic submission to generic third-party web publishers remains disabled; no validated eligible free publisher form yet. Telegram directory ledger remains 3 verified public links per group, as of last live audit. Do not claim 100 new backlinks per hour.
