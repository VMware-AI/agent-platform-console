import { gql } from '@apollo/client/core'

const RESOURCE_POOL_FIELDS = /* GraphQL */ `
  fragment ResourcePoolFields on ResourcePool {
    id
    name
    endpoint
    contentLibraryName
    insecure
    connectionStatus
    esxiHostCount
    vmInstanceCount
    syncStatus
    lastSyncedAt
    createdAt
    updatedAt
  }
`

export const RESOURCE_POOLS_QUERY = gql`
  ${RESOURCE_POOL_FIELDS}
  query ResourcePools(
    $filter: ResourcePoolFilter
    $pagination: Pagination
    $sort: ResourcePoolSort
  ) {
    resourcePools(filter: $filter, pagination: $pagination, sort: $sort) {
      nodes {
        ...ResourcePoolFields
      }
      totalCount
      pageInfo {
        page
        pageSize
        totalPages
      }
    }
  }
`

export const RESOURCE_POOL_QUERY = gql`
  ${RESOURCE_POOL_FIELDS}
  query ResourcePool($id: ID!) {
    resourcePool(id: $id) {
      ...ResourcePoolFields
    }
  }
`

/* ---------- Mutations ---------- */

export const CREATE_RESOURCE_POOL_MUTATION = gql`
  ${RESOURCE_POOL_FIELDS}
  mutation CreateResourcePool($input: CreateResourcePoolInput!) {
    createResourcePool(input: $input) {
      pool {
        ...ResourcePoolFields
      }
    }
  }
`

export const UPDATE_RESOURCE_POOL_MUTATION = gql`
  ${RESOURCE_POOL_FIELDS}
  mutation UpdateResourcePool($id: ID!, $input: UpdateResourcePoolInput!) {
    updateResourcePool(id: $id, input: $input) {
      pool {
        ...ResourcePoolFields
      }
    }
  }
`

export const DELETE_RESOURCE_POOL_MUTATION = gql`
  mutation DeleteResourcePool($id: ID!) {
    deleteResourcePool(id: $id) {
      id
      deletedName
    }
  }
`

export const SYNC_RESOURCE_POOL_MUTATION = gql`
  ${RESOURCE_POOL_FIELDS}
  mutation SyncResourcePool($id: ID!) {
    syncResourcePool(id: $id) {
      pool {
        ...ResourcePoolFields
      }
      syncedAt
    }
  }
`

export const TEST_RESOURCE_POOL_CONNECTION_MUTATION = gql`
  mutation TestResourcePoolConnection($input: TestResourcePoolConnectionInput!) {
    testResourcePoolConnection(input: $input) {
      ok
      message
      detail {
        vSphereVersion
        contentLibraries
      }
    }
  }
`

/* ---------- Inventory (lazy-loaded on demand) ----------
 * Pulled only when the user opens the "查看资产" modal; never embedded in the
 * list query to avoid hauling the entire vSphere tree on every poll.
 * Mirrors `ResourcePoolInventory` in `src/types/resource-pool.ts`. */
const RESOURCE_POOL_INVENTORY_FIELDS = /* GraphQL */ `
  fragment ResourcePoolInventoryFields on ResourcePoolInventory {
    datacenters {
      name
      path
      clusters {
        name
        path
        esxiHosts {
          name
          path
        }
        resourcePools {
          name
          path
        }
      }
      datastores {
        name
        path
      }
      networks {
        name
        path
      }
      folders {
        name
        path
      }
      storagePolicies {
        name
        path
      }
    }
  }
`

export const RESOURCE_POOL_INVENTORY_QUERY = gql`
  ${RESOURCE_POOL_INVENTORY_FIELDS}
  query ResourcePoolInventory($id: ID!) {
    resourcePoolInventory(id: $id) {
      ...ResourcePoolInventoryFields
    }
  }
`

export { RESOURCE_POOL_FIELDS, RESOURCE_POOL_INVENTORY_FIELDS }
