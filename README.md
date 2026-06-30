# 智能体管理平台 / Agent Management Platform — Console

> 企业级 AI 智能体管理控制台 · Frontend for [agent-platform-backend](https://github.com/VMware-AI/agent-platform-backend)
>
> Enterprise-grade AI agent management console — orchestrate, observe, and govern agents running on your model gateway in production.

[![Vue](https://img.shields.io/badge/Vue-3.5-42b883)](https://vuejs.org)
[![Vite](https://img.shields.io/badge/Vite-6-646cff)](https://vitejs.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.6-3178c6)](https://www.typescriptlang.org)
[![Clarity](https://img.shields.io/badge/Clarity-6.13-21366b)](https://clarity.design)
[![License](https://img.shields.io/badge/License-Apache%202.0-blue)](./LICENSE)

[English](#english) · [中文](#中文)

---

## 中文

### 简介

智能体管理平台控制台前端 — 提供统一的 AI 智能体接入、编排、观测、治理界面。从资源池接入、模型路由到全链路计量与审计,让企业 AI 在生产环境**可管、可控、可观测**。

### 核心特性

- 🤖 **智能体中心** — 智能体列表、配置(知识挂载)、市场(订阅/部署)一站式管理
- 🌐 **模型网关配置** — 模型路由、虚拟密钥、限流策略统一管控
- 📊 **全链路观测** — 计量中心、实时监控、请求日志、审计日志
- ⚙️ **平台管理** — 资源池接入、模型网关接入、用户与角色管理
- 👤 **个人资料** — 身份、最近登录、连接状态、创建时间、启用状态;支持修改密码
- 🌗 **深色/浅色主题**、🌐 **中英双语** 实时切换
- 🪟 **可折叠侧栏** — 一级导航可收起为图标,节省屏幕空间

### 技术栈

| 类别 | 选型 |
|---|---|
| 框架 | Vue 3.5 |
| 构建 | Vite 6 |
| 语言 | TypeScript 5.6 |
| 状态 | Pinia 2 |
| 路由 | Vue Router 4 |
| 数据层 | Apollo Client 3 + GraphQL(代码生成/手写混合) |
| UI | VMware Clarity Design System (`@cds/core` 6.13) + Metropolis 字体 (`@cds/city` 1.1) |
| 规范 | ESLint 9 + Prettier 3 |
| 类型检查 | vue-tsc 2 |
| 测试 | Vitest 4 + @vue/test-utils + jsdom |

### 功能模块

| 一级菜单 | 页面 | 状态 |
|---|---|---|
| **总览** | Dashboard | ✅ 已完成 |
| **智能体中心** | 智能体列表 | ✅ 已完成（GraphQL + 筛选/排序/分页/批量操作/导出） |
| | 智能体配置 | ✅ 已完成（AgentConfig 浏览 + 知识挂载(LLD-11 OKF)管理） |
| | 智能体市场 | ✅ 已完成（订阅/部署/筛选/详情/OVA 模板管理） |
| **模型网关配置** | 模型路由 | ✅ 已完成（路由 CRUD + 负载均衡策略 + 后端模型选择） |
| | 虚拟密钥 | ✅ 已完成（密钥签发/回收/再生 + 作用域绑定） |
| | 限流策略 | ✅ 已完成（多维度限流：模型/路由/密钥/租户 + 时间窗） |
| **可观测性** | 计量中心 | ✅ 已完成（7d/30d/当月 概览 + 智能体/模型/日维度用量） |
| | 实时监控 | ✅ 已完成（请求指标时序图 + 多时间窗/粒度切换） |
| | 请求日志 | ✅ 已完成（多维过滤 + 分页 + 详情展开） |
| | 审计日志 | ✅ 已完成（按动作前缀过滤 + 时间窗 + 详情展开） |
| **平台管理** | 资源池接入 | ✅ 已完成 |
| | 模型网关接入 | ✅ 已完成（CRUD + 健康状态 + 刷新） |
| | 用户与权限 | ✅ 已完成（用户 CRUD、角色管理、密码重置/修改） |
| **个人** | 个人资料 | ✅ 已完成（账户身份、最近登录、连接状态、创建时间、启用状态；通过用户菜单进入） |

### 快速开始

**环境要求**: Node.js **>= 24**（见 `package.json#engines`）

```bash
git clone https://github.com/gyj0825/agent-platform-console.git
cd agent-platform-console
npm install
npm run dev
```

打开 <http://localhost:5173> 即可访问。

### 测试账号

> ⚠️ 当前为 mock 登录,后续会接入后端真实认证接口 [agent-platform-backend](https://github.com/VMware-AI/agent-platform-backend)。

| 邮箱 | 密码 | 角色 |
|---|---|---|
| `admin@example.com` | `admin123` | admin |
| `user@example.com` | `password` | user |

### 可用脚本

| 命令 | 说明 |
|---|---|
| `npm run dev` | 启动开发服务器(默认 http://localhost:5173) |
| `npm run build` | 类型检查 + 生产构建(输出到 `dist/`) |
| `npm run build:prod` | 生产模式构建（`NODE_ENV=production`，输出到 `dist-prod/`） |
| `npm run preview` | 本地预览生产构建 |
| `npm run type-check` | 仅运行 TypeScript 类型检查 |
| `npm run lint` | ESLint 检查并自动修复 |
| `npm run format` | Prettier 格式化 `src/` |
| `npm run test:run` | 单次运行 Vitest 测试套件 |
| `npm run test:coverage` | 生成覆盖率报告 |

### 项目结构

```
src/
├── api/graphql/    # GraphQL 客户端 + 查询/变更/类型
├── components/     # 可复用组件(AppShell、SideNav、UserMenu、BrandLogo、表单弹窗等)
├── composables/    # 组合式函数(useToast 等)
├── views/          # 路由页面（按业务领域分子目录：marketplace / resource-list / user-role / __tests__）
├── stores/         # Pinia 状态(auth / locale / theme)
├── router/         # Vue Router 路由表 + 守卫(含纯函数 resolveGuard 便于单测)
├── styles/         # 全局样式 + 登录页样式
├── types/          # TypeScript 类型定义
├── App.vue         # 根组件
└── main.ts         # 应用入口(注册 Clarity 组件、初始化 store、挂载 Apollo)
```

### 关联项目

- **后端**: [agent-platform-backend](https://github.com/VMware-AI/agent-platform-backend) — 提供智能体 / 资源池 / 观测等业务接口

### Docker 构建与运行

仓库根目录提供 `Dockerfile`(多阶段构建)与 `Makefile`。最终镜像用 `nginx` 提供静态资源,并把 `/query` 反代到后端;后端地址在容器启动时通过 `BACKEND_BASE_URL` 环境变量注入,无需重新构建镜像即可切换后端。

```bash
# 构建镜像(标签: agent-platform-console:local)
make docker-build

# 运行容器,指向本机 8080 后端(默认值,适用于 macOS / OrbStack / Docker Desktop)
make docker-run

# 或指向 docker-compose 中名为 backend 的服务
BACKEND_BASE_URL=http://backend:8080 make docker-run

# 实时跟踪日志
make docker-logs

# 升级代码后一键重建
make docker-rebuild
```

构建阶段使用 `node:24-alpine`,运行阶段使用 `nginx:1.31.2`(基于 Debian trixie)。容器启动时,`docker/entrypoint.sh` 通过 `envsubst` 将 `BACKEND_BASE_URL` 注入到 `docker/nginx.conf.template`,生成 `/etc/nginx/conf.d/default.conf`。模板中**仅**该变量会被替换,nginx 自身的运行时变量(`$uri`、`$host` 等)原样保留。

### License

[Apache License 2.0](./LICENSE)

---

## English

### Overview

Frontend console for the **Agent Management Platform** — a unified interface for AI agent onboarding, orchestration, observability, and governance. From resource pool provisioning to model routing and full-stack metering/auditing, our goal is to make enterprise AI **manageable, controllable, and observable** in production.

### Features

- 🤖 **Agent Center** — agent list, config (knowledge grounding), marketplace (subscribe / deploy)
- 🌐 **Model Gateway** — model routing, virtual keys, rate-limiting policies
- 📊 **Observability** — metering, real-time monitoring, request logs, audit logs
- ⚙️ **Platform Management** — resource pools, model gateways, users & roles
- 👤 **Profile** — identity, last login, connection status, created at, enabled; change password
- 🌗 Dark/light theme & 🌐 zh/en i18n with live switch
- 🪟 Collapsible sidebar — top-level nav can collapse to icons to save screen real estate

### Tech Stack

| Category | Choice |
|---|---|
| Framework | Vue 3.5 |
| Build tool | Vite 6 |
| Language | TypeScript 5.6 |
| State | Pinia 2 |
| Router | Vue Router 4 |
| Data layer | Apollo Client 3 + GraphQL (mixed hand-written/codegen) |
| UI | VMware Clarity Design System (`@cds/core` 6.13) + Metropolis typeface (`@cds/city` 1.1) |
| Linting | ESLint 9 + Prettier 3 |
| Type check | vue-tsc 2 |
| Testing | Vitest 4 + @vue/test-utils + jsdom |

### Module Status

| Menu | Pages | Status |
|---|---|---|
| **Overview** | Dashboard | ✅ Done |
| **Agent Center** | Agent List | ✅ Done (GraphQL + filter/sort/pagination/batch/export) |
| | Agent Config | ✅ Done (AgentConfig browsing + knowledge artifact mounting for LLD-11 OKF) |
| | Agent Marketplace | ✅ Done (subscribe / deploy / filter / detail / OVA template admin) |
| **Model Gateway** | Model Routing | ✅ Done (route CRUD + load-balancing strategy + backend model selection) |
| | Virtual Keys | ✅ Done (issue / recycle / regenerate + scope binding) |
| | Rate Limiting | ✅ Done (multi-dimensional limits: model / route / key / tenant, with time windows) |
| **Observability** | Metering | ✅ Done (7d/30d/current-month overview + agent/model/daily breakdowns) |
| | Monitoring | ✅ Done (request-metrics time series + multi-window / multi-granularity switcher) |
| | Request Logs | ✅ Done (multi-dimensional filter + pagination + detail expand) |
| | Audit Logs | ✅ Done (action-prefix filter + time window + detail expand) |
| **System Settings** | Resource Pools | ✅ Done |
| | Model Gateway Integration | ✅ Done (CRUD + health status + refresh) |
| | Users & Permissions | ✅ Done (user CRUD, role mgmt, password reset/change) |
| **Personal** | Profile | ✅ Done (identity, last login, connection status, created at, enabled; opened from user menu) |

### Quick Start

**Prerequisite**: Node.js **>= 24** (see `package.json#engines`)

```bash
git clone https://github.com/gyj0825/agent-platform-console.git
cd agent-platform-console
npm install
npm run dev
```

Open <http://localhost:5173> in your browser.

### Demo Accounts

> ⚠️ Auth is currently mocked. Will be wired to the real backend in [agent-platform-backend](https://github.com/VMware-AI/agent-platform-backend).

| Email | Password | Role |
|---|---|---|
| `admin@example.com` | `admin123` | admin |
| `user@example.com` | `password` | user |

### Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start dev server (default http://localhost:5173) |
| `npm run build` | Type-check + production build (output to `dist/`) |
| `npm run build:prod` | Production-mode build (`NODE_ENV=production`, output to `dist-prod/`) |
| `npm run preview` | Preview production build locally |
| `npm run type-check` | Run TypeScript type check only |
| `npm run lint` | ESLint check + auto-fix |
| `npm run format` | Prettier format `src/` |
| `npm run test:run` | Run Vitest suite once |
| `npm run test:coverage` | Generate coverage report |

### Project Layout

```
src/
├── api/graphql/    # Apollo client + queries / mutations / types
├── components/     # Reusable components (AppShell, SideNav, UserMenu, BrandLogo, form modals, …)
├── composables/    # Composition-API helpers (useToast, …)
├── views/          # Route pages (sub-folders per domain: marketplace / resource-list / user-role / __tests__)
├── stores/         # Pinia stores (auth / locale / theme)
├── router/         # Vue Router config + guards (pure resolveGuard() helper is unit-tested)
├── styles/         # Global + login page styles
├── types/          # TypeScript type definitions
├── App.vue         # Root component
└── main.ts         # App entry (registers Clarity components, inits stores, mounts Apollo)
```

### Related

- **Backend**: [agent-platform-backend](https://github.com/VMware-AI/agent-platform-backend) — provides agent / pool / observability business APIs

### Build & Run with Docker

The repo ships a multi-stage `Dockerfile` and a `Makefile` at the root. The final image is `nginx` serving the static SPA and reverse-proxying `/query` to the backend. The backend URL is injected at container start via the `BACKEND_BASE_URL` environment variable, so you do not need to rebuild the image to point at a different backend.

```bash
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

The image is built on `node:24-alpine` and runs on `nginx:1.31.2` (Debian trixie base). At container start, `docker/entrypoint.sh` runs `envsubst` against `docker/nginx.conf.template` and writes the rendered file to `/etc/nginx/conf.d/default.conf`. Only `BACKEND_BASE_URL` is substituted; every nginx runtime variable (`$uri`, `$host`, …) is preserved verbatim.

### License

[Apache License 2.0](./LICENSE)
