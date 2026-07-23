/**
 * `ModelGateway` schema types — see Postman collection
 * `agent-platform-backend.postman_collection.json` § Model Gateways (LITELLM)
 * for the live GraphQL contract.
 *
 * Backend fields no longer surfaced to the UI (compared to the previous
 * contract): `status` (folded into `lastSyncStatus`),
 * `latencyMs` (no longer probed on connect/sync), and `adminUrl`
 * (the UI is derived from `endpoint + '/ui'`).
 */
export type ModelGatewayProvider = 'LITELLM'

export type ModelGatewaySyncState = 'SYNCED' | 'SYNCING' | 'PARTIAL' | 'FAILED' | 'NEVER'

export type LoadBalancingStrategy =
  | 'SIMPLE_SHUFFLE'
  | 'LEAST_BUSY'
  | 'LATENCY_BASED_ROUTING'
  | 'USAGE_BASED_ROUTING_V2'
  | 'COST_BASED_ROUTING'

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
  publicUrl: string | null
  /** Number of models deployed on the backend gateway, populated by the
   * latest sync. Always non-null — backend projects a NULL DB column as
   * `0` (see internal/graph/gateway_facade.go `toModelGateway`). */
  backendModelCount: number
  loadBalancingStrategy: LoadBalancingStrategy | null
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

/** `ModelGatewayInput` — the only writable subset of a gateway.
 * Backend rejects `backendModelCount` / `loadBalancingStrategy` as inputs
 * (they are read-only, populated by sync). */
export interface ModelGatewayInput {
  name: string
  provider: ModelGatewayProvider
  endpoint: string
  publicUrl?: string | null
  masterKey?: string | null
}

export interface CreateModelGatewayVars {
  input: ModelGatewayInput
}

export interface CreateModelGatewayResult {
  createModelGateway: ModelGateway
}

export interface DeleteModelGatewayVars {
  id: string
}

export interface DeleteModelGatewayResult {
  deleteModelGateway: { deletedID: string }
}

/* ---------- Sync (post-create background sync + manual trigger) ---------- */

/** `syncModelGatewayConnection(id)` — manually triggers the same path as
 * the post-create background sync. On success the backend updates
 * `loadBalancingStrategy` and `backendModelCount`; on failure the stored
 * values are preserved. */
export interface SyncModelGatewayConnectionVars {
  id: string
}

export interface SyncModelGatewayConnectionResult {
  success: boolean
  message: string
  gateway: ModelGateway
}

export interface SyncModelGatewayConnectionPayload {
  syncModelGatewayConnection: SyncModelGatewayConnectionResult
}

/* ---------- Test connection (dry-run, pre-create) ---------- */

/** `testNewModelGatewayConnection(input)` — pre-create dry-run probe.
 * Pings a not-yet-saved endpoint + master key without persisting anything.
 * Only the connectivity probe runs (no routing-strategy probe). */
export interface TestModelGatewayConnectionInput {
  endpoint: string
  masterKey: string
}

export interface TestNewModelGatewayConnectionVars {
  input: TestModelGatewayConnectionInput
}

export interface TestNewModelGatewayConnectionResult {
  success: boolean
  message: string
  testedAt: string
}

export interface TestNewModelGatewayConnectionPayload {
  testNewModelGatewayConnection: TestNewModelGatewayConnectionResult
}
