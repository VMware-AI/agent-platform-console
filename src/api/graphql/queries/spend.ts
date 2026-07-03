import { gql } from '@apollo/client/core'

// Gateway-authoritative spend (LLD-15). The backend holds each gateway's master
// key and fans out to litellm's /global/spend/report + /*/info endpoints, merging
// across gateways; the console never talks to litellm directly. Distinct from
// METERING_OVERVIEW_QUERY, which aggregates the platform's own TokenUsage table.

export const SPEND_REPORT_QUERY = gql`
  query SpendReport($input: SpendReportInput!) {
    spendReport(input: $input) {
      from
      to
      groupBy
      rows {
        key
        label
        spend
        promptTokens
        completionTokens
        totalTokens
        requests
      }
      totals {
        spend
        promptTokens
        completionTokens
        totalTokens
        requests
      }
      byDay {
        date
        spend
        totalTokens
      }
      gateways {
        gatewayId
        gatewayName
        ok
        error
      }
    }
  }
`

export const BUDGETS_QUERY = gql`
  query Budgets($scope: BudgetScope!) {
    budgets(scope: $scope) {
      scope
      label
      spend
      maxBudget
      remaining
      budgetResetAt
      utilizationPct
    }
  }
`

export type SpendGroupBy = 'TEAM' | 'MODEL' | 'API_KEY'

export interface SpendRow {
  key: string
  label: string
  spend: number
  promptTokens: number
  completionTokens: number
  totalTokens: number
  requests: number
}

export interface SpendReportResult {
  spendReport: {
    from: string
    to: string
    groupBy: SpendGroupBy
    rows: SpendRow[]
    totals: {
      spend: number
      promptTokens: number
      completionTokens: number
      totalTokens: number
      requests: number
    }
    byDay: { date: string; spend: number; totalTokens: number }[]
    gateways: { gatewayId: string; gatewayName: string; ok: boolean; error: string | null }[]
  }
}

export interface SpendReportVars {
  input: { from: string; to: string; groupBy: SpendGroupBy }
}

export interface Budget {
  scope: string
  label: string
  spend: number
  maxBudget: number | null
  remaining: number | null
  budgetResetAt: string | null
  utilizationPct: number | null
}

export interface BudgetsResult {
  budgets: Budget[]
}
