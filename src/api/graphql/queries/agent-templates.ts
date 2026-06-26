import { gql } from '@apollo/client/core'

// Agent templates / catalog (智能体模板). The backend keys upsert by `kind`
// (the catalog identity, e.g. goose / xiaoguai / qoder), so the create/edit
// form treats `kind` as the immutable identity on edit. `agentTemplates` is
// browsable by any authenticated user; `upsertAgentTemplate` is admin-only
// (@hasRole(any: [admin])) — non-admin callers get a backend error surfaced
// via toast. There is no delete operation in the schema.

const AGENT_TEMPLATE_FIELDS = gql`
  fragment AgentTemplateFields on AgentTemplate {
    id
    kind
    display
    description
    installMethod
    installCommand
    status
    version
    knowledgeRoot
    knowledgePrompt
    createdAt
  }
`

export const AGENT_TEMPLATES_QUERY = gql`
  query AgentTemplatesList {
    agentTemplates {
      ...AgentTemplateFields
    }
  }
  ${AGENT_TEMPLATE_FIELDS}
`

export const UPSERT_AGENT_TEMPLATE = gql`
  mutation UpsertAgentTemplateEntry($input: UpsertAgentTemplateInput!) {
    upsertAgentTemplate(input: $input) {
      ...AgentTemplateFields
    }
  }
  ${AGENT_TEMPLATE_FIELDS}
`

// Mirrors the schema enums (agent.graphql). Exported as runtime `as const`
// arrays so they can be iterated (enum → locale-key coverage test); the TS
// union types are derived from the arrays to keep a single source of truth.
export const INSTALL_METHODS = ['offline_tar', 'curl', 'unset'] as const
export type InstallMethod = (typeof INSTALL_METHODS)[number]

export const AGENT_TEMPLATE_STATUSES = ['active', 'deferred'] as const
export type AgentTemplateStatus = (typeof AGENT_TEMPLATE_STATUSES)[number]

export interface AgentTemplateNode {
  id: string
  kind: string
  display: string
  description: string | null
  installMethod: InstallMethod
  installCommand: string | null
  status: AgentTemplateStatus
  version: string | null
  knowledgeRoot: string | null
  knowledgePrompt: string | null
  createdAt: string
}

export interface AgentTemplatesResult {
  agentTemplates: AgentTemplateNode[]
}

export interface UpsertAgentTemplateInput {
  kind: string
  display: string
  description?: string | null
  installMethod: InstallMethod
  installCommand?: string | null
  status: AgentTemplateStatus
  version?: string | null
  knowledgeRoot?: string | null
  knowledgePrompt?: string | null
}

export interface UpsertAgentTemplateVars {
  input: UpsertAgentTemplateInput
}

export interface UpsertAgentTemplateResult {
  upsertAgentTemplate: AgentTemplateNode
}
