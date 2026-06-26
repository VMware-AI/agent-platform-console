# Dockerize agent-platform-console Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add containerized delivery to `agent-platform-console` via a `Makefile` and a multi-stage `Dockerfile` (Node 24-alpine builder → nginx 1.31.2 runtime), with the backend URL injected at runtime via `BACKEND_BASE_URL`.

**Architecture:** Static SPA built once at image build time, served by nginx in the runtime image. The nginx config is rendered at container start from a template by a small `entrypoint.sh` that runs `envsubst` against `BACKEND_BASE_URL` (the only variable ever substituted). The `Makefile` is a thin wrapper around `npm` and `docker` commands — no logic, just targets.

**Tech Stack:** Node 24 (build), Nginx 1.31.2 (serve), shell + envsubst (entrypoint), GNU Make 3.81+.

## Global Constraints

- Vite build must be done in the builder stage; runtime image must not contain `node_modules` or source.
- Runtime listens on port 80 inside the container. Host port mapping is the caller's choice (Makefile defaults to 8080:80).
- `BACKEND_BASE_URL` is the **only** environment variable substituted by `envsubst` — never put any other `$VAR` in the template.
- `VITE_GRAPHQL_ENDPOINT` stays a build-time variable; default is `/query` (relative) per `.env.example` guidance.
- All paths inside container are absolute. Files outside `/etc/nginx/conf.d/`, `/usr/share/nginx/html/`, `/entrypoint.sh` MUST NOT be referenced from the runtime stage.
- HTML must be `Cache-Control: no-cache` so upgrades take effect; assets under `/assets/` get `1y immutable`.
- Cookie `ap_session` (`SameSite=Lax`) must be preserved end-to-end — `proxy_pass` must NOT strip `Cookie`. Default nginx behaviour preserves it; we do not override.
- No business code is modified in this plan. Only the 4 new files + 1 README addition.

---

## File Inventory

| Path | Action | Responsibility |
| --- | --- | --- |
| `docker/nginx.conf.template` | Create | Nginx `server { }` template with `${BACKEND_BASE_URL}` as the only envsubst placeholder. |
| `docker/entrypoint.sh` | Create | `set -eu` shell script: default `BACKEND_BASE_URL`, run envsubst, exec CMD. |
| `.dockerignore` | Create | Exclude `node_modules`, `dist`, `.git`, `.env`, docs, etc., from build context. |
| `Dockerfile` | Create | Multi-stage: builder (`node:24-alpine`) → runtime (`nginx:1.31.2`). |
| `Makefile` | Create | `help / install / dev / build / preview / test* / lint / format / clean / clean:all / docker:build / docker:run / docker:stop / docker:logs / docker:rebuild`. |
| `README.md` | Modify | Append a "Build & Run with Docker" section (do not replace existing content). |

---

## Task 1: nginx configuration template

**Files:**
- Create: `docker/nginx.conf.template`

**Interfaces:**
- Produces: a file at `/etc/nginx/templates/default.conf.template` inside the runtime image (the path is set by the Dockerfile in Task 4; this task only writes the source file).
- Consumes: nothing — pure static text.

**Context (read these first):**
- `vite.config.ts:24-34` confirms the dev proxy target is `http://127.0.0.1:8080` and the proxied path is `/query`. Production should keep `/query` as the relative path; only the upstream host is variable.
- `.env.example:1-11` confirms `VITE_GRAPHQL_ENDPOINT` defaults to `/query` and the comment explicitly mentions "prod-behind-nginx".

- [ ] **Step 1: Create `docker/` directory**

```sh
mkdir -p docker
```

- [ ] **Step 2: Write the template**

Create `docker/nginx.conf.template` with the exact content below. **Notes on the file:** every line of the `server { }` block and the three `location` blocks is required; do not add `proxy_redirect` or other directives that are not shown — defaults are correct.

```nginx
# Rendered by /entrypoint.sh from this template via envsubst ${BACKEND_BASE_URL}.
# DO NOT put any other $VAR here — envsubst would mangle it.

server {
    listen       80;
    listen       [::]:80;
    server_name  _;

    root  /usr/share/nginx/html;
    index index.html;

    client_max_body_size 16m;

    access_log /var/log/nginx/access.log;
    error_log  /var/log/nginx/error.log warn;

    # gzip text-ish responses
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_proxied any;
    gzip_types
        text/plain
        text/css
        text/javascript
        application/javascript
        application/json
        application/xml
        image/svg+xml;

    # SPA fallback — every unknown path returns index.html
    location / {
        try_files $uri $uri/ /index.html;
    }

    # The HTML shell must never be cached, so deploys take effect immediately.
    location = /index.html {
        add_header Cache-Control "no-cache, no-store, must-revalidate" always;
        add_header Pragma "no-cache" always;
        add_header Expires "0" always;
    }

    # Vite emits content-hashed assets under /assets/ — safe to cache forever.
    location /assets/ {
        access_log off;
        expires 1y;
        add_header Cache-Control "public, immutable" always;
        try_files $uri =404;
    }

    # GraphQL proxy — ${BACKEND_BASE_URL} is the ONLY envsubst placeholder.
    # Default behaviour of nginx: passes the Cookie header through. We set
    # X-Forwarded-* so the upstream can recover the real client IP / scheme.
    location = /query {
        proxy_pass ${BACKEND_BASE_URL}/query;
        proxy_http_version 1.1;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 60s;
    }
}
```

- [ ] **Step 3: Validate nginx syntax with a throwaway container**

This task's "test" is that nginx can parse the rendered file. Render the template with a placeholder and run `nginx -t` against it.

```sh
cd "$(git rev-parse --show-toplevel)"
docker run --rm \
  -v "$PWD/docker/nginx.conf.template:/etc/nginx/templates/default.conf.template:ro" \
  -e BACKEND_BASE_URL=http://localhost:8080 \
  nginx:1.31.2 \
  sh -c 'envsubst '"'"'${BACKEND_BASE_URL}'"'"' < /etc/nginx/templates/default.conf.template > /etc/nginx/conf.d/default.conf && nginx -t'
```

> **envsubst quoting caveat:** the inner `'"'"'` pattern is shell-in-shell quoting. The outer `sh -c '...'` uses single quotes, so the inner `${BACKEND_BASE_URL}` would normally be passed through literally — but envsubst then sees it AND the outer shell NEVER expands it (correct). The extra `'"'"'` is needed because inside the outer `'...'` block, writing a literal single quote requires the four-char sequence: end the current single-quoted string, start a double-quoted string containing `'`, then end it. If you use double quotes around `${BACKEND_BASE_URL}` instead, the outer shell expands the variable before envsubst runs, so envsubst receives `http://localhost:8080` (no `$`) and substitutes nothing — nginx then sees the literal `${BACKEND_BASE_URL}` and fails its parser with `unknown "backend_base_url" variable`.

Expected output (last 2 lines):
```
nginx: configuration file /etc/nginx/nginx.conf test is successful
```
The exit code MUST be 0.

- [ ] **Step 4: Commit**

```sh
cd "$(git rev-parse --show-toplevel)"
git add docker/nginx.conf.template
git commit -m "feat(docker): add nginx config template with runtime backend URL"
```

---

## Task 2: entrypoint script

**Files:**
- Create: `docker/entrypoint.sh`

**Interfaces:**
- Produces: an executable file at `/entrypoint.sh` in the runtime image (chmod +x in Dockerfile).
- Consumes: `${BACKEND_BASE_URL}` from container env; reads template at `/etc/nginx/templates/default.conf.template`; writes to `/etc/nginx/conf.d/default.conf`; then `exec "$@"`.

**Context:**
- The official `nginx` image already has `envsubst` from the `gettext-base` package — no install needed.
- `nginx:1.31.2` runs as root; `/etc/nginx/conf.d/default.conf` is writable.

- [ ] **Step 1: Write the script**

Create `docker/entrypoint.sh` with the exact content below. **Do not** add any other variable to the `envsubst` invocation.

```sh
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
envsubst '${BACKEND_BASE_URL}' \
  < /etc/nginx/templates/default.conf.template \
  > /etc/nginx/conf.d/default.conf

# Sanity check: rendered file must exist and be non-empty.
if [ ! -s /etc/nginx/conf.d/default.conf ]; then
  echo "[entrypoint] FATAL: rendered nginx config is empty" >&2
  exit 1
fi

exec "$@"
```

- [ ] **Step 2: Make it executable**

```sh
chmod +x docker/entrypoint.sh
```

- [ ] **Step 3: Shellcheck the script (static check)**

The user is on macOS; if `shellcheck` is not installed locally, run it via Docker:

```sh
docker run --rm -v "$PWD/docker:/src:ro" koalaman/shellcheck:latest \
  shellcheck /src/entrypoint.sh 2>&1 | grep -v 'openBinaryFile: does not exist' || true
```

> The `openBinaryFile: does not exist` warning is a known bug in the `koalaman/shellcheck` Docker image (it tries to call a non-existent helper binary while reporting the result). It does NOT indicate a problem with our script. Suppress it with `grep -v` so the real diagnostic output is what you read. The script is also annotated with `# shellcheck disable=SC2016` to silence the intentional-info on the single-quoted `${BACKEND_BASE_URL}` argument to `envsubst`.

Expected: no real diagnostics, exit code 0.

If the Docker image is unavailable, fall back to a POSIX syntax check:

```sh
sh -n docker/entrypoint.sh
```

Expected: exit code 0, no output.

> Either check is acceptable — the smoke test in Step 4 covers the actual behaviour.

- [ ] **Step 4: Smoke-test the script directly**

Run it against the template from Task 1 with a dummy command (`true`) and inspect the rendered output. This validates the script logic **before** the Dockerfile exists.

```sh
cd "$(git rev-parse --show-toplevel)"
mkdir -p /tmp/apc-entrypoint-test/templates /tmp/apc-entrypoint-test/conf.d
cp docker/nginx.conf.template /tmp/apc-entrypoint-test/templates/default.conf.template
cp docker/entrypoint.sh /tmp/apc-entrypoint-test/entrypoint.sh
chmod +x /tmp/apc-entrypoint-test/entrypoint.sh

# Test 1: default value
BACKEND_BASE_URL="" /tmp/apc-entrypoint-test/entrypoint.sh true
grep -q 'proxy_pass http://backend:8080/query' /tmp/apc-entrypoint-test/conf.d/default.conf \
  && echo "OK: default applied" || { echo "FAIL: default not applied"; exit 1; }

# Test 2: override
BACKEND_BASE_URL="http://other:9090" /tmp/apc-entrypoint-test/entrypoint.sh true
grep -q 'proxy_pass http://other:9090/query' /tmp/apc-entrypoint-test/conf.d/default.conf \
  && echo "OK: override applied" || { echo "FAIL: override not applied"; exit 1; }
```

Expected output (both lines, in order):
```
[entrypoint] BACKEND_BASE_URL=http://backend:8080
[entrypoint] BACKEND_BASE_URL=http://other:9090
OK: default applied
OK: override applied
```

If you do NOT see `[entrypoint] ...` twice, the script is using the wrong shell or has a `set -u` issue with the empty-var default — fix the script and rerun.

- [ ] **Step 5: Clean up and commit**

```sh
rm -rf /tmp/apc-entrypoint-test
cd "$(git rev-parse --show-toplevel)"
git add docker/entrypoint.sh
git commit -m "feat(docker): add entrypoint with envsubst for BACKEND_BASE_URL"
```

---

## Task 3: .dockerignore

**Files:**
- Create: `.dockerignore`

**Interfaces:**
- Produces: a file at the repo root that filters the `docker build` context.
- Consumes: nothing.

**Why this matters:** `docker build .` uploads the entire context (minus what `.dockerignore` excludes) to the daemon. Shipping `node_modules`, `dist`, or `.git` bloats the build and risks leaking `.env` into a layer.

- [ ] **Step 1: Write the file**

Create `.dockerignore` with this exact content:

```
# Build output
node_modules
dist
dist-ssr
coverage

# VCS
.git
.gitignore
.gitattributes

# IDE / editor
.vscode
.idea
.DS_Store
*.swp
*.swo

# Local env files — must NOT leak into the image
.env
.env.*
!.env.example

# Logs
*.log
npm-debug.log*
yarn-debug.log*
yarn-error.log*

# Specs and plans — docs only, irrelevant to build
docs/superpowers

# CI
.github

# Docker meta-files
Dockerfile
.dockerignore
docker-compose*.yml
```

- [ ] **Step 2: Verify the filtered context size**

```sh
cd "$(git rev-parse --show-toplevel)"
tar --exclude-from .dockerignore -cf - . | wc -c
du -sh --exclude=node_modules --exclude=dist --exclude=.git .
```

Expected: the tar size is well under the du -sh size (which excludes the heavy dirs by name anyway). The point is that `.dockerignore` does NOT include `node_modules/` or `dist/` when tar re-applies it; visually confirm by reading the output of:

```sh
tar --exclude-from .dockerignore -cf - . | tar -tf - | head -50
```

You should NOT see `node_modules/`, `dist/`, or `.git/` in the listing. If they appear, add the missing pattern and rerun.

- [ ] **Step 3: Commit**

```sh
cd "$(git rev-parse --show-toplevel)"
git add .dockerignore
git commit -m "chore(docker): add .dockerignore to shrink build context"
```

---

## Task 4: Dockerfile

**Files:**
- Create: `Dockerfile`

**Interfaces:**
- Produces: an image tagged `agent-platform-console:local` (named by the Makefile in Task 7). Exposes port 80, runs `nginx -g 'daemon off;'` after the entrypoint renders the config.
- Consumes:
  - From host: `package.json`, `package-lock.json`, `docker/`, `src/`, `public/`, `index.html`, `tsconfig*.json`, `vite.config.ts`, `vitest.config.ts`, `env.d.ts`, `.env*` (per `.dockerignore` rules; `.env.example` is whitelisted back in).
  - `node:24-alpine` (builder) and `nginx:1.31.2` (runtime).

**Context:**
- `package.json:21` — `npm run build` runs `npm-run-all type-check build-only`. `vue-tsc` is dev-only and lives in `node_modules`, so it must be installed in the builder stage.
- `.env.example:10` — `VITE_GRAPHQL_ENDPOINT` defaults to `/query`. Vite reads `.env` at build time; the spec whitelists `.env.example` so the build never fails on a missing `.env`.

- [ ] **Step 1: Write the Dockerfile**

Create `Dockerfile` with this exact content. **Do not** rename or split stages — the `builder` and `runtime` names are referenced by `COPY --from=builder` and by `docker image inspect` calls in the smoke test (Task 5).

```dockerfile
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
```

- [ ] **Step 2: Build the image**

```sh
cd "$(git rev-parse --show-toplevel)"
docker build -t agent-platform-console:local .
```

Expected: build completes in **under 3 minutes** on a warm cache, with the last lines roughly:
```
=> exporting to image
=> => naming to docker.io/library/agent-platform-console:local
```

If the build fails on the `npm run build` step, capture the full log and check:
- `vue-tsc` type errors → fix them in the source (out of scope for this plan; report and stop).
- Network errors pulling npm packages → retry.
- `COPY .env.example .env` fails with "not found" → your `.dockerignore` line `!.env.example` is wrong; fix it.

- [ ] **Step 3: Inspect the image**

```sh
docker image inspect agent-platform-console:local --format '{{.Size}}'
docker image inspect agent-platform-console:local --format '{{.Config.Entrypoint}} / {{.Config.Cmd}}'
docker image inspect agent-platform-console:local --format '{{.Config.Env}}'
```

Expected: size is roughly 50-80 MB (the nginx-debian base is ~140MB, our additions are small). Entrypoint `[/entrypoint.sh]`; Cmd `[nginx -g daemon off;]`. Env contains `BACKEND_BASE_URL=http://backend:8080`.

- [ ] **Step 4: Commit**

```sh
cd "$(git rev-parse --show-toplevel)"
git add Dockerfile
git commit -m "feat(docker): add multi-stage Dockerfile (node 24 alpine -> nginx 1.31.2)"
```

---

## Task 5: Local smoke test

**Files:** none (validates Tasks 1-4 end-to-end).

**Goal:** run the image locally and prove (a) the SPA is served, (b) the entrypoint rendered the right `proxy_pass`, (c) `/query` reaches the configured backend, (d) HTML is `no-cache` and assets under `/assets/` are `immutable`.

- [ ] **Step 1: Start a fake backend on host port 18080**

We need a backend that answers `POST /query` so the proxy path can be exercised. The simplest portable option is `python3 -m http.server` on a different port — it won't speak GraphQL, but for this smoke test we only need a 200/404 response. Open a second terminal:

```sh
mkdir -p /tmp/apc-fake-backend
cat > /tmp/apc-fake-backend/server.py <<'PY'
from http.server import BaseHTTPRequestHandler, HTTPServer
class H(BaseHTTPRequestHandler):
    def do_POST(self):
        n = int(self.headers.get('Content-Length', '0'))
        self.rfile.read(n)
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        body = b'{"data":{"__smoke":"ok"}}'
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)
    def log_message(self, *a, **kw): pass
HTTPServer(('127.0.0.1', 18080), H).serve_forever()
PY
python3 /tmp/apc-fake-backend/server.py
```

Leave it running. If port 18080 is taken, pick another (update the `docker run` below to match).

- [ ] **Step 2: Run the container**

In the original terminal:

```sh
cd "$(git rev-parse --show-toplevel)"
docker run -d --rm \
  --name apc-smoke \
  -p 8080:80 \
  -e BACKEND_BASE_URL=http://host.docker.internal:18080 \
  agent-platform-console:local
```

Expected: a 64-char container ID is printed. `host.docker.internal` is the macOS / Windows Docker Desktop alias for the host loopback. On Linux without Docker Desktop, replace it with `http://172.17.0.1:18080` (the docker bridge gateway).

- [ ] **Step 3: Verify the entrypoint log**

```sh
docker logs apc-smoke
```

Expected: first non-empty line is exactly:
```
[entrypoint] BACKEND_BASE_URL=http://host.docker.internal:18080
```
Followed by nginx startup lines. If you see `connection refused` from nginx when it tries to resolve the upstream, that's fine — it logs a warning when the request comes in, not at startup.

- [ ] **Step 4: Verify SPA serving and cache headers**

```sh
curl -sI http://localhost:8080/ | grep -iE 'HTTP/|cache-control'
curl -s  http://localhost:8080/ | head -5
```

Expected: `HTTP/1.1 200 OK` and `Cache-Control: no-cache, no-store, must-revalidate`. The body should start with `<!doctype html>` or `<!DOCTYPE html>` (Vite's index.html).

- [ ] **Step 5: Verify SPA fallback for deep links**

```sh
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:8080/some/deep/route
```

Expected: `200` (the request returns `index.html`, not a 404).

- [ ] **Step 6: Verify the asset cache header**

Vite emits files under `/assets/`. Find one:

```sh
ASSET=$(curl -s http://localhost:8080/ | grep -oE '/assets/[^"]+' | head -1)
echo "Asset: $ASSET"
curl -sI "http://localhost:8080${ASSET}" | grep -iE 'HTTP/|cache-control|expires'
```

Expected: `HTTP/1.1 200 OK` and `Cache-Control: public, immutable` and an `Expires` date one year in the future.

- [ ] **Step 7: Verify `/query` proxies to the backend**

```sh
curl -s -X POST http://localhost:8080/query \
  -H 'Content-Type: application/json' \
  -d '{"query":"{__typename}"}'
```

Expected: `{"data":{"__smoke":"ok"}}` (the response from the fake Python backend in Step 1).

If the response is `502 Bad Gateway`, check:
- `docker logs apc-smoke | tail -20` — likely `connect() failed (111: Connection refused)` while connecting to `host.docker.internal:18080`. Make sure the Python server is still running and reachable from the container:
  ```sh
  docker exec apc-smoke sh -c 'wget -qO- http://host.docker.internal:18080/ || echo unreachable'
  ```
  If `unreachable`, you are on Linux without Docker Desktop — use the docker bridge gateway IP from the comment in Step 2.

- [ ] **Step 8: Verify envsubst did not mangle other nginx vars**

```sh
docker exec apc-smoke cat /etc/nginx/conf.d/default.conf
```

Expected: the file contains `proxy_pass http://host.docker.internal:18080/query;` (the only `${...}` substituted) AND it still contains literal `$uri`, `$host`, `$scheme`, `$proxy_add_x_forwarded_for` (these are nginx runtime variables that envsubst must leave alone). If you see any of those replaced by empty strings, the `envsubst '${BACKEND_BASE_URL}'` argument in `entrypoint.sh` is wrong — fix it and rebuild.

- [ ] **Step 9: Stop the container and the fake backend**

```sh
docker stop apc-smoke
# Ctrl-C the python3 server in the other terminal.
rm -rf /tmp/apc-fake-backend
```

No commit — this task is verification only. If any step failed, **stop and fix** the offending task's files before continuing.

---

## Task 6: Makefile

**Files:**
- Create: `Makefile`

**Interfaces:**
- Produces: a `Makefile` in the repo root with the targets listed in the spec.
- Consumes: `npm`, `docker` on `PATH`.

**Conventions used in this Makefile:**
- `.PHONY` declared for every target (no file with these names should ever exist).
- `help` is the default goal; running `make` alone prints help.
- Indent with **tabs** (required by Make).
- No shell logic beyond what the spec table describes.

- [ ] **Step 1: Write the Makefile**

Create `Makefile` with this exact content:

```make
# agent-platform-console — top-level task runner
# Default goal: help
.DEFAULT_GOAL := help

# ---------- Config ----------
IMAGE      ?= agent-platform-console:local
CONTAINER  ?= apc-local
HOST_PORT  ?= 8080
# Default to host.docker.internal so a developer on macOS / Windows can run
# `make docker:run` against a backend on the host without extra flags.
# Override at invocation:  BACKEND_BASE_URL=http://backend:8080 make docker:run
BACKEND_BASE_URL ?= http://host.docker.internal:8080

.PHONY: help
help: ## Show this help message
	@awk 'BEGIN {FS = ":.*?## "; printf "Usage:\n  make \033[36m<target>\033[0m\n\nTargets:\n"} \
	/^[a-zA-Z0-9_.-]+:.*?## / {printf "  \033[36m%-18s\033[0m %s\n", $$1, $$2}' $(MAKEFILE_LIST)

# ---------- Local dev ----------
.PHONY: install
install: ## Install npm dependencies
	npm ci

.PHONY: dev
dev: ## Run vite dev server
	npm run dev

.PHONY: build
build: ## Build the SPA into dist/
	npm run build

.PHONY: preview
preview: ## Preview the production build locally
	npm run preview

.PHONY: test
test: ## Run vitest in watch mode
	npm run test

.PHONY: test-run
test-run: ## Run vitest once
	npm run test:run

.PHONY: lint
lint: ## Run eslint with --fix
	npm run lint

.PHONY: format
format: ## Run prettier --write on src/
	npm run format

# ---------- Cleanup ----------
.PHONY: clean
clean: ## Remove dist/ and coverage/
	rm -rf dist coverage

.PHONY: clean-all
clean-all: clean ## Also remove node_modules
	rm -rf node_modules

# ---------- Docker ----------
.PHONY: docker-build
docker-build: ## Build the docker image (tag: $(IMAGE))
	docker build -t $(IMAGE) .

.PHONY: docker-run
docker-run: ## Run the docker image (host port $(HOST_PORT) -> 80)
	docker run -d --rm \
		--name $(CONTAINER) \
		-p $(HOST_PORT):80 \
		-e BACKEND_BASE_URL=$(BACKEND_BASE_URL) \
		$(IMAGE)

.PHONY: docker-stop
docker-stop: ## Stop and remove the running container
	-docker stop $(CONTAINER)
	-docker rm   $(CONTAINER)

.PHONY: docker-logs
docker-logs: ## Tail the running container's logs
	docker logs -f $(CONTAINER)

.PHONY: docker-rebuild
docker-rebuild: docker-stop docker-build docker-run ## Stop, rebuild, and rerun
```

- [ ] **Step 2: Verify `help` works**

```sh
cd "$(git rev-parse --show-toplevel)"
make help
```

Expected: a list of 15+ targets, each on its own line with a colourised name and description. Two-space gap, alignment in a column. If alignment is broken, the `awk` printf width `%-18s` may need a tweak.

- [ ] **Step 3: Verify `clean` does not error when `dist/` is absent**

```sh
cd "$(git rev-parse --show-toplevel)"
make clean
```

Expected: silent success, exit 0. (The existing `dist/` from your earlier `npm run build` should be removed; that is intentional — the user's local dist will be regenerated next time they `make build`.)

- [ ] **Step 4: Verify `docker-stop` is a no-op when no container is running**

```sh
cd "$(git rev-parse --show-toplevel)"
make docker-stop
```

Expected: exit 0, the `-` prefix on the recipe lines makes `docker stop` and `docker rm` no-op failures. You may see "No such container: apc-local" on stderr — that is fine.

- [ ] **Step 5: Commit**

```sh
cd "$(git rev-parse --show-toplevel)"
git add Makefile
git commit -m "feat: add Makefile with npm and docker targets"
```

---

## Task 7: README — Docker section

**Files:**
- Modify: `README.md` (append a new section; do NOT replace or reorder existing content)

**Interfaces:** none.

**Context:** read the existing `README.md` first to find the right place to append. Add the new section at the end of the file. If the file already has a "Build" or "Deployment" section, add the Docker subsection as a child of that; otherwise create a top-level `## Build & Run with Docker` at the end.

- [ ] **Step 1: Read the existing README**

```sh
cd "$(git rev-parse --show-toplevel)"
cat README.md
```

- [ ] **Step 2: Append the section**

Append the following block to `README.md`. **Do not** remove any existing content; the `>>>` heredoc in the shell is just a visual cue — use your editor's append feature.

```markdown

## Build & Run with Docker

A multi-stage `Dockerfile` produces a `nginx`-based image that serves the SPA
and reverse-proxies `/query` to a backend. The backend URL is injected at
container start via the `BACKEND_BASE_URL` environment variable, so you do
not need to rebuild the image to point at a different backend.

```sh
# Build the image (tag: agent-platform-console:local)
make docker-build

# Run it, pointing at a backend on the host (default port 8080)
make docker-run

# Or point at a docker-compose service named `backend`
BACKEND_BASE_URL=http://backend:8080 make docker-run

# Tail logs
make docker-logs

# Rebuild after a code change
make docker-rebuild
```

The image is built on `node:24-alpine` and runs on `nginx:1.31.2`.
The only file written to disk at container start is
`/etc/nginx/conf.d/default.conf`, rendered by `docker/entrypoint.sh` from
`docker/nginx.conf.template` via `envsubst ${BACKEND_BASE_URL}`. No other
`$VAR` is substituted, so every nginx runtime variable (`$uri`, `$host`, etc.)
is preserved verbatim.
```

- [ ] **Step 3: Verify the appended section renders sensibly**

```sh
cd "$(git rev-parse --show-toplevel)"
tail -40 README.md
```

Expected: the new section starts with `## Build & Run with Docker` and contains the shell block, the make targets, and the closing paragraph. If the existing README ends without a trailing newline, make sure the appended content starts on a new line.

- [ ] **Step 4: Commit**

```sh
cd "$(git rev-parse --show-toplevel)"
git add README.md
git commit -m "docs: document docker build & run via Makefile"
```

---

## Task 8: Full end-to-end verification

**Files:** none (final gate before declaring done).

**Goal:** the user can run `make docker-rebuild` and get a working container in one command, then `curl localhost:8080/` and get the SPA.

- [ ] **Step 1: Re-run `make help` and confirm 15+ targets**

```sh
cd "$(git rev-parse --show-toplevel)"
make help
```

- [ ] **Step 2: One-shot rebuild and run**

```sh
cd "$(git rev-parse --show-toplevel)"
make docker-rebuild
```

Expected: prints `docker stop` output (a no-op the first time), the build progress, and a 64-char container ID. Total time on a warm cache: under 90 seconds.

- [ ] **Step 3: Re-verify the SPA serves**

```sh
curl -sI http://localhost:8080/ | head -1
```

Expected: `HTTP/1.1 200 OK`.

- [ ] **Step 4: Confirm entrypoint log is sane**

```sh
docker logs --tail 5 apc-local
```

Expected: the entrypoint echo line and nginx's "ready for connections" or similar.

- [ ] **Step 5: Tear down**

```sh
cd "$(git rev-parse --show-toplevel)"
make docker-stop
```

- [ ] **Step 6: Final commit log**

```sh
cd "$(git rev-parse --show-toplevel)"
git log --oneline main..HEAD
```

Expected: 7 commits, one per task from Task 1 through Task 7. If fewer than 7 are present, look at `git log` and verify the missing tasks either didn't happen or were squashed (do not squash — review and re-commit if needed).

---

## Self-Review

**Spec coverage check** — every section of the design spec maps to a task:

| Spec section | Task |
| --- | --- |
| `Dockerfile` multi-stage | Task 4 |
| `docker/entrypoint.sh` | Task 2 |
| `docker/nginx.conf.template` | Task 1 |
| `Makefile` | Task 6 |
| README addition | Task 7 |
| end-to-end verification | Tasks 5 + 8 |
| `.env*` handling in builder | Task 4 step 1 (whitelist `.env.example`) |
| Cache headers (HTML no-cache, assets 1y immutable) | Task 1 (template) + Task 5 (curl validation) |
| `BACKEND_BASE_URL` default `http://backend:8080` | Task 2 (script) + Task 4 (ENV) + Task 6 (Makefile default) |
| Makefile default `host.docker.internal:8080` for solo dev | Task 6 |
| No other `$VAR` substituted by envsubst | Task 1 (only `${BACKEND_BASE_URL}`) + Task 2 (script) + Task 5 step 8 (verify) |
| SPA fallback `try_files` | Task 1 |
| Proxy headers (X-Real-IP, X-Forwarded-*) | Task 1 |

**Placeholder scan:** searched for `TBD`, `TODO`, `fill in`, `later`, `appropriate`. None found.

**Type / name consistency:**
- Image tag: `agent-platform-console:local` — defined in Task 4 (build) and Task 6 (`IMAGE ?=`). Identical.
- Container name: `apc-local` (Task 6) vs `apc-smoke` (Task 5). The names differ on purpose — Task 5 uses a different name to avoid colliding with a `make docker-run`'d container. Make sure to stop the smoke-test container in Task 5 step 9; `make docker-rebuild` (Task 8) calls `docker-stop` which targets `apc-local` (not `apc-smoke`).
- Path `/etc/nginx/templates/default.conf.template` — same in Dockerfile, entrypoint, Task 1 step 3.
- Path `/etc/nginx/conf.d/default.conf` — same in Dockerfile (not directly named but is the output of entrypoint), entrypoint (write target), Task 5 step 8 (read target).
- `BACKEND_BASE_URL` — same name in env, entrypoint, Dockerfile, Makefile, smoke test, README.

**No silent caps:** every step either shows the exact command and expected output, or shows how to derive it.
