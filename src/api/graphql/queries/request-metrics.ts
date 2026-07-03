import { gql } from '@apollo/client/core'

// Request metrics (实时监控 — 模块⑥ 可观测性). One aggregation query returns the
// time-series buckets + a range summary that the real-time monitor page renders as
// KPI cards and hand-drawn SVG charts. The page derives `granularity` from the
// selected time window (MINUTE/HOUR/DAY) to keep bucket counts bounded, and polls
// by recomputing `from`/`to` on a timer so reactive `useQuery` refetches.
//
// `errorRate` is a Float in [0.0, 1.0]; latencies are Int ms; `timestamp` /
// `rangeStart` / `rangeEnd` are ISO-8601 Time strings. The optional filter is
// passed as `null` in v1 (no filter UI yet) but typed for forward compatibility.

export const REQUEST_METRICS_QUERY = gql`
  query RequestMetrics(
    $from: Time!
    $to: Time!
    $granularity: RequestMetricsBucketGranularity!
    $filter: RequestMetricsFilter
  ) {
    requestMetrics(from: $from, to: $to, granularity: $granularity, filter: $filter) {
      rangeStart
      rangeEnd
      granularity
      summary {
        totalRequests
        totalErrors
        errorRate
        avgLatencyMs
        p50LatencyMs
        p95LatencyMs
        p99LatencyMs
        totalInputTokens
        totalOutputTokens
      }
      buckets {
        timestamp
        requestCount
        errorCount
        avgLatencyMs
        p95LatencyMs
        inputTokensTotal
        outputTokensTotal
      }
    }
  }
`

export type RequestMetricsGranularity = 'MINUTE' | 'HOUR' | 'DAY'

export interface RequestMetricsBucket {
  timestamp: string
  requestCount: number
  errorCount: number
  avgLatencyMs: number
  p95LatencyMs: number
  inputTokensTotal: number
  outputTokensTotal: number
}

export interface RequestMetricsSummary {
  totalRequests: number
  totalErrors: number
  // Float in [0.0, 1.0].
  errorRate: number
  avgLatencyMs: number
  p50LatencyMs: number
  p95LatencyMs: number
  p99LatencyMs: number
  totalInputTokens: number
  totalOutputTokens: number
}

export interface RequestMetrics {
  rangeStart: string
  rangeEnd: string
  granularity: RequestMetricsGranularity
  summary: RequestMetricsSummary
  buckets: RequestMetricsBucket[]
}

export interface RequestMetricsFilterInput {
  statusCode?: number | null
  agentId?: string | null
  model?: string | null
}

export interface RequestMetricsVars {
  from: string
  to: string
  granularity: RequestMetricsGranularity
  filter?: RequestMetricsFilterInput | null
}

export interface RequestMetricsResult {
  requestMetrics: RequestMetrics
}
