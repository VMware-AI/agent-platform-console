/**
 * GraphQL types — user & role management (AccountUser / Role / user-CRUD
 * inputs / payloads / vars). Mirrors the backend schema; replace with
 * codegen output when available.
 *
 * Cross-domain references: UserConnection / RoleConnection / *QueryVars use
 * the shared PageInfo / SortDirection / Pagination from `@/types/agents`;
 * consumers that need both should import from each domain file directly.
 */
import type { PageInfo, SortDirection, Pagination } from './agents'

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

/* ---------- RoleUsersDialog (3-column read-only view) ---------- */

export interface RoleUserMin {
  id: string
  username: string
  email: string
  enabled: boolean
}

export interface UsersMinQueryResult {
  users: { nodes: RoleUserMin[]; totalCount: number }
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
