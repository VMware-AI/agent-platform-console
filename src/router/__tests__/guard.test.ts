import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { createRouter, createMemoryHistory, type RouteRecordRaw } from 'vue-router'
import { defineComponent } from 'vue'

import { resolveGuard, type GuardAuthState } from '@/router/index'

// ROUTER GUARD LOGIC.
//
// Two layers, both logic-only (no DOM rendering, no view-chunk loading):
//   1. Unit tests of the pure `resolveGuard` predicate across every decision
//      branch (public / unauthenticated / meta.admin / meta.roles / any-auth)
//      under representative roles.
//   2. An integration test that wires `resolveGuard` into a real vue-router
//      `beforeEach` over a route table mirroring the contract, driving real
//      navigations and asserting redirect-vs-allow. Components are inert stubs,
//      so the test stays independent of volatile view markup.

const ADMIN: GuardAuthState = { isAuthenticated: true, role: 'admin' }
const TENANT_ADMIN: GuardAuthState = { isAuthenticated: true, role: 'tenant_admin' }
const OBSERVABILITY: GuardAuthState = { isAuthenticated: true, role: 'observability' }
const PLAIN_USER: GuardAuthState = { isAuthenticated: true, role: 'user' }
const ROLELESS: GuardAuthState = { isAuthenticated: true, role: null }
const ANON: GuardAuthState = { isAuthenticated: false, role: null }

describe('resolveGuard (pure predicate)', () => {
  describe('public routes', () => {
    it('allows an anonymous visitor to reach /login', () => {
      expect(resolveGuard({ public: true }, 'login', ANON)).toBe(true)
    })

    it('redirects an authenticated user away from /login to overview', () => {
      expect(resolveGuard({ public: true }, 'login', ADMIN)).toEqual({ name: 'overview' })
    })

    it('allows authenticated access to a non-login public route', () => {
      expect(resolveGuard({ public: true }, 'some-public', ADMIN)).toBe(true)
    })
  })

  describe('authentication gate', () => {
    it('redirects an anonymous visitor on a protected route to login', () => {
      expect(resolveGuard({}, 'overview', ANON)).toEqual({ name: 'login' })
      expect(resolveGuard({ admin: true }, 'platform.skills', ANON)).toEqual({ name: 'login' })
      expect(
        resolveGuard({ roles: ['admin', 'tenant_admin'] }, 'platform.users', ANON),
      ).toEqual({ name: 'login' })
    })
  })

  describe('any-authenticated routes (no admin/roles meta)', () => {
    it.each([ADMIN, TENANT_ADMIN, OBSERVABILITY, PLAIN_USER, ROLELESS])(
      'allows role=%o',
      (auth) => {
        expect(resolveGuard({}, 'agents.list', auth)).toBe(true)
      },
    )
  })

  describe('admin-only routes (meta.admin)', () => {
    it('allows only the admin role', () => {
      expect(resolveGuard({ admin: true }, 'platform.skills', ADMIN)).toBe(true)
    })

    it.each([TENANT_ADMIN, OBSERVABILITY, PLAIN_USER, ROLELESS])(
      'bounces non-admin role=%o to overview',
      (auth) => {
        expect(resolveGuard({ admin: true }, 'platform.skills', auth)).toEqual({
          name: 'overview',
        })
      },
    )
  })

  describe('role-allowlist routes (meta.roles)', () => {
    const meta = { roles: ['admin', 'observability', 'tenant_admin'] as const }

    it.each([ADMIN, TENANT_ADMIN, OBSERVABILITY])('allows allow-listed role=%o', (auth) => {
      expect(resolveGuard(meta, 'obs.audit', auth)).toBe(true)
    })

    it.each([PLAIN_USER, ROLELESS])('bounces non-listed role=%o to overview', (auth) => {
      expect(resolveGuard(meta, 'obs.audit', auth)).toEqual({ name: 'overview' })
    })

    it('treats a null role as outside any allowlist', () => {
      expect(resolveGuard({ roles: ['admin'] }, 'mg.route', ROLELESS)).toEqual({
        name: 'overview',
      })
    })
  })
})

// --- Integration: real vue-router beforeEach wired to resolveGuard -----------

const GuardStub = defineComponent({ name: 'GuardStub', render: () => null })

// A route table mirroring the meta contract from src/router/index.ts. Inert
// stub components keep this independent of view markup.
const routes: RouteRecordRaw[] = [
  { path: '/login', name: 'login', component: GuardStub, meta: { public: true } },
  { path: '/', name: 'overview', component: GuardStub },
  { path: '/agents/list', name: 'agents.list', component: GuardStub },
  { path: '/platform/skills', name: 'platform.skills', component: GuardStub, meta: { admin: true } },
  {
    path: '/observability/audit',
    name: 'obs.audit',
    component: GuardStub,
    meta: { roles: ['admin', 'observability', 'tenant_admin'] },
  },
]

function makeRouter(auth: GuardAuthState) {
  const router = createRouter({ history: createMemoryHistory(), routes })
  router.beforeEach((to) =>
    resolveGuard(
      to.meta,
      typeof to.name === 'string' ? to.name : null,
      auth,
    ),
  )
  return router
}

describe('router beforeEach integration', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('sends an anonymous visitor to login from a protected route', async () => {
    const router = makeRouter(ANON)
    await router.push('/agents/list')
    expect(router.currentRoute.value.name).toBe('login')
  })

  it('lets an admin reach an admin-only route', async () => {
    const router = makeRouter(ADMIN)
    await router.push('/platform/skills')
    expect(router.currentRoute.value.name).toBe('platform.skills')
  })

  it('bounces a plain user off an admin-only route to overview', async () => {
    const router = makeRouter(PLAIN_USER)
    await router.push('/platform/skills')
    expect(router.currentRoute.value.name).toBe('overview')
  })

  it('lets an allow-listed observability role reach a roles-gated route', async () => {
    const router = makeRouter(OBSERVABILITY)
    await router.push('/observability/audit')
    expect(router.currentRoute.value.name).toBe('obs.audit')
  })

  it('bounces a plain user off a roles-gated route to overview', async () => {
    const router = makeRouter(PLAIN_USER)
    await router.push('/observability/audit')
    expect(router.currentRoute.value.name).toBe('overview')
  })

  it('redirects an authenticated user away from /login', async () => {
    const router = makeRouter(ADMIN)
    await router.push('/login')
    expect(router.currentRoute.value.name).toBe('overview')
  })

  it('lets any authenticated user reach an ungated route', async () => {
    const router = makeRouter(PLAIN_USER)
    await router.push('/agents/list')
    expect(router.currentRoute.value.name).toBe('agents.list')
  })
})
