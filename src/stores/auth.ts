import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import type { User } from '@/types/auth'
import { apolloClient } from '@/api/graphql/client'
import {
  LOGIN_MUTATION,
  type LoginMutationResult,
  type LoginMutationVars,
} from '@/api/graphql/queries/auth'

// Mock credentials — swap the body of `login()` for a real fetch later.
const MOCK_USERS: Record<string, { password: string; displayName: string }> = {
  'admin@example.com': { password: 'admin123', displayName: 'admin' },
  'user@example.com': { password: 'password', displayName: 'user' },
}

const STORAGE_KEY = 'clarity-auth'
const TOKEN_STORAGE_KEY = 'clarity-auth-token'
const SIMULATED_LATENCY_MS = 600
// Default to the in-memory mock user list so the local demo works out of the
// box. Set VITE_AUTH_MODE=api to switch to the GraphQL backend.
const authMode = import.meta.env.VITE_AUTH_MODE === 'api' ? 'api' : 'mock'

interface PersistedAuth {
  user: User
  rememberMe?: boolean
}

export const useAuthStore = defineStore('auth', () => {
  const user = ref<User | null>(null)
  const rememberMe = ref(false)
  const isLoading = ref(false)
  const error = ref<string | null>(null)

  const isAuthenticated = computed(() => user.value !== null)

  async function loginWithAPI(
    email: string,
    password: string,
    remember: boolean,
  ): Promise<boolean> {
    try {
      const response = await apolloClient.mutate<LoginMutationResult, LoginMutationVars>({
        mutation: LOGIN_MUTATION,
        variables: { input: { email: email.trim().toLowerCase(), password } },
      })
      const payload = response.data?.login
      if (!payload?.token || !payload.user) throw new Error('Invalid login response')

      user.value = {
        email: payload.user.email,
        displayName: payload.user.displayName || payload.user.username,
      }
      rememberMe.value = remember
      const storage = remember ? localStorage : sessionStorage
      const otherStorage = remember ? sessionStorage : localStorage
      storage.setItem(TOKEN_STORAGE_KEY, payload.token)
      otherStorage.removeItem(TOKEN_STORAGE_KEY)
      if (remember) {
        const persisted: PersistedAuth = { user: user.value, rememberMe: true }
        localStorage.setItem(STORAGE_KEY, JSON.stringify(persisted))
      } else {
        localStorage.removeItem(STORAGE_KEY)
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ user: user.value }))
      }
      return true
    } catch {
      error.value = 'Invalid email or password.'
      return false
    } finally {
      isLoading.value = false
    }
  }

  function loginWithMock(email: string, password: string, remember: boolean): Promise<boolean> {
    error.value = null

    return new Promise((resolve) => {
      setTimeout(() => {
        const match = MOCK_USERS[email.trim().toLowerCase()]
        if (match && match.password === password) {
          localStorage.removeItem(TOKEN_STORAGE_KEY)
          sessionStorage.removeItem(TOKEN_STORAGE_KEY)
          user.value = { email: email.trim().toLowerCase(), displayName: match.displayName }
          rememberMe.value = remember
          if (remember) {
            const payload: PersistedAuth = { user: user.value, rememberMe: true }
            sessionStorage.removeItem(STORAGE_KEY)
            localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
          } else {
            localStorage.removeItem(STORAGE_KEY)
            sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ user: user.value }))
          }
          isLoading.value = false
          resolve(true)
        } else {
          error.value = 'Invalid email or password.'
          isLoading.value = false
          resolve(false)
        }
      }, SIMULATED_LATENCY_MS)
    })
  }

  function login(email: string, password: string, remember: boolean): Promise<boolean> {
    error.value = null
    isLoading.value = true
    return authMode === 'mock'
      ? loginWithMock(email, password, remember)
      : loginWithAPI(email, password, remember)
  }

  function logout() {
    user.value = null
    rememberMe.value = false
    error.value = null
    localStorage.removeItem(STORAGE_KEY)
    sessionStorage.removeItem(STORAGE_KEY)
    localStorage.removeItem(TOKEN_STORAGE_KEY)
    sessionStorage.removeItem(TOKEN_STORAGE_KEY)
    void apolloClient.clearStore()
  }

  function clearError() {
    error.value = null
  }

  // Called once on app boot from main.ts.
  function restore() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY) ?? sessionStorage.getItem(STORAGE_KEY)
      if (!raw) return
      const parsed = JSON.parse(raw) as PersistedAuth
      if (parsed?.user?.email) {
        user.value = parsed.user
        rememberMe.value = Boolean(parsed.rememberMe)
      }
    } catch {
      // ignore corrupt storage
    }
  }

  return {
    user,
    rememberMe,
    isLoading,
    error,
    isAuthenticated,
    login,
    logout,
    clearError,
    restore,
  }
})
