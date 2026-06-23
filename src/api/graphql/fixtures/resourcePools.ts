import type {
  CreateResourcePoolInput,
  PoolConnectionStatus,
  ResourcePool,
  ResourcePoolConnection,
  ResourcePoolFilter,
  ResourcePoolSort,
  ResourcePoolSortField,
  ResourcePoolsQueryVars,
  UpdateResourcePoolInput,
} from '../types'

/**
 * Local fixture for Resource Pools — 12 records covering 3 connection
 * statuses (8 CONNECTED / 4 DISCONNECTED) and three geographic regions
 * that match the design screenshot (vCenter_OC1/2/3).
 *
 * `poolsStore` is a module-level mutable array — every mutation helper
 * rewrites it in place so the next `resourcePoolsFixture` query reflects
 * the change immediately (in-memory mock backend).
 */
export const poolsStore: ResourcePool[] = [
  {
    id: 'rp01', name: 'vCenter_OC1',
    endpoint: 'https://vc.oc1.platform.local/sdk',
    connectionStatus: 'CONNECTED',
    datacenterCount: 3, clusterCount: 8,
    esxiHostCount: 24, vmInstanceCount: 412,
    createdAt: '2026-06-22T08:00:00Z', updatedAt: '2026-06-22T08:00:00Z',
  },
  {
    id: 'rp02', name: 'vCenter_OC2',
    endpoint: 'https://vc.oc2.platform.local/sdk',
    connectionStatus: 'CONNECTED',
    datacenterCount: 2, clusterCount: 6,
    esxiHostCount: 18, vmInstanceCount: 287,
    createdAt: '2026-06-22T08:05:00Z', updatedAt: '2026-06-22T08:05:00Z',
  },
  {
    id: 'rp03', name: 'vCenter_OC3',
    endpoint: 'https://vc.oc3.platform.local/sdk',
    connectionStatus: 'DISCONNECTED',
    datacenterCount: 1, clusterCount: 4,
    esxiHostCount: 12, vmInstanceCount: 156,
    createdAt: '2026-06-22T08:10:00Z', updatedAt: '2026-06-22T08:10:00Z',
  },
  {
    id: 'rp04', name: 'vCenter_HK1',
    endpoint: 'https://vc.hk1.platform.local/sdk',
    connectionStatus: 'CONNECTED',
    datacenterCount: 1, clusterCount: 3,
    esxiHostCount: 9, vmInstanceCount: 128,
    createdAt: '2026-02-15T02:00:00Z', updatedAt: '2026-06-20T08:00:00Z',
  },
  {
    id: 'rp05', name: 'vCenter_SG1',
    endpoint: 'https://vc.sg1.platform.local/sdk',
    connectionStatus: 'DISCONNECTED',
    datacenterCount: 2, clusterCount: 5,
    esxiHostCount: 15, vmInstanceCount: 203,
    createdAt: '2026-03-01T02:00:00Z', updatedAt: '2026-06-19T10:00:00Z',
  },
  {
    id: 'rp06', name: 'vCenter_TokyoA',
    endpoint: 'https://vc.tokyo-a.platform.local/sdk',
    connectionStatus: 'CONNECTED',
    datacenterCount: 2, clusterCount: 7,
    esxiHostCount: 21, vmInstanceCount: 348,
    createdAt: '2026-03-12T02:00:00Z', updatedAt: '2026-06-21T03:40:00Z',
  },
  {
    id: 'rp07', name: 'vCenter_TokyoB',
    endpoint: 'https://vc.tokyo-b.platform.local/sdk',
    connectionStatus: 'CONNECTED',
    datacenterCount: 1, clusterCount: 4,
    esxiHostCount: 12, vmInstanceCount: 174,
    createdAt: '2026-03-20T02:00:00Z', updatedAt: '2026-06-21T03:42:00Z',
  },
  {
    id: 'rp08', name: 'vCenter_Seoul1',
    endpoint: 'https://vc.seoul1.platform.local/sdk',
    connectionStatus: 'DISCONNECTED',
    datacenterCount: 1, clusterCount: 3,
    esxiHostCount: 8, vmInstanceCount: 92,
    createdAt: '2026-04-02T02:00:00Z', updatedAt: '2026-06-17T15:00:00Z',
  },
  {
    id: 'rp09', name: 'vCenter_FRA1',
    endpoint: 'https://vc.fra1.platform.local/sdk',
    connectionStatus: 'CONNECTED',
    datacenterCount: 3, clusterCount: 9,
    esxiHostCount: 27, vmInstanceCount: 489,
    createdAt: '2026-04-15T02:00:00Z', updatedAt: '2026-06-21T03:45:00Z',
  },
  {
    id: 'rp10', name: 'vCenter_DFW1',
    endpoint: 'https://vc.dfw1.platform.local/sdk',
    connectionStatus: 'CONNECTED',
    datacenterCount: 2, clusterCount: 6,
    esxiHostCount: 18, vmInstanceCount: 256,
    createdAt: '2026-04-28T02:00:00Z', updatedAt: '2026-06-21T03:50:00Z',
  },
  {
    id: 'rp11', name: 'vCenter_SJC1',
    endpoint: 'https://vc.sjc1.platform.local/sdk',
    connectionStatus: 'DISCONNECTED',
    datacenterCount: 1, clusterCount: 2,
    esxiHostCount: 6, vmInstanceCount: 73,
    createdAt: '2026-05-10T02:00:00Z', updatedAt: '2026-06-19T09:00:00Z',
  },
  {
    id: 'rp12', name: 'vCenter_IAD1',
    endpoint: 'https://vc.iad1.platform.local/sdk',
    connectionStatus: 'CONNECTED',
    datacenterCount: 2, clusterCount: 5,
    esxiHostCount: 15, vmInstanceCount: 211,
    createdAt: '2026-05-25T02:00:00Z', updatedAt: '2026-06-21T03:55:00Z',
  },
]

/* ---------- Pure query helpers ---------- */

function applyFilter(arr: ResourcePool[], filter?: ResourcePoolFilter | null): ResourcePool[] {
  if (!filter) return arr
  return arr.filter((p) => {
    if (filter.nameKeyword) {
      const kw = filter.nameKeyword.toLowerCase()
      if (!p.name.toLowerCase().includes(kw)) return false
    }
    if (filter.endpointKeyword) {
      const kw = filter.endpointKeyword.toLowerCase()
      if (!p.endpoint.toLowerCase().includes(kw)) return false
    }
    if (filter.connectionStatus && p.connectionStatus !== filter.connectionStatus) return false
    return true
  })
}

function compareBy(field: ResourcePoolSortField, a: ResourcePool, b: ResourcePool): number {
  switch (field) {
    case 'NAME':
      return a.name.localeCompare(b.name)
    case 'ENDPOINT':
      return a.endpoint.localeCompare(b.endpoint)
    case 'CONNECTION_STATUS':
      return a.connectionStatus.localeCompare(b.connectionStatus)
    case 'DATACENTER_COUNT':
      return a.datacenterCount - b.datacenterCount
    case 'CLUSTER_COUNT':
      return a.clusterCount - b.clusterCount
    case 'ESXI_HOST_COUNT':
      return a.esxiHostCount - b.esxiHostCount
    case 'VM_INSTANCE_COUNT':
      return a.vmInstanceCount - b.vmInstanceCount
    case 'CREATED_AT':
      return a.createdAt.localeCompare(b.createdAt)
    case 'UPDATED_AT':
      return a.updatedAt.localeCompare(b.updatedAt)
    default:
      return 0
  }
}

function applySort(arr: ResourcePool[], sort?: ResourcePoolSort | null): ResourcePool[] {
  if (!sort) return arr
  const dir = sort.direction === 'DESC' ? -1 : 1
  return [...arr].sort((a, b) => dir * compareBy(sort.field, a, b))
}

export function resourcePoolsFixture(vars?: ResourcePoolsQueryVars): ResourcePoolConnection {
  const filtered = applyFilter(poolsStore, vars?.filter)
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

export function findResourcePool(id: string): ResourcePool | undefined {
  return poolsStore.find((p) => p.id === id)
}

/* ---------- Mutation helpers ---------- */

export function createResourcePoolInFixture(input: CreateResourcePoolInput, now: string): ResourcePool {
  const pool: ResourcePool = {
    id: `rp${Date.now()}`,
    name: input.name,
    endpoint: input.endpoint,
    connectionStatus: 'DISCONNECTED', // brand-new pool starts disconnected until first sync
    datacenterCount: input.datacenterCount ?? 0,
    clusterCount: input.clusterCount ?? 0,
    esxiHostCount: 0,
    vmInstanceCount: 0,
    createdAt: now,
    updatedAt: now,
  }
  poolsStore.push(pool)
  return pool
}

export function updateResourcePoolInFixture(
  id: string,
  patch: UpdateResourcePoolInput,
  now: string,
): ResourcePool {
  const p = poolsStore.find((x) => x.id === id)
  if (!p) throw new Error(`资源池不存在: ${id}`)
  if (patch.name !== undefined && patch.name !== null) p.name = patch.name
  if (patch.endpoint !== undefined && patch.endpoint !== null) p.endpoint = patch.endpoint
  if (patch.datacenterCount !== undefined && patch.datacenterCount !== null) p.datacenterCount = patch.datacenterCount
  if (patch.clusterCount !== undefined && patch.clusterCount !== null) p.clusterCount = patch.clusterCount
  p.updatedAt = now
  return p
}

export function deleteResourcePoolFromFixture(id: string): { id: string; deletedName: string } {
  const i = poolsStore.findIndex((x) => x.id === id)
  if (i === -1) throw new Error(`资源池不存在: ${id}`)
  const [deleted] = poolsStore.splice(i, 1)
  return { id: deleted.id, deletedName: deleted.name }
}

export function syncResourcePoolInFixture(id: string, now: string): { pool: ResourcePool; syncedAt: string } {
  const p = poolsStore.find((x) => x.id === id)
  if (!p) throw new Error(`资源池不存在: ${id}`)
  p.connectionStatus = 'CONNECTED'
  p.updatedAt = now
  return { pool: p, syncedAt: now }
}