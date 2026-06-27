/**
 * GraphQL types — user & role management (AccountUser / Role / user-CRUD
 * inputs / payloads / vars). Mirrors the backend schema; replace with
 * codegen output when available.
 */
// Re-exports: UserConnection / RoleConnection / *QueryVars use the shared
// PageInfo, SortDirection, Pagination, and UserSortField[number] etc. from
// the agents domain.
import type { PageInfo, SortDirection, Pagination } from './agents'
export type { PageInfo, SortDirection, Pagination } from './agents'

export type ConnectionStatus = 'ONLINE' | 'OFFLINE'
export type ConnectionStatusKey = 'online' | 'offline'

export const CONNECTION_FROM_GQL: Record<ConnectionStatus, ConnectionStatusKey> = {
  ONLINE: 'online',
  OFFLINE: 'offline',
}

export interface AccountRoleRef {
  id: string
  name: string
}

export interface AccountUser {
  id: string
  username: string
  displayName: string
  email: string
  role: AccountRoleRef
  connectionStatus: ConnectionStatus
  lastLoginAt: string | null
  enabled: boolean
  createdAt: string
  updatedAt: string
  /** Server-only — never sent to the client and never rendered in UI. */
  passwordHash?: string
}

export interface UserConnection {
  nodes: AccountUser[]
  totalCount: number
  pageInfo: PageInfo
}

export interface UserFilter {
  usernameKeyword?: string | null
  roleKeyword?: string | null
  emailKeyword?: string | null
  statusKeyword?: ConnectionStatus | null
  /** Exact match against `role.id` — used by RoleUsersDialog. */
  roleId?: string | null
}

export type UserSortField =
  | 'USERNAME'
  | 'ROLE'
  | 'EMAIL'
  | 'CONNECTION'
  | 'LAST_LOGIN'
  | 'CREATED_AT'
  | 'UPDATED_AT'

export interface UserSort {
  field: UserSortField
  direction: SortDirection
}

export interface UsersQueryVars {
  filter?: UserFilter | null
  pagination?: Pagination | null
  sort?: UserSort | null
}

export interface UsersQueryResult {
  users: UserConnection
}

/* ---------- Roles ---------- */

export interface Role {
  id: string
  name: string
  description: string
  /** Computed live from the user store; not persisted. */
  userCount: number
  builtIn: boolean
}

export interface RoleConnection {
  nodes: Role[]
  totalCount: number
  pageInfo: PageInfo
}

export interface RolesQueryVars {
  pagination?: Pagination | null
}

export interface RolesQueryResult {
  roles: RoleConnection
}

/* ---------- Mutation inputs / payloads ---------- */

export type PasswordMode = 'AUTO' | 'CUSTOM'

export interface CreateUserInput {
  username: string
  /**
   * The create-user UI no longer collects a display name. The backend
   * schema (in `mock-server.ts` / the GraphQL SDL) still requires this
   * field as `String!`, so the front-end sends an empty string. Once
   * the server-side field is removed from the SDL, change this back to
   * `displayName?: string | null` and drop the `displayName: ''` line
   * in `UserFormDialog.vue`'s submit handler.
   */
  displayName: string
  email: string
  roleId: string
  passwordMode: PasswordMode
  customPassword?: string | null
  enabled?: boolean | null
}

export interface UpdateUserInput {
  displayName?: string | null
  email?: string | null
  roleId?: string | null
  enabled?: boolean | null
}

export interface AssignUsersToRoleInput {
  roleId: string
  userIds: string[]
}

export interface CreateUserPayload {
  user: AccountUser
  /** Plain-text password — only populated when `passwordMode === 'AUTO'`. */
  generatedPassword: string | null
}

export interface ResetPasswordPayload {
  user: AccountUser
  generatedPassword: string
}

export interface DeleteUserPayload {
  id: string
}

export interface ToggleUserEnabledPayload {
  user: AccountUser
}

export interface AssignUsersToRolePayload {
  role: Role
  assignedCount: number
}

/* ---------- Mutation input shapes (consumed by @vue/apollo-composable) ---------- */

export interface CreateUserVars {
  input: CreateUserInput
}
export interface UpdateUserVars {
  id: string
  input: UpdateUserInput
}
export interface DeleteUserVars {
  id: string
}
export interface ResetUserPasswordVars {
  id: string
}
export interface ToggleUserEnabledVars {
  id: string
}
export interface AssignUsersToRoleVars {
  input: AssignUsersToRoleInput
}
