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
