# XS KQ247 – release gate 15/10/2026 (Asia/Ho_Chi_Minh)

This is a factual handoff of repository state, not permission to change URLs/UI.

## Non-negotiable production contract
- Preserve original, user-approved Neon HTML/CSS and DOM for XSMB/XSMT/XSMN.
- Preserve all public links `/xoso?region=xsmb|xsmt|xsmn`, `/xoso-khach`, station selectors, and existing licenses/device bindings.
- Do not route public pages to the alternative 36-station reader UI.
- Do not change a signed/immutable previously displayed pre-draw pick when recomputing the same draw day.
- Main, customer iframe, and Telegram must read identical date/station snapshots; no duplicate sender.

## Exact source distinction that caused the discrepancy
- Correct, original XSMB full27 source: 15/10 target, actual draw 14/10, picks **51 52 91**, doubles **33 77**.
- It is the immutable `kq247_xs_vps.locked_daily_snapshots` record and `public-locked/xsmb-2026-10-15.json` exported by `export-locked-snapshot.py`.
- GitHub Actions full27 proof run 38607474310 shows exact values and 1000/1000/1000 DE methods; original immutable export proof 38611143397 shows snapshot file successfully produced.
- **Caveat:** that XSMB full27 lotto engine also learns positional relationships from 500 past *actual* draws (not prior forecasts). This historical-learning feature differs from a strictly single-draw scoring requirement; do not misdescribe it as "only one day of source data" or silently change the already-approved 15/10 numbers.
- A separate `previous-station-draw-only.mjs` 36-station scorer generates DIFFERENT MB picks (local exact replay: 61 65 68 from 14/10), hence must not overwrite the original immutable MB source.
- Provincial MT/MN stations draw by weekday. Their immediately previous draw is typically days (often a week) earlier; NEVER use another station's previous calendar-day draw. Archive/source dates must be shown.

## Current staged changes (not proof of public data cutover)
- `previous-station-draw-only.mjs`: MB source must be prior calendar day, provincial source within 1–7 days; always same station.
- `neon-locked-overlay.mjs`: preserves original HTML/CSS; for MB reads the original full27 immutable export and rejects 15/10 output != 51 52 91; for MT/MN reads the per-station read-only 36 index; all sets validated.
- Both `deployment/lottery-original/bot/github-runner/sender.py` and `lottery-bot/sender.py` are byte-identical in Git; bot MB source uses original full27 lock; MT/MN retain station snapshots.
- An isolated JS mock of the latest overlay returned original CSS unchanged, MB 51–52–91, MT & MN each with correct station nav, 50/60/75, 500 3-digit entries. This is NOT an actual end-to-end production proof.
- Latest successful VPS deploy of bot source: GitHub Actions 38628642519. Original UI and customer source remained intact; `/xoso` still goes to `lottery-original:3004` with Neon HTML read-through.
- Original-layout private proof 38628003514 was successful BEFORE adapting the overlay to the original MB full27 export; rerun an on-VPS private proof with real `xsmb-2026-10-15.json` before releasing.

## Mandatory release gates before changing customer-visible data
1. Test latest overlay against actual VPS read-only files, including MB original full27 source, MT 3 stations, MN 3 stations, the CSS byte comparison, all COPY buttons and 3-cang membership.
2. Test the actual running bot's dry read for XSMB 51-52-91 and identical MT/MN outputs, never send a live Telegram message during QA.
3. Confirm `/xoso-khach` unchanged, old codes still valid on original devices, and the main page and customer iframe show same selections after the source changes.
4. Preserve URLs and original UI. Use a zero-downtime, rollback-capable rollout. Do not overwrite an immutable snapshot or restart unrelated running containers.
5. Verify actual external pages and Telegram source after rollout. Do not mark "fully synced" without these proofs.

This file is a continuation checkpoint. Do not restart investigation from the beginning on subsequent chat turns.
