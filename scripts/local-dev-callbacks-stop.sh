#!/usr/bin/env bash
# Tear down ngrok started by local-dev-callbacks-start.sh (read PID from .local-dev-callbacks/ngrok.pid).
# Stopping Next.js: use Ctrl+C in the terminal running the start script, or stop the process on the dev port yourself.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$SCRIPT_DIR/.."
STATE_DIR="$ROOT/.local-dev-callbacks"
PID_FILE="$STATE_DIR/ngrok.pid"

GRN='\033[0;32m'
YEL='\033[1;33m'
NC='\033[0m'

note() {
  echo -e "${GRN}[local-dev-callbacks:stop]${NC} $*"
}

if [ ! -f "$PID_FILE" ]; then
  note "No saved ngrok pid ($PID_FILE). Nothing to stop (already clean or not started by local-dev-callbacks-start.sh)."
  exit 0
fi

pid=$(cat "$PID_FILE" 2>/dev/null || true)
if [ -z "${pid:-}" ] || ! [[ "$pid" =~ ^[0-9]+$ ]]; then
  note "Invalid pid file; removing $PID_FILE"
  rm -f "$PID_FILE"
  exit 0
fi

if ! kill -0 "$pid" 2>/dev/null; then
  note "ngrok (pid $pid) is not running; removing stale $PID_FILE"
  rm -f "$PID_FILE"
  exit 0
fi

note "Sending SIGTERM to ngrok (pid $pid)…"
kill -TERM "$pid" 2>/dev/null || true
# brief wait
for _ in 1 2 3 4 5; do
  if ! kill -0 "$pid" 2>/dev/null; then
    break
  fi
  sleep 0.2
done
if kill -0 "$pid" 2>/dev/null; then
  echo -e "${YEL}ngrok did not exit; sending SIGKILL${NC}" >&2
  kill -9 "$pid" 2>/dev/null || true
fi

rm -f "$PID_FILE"
note "ngrok stopped."
