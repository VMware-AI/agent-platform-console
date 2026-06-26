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
