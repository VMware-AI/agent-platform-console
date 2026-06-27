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
}

export interface UpdateResourcePoolInput {
  name?: string | null
  endpoint?: string | null
  contentLibraryName?: string | null
  /** Skip vCenter TLS verification (self-signed/internal CA); omit = unchanged. LLD-13. */
  insecure?: boolean | null
}

export interface TestResourcePoolConnectionInput {
  name: string
  endpoint: string
  contentLibraryName: string
}

export interface ResourcePoolConnectionDetail {
  vSphereVersion: string
  itemCount: number
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
