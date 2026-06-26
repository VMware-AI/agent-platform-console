#!/usr/bin/env bash
# ----------------------------------------------------------------------------
# start_console_docker.sh — bootstrap the agent-platform-console from the
# published container image.
#
# Unlike start_console_local.sh (which runs the Vite dev server against local
# source), this script pulls and runs the published frontend image:
#   quay.io/vmware-ai/agent-platform-console:latest
#
# Prereqs (checked at startup, with clear errors):
#   1. docker CLI    (https://docs.docker.com/get-docker/)
#   2. docker daemon reachable (`docker info`)
#   3. quay.io reachability (the image is always pulled first so :latest is
#      guaranteed to match what the registry serves right now)
#   4. host port free (default 80; `--port` to override)
#   5. container name free (default agent-platform-console; `--name` to
#      override; if a container with that name is already running, it is
#      stopped and removed first)
#   6. BACKEND_BASE_URL set and not 127.0.0.1 — inside the container that
#      address points to the container itself, not the host running Docker.
#
# Backend reachability is WARNED, not enforced — the container starts either
# way so the operator can debug a missing backend without first fixing it.
#
# Usage:
#   ./deploy/start_console_docker.sh
#   ./deploy/start_console_docker.sh --backend http://192.168.1.10:8080
#   ./deploy/start_console_docker.sh --port 8080
#   ./deploy/start_console_docker.sh --name my-console
#   ./deploy/start_console_docker.sh --image quay.io/vmware-ai/agent-platform-console:latest
#   BACKEND_BASE_URL=http://192.168.1.10:8080 ./deploy/start_console_docker.sh
#
# After it starts, open the URL it prints (default http://localhost:<port>).
# Stop with Ctrl-C; the script traps SIGINT/SIGTERM and stops the container.
# ----------------------------------------------------------------------------
set -euo pipefail

# ---- args ------------------------------------------------------------------
# BACKEND_BASE_URL must be set by the operator. We do NOT default to
# 127.0.0.1:8080 — inside the container that address points to the container
# itself, not the host running Docker, so the reverse proxy would 502.
BACKEND="${BACKEND_BASE_URL:-}"
PORT=80
NAME="agent-platform-console"
IMAGE="quay.io/vmware-ai/agent-platform-console:latest"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --backend) BACKEND="$2"; shift 2 ;;
    --port)    PORT="$2";    shift 2 ;;
    --name)    NAME="$2";    shift 2 ;;
    --image)   IMAGE="$2";   shift 2 ;;
    -h|--help)
      sed -n '2,34p' "$0"; exit 0 ;;
    *)
      printf '\033[1;31m[start_console_docker]\033[0m unknown arg: %s (use --help)\n' "$1" >&2
      exit 2 ;;
  esac
done

# ---- logging helpers -------------------------------------------------------
log()  { printf '\033[1;36m[start_console_docker]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[start_console_docker] WARNING:\033[0m %s\n' "$*" >&2; }
err()  { printf '\033[1;31m[start_console_docker]\033[0m %s\n' "$*" >&2; }
die()  { err "$*"; exit 1; }

# ---- prereq 0: BACKEND_BASE_URL must be set and not loopback ----------------
# Inside the container nginx proxies /query to BACKEND_BASE_URL. 127.0.0.1
# inside the container is the container itself, not the host — so the proxy
# would 502 silently. Reject early with the right way to point at the host.
if [[ -z "$BACKEND" ]]; then
  die "BACKEND_BASE_URL is not set. Examples:
  ./deploy/start_console_docker.sh --backend http://192.168.1.10:8080
  BACKEND_BASE_URL=http://192.168.1.10:8080 ./deploy/start_console_docker.sh"
fi

# Strip scheme and port, keep just the host. Handles both
# `http://host:port` and `http://[ipv6]:port`. macOS BSD sed bracket
# classes are flaky, so we use awk instead.
_backend_host="$(printf '%s' "$BACKEND" | awk '
  {
    s = $0
    sub(/^https?:\/\//, "", s)
    if (s ~ /^\[/) {
      sub(/^\[/, "", s)
      p = index(s, "]")
      s = substr(s, 1, p - 1)
    } else {
      p = index(s, ":"); if (p > 0) s = substr(s, 1, p - 1)
      p = index(s, "/"); if (p > 0) s = substr(s, 1, p - 1)
    }
    print s
  }
')"
case "$(printf '%s' "$_backend_host" | tr '[:upper:]' '[:lower:]')" in
  localhost|127.*|::1|0.0.0.0)
    die "BACKEND_BASE_URL=$BACKEND points to the container itself, not the host.
  Pick a URL the container can actually reach, e.g.:
    ./deploy/start_console_docker.sh --backend http://192.168.1.10:8080   
    BACKEND_BASE_URL=http://192.168.1.10:8080 ./deploy/start_console_docker.sh   "
    ;;
esac

# ---- prereq 1: docker CLI --------------------------------------------------
log "checking docker CLI"
command -v docker >/dev/null 2>&1 \
  || die "docker CLI not found. Install Docker: https://docs.docker.com/get-docker/"

DOCKER_VERSION="$(docker --version)"
log "$DOCKER_VERSION"

# ---- prereq 2: docker daemon -----------------------------------------------
log "checking docker daemon"
if ! docker info >/dev/null 2>&1; then
  die "docker daemon is not reachable. Start it (e.g. 'sudo systemctl start docker' or open Docker Desktop) and retry."
fi
log "docker daemon reachable"

# ---- arg sanity: port must be an integer 1-65535 ---------------------------
if ! [[ "$PORT" =~ ^[0-9]+$ ]] || [[ "$PORT" -lt 1 ]] || [[ "$PORT" -gt 65535 ]]; then
  die "--port must be an integer in 1..65535 (got: $PORT)"
fi

# ---- arg sanity: container name must be non-empty and DNS-safe-ish ----------
if [[ -z "$NAME" ]] || ! [[ "$NAME" =~ ^[A-Za-z0-9][A-Za-z0-9_.-]*$ ]]; then
  die "--name must match ^[A-Za-z0-9][A-Za-z0-9_.-]*$ (got: $NAME)"
fi

# ---- arg sanity: BACKEND_BASE_URL format -----------------------------------
if ! [[ "$BACKEND" =~ ^https?://[^[:space:]]+$ ]]; then
  die "BACKEND_BASE_URL must match ^https?://[^[:space:]]+\$ (got: $BACKEND). Hint: --backend http://host:port"
fi

# ---- prereq 3: always pull the image first ---------------------------------
# Pulling every time keeps :latest honest and gives a clean failure message if
# quay.io creds are missing or the registry is unreachable from this host.
log "pulling $IMAGE (always — keeps :latest honest)"
if ! docker pull "$IMAGE"; then
  die "docker pull $IMAGE failed. Check network access to quay.io and that you are logged in:  docker login quay.io"
fi

# ---- prereq 4: host port must be free --------------------------------------
# Probe in priority order: lsof (mac default + most linux), ss (modern linux),
# netstat (legacy linux). Fails loudly so we never end up with docker silently
# binding a different host port.
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

log "checking host port $PORT is free"
if ! check_port_free "$PORT"; then
  die "port $PORT is already in use on the host. Free it (lsof -i :$PORT) or run with --port <other>."
fi

# ---- prereq 5: container name free — stop+rm any stale instance ------------
# `docker run --name X` fails outright if X exists. Operators expect "just
# start it", so clean up automatically.
log "checking container name $NAME"
if docker ps -a --format '{{.Names}}' | grep -Fxq "$NAME"; then
  log "container $NAME exists — stopping and removing"
  docker stop "$NAME" >/dev/null 2>&1 || true
  docker rm   "$NAME" >/dev/null 2>&1 || true
fi

# ---- backend reachability (warn, don't fail) -------------------------------
log "checking backend reachability at $BACKEND (informational)"
if command -v curl >/dev/null 2>&1; then
  if curl --silent --fail --max-time 3 -o /dev/null "$BACKEND"; then
    log "backend reachable"
  else
    warn "backend at $BACKEND is not reachable."
    warn "  The container will still start, but /query requests will 502 in"
    warn "  the browser until the backend comes up. Re-run with --backend <url>"
    warn "  to point elsewhere."
  fi
else
  log "curl not available — skipping backend reachability check"
fi

# ---- trap: stop the container on Ctrl-C ------------------------------------
cleanup() {
  # Only stop if WE started it — `docker ps` filters to running containers.
  if docker ps --format '{{.Names}}' | grep -Fxq "$NAME" 2>/dev/null; then
    log "SIGINT/SIGTERM received — stopping container $NAME"
    docker stop "$NAME" >/dev/null 2>&1 || true
  fi
  exit 130
}
trap cleanup INT TERM

# ---- launch ----------------------------------------------------------------
# `docker run --rm` + foreground (no -d) means the container's PID is the
# child of this shell, so Ctrl-C reaches the right process directly AND the
# --rm makes docker reap the container even if the trap doesn't fire.
log "starting $IMAGE on host port $PORT -> container port 80, /query -> $BACKEND"
log "open http://localhost:$PORT in your browser; Ctrl-C to stop."
docker run --rm \
  -d \
  --name "$NAME" \
  -p "$PORT":80 \
  -e "BACKEND_BASE_URL=$BACKEND" \
  "$IMAGE"