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

- 🤖 **智能体中心** — 智能体列表、配置、市场一站式管理
- 🌐 **模型网关配置** — 模型路由、虚拟密钥、限流策略统一管控
- 📊 **全链路观测** — 计量中心、实时监控、请求日志、审计日志
- ⚙️ **平台管理** — 资源池接入、模型网关、用户与权限
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
| UI | VMware Clarity Design System (`@cds/core` 6.13) + Metropolis 字体 (`@cds/city` 1.1) |
| 规范 | ESLint 9 + Prettier 3 |
| 类型检查 | vue-tsc 2 |


### 功能模块

| 模块 | 页面 | 状态 |
|---|---|---|
| **总览** | Dashboard | ✅ 已完成 |
| **智能体中心** | 智能体列表 | ✅ 已完成（GraphQL + 筛选/排序/分页/批量操作/导出） |
| | 智能体配置 | 🚧 Coming Soon |
| | 智能体市场 | 🚧 Coming Soon |
| **模型网关配置** | 模型路由/虚拟密钥/限流策略 | 🚧 Coming Soon |
| **可观测性** | 计量中心/实时监控/请求日志/审计日志 | 🚧 Coming Soon |
| **平台管理** 
| | 资源池接入|✅ 已完成（部分显示问题待修复） |
| | 模型网关 | ✅ 已完成 （待验证）|
| | 用户与权限 | ✅ 已完成（用户 CRUD、角色管理、密码重置、批量绑定） |
### 快速开始

**环境要求**: Node.js **>= 20**

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
| `npm run preview` | 本地预览生产构建 |
| `npm run type-check` | 仅运行 TypeScript 类型检查 |
| `npm run lint` | ESLint 检查并自动修复 |
| `npm run format` | Prettier 格式化 `src/` |

### 项目结构

```
src/
├── components/    # 可复用组件(AppShell、SideNav、UserMenu、BrandLogo 等)
├── views/         # 路由页面(DashboardView / LoginView / ComingSoon)
├── stores/        # Pinia 状态(auth / locale / theme)
├── router/        # Vue Router 路由表 + 守卫
├── styles/        # 全局样式 + 登录页样式
├── types/         # TypeScript 类型定义
├── App.vue        # 根组件
└── main.ts        # 应用入口(注册 Clarity 组件、初始化 store)
```

### 关联项目

- **后端**: [agent-platform-backend](https://github.com/VMware-AI/agent-platform-backend) — 提供智能体 / 资源池 / 观测等业务接口

### License

[Apache License 2.0](./LICENSE)

---

## English

### Overview

Frontend console for the **Agent Management Platform** — a unified interface for AI agent onboarding, orchestration, observability, and governance. From resource pool provisioning to model routing and full-stack metering/auditing, our goal is to make enterprise AI **manageable, controllable, and observable** in production.

### Features

- 🤖 **Agent Center** — agent list, configuration, and marketplace
- 🌐 **Model Gateway** — model routing, virtual keys, rate-limiting policies
- 📊 **Observability** — metering, real-time monitoring, request logs, audit logs
- ⚙️ **Platform Management** — resource pools, model gateways, users & permissions
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
| UI | VMware Clarity Design System (`@cds/core` 6.13) + Metropolis typeface (`@cds/city` 1.1) |
| Linting | ESLint 9 + Prettier 3 |
| Type check | vue-tsc 2 |

### Module Status

| Module | Pages | Status |
|---|---|---|
| **Overview** | Dashboard | ✅ Done |
| **Agent Center** | Agent List | ✅ Done (GraphQL + filter/sort/pagination/batch/export) |
| | Agent Config | 🚧 Coming Soon |
| | Agent Marketplace | 🚧 Coming Soon |
| **Model Gateway** | Model Routing / Virtual Keys / Rate Limiting | 🚧 Coming Soon |
| **Observability** | Metering / Monitoring / Request Logs / Audit Logs | 🚧 Coming Soon |
| **Platform** | Resource Pools / Model Gateways | 🚧 Coming Soon |
| | Users & Permissions | ✅ Done (CRUD, role mgmt, password reset, batch bind) |


### Quick Start

**Prerequisite**: Node.js **>= 20**

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
| `npm run preview` | Preview production build locally |
| `npm run type-check` | Run TypeScript type check only |
| `npm run lint` | ESLint check + auto-fix |
| `npm run format` | Prettier format `src/` |

### Project Layout

```
src/
├── components/    # Reusable components (AppShell, SideNav, UserMenu, BrandLogo, …)
├── views/         # Route pages (DashboardView / LoginView / ComingSoon)
├── stores/        # Pinia stores (auth / locale / theme)
├── router/        # Vue Router config + guards
├── styles/        # Global + login page styles
├── types/         # TypeScript type definitions
├── App.vue        # Root component
└── main.ts        # App entry (registers Clarity components, inits stores)
```

### Related

- **Backend**: [agent-platform-backend](https://github.com/VMware-AI/agent-platform-backend) — provides agent / pool / observability business APIs

### License

[Apache License 2.0](./LICENSE)
