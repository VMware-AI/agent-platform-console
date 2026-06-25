import { gql } from '@apollo/client/core'

// 智能体快照与生命周期 (Agent Snapshots & Lifecycle) — backed by the real
// deploy.graphql ops:
//   query agentSnapshots(agentId: ID!): [AgentSnapshot!]!  (owner/admin in resolver)
//   mutation snapshotAgent(input: SnapshotAgentInput!): AgentSnapshot!
//   mutation revertAgentSnapshot(input: RevertAgentSnapshotInput!): Boolean!  (destructive)
//   mutation setAgentStatus(id: ID!, status: AgentStatus!): Agent!
//   mutation recycleAgent(input: RecycleAgentInput!): Agent!  (destructive)
//
// AgentSnapshot has NO id — its identity is `name` within a single agent's VM
// (see deploy.graphql §AgentSnapshot). revertAgentSnapshot keys on snapshotName,
// so views must use `name` as the row key.

// --- Snapshot fields ---------------------------------------------------------

const AGENT_SNAPSHOT_FIELDS = gql`
  fragment AgentSnapshotFields on AgentSnapshot {
    name
    description
    state
    createdAt
  }
`

export const AGENT_SNAPSHOTS_QUERY = gql`
  query AgentSnapshotsForLifecycle($agentId: ID!) {
    agentSnapshots(agentId: $agentId) {
      ...AgentSnapshotFields
    }
  }
  ${AGENT_SNAPSHOT_FIELDS}
`

export const SNAPSHOT_AGENT_MUTATION = gql`
  mutation CreateAgentSnapshot($input: SnapshotAgentInput!) {
    snapshotAgent(input: $input) {
      ...AgentSnapshotFields
    }
  }
  ${AGENT_SNAPSHOT_FIELDS}
`

export const REVERT_AGENT_SNAPSHOT_MUTATION = gql`
  mutation RevertAgentSnapshotState($input: RevertAgentSnapshotInput!) {
    revertAgentSnapshot(input: $input)
  }
`

// --- Lifecycle ops -----------------------------------------------------------
//
// The Agent fields here are a minimal subset (id/name/status) so the cache
// updates the agent's status in place after a lifecycle action. `status` is the
// real backend AgentStatus enum (lowercase: provisioning/running/stopped/exception).

export const SET_AGENT_STATUS_MUTATION = gql`
  mutation SetAgentLifecycleStatus($id: ID!, $status: AgentStatus!) {
    setAgentStatus(id: $id, status: $status) {
      id
      name
      status
    }
  }
`

export const RECYCLE_AGENT_MUTATION = gql`
  mutation RecycleAgentLifecycle($input: RecycleAgentInput!) {
    recycleAgent(input: $input) {
      id
      name
      status
    }
  }
`

// --- Types -------------------------------------------------------------------

/**
 * Real backend AgentStatus enum (agent.graphql). NOTE: this is lowercase and
 * differs from the stale `AgentStatus` in src/api/graphql/types.ts
 * (RUNNING/STOPPED/ERROR) — that one is not used here.
 */
export type AgentLifecycleStatus = 'provisioning' | 'running' | 'stopped' | 'exception'

export interface AgentSnapshotNode {
  name: string
  description: string | null
  state: string
  createdAt: string
}

export interface AgentSnapshotsResult {
  agentSnapshots: AgentSnapshotNode[]
}

export interface AgentSnapshotsVars {
  agentId: string
}

export interface SnapshotAgentVars {
  input: {
    agentId: string
    name: string
    description?: string | null
  }
}

export interface SnapshotAgentResult {
  snapshotAgent: AgentSnapshotNode
}

export interface RevertAgentSnapshotVars {
  input: {
    agentId: string
    snapshotName: string
    confirm: boolean
  }
}

export interface RevertAgentSnapshotResult {
  revertAgentSnapshot: boolean
}

export interface AgentLifecycleNode {
  id: string
  name: string
  status: AgentLifecycleStatus
}

export interface SetAgentStatusVars {
  id: string
  status: AgentLifecycleStatus
}

export interface SetAgentStatusResult {
  setAgentStatus: AgentLifecycleNode
}

export interface RecycleAgentVars {
  input: {
    agentId: string
    confirm: boolean
  }
}

export interface RecycleAgentResult {
  recycleAgent: AgentLifecycleNode
}
