import { gql } from '@apollo/client/core'

// Audit logs (模块⑥ 可观测性 / 审计日志). Read-only against the backend
// `auditLogs(filter, page)` query, which is gated by @hasPermission(perm:
// "audit:view"). The connection returns a page of `items` plus a real `total`
// for offset/limit pagination.
//
// `actionPrefix` filters by the action category — the backend records actions as
// dotted strings like "user.login", "rate_limit.upsert", "key.issue" — so a
// prefix such as "user." narrows to a whole category. `search` is a substring
// match across action + resourceId (see AuditFilter in the backend schema).

export const AUDIT_LOGS_QUERY = gql`
  query AuditLogs($filter: AuditFilter, $page: PageInput) {
    auditLogs(filter: $filter, page: $page) {
      items {
        id
        actorUserId
        actorName
        action
        resourceType
        resourceId
        ip
        result
        detail
        createdAt
      }
      total
    }
  }
`

export interface AuditLogNode {
  id: string
  actorUserId: string | null
  actorName: string | null
  action: string
  resourceType: string | null
  resourceId: string | null
  ip: string | null
  result: string
  detail: string | null
  createdAt: string
}

export interface AuditConnection {
  items: AuditLogNode[]
  total: number
}

export interface AuditLogsResult {
  auditLogs: AuditConnection
}

export interface AuditFilterInput {
  actorUserId?: string | null
  actionPrefix?: string | null
  search?: string | null
  from?: string | null
  to?: string | null
  result?: string | null
  resourceType?: string | null
}

export interface PageInput {
  limit?: number
  offset?: number
}

export interface AuditLogsVars {
  filter?: AuditFilterInput | null
  page?: PageInput | null
}
