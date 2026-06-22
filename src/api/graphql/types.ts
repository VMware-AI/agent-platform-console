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