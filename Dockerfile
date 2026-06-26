# syntax=docker/dockerfile:1.7

# ---------- Build stage ----------
FROM node:24-alpine AS builder

WORKDIR /app

# Install deps in a separate layer for cache friendliness.
COPY package.json package-lock.json ./
# Whitelist .env.example from .dockerignore so the build never fails on a
# missing .env. Vite picks up VITE_GRAPHQL_ENDPOINT from .env at build time.
COPY .env.example .env
RUN npm ci --no-audit --no-fund

# Bring in the rest of the source. node_modules and dist are excluded by
# .dockerignore.
COPY . .

RUN npm run build

# ---------- Runtime stage ----------
FROM nginx:1.31.2 AS runtime

# Render the nginx config from the template at container start. The template
# is copied under /etc/nginx/templates/; entrypoint.sh writes the rendered
# file to /etc/nginx/conf.d/default.conf (the path the official nginx image
# includes by default).
COPY docker/nginx.conf.template /etc/nginx/templates/default.conf.template
COPY docker/entrypoint.sh       /entrypoint.sh
COPY --from=builder /app/dist   /usr/share/nginx/html

RUN chmod +x /entrypoint.sh

# Default backend — overridable at runtime with `-e BACKEND_BASE_URL=...`.
ENV BACKEND_BASE_URL=http://backend:8080

EXPOSE 80

ENTRYPOINT ["/entrypoint.sh"]
CMD ["nginx", "-g", "daemon off;"]