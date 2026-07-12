/**
 * GraphQL types — agents (Agent / AgentApiKey / pagination / sort / filter /
 * view-key mappings). Mirrors the backend schema; replace with codegen
 * output when available.
 */
export type AgentStatus = 'running' | 'stopped' | 'provisioning' | 'exception'

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
  /** VM guest IP address (queried from vCenter). */
  ip: string
  /** Pre-built SSH command string, e.g. "ssh admin@172.16.85.200". */
  sshCommand: string
  /** Human-readable password hint (platform never stores plaintext). */
  passwordHint: string
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
  owner: { displayName: string; email: string } | null
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

export interface AgentQueryVars {
  id: string
}

export interface AgentQueryResult {
  agent: Agent
}

/* ---------- View-layer mappings ---------- */

/** Lower-case status used in views / i18n keys. */
export type StatusKey = 'running' | 'stopped' | 'provisioning' | 'exception'

export const STATUS_FROM_GQL: Record<AgentStatus, StatusKey> = {
  running: 'running',
  stopped: 'stopped',
  provisioning: 'provisioning',
  exception: 'exception',
}

export const STATUS_TO_GQL: Record<StatusKey, AgentStatus> = {
  running: 'running',
  stopped: 'stopped',
  provisioning: 'provisioning',
  exception: 'exception',
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

/* ---- Agent row mutations (list page actions) ---- */

export interface SetAgentStatusVars {
  id: string
  status: AgentStatus
}
export interface SetAgentStatusResult {
  setAgentStatus: Pick<Agent, 'id' | 'status' | 'updatedAt'>
}

export interface RecycleAgentVars {
  input: {
    agentId: string
    /** Destructive op double-confirm — the backend rejects false. */
    confirm: boolean
  }
}
export interface RecycleAgentResult {
  recycleAgent: Pick<Agent, 'id' | 'status' | 'updatedAt'>
}

export interface HardDeleteAgentVars {
  input: {
    agentId: string
    /** Destructive op double-confirm — the backend rejects false. */
    confirm: boolean
  }
}
export interface HardDeleteAgentResult {
  hardDeleteAgent: boolean
}

export interface RestartAgentVars {
  id: string
}
export interface RestartAgentResult {
  restartAgent: Pick<Agent, 'id' | 'status' | 'updatedAt'>
}
