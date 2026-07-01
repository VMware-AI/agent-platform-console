#!/usr/bin/env bash
# ----------------------------------------------------------------------------
# start_console_local.sh — bootstrap the agent-platform-console for local dev.
#
# Prereqs (checked at startup, with clear errors):
#   1. Node.js >= 24  (matches package.json `engines.node`; 24 LTS is Krypton)
#   2. npm            (ships with Node)
#   3. .env file      (copied from .env.example on first run)
#   4. node_modules   (auto-installed via `npm ci` on first run)
#
# Backend (optional but recommended):
#   The console talks to the backend through the Vite dev proxy at /query.
#   The proxy target is the BACKEND_BASE_URL env var. Defaults to
#   http://127.0.0.1:8080. Override with --backend <url> if your backend runs
#   on another host/port. The script will ping it and warn (but not fail) if
#   it is unreachable — the dev server itself starts either way.
#
# Usage:
#   ./deploy/start_console_local.sh
#   ./deploy/start_console_local.sh --backend http://10.0.0.5:8080
#   ./deploy/start_console_local.sh --port 5173
#   BACKEND_BASE_URL=http://10.0.0.5:8080 ./deploy/start_console_local.sh
#
# After it starts, open the URL it prints (default http://localhost:5173).
# Stop with Ctrl-C; the script cleans up its own child processes.
# ----------------------------------------------------------------------------
set -euo pipefail

# ---- args ------------------------------------------------------------------
BACKEND="${BACKEND_BASE_URL:-http://127.0.0.1:8080}"
PORT=5173
while [[ $# -gt 0 ]]; do
  case "$1" in
    --backend) BACKEND="$2"; shift 2 ;;
    --port)    PORT="$2";    shift 2 ;;
    -h|--help)
      sed -n '2,30p' "$0"; exit 0 ;;
    *)
      echo "Unknown arg: $1 (use --help)" >&2; exit 2 ;;
  esac
done

# ---- repo root (one level up from deploy/) ---------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

log() { printf '\033[1;36m[start_console_local]\033[0m %s\n' "$*"; }
err() { printf '\033[1;31m[start_console_local]\033[0m %s\n' "$*" >&2; }
die() { err "$*"; exit 1; }

# ---- prereq 1: node --------------------------------------------------------
log "checking node version"
if ! command -v node >/dev/null 2>&1; then
  die "node is not installed. Install Node 24 LTS (https://nodejs.org)."
fi
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if [[ "$NODE_MAJOR" -lt 24 ]]; then
  die "node $NODE_MAJOR.x is installed; need >= 24 (LTS). Update Node first."
fi
log "node $(node -v) OK"

# ---- prereq 2: npm ---------------------------------------------------------
command -v npm >/dev/null 2>&1 || die "npm is not installed (ships with Node)."
log "npm $(npm -v) OK"

# ---- prereq 3: node_modules -----------------------------------------------
if [[ ! -d node_modules ]]; then
  log "node_modules missing — running npm ci (first-run install)"
  NPM_REGISTRY=https://registry.npmmirror.com
  npm ci --no-audit --no-fund --registry=${NPM_REGISTRY}
else
  log "node_modules present"
fi

# ---- backend reachability (warn, don't fail) -------------------------------
log "checking backend reachability at $BACKEND (informational)"
if command -v curl >/dev/null 2>&1; then
  if curl --silent --fail --max-time 3 -o /dev/null "$BACKEND"; then
    log "backend reachable"
  else
    err "WARNING: backend at $BACKEND is not reachable."
    err "  The dev server will still start, but /query requests will 502 until"
    err "  the backend comes up. Re-run with --backend <url> to point elsewhere."
  fi
else
  log "curl not available — skipping backend reachability check"
fi

# ---- port-in-use check (mac + linux) ---------------------------------------
# Probe in priority order: lsof (mac default + most linux), ss (modern linux),
# netstat (legacy linux). Fails loudly if the port is busy so we never end up
# with vite silently falling back to another port — that race has bitten us.
check_port_free() {
  local port="$1"
  if command -v lsof >/dev/null 2>&1; then
    lsof -iTCP:"$port" -sTCP:LISTEN -P -n >/dev/null 2>&1 && return 1
  elif command -v ss >/dev/null 2>&1; then
    ss -ltn "sport = :$port" -H 2>/dev/null | grep -q . && return 1
  elif command -v netstat >/dev/null 2>&1; then
    netstat -ltn 2>/dev/null | awk '{print $4}' | grep -E "(^|:)${port}$" >/dev/null && return 1
  else
    die "no port-detection tool found (need one of: lsof, ss, netstat)."
  fi
  return 0
}

log "checking port $PORT is free"
if ! check_port_free "$PORT"; then
  die "port $PORT is already in use. Free it (lsof -i :$PORT) or run with --port <other>."
fi

# ---- launch ---------------------------------------------------------------
# Run via `npm run dev` (not `npx vite`) so local debuggers / IDEs can attach
# to the npm-spawned process by name, and so future script-side env tweaks
# (e.g. cross-env, tsx) flow through npm's own script handling.
#
# --strictPort tells vite to fail loudly if the chosen port can't be bound
# (instead of silently picking the next free one). The pre-check above should
# make this a no-op, but it guards against a TOCTOU race where something else
# grabs the port between the check and vite's listen().
log "starting vite dev server on port $PORT (strict), proxying /query -> $BACKEND"
log "open the printed URL in your browser; Ctrl-C to stop."
exec env BACKEND_BASE_URL="$BACKEND" npm run dev -- --host 0.0.0.0 --port "$PORT" --strictPort
