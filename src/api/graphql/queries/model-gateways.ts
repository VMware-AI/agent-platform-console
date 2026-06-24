import { gql } from '@apollo/client/core'

const MODEL_GATEWAY_FIELDS = gql`
  fragment ModelGatewayFields on ModelGateway {
    id
    name
    provider
    endpoint
    status
    loadBalancingStrategy
    latencyMs
    adminUrl
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

export const UPDATE_MODEL_GATEWAY = gql`
  mutation UpdateModelGateway($id: ID!, $input: ModelGatewayInput!) {
    updateModelGateway(id: $id, input: $input) {
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

export const TEST_MODEL_GATEWAY_CONNECTION = gql`
  mutation TestModelGatewayConnection($id: ID!) {
    testModelGatewayConnection(id: $id) {
      success
      status
      latencyMs
      message
      testedAt
      gateway {
        ...ModelGatewayFields
      }
    }
  }
  ${MODEL_GATEWAY_FIELDS}
`
