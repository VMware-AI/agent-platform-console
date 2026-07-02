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
