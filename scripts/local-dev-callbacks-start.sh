#!/usr/bin/env bash
# Local dev: ngrok (public HTTPS) + Next.js on webpack (no --turbopack) for full manager callbacks.
#
# Opt-in: SAVD_DEV_INSTALL_NGROK=1  — if ngrok is missing and Homebrew exists, run:
#   brew install ngrok/ngrok/ngrok
#
# Port: use PORT or LOCAL_DEV_PORT (default 3000). ngrok and Next use the same port.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$SCRIPT_DIR/.."
cd "$ROOT" || exit 1

STATE_DIR="$ROOT/.local-dev-callbacks"
NGROK_API="http://127.0.0.1:4040/api/tunnels"
DEV_PORT="${PORT:-${LOCAL_DEV_PORT:-3000}}"
NGROK_PID=""

BOLD='\033[1m'
RED='\033[0;31m'
YEL='\033[1;33m'
GRN='\033[0;32m'
NC='\033[0m'

die() {
  echo "" >&2
  echo -e "${RED}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}" >&2
  while [ $# -gt 0 ]; do
    echo -e "${RED}  $1${NC}" >&2
    shift
  done
  echo -e "${RED}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}" >&2
  echo "" >&2
  exit 1
}

note() {
  echo -e "${GRN}[local-dev-callbacks]${NC} $*"
}

warn() {
  echo -e "${YEL}[local-dev-callbacks]${NC} $*"
}

banner_ngrok_missing() {
  die \
    "ngrok is not installed (not found on PATH)." \
    "Install: https://ngrok.com/download" \
    "  macOS (Homebrew): brew install ngrok/ngrok/ngrok" \
    "Or re-run with: SAVD_DEV_INSTALL_NGROK=1 $0" \
    "(opt-in: installs ngrok via Homebrew only if brew is available)"
}

banner_ngrok_not_configured() {
  local detail="$1"
  die \
    "ngrok is not configured (authtoken required)." \
    "Get a token: https://dashboard.ngrok.com/get-started/your-authtoken" \
    "Then run: ngrok config add-authtoken <token>" \
    "" \
    "ngrok said:${detail:+ }${detail:- (no details)}"
}

# --- ensure ngrok binary
ensure_ngrok_binary() {
  if command -v ngrok &>/dev/null; then
    return 0
  fi
  if [ "${SAVD_DEV_INSTALL_NGROK:-0}" = "1" ] && command -v brew &>/dev/null; then
    note "SAVD_DEV_INSTALL_NGROK=1: installing ngrok via Homebrew (ngrok/ngrok tap)…"
    brew install ngrok/ngrok/ngrok || die "Homebrew install of ngrok failed."
  fi
  if ! command -v ngrok &>/dev/null; then
    banner_ngrok_missing
  fi
}

# --- authtoken / config (ngrok 3+ has `ngrok config check`; else fall back to config files)
ensure_ngrok_config() {
  local out
  if out=$(ngrok config check 2>&1); then
    return 0
  fi
  if echo "$out" | grep -qEi 'unknown|unrecognized|no help|invalid choice'; then
    for f in "${HOME}/.config/ngrok/ngrok.yml" "${HOME}/.ngrok2/ngrok.yml"; do
      if [ -f "$f" ] && grep -qE '^[[:space:]]*authtoken' "$f" 2>/dev/null; then
        return 0
      fi
    done
    banner_ngrok_not_configured "Your ngrok CLI has no 'config check' and no authtoken was found in ~/.config/ngrok/ngrok.yml or ~/.ngrok2/ngrok.yml"
  else
    banner_ngrok_not_configured "$out"
  fi
}

# --- free port
ensure_port_free() {
  if command -v lsof &>/dev/null; then
    if lsof -iTCP:"$DEV_PORT" -sTCP:LISTEN -Pn &>/dev/null; then
      die \
        "Port $DEV_PORT is already in use." \
        "Stop the other process (e.g. another Next or ngrok) or set PORT=$DEV_PORT to a free port."
    fi
  fi
}

mkdir -p "$STATE_DIR"
NGROK_LOG="$STATE_DIR/ngrok.log"
NGROK_PID_FILE="$STATE_DIR/ngrok.pid"
cleanup_ngrok() {
  if [ -n "$NGROK_PID" ] && kill -0 "$NGROK_PID" 2>/dev/null; then
    note "Stopping ngrok (pid $NGROK_PID)…"
    kill "$NGROK_PID" 2>/dev/null || true
    wait "$NGROK_PID" 2>/dev/null || true
  fi
  if [ -f "$NGROK_PID_FILE" ]; then
    local p
    p=$(cat "$NGROK_PID_FILE" 2>/dev/null || true)
    if [ -n "${p:-}" ] && kill -0 "$p" 2>/dev/null; then
      kill "$p" 2>/dev/null || true
    fi
    rm -f "$NGROK_PID_FILE"
  fi
  NGROK_PID=""
}

trap 'cleanup_ngrok' EXIT

# --- public HTTPS URL from local ngrok API
fetch_ngrok_https_url() {
  local attempt u
  for ((attempt = 1; attempt <= 60; attempt++)); do
    u=$(
      python3 -c "
import json, sys, urllib.request
url = 'http://127.0.0.1:4040/api/tunnels'
try:
    r = urllib.request.urlopen(url, timeout=1)
    data = json.load(r)
except Exception:
    sys.exit(1)
for t in data.get('tunnels', []) or []:
    p = t.get('public_url') or ''
    if p.startswith('https://'):
        print(p, end='')
        sys.exit(0)
sys.exit(1)
" 2>/dev/null
    ) || true
    if [ -n "$u" ] && [[ "$u" == https://* ]]; then
      echo -n "$u"
      return 0
    fi
    sleep 1
  done
  return 1
}

# --- preflight
command -v node &>/dev/null || die "node is not on PATH (required for Next.js)."
command -v npm &>/dev/null || die "npm is not on PATH (required for Next.js)."
command -v python3 &>/dev/null || die "python3 is required to parse the ngrok local API (port 4040)."

ensure_ngrok_binary
ensure_ngrok_config
ensure_port_free

# --- start ngrok in background (so Next can bind to DEV_PORT)
if [ -f "$NGROK_PID_FILE" ]; then
  oldp=$(cat "$NGROK_PID_FILE" 2>/dev/null || true)
  if [ -n "${oldp:-}" ] && kill -0 "$oldp" 2>/dev/null; then
    warn "Stopping leftover ngrok pid $oldp (from a previous run)"
    kill "$oldp" 2>/dev/null || true
  fi
  rm -f "$NGROK_PID_FILE"
fi

: >"$NGROK_LOG"
note "Starting ngrok http $DEV_PORT → background (log: $NGROK_LOG)…"
ngrok http "$DEV_PORT" --log=stdout >>"$NGROK_LOG" 2>&1 &
NGROK_PID=$!
echo "$NGROK_PID" >"$NGROK_PID_FILE"
sleep 1
if ! kill -0 "$NGROK_PID" 2>/dev/null; then
  die "ngrok exited immediately. See: $NGROK_LOG" "Last lines: $(tail -5 "$NGROK_LOG" 2>/dev/null || true)"
fi

PUB_URL=""
if ! PUB_URL=$(fetch_ngrok_https_url); then
  cleanup_ngrok
  trap - EXIT
  die \
    "Could not read public HTTPS URL from ${NGROK_API}" \
    "Is ngrok running? See: $NGROK_LOG"
fi

# Strip trailing slash for consistency with app code
PUB_URL="${PUB_URL%/}"

export NEXT_PUBLIC_APP_URL="$PUB_URL"
export WATERMARK_CALLBACK_URL="${PUB_URL}/api/webhooks/watermark-complete"
# Dev-only safe pattern: disable React Strict Mode for this process to avoid duplicate-effect
# behavior that can stall watermark verification in local callback E2E runs.
export NEXT_DISABLE_STRICT_MODE=1

echo ""
note "Public app URL (this session): $BOLD$PUB_URL$NC"
note "WATERMARK_CALLBACK_URL=$WATERMARK_CALLBACK_URL"
note "NEXT_DISABLE_STRICT_MODE=$NEXT_DISABLE_STRICT_MODE (dev:callbacks only)"
echo ""
note "Starting Next.js (webpack) on port $DEV_PORT — not using Turbopack. Ctrl+C stops Next and ngrok."
echo ""

# Foreground Next so EXIT trap runs cleanup (do not exec away the shell)
export PORT="$DEV_PORT"
set +e
npx next dev -p "$DEV_PORT"
NEXT_EXIT=$?
set -e
note "Next.js exited (code $NEXT_EXIT)."
exit "$NEXT_EXIT"
