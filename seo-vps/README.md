# KQ247 • VPS SEO for two Telegram groups (2026-10-13)

Production host: `https://64-120-92-172.sslip.io` on VinaHost.

## Scope and deployment

- Only `@keochuyengia79` and `@xsbm999`.
- Public owned landing pages:
  - `/nhom-bong-da-telegram-mien-phi.html`
  - `/nhom-xo-so-mb-mn-mt-telegram-mien-phi.html`
- Canonical and `og:url` on both pages reference the VPS, not Hatchable.
- `/robots.txt` refers to `/sitemap.xml`, whose entries include both landing pages.
- Local VPS hourly Python health monitor: `/opt/kq247/seo-groups/groups-hourly.py`
- Separate changed-content-only IndexNow worker: `/opt/kq247/seo-groups/indexnow-changes.py`
- VPS systemd timers: `kq247-seo-groups.timer`, `kq247-seo-indexnow.timer` (hourly, persistent).
- VPS local reports: `/opt/kq247/seo-groups/reports/latest.json` and `indexnow-accepted.json`.
- Public status: `https://64-120-92-172.sslip.io/seo-groups-status.json`.
- IndexNow key is generated on the VPS, verified from a public key file, and **never** stored in GitHub. No synthetic requests, fake hits, automatic third-party directory submissions, Supabase quota usage, or repeated notifications for unchanged pages.
- Existing football/lottery VPS Telegram bots are not changed by this SEO-only install.

## Verified live checkpoints

- Main R55 deploy `38380005409`: SUCCESS.
- SEO VPS install `38380179122`: SUCCESS, both HTTP200 and canonical/OG/sitemap/robots verified.
- Changed-only IndexNow install `38380596521`: SUCCESS, both hourly systemd timers active.
- Independent IndexNow confirmation `38380800136`: SUCCESS; both page submissions returned HTTP **202** (received, validation pending). This is **not** proof of search engine indexing or ranking.
- Public status audit shows both landing pages HTTP 200, both Telegram previews HTTP 200 at test time.

## Explicit scope boundary

The old Supabase `organic-seo` Edge Function and its global `seo_indexnow_priority_2h` / `seo_indexnow_all_12h` cron jobs span unrelated KQ247 routes. Do **not** claim they were deleted or fully migrated; do **not** disable global jobs without also migrating their unrelated SEO pages. This migration makes the **two Telegram group landing pages** independent of them. The separate GitHub Actions `seo-hourly-audit.yml` still checks 14 affiliate URLs and technical endpoints; this is separate from the two-group VPS worker.

Google Search Console metrics are not verified; the connected GSC Wizard account reports payment_required. There is no claimed target ranking, 1,000 impressions/day, or +50 new Telegram members/day. IndexNow does not guarantee indexing.
