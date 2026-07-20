# agent-platform-console — top-level task runner
# Default goal: help
.DEFAULT_GOAL := help

# ---------- Config ----------
IMAGE     ?= agent-platform-console
REGISTRY  ?= quay.io/vmware-ai
PLATFORMS ?= linux/amd64,linux/arm64
BUILDER   ?= agent-platform-builder
# Defaults to the official npm registry; override with NPM_REGISTRY=https://registry.npmmirror.com
# in environments where registry.npmjs.org is unreachable (e.g. cron in mainland China).
NPM_REGISTRY ?= https://registry.npmmirror.com
VERSION   := $(shell cat VERSION 2>/dev/null || echo "v0.0.0")
TAG       ?= $(VERSION)-$(shell date -u +%Y%m%d)

LOCAL_CONTAINER_NAME ?= agent-platform-console
# `docker-run` / `docker-stop` / `docker-run-ssl` / `docker-logs` use $(CONTAINER)
# for the container name. Defaults to $(LOCAL_CONTAINER_NAME); override with
# `CONTAINER=foo make docker-run` if you need multiple side-by-side runs.
CONTAINER ?= $(LOCAL_CONTAINER_NAME)
# Default to http://localhost:8080 so a developer on macOS / Windows can run
# `make docker-run` against a backend on the host without extra flags.
# Override at invocation:  BACKEND_BASE_URL=http://<backend-ip>:8080 make docker-run
BACKEND_BASE_URL ?= http://localhost:8080
# Host-side port that maps to the container's :80. Override (e.g. 9080) when
# :80 is occupied by another service on the host. docker-run-ssl uses the
# same base and assumes +1 for the HTTPS host port (so HOST_PORT=9080 ->
# host 9080 for HTTP, 9081 for HTTPS).
HOST_PORT ?= 80

# ---- TLS / SSL (optional) ----
# SSL is gated by SSL_ENABLE — set it to `true` to turn TLS on. When on, both
# SSL_CERT_HOST_PATH and SSL_KEY_HOST_PATH are mandatory; otherwise the
# container starts in plain-HTTP-on-:80 mode (the historical default).
#
# `make docker-run-ssl` sets SSL_ENABLE=true automatically. For a plain
# HTTP run, use `make docker-run`.
#
# Example (CA-signed cert):
#   make docker-run-ssl \
#     SSL_CERT_HOST_PATH=$HOME/certs/fullchain.pem \
#     SSL_KEY_HOST_PATH=$HOME/certs/privkey.pem
SSL_ENABLE      ?= false
SSL_CERT_HOST_PATH ?=
SSL_KEY_HOST_PATH  ?=
SSL_CERT_PATH ?= /etc/nginx/ssl/tls.crt
SSL_KEY_PATH  ?= /etc/nginx/ssl/tls.key
SSL_REDIRECT  ?= true

# Resolve cert/key host paths at Make-parse time. If the user did not pass
# SSL_CERT_HOST_PATH / SSL_KEY_HOST_PATH but docker/certs/tls.{crt,key} exist,
# fall back to those. Done here (not in the recipe) so the recipe body sees
# the resolved value — a shell-only assignment inside an `if` block would not
# leak into the next recipe line.
ifndef SSL_CERT_HOST_PATH
    ifneq ($(wildcard docker/certs/tls.crt),)
        SSL_CERT_HOST_PATH := $(PWD)/docker/certs/tls.crt
    endif
endif
ifndef SSL_KEY_HOST_PATH
    ifneq ($(wildcard docker/certs/tls.key),)
        SSL_KEY_HOST_PATH := $(PWD)/docker/certs/tls.key
    endif
endif

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
docker-build: ## Build the local image (single-arch, no push). Tags as $(IMAGE):local AND $(REGISTRY)/$(IMAGE):$(TAG) so `docker-run`/`docker-run-ssl` pick it up.
	docker build \
		--build-arg NPM_REGISTRY=$(NPM_REGISTRY) \
		--tag $(IMAGE):local \
		--tag $(REGISTRY)/$(IMAGE):$(TAG) \
		.

.PHONY: release-images
release-images: ## Multi-arch build + push to $(REGISTRY)/$(IMAGE):$(TAG) and :latest
	docker buildx create --name $(BUILDER) --use --driver docker-container 2>/dev/null || true
	docker buildx build \
		--builder $(BUILDER) \
		--platform $(PLATFORMS) \
		--build-arg NPM_REGISTRY=$(NPM_REGISTRY) \
		--tag $(REGISTRY)/$(IMAGE):$(TAG) \
		--tag $(REGISTRY)/$(IMAGE):latest \
		--push \
		.

.PHONY: docker-run
docker-run: ## Run the local image on :80 (HTTP only). Override port with HOST_PORT (host-side).
	docker run -d --rm \
		--name $(CONTAINER) \
		-p $(HOST_PORT):80 \
		-e BACKEND_BASE_URL=$(BACKEND_BASE_URL) \
		$(REGISTRY)/$(IMAGE):$(TAG)

.PHONY: docker-stop
docker-stop: ## Stop and remove the running container (no-op if not running)
	-docker stop $(CONTAINER)
	-docker rm   $(CONTAINER)

.PHONY: docker-logs
docker-logs: ## Tail logs of the running container (Ctrl-C to exit)
	docker logs -f $(CONTAINER)

.PHONY: docker-rebuild
docker-rebuild: docker-stop docker-build docker-run ## Rebuild image and restart the container in HTTP mode (matches docker-run). For SSL, use `make docker-build && make docker-run-ssl`.

.PHONY: docker-run-ssl
docker-run-ssl: ## Run with TLS enabled (auto-redirects :80 -> :443). Sets SSL_ENABLE=true automatically. Cert/key default to docker/certs/tls.{crt,key} if those files exist; otherwise set SSL_CERT_HOST_PATH / SSL_KEY_HOST_PATH explicitly.
	@if [ -z "$(SSL_CERT_HOST_PATH)" ]; then \
		echo "ERROR: no SSL_CERT_HOST_PATH given and docker/certs/tls.crt not found." >&2; \
		echo "  Either set SSL_CERT_HOST_PATH=... or run: make gen-cert HOST=<ip-or-domain>" >&2; \
		exit 1; \
	fi
	@if [ -z "$(SSL_KEY_HOST_PATH)" ]; then \
		echo "ERROR: no SSL_KEY_HOST_PATH given and docker/certs/tls.key not found." >&2; \
		echo "  Either set SSL_KEY_HOST_PATH=... or run: make gen-cert HOST=<ip-or-domain>" >&2; \
		exit 1; \
	fi
	docker run -d --rm \
		--name $(CONTAINER) \
		-p $(HOST_PORT):80 -p $$(($(HOST_PORT) + 1)):443 \
		-e BACKEND_BASE_URL=$(BACKEND_BASE_URL) \
		-e SSL_ENABLE=true \
		-e SSL_CERT_PATH=$(SSL_CERT_PATH) \
		-e SSL_KEY_PATH=$(SSL_KEY_PATH) \
		-e SSL_REDIRECT=$(SSL_REDIRECT) \
		-v $(SSL_CERT_HOST_PATH):$(SSL_CERT_PATH):ro \
		-v $(SSL_KEY_HOST_PATH):$(SSL_KEY_PATH):ro \
		$(REGISTRY)/$(IMAGE):$(TAG)

# HOST must be set: make gen-cert HOST=console.example.com [OUT_DIR=./docker/certs]
.PHONY: gen-cert
gen-cert: ## Generate a self-signed cert+key (HOST=<ip-or-domain>, OUT_DIR optional)
	@if [ -z "$(HOST)" ]; then \
		echo "ERROR: HOST is required (an IPv4/IPv6 address or a domain name)" >&2; \
		echo "  make gen-cert HOST=console.example.com" >&2; \
		echo "  make gen-cert HOST=192.168.1.42" >&2; \
		exit 1; \
	fi
	./docker/gen-cert.sh $(HOST) $(OUT_DIR)