import { gql } from '@apollo/client/core'

/** Shared selection set for a model gateway. Mirrors the backend's
 * `ModelGateway` GraphQL type (see Postman § Model Gateways (LITELLM)).
 * Backend dropped `status`, `latencyMs`, `adminUrl` — those are no
 * longer in this fragment. `backendModelCount` was added. */
const MODEL_GATEWAY_FIELDS = gql`
  fragment ModelGatewayFields on ModelGateway {
    id
    name
    provider
    endpoint
    publicUrl
    backendModelCount
    loadBalancingStrategy
    lastSyncAt
    lastSyncStatus
    lastSyncMessage
    createdAt
    updatedAt
  }
`

export const MODEL_GATEWAYS_QUERY = gql`
  query ModelGateways($filter: ModelGatewayFilterInput, $page: PageInput!, $sort: ModelGatewaySort) {
    modelGateways(filter: $filter, page: $page, sort: $sort) {
      nodes {
        ...ModelGatewayFields
      }
      totalCount
    }
    modelGatewaySyncSummary {
      state
      lastSyncedAt
      successCount
      failedCount
      message
    }
  }
  ${MODEL_GATEWAY_FIELDS}
`

export const CREATE_MODEL_GATEWAY = gql`
  mutation CreateModelGateway($input: ModelGatewayInput!) {
    createModelGateway(input: $input) {
      ...ModelGatewayFields
    }
  }
  ${MODEL_GATEWAY_FIELDS}
`

export const DELETE_MODEL_GATEWAY = gql`
  mutation DeleteModelGateway($id: ID!) {
    deleteModelGateway(id: $id) {
      deletedID
    }
  }
`

/** `syncModelGatewayConnection` — manually triggers the same code path
 * as the post-create background sync. Ping `/models`, fetch global
 * routing strategy, count deployed models. On success the backend
 * updates `loadBalancingStrategy` and `backendModelCount`; on failure the
 * stored values are preserved (transient outage ≠ reset). */
export const SYNC_MODEL_GATEWAY_CONNECTION = gql`
  mutation SyncModelGatewayConnection($id: ID!) {
    syncModelGatewayConnection(id: $id) {
      success
      message
      gateway {
        ...ModelGatewayFields
      }
    }
  }
  ${MODEL_GATEWAY_FIELDS}
`

/** `testNewModelGatewayConnection` — pre-create dry-run probe used by
 * the create-form's "测试连接" button. Pings a not-yet-saved endpoint +
 * master key without persisting anything. Only the connectivity probe
 * runs (no routing-strategy probe), and the response carries no
 * `gateway` field. */
export const TEST_NEW_MODEL_GATEWAY_CONNECTION = gql`
  mutation TestNewModelGatewayConnection($input: TestModelGatewayConnectionInput!) {
    testNewModelGatewayConnection(input: $input) {
      success
      message
      testedAt
    }
  }
`
