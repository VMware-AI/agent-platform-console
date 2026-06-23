import type {
  Agent,
  AgentConnection,
  AgentsQueryVars,
} from '../types'

/**
 * Local fixture for the Agents query.
 *
 * Apollo client wires a fixtureLink that intercepts the `Agents` operation
 * and returns this data with a small simulated latency. Once the real backend
 * is reachable, drop the fixtureLink and the data layer stays identical.
 *
 * The 12 records mirror the design-image sample distribution (3 statuses,
 * 5 type enums, 5 owners, 4 key names) so the page can be demoed as-is.
 */
const AGENTS: Agent[] = [
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

const TYPE_LABEL_DISPLAY: Record<string, string> = {
  PYTHON_AUTOMATION: 'Python自动化',
  GENERAL_CHAT: '通用聊天',
  CODE_ANALYSIS: '代码解析',
  DATA_ANALYSIS: '数据分析',
  IMAGE_GENERATION: '图像生成',
}

function applyFilter(arr: Agent[], filter?: AgentsQueryVars['filter']): Agent[] {
  if (!filter) return arr
  return arr.filter((a) => {
    if (filter.status && a.status !== filter.status) return false
    if (filter.type && a.type !== filter.type) return false
    return true
  })
}

function applySort(
  arr: Agent[],
  sort?: AgentsQueryVars['sort'],
): Agent[] {
  if (!sort) return arr
  const out = [...arr]
  const dir = sort.direction === 'ASC' ? 1 : -1
  out.sort((a, b) => {
    let av: string
    let bv: string
    switch (sort.field) {
      case 'NAME':
        av = a.name
        bv = b.name
        break
      case 'TYPE':
        av = TYPE_LABEL_DISPLAY[a.type] ?? a.type
        bv = TYPE_LABEL_DISPLAY[b.type] ?? b.type
        break
      case 'STATUS':
        av = a.status
        bv = b.status
        break
      case 'API_KEY_NAME':
        av = a.apiKey?.name ?? ''
        bv = b.apiKey?.name ?? ''
        break
      case 'OWNER':
        av = a.owner?.displayName ?? ''
        bv = b.owner?.displayName ?? ''
        break
      case 'CREATED_AT':
        av = a.createdAt
        bv = b.createdAt
        break
      case 'UPDATED_AT':
        av = a.updatedAt
        bv = b.updatedAt
        break
      default:
        return 0
    }
    return av.localeCompare(bv) * dir
  })
  return out
}

export function agentsFixture(vars?: AgentsQueryVars): AgentConnection {
  const filtered = applySort(applyFilter(AGENTS, vars?.filter), vars?.sort)

  const page = vars?.pagination?.page ?? 1
  const pageSize = vars?.pagination?.pageSize ?? 10
  const totalCount = filtered.length
  const start = (page - 1) * pageSize
  const nodes = filtered.slice(start, start + pageSize)
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize))

  return {
    nodes,
    totalCount,
    pageInfo: { page, pageSize, totalPages },
  }
}