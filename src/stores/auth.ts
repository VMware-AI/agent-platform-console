import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import type { User } from '@/types/auth'
import { apolloClient, TOKEN_STORAGE_KEY } from '@/api/graphql/client'
import {
  LOGIN_MUTATION,
  LOGOUT_MUTATION,
  ME_QUERY,
  type AuthUser,
  type LoginMutationResult,
  type LoginMutationVars,
  type MeQueryResult,
} from '@/api/graphql/queries/auth'

// Persisted display copy of the user, so a remembered session can paint the
// shell on reload before `me` round-trips. The token is the source of truth for
// *being* authenticated; this copy is only for first paint and is always
// re-validated against `me`.
const USER_STORAGE_KEY = 'clarity-auth-user'

function toUser(u: AuthUser): User {
  return { email: u.email, displayName: u.displayName || u.username }
}

function readStoredToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_STORAGE_KEY) ?? sessionStorage.getItem(TOKEN_STORAGE_KEY)
  } catch {
    return null
  }
}

function readStoredUser(): User | null {
  try {
    const raw = localStorage.getItem(USER_STORAGE_KEY) ?? sessionStorage.getItem(USER_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as User
    return parsed?.email ? parsed : null
  } catch {
    return null
  }
}

function persistSession(token: string, user: User, remember: boolean): void {
  try {
    const primary = remember ? localStorage : sessionStorage
    const secondary = remember ? sessionStorage : localStorage
    secondary.removeItem(TOKEN_STORAGE_KEY)
    secondary.removeItem(USER_STORAGE_KEY)
    primary.setItem(TOKEN_STORAGE_KEY, token)
    primary.setItem(USER_STORAGE_KEY, JSON.stringify(user))
  } catch {
    // Storage unavailable — the session lives in memory for this tab only.
  }
}

function clearStoredSession(): void {
  try {
    localStorage.removeItem(TOKEN_STORAGE_KEY)
    sessionStorage.removeItem(TOKEN_STORAGE_KEY)
    localStorage.removeItem(USER_STORAGE_KEY)
    sessionStorage.removeItem(USER_STORAGE_KEY)
  } catch {
    // ignore unavailable storage
  }
}

export const useAuthStore = defineStore('auth', () => {
  const user = ref<User | null>(null)
  const role = ref<string | null>(null)
  const mustChangePassword = ref(false)
  const isLoading = ref(false)
  const error = ref<string | null>(null)

  const isAuthenticated = computed(() => user.value !== null)

  async function login(email: string, password: string, remember: boolean): Promise<boolean> {
    error.value = null
    isLoading.value = true
    try {
      const { data } = await apolloClient.mutate<LoginMutationResult, LoginMutationVars>({
        mutation: LOGIN_MUTATION,
        // Do NOT lowercase — the identifier may be a case-sensitive username.
        variables: { input: { email: email.trim(), password } },
      })
      const payload = data?.login
      if (!payload?.token || !payload.user) {
        error.value = 'Invalid email or password.'
        return false
      }
      const nextUser = toUser(payload.user)
      user.value = nextUser
      role.value = payload.user.role
      mustChangePassword.value = Boolean(payload.mustChangePassword)
      persistSession(payload.token, nextUser, remember)
      return true
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Login failed.'
      return false
    } finally {
      isLoading.value = false
    }
  }

  async function logout(): Promise<void> {
    try {
      await apolloClient.mutate({ mutation: LOGOUT_MUTATION })
    } catch {
      // Best-effort server-side invalidation; clear local state regardless.
    }
    user.value = null
    role.value = null
    mustChangePassword.value = false
    error.value = null
    clearStoredSession()
    await apolloClient.clearStore()
  }

  function clearError(): void {
    error.value = null
  }

  // Rehydrate the session on boot (called once from main.ts before mount). Paints
  // from the persisted copy first, then validates the token via `me`; a missing
  // or rejected token drops cleanly to logged-out.
  async function restore(): Promise<void> {
    if (!readStoredToken()) {
      clearStoredSession()
      return
    }
    user.value = readStoredUser()
    try {
      const { data } = await apolloClient.query<MeQueryResult>({
        query: ME_QUERY,
        fetchPolicy: 'network-only',
      })
      if (data?.me) {
        user.value = toUser(data.me)
        role.value = data.me.role
        mustChangePassword.value = Boolean(data.me.mustChangePassword)
      } else {
        user.value = null
        clearStoredSession()
      }
    } catch {
      // Token rejected / network down — trust nothing stale.
      user.value = null
      role.value = null
      clearStoredSession()
    }
  }

  return {
    user,
    role,
    mustChangePassword,
    isLoading,
    error,
    isAuthenticated,
    login,
    logout,
    clearError,
    restore,
  }
})
