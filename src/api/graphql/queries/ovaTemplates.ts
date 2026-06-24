import { gql } from '@apollo/client/core'

const FAMILY_FIELDS = /* GraphQL */ `
  fragment OvaTemplateFamilyFields on OvaTemplateFamily {
    id
    name
    type
    description
    tools
    skills
    scenarios
    iconShape
    iconColor
    latestVersion
    createdAt
    updatedAt
    versions {
      id
      familyId
      version
      ovaIdentifier
      notes
      createdAt
    }
  }
`

const VERSION_FIELDS = /* GraphQL */ `
  fragment OvaTemplateVersionFields on OvaTemplateVersion {
    id
    familyId
    version
    ovaIdentifier
    notes
    createdAt
  }
`

const VIRTUAL_KEY_FIELDS = /* GraphQL */ `
  fragment VirtualKeyFields on VirtualKey {
    id
    name
    secret
    modelGatewayId
    modelGateway {
      id
      name
      endpoint
    }
    status
    boundAgentId
    boundAt
    createdAt
  }
`

export const OVA_TEMPLATE_FAMILIES_QUERY = gql`
  ${FAMILY_FIELDS}
  query OvaTemplateFamilies(
    $filter: OvaTemplateFamilyFilter
    $pagination: Pagination
    $sort: OvaTemplateFamilySort
  ) {
    ovaTemplateFamilies(filter: $filter, pagination: $pagination, sort: $sort) {
      nodes {
        ...OvaTemplateFamilyFields
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

export const OVA_TEMPLATE_VERSIONS_QUERY = gql`
  ${VERSION_FIELDS}
  query OvaTemplateVersions($familyId: ID, $pagination: Pagination) {
    ovaTemplateVersions(familyId: $familyId, pagination: $pagination) {
      nodes {
        ...OvaTemplateVersionFields
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

export const AVAILABLE_VIRTUAL_KEYS_QUERY = gql`
  ${VIRTUAL_KEY_FIELDS}
  query AvailableVirtualKeys($modelGatewayId: ID) {
    availableVirtualKeys(modelGatewayId: $modelGatewayId) {
      ...VirtualKeyFields
    }
  }
`

export const CREATE_OVA_TEMPLATE_FAMILY_MUTATION = gql`
  ${FAMILY_FIELDS}
  mutation CreateOvaTemplateFamily($input: CreateOvaTemplateFamilyInput!) {
    createOvaTemplateFamily(input: $input) {
      family {
        ...OvaTemplateFamilyFields
      }
    }
  }
`

export const ADD_OVA_TEMPLATE_VERSION_MUTATION = gql`
  ${VERSION_FIELDS}
  mutation AddOvaTemplateVersion($input: AddOvaTemplateVersionInput!) {
    addOvaTemplateVersion(input: $input) {
      version {
        ...OvaTemplateVersionFields
      }
    }
  }
`

export const CREATE_VIRTUAL_KEY_MUTATION = gql`
  ${VIRTUAL_KEY_FIELDS}
  mutation CreateVirtualKey($input: CreateVirtualKeyInput!) {
    createVirtualKey(input: $input) {
      key {
        ...VirtualKeyFields
      }
      secret
    }
  }
`

export const DEPLOY_AGENT_MUTATION = gql`
  ${VERSION_FIELDS}
  ${VIRTUAL_KEY_FIELDS}
  mutation DeployAgent($input: DeployAgentInput!) {
    deployAgent(input: $input) {
      agent {
        id
        name
        type
        status
        endpoint
        createdAt
        updatedAt
        apiKey {
          id
          name
        }
        credentials {
          username
        }
        templateFamilyId
        templateVersionId
        resourcePoolId
      }
      virtualKey {
        ...VirtualKeyFields
      }
      templateVersion {
        ...OvaTemplateVersionFields
      }
      resourcePool {
        id
        name
        endpoint
        connectionStatus
        syncStatus
        lastSyncedAt
      }
    }
  }
`

export {
  FAMILY_FIELDS,
  VERSION_FIELDS,
  VIRTUAL_KEY_FIELDS,
}
