# KQ247 Google Web SEO — verified VPS handoff, 15 October 2026

## Requirement
User explicitly wants a dedicated Google Web SEO system, physically separate from Telegram directory backlinks, with hourly checking, safe publication opportunities, SEO indexing/on-page work, truthful reports and durable progress across chat switches.

## Installed and independently verified
- Google Web worker source: `seo-vps/kq247-google-web-worker.py` commit `33000b8ff9e8a23c50ce014bf48cd4d2087f3678`.
- VPS installer workflow: `.github/workflows/kq247-google-web-vps-install-20261015.yml` commit `6569ea73124563757d8959242a2aa9144f861c2b`.
- GitHub Actions run: https://github.com/liemtv87-lang/r55-system/actions/runs/38663582655 — SUCCESS; job 116190244202.
- VPS service `kq247-google-web-seo.service` and independent hourly timer `kq247-google-web-seo.timer` installed and enabled. Telegram subsystem timer `kq247-seo-unified.timer` was preserved.
- Report: `https://64-120-92-172.sslip.io/google-web-seo-status.json`; verified HTTP JSON on VPS localhost Caddy: `KQ247_GOOGLE_WEB_PUBLIC_JSON=PASS`.
- Worker report first run 2026-10-15 01:04:29 UTC (08:04 VN): 15 external website seeds checked, 7 HTTP 200, 0 verified external Google Web backlinks for football landing, 0 for lottery landing, 0 referring domains. The external web query environment could not open this hostname, but on-VPS HTTP verification succeeded.
- KQ247 production container listing unchanged: `KQ247_ALL_PRODUCTION_CONTAINERS_UNCHANGED=YES`.

## Distinct targets
- Google Web: `https://64-120-92-172.sslip.io/nhom-bong-da-telegram-mien-phi.html`, `https://64-120-92-172.sslip.io/nhom-xo-so-mb-mn-mt-telegram-mien-phi.html`.
- Telegram directory backlinks: `https://t.me/keochuyengia79` and `https://t.me/xsbm999`. NEVER count the older 3+3 Telegram directory links as Google Web backlinks.

## Known limitation and next action
- Independent Google Web auto-submission is NOT yet enabled: worker explicitly reports `automatic_submission.enabled=false`. No eligible third-party website publishing forms have been both validated for content-policy eligibility and implemented with a one-time submission adapter. It is incorrect to say any web backlinks were submitted or published in this rollout.
- Google Search Console Wizard integration reports an expired trial; indexation, clicks, impressions and positions remain unknown.
- Continue by verifying permitted first-party promotion/content opportunities and adding cautious per-site opt-in forms only where eligible. Do not mass post on unrelated or prohibiting domains, fabricate submitted counts, or bypass login/CAPTCHA.
- Do not stop production football, lottery, Vietlott or Telegram bot containers. Maintain separate Google Web and Telegram timers, reports and counters. Recheck hourly actual service state and update this file after meaningful verified changes.
