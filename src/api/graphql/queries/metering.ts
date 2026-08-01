import { gql } from '@apollo/client/core'

// Metering center (计量中心). One query returns everything the page renders for a
// selected time range: per-agent / per-model / per-day usage rows (each with a
// request count), grand totals, and the cost summary cards. The time-range
// selector maps to MeteringTimeRange (默认 LAST_7_DAYS). All token/cost figures are
// aggregated server-side over real TokenUsage rows.

export const METERING_OVERVIEW_QUERY = gql`
  query MeteringOverview($range: MeteringTimeRange, $userId: ID) {
    meteringOverview(range: $range, userId: $userId) {
      range
      totalInputTokens
      totalOutputTokens
      totalTokens
      totalRequests
      byAgent {
        agentId
        agentName
        inputTokens
        outputTokens
        totalTokens
        requests
        cost
      }
      byModel {
        model
        inputTokens
        outputTokens
        totalTokens
        requests
        cost
        inputPricePerToken
        outputPricePerToken
      }
      byDay {
        date
        inputTokens
        outputTokens
        totalTokens
        requests
        cost
      }
      cost {
        totalCost
        monthlyCost
      }
    }
  }
`

export type MeteringTimeRange = 'LAST_7_DAYS' | 'LAST_30_DAYS' | 'THIS_MONTH'

export interface AgentUsageRow {
  agentId: string
  agentName: string
  inputTokens: number
  outputTokens: number
  totalTokens: number
  requests: number
  cost: number
}

export interface ModelUsageRow {
  model: string
  inputTokens: number
  outputTokens: number
  totalTokens: number
  requests: number
  cost: number
  inputPricePerToken?: number | null
  outputPricePerToken?: number | null
}

export interface DailyUsageRow {
  date: string
  inputTokens: number
  outputTokens: number
  totalTokens: number
  requests: number
  cost: number
}

export interface MeteringCostSummary {
  totalCost: number
  monthlyCost: number
}

export interface MeteringOverview {
  range: MeteringTimeRange
  totalInputTokens: number
  totalOutputTokens: number
  totalTokens: number
  totalRequests: number
  byAgent: AgentUsageRow[]
  byModel: ModelUsageRow[]
  byDay: DailyUsageRow[]
  cost: MeteringCostSummary
}

export interface MeteringOverviewVars {
  range?: MeteringTimeRange | null
  userId?: string | null
}

export interface MeteringOverviewResult {
  meteringOverview: MeteringOverview
}

// Cross-tab queries for the drill-down pages. The server pushes the grouping
// down (GROUP BY in DB) so the response sizes stay bounded by the low-cardinality
// dimension on the right (number of models per agent, or number of agents per
// model — both small in practice).
export const MODELS_FOR_AGENT_QUERY = gql`
  query ModelsForAgent($agentId: ID!, $range: MeteringTimeRange) {
    modelsForAgent(agentId: $agentId, range: $range) {
      model
      inputTokens
      outputTokens
      totalTokens
      requests
      cost
    }
  }
`
export interface ModelsForAgentVars {
  agentId: string
  range?: MeteringTimeRange | null
}
export interface ModelsForAgentResult {
  modelsForAgent: ModelUsageRow[]
}

export const AGENTS_FOR_MODEL_QUERY = gql`
  query AgentsForModel($model: String!, $range: MeteringTimeRange) {
    agentsForModel(model: $model, range: $range) {
      agentId
      agentName
      inputTokens
      outputTokens
      totalTokens
      requests
      cost
    }
  }
`
export interface AgentsForModelVars {
  model: string
  range?: MeteringTimeRange | null
}
export interface AgentsForModelResult {
  agentsForModel: AgentUsageRow[]
}

// Combined "智能体 × 模型" pair summary, always returned (zeros when no usage).
export const AGENT_MODEL_USAGE_QUERY = gql`
  query AgentModelUsage($agentId: ID!, $model: String!, $range: MeteringTimeRange) {
    agentModelUsage(agentId: $agentId, model: $model, range: $range) {
      agentId
      agentName
      inputTokens
      outputTokens
      totalTokens
      requests
      cost
    }
  }
`
export interface AgentModelUsageVars {
  agentId: string
  model: string
  range?: MeteringTimeRange | null
}
export interface AgentModelUsageResult {
  agentModelUsage: AgentUsageRow
}
