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
        itemCount
      }
    }
  }
`

export { RESOURCE_POOL_FIELDS }