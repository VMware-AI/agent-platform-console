import { gql } from '@apollo/client/core'

// Auth is cookie-based: `login` makes the backend set an httpOnly `ap_session`
// cookie (LLD-12); the browser replays it automatically (apolloClient uses
// `credentials: 'include'`). `me` rehydrates the session on reload; `logout`
// clears the cookie server-side. The login form collects an identifier the
// backend accepts as either a username OR an email (carried in
// `LoginInput.email`). `LoginInput.remember` maps to the cookie lifetime
// (persistent vs session cookie). `AuthPayload.token` is still returned for
// non-browser (Bearer) clients but the console no longer reads it.

export const LOGIN_MUTATION = gql`
  mutation Login($input: LoginInput!) {
    login(input: $input) {
      token
      mustChangePassword
      user {
        id
        username
        displayName
        email
        role
      }
    }
  }
`

export const ME_QUERY = gql`
  query Me {
    me {
      id
      username
      displayName
      email
      role
      mustChangePassword
    }
  }
`

export const LOGOUT_MUTATION = gql`
  mutation Logout {
    logout
  }
`

export interface AuthUser {
  id: string
  username: string
  displayName: string
  email: string
  role: string
}

export interface LoginMutationVars {
  // `email` carries the login identifier — username or email (backend resolves both).
  // `remember` maps to the session-cookie lifetime (persistent vs cleared on close).
  input: { email: string; password: string; remember?: boolean }
}

export interface LoginMutationResult {
  login: {
    token: string
    mustChangePassword: boolean
    user: AuthUser
  }
}

export interface MeQueryResult {
  me: AuthUser & { mustChangePassword: boolean }
}

// changePassword is the self-service password-change mutation. The backend
// signature is `changePassword(oldPassword: String!, newPassword: String!): Boolean!`
// — there is no ChangePasswordInput wrapper and the return is a bare Boolean
// (true on success). On success the backend rotates the session via Set-Cookie
// (LLD-12); the next ME_QUERY will then observe mustChangePassword: false.
// Throws GraphQL errors for wrong old password, weak new password, etc.
export const CHANGE_PASSWORD_MUTATION = gql`
  mutation ChangePassword($oldPassword: String!, $newPassword: String!) {
    changePassword(oldPassword: $oldPassword, newPassword: $newPassword)
  }
`

export interface ChangePasswordVars {
  oldPassword: string
  newPassword: string
}

export interface ChangePasswordResult {
  changePassword: boolean
}
