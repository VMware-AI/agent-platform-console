import { gql } from '@apollo/client/core'

// 网关连接 (Gateway Connections) — the raw GatewayConnection entity from
// schema/gateway-routing.graphql, all ops @hasRole(any: [admin]).
//
//   - GatewayConnection: a litellm gateway the platform talks to
//     (id / name / endpoint / status / loadBalanceStrategy / createdAt).
//   - registerGatewayConnection: mints a connection. `masterKey` is the litellm
//     master key — write-only (backend writes it to the secret store and only
//     keeps a reference), so it is never read back by the list query.
//   - testGatewayConnection: returns a bare GatewayStatus enum (connected /
//     disconnected / error) — a live ping, no message/detail payload.
//   - deleteGatewayConnection: returns Boolean!.
//
// The header stats come from modelGatewaySyncSummary (schema/modelgateway.graphql),
// the litellm sync rollup over the whole gateway (state / lastSyncedAt /
// success+failed counts / message). Op names are suffixed to stay distinct from
// the upstream/router ops in gateway-routing.ts.

export const GATEWAY_STATUSES = ['connected', 'disconnected', 'error'] as const
export type GatewayStatus = (typeof GATEWAY_STATUSES)[number]

export const LOAD_BALANCE_STRATEGIES = [
  'simple_shuffle',
  'latency',
  'usage_v2',
  'least_busy',
  'cost',
] as const
export type LoadBalanceStrategy = (typeof LOAD_BALANCE_STRATEGIES)[number]

export const GATEWAY_SYNC_STATES = [
  'SYNCED',
  'SYNCING',
  'PARTIAL',
  'FAILED',
  'NEVER',
] as const
export type GatewaySyncState = (typeof GATEWAY_SYNC_STATES)[number]

const GATEWAY_CONNECTION_FIELDS = gql`
  fragment GatewayConnectionEntryFields on GatewayConnection {
    id
    name
    endpoint
    status
    loadBalanceStrategy
    createdAt
  }
`

export const GATEWAY_CONNECTIONS_LIST_QUERY = gql`
  query GatewayConnectionsList {
    gatewayConnections {
      ...GatewayConnectionEntryFields
    }
  }
  ${GATEWAY_CONNECTION_FIELDS}
`

export const GATEWAY_CONNECTIONS_SYNC_SUMMARY_QUERY = gql`
  query GatewayConnectionsSyncSummary {
    modelGatewaySyncSummary {
      state
      lastSyncedAt
      successCount
      failedCount
      message
    }
  }
`

export const REGISTER_GATEWAY_CONNECTION = gql`
  mutation RegisterGatewayConnectionEntry($input: RegisterGatewayConnectionInput!) {
    registerGatewayConnection(input: $input) {
      ...GatewayConnectionEntryFields
    }
  }
  ${GATEWAY_CONNECTION_FIELDS}
`

export const TEST_GATEWAY_CONNECTION = gql`
  mutation TestGatewayConnectionStatus($id: ID!) {
    testGatewayConnection(id: $id)
  }
`

export const DELETE_GATEWAY_CONNECTION = gql`
  mutation DeleteGatewayConnectionEntry($id: ID!) {
    deleteGatewayConnection(id: $id)
  }
`

export interface GatewayConnectionNode {
  id: string
  name: string
  endpoint: string
  status: GatewayStatus
  loadBalanceStrategy: LoadBalanceStrategy
  createdAt: string
}

export interface GatewayConnectionsListResult {
  gatewayConnections: GatewayConnectionNode[]
}

export interface GatewaySyncSummaryNode {
  state: GatewaySyncState
  lastSyncedAt: string | null
  successCount: number
  failedCount: number
  message: string | null
}

export interface GatewayConnectionsSyncSummaryResult {
  modelGatewaySyncSummary: GatewaySyncSummaryNode
}

export interface RegisterGatewayConnectionInput {
  name: string
  endpoint: string
  // litellm master key — write-only; backend stores a secret-store reference.
  masterKey?: string | null
  masterKeyRef?: string | null
  loadBalanceStrategy?: LoadBalanceStrategy | null
}

export interface RegisterGatewayConnectionVars {
  input: RegisterGatewayConnectionInput
}

export interface RegisterGatewayConnectionResult {
  registerGatewayConnection: GatewayConnectionNode
}

export interface TestGatewayConnectionVars {
  id: string
}

export interface TestGatewayConnectionResult {
  testGatewayConnection: GatewayStatus
}

export interface DeleteGatewayConnectionVars {
  id: string
}

export interface DeleteGatewayConnectionResult {
  deleteGatewayConnection: boolean
}
