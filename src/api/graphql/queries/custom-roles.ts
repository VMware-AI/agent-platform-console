import { gql } from '@apollo/client/core'

// Custom roles & permissions (自定义角色与权限). See backend schema/rbac.graphql.
//
// These power the fine-grained custom-role admin UI, distinct from the platform
// `Role` enum on `User.role`. A `CustomRole.permissions` is a flat list of
// permission *keys* (strings); the catalog of definable permissions is the
// `permissions` query (each `Permission` has id/key/description).
//
// Directives (enforced server-side, surfaced as GraphQL errors here):
//   - customRoles / createCustomRole / deleteCustomRole / setRolePermissions:
//       @hasRole(any: [admin, tenant_admin])
//   - permissions / upsertPermission: @hasRole(any: [admin])  (admin ONLY)
// A tenant_admin can manage roles but cannot read the permission catalog or
// define new permissions; the page degrades gracefully when `permissions`
// errors (the matrix shows the union of keys already held across roles).

const CUSTOM_ROLE_FIELDS = gql`
  fragment CustomRoleFields on CustomRole {
    id
    name
    isSystem
    permissions
    createdAt
  }
`

const PERMISSION_FIELDS = gql`
  fragment PermissionFields on Permission {
    id
    key
    description
  }
`

export const CUSTOM_ROLES_QUERY = gql`
  query CustomRolesList {
    customRoles {
      ...CustomRoleFields
    }
  }
  ${CUSTOM_ROLE_FIELDS}
`

export const PERMISSIONS_QUERY = gql`
  query PermissionCatalog {
    permissions {
      ...PermissionFields
    }
  }
  ${PERMISSION_FIELDS}
`

export const CREATE_CUSTOM_ROLE = gql`
  mutation CreateCustomRoleEntry($input: CreateCustomRoleInput!) {
    createCustomRole(input: $input) {
      ...CustomRoleFields
    }
  }
  ${CUSTOM_ROLE_FIELDS}
`

export const DELETE_CUSTOM_ROLE = gql`
  mutation DeleteCustomRoleEntry($id: ID!) {
    deleteCustomRole(id: $id)
  }
`

export const SET_ROLE_PERMISSIONS = gql`
  mutation SetCustomRolePermissions($roleId: ID!, $permissionKeys: [String!]!) {
    setRolePermissions(roleId: $roleId, permissionKeys: $permissionKeys) {
      ...CustomRoleFields
    }
  }
  ${CUSTOM_ROLE_FIELDS}
`

export const UPSERT_PERMISSION = gql`
  mutation UpsertPermissionEntry($key: String!, $description: String) {
    upsertPermission(key: $key, description: $description) {
      ...PermissionFields
    }
  }
  ${PERMISSION_FIELDS}
`

export interface CustomRoleNode {
  id: string
  name: string
  isSystem: boolean
  permissions: string[]
  createdAt: string
}

export interface PermissionNode {
  id: string
  key: string
  description: string | null
}

export interface CustomRolesResult {
  customRoles: CustomRoleNode[]
}

export interface PermissionsResult {
  permissions: PermissionNode[]
}

export interface CreateCustomRoleVars {
  input: {
    name: string
  }
}

export interface CreateCustomRoleResult {
  createCustomRole: CustomRoleNode
}

export interface DeleteCustomRoleVars {
  id: string
}

export interface DeleteCustomRoleResult {
  deleteCustomRole: boolean
}

export interface SetRolePermissionsVars {
  roleId: string
  permissionKeys: string[]
}

export interface SetRolePermissionsResult {
  setRolePermissions: CustomRoleNode
}

export interface UpsertPermissionVars {
  key: string
  description?: string | null
}

export interface UpsertPermissionResult {
  upsertPermission: PermissionNode
}
