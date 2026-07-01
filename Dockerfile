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

EXPOSE 80

ENTRYPOINT ["/entrypoint.sh"]
CMD ["nginx", "-g", "daemon off;"]