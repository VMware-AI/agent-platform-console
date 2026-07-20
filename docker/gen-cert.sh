#!/usr/bin/env bash
# Generate a self-signed TLS cert + key for the nginx image, with SAN entries
# matching the IP or domain you pass. Output filenames (tls.crt / tls.key)
# match the SSL_CERT_PATH / SSL_KEY_PATH defaults used by docker-run-ssl.
#
# Usage:
#   docker/gen-cert.sh <ip-or-domain> [output-dir] [--force]
#
# Examples:
#   docker/gen-cert.sh console.example.com
#   docker/gen-cert.sh 192.168.1.42
#   docker/gen-cert.sh fe80::1                     # IPv6
#   docker/gen-cert.sh console.example.com /tmp/certs
#
# After generation, mount the files into the container:
#   make docker-run-ssl \
#     SSL_CERT_HOST_PATH="$PWD/docker/certs/tls.crt" \
#     SSL_KEY_HOST_PATH="$PWD/docker/certs/tls.key"
#
# Notes:
#   * Self-signed certs will not be trusted by browsers — you will get a
#     "your connection is not private" warning. Fine for dev / LAN use;
#     use a real CA-signed cert for production.
#   * For convenience, the cert is also marked valid for DNS:localhost and
#     IP:127.0.0.1, so `https://localhost` works out of the box.
#   * Override the validity period with CERT_DAYS=<n> (default 365).

set -euo pipefail

usage() {
  sed -n '2,22p' "$0" | sed 's/^# \{0,1\}//'
  exit 64
}

[ $# -ge 1 ] && [ $# -le 4 ] || usage

FORCE=0
HOST=""
OUT_DIR=""

while [ $# -gt 0 ]; do
  case "$1" in
    -f|--force) FORCE=1 ;;
    -h|--help)  usage ;;
    *)
      if [ -z "$HOST" ]; then HOST="$1"
      elif [ -z "$OUT_DIR" ]; then OUT_DIR="$1"
      else echo "ERROR: unexpected argument: $1" >&2; usage
      fi
      ;;
  esac
  shift
done

[ -n "$HOST" ] || usage

# Reject anything that isn't a plausible hostname/IP to avoid weird subject
# parsing in openssl and surprise filenames on disk.
if [[ ! "$HOST" =~ ^[A-Za-z0-9._:-]+$ ]]; then
  echo "ERROR: invalid host '$HOST' (allowed: letters, digits, '.', '-', '_', ':')" >&2
  exit 65
fi

OUT_DIR="${OUT_DIR:-$PWD/docker/certs}"
mkdir -p "$OUT_DIR"

CERT="$OUT_DIR/tls.crt"
KEY="$OUT_DIR/tls.key"

if [ -e "$CERT" ] || [ -e "$KEY" ]; then
  if [ "$FORCE" -ne 1 ]; then
    echo "ERROR: $CERT or $KEY already exist. Re-run with --force to overwrite." >&2
    exit 66
  fi
fi

# Classify as IPv4 / IPv6 / DNS and build the SAN list.
is_ipv4() { [[ "$1" =~ ^([0-9]{1,3}\.){3}[0-9]{1,3}$ ]]; }
is_ipv6() { [[ "$1" == *:* ]] && [[ ! "$1" == *.* ]]; }

SAN_PARTS=()
if is_ipv4 "$HOST" || is_ipv6 "$HOST"; then
  SAN_PARTS+=("IP:$HOST")
else
  SAN_PARTS+=("DNS:$HOST")
fi
# Convenience SANs — make the cert work for loopback access too.
SAN_PARTS+=("DNS:localhost" "IP:127.0.0.1")
SAN=$(IFS=,; echo "${SAN_PARTS[*]}")

DAYS="${CERT_DAYS:-365}"

# Validate CERT_DAYS is a positive integer.
if ! [[ "$DAYS" =~ ^[1-9][0-9]*$ ]]; then
  echo "ERROR: CERT_DAYS must be a positive integer (got: '$DAYS')" >&2
  exit 65
fi

TMPDIR_GEN="$(mktemp -d)"
trap 'rm -rf "$TMPDIR_GEN"' EXIT

cat >"$TMPDIR_GEN/openssl.cnf" <<EOF
[req]
distinguished_name = dn
req_extensions     = v3_req
prompt             = no

[dn]
CN = $HOST

[v3_req]
subjectAltName   = $SAN
keyUsage         = digitalSignature, keyEncipherment
extendedKeyUsage = serverAuth
EOF

if ! openssl req -x509 \
    -newkey rsa:2048 \
    -nodes \
    -days "$DAYS" \
    -keyout "$KEY" \
    -out "$CERT" \
    -config "$TMPDIR_GEN/openssl.cnf" \
    -extensions v3_req \
    >/dev/null 2>&1; then
  echo "ERROR: openssl failed to generate the certificate" >&2
  exit 1
fi

chmod 644 "$CERT"
chmod 600 "$KEY"

# Compute absolute paths for the next-step hint regardless of whether the
# caller passed a relative or absolute output dir.
CERT_ABS="$(cd "$(dirname "$CERT")" && pwd)/$(basename "$CERT")"
KEY_ABS="$(cd "$(dirname "$KEY")" && pwd)/$(basename "$KEY")"

cat <<EOF
✓ Self-signed certificate generated
  cert: $CERT_ABS
  key:  $KEY_ABS
  CN:   $HOST
  SAN:  $SAN
  days: $DAYS

Next — run the container with SSL:
  make docker-run-ssl \\
    SSL_CERT_HOST_PATH="$CERT_ABS" \\
    SSL_KEY_HOST_PATH="$KEY_ABS"

Browsers will show a "not trusted" warning for self-signed certs; click
through for dev / LAN use. For production, use a CA-signed certificate
instead (e.g. via Let's Encrypt / certbot).
EOF
