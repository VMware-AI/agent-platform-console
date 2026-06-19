import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import type { User } from '@/types/auth'

// Mock credentials — swap the body of `login()` for a real fetch later.
const MOCK_USERS: Record<string, { password: string; displayName: string }> = {
  'admin@example.com': { password: 'admin123', displayName: 'admin' },
  'user@example.com': { password: 'password', displayName: 'user' },
}

const STORAGE_KEY = 'clarity-auth'
const SIMULATED_LATENCY_MS = 600

interface PersistedAuth {
  user: User
  rememberMe: true
}

export const useAuthStore = defineStore('auth', () => {
  const user = ref<User | null>(null)
  const rememberMe = ref(false)
  const isLoading = ref(false)
  const error = ref<string | null>(null)

  const isAuthenticated = computed(() => user.value !== null)

  function login(email: string, password: string, remember: boolean): Promise<boolean> {
    error.value = null
    isLoading.value = true

    return new Promise((resolve) => {
      setTimeout(() => {
        const match = MOCK_USERS[email.trim().toLowerCase()]
        if (match && match.password === password) {
          user.value = { email: email.trim().toLowerCase(), displayName: match.displayName }
          rememberMe.value = remember
          if (remember) {
            const payload: PersistedAuth = { user: user.value, rememberMe: true }
            localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
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

  function logout() {
    user.value = null
    rememberMe.value = false
    error.value = null
    localStorage.removeItem(STORAGE_KEY)
  }

  function clearError() {
    error.value = null
  }

  // Called once on app boot from main.ts.
  function restore() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (!raw) return
      const parsed = JSON.parse(raw) as PersistedAuth
      if (parsed?.user?.email) {
        user.value = parsed.user
        rememberMe.value = true
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
