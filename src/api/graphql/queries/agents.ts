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
