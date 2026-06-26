/**
 * GraphQL types — mirror the schema exposed by agent-platform-backend.
 *
 * Hand-written to match the inferred schema (see plan §Schema). Once the
 * backend codegen lands, this file can be replaced by generated types.
 */

export type AgentStatus = 'RUNNING' | 'STOPPED' | 'ERROR'

export type AgentType =
  | 'GENERAL_CHAT'
  | 'IMAGE_GENERATION'
  | 'BASIC_LLM'
  | 'OPENCLAW'
  | 'HERMES'
  | 'CLAUDE_CODE'
  | 'XIAOGUAI'
  | 'QCODER'
  | 'OPENCODE'

export interface AgentApiKey {
  id: string
  name: string
}

export interface AgentCredentials {
  /**
   * Run-as username for the agent's VM. The backend sources this from the
   * owning user (the agent has no separate OS account today); the password is
   * never returned by the API.
   */
  username: string
}

export interface Agent {
  id: string
  name: string
  type: AgentType
  status: AgentStatus
  apiKey: AgentApiKey | null
  /** Nullable: resolver-computed; null if the owning user is gone. */
  credentials: AgentCredentials | null
  createdAt: string
  updatedAt: string
  endpoint: string | null
  templateFamilyId: string | null
  templateVersionId: string | null
  resourcePoolId: string | null
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
  | 'USERNAME'
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
  /** Substring match against the agent's `credentials.username`. */
  usernameKeyword?: string | null
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
  | 'general-chat'
  | 'image-generation'
  | 'basic-llm'
  | 'openclaw'
  | 'hermes'
  | 'claude-code'
  | 'xiaoguai'
  | 'qcoder'
  | 'opencode'

export const TYPE_FROM_GQL: Record<AgentType, TypeKey> = {
  GENERAL_CHAT: 'general-chat',
  IMAGE_GENERATION: 'image-generation',
  BASIC_LLM: 'basic-llm',
  OPENCLAW: 'openclaw',
  HERMES: 'hermes',
  CLAUDE_CODE: 'claude-code',
  XIAOGUAI: 'xiaoguai',
  QCODER: 'qcoder',
  OPENCODE: 'opencode',
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

export type ResourcePoolSyncState = 'SYNCED' | 'SYNCING' | 'PARTIAL' | 'FAILED' | 'NEVER'

export const POOL_CONNECTION_FROM_GQL: Record<PoolConnectionStatus, PoolConnectionStatusKey> = {
  CONNECTED: 'connected',
  DISCONNECTED: 'disconnected',
}

export interface ResourcePool {
  id: string
  name: string
  endpoint: string
  contentLibraryName: string
  connectionStatus: PoolConnectionStatus
  esxiHostCount: number
  vmInstanceCount: number
  syncStatus: ResourcePoolSyncState
  lastSyncedAt: string | null
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
  | 'CONTENT_LIBRARY_NAME'
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
  contentLibraryName: string
}

export interface UpdateResourcePoolInput {
  name?: string | null
  endpoint?: string | null
  contentLibraryName?: string | null
}

export interface TestResourcePoolConnectionInput {
  name: string
  endpoint: string
  contentLibraryName: string
}

export interface ResourcePoolConnectionDetail {
  vSphereVersion: string
  itemCount: number
}

export interface ResourcePoolConnectionTest {
  ok: boolean
  message: string
  detail: ResourcePoolConnectionDetail | null
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
export interface TestResourcePoolConnectionVars {
  input: TestResourcePoolConnectionInput
}
export interface TestResourcePoolConnectionResult {
  testResourcePoolConnection: ResourcePoolConnectionTest
}

/* ============================================================
 * Platform Settings — agentUser (LLD-13 §3.2)
 * ============================================================ */

export interface PlatformSettings {
  /** OS user that installed agents run as on the host ({{AGENT_USER}}). */
  agentUser: string
}

export interface UpdatePlatformSettingsInput {
  /** New agentUser; blank/empty is rejected by the backend. Omit = unchanged. */
  agentUser?: string | null
}

export interface PlatformSettingsQueryResult {
  platformSettings: PlatformSettings
}

export interface UpdatePlatformSettingsVars {
  input: UpdatePlatformSettingsInput
}

export interface UpdatePlatformSettingsResult {
  updatePlatformSettings: PlatformSettings
}

/* ============================================================
 * Agent Marketplace — OvaTemplateFamily + OvaTemplateVersion
 * ============================================================ */

export type OvaTemplateColor = 'BLUE' | 'PURPLE' | 'ORANGE' | 'GREEN' | 'RED' | 'CYAN'

export interface OvaTemplateVersion {
  id: string
  familyId: string
  version: string
  ovaIdentifier: string
  notes: string | null
  createdAt: string
}

export interface OvaTemplateFamily {
  id: string
  name: string
  type: AgentType
  description: string
  tools: string[]
  scenarios: string[]
  skills: string[]
  iconShape: string
  iconColor: OvaTemplateColor
  versions: OvaTemplateVersion[]
  latestVersion: string | null
  createdAt: string
  updatedAt: string
}

export interface OvaTemplateFamilyConnection {
  nodes: OvaTemplateFamily[]
  totalCount: number
  pageInfo: PageInfo
}

export type OvaTemplateFamilySortField = 'OVA_NAME' | 'TYPE' | 'CREATED_AT' | 'UPDATED_AT'

export interface OvaTemplateFamilyFilter {
  nameKeyword?: string | null
  type?: AgentType | null
}

export interface OvaTemplateFamilySort {
  field: OvaTemplateFamilySortField
  direction: SortDirection
}

export interface OvaTemplateFamiliesQueryVars {
  filter?: OvaTemplateFamilyFilter | null
  pagination?: Pagination | null
  sort?: OvaTemplateFamilySort | null
}

export interface OvaTemplateFamiliesQueryResult {
  ovaTemplateFamilies: OvaTemplateFamilyConnection
}

export interface OvaTemplateVersionConnection {
  nodes: OvaTemplateVersion[]
  totalCount: number
  pageInfo: PageInfo
}

export interface OvaTemplateVersionsQueryVars {
  familyId?: string | null
  pagination?: Pagination | null
}

export interface OvaTemplateVersionsQueryResult {
  ovaTemplateVersions: OvaTemplateVersionConnection
}

export interface CreateOvaTemplateVersionInput {
  version: string
  ovaIdentifier: string
  notes?: string | null
}

export interface CreateOvaTemplateFamilyInput {
  name: string
  type: AgentType
  description: string
  tools: string[]
  scenarios: string[]
  skills: string[]
  iconShape: string
  iconColor: OvaTemplateColor
  initialVersion: CreateOvaTemplateVersionInput
}

export interface AddOvaTemplateVersionInput {
  familyId: string
  version: string
  ovaIdentifier: string
  notes?: string | null
}

export interface CreateOvaTemplateFamilyPayload {
  family: OvaTemplateFamily
}

export interface AddOvaTemplateVersionPayload {
  version: OvaTemplateVersion
}

export interface CreateOvaTemplateFamilyVars {
  input: CreateOvaTemplateFamilyInput
}

export interface AddOvaTemplateVersionVars {
  input: AddOvaTemplateVersionInput
}

/* ============================================================
 * Deploy Agent (create-from-OVA)
 *
 * The marketplace deploys a NEW agent from an OVA template version. Deploy ISSUES
 * the gateway key itself and returns its secret ONCE via `virtualKeySecret` — the
 * marketplace has no separate VirtualKey concept (that collided with the real
 * LiteLLM VirtualKey type; see queries/virtual-keys.ts + VirtualKeyView.vue).
 * ============================================================ */

export interface DeployAgentInput {
  /** Display name for the new agent (and its cloned VM). */
  name: string
  /** OVA family (its type becomes the agent kind) + the version to clone from. */
  templateFamilyId: string
  templateVersionId: string
  /** Target vCenter resource pool. */
  resourcePoolId: string
  /**
   * Optional vSphere resource-pool inventory PATH to place the VM clone in
   * (VsphereResourcePool.path, e.g. "/DC0/host/DC0_C0/Resources"). A true OVA
   * template has no source resource pool, so a real deploy must supply one or
   * the clone fails ("source has no resource pool; specify resourcePool").
   * Empty = inherit the source template's pool (only valid for regular-VM sources).
   */
  targetResourcePool?: string | null
  /** Optional cloud-init hostname for the VM. */
  hostname?: string | null
  /** Optional per-key spend cap handed to the gateway. */
  maxBudget?: number | null
}

export interface DeployAgentPayload {
  agent: Agent
  /** The issued virtual-key secret — returned ONCE; show in a reveal dialog. */
  virtualKeySecret: string
  templateVersion: OvaTemplateVersion
  resourcePool: ResourcePool
}

export interface DeployAgentVars {
  input: DeployAgentInput
}

/**
 * A vCenter resource pool offered as a placement target for the cloned VM.
 * `path` is the inventory path (e.g. "/DC0/host/DC0_C0/Resources") sent as
 * DeployAgentInput.targetResourcePool; `name` is the human label.
 */
export interface VsphereResourcePool {
  name: string
  path: string
}

export interface VsphereResourcePoolsQueryVars {
  resourcePoolId: string
}

export interface VsphereResourcePoolsQueryResult {
  vsphereResourcePools: VsphereResourcePool[]
}