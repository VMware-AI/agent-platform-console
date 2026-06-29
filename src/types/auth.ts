/** Shape of the auth-store user. Required fields are the persistent identity
 *  (email + displayName); the profile metadata is what the backend `me`
 *  resolver surfaces and is consumed by `ProfileView.vue`. Profile fields
 *  may be null when the source row comes from the `login` mutation, which
 *  intentionally returns only identity fields — the next `me` round-trip
 *  fills them in. */
export interface User {
  email: string
  displayName: string
  id: string
  username: string
  role: string
  lastLoginAt: string | null
  connectionStatus: 'ONLINE' | 'OFFLINE' | null
  createdAt: string | null
  enabled: boolean | null
}

export type LoginResult = { ok: true; user: User } | { ok: false; message: string }
