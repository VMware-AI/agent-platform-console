/**
 * GraphQL types — agent config (`AgentConfig` / `KnowledgeArtifact` /
 * query / mutation vars and results). Mirrors the backend schema;
 * replace with codegen output when available.
 *
 * Why these types live next to the others in `src/types/` rather than
 * next to `queries/agent-config.ts`: the gql operations and fragments
 * stay in `queries/agent-config.ts` (single source of truth for the
 * wire format), while these TypeScript shapes stay importable as types
 * only — matching the layout used by agents / user-role / resource-pool
 * / marketplace.
 */

export interface KnowledgeArtifactNode {
  id: string
  name: string
  kind: string
  version: string
  uri: string
  sha256: string | null
  createdAt: string
}

export interface AgentConfigNode {
  id: string
  name: string
  agentType: string
  isDefault: boolean
  artifactId: string | null
  knowledge: KnowledgeArtifactNode[]
  createdAt: string
}

export interface AgentConfigsVars {
  agentType?: string | null
}

export interface AgentConfigsResult {
  agentConfigs: AgentConfigNode[]
}

export interface KnowledgeArtifactsResult {
  artifacts: KnowledgeArtifactNode[]
}

export interface SetAgentConfigKnowledgeVars {
  configId: string
  knowledgeArtifactIds: string[]
}

export interface SetAgentConfigKnowledgeResult {
  setAgentConfigKnowledge: AgentConfigNode
}