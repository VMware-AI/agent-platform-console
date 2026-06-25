import { gql } from '@apollo/client/core'

// Request logs (请求日志 — 模块⑥ 可观测性). Read-only audit feed of upstream LLM
// requests proxied through the gateway. Gated by `audit:view` on the backend.
//
// The op returns a bare list (no total count). Pagination is offset/limit via
// `PageInput`; "has more" is inferred client-side from `returned == limit`.

const REQUEST_LOG_FIELDS = gql`
  fragment RequestLogFields on RequestLog {
    id
    requestId
    userId
    agentId
    model
    inputTokens
    outputTokens
    latencyMs
    statusCode
    detail
    createdAt
  }
`

export const REQUEST_LOGS_QUERY = gql`
  query RequestLogs($filter: RequestLogFilter, $page: PageInput) {
    requestLogs(filter: $filter, page: $page) {
      ...RequestLogFields
    }
  }
  ${REQUEST_LOG_FIELDS}
`

export interface RequestLogNode {
  id: string
  requestId: string
  userId: string | null
  agentId: string | null
  model: string | null
  inputTokens: number
  outputTokens: number
  latencyMs: number
  statusCode: number
  detail: string | null
  createdAt: string
}

export interface RequestLogFilterInput {
  statusCode?: number | null
  agentId?: string | null
  model?: string | null
  requestId?: string | null
}

export interface RequestLogPageInput {
  limit?: number
  offset?: number
}

export interface RequestLogsVars {
  filter?: RequestLogFilterInput | null
  page?: RequestLogPageInput | null
}

export interface RequestLogsResult {
  requestLogs: RequestLogNode[]
}
