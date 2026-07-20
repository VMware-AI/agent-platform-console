# syntax=docker/dockerfile:1.7

# ---------- Build stage ----------
FROM quay.io/vmware-ai/node:24-alpine AS builder

WORKDIR /app

# Install deps in a separate layer for cache friendliness.
COPY package.json package-lock.json ./

# NPM_REGISTRY defaults to the official npm registry. CI/cron in regions with
# flaky access to registry.npmjs.org can override it via
# `--build-arg NPM_REGISTRY=https://registry.npmmirror.com`.
ARG NPM_REGISTRY=https://registry.npmmirror.com
RUN npm ci --no-audit --no-fund --registry=${NPM_REGISTRY}

# Bring in the rest of the source. node_modules and dist are excluded by
# .dockerignore.
COPY . .

RUN npm run build:prod

# ---------- Runtime stage ----------
FROM quay.io/vmware-ai/nginx:1.31.2 AS runtime

# Render the nginx config from the template at container start. The template
# is copied under /etc/nginx/templates/; entrypoint.sh writes the rendered
# file to /etc/nginx/conf.d/default.conf (the path the official nginx image
# includes by default).
COPY docker/nginx.conf.template /etc/nginx/templates/default.conf.template
COPY docker/entrypoint.sh       /entrypoint.sh
COPY --from=builder /app/dist   /usr/share/nginx/html

RUN chmod +x /entrypoint.sh

# Default backend — overridable at runtime with `-e BACKEND_BASE_URL=...`.
ENV BACKEND_BASE_URL=http://agent-platform-backend:8080

# Optional TLS — when SSL_ENABLE=true is set at run time AND both
# SSL_CERT_PATH / SSL_KEY_PATH are set, /entrypoint.sh enables a 443 ssl
# listener using these paths and 301-redirects :80 -> :443. Default is
# plain HTTP on :80 (matches the historical behaviour of this image).
#
#   docker run ... \
#     -e SSL_ENABLE=true \
#     -e SSL_CERT_PATH=/etc/nginx/ssl/tls.crt \
#     -e SSL_KEY_PATH=/etc/nginx/ssl/tls.key \
#     -v /host/certs:/etc/nginx/ssl:ro
#
# Pass `-e SSL_REDIRECT=false` to keep :80 serving normally (useful when
# a TLS-terminating reverse proxy in front of this container expects HTTP).
ENV SSL_ENABLE=false
ENV SSL_CERT_PATH=
ENV SSL_KEY_PATH=
ENV SSL_REDIRECT=true

EXPOSE 80 443

ENTRYPOINT ["/entrypoint.sh"]
CMD ["nginx", "-g", "daemon off;"]