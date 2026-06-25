import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import AppShell from '@/components/AppShell.vue'
import LoginView from '@/views/LoginView.vue'
import DashboardView from '@/views/DashboardView.vue'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/login', name: 'login', component: LoginView, meta: { public: true } },
    {
      path: '/',
      component: AppShell,
      children: [
        { path: '', name: 'overview', component: DashboardView },

        // 智能体中心
        { path: 'agents/list',        name: 'agents.list',        component: () => import('@/views/AgentListView.vue') },
        // 智能体配置: agentConfigs is browsable by any authenticated user; only
        // setAgentConfigKnowledge is admin/tenant-admin gated (handled in-page).
        { path: 'agents/config',      name: 'agents.config',      component: () => import('@/views/AgentConfigView.vue') },
        // 智能体市场 is admin-only: it browses the OVA catalog (admin-gated queries)
        // and deploys agents (deployAgent is @hasRole(any: [admin])). A non-admin
        // would otherwise reach the page only for its queries to error.
        { path: 'agents/marketplace', name: 'agents.marketplace', component: () => import('@/views/AgentMarketplaceView.vue'), meta: { admin: true } },
        // 智能体模板: upsertAgentTemplate is @hasRole(any: [admin]) — admin-only CRUD.
        { path: 'agents/templates',   name: 'agents.templates',   component: () => import('@/views/AgentTemplateView.vue'), meta: { admin: true } },
        // 快照与生命周期: snapshot/revert/recycle/setStatus are owner-OR-admin enforced
        // in-resolver (no directive), so any authenticated user may reach the page.
        { path: 'agents/snapshots',   name: 'agents.snapshots',   component: () => import('@/views/AgentSnapshotView.vue') },

        // 模型网关配置
        // 模型路由 is admin-only: modelRoutes CRUD is @hasRole(any: [admin]),
        // so guard the route like the marketplace (else a non-admin hits a dead page).
        { path: 'model-gateway/route', name: 'mg.route', component: () => import('@/views/ModelRouteView.vue'), meta: { admin: true } },
        { path: 'model-gateway/key',   name: 'mg.key',   component: () => import('@/views/VirtualKeyView.vue') },
        { path: 'model-gateway/policy', name: 'mg.policy', component: () => import('@/views/RateLimitPolicyView.vue') },
        // 网关连接: gatewayConnections CRUD is @hasRole(any: [admin]) — admin-only.
        { path: 'model-gateway/connections', name: 'mg.connections', component: () => import('@/views/GatewayConnectionView.vue'), meta: { admin: true } },
        // 上游与路由分层: upstreams/routerTiers are @hasPermission("route:manage"),
        // held by admin + tenant_admin (rbac.go) — gate on the role allowlist.
        { path: 'model-gateway/upstreams', name: 'mg.upstreams', component: () => import('@/views/UpstreamRouterView.vue'), meta: { roles: ['admin', 'tenant_admin'] } },

        // 可观测性
        { path: 'observability/metering', name: 'obs.metering', component: () => import('@/views/MeteringCenterView.vue') },
        { path: 'observability/monitor',  name: 'obs.monitor',   component: () => import('@/views/RealtimeMonitorView.vue'), meta: { roles: ['admin', 'observability', 'tenant_admin'] } },
        // 请求日志 / 审计日志 are gated by @hasPermission("audit:view"), which the
        // backend grants to admin, observability AND tenant_admin (rbac.go) — NOT
        // admin alone. Guard on the role allowlist (meta.roles), not meta.admin,
        // so the observability role (whose whole job is these pages) isn't bounced.
        { path: 'observability/requests', name: 'obs.requests',  component: () => import('@/views/RequestLogView.vue'), meta: { roles: ['admin', 'observability', 'tenant_admin'] } },
        { path: 'observability/audit',    name: 'obs.audit',     component: () => import('@/views/AuditLogView.vue'), meta: { roles: ['admin', 'observability', 'tenant_admin'] } },

        // 平台管理
        { path: 'platform/resources', name: 'platform.resources', component: () => import('@/views/ResourcePoolListView.vue') },
        { path: 'platform/gateway', name: 'platform.gateway', component: () => import('@/views/ModelGatewayView.vue') },
        { path: 'platform/users',   name: 'platform.users',   component: () => import('@/views/UserRoleView.vue') },
        // 部门与成员 / 制品库 / 自定义角色: ops are @hasRole(any: [admin, tenant_admin]).
        { path: 'platform/departments', name: 'platform.departments', component: () => import('@/views/DepartmentView.vue'), meta: { roles: ['admin', 'tenant_admin'] } },
        { path: 'platform/artifacts',   name: 'platform.artifacts',   component: () => import('@/views/ArtifactView.vue'), meta: { roles: ['admin', 'tenant_admin'] } },
        { path: 'platform/roles',       name: 'platform.roles',       component: () => import('@/views/CustomRoleView.vue'), meta: { roles: ['admin', 'tenant_admin'] } },
        // 技能 / 镜像: upsert/delete are @hasRole(any: [admin]) — admin-only.
        { path: 'platform/skills', name: 'platform.skills', component: () => import('@/views/SkillView.vue'), meta: { admin: true } },
        { path: 'platform/images', name: 'platform.images', component: () => import('@/views/ImageView.vue'), meta: { admin: true } },
      ],
    },
    { path: '/:pathMatch(.*)*', redirect: { name: 'overview' } },
  ],
})

router.beforeEach((to) => {
  const auth = useAuthStore()
  if (to.meta.public) {
    if (auth.isAuthenticated && to.name === 'login') {
      return { name: 'overview' }
    }
    return true
  }
  if (!auth.isAuthenticated) {
    return { name: 'login' }
  }
  // Admin-only routes (meta.admin): the backend role enum serializes admins as
  // 'admin' (see auth store `role`). Non-admins are bounced to the overview so
  // they never hit an admin-gated page whose queries would only error.
  // TODO: the other admin pages (platform/users, platform/gateway,
  // platform/resources) are not yet meta.admin-gated; gate them the same way
  // once their backend ops are confirmed admin-only.
  if (to.meta.admin && auth.role !== 'admin') {
    return { name: 'overview' }
  }
  // Permission-scoped routes (meta.roles): an allowlist of backend role names that
  // hold the gating permission. Used for pages gated by @hasPermission rather than
  // @hasRole(any:[admin]) — e.g. audit:view is held by admin/observability/
  // tenant_admin. A role outside the list is bounced before its queries can error.
  const allowedRoles = to.meta.roles as readonly string[] | undefined
  if (allowedRoles && !allowedRoles.includes(auth.role ?? '')) {
    return { name: 'overview' }
  }
  return true
})

export default router
