# R55 System

R55 football/lottery Telegram sender runtime prepared for Raven/Node.js deployment.

## Raven

- Git Repo Address: `https://github.com/liemtv87-lang/r55-system.git`
- Branch: `main`
- Node image: Node.js 22+ (Node.js 25 is fine)
- Startup command: `bash start.sh`
- Port: `8080`
- Health path: `/health`

## Required environment

Set secrets in Raven environment variables, not in GitHub:

- `TELEGRAM_BOT_TOKEN` — required to send messages.
- `FOOTBALL_CHAT_ID` — football group/channel id when overriding the code default.
- `LOTTERY_CHAT_ID` — defaults to `@xsbm999`.
- `R55_URL` — defaults to `https://r55-unified-runtime.floot.app/api/background`.
- `PORT` — defaults to `8080`.
- `STATE_FILE` — defaults to `/tmp/telegram-r55-state.json`.

Optional safety flags:

- `BOT_TEST_MODE=1` prevents real Telegram sends and logs mock sends.
- `SENDER_DISABLED=1` disables all Telegram sending.
- `LOTTERY_SENDER_DISABLED=1` disables lottery sending only.

## Scheduling in current sender

Football checks every minute, sends when kickoff is about 20 minutes away (18–22 minute window), and enforces at most one football message per 60 minutes.

Lottery windows use Vietnam time: XSMN 16:10–16:14, XSMT 17:10–17:14, XSMB 18:10–18:14.
