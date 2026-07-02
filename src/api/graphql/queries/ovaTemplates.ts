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
      ovfProperties {
        key
        label
        type
        defaultValue
        description
        required
        password
        values
        category
      }
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
    ovfProperties {
      key
      label
      type
      defaultValue
      description
      required
      password
      values
      category
    }
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

// Deploy a NEW agent from an OVA template version. The backend creates the agent,
// provisions its VM, issues the gateway key, and returns its secret ONCE via
// `virtualKeySecret` (surfaced in a reveal dialog) — there is no separate
// pick/create-virtual-key step.
export const DEPLOY_AGENT_MUTATION = gql`
  ${VERSION_FIELDS}
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
      virtualKeySecret
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

export { FAMILY_FIELDS, VERSION_FIELDS }
