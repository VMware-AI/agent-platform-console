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
