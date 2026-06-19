export interface User {
  email: string
  displayName: string
}

export type LoginResult = { ok: true; user: User } | { ok: false; message: string }
