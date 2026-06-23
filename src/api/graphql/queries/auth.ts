import { gql } from '@apollo/client/core'

export const LOGIN_MUTATION = gql`
  mutation Login($input: LoginInput!) {
    login(input: $input) {
      token
      user {
        id
        username
        displayName
        email
      }
    }
  }
`

export interface LoginMutationVars {
  input: { email: string; password: string }
}

export interface LoginMutationResult {
  login: {
    token: string
    user: {
      id: string
      username: string
      displayName: string
      email: string
    }
  }
}
