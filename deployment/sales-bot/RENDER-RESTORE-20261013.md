# KQ247 Sales bot — Render standby transfer (2026-10-13, Asia/Bangkok)

## Current confirmed state
- Target: Render service `tool-sales-bot`, ID `srv-dap6o0o473hc73d8qin0`, URL `https://tool-sales-bot.onrender.com`.
- VPS primary: `64.120.92.172`, Docker container `kq247-sales-bot-primary`, local health endpoint `127.0.0.1:18087/healthz`. Keep active until cutover is tested.
- Latest migrated Render deploy: `dep-db6k7hjl550s73bahv60`, status `live`, standby.
- Full six-file source bundle staged in Render `BOT_CODE_GZ_B64`, extracted by existing Render start command. Source from `deployment/sales-bot/` on repo main: `worker.mjs`, `payos-orders.mjs`, `package.json`, `confirm-payos.mjs`, `sales-bot.test.mjs`, `Dockerfile`. No secrets embedded. Exact live VPS container-image byte identity NOT yet compared.
- Render env aliases in the bootstrap script: `BOT_TOKEN -> TELEGRAM_SALES_BOT_TOKEN`; `KQ247_NEON_DB_URL -> NEON_DATABASE_URL`. Logs confirm `telegram=true`, `database=true`.
- Render source modules installed and startup logs: `KQ247_RENDER_VPS_SOURCE_STAGED 6`, `SALES_VPS_STANDBY=YES`.
- Render remains `KQ247_SALES_BOT_ACTIVE=0` to avoid two Telegram pollers. VPS sender NOT switched off.
- PayOS readiness on Render: `payos=false`, keys `PAYOS_CLIENT_ID`, `PAYOS_API_KEY`, `PAYOS_CHECKSUM_KEY` absent. The old Render service also had no PayOS variables by those names. Do not set `PAYOS_WEBHOOK_CONFIRMED=1` until PayOS has actually confirmed the correct callback. Payment not activated; never issue license without verified payment.

## Cutover remaining
1. Configure PayOS secrets securely in Render dashboard or via an authorized transfer that does not reveal secrets in logs/chat; configure `PAYOS_PUBLIC_BASE_URL=https://tool-sales-bot.onrender.com`.
2. Verify private credentials, HTTPS webhook endpoint, signed webhook registration and its `payos.ready` status; dry-run full payment + existing customer license recovery.
3. Stop VPS sales bot poller through authorized SSH/GitHub Action. **Only then** set `KQ247_SALES_BOT_ACTIVE=1` on Render and verify Telegram getUpdates works, Neon customer codes preserved.
4. After proving successful single-owner cutover, retire unused tasks. No other Render services have been deleted or stopped: some host customer sites and user-facing links, and the current Render connector does not expose a delete/suspend operation.

## Service checks
- Render last stage logs: dependency install succeeded, service reported LIVE, aliases found bot and database environment variables.
- Source has three products (football/lottery/vietlott), customer code recovery and PayOS service module, with code prices read from Neon.
- Any future assistant should resume FROM THIS STATE, not restore the retired Render bot version or silently enable duplicate Telegram polling.
