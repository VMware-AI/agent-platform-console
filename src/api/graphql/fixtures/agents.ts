import type {
  Agent,
  AgentConnection,
  AgentFilter,
  AgentSort,
  AgentSortField,
  AgentType,
  AgentStatus,
  AgentsQueryVars,
  DeployAgentInput,
} from '../types'
import { findOvaTemplateVersion, findOvaTemplateFamily } from './ovaTemplates'
import { findResourcePool } from './resourcePools'
import {
  findVirtualKey,
  createVirtualKeyInFixture,
  bindVirtualKeyInFixture,
} from './virtualKeys'
import { passwordMeets } from '../../../composables/usePasswordComplexity'
import type { VirtualKey } from '../types'
import { TYPE_FROM_GQL } from '../types'

/**
 * Local fixture for the Agents query.
 *
 * v3 migration (2026-06): removed `owner` field, added `credentials` field
 * (internal run-as username + password hash), and replaced the shared
 * 4-key fixture pool with 12 BOUND VirtualKeys (1:1 binding). Each agent
 * also records which `templateFamilyId`/`templateVersionId`/`resourcePoolId`
 * it was deployed from.
 *
 * Modeled on `model-gateways.ts`: a module-level mutable store with
 * monotonic ID assignment. The next `agentsFixture` call reflects the
 * change immediately — same shape the real backend will give us, so
 * swapping fixtureLink for HttpLink is a one-line change in `client.ts`.
 */
const INITIAL_AGENTS: Agent[] = [
  {
    id: 'a01',
    name: 'OpenClaw_Robot',
    type: 'OPENCLAW',
    status: 'RUNNING',
    apiKey: { id: 'vk01', name: 'LiteLLM 主网关 - Key #01' },
    credentials: { username: 'svc_openclaw_robot', passwordHash: fakeHash('OpenClaw2026!abc') },
    createdAt: '2026-04-12T10:00:00Z',
    updatedAt: '2026-06-15T09:00:00Z',
    endpoint: 'https://agents.openclaw.io/r/robot',
    templateFamilyId: 'fam01', templateVersionId: 'fam01-v1', resourcePoolId: 'rp01',
  },
  {
    id: 'a02',
    name: 'Hermes_Assistant',
    type: 'GENERAL_CHAT',
    status: 'STOPPED',
    apiKey: { id: 'vk02', name: 'LiteLLM 备份网关 - Key #02' },
    credentials: { username: 'svc_hermes_01', passwordHash: fakeHash('Hermes2026!xyz') },
    createdAt: '2026-04-15T10:00:00Z',
    updatedAt: '2026-06-14T09:00:00Z',
    endpoint: 'https://agents.openclaw.io/r/hermes1',
    templateFamilyId: 'fam02', templateVersionId: 'fam02-v1', resourcePoolId: 'rp02',
  },
  {
    id: 'a03',
    name: 'Hermes_Assistant',
    type: 'GENERAL_CHAT',
    status: 'RUNNING',
    apiKey: { id: 'vk03', name: 'Azure OpenAI - Key #03' },
    credentials: { username: 'svc_hermes_02', passwordHash: fakeHash('Hermes2026!002') },
    createdAt: '2026-04-20T10:00:00Z',
    updatedAt: '2026-06-16T09:00:00Z',
    endpoint: 'https://agents.openclaw.io/r/hermes2',
    templateFamilyId: 'fam02', templateVersionId: 'fam02-v1', resourcePoolId: 'rp03',
  },
  {
    id: 'a04',
    name: 'OpenCode',
    type: 'OPENCODE',
    status: 'ERROR',
    apiKey: { id: 'vk04', name: 'LiteLLM 主网关 - Key #04' },
    credentials: { username: 'svc_opencode', passwordHash: fakeHash('OpenCode2026!') },
    createdAt: '2026-05-01T10:00:00Z',
    updatedAt: '2026-06-17T09:00:00Z',
    endpoint: 'https://agents.openclaw.io/r/opencode',
    templateFamilyId: 'fam03', templateVersionId: 'fam03-v1', resourcePoolId: 'rp04',
  },
  {
    id: 'a05',
    name: 'Hermes_Assistant',
    type: 'GENERAL_CHAT',
    status: 'RUNNING',
    apiKey: { id: 'vk05', name: 'LiteLLM 备份网关 - Key #05' },
    credentials: { username: 'svc_hermes_03', passwordHash: fakeHash('Hermes2026!003') },
    createdAt: '2026-05-05T10:00:00Z',
    updatedAt: '2026-06-17T09:00:00Z',
    endpoint: 'https://agents.openclaw.io/r/hermes3',
    templateFamilyId: 'fam02', templateVersionId: 'fam02-v1', resourcePoolId: 'rp05',
  },
  {
    id: 'a06',
    name: 'Hermes_Assistant',
    type: 'GENERAL_CHAT',
    status: 'RUNNING',
    apiKey: { id: 'vk06', name: 'Azure OpenAI - Key #06' },
    credentials: { username: 'svc_hermes_04', passwordHash: fakeHash('Hermes2026!004') },
    createdAt: '2026-05-08T10:00:00Z',
    updatedAt: '2026-06-17T09:00:00Z',
    endpoint: 'https://agents.openclaw.io/r/hermes4',
    templateFamilyId: 'fam02', templateVersionId: 'fam02-v1', resourcePoolId: 'rp06',
  },
  {
    id: 'a07',
    name: 'Hermes_Assistant',
    type: 'GENERAL_CHAT',
    status: 'STOPPED',
    apiKey: { id: 'vk07', name: 'LiteLLM 主网关 - Key #07' },
    credentials: { username: 'svc_hermes_05', passwordHash: fakeHash('Hermes2026!005') },
    createdAt: '2026-05-12T10:00:00Z',
    updatedAt: '2026-06-16T09:00:00Z',
    endpoint: 'https://agents.openclaw.io/r/hermes5',
    templateFamilyId: 'fam02', templateVersionId: 'fam02-v1', resourcePoolId: 'rp07',
  },
  {
    id: 'a08',
    name: 'OpenClaw_Robot',
    type: 'OPENCLAW',
    status: 'STOPPED',
    apiKey: { id: 'vk08', name: 'LiteLLM 备份网关 - Key #08' },
    credentials: { username: 'svc_openclaw_robot_2', passwordHash: fakeHash('OpenClaw2026!8') },
    createdAt: '2026-05-15T10:00:00Z',
    updatedAt: '2026-06-15T09:00:00Z',
    endpoint: 'https://agents.openclaw.io/r/robot2',
    templateFamilyId: 'fam01', templateVersionId: 'fam01-v1', resourcePoolId: 'rp08',
  },
  {
    id: 'a09',
    name: 'DataInsight',
    type: 'QCODER',
    status: 'RUNNING',
    apiKey: { id: 'vk09', name: 'Azure OpenAI - Key #09' },
    credentials: { username: 'svc_datainsight', passwordHash: fakeHash('Data2026!insight') },
    createdAt: '2026-05-18T10:00:00Z',
    updatedAt: '2026-06-17T09:00:00Z',
    endpoint: 'https://agents.openclaw.io/r/insight',
    templateFamilyId: 'fam05', templateVersionId: 'fam05-v1', resourcePoolId: 'rp09',
  },
  {
    id: 'a10',
    name: 'ImageGen',
    type: 'IMAGE_GENERATION',
    status: 'ERROR',
    apiKey: { id: 'vk10', name: 'LiteLLM 主网关 - Key #10' },
    credentials: { username: 'svc_imagegen', passwordHash: fakeHash('Image2026!gen') },
    createdAt: '2026-05-20T10:00:00Z',
    updatedAt: '2026-06-17T09:00:00Z',
    endpoint: 'https://agents.openclaw.io/r/img',
    templateFamilyId: 'fam06', templateVersionId: 'fam06-v1', resourcePoolId: 'rp10',
  },
  {
    id: 'a11',
    name: 'Hermes_Assistant',
    type: 'GENERAL_CHAT',
    status: 'RUNNING',
    apiKey: { id: 'vk11', name: 'LiteLLM 备份网关 - Key #11' },
    credentials: { username: 'svc_hermes_06', passwordHash: fakeHash('Hermes2026!006') },
    createdAt: '2026-05-22T10:00:00Z',
    updatedAt: '2026-06-17T09:00:00Z',
    endpoint: 'https://agents.openclaw.io/r/hermes6',
    templateFamilyId: 'fam02', templateVersionId: 'fam02-v1', resourcePoolId: 'rp11',
  },
  {
    id: 'a12',
    name: 'CodeRefactor',
    type: 'OPENCODE',
    status: 'STOPPED',
    apiKey: { id: 'vk12', name: 'Azure OpenAI - Key #12' },
    credentials: { username: 'svc_coderefactor', passwordHash: fakeHash('CodeRefactor2026!') },
    createdAt: '2026-05-25T10:00:00Z',
    updatedAt: '2026-06-16T09:00:00Z',
    endpoint: 'https://agents.openclaw.io/r/refactor',
    templateFamilyId: 'fam03', templateVersionId: 'fam03-v1', resourcePoolId: 'rp12',
  },
]

/** Pretend SHA — used only so the fixture record has something opaque in
 *  `passwordHash`. Real hashing would happen at the backend, not here. */
function fakeHash(plaintext: string): string {
  let h = 0
  for (let i = 0; i < plaintext.length; i++) {
    h = (h * 31 + plaintext.charCodeAt(i)) >>> 0
  }
  return `sha256$${h.toString(16).padStart(8, '0')}$${plaintext.length}`
}

const agents = INITIAL_AGENTS.map((agent) => ({ ...agent }))
let nextID = 13

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
    if (filter.usernameKeyword) {
      const kw = filter.usernameKeyword.toLowerCase()
      if (!a.credentials.username.toLowerCase().includes(kw)) return false
    }
    return true
  })
}

function compareBy(field: AgentSortField, a: Agent, b: Agent): number {
  switch (field) {
    case 'NAME':
      return a.name.localeCompare(b.name)
    case 'TYPE':
      return TYPE_FROM_GQL[a.type].localeCompare(TYPE_FROM_GQL[b.type])
    case 'STATUS':
      return STATUS_RANK[a.status] - STATUS_RANK[b.status]
    case 'API_KEY_NAME':
      return (a.apiKey?.name ?? '').localeCompare(b.apiKey?.name ?? '')
    case 'USERNAME':
      return a.credentials.username.localeCompare(b.credentials.username)
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

/* ---------- Deploy Agent from OVA Template Version ----------
 * Validates inputs, picks or creates a VirtualKey, binds it 1:1 to the
 * new agent, and pushes the agent into the store. */
export function deployAgentInFixture(
  input: DeployAgentInput,
  now: string,
): { agent: Agent; virtualKey: VirtualKey } {
  // 1. 校验模板版本 + 通过 familyId 反查 family
  const version = findOvaTemplateVersion(input.templateVersionId)
  if (!version) throw new Error(`模板版本不存在: ${input.templateVersionId}`)
  const family = findOvaTemplateFamily(version.familyId)
  if (!family) throw new Error(`模板 family 不存在: ${version.familyId}`)

  // 2. 校验资源池
  const pool = findResourcePool(input.resourcePoolId)
  if (!pool) throw new Error(`资源池不存在: ${input.resourcePoolId}`)

  // 3. 处理 VirtualKey：选已有 / 新建
  let virtualKey: VirtualKey
  if (input.virtualKeyMode === 'USE_EXISTING') {
    const existing = findVirtualKey(input.existingVirtualKeyId ?? '')
    if (!existing) throw new Error(`虚拟密钥不存在: ${input.existingVirtualKeyId}`)
    if (existing.status !== 'AVAILABLE') {
      throw new Error(`虚拟密钥已被绑定: ${existing.boundAgentId}`)
    }
    virtualKey = existing
  } else {
    const { key } = createVirtualKeyInFixture(
      { name: input.newVirtualKeyName ?? '', modelGatewayId: input.modelGatewayId },
      now,
    )
    virtualKey = key
  }

  // 4. 校验运行账户用户名唯一
  if (agents.some((a) => a.credentials.username === input.username)) {
    throw new Error(`运行账户用户名已被占用: ${input.username}`)
  }

  // 5. 校验密码复杂度
  const check = passwordMeets(input.password)
  if (!check.ok) {
    throw new Error(`密码不满足复杂度要求: ${check.reasons.join('; ')}`)
  }

  // 6. 创建 Agent
  const id = `a${String(nextID++).padStart(2, '0')}`
  const slug = input.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  const endpoint = `https://agents.platform.local/r/${slug}-${id}`
  const agent: Agent = {
    id,
    name: input.name,
    type: family.type,
    status: 'RUNNING',
    apiKey: { id: virtualKey.id, name: virtualKey.name },
    credentials: { username: input.username, passwordHash: fakeHash(input.password) },
    createdAt: now,
    updatedAt: now,
    endpoint,
    templateFamilyId: family.id,
    templateVersionId: version.id,
    resourcePoolId: pool.id,
  }
  agents.push(agent)

  // 7. 绑定 VirtualKey → Agent（1:1）
  bindVirtualKeyInFixture(virtualKey.id, id, now)
  virtualKey.boundAgent = agent

  return { agent, virtualKey }
}
