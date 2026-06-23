import type {
  CreateModelGatewayVars,
  DeleteModelGatewayVars,
  ModelGateway,
  ModelGatewayInput,
  ModelGatewaysQueryVars,
  ModelGatewaySyncSummary,
  TestModelGatewayConnectionVars,
  UpdateModelGatewayVars,
} from '../model-gateway-types'

const INITIAL_GATEWAYS: ModelGateway[] = [
  {
    id: 'gw-01',
    name: 'LiteLLM_Router_1',
    provider: 'LITELLM',
    endpoint: 'https://litellm.router.vcon',
    status: 'CONNECTED',
    backendModelCount: 3,
    loadBalancingStrategy: 'ROUND_ROBIN',
    latencyMs: 120,
    adminUrl: 'https://litellm.router.vcon/ui',
    lastSyncAt: '2026-06-23T07:45:00Z',
    lastSyncStatus: 'SYNCED',
    lastSyncMessage: '模型目录、轮询策略与连接状态同步完成。',
  },
  {
    id: 'gw-02',
    name: 'LiteLLM_Router_2',
    provider: 'LITELLM',
    endpoint: 'https://litellm.router.vcon',
    status: 'DISCONNECTED',
    backendModelCount: 3,
    loadBalancingStrategy: 'ROUND_ROBIN',
    latencyMs: 120,
    adminUrl: 'https://litellm.router.vcon/ui',
    lastSyncAt: '2026-06-23T07:40:00Z',
    lastSyncStatus: 'FAILED',
    lastSyncMessage: '无法连接到 LiteLLM Proxy。',
  },
  {
    id: 'gw-03',
    name: 'LiteLLM_Router_3',
    provider: 'LITELLM',
    endpoint: 'https://litellm.router.vcon',
    status: 'DISCONNECTED',
    backendModelCount: 2,
    loadBalancingStrategy: 'ROUND_ROBIN',
    latencyMs: 120,
    adminUrl: 'https://litellm.router.vcon/ui',
    lastSyncAt: '2026-06-23T07:35:00Z',
    lastSyncStatus: 'FAILED',
    lastSyncMessage: '连接测试超时。',
  },
  {
    id: 'gw-04',
    name: 'LiteLLM_Router_4',
    provider: 'LITELLM',
    endpoint: 'https://litellm.router.vcon',
    status: 'DISCONNECTED',
    backendModelCount: 3,
    loadBalancingStrategy: 'ROUND_ROBIN',
    latencyMs: 120,
    adminUrl: 'https://litellm.router.vcon/ui',
    lastSyncAt: '2026-06-23T07:30:00Z',
    lastSyncStatus: 'FAILED',
    lastSyncMessage: '连接测试超时。',
  },
]

let gateways = INITIAL_GATEWAYS.map((gateway) => ({ ...gateway }))
let nextID = 5

function gatewayResult(gateway: ModelGateway) {
  return { __typename: 'ModelGateway' as const, ...gateway }
}

function sanitizeInput(input: ModelGatewayInput): Omit<ModelGatewayInput, 'masterKey'> {
  return {
    name: input.name,
    provider: input.provider,
    endpoint: input.endpoint,
    adminUrl: input.adminUrl,
    loadBalancingStrategy: input.loadBalancingStrategy,
  }
}

function syncSummary(): ModelGatewaySyncSummary {
  const successful = gateways.filter((gateway) => gateway.lastSyncStatus === 'SYNCED')
  const failed = gateways.filter((gateway) => gateway.lastSyncStatus === 'FAILED')
  const lastSyncedAt =
    gateways
      .map((gateway) => gateway.lastSyncAt)
      .filter((value): value is string => Boolean(value))
      .sort()
      .at(-1) ?? null

  return {
    state:
      failed.length === 0
        ? gateways.length === 0
          ? 'NEVER'
          : 'SYNCED'
        : successful.length > 0
          ? 'PARTIAL'
          : 'FAILED',
    lastSyncedAt,
    successCount: successful.length,
    failedCount: failed.length,
    message:
      gateways.length === 0
        ? '尚未接入模型网关。'
        : failed.length === 0
          ? '所有 LiteLLM 网关已完成同步。'
          : `${successful.length} 个网关同步成功，${failed.length} 个网关需要处理。`,
  }
}

export function modelGatewaysFixture(vars: ModelGatewaysQueryVars) {
  const search = vars.filter?.search?.trim().toLocaleLowerCase() ?? ''
  const status = vars.filter?.status
  const filtered = gateways.filter((gateway) => {
    if (status && gateway.status !== status) return false
    if (!search) return true
    return (
      gateway.name.toLocaleLowerCase().includes(search) ||
      gateway.endpoint.toLocaleLowerCase().includes(search)
    )
  })
  const offset = Math.max(0, vars.page?.offset ?? 0)
  const limit = Math.max(1, vars.page?.limit ?? 10)
  return {
    modelGateways: {
      nodes: filtered.slice(offset, offset + limit).map(gatewayResult),
      totalCount: filtered.length,
    },
    modelGatewaySyncSummary: syncSummary(),
  }
}

export function createModelGatewayFixture(vars: CreateModelGatewayVars) {
  const safe = sanitizeInput(vars.input)
  const now = new Date().toISOString()
  const gateway: ModelGateway = {
    id: `gw-${String(nextID++).padStart(2, '0')}`,
    ...safe,
    adminUrl: safe.adminUrl ?? null,
    status: 'DISCONNECTED',
    backendModelCount: 0,
    latencyMs: null,
    lastSyncAt: now,
    lastSyncStatus: 'NEVER',
    lastSyncMessage: '网关已保存，等待连接测试。',
  }
  gateways = [gateway, ...gateways]
  return { createModelGateway: gatewayResult(gateway) }
}

export function updateModelGatewayFixture(vars: UpdateModelGatewayVars) {
  const index = gateways.findIndex((gateway) => gateway.id === vars.id)
  if (index < 0) throw new Error('Model gateway not found')
  const safe = sanitizeInput(vars.input)
  const updated: ModelGateway = {
    ...gateways[index],
    ...safe,
    adminUrl: safe.adminUrl ?? null,
    lastSyncMessage: '网关配置已更新，等待重新测试。',
  }
  gateways = gateways.map((gateway, gatewayIndex) => (gatewayIndex === index ? updated : gateway))
  return { updateModelGateway: gatewayResult(updated) }
}

export function deleteModelGatewayFixture(vars: DeleteModelGatewayVars) {
  if (!gateways.some((gateway) => gateway.id === vars.id)) {
    throw new Error('Model gateway not found')
  }
  gateways = gateways.filter((gateway) => gateway.id !== vars.id)
  return { deleteModelGateway: { deletedID: vars.id } }
}

export function testModelGatewayConnectionFixture(vars: TestModelGatewayConnectionVars) {
  const index = gateways.findIndex((gateway) => gateway.id === vars.id)
  if (index < 0) throw new Error('Model gateway not found')
  const testedAt = new Date().toISOString()
  const updated: ModelGateway = {
    ...gateways[index],
    status: 'CONNECTED',
    latencyMs: 120,
    backendModelCount: Math.max(gateways[index].backendModelCount, 3),
    lastSyncAt: testedAt,
    lastSyncStatus: 'SYNCED',
    lastSyncMessage: '连接测试成功，LiteLLM 配置已同步。',
  }
  gateways = gateways.map((gateway, gatewayIndex) => (gatewayIndex === index ? updated : gateway))
  return {
    testModelGatewayConnection: {
      success: true,
      status: updated.status,
      latencyMs: updated.latencyMs,
      message: updated.lastSyncMessage,
      testedAt,
      gateway: gatewayResult(updated),
    },
  }
}
