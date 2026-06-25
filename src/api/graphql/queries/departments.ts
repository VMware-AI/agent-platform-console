import { gql } from '@apollo/client/core'

/* ============================================================
 * Departments (部门 = litellm team) + memberships — see backend
 * schema/department.graphql (doc43 / LLD-01).
 *
 * A `Department` maps to a litellm team; a `Membership` binds a user to a
 * department with a role (user | dept_admin). The `Membership` type carries
 * only the foreign keys (userId/departmentId/role) — it does NOT embed the
 * user object — so the view joins memberships against the USERS query
 * client-side to render display names.
 *
 * Operation names are unique PascalCase: Apollo uses them as cache keys and
 * any `refetchQueries`-by-name references them.
 * ============================================================ */

const DEPARTMENT_FIELDS = gql`
  fragment DepartmentFields on Department {
    id
    tenantId
    name
    litellmTeamId
    createdAt
  }
`

const MEMBERSHIP_FIELDS = gql`
  fragment MembershipFields on Membership {
    id
    userId
    departmentId
    role
  }
`

/* ---------- Queries ---------- */

export const DEPARTMENTS_QUERY = gql`
  query Departments {
    departments {
      ...DepartmentFields
    }
  }
  ${DEPARTMENT_FIELDS}
`

export const DEPARTMENT_MEMBERS_QUERY = gql`
  query DepartmentMembers($departmentId: ID!) {
    departmentMembers(departmentId: $departmentId) {
      ...MembershipFields
    }
  }
  ${MEMBERSHIP_FIELDS}
`

/* ---------- Mutations ---------- */

export const CREATE_DEPARTMENT_MUTATION = gql`
  mutation CreateDepartment($input: CreateDepartmentInput!) {
    createDepartment(input: $input) {
      ...DepartmentFields
    }
  }
  ${DEPARTMENT_FIELDS}
`

export const DELETE_DEPARTMENT_MUTATION = gql`
  mutation DeleteDepartment($id: ID!) {
    deleteDepartment(id: $id)
  }
`

export const ADD_MEMBERSHIP_MUTATION = gql`
  mutation AddMembership($userId: ID!, $departmentId: ID!, $role: MembershipRole) {
    addMembership(userId: $userId, departmentId: $departmentId, role: $role) {
      ...MembershipFields
    }
  }
  ${MEMBERSHIP_FIELDS}
`

export const REMOVE_MEMBERSHIP_MUTATION = gql`
  mutation RemoveMembership($userId: ID!, $departmentId: ID!) {
    removeMembership(userId: $userId, departmentId: $departmentId)
  }
`

/* ---------- Types ---------- */

/** Mirrors backend `enum MembershipRole`. */
export type MembershipRole = 'user' | 'dept_admin'

export interface DepartmentNode {
  id: string
  tenantId: string | null
  name: string
  litellmTeamId: string | null
  createdAt: string
}

export interface MembershipNode {
  id: string
  userId: string
  departmentId: string
  role: MembershipRole
}

export interface DepartmentsResult {
  departments: DepartmentNode[]
}

export interface DepartmentMembersVars {
  departmentId: string
}

export interface DepartmentMembersResult {
  departmentMembers: MembershipNode[]
}

export interface CreateDepartmentVars {
  input: {
    tenantId?: string | null
    name: string
    /** Shared budget for the litellm team backing this department. */
    maxBudget?: number | null
  }
}

export interface CreateDepartmentResult {
  createDepartment: DepartmentNode
}

export interface DeleteDepartmentVars {
  id: string
}

export interface DeleteDepartmentResult {
  deleteDepartment: boolean
}

export interface AddMembershipVars {
  userId: string
  departmentId: string
  role?: MembershipRole | null
}

export interface AddMembershipResult {
  addMembership: MembershipNode
}

export interface RemoveMembershipVars {
  userId: string
  departmentId: string
}

export interface RemoveMembershipResult {
  removeMembership: boolean
}
