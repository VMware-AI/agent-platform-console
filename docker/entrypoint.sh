#!/bin/sh
# Render /etc/nginx/conf.d/default.conf from the template by substituting
# ${BACKEND_BASE_URL} (and, when TLS is enabled, ${SSL_LISTEN}/${SSL_CERTS}),
# then exec the CMD (nginx -g 'daemon off;').
#
# This script intentionally uses /bin/sh (POSIX), not bash, so it works on
# debian-slim without a separate bash install.

set -eu

# Default backend when the operator does not set BACKEND_BASE_URL.
: "${BACKEND_BASE_URL:=http://backend:8080}"

# ---------------------------------------------------------------------------
# Optional TLS/SSL — gated by SSL_ENABLE.
#
# SSL_ENABLE controls whether TLS is on. Default is "false" → container serves
# plain HTTP on :80 (the historical default). To turn TLS on you MUST set:
#
#   -e SSL_ENABLE=true \
#   -e SSL_CERT_PATH=/etc/nginx/ssl/tls.crt \
#   -e SSL_KEY_PATH=/etc/nginx/ssl/tls.key
# (and mount the cert/key files in, e.g. -v /host/certs:/etc/nginx/ssl:ro).
#
# When SSL_ENABLE=true:
#   - Both SSL_CERT_PATH and SSL_KEY_PATH are required and must point to real
#     files; otherwise the entrypoint exits with a FATAL error.
#   - nginx additionally listens on 443 with the given cert/key.
#   - nginx also 301-redirects plain HTTP (:80) to HTTPS (https://$host$uri)
#     so callers landing on the HTTP URL are upgraded transparently.
#     Disable the redirect with -e SSL_REDIRECT=false (useful when a
#     TLS-terminating reverse proxy in front of this container expects plain
#     HTTP on :80).
#
# When SSL_ENABLE is unset / "false" / anything else:
#   - Cert/key env vars (if any) are IGNORED — the container just serves
#     plain HTTP on :80, identical to behaviour before SSL was added.
# ---------------------------------------------------------------------------
: "${SSL_ENABLE:=false}"
: "${SSL_CERT_PATH:=}"
: "${SSL_KEY_PATH:=}"
: "${SSL_REDIRECT:=true}"

SSL_LISTEN=""
SSL_CERTS=""
HTTP_REDIRECT=""

if [ "${SSL_ENABLE}" = "true" ]; then
  # SSL_ENABLE=true: cert + key are mandatory.
  if [ -z "${SSL_CERT_PATH}" ] || [ -z "${SSL_KEY_PATH}" ]; then
    echo "[entrypoint] FATAL: SSL_ENABLE=true requires BOTH SSL_CERT_PATH and SSL_KEY_PATH" >&2
    exit 1
  fi
  if [ ! -f "${SSL_CERT_PATH}" ]; then
    echo "[entrypoint] FATAL: certificate not found: ${SSL_CERT_PATH}" >&2
    exit 1
  fi
  if [ ! -f "${SSL_KEY_PATH}" ]; then
    echo "[entrypoint] FATAL: private key not found: ${SSL_KEY_PATH}" >&2
    exit 1
  fi

  SSL_LISTEN="listen       443 ssl;
    listen       [::]:443 ssl;"
  SSL_CERTS="ssl_certificate     ${SSL_CERT_PATH};
    ssl_certificate_key ${SSL_KEY_PATH};
    ssl_protocols       TLSv1.2 TLSv1.3;
    ssl_ciphers         HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;
    ssl_session_cache   shared:SSL:10m;
    ssl_session_timeout 10m;"

  if [ "${SSL_REDIRECT}" = "true" ]; then
    # Wrap in an if so it only fires for plain-HTTP requests. Without the if,
    # `return` at server-block level would also catch traffic arriving on :443
    # and the HTTPS listener would 301 to itself -> infinite redirect loop.
    HTTP_REDIRECT="if (\$scheme != \"https\") { return 301 https://\$host\$request_uri; }"
    echo "[entrypoint] SSL enabled (HTTP -> HTTPS redirect ON): cert=${SSL_CERT_PATH} key=${SSL_KEY_PATH}" >&2
  else
    echo "[entrypoint] SSL enabled (HTTP -> HTTPS redirect OFF): cert=${SSL_CERT_PATH} key=${SSL_KEY_PATH}" >&2
  fi
else
  # SSL_ENABLE != true: serve plain HTTP. Warn if cert paths were set so the
  # operator notices they were ignored.
  if [ -n "${SSL_CERT_PATH}" ] || [ -n "${SSL_KEY_PATH}" ]; then
    echo "[entrypoint] NOTE: SSL_CERT_PATH/SSL_KEY_PATH are set but SSL_ENABLE!=true; ignoring cert paths, HTTP only on :80" >&2
  fi
  echo "[entrypoint] SSL disabled (HTTP only on :80)" >&2
fi

export SSL_LISTEN SSL_CERTS HTTP_REDIRECT

echo "[entrypoint] BACKEND_BASE_URL=${BACKEND_BASE_URL}" >&2

# envsubst is shipped in the nginx official image (gettext-base).
# Limiting the substitution list keeps every other $VAR in the template
# (e.g. $uri, $host, $scheme) intact. The SSL/HTTP_REDIRECT tokens render
# to empty strings when their feature is disabled, leaving the HTTP-only
# config unchanged.
# shellcheck disable=SC2016  # intentional: shell must NOT expand these — envsubst will.
envsubst '${BACKEND_BASE_URL} ${SSL_LISTEN} ${SSL_CERTS} ${HTTP_REDIRECT}' \
  < /etc/nginx/templates/default.conf.template \
  > /etc/nginx/conf.d/default.conf

# Sanity check: rendered file must exist and be non-empty.
if [ ! -s /etc/nginx/conf.d/default.conf ]; then
  echo "[entrypoint] FATAL: rendered nginx config is empty" >&2
  exit 1
fi

exec "$@"
