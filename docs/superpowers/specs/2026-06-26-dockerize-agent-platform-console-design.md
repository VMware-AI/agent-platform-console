# Dockerize agent-platform-console — Design

**Date:** 2026-06-26
**Status:** Approved (brainstorming → spec)
**Author:** Claude + Gary

## Goal

为 `agent-platform-console`（Vue 3 + Vite 单页应用）加入容器化交付能力：

- 仓库根添加 `Makefile` 统一本地 / 容器操作
- 仓库根添加 `Dockerfile`，多阶段构建，最终镜像用 `nginx` 提供静态文件 + 反代后端
- 后端地址通过 **运行时环境变量** `BACKEND_BASE_URL` 注入，无需重新 build 即可切换

## Decisions (recap from brainstorming)

| 项 | 决定 |
| --- | --- |
| 构建基础镜像 | `node:24-alpine` |
| 运行基础镜像 | `nginx:1.31.2-debian` |
| 注入方式 | 构建时 Vite 打包；运行后端地址通过 Nginx envsubst |
| 默认后端 | `http://backend:8080`（docker-compose service 名），可被 `BACKEND_BASE_URL` 覆盖 |
| Makefile 范围 | 完整常用目标 |

## Why this works with Vite

- `VITE_GRAPHQL_ENDPOINT` 在 Vite 是 **构建时** 变量，会被编译进 bundle。运行时改它不会生效。
- 因此运行时**不**改 VITE 变量，只在构建时把 `VITE_GRAPHQL_ENDPOINT=/query`（相对路径）写进 bundle。
- 浏览器里看到的是同源 `/query`，符合 `ap_session` cookie 的 `SameSite=Lax` 要求（与 `.env.example` 注释里"prod-behind-nginx"的指引一致）。
- Nginx 在容器启动时把 `/query` 反代到 `${BACKEND_BASE_URL}/query`，**这是真正能运行时切换后端的地方**。

## Deliverables

新增 4 个文件，不修改任何业务代码：

1. **`Dockerfile`** — 多阶段
2. **`docker/entrypoint.sh`** — envsubst 入口
3. **`docker/nginx.conf.template`** — Nginx 模板
4. **`Makefile`** — 仓库根

新增 1 段 README 内容（说明镜像构建/运行），可后续 PR 提交。

## Architecture

```
┌───────────────────────── Build stage (node:24-alpine) ─────────────────────────┐
│                                                                                  │
│  npm ci --no-audit --no-fund                                                     │
│  npm run build        # vue-tsc + vite build → /app/dist                         │
│                                                                                  │
└──────────────────────────────────────────────────────────────────────────────────┘
                                       │
                                       │  仅复制 /app/dist + docker/ 资产
                                       ▼
┌───────────────────── Runtime stage (nginx:1.31.2-debian) ───────────────────────┐
│                                                                                  │
│  /entrypoint.sh (envsubst $BACKEND_BASE_URL → /etc/nginx/conf.d/default.conf)    │
│  nginx -g 'daemon off;'                                                          │
│                                                                                  │
│  ┌──────────────────────────────────────────────────────────────────────────┐    │
│  │ default.conf (运行时生成):                                                 │    │
│  │   location /        → SPA fallback, try_files $uri /index.html              │    │
│  │   location /query   → proxy_pass http://${BACKEND_BASE_URL}/query           │    │
│  │                       透传 Host / X-Forwarded-* / Cookie                    │    │
│  │   listen 80          → 暴露给宿主机                                          │    │
│  └──────────────────────────────────────────────────────────────────────────┘    │
│                                                                                  │
└──────────────────────────────────────────────────────────────────────────────────┘
```

## File-by-file detail

### `Dockerfile`

```
# syntax=docker/dockerfile:1.7
ARG NODE_IMAGE=node:24-alpine
ARG NGINX_IMAGE=nginx:1.31.2-debian

FROM ${NODE_IMAGE} AS builder
WORKDIR /app
COPY package.json package-lock.json ./
COPY .env .env
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build         # 产出 /app/dist

FROM ${NGINX_IMAGE} AS runtime
COPY docker/nginx.conf.template /etc/nginx/templates/default.conf.template
# 注意：nginx 官方镜像的 /etc/nginx/templates/*.template 会被 envsubst 自动处理，
# 渲染到 /etc/nginx/conf.d/default.conf。但我们要自己控制 PROCESSING，详见 entrypoint。
COPY docker/entrypoint.sh /entrypoint.sh
COPY --from=builder /app/dist /usr/share/nginx/html
RUN chmod +x /entrypoint.sh
ENV BACKEND_BASE_URL=http://backend:8080
EXPOSE 80
ENTRYPOINT ["/entrypoint.sh"]
CMD ["nginx", "-g", "daemon off;"]
```

> **Note on nginx templates:** 官方 `nginx` 镜像自带 `/docker-entrypoint.d/` 钩子会自动 envsubst `/etc/nginx/templates/*.template`。本设计选择**不用**这个钩子，自己写 entrypoint，原因：(a) 显式更易调试；(b) 不依赖镜像内部行为；(c) 渲染失败时 entrypoint 退出非 0 码，docker 会看到错误。

### `docker/entrypoint.sh`

```sh
#!/bin/sh
set -eu

# 把 :${BACKEND_BASE_URL} 注入到 nginx 配置中。
# BACKEND_BASE_URL 由 docker run -e 或 compose environment 提供。
if [ -z "${BACKEND_BASE_URL:-}" ]; then
  echo "[entrypoint] BACKEND_BASE_URL is not set, using default http://backend:8080" >&2
  export BACKEND_BASE_URL=http://backend:8080
fi

echo "[entrypoint] BACKEND_BASE_URL=${BACKEND_BASE_URL}" >&2

envsubst '${BACKEND_BASE_URL}' \
  < /etc/nginx/templates/default.conf.template \
  > /etc/nginx/conf.d/default.conf

# 健康检查端口暴露：渲染后的 conf 至少存在
test -s /etc/nginx/conf.d/default.conf

exec "$@"
```

### `docker/nginx.conf.template`

要点（按模块）：

- `http` 块继承镜像默认 `nginx.conf`，只覆盖 `conf.d/default.conf`
- `client_max_body_size 16m`（支持稍大的配置上传）
- `gzip on;` + 常用 mime 列表
- `server { listen 80; }` 中：
  - `root /usr/share/nginx/html;`
  - `index index.html;`
  - `location /` → `try_files $uri $uri/ /index.html;`（SPA fallback）
  - `location = /index.html` → `add_header Cache-Control "no-cache";`（HTML 永远不缓存，确保升级即生效）
  - `location /assets/` → `expires 1y; add_header Cache-Control "public, immutable";`（vite 产物自带 hash，可永久缓存）
  - `location /query` → `proxy_pass ${BACKEND_BASE_URL}/query;` + `proxy_http_version 1.1;` + `proxy_set_header Host $host;` + `proxy_set_header X-Real-IP $remote_addr;` + `proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;` + `proxy_set_header X-Forwarded-Proto $scheme;` + 透传 `Cookie`（默认行为）
- `access_log /var/log/nginx/access.log; error_log /var/log/nginx/error.log;`

### `Makefile`

`.PHONY` 目标：

| 目标 | 命令 | 用途 |
| --- | --- | --- |
| `help` | `awk` 自描述 | 默认入口，列出所有目标 |
| `install` | `npm ci` | 安装依赖 |
| `dev` | `npm run dev` | 本地 vite dev server |
| `build` | `npm run build` | 产出 dist/ |
| `preview` | `npm run preview` | 本地预览 dist/ |
| `test` | `npm run test` | vitest watch |
| `test:run` | `npm run test:run` | vitest 单次跑 |
| `lint` | `npm run lint` | eslint --fix |
| `format` | `npm run format` | prettier |
| `clean` | `rm -rf dist` | 清理 |
| `clean:all` | `make clean` + 删 node_modules | 深度清理 |
| `docker:build` | `docker build -t agent-platform-console:local .` | 构建镜像 |
| `docker:run` | docker run -d -p 8080:80 --name apc-local -e BACKEND_BASE_URL=... | 启动容器 |
| `docker:stop` | docker stop apc-local && docker rm apc-local | 停掉并删除 |
| `docker:logs` | docker logs -f apc-local | 跟日志 |
| `docker:rebuild` | docker:stop && docker:build && docker:run | 一键重建 |

`docker:run` 内部逻辑（伪代码）：
```
docker run -d --rm \
  --name apc-local \
  -p 8080:80 \
  -e BACKEND_BASE_URL=$${BACKEND_BASE_URL:-http://host.docker.internal:8080} \
  agent-platform-console:local
```
默认 `host.docker.internal:8080` 让单机开发也能跑；compose 部署时 `-e BACKEND_BASE_URL=http://backend:8080` 覆盖。

## How to use

```sh
# 本地开发
make install
make dev

# 构建 + 跑容器（指向本机 8080 后端）
make docker:build
BACKEND_BASE_URL=http://host.docker.internal:8080 make docker:run

# 看日志
make docker:logs

# 重建（升级代码后）
make docker:rebuild
```

## Build behaviour notes

- `COPY .env .env` — 把本地 `.env`（如果存在）带进 builder，**不**带进 runtime 镜像（第二阶段没 COPY 它）。这是为了让构建期 `vite build` 能拿到 `VITE_GRAPHQL_ENDPOINT`。
- 如果 `.env` 不存在，COPY 会失败 → 方案：先 `COPY .env.example .env`（用模板做兜底），**但**更稳的做法是要求开发者先 `cp .env.example .env`。
  - 选定方案：Dockerfile 用 `COPY .env* ./` 一次性拷所有 `.env*` 文件，至少 `.env.example` 一定存在 → builder 不会因缺 `.env` 失败。
  - Vite 启动时若没有 `.env` 会用内置默认值（`/query`），已符合期望。
- 后续若想用 **多环境构建时切换** VITE 变量，再加 `--build-arg` 即可。本次 spec 不展开。

## Out of scope (YAGNI)

- docker-compose 文件（用户说只要 Makefile + Dockerfile）
- CI workflow（GitHub Actions / 推送镜像到 registry）
- HTTPS / Let's Encrypt（运行时由前置网关处理）
- 镜像加固（non-root user、read-only rootfs）— 可作为后续 PR
- 镜像标签策略 / 多架构 build（linux/amd64, arm64）

## Risks & mitigations

| 风险 | 缓解 |
| --- | --- |
| envsubst 误替换 nginx 模板里其他 `$` 变量 | 模板里**只**用 `${BACKEND_BASE_URL}`，别的写成字面量；envsubst 命令行只声明 `BACKEND_BASE_URL` 一个变量 |
| 容器启动时 `BACKEND_BASE_URL` 解析失败导致 nginx 502 | entrypoint 显式 echo 日志；启动后 `curl localhost/` 验证 SPA 返回 200；CI 阶段加 smoke test |
| 升级代码后浏览器拿到旧 `index.html` | HTML 设 `no-cache`，assets 设 1y immutable + 哈希文件名 |
| node:24-alpine 与 `package.json` 声明的 `engines.node >= 20` 不一致 | 24 ≥ 20，合法；如需锁定可改 `engines.node ">=20 <25"`（本次不动 package.json） |

## Self-review

- 无 TBD / TODO
- 架构与文件描述一致
- 单 plan 范围：4 个新文件 + README 段落，合适
- 关键参数（默认后端、nginx 端口、cache 策略）都已显式

## Next

- 用户 review 本 spec
- 批准后调用 `superpowers:writing-plans` 拆分实现步骤
