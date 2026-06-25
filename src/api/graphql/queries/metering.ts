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
