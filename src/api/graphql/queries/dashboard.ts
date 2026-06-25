import { gql } from '@apollo/client/core'

// Dashboard / overview (控制台首页). One query returns everything the page renders:
// stat-card counts (agents by status, virtual keys, gateways, resource pools,
// users) + the current month's calls/tokens/cost, the newest agents (最近创建的实例),
// and system notices (系统通知, derived from the most recent audit logs). All values
// are live DB reads — no mock data.

export const DASHBOARD_OVERVIEW_QUERY = gql`
  query DashboardOverview($recentLimit: Int, $noticeLimit: Int) {
    dashboardOverview(recentLimit: $recentLimit, noticeLimit: $noticeLimit) {
      stats {
        totalAgents
        runningAgents
        stoppedAgents
        exceptionAgents
        totalVirtualKeys
        totalGateways
        totalResourcePools
        totalUsers
        monthlyCalls
        monthlyTokens
        monthlyCost
      }
      recentAgents {
        id
        name
        agentName
        status
        createdAt
      }
      notices {
        id
        text
        status
        occurredAt
      }
    }
  }
`

export type DashboardAgentStatus = 'running' | 'stopped' | 'exception'
export type DashboardNoticeStatus = 'success' | 'warning' | 'danger'

export interface DashboardStats {
  totalAgents: number
  runningAgents: number
  stoppedAgents: number
  exceptionAgents: number
  totalVirtualKeys: number
  totalGateways: number
  totalResourcePools: number
  totalUsers: number
  monthlyCalls: number
  monthlyTokens: number
  monthlyCost: number
}

export interface DashboardRecentAgent {
  id: string
  name: string
  agentName: string
  status: DashboardAgentStatus
  createdAt: string
}

export interface DashboardNotice {
  id: string
  text: string
  status: DashboardNoticeStatus
  occurredAt: string
}

export interface DashboardOverview {
  stats: DashboardStats
  recentAgents: DashboardRecentAgent[]
  notices: DashboardNotice[]
}

export interface DashboardOverviewVars {
  recentLimit?: number | null
  noticeLimit?: number | null
}

export interface DashboardOverviewResult {
  dashboardOverview: DashboardOverview
}
