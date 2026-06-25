import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

// Mock the Apollo client so the store's login/me/logout hit fakes, not the network.
vi.mock('@/api/graphql/client', () => ({
  apolloClient: {
    mutate: vi.fn(),
    query: vi.fn(),
    clearStore: vi.fn().mockResolvedValue(undefined),
  },
}))

import { apolloClient } from '@/api/graphql/client'
import { useAuthStore } from '@/stores/auth'

const mutate = apolloClient.mutate as unknown as ReturnType<typeof vi.fn>
const query = apolloClient.query as unknown as ReturnType<typeof vi.fn>
const clearStore = apolloClient.clearStore as unknown as ReturnType<typeof vi.fn>

const TOKEN_KEY = 'clarity-auth-token'
const USER_KEY = 'clarity-auth-user'

const fakeUser = {
  id: 'u1',
  username: 'admin',
  displayName: 'Admin',
  email: 'admin@x.io',
  role: 'admin',
}

beforeEach(() => {
  setActivePinia(createPinia())
  localStorage.clear()
  sessionStorage.clear()
  mutate.mockReset()
  query.mockReset()
  clearStore.mockClear()
})

describe('auth store — cookie session (LLD-12)', () => {
  it('login authenticates and NEVER stores a token (cookie is the source of truth)', async () => {
    mutate.mockResolvedValue({ data: { login: { token: 'srv-side-id', mustChangePassword: false, user: fakeUser } } })
    const store = useAuthStore()

    const ok = await store.login('admin@x.io', 'pw', true)

    expect(ok).toBe(true)
    expect(store.isAuthenticated).toBe(true)
    expect(store.role).toBe('admin')
    // The session id must never be persisted to web storage.
    expect(localStorage.getItem(TOKEN_KEY)).toBeNull()
    expect(sessionStorage.getItem(TOKEN_KEY)).toBeNull()
    // Only a non-sensitive display snapshot is kept (localStorage when remember=true).
    expect(localStorage.getItem(USER_KEY)).toContain('admin@x.io')
  })

  it('login passes the remember flag into LoginInput', async () => {
    mutate.mockResolvedValue({ data: { login: { mustChangePassword: false, user: fakeUser } } })
    const store = useAuthStore()

    await store.login('admin@x.io', 'pw', false)

    const vars = mutate.mock.calls[0][0].variables
    expect(vars.input.remember).toBe(false)
    expect(vars.input.email).toBe('admin@x.io')
    // remember=false ⇒ snapshot goes to sessionStorage (matches the session cookie).
    expect(sessionStorage.getItem(USER_KEY)).toContain('admin@x.io')
    expect(localStorage.getItem(USER_KEY)).toBeNull()
  })

  it('login fails cleanly when no user is returned', async () => {
    mutate.mockResolvedValue({ data: { login: null } })
    const store = useAuthStore()

    const ok = await store.login('admin@x.io', 'bad', true)

    expect(ok).toBe(false)
    expect(store.isAuthenticated).toBe(false)
    expect(store.error).toBeTruthy()
  })

  it('restore confirms the session via me() (cookie), no token gate', async () => {
    query.mockResolvedValue({ data: { me: { ...fakeUser, mustChangePassword: false } } })
    const store = useAuthStore()

    await store.restore()

    expect(query).toHaveBeenCalledOnce() // always calls me — the cookie is the truth
    expect(store.isAuthenticated).toBe(true)
    expect(store.role).toBe('admin')
  })

  it('restore drops to logged-out when me() returns null (no/expired cookie)', async () => {
    localStorage.setItem(USER_KEY, JSON.stringify({ email: 'stale@x.io', displayName: 'Stale' }))
    query.mockResolvedValue({ data: { me: null } })
    const store = useAuthStore()

    await store.restore()

    expect(store.isAuthenticated).toBe(false)
    expect(localStorage.getItem(USER_KEY)).toBeNull() // stale snapshot cleared
  })

  it('logout clears state, the user snapshot, and the Apollo cache', async () => {
    mutate.mockResolvedValue({ data: { logout: true } })
    localStorage.setItem(USER_KEY, JSON.stringify({ email: 'admin@x.io', displayName: 'Admin' }))
    const store = useAuthStore()

    await store.logout()

    expect(store.isAuthenticated).toBe(false)
    expect(localStorage.getItem(USER_KEY)).toBeNull()
    expect(sessionStorage.getItem(USER_KEY)).toBeNull()
    expect(clearStore).toHaveBeenCalled()
  })
})
