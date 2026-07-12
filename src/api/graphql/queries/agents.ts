import { gql } from '@apollo/client/core'

export const AGENT_QUERY = gql`
  query Agent($id: ID!) {
    agent(id: $id) {
      id
      name
      type
      status
      apiKey {
        id
        name
      }
      owner {
        id
        displayName
        email
      }
      credentials {
        username
        ip
        sshCommand
        passwordHint
      }
      endpoint
      templateFamilyId
      templateVersionId
      resourcePoolId
      typeLabel
      createdAt
      updatedAt
    }
  }
`

export const AGENTS_QUERY = gql`
  query Agents($filter: AgentFilter, $pagination: Pagination, $sort: AgentSort) {
    agents(filter: $filter, pagination: $pagination, sort: $sort) {
      nodes {
        id
        name
        type
        resourcePoolId
        status
        apiKey {
          id
          name
        }
        owner {
          id
          displayName
          email
        }
        createdAt
        updatedAt
        endpoint
        credentials {
          username
        }
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

// TODO: Backend — add Agent.vmResources resolver (CPU/memory/disk/vApp props from vCenter).
// When available, this query will hydrate the Configure dialog's resource editor.
export const AGENT_VM_INFO_QUERY = gql`
  query AgentVmInfo($id: ID!) {
    agent(id: $id) {
      id
      vmResources {
        cpu
        memory
        disk
        networkLabel
        vAppProperties {
          key
          value
        }
      }
    }
  }
`

// TODO: Backend — add updateAgent mutation (→ vCenter ReconfigVM_Task).
// Accepts partial resource/network/vApp deltas; backend validates hot-add constraints.
export const RECONFIG_AGENT_VM_MUTATION = gql`
  mutation ReconfigAgentVM(
    $agentId: ID!
    $resource: AgentResourceInput
    $network: AgentNetworkInput
    $vAppProperties: [VAppPropertyInput!]
  ) {
    reconfigAgentVM(
      agentId: $agentId
      resource: $resource
      network: $network
      vAppProperties: $vAppProperties
    ) {
      id
      vmResources {
        cpu
        memory
        disk
        networkLabel
      }
    }
  }
`
export const SET_AGENT_STATUS_MUTATION = gql`
  mutation SetAgentStatus($id: ID!, $status: AgentStatus!) {
    setAgentStatus(id: $id, status: $status) {
      id
      status
      updatedAt
    }
  }
`

export const RECYCLE_AGENT_MUTATION = gql`
  mutation RecycleAgent($input: RecycleAgentInput!) {
    recycleAgent(input: $input) {
      id
      status
      updatedAt
    }
  }
`

// Admin-only destructive action: physically drops the agent row. Distinct from
// RecycleAgent which only marks status=stopped + clears vmRef. Frontend also
// gates by auth.role === 'admin' on top of the server-side @hasRole directive.
export const HARD_DELETE_AGENT_MUTATION = gql`
  mutation HardDeleteAgent($input: HardDeleteAgentInput!) {
    hardDeleteAgent(input: $input)
  }
`

// Graceful guest reboot via VMware Tools (LLD-03 §4 开关机). Calls restartAgent
// on the backend which issues RebootGuest to the VM and sets status=running.
export const RESTART_AGENT_MUTATION = gql`
  mutation RestartAgent($id: ID!) {
    restartAgent(id: $id) {
      id
      status
      updatedAt
    }
  }
`

// LLD-16 §4: platform pull upgrade. Enqueues an upgrade command the in-VM daemon
// executes on its next heartbeat. requestAgentUpgrade returns true (no-op) when one
// is already in flight; upgradeAgents (fleet) returns the count actually enqueued.
export const REQUEST_AGENT_UPGRADE_MUTATION = gql`
  mutation RequestAgentUpgrade($agentId: ID!, $targetVersion: String!) {
    requestAgentUpgrade(agentId: $agentId, targetVersion: $targetVersion)
  }
`

export const UPGRADE_AGENTS_MUTATION = gql`
  mutation UpgradeAgents($agentIds: [ID!]!, $targetVersion: String!) {
    upgradeAgents(agentIds: $agentIds, targetVersion: $targetVersion)
  }
`
