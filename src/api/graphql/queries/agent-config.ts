import { gql } from '@apollo/client/core'

// 智能体配置 (Agent Config) — LLD-11 OKF knowledge grounding.
//
// An AgentConfig is a named, per-agent-type config that mounts a set of OKF
// knowledge packs (kind=knowledge Artifacts, N:M). The only mutation surfaced
// on this page is `setAgentConfigKnowledge`, which replaces the mounted set
// wholesale. The available packs are listed via `artifacts(kind: knowledge)`.

// Shared shape of a kind=knowledge Artifact as the picker / mounted list need it.
const KNOWLEDGE_ARTIFACT_FIELDS = gql`
  fragment KnowledgeArtifactFields on Artifact {
    id
    name
    kind
    version
    uri
    sha256
    createdAt
  }
`

// Full AgentConfig shape including the lazily-resolved knowledge edge.
const AGENT_CONFIG_FIELDS = gql`
  fragment AgentConfigFields on AgentConfig {
    id
    name
    agentType
    isDefault
    artifactId
    knowledge {
      ...KnowledgeArtifactFields
    }
    createdAt
  }
  ${KNOWLEDGE_ARTIFACT_FIELDS}
`

export const AGENT_CONFIGS_QUERY = gql`
  query AgentConfigs($agentType: String) {
    agentConfigs(agentType: $agentType) {
      ...AgentConfigFields
    }
  }
  ${AGENT_CONFIG_FIELDS}
`

export const KNOWLEDGE_ARTIFACTS_QUERY = gql`
  query KnowledgeArtifacts {
    artifacts(kind: knowledge) {
      ...KnowledgeArtifactFields
    }
  }
  ${KNOWLEDGE_ARTIFACT_FIELDS}
`

export const SET_AGENT_CONFIG_KNOWLEDGE = gql`
  mutation SetAgentConfigKnowledge($configId: ID!, $knowledgeArtifactIds: [ID!]!) {
    setAgentConfigKnowledge(configId: $configId, knowledgeArtifactIds: $knowledgeArtifactIds) {
      ...AgentConfigFields
    }
  }
  ${AGENT_CONFIG_FIELDS}
`
