import { gql } from '@apollo/client/core'

/**
 * Resource pool GraphQL operations.
 *
 * Two operations cover the resource-pool list page:
 *
 * 1. `RESOURCE_POOLS_QUERY` — drives the table. Selects ONLY scalar fields,
 *    no inventory children, so the 30s poll stays cheap. Mirrors the
 *    `query ResourcePools` definition in
 *    `postman/agent-platform-backend.postman_collection.json` exactly.
 *
 * 2. `RESOURCE_POOL_QUERY` — fired lazily when the user clicks the row's
 *    "查看" link. Returns the same scalars PLUS `datacenters`, so the
 *    inventory viewer modal can render the vSphere tree.
 *
 * Field-set discipline: the two queries intentionally diverge — do NOT
 * add `datacenters` to `RESOURCE_POOL_FIELDS`, or every list poll will
 * haul the entire vSphere tree.
 */
const RESOURCE_POOL_FIELDS = /* GraphQL */ `
  fragment ResourcePoolFields on ResourcePool {
    id
    name
    endpoint
    contentLibraryName
    insecure
    syncStatus
    lastSyncedAt
    createdAt
    updatedAt
  }
`

const RESOURCE_POOL_INVENTORY_FIELDS = /* GraphQL */ `
  fragment ResourcePoolInventoryFields on ResourcePool {
    id
    name
    endpoint
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
    }
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

/**
 * Single-pool query — same API the list query uses, just selecting the
 * one row by id and adding the `datacenters` subtree. The inventory viewer
 * fires this lazily, only when the user opens the modal; it is NOT called
 * during the list's 30s poll.
 */
export const RESOURCE_POOL_QUERY = gql`
  ${RESOURCE_POOL_INVENTORY_FIELDS}
  query ResourcePool($id: ID!) {
    resourcePool(id: $id) {
      ...ResourcePoolInventoryFields
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

export { RESOURCE_POOL_FIELDS, RESOURCE_POOL_INVENTORY_FIELDS }