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
