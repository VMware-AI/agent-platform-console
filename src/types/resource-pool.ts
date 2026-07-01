/**
 * GraphQL types — resource pools (vCenter / Vsphere pool inventory).
 * Mirrors the backend schema; replace with codegen output when available.
 *
 * Cross-domain references: ResourcePoolConnection / *QueryVars / *QueryResult
 * use the shared PageInfo / SortDirection / Pagination from `@/types/agents`;
 * consumers that need both should import from each domain file directly.
 */
import type { PageInfo, SortDirection, Pagination } from './agents'

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
  /** Skip vCenter TLS verification for this pool (self-signed/internal CA). LLD-13. */
  insecure: boolean
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
  /** Skip vCenter TLS verification (self-signed/internal CA); omit = false. LLD-13. */
  insecure?: boolean
  /** vCenter credentials — stored in the secret store on the backend, never persisted in plaintext. */
  username?: string
  password?: string
}

export interface UpdateResourcePoolInput {
  name?: string | null
  endpoint?: string | null
  contentLibraryName?: string | null
  /** Skip vCenter TLS verification (self-signed/internal CA); omit = unchanged. LLD-13. */
  insecure?: boolean | null
  /** Re-submit credentials to rotate them; omit = unchanged. */
  username?: string | null
  password?: string | null
}

export interface TestResourcePoolConnectionInput {
  name: string
  endpoint: string
  /** When supplied, the backend runs a REAL authenticated probe and returns available
   *  content libraries; omitted = lightweight TCP reachability check. */
  username?: string
  password?: string
  insecure?: boolean
}

export interface ResourcePoolConnectionDetail {
  /** Real vSphere version (authenticated probe); empty for the reachability-only probe. */
  vSphereVersion: string
  /** Names of all content libraries on the vCenter (authenticated probe); empty for reachability-only. */
  contentLibraries: string[]
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

/* ---------- Inventory (read-only vSphere topology) ----------
 * Mirrors the backend `agent-platform-backend` schema additions for
 * `ResourcePool.inventory`. The backend currently only persists scalar
 * counts (`esxiHostCount`, `vmInstanceCount`); once the schema is extended
 * with nested types, the inventory query (see
 * `src/api/graphql/queries/resourcePools.ts`) returns this structure.
 *
 * `inventory` on a `ResourcePool` may be `null` when the pool has never been
 * synced; treat absence as "no data" in the UI. */
export interface PlacementRef {
  name: string
  path?: string | null
}
export interface VsphereCluster {
  name: string
  path: string
  esxiHosts: PlacementRef[]
  resourcePools: PlacementRef[]
}
export interface VsphereDataCenter {
  name: string
  path: string
  clusters: VsphereCluster[]
  datastores: PlacementRef[]
  networks: PlacementRef[]
  folders: PlacementRef[]
  storagePolicies: PlacementRef[]
}
export interface ResourcePoolInventory {
  datacenters: VsphereDataCenter[]
}
export interface ResourcePoolInventoryQueryVars {
  id: string
}
export interface ResourcePoolInventoryQueryResult {
  resourcePoolInventory: ResourcePoolInventory
}
