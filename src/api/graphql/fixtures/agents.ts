import type {
  Agent,
  AgentConnection,
  AgentFilter,
  AgentSort,
  AgentSortField,
  AgentType,
  AgentStatus,
  AgentsQueryVars,
} from '../types'

/**
 * Local fixture for the Agents query.
 *
 * Modeled on `model-gateways.ts`: a module-level mutable store with
 * monotonic ID assignment, and explicit `createAgentFixture` /
 * `updateAgentFixture` / `deleteAgentFixture` helpers that mutate the
 * store in place. The next `agentsFixture` call reflects the change
 * immediately — same shape the real backend will give us, so swapping
 * fixtureLink for HttpLink is a one-line change in `client.ts`.
 *
 * The 12 records mirror the design-image sample distribution (3 statuses,
 * 5 type enums, 5 owners, 4 key names) so the page can be demoed as-is.
 */
const INITIAL_AGENTS: Agent[] = [
  {
    id: 'a01',
    name: 'OpenClaw_Robot',
    type: 'PYTHON_AUTOMATION',
    typeLabel: 'Python自动化',
    status: 'RUNNING',
    apiKey: { id: 'k01', name: 'OpenClaw Primary Key' },
    owner: { id: 'u1', displayName: 'Admin', email: 'admin@openclaw.io' },
    createdAt: '2026-04-12T10:00:00Z',
    updatedAt: '2026-06-15T09:00:00Z',
    endpoint: 'https://agents.openclaw.io/r/robot',
  },
  {
    id: 'a02',
    name: 'Hermes_Assistant',
    type: 'GENERAL_CHAT',
    typeLabel: 'Hermes (通用聊天)',
    status: 'STOPPED',
    apiKey: { id: 'k01', name: 'OpenClaw Primary Key' },
    owner: { id: 'u2', displayName: 'User_01', email: 'user01@openclaw.io' },
    createdAt: '2026-04-15T10:00:00Z',
    updatedAt: '2026-06-14T09:00:00Z',
    endpoint: 'https://agents.openclaw.io/r/hermes1',
  },
  {
    id: 'a03',
    name: 'Hermes_Assistant',
    type: 'GENERAL_CHAT',
    typeLabel: 'General Conversation (通用聊天)',
    status: 'RUNNING',
    apiKey: { id: 'k02', name: 'Hermes Conversation Key' },
    owner: { id: 'u2', displayName: 'User_01', email: 'user01@openclaw.io' },
    createdAt: '2026-04-20T10:00:00Z',
    updatedAt: '2026-06-16T09:00:00Z',
    endpoint: 'https://agents.openclaw.io/r/hermes2',
  },
  {
    id: 'a04',
    name: 'OpenCode',
    type: 'CODE_ANALYSIS',
    typeLabel: 'Code Code (代码解析)',
    status: 'ERROR',
    apiKey: { id: 'k03', name: 'OpenCode Access Key' },
    owner: { id: 'u3', displayName: 'Developer_A', email: 'dev.a@openclaw.io' },
    createdAt: '2026-05-01T10:00:00Z',
    updatedAt: '2026-06-17T09:00:00Z',
    endpoint: 'https://agents.openclaw.io/r/opencode',
  },
  {
    id: 'a05',
    name: 'Hermes_Assistant',
    type: 'GENERAL_CHAT',
    typeLabel: 'General Conversation (通用聊天)',
    status: 'RUNNING',
    apiKey: { id: 'k03', name: 'OpenCode Access Key' },
    owner: { id: 'u2', displayName: 'User_01', email: 'user01@openclaw.io' },
    createdAt: '2026-05-05T10:00:00Z',
    updatedAt: '2026-06-17T09:00:00Z',
    endpoint: 'https://agents.openclaw.io/r/hermes3',
  },
  {
    id: 'a06',
    name: 'Hermes_Assistant',
    type: 'GENERAL_CHAT',
    typeLabel: 'Hermes (通用聊天)',
    status: 'RUNNING',
    apiKey: { id: 'k03', name: 'OpenCode Access Key' },
    owner: { id: 'u5', displayName: 'User_02', email: 'user02@openclaw.io' },
    createdAt: '2026-05-08T10:00:00Z',
    updatedAt: '2026-06-17T09:00:00Z',
    endpoint: 'https://agents.openclaw.io/r/hermes4',
  },
  {
    id: 'a07',
    name: 'Hermes_Assistant',
    type: 'GENERAL_CHAT',
    typeLabel: 'General Conversation (通用聊天)',
    status: 'STOPPED',
    apiKey: { id: 'k04', name: 'Key Hermes Main' },
    owner: { id: 'u5', displayName: 'User_02', email: 'user02@openclaw.io' },
    createdAt: '2026-05-12T10:00:00Z',
    updatedAt: '2026-06-16T09:00:00Z',
    endpoint: 'https://agents.openclaw.io/r/hermes5',
  },
  {
    id: 'a08',
    name: 'OpenClaw_Robot',
    type: 'PYTHON_AUTOMATION',
    typeLabel: 'Python自动化',
    status: 'STOPPED',
    apiKey: { id: 'k01', name: 'OpenClaw Primary Key' },
    owner: { id: 'u1', displayName: 'Admin', email: 'admin@openclaw.io' },
    createdAt: '2026-05-15T10:00:00Z',
    updatedAt: '2026-06-15T09:00:00Z',
    endpoint: 'https://agents.openclaw.io/r/robot2',
  },
  {
    id: 'a09',
    name: 'DataInsight',
    type: 'DATA_ANALYSIS',
    typeLabel: 'Data Insight (数据分析)',
    status: 'RUNNING',
    apiKey: { id: 'k02', name: 'Hermes Conversation Key' },
    owner: { id: 'u3', displayName: 'Developer_A', email: 'dev.a@openclaw.io' },
    createdAt: '2026-05-18T10:00:00Z',
    updatedAt: '2026-06-17T09:00:00Z',
    endpoint: 'https://agents.openclaw.io/r/insight',
  },
  {
    id: 'a10',
    name: 'ImageGen',
    type: 'IMAGE_GENERATION',
    typeLabel: 'Image Generation (图像生成)',
    status: 'ERROR',
    apiKey: { id: 'k04', name: 'Key Hermes Main' },
    owner: { id: 'u4', displayName: 'Developer_B', email: 'dev.b@openclaw.io' },
    createdAt: '2026-05-20T10:00:00Z',
    updatedAt: '2026-06-17T09:00:00Z',
    endpoint: 'https://agents.openclaw.io/r/img',
  },
  {
    id: 'a11',
    name: 'Hermes_Assistant',
    type: 'GENERAL_CHAT',
    typeLabel: 'Hermes (通用聊天)',
    status: 'RUNNING',
    apiKey: { id: 'k01', name: 'OpenClaw Primary Key' },
    owner: { id: 'u2', displayName: 'User_01', email: 'user01@openclaw.io' },
    createdAt: '2026-05-22T10:00:00Z',
    updatedAt: '2026-06-17T09:00:00Z',
    endpoint: 'https://agents.openclaw.io/r/hermes6',
  },
  {
    id: 'a12',
    name: 'CodeRefactor',
    type: 'CODE_ANALYSIS',
    typeLabel: 'Code Refactor (代码解析)',
    status: 'STOPPED',
    apiKey: { id: 'k03', name: 'OpenCode Access Key' },
    owner: { id: 'u4', displayName: 'Developer_B', email: 'dev.b@openclaw.io' },
    createdAt: '2026-05-25T10:00:00Z',
    updatedAt: '2026-06-16T09:00:00Z',
    endpoint: 'https://agents.openclaw.io/r/refactor',
  },
]

let agents = INITIAL_AGENTS.map((agent) => ({ ...agent }))
let nextID = 13

const TYPE_LABEL_DISPLAY: Record<AgentType, string> = {
  PYTHON_AUTOMATION: 'Python自动化',
  GENERAL_CHAT: '通用聊天',
  CODE_ANALYSIS: '代码解析',
  DATA_ANALYSIS: '数据分析',
  IMAGE_GENERATION: '图像生成',
}

const STATUS_RANK: Record<AgentStatus, number> = {
  RUNNING: 0,
  STOPPED: 1,
  ERROR: 2,
}

/* ---------- Pure query helpers ---------- */

function applyFilter(arr: Agent[], filter?: AgentFilter | null): Agent[] {
  if (!filter) return arr
  return arr.filter((a) => {
    if (filter.status && a.status !== filter.status) return false
    if (filter.type && a.type !== filter.type) return false
    if (filter.nameKeyword && !a.name.toLowerCase().includes(filter.nameKeyword.toLowerCase())) {
      return false
    }
    if (filter.keyKeyword) {
      const kw = filter.keyKeyword.toLowerCase()
      const name = a.apiKey?.name?.toLowerCase() ?? ''
      if (!name.includes(kw)) return false
    }
    if (filter.ownerKeyword) {
      const kw = filter.ownerKeyword.toLowerCase()
      const display = a.owner?.displayName?.toLowerCase() ?? ''
      const email = a.owner?.email?.toLowerCase() ?? ''
      if (!display.includes(kw) && !email.includes(kw)) return false
    }
    return true
  })
}

function compareBy(field: AgentSortField, a: Agent, b: Agent): number {
  switch (field) {
    case 'NAME':
      return a.name.localeCompare(b.name)
    case 'TYPE':
      return (TYPE_LABEL_DISPLAY[a.type] ?? a.type).localeCompare(TYPE_LABEL_DISPLAY[b.type] ?? b.type)
    case 'STATUS':
      return STATUS_RANK[a.status] - STATUS_RANK[b.status]
    case 'API_KEY_NAME':
      return (a.apiKey?.name ?? '').localeCompare(b.apiKey?.name ?? '')
    case 'OWNER':
      return (a.owner?.displayName ?? '').localeCompare(b.owner?.displayName ?? '')
    case 'CREATED_AT':
      return a.createdAt.localeCompare(b.createdAt)
    case 'UPDATED_AT':
      return a.updatedAt.localeCompare(b.updatedAt)
    default:
      return 0
  }
}

function applySort(arr: Agent[], sort?: AgentSort | null): Agent[] {
  if (!sort) return arr
  const dir = sort.direction === 'DESC' ? -1 : 1
  return [...arr].sort((a, b) => dir * compareBy(sort.field, a, b))
}

export function agentsFixture(vars?: AgentsQueryVars): AgentConnection {
  const filtered = applyFilter(agents, vars?.filter)
  const sorted = applySort(filtered, vars?.sort)
  const page = vars?.pagination?.page ?? 1
  const pageSize = vars?.pagination?.pageSize ?? 10
  const totalCount = sorted.length
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize))
  const start = (page - 1) * pageSize
  return {
    nodes: sorted.slice(start, start + pageSize),
    totalCount,
    pageInfo: { page, pageSize, totalPages },
  }
}
