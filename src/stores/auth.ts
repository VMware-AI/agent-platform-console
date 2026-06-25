import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import type { User } from '@/types/auth'
import { apolloClient } from '@/api/graphql/client'
import {
  LOGIN_MUTATION,
  LOGOUT_MUTATION,
  ME_QUERY,
  type AuthUser,
  type LoginMutationResult,
  type LoginMutationVars,
  type MeQueryResult,
} from '@/api/graphql/queries/auth'

// Non-sensitive display copy of the user, so a remembered session can paint the
// shell on reload before `me` round-trips. Auth itself rides on the httpOnly
// `ap_session` cookie (unreadable from JS, LLD-12); this copy is ONLY for first
// paint and is always re-validated against `me`. Stored in localStorage when
// "remember" is on (survives browser close, matching the persistent cookie),
// else sessionStorage (matching the session cookie).
const USER_STORAGE_KEY = 'clarity-auth-user'

function toUser(u: AuthUser): User {
  return { email: u.email, displayName: u.displayName || u.username }
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

function persistUser(user: User, remember: boolean): void {
  try {
    const primary = remember ? localStorage : sessionStorage
    const secondary = remember ? sessionStorage : localStorage
    secondary.removeItem(USER_STORAGE_KEY)
    primary.setItem(USER_STORAGE_KEY, JSON.stringify(user))
  } catch {
    // Storage unavailable — the session lives in memory for this tab only.
  }
}

function clearStoredUser(): void {
  try {
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
        // The backend sets the httpOnly ap_session cookie on this response;
        // `remember` controls its lifetime. We never read AuthPayload.token.
        variables: { input: { email: email.trim(), password, remember } },
      })
      const payload = data?.login
      if (!payload?.user) {
        error.value = 'Invalid email or password.'
        return false
      }
      const nextUser = toUser(payload.user)
      user.value = nextUser
      role.value = payload.user.role
      mustChangePassword.value = Boolean(payload.mustChangePassword)
      persistUser(nextUser, remember)
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
    clearStoredUser()
    await apolloClient.clearStore()
  }

  function clearError(): void {
    error.value = null
  }

  // Rehydrate the session on boot (called once from main.ts before mount). Paints
  // from the non-sensitive stored copy first for speed, then confirms via `me`
  // (the httpOnly cookie is sent automatically). No valid cookie ⇒ `me` returns
  // null ⇒ logged-out. We always call `me` — the cookie, not any local flag, is
  // the source of truth.
  async function restore(): Promise<void> {
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
        role.value = null
        mustChangePassword.value = false
        clearStoredUser()
      }
    } catch {
      // No/expired cookie or network down — trust nothing stale.
      user.value = null
      role.value = null
      clearStoredUser()
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
