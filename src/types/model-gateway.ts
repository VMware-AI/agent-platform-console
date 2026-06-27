export type ModelGatewayProvider = 'LITELLM'

export type ModelGatewayStatus = 'CONNECTED' | 'DISCONNECTED' | 'ERROR'

export type ModelGatewaySyncState = 'SYNCED' | 'SYNCING' | 'PARTIAL' | 'FAILED' | 'NEVER'

export type LoadBalancingStrategy = 'ROUND_ROBIN'

export type ModelGatewaySortField = 'NAME' | 'ENDPOINT' | 'STATUS' | 'CREATED_AT' | 'UPDATED_AT'

export type SortDirection = 'ASC' | 'DESC'

export interface ModelGatewaySort {
  field: ModelGatewaySortField
  direction: SortDirection
}

export interface ModelGateway {
  id: string
  name: string
  provider: ModelGatewayProvider
  endpoint: string
  status: ModelGatewayStatus
  loadBalancingStrategy: LoadBalancingStrategy
  latencyMs: number | null
  adminUrl: string | null
  lastSyncAt: string | null
  lastSyncStatus: ModelGatewaySyncState
  lastSyncMessage: string | null
  createdAt: string
  updatedAt: string
}

export interface ModelGatewayConnection {
  nodes: ModelGateway[]
  totalCount: number
}

export interface ModelGatewaySyncSummary {
  state: ModelGatewaySyncState
  lastSyncedAt: string | null
  successCount: number
  failedCount: number
  message: string | null
}

export interface ModelGatewayFilterInput {
  search?: string | null
  status?: ModelGatewayStatus | null
}

export interface PageInput {
  limit: number
  offset: number
}

export interface ModelGatewaysQueryVars {
  filter?: ModelGatewayFilterInput | null
  page: PageInput
  sort?: ModelGatewaySort | null
}

export interface ModelGatewaysQueryResult {
  modelGateways: ModelGatewayConnection
  modelGatewaySyncSummary: ModelGatewaySyncSummary
}

export interface ModelGatewayInput {
  name: string
  provider: ModelGatewayProvider
  endpoint: string
  adminUrl?: string | null
  masterKey?: string | null
  loadBalancingStrategy: LoadBalancingStrategy
}

export interface CreateModelGatewayVars {
  input: ModelGatewayInput
}

export interface CreateModelGatewayResult {
  createModelGateway: ModelGateway
}

export interface UpdateModelGatewayVars {
  id: string
  input: ModelGatewayInput
}

export interface UpdateModelGatewayResult {
  updateModelGateway: ModelGateway
}

export interface DeleteModelGatewayVars {
  id: string
}

export interface DeleteModelGatewayResult {
  deleteModelGateway: { deletedID: string }
}

export interface TestModelGatewayConnectionVars {
  id: string
}

export interface ModelGatewayTestResult {
  success: boolean
  status: ModelGatewayStatus
  latencyMs: number | null
  message: string
  testedAt: string
  gateway: ModelGateway
}

export interface TestModelGatewayConnectionResult {
  testModelGatewayConnection: ModelGatewayTestResult
}

export const STATUS_KEY_FROM_GQL: Record<ModelGatewayStatus, string> = {
  CONNECTED: 'connected',
  DISCONNECTED: 'disconnected',
  ERROR: 'error',
}
