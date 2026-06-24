import type {
  VirtualKey,
  VirtualKeyConnection,
  VirtualKeyFilter,
  CreateVirtualKeyInput,
  ModelGatewayRef,
} from '../types'

/**
 * 3 model gateway refs (also used by the deploy dialog dropdown).
 * These are lightweight refs — the real ModelGateway entity lives in
 * `model-gateways.ts` and is not part of the marketplace schema.
 */
const MODEL_GATEWAYS: ModelGatewayRef[] = [
  { id: 'mg01', name: 'LiteLLM 主网关',   endpoint: 'https://litellm.oc1.platform.local' },
  { id: 'mg02', name: 'LiteLLM 备份网关', endpoint: 'https://litellm-oc1-bk.platform.local' },
  { id: 'mg03', name: 'Azure OpenAI',     endpoint: 'https://aoai.platform.local' },
]

export const modelGatewaysRef: ModelGatewayRef[] = MODEL_GATEWAYS

function generateSecret(): string {
  return `sk-${Math.random().toString(36).slice(2, 10)}${Math.random().toString(36).slice(2, 10)}`
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

/* ---- 12 BOUND keys (paired 1:1 with the 12 initial agents) ---- */
const BOUND: VirtualKey[] = Array.from({ length: 12 }, (_, i) => {
  const i01 = pad2(i + 1)
  const mg = MODEL_GATEWAYS[i % MODEL_GATEWAYS.length]
  return {
    id: `vk${i01}`,
    name: `${mg.name} - Key #${i01}`,
    secret: generateSecret(),
    modelGatewayId: mg.id,
    modelGateway: mg,
    status: 'BOUND',
    boundAgentId: `a${i01}`,
    boundAgent: null,
    createdAt: '2026-04-12T08:00:00Z',
    boundAt: '2026-04-12T08:30:00Z',
  }
})

/* ---- 4 AVAILABLE keys for the deploy dialog ---- */
const AVAILABLE: VirtualKey[] = Array.from({ length: 4 }, (_, i) => {
  const i01 = pad2(i + 13)
  const mg = MODEL_GATEWAYS[i % MODEL_GATEWAYS.length]
  return {
    id: `vk${i01}`,
    name: `${mg.name} - 备用 Key #${i01}`,
    secret: generateSecret(),
    modelGatewayId: mg.id,
    modelGateway: mg,
    status: 'AVAILABLE',
    boundAgentId: null,
    boundAgent: null,
    createdAt: '2026-05-01T08:00:00Z',
    boundAt: null,
  }
})

const keys: VirtualKey[] = [...BOUND, ...AVAILABLE]
let nextID = 17

export const virtualKeysStore: VirtualKey[] = keys

/* ---------- Query helpers ---------- */

export function virtualKeysFixture(filter?: VirtualKeyFilter | null): VirtualKeyConnection {
  const nodes = filter
    ? keys.filter((k) => {
        if (filter.status && k.status !== filter.status) return false
        if (filter.modelGatewayId && k.modelGatewayId !== filter.modelGatewayId) return false
        if (filter.nameKeyword && !k.name.toLowerCase().includes(filter.nameKeyword.toLowerCase())) return false
        return true
      })
    : keys.slice()
  return {
    nodes,
    totalCount: nodes.length,
    pageInfo: { page: 1, pageSize: nodes.length, totalPages: 1 },
  }
}

export function findVirtualKey(id: string): VirtualKey | undefined {
  return keys.find((k) => k.id === id)
}

export function findAvailableVirtualKeys(modelGatewayId?: string | null): VirtualKey[] {
  return keys.filter(
    (k) => k.status === 'AVAILABLE' && (!modelGatewayId || k.modelGatewayId === modelGatewayId),
  )
}

/* ---------- Mutation helpers ---------- */

export function createVirtualKeyInFixture(
  input: CreateVirtualKeyInput,
  now: string,
): { key: VirtualKey; secret: string } {
  const mg = MODEL_GATEWAYS.find((m) => m.id === input.modelGatewayId)
  if (!mg) throw new Error(`ModelGateway 不存在: ${input.modelGatewayId}`)
  const id = `vk${String(nextID++).padStart(2, '0')}`
  const secret = generateSecret()
  const key: VirtualKey = {
    id,
    name: input.name,
    secret,
    modelGatewayId: mg.id,
    modelGateway: mg,
    status: 'AVAILABLE',
    boundAgentId: null,
    boundAgent: null,
    createdAt: now,
    boundAt: null,
  }
  keys.push(key)
  return { key, secret }
}

export function bindVirtualKeyInFixture(id: string, agentId: string, now: string): VirtualKey {
  const k = keys.find((x) => x.id === id)
  if (!k) throw new Error(`VirtualKey 不存在: ${id}`)
  if (k.status === 'BOUND') throw new Error(`VirtualKey 已被绑定: ${k.boundAgentId}`)
  k.status = 'BOUND'
  k.boundAgentId = agentId
  k.boundAt = now
  return k
}

export function revokeVirtualKeyInFixture(id: string, _now: string): VirtualKey {
  const k = keys.find((x) => x.id === id)
  if (!k) throw new Error(`VirtualKey 不存在: ${id}`)
  k.status = 'REVOKED'
  return k
}
