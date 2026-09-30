#!/usr/bin/env bash
set -e
if [ -d .git ]; then
  git pull --ff-only origin main || true
fi
exec node telegram_bot.mjs
