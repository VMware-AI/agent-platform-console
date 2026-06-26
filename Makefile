# agent-platform-console — top-level task runner
# Default goal: help
.DEFAULT_GOAL := help

# ---------- Config ----------
IMAGE     ?= agent-platform-console
REGISTRY  ?= quay.io/vmware-ai
PLATFORMS ?= linux/amd64,linux/arm64
BUILDER   ?= agent-platform-builder
VERSION   := $(shell cat VERSION 2>/dev/null || echo "v0.0.0")
TAG       := $(VERSION)-$(shell date -u +%Y%m%d)
IMAGE_TAG := $(TAG)

LOCAL_CONTAINER_NAME ?= agent-platform-console
# Default to  so a developer on macOS / Windows can run
# `make docker-run` against a backend on the host without extra flags.
# Override at invocation:  BACKEND_BASE_URL=http://<backend-ip>:8080 make docker-run
BACKEND_BASE_URL ?= http://localhost:8080

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
.PHONY: build-images
build-images: ## Multi-arch build (PLATFORMS=$(PLATFORMS)); loads $(IMAGE):$(TAG) into local docker
	docker buildx create --name $(BUILDER) --use --driver docker-container 2>/dev/null || true
	docker buildx build \
		--builder $(BUILDER) \
		--platform $(PLATFORMS) \
		--tag $(REGISTRY)/$(IMAGE):$(TAG) \
		--load \
		.

.PHONY: release-images
release-images: build-images ## Multi-arch build + push to $(REGISTRY)/$(IMAGE):$(TAG) and :latest
	docker buildx build \
		--builder $(BUILDER) \
		--platform $(PLATFORMS) \
		--tag $(REGISTRY)/$(IMAGE):$(TAG) \
		--tag $(REGISTRY)/$(IMAGE):latest \
		--push \
		.

.PHONY: docker-run
docker-run: ## Run the local image (tag: $(IMAGE):$(TAG), port $(HOST_PORT)->80)
	docker run -d --rm \
		--name $(CONTAINER) \
		-p 80:80 \
		-e BACKEND_BASE_URL=$(BACKEND_BASE_URL) \
		$(REGISTRY)/$(IMAGE):$(TAG)

.PHONY: docker-stop
docker-stop: ## Stop and remove the running container
	-docker stop $(CONTAINER)
	-docker rm   $(CONTAINER)