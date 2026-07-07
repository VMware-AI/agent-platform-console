import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import type { User } from '@/types/auth'
import { apolloClient } from '@/api/graphql/client'
import {
  CHANGE_PASSWORD_MUTATION,
  LOGIN_MUTATION,
  LOGOUT_MUTATION,
  ME_QUERY,
  type ChangePasswordResult,
  type ChangePasswordVars,
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

/** Full profile row, as returned by the `me` resolver after PR #27. Used by
 *  the `ProfileView` and the auth store's `user` ref. */
type MeUser = MeQueryResult['me']

/** Narrower row returned by the `login` mutation — login intentionally does
 *  not surface the profile metadata, only the identity fields. */
type LoginUser = LoginMutationResult['login']['user']

function toUser(u: MeUser | LoginUser): User {
  // The `me` row carries the profile metadata (lastLoginAt, etc.); the login
  // row does not — fill those in as null so the shape stays uniform and the
  // ProfileView's `null` placeholder rendering kicks in. The login path
  // always re-fetches `me` shortly after, so the values are populated again
  // almost immediately.
  const extended = u as Partial<MeUser> & LoginUser
  return {
    email: u.email,
    displayName: u.displayName || u.username,
    id: u.id,
    username: u.username,
    role: u.role,
    lastLoginAt: extended.lastLoginAt ?? null,
    connectionStatus: extended.connectionStatus ?? null,
    createdAt: extended.createdAt ?? null,
    enabled: extended.enabled ?? null,
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

  /**
   * Self-service password change for users with `mustChangePassword: true`.
   *
   * The backend rotates the session via Set-Cookie on success (LLD-12). The
   * mutation returns a bare Boolean — true on success, no payload echo — so
   * the client re-validates via ME_QUERY: that round-trip rides the rotated
   * cookie and reads the fresh `mustChangePassword: false`. Trusting the
   * mutation response alone would leave the modal stuck if the backend
   * silently failed to flip the flag.
   */
  async function changePassword(oldPassword: string, newPassword: string): Promise<boolean> {
    error.value = null
    try {
      const { data } = await apolloClient.mutate<ChangePasswordResult, ChangePasswordVars>({
        mutation: CHANGE_PASSWORD_MUTATION,
        variables: { oldPassword, newPassword },
      })
      if (data?.changePassword !== true) {
        error.value = 'Password change failed.'
        return false
      }
      // Re-fetch me so the rotated session cookie is observed and the fresh
      // flag is read. If me fails we surface the error and keep the flag —
      // the user can retry; better than un-gating the app while we still
      // don't know the server's verdict.
      const me = await apolloClient.query<MeQueryResult>({
        query: ME_QUERY,
        fetchPolicy: 'network-only',
      })
      if (me.data?.me) {
        user.value = toUser(me.data.me)
        role.value = me.data.me.role
        mustChangePassword.value = Boolean(me.data.me.mustChangePassword)
        return true
      }
      error.value = 'Password change failed.'
      return false
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Password change failed.'
      return false
    }
  }

  function clearError(): void {
    error.value = null
  }

  // Rehydrate the session on boot (called once from main.ts before mount). Paints
  // from the non-sensitive stored copy first for speed, then confirms via `me`
  // (the httpOnly cookie is sent automatically). No valid cookie ⇒ `me` returns
  // null ⇒ logged-out. We always call `me` — the cookie, not any local flag, is
  // the source of truth.
  // Resolves when the boot-time restore() has settled (issue #31). The router
  // guard awaits this so the FIRST navigation judges the server-confirmed
  // session, not the optimistic localStorage copy. When restore() was never
  // started (unit tests drive the store directly), it resolves immediately so
  // navigation behaves exactly as before.
  let restorePromise: Promise<void> | null = null
  function whenReady(): Promise<void> {
    return restorePromise ?? Promise.resolve()
  }

  // Session expired mid-use (Apollo error link saw UNAUTHENTICATED): drop local
  // state only — the cookie is already dead, so no server logout round-trip.
  function sessionExpired(): void {
    user.value = null
    role.value = null
    mustChangePassword.value = false
    clearStoredUser()
  }

  function restore(): Promise<void> {
    restorePromise = doRestore()
    return restorePromise
  }

  async function doRestore(): Promise<void> {
    // Paint from the stored copy (user AND role, so admin menus don't flicker
    // out on reload) — display only; the guard waits for the `me` verdict.
    const stored = readStoredUser()
    user.value = stored
    role.value = stored?.role ?? null
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
      mustChangePassword.value = false
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
    changePassword,
    clearError,
    restore,
    whenReady,
    sessionExpired,
  }
})
