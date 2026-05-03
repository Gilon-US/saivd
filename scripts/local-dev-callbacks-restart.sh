#!/usr/bin/env bash
# Stop ngrok + free the dev port, then start the same stack as `npm run dev:callbacks`
# (ngrok public URL + Next.js webpack on PORT / LOCAL_DEV_PORT, default 3000).

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$SCRIPT_DIR/.."
cd "$ROOT" || exit 1

DEV_PORT="${PORT:-${LOCAL_DEV_PORT:-3000}}"

echo "[local-dev-callbacks:restart] Stopping ngrok (if any from a prior callbacks run)…"
bash "$SCRIPT_DIR/local-dev-callbacks-stop.sh" || true

if pids=$(lsof -tiTCP:"$DEV_PORT" -sTCP:LISTEN 2>/dev/null); then
  echo "[local-dev-callbacks:restart] Stopping listener(s) on port $DEV_PORT (pids: $pids)…"
  kill -TERM $pids 2>/dev/null || true
  sleep 0.5
  if pids=$(lsof -tiTCP:"$DEV_PORT" -sTCP:LISTEN 2>/dev/null); then
    kill -9 $pids 2>/dev/null || true
  fi
else
  echo "[local-dev-callbacks:restart] No process listening on port $DEV_PORT."
fi

echo "[local-dev-callbacks:restart] Starting callbacks dev stack…"
exec bash "$SCRIPT_DIR/local-dev-callbacks-start.sh"
