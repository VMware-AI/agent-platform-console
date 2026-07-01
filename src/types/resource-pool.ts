/**
 * GraphQL types — resource pools (vCenter / Vsphere pool inventory).
 * Mirrors the backend schema; replace with codegen output when available.
 *
 * Cross-domain references: ResourcePoolConnection / *QueryVars / *QueryResult
 * use the shared PageInfo / SortDirection / Pagination from `@/types/agents`;
 * consumers that need both should import from each domain file directly.
 */
import type { PageInfo, SortDirection, Pagination } from './agents'

export type ResourcePoolSyncState = 'SYNCED' | 'SYNCING' | 'PARTIAL' | 'FAILED' | 'NEVER'

/**
 * Resource pool (a vCenter integration managed by the platform).
 *
 * Mirrors `postman/agent-platform-backend.postman_collection.json`:
 * - `query ResourcePools` selects ONLY the scalar fields below — no
 *   inventory children, to keep the list poll cheap.
 * - `query ResourcePool($id)` re-selects the same scalars AND adds
 *   `datacenters`, fetched lazily by the inventory viewer when the
 *   user clicks the row's "查看" link.
 *
 * `datacenters` is therefore `null` on every `resourcePools.nodes` entry
 * returned by the list query, and populated only on the single-pool
 * detail query. Treat absence as "not yet fetched".
 */
export interface ResourcePool {
  id: string
  name: string
  endpoint: string
  contentLibraryName: string
  /** Skip vCenter TLS verification for this pool (self-signed/internal CA). LLD-13. */
  insecure: boolean
  syncStatus: ResourcePoolSyncState
  lastSyncedAt: string | null
  createdAt: string
  updatedAt: string
  /** vSphere inventory — only present on the single-pool detail query. */
  datacenters?: VsphereDataCenter[] | null
}

export interface ResourcePoolConnection {
  nodes: ResourcePool[]
  totalCount: number
  pageInfo: PageInfo
}

export type ResourcePoolSortField =
  | 'NAME'
  | 'ENDPOINT'
  | 'CONTENT_LIBRARY_NAME'
  | 'CREATED_AT'
  | 'UPDATED_AT'

export interface ResourcePoolSort {
  field: ResourcePoolSortField
  direction: SortDirection
}

export interface ResourcePoolFilter {
  nameKeyword?: string | null
  endpointKeyword?: string | null
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

/* ---------- vSphere inventory (returned by single-pool query only) ----------
 * The backend exposes inventory as `ResourcePool.datacenters` on the
 * single-pool detail query (`RESOURCE_POOL_QUERY`); the list query
 * deliberately omits it to keep polls cheap. UI must therefore treat
 * `datacenters` as `null` on list rows and as the populated tree on
 * single-pool fetches. */
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

/* ---------- Single-pool query ----------
 * `RESOURCE_POOL_QUERY` selects ONLY `datacenters` — the modal already
 * has the pool's name from the list-row prop and does not need any
 * other scalar. This keeps the lazy single-pool fetch as small as
 * possible.
 *
 * `datacenters` is nullable to mirror the backend: an un-synced pool
 * has no inventory persisted, so the field is `null` rather than `[]`. */
export interface ResourcePoolInventoryNode {
  datacenters: VsphereDataCenter[] | null
}
export interface ResourcePoolQueryVars {
  id: string
}
export interface ResourcePoolQueryResult {
  resourcePool: ResourcePoolInventoryNode
}
