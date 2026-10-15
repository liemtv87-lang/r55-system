# KQ247 R55 Render old links -> VPS — verified 15/10/2026 ~07:02 VN

User reported that the existing Render URL had NOT automatically moved to latest VPS URL. Root cause confirmed via Render service API, not a guess:

- Render static site `srv-davpec0u01pc73flcra0` was still LIVE at old commit `9803412c2784a1f0830721f99b8473a5134335f9` from 06:35 VN.
- GitHub source `liemtv87-lang/keo-bong-da-v763` main already had newer `adabb73267d7aefc91d933eb777f738fe8c99eed` dated 06:57 VN which prepended redirects at the very start of both `football-live/index.html` and `football-live/client.html`. Render had not deployed this commit automatically.
- Render service is autoDeploy=yes but no deployment/event occurred after 06:35 until we explicitly triggered deployment. Because automatic redeploy had not occurred, manual Render deploy was initiated, ID `dep-db81eurncjis73e8jd6g`.
- Render confirmed `dep-db81eurncjis73e8jd6g` LIVE, finished 2026-10-15T00:00:07Z (07:00:07 VN), commit `adabb732`.
- Exact old/new routes: `https://kq247-football-live.onrender.com/` -> `https://64-120-92-172.sslip.io/`; `https://kq247-football-live.onrender.com/client.html` -> `https://64-120-92-172.sslip.io/client.html`.
- Redirect is **JavaScript location.replace**, not an HTTP 3xx. It preserves query/hash for main; for customer, it transfers saved `kq247_dev` and `kq247_football_code` across origins via URL hash `#kq247=` for ingestion on the VPS client. No real customer credentials were read or transmitted during verification.
- To test actual Render LIVE content (not GitHub source alone), added read-only workflow `.github/workflows/r55-render-vps-redirect-live-proof-20261015.yml` on R55 research branch at commit `cbd5f7dd9157dc745f4d791836d17ea2a00e0d1b`.
- Workflow run https://github.com/liemtv87-lang/r55-system/actions/runs/38657593010 is SUCCESS. It fetched both LIVE Render HTML endpoints, executed real embedded redirect scripts in isolated Node VM, asserted main query/hash migration, customer synthetic device+activation-code handoff, existing migration hash preservation and no-code redirect. All checks passed, no real customer login performed.
- No VPS container was stopped or restarted by this repair. No football snapshots, forecast selection, customer codes, bot rate limits or actual user data were changed.
- Outstanding separately: old Android WebView/browser service-worker cache may keep a stale page until refresh; only a real user-device browser test can validate that exact device. Do not conflate LIVE script smoke with HTTP 301 or all-device guaranteed behavior.

Continue R55 forecast/data work from current branch state; never undo old Render entry links or customer code handoff.
