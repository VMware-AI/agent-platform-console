import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { gql } from '@apollo/client/core'
import { apolloClient } from '@/api/graphql/client'
import type { User } from '@/types/auth'

// Cookie-based auth against agent-platform-backend. login sets an HttpOnly session
// cookie; `me` rehydrates from it on reload; logout clears it. The login form
// collects an email — the backend accepts username OR email as the identifier.
const LOGIN = gql`
  mutation Login($u: String!, $p: String!) {
    login(username: $u, password: $p) {
      user { id username email role }
      mustChangePassword
    }
  }
`
const ME = gql`
  query Me {
    me { id username email role }
  }
`
const LOGOUT = gql`
  mutation Logout {
    logout
  }
`

function toUser(u: { email: string; username: string }): User {
  return { email: u.email, displayName: u.username }
}

export const useAuthStore = defineStore('auth', () => {
  const user = ref<User | null>(null)
  const role = ref<string | null>(null)
  const mustChangePassword = ref(false)
  const isLoading = ref(false)
  const error = ref<string | null>(null)

  const isAuthenticated = computed(() => user.value !== null)

  async function login(email: string, password: string, _remember: boolean): Promise<boolean> {
    error.value = null
    isLoading.value = true
    try {
      const { data } = await apolloClient.mutate({
        mutation: LOGIN,
        variables: { u: email.trim(), p: password },
      })
      const payload = data?.login
      if (!payload?.user) {
        error.value = 'Invalid email or password.'
        return false
      }
      user.value = toUser(payload.user)
      role.value = payload.user.role
      mustChangePassword.value = !!payload.mustChangePassword
      return true
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Login failed.'
      return false
    } finally {
      isLoading.value = false
    }
  }

  async function logout() {
    try {
      await apolloClient.mutate({ mutation: LOGOUT })
    } catch {
      /* best-effort; clear local state regardless */
    }
    user.value = null
    role.value = null
    mustChangePassword.value = false
    error.value = null
    await apolloClient.clearStore()
  }

  function clearError() {
    error.value = null
  }

  // Rehydrate from the session cookie (called once on boot). Silent when not
  // logged in — `me` errors without a valid session.
  async function restore() {
    try {
      const { data } = await apolloClient.query({ query: ME, fetchPolicy: 'network-only' })
      if (data?.me) {
        user.value = toUser(data.me)
        role.value = data.me.role
      }
    } catch {
      /* not authenticated */
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
