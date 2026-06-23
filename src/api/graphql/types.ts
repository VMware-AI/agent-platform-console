/**
 * GraphQL types — mirror the schema exposed by agent-platform-backend.
 *
 * Hand-written to match the inferred schema (see plan §Schema). Once the
 * backend codegen lands, this file can be replaced by generated types.
 */

export type AgentStatus = 'RUNNING' | 'STOPPED' | 'ERROR'

export type AgentType =
  | 'PYTHON_AUTOMATION'
  | 'GENERAL_CHAT'
  | 'CODE_ANALYSIS'
  | 'DATA_ANALYSIS'
  | 'IMAGE_GENERATION'

export interface AgentApiKey {
  id: string
  name: string
}

export interface User {
  id: string
  displayName: string
  email: string
}

export interface Agent {
  id: string
  name: string
  type: AgentType
  typeLabel: string
  status: AgentStatus
  apiKey: AgentApiKey | null
  owner: User | null
  createdAt: string
  updatedAt: string
  endpoint: string | null
}

export interface PageInfo {
  page: number
  pageSize: number
  totalPages: number
}

export interface AgentConnection {
  nodes: Agent[]
  totalCount: number
  pageInfo: PageInfo
}

export type AgentSortField =
  | 'NAME'
  | 'TYPE'
  | 'STATUS'
  | 'API_KEY_NAME'
  | 'OWNER'
  | 'CREATED_AT'
  | 'UPDATED_AT'

export type SortDirection = 'ASC' | 'DESC'

export interface AgentFilter {
  status?: AgentStatus | null
  type?: AgentType | null
  /** Substring match against the agent's `name`. */
  nameKeyword?: string | null
  /** Substring match against the agent's `apiKey.name`. */
  keyKeyword?: string | null
  /** Substring match against the agent's `owner.displayName` / `owner.email`. */
  ownerKeyword?: string | null
}

export interface AgentSort {
  field: AgentSortField
  direction: SortDirection
}

export interface Pagination {
  page: number
  pageSize: number
}

export interface AgentsQueryVars {
  filter?: AgentFilter | null
  pagination?: Pagination | null
  sort?: AgentSort | null
}

export interface AgentsQueryResult {
  agents: AgentConnection
}

/* ---------- View-layer mappings ---------- */

/** Lower-case status used in views / i18n keys. */
export type StatusKey = 'running' | 'stopped' | 'error'

export const STATUS_FROM_GQL: Record<AgentStatus, StatusKey> = {
  RUNNING: 'running',
  STOPPED: 'stopped',
  ERROR: 'error',
}

export const STATUS_TO_GQL: Record<StatusKey, AgentStatus> = {
  running: 'RUNNING',
  stopped: 'STOPPED',
  error: 'ERROR',
}

/** Lower-case type key used in views / i18n keys. */
export type TypeKey =
  | 'python-automation'
  | 'general-chat'
  | 'code-analysis'
  | 'data-analysis'
  | 'image-generation'

export const TYPE_FROM_GQL: Record<AgentType, TypeKey> = {
  PYTHON_AUTOMATION: 'python-automation',
  GENERAL_CHAT: 'general-chat',
  CODE_ANALYSIS: 'code-analysis',
  DATA_ANALYSIS: 'data-analysis',
  IMAGE_GENERATION: 'image-generation',
}

/* ============================================================
 * User & Role Management types — see plan
 * `用户与权限管理页面 (/platform/users)`
 *
 * Naming note: the existing `User` interface (id/displayName/email) is the
 * embedded "owner" type used by `Agent`. The richer `AccountUser` below
 * powers the user-management page; they coexist on purpose.
 * ============================================================ */

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

/* ============================================================
 * Resource Pool Access — see plan
 * `资源池接入页面 (/platform/resources)`
 * ============================================================ */

export type PoolConnectionStatus = 'CONNECTED' | 'DISCONNECTED'
export type PoolConnectionStatusKey = 'connected' | 'disconnected'

export const POOL_CONNECTION_FROM_GQL: Record<PoolConnectionStatus, PoolConnectionStatusKey> = {
  CONNECTED: 'connected',
  DISCONNECTED: 'disconnected',
}

export interface ResourcePool {
  id: string
  name: string
  endpoint: string
  connectionStatus: PoolConnectionStatus
  datacenterCount: number
  clusterCount: number
  esxiHostCount: number
  vmInstanceCount: number
  createdAt: string
  updatedAt: string
}

export interface ResourcePoolConnection {
  nodes: ResourcePool[]
  totalCount: number
  pageInfo: PageInfo
}

export type ResourcePoolSortField =
  | 'NAME'
  | 'ENDPOINT'
  | 'CONNECTION_STATUS'
  | 'DATACENTER_COUNT'
  | 'CLUSTER_COUNT'
  | 'ESXI_HOST_COUNT'
  | 'VM_INSTANCE_COUNT'
  | 'CREATED_AT'
  | 'UPDATED_AT'

export interface ResourcePoolSort {
  field: ResourcePoolSortField
  direction: SortDirection
}

export interface ResourcePoolFilter {
  nameKeyword?: string | null
  endpointKeyword?: string | null
  connectionStatus?: PoolConnectionStatus | null
}

export interface ResourcePoolsQueryVars {
  filter?: ResourcePoolFilter | null
  pagination?: Pagination | null
  sort?: ResourcePoolSort | null
}

export interface ResourcePoolsQueryResult {
  resourcePools: ResourcePoolConnection
}

/* ---------- Mutation inputs / payloads ---------- */

export interface CreateResourcePoolInput {
  name: string
  endpoint: string
  datacenterCount?: number | null
  clusterCount?: number | null
}

export interface UpdateResourcePoolInput {
  name?: string | null
  endpoint?: string | null
  datacenterCount?: number | null
  clusterCount?: number | null
}

export interface CreateResourcePoolPayload {
  pool: ResourcePool
}

export interface UpdateResourcePoolPayload {
  pool: ResourcePool
}

export interface DeleteResourcePoolPayload {
  id: string
  deletedName: string
}

export interface SyncResourcePoolPayload {
  pool: ResourcePool
  syncedAt: string
}

export interface CreateResourcePoolVars {
  input: CreateResourcePoolInput
}
export interface UpdateResourcePoolVars {
  id: string
  input: UpdateResourcePoolInput
}
export interface DeleteResourcePoolVars {
  id: string
}
export interface SyncResourcePoolVars {
  id: string
}