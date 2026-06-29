import { gql } from '@apollo/client/core'

/* ============================================================
 * User & Role Query / Mutation documents
 *
 * Operation names are kept stable (Apollo uses them as cache keys and the
 * `refetchQueries` calls reference them by name).
 * ============================================================ */

const ACCOUNT_USER_FIELDS = /* GraphQL */ `
  fragment AccountUserFields on AccountUser {
    id
    username
    displayName
    email
    role {
      id
      name
    }
    connectionStatus
    lastLoginAt
    enabled
    createdAt
    updatedAt
  }
`

const ROLE_FIELDS = /* GraphQL */ `
  fragment RoleFields on Role {
    id
    name
    description
    userCount
    builtIn
  }
`

export const USERS_QUERY = gql`
  ${ACCOUNT_USER_FIELDS}
  query Users($filter: UserFilter, $pagination: Pagination, $sort: UserSort) {
    users(filter: $filter, pagination: $pagination, sort: $sort) {
      nodes {
        ...AccountUserFields
      }
      totalCount
      pageInfo {
        page
        pageSize
        totalPages
      }
    }
  }
`

export const ROLES_QUERY = gql`
  ${ROLE_FIELDS}
  query Roles {
    roles {
      nodes {
        ...RoleFields
      }
      totalCount
      pageInfo {
        page
        pageSize
        totalPages
      }
    }
  }
`

/** Single-role query — used by `RoleUsersDialog` to refresh the role header
 *  after a binding mutation. */
export const ROLE_QUERY = gql`
  ${ROLE_FIELDS}
  query Role($id: ID!) {
    role(id: $id) {
      ...RoleFields
    }
  }
`

/** Used by `UsersTab`'s "打开角色用户列表" interaction so the dialog can
 *  fetch every user under one role in one round-trip. */
export const USERS_BY_ROLE_QUERY = gql`
  ${ACCOUNT_USER_FIELDS}
  query UsersByRole($roleId: ID!) {
    users(filter: { roleId: $roleId }) {
      nodes {
        ...AccountUserFields
      }
      totalCount
    }
  }
`

/** Slim variant used by `RoleUsersDialog` — only the three columns the dialog
 *  renders (name / email / enabled). Kept as its own operation (different op
 *  name + selection set) so the Apollo cache doesn't accidentally satisfy the
 *  request from a cached `UsersByRole` result that carries extra fields. */
export const ROLE_USERS_MIN_QUERY = gql`
  query RoleUsersMin($roleId: ID!) {
    users(filter: { roleId: $roleId }) {
      nodes {
        id
        username
        email
        enabled
      }
      totalCount
    }
  }
`

/** Existence check used by `UserFormDialog` for the debounced dedupe. */
export const USER_EXISTS_QUERY = gql`
  query UserExists($username: String, $email: String) {
    userExists(username: $username, email: $email)
  }
`

/* ---------- Mutations ---------- */

export const CREATE_USER_MUTATION = gql`
  ${ACCOUNT_USER_FIELDS}
  mutation CreateUser($input: CreateUserInput!) {
    createUser(input: $input) {
      user {
        ...AccountUserFields
      }
      generatedPassword
    }
  }
`

export const UPDATE_USER_MUTATION = gql`
  ${ACCOUNT_USER_FIELDS}
  mutation UpdateUser($id: ID!, $input: UpdateUserInput!) {
    updateUser(id: $id, input: $input) {
      ...AccountUserFields
    }
  }
`

export const DELETE_USER_MUTATION = gql`
  mutation DeleteUser($id: ID!) {
    deleteUser(id: $id) {
      id
    }
  }
`

export const RESET_USER_PASSWORD_MUTATION = gql`
  ${ACCOUNT_USER_FIELDS}
  mutation ResetUserPassword($id: ID!) {
    resetUserPassword(id: $id) {
      user {
        ...AccountUserFields
      }
      generatedPassword
    }
  }
`

export const TOGGLE_USER_ENABLED_MUTATION = gql`
  ${ACCOUNT_USER_FIELDS}
  mutation ToggleUserEnabled($id: ID!) {
    toggleUserEnabled(id: $id) {
      user {
        ...AccountUserFields
      }
    }
  }
`

/** Re-exported fragments for views that compose inline queries. */
export { ACCOUNT_USER_FIELDS, ROLE_FIELDS }