#!/bin/sh
# Render /etc/nginx/conf.d/default.conf from the template by substituting
# ${BACKEND_BASE_URL}, then exec the CMD (nginx -g 'daemon off;').
#
# This script intentionally uses /bin/sh (POSIX), not bash, so it works on
# debian-slim without a separate bash install.

set -eu

# Default backend when the operator does not set BACKEND_BASE_URL.
: "${BACKEND_BASE_URL:=http://backend:8080}"

echo "[entrypoint] BACKEND_BASE_URL=${BACKEND_BASE_URL}" >&2

# envsubst is shipped in the nginx official image (gettext-base).
# Limiting the substitution list to BACKEND_BASE_URL keeps every other $VAR
# in the template (e.g. $uri, $host, $scheme) intact.
# shellcheck disable=SC2016  # intentional: shell must NOT expand this — envsubst will.
envsubst '${BACKEND_BASE_URL}' \
  < /etc/nginx/templates/default.conf.template \
  > /etc/nginx/conf.d/default.conf

# Sanity check: rendered file must exist and be non-empty.
if [ ! -s /etc/nginx/conf.d/default.conf ]; then
  echo "[entrypoint] FATAL: rendered nginx config is empty" >&2
  exit 1
fi

exec "$@"
