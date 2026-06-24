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
        { path: 'agents/marketplace', name: 'agents.marketplace', component: ComingSoon, props: { title: '智能体市场' } },

        // 模型网关配置
        { path: 'model-gateway/route', name: 'mg.route', component: () => import('@/views/ModelRouteView.vue') },
        { path: 'model-gateway/key',   name: 'mg.key',   component: () => import('@/views/VirtualKeyView.vue') },
        { path: 'model-gateway/limit', name: 'mg.limit', component: ComingSoon, props: { title: '限流策略' } },

        // 可观测性
        { path: 'observability/metering', name: 'obs.metering',  component: ComingSoon, props: { title: '计量中心' } },
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
  return true
})

export default router
