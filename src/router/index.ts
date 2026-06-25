import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import AppShell from '@/components/AppShell.vue'
import LoginView from '@/views/LoginView.vue'
import DashboardView from '@/views/DashboardView.vue'
import ComingSoon from '@/views/ComingSoon.vue'

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
        { path: 'agents/config',      name: 'agents.config',      component: ComingSoon, props: { title: '智能体配置' } },
        // 智能体市场 is admin-only: it browses the OVA catalog (admin-gated queries)
        // and deploys agents (deployAgent is @hasRole(any: [admin])). A non-admin
        // would otherwise reach the page only for its queries to error.
        { path: 'agents/marketplace', name: 'agents.marketplace', component: () => import('@/views/AgentMarketplaceView.vue'), meta: { admin: true } },

        // 模型网关配置
        { path: 'model-gateway/route', name: 'mg.route', component: () => import('@/views/ModelRouteView.vue') },
        { path: 'model-gateway/key',   name: 'mg.key',   component: () => import('@/views/VirtualKeyView.vue') },
        { path: 'model-gateway/policy', name: 'mg.policy', component: () => import('@/views/RateLimitPolicyView.vue') },

        // 可观测性
        { path: 'observability/metering', name: 'obs.metering', component: () => import('@/views/MeteringCenterView.vue') },
        { path: 'observability/monitor',  name: 'obs.monitor',   component: ComingSoon, props: { title: '实时监控' } },
        { path: 'observability/requests', name: 'obs.requests',  component: ComingSoon, props: { title: '请求日志' } },
        { path: 'observability/audit',    name: 'obs.audit',     component: ComingSoon, props: { title: '审计日志' } },

        // 平台管理
        { path: 'platform/resources', name: 'platform.resources', component: () => import('@/views/ResourcePoolListView.vue') },
        { path: 'platform/gateway', name: 'platform.gateway', component: () => import('@/views/ModelGatewayView.vue') },
        { path: 'platform/users',   name: 'platform.users',   component: () => import('@/views/UserRoleView.vue') },
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
  return true
})

export default router
