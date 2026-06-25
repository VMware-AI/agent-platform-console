import { gql } from '@apollo/client/core'

// Auth is Bearer-token based: `login` returns `AuthPayload.token` (= session id),
// which the auth store persists and the transport sends as `Authorization:
// Bearer <token>`. `me` rehydrates the session on reload; `logout` invalidates
// it server-side. The login form collects an identifier the backend accepts as
// either a username OR an email (carried in `LoginInput.email`).

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
  input: { email: string; password: string }
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
