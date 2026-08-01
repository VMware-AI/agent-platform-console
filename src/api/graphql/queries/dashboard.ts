import { gql } from '@apollo/client/core'

export const DASHBOARD_OVERVIEW_QUERY = gql`
  query DashboardOverview($recentLimit: Int, $noticeLimit: Int) {
    dashboardOverview(recentLimit: $recentLimit, noticeLimit: $noticeLimit) {
      generatedAt
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
        successfulCalls
        failedCalls
        successRate
        p95LatencyMs
        overallStatus
        criticalCount
        warningCount
        totalModels
        healthyModels
      }
      agentHealth {
        totalAgents
        runningAgents
        stoppedAgents
        abnormalAgents
        unknownAgents
        agentsWithoutAvailableModel
        abnormalInstances
        distributions {
          status
          count
        }
        agents {
          agentId
          agentName
          status
          healthyInstanceCount
          totalInstanceCount
          primaryModelId
          primaryModelName
          lastActiveAt
          lastHealthCheckAt
          healthMessage
        }
      }
      activeAlerts {
        alertId
        severity
        title
        resourceType
        resourceId
        resourceName
        status
        occurredAt
      }
      monthlyUsage {
        inputTokens
        outputTokens
        totalTokens
        estimatedCost
        projectedMonthlyCost
        changeFromPreviousMonth
        topAgent {
          id
          name
          provider
          totalTokens
          estimatedCost
        }
        topModel {
          id
          name
          provider
          totalTokens
          estimatedCost
        }
      }
      componentHealth {
        componentType
        componentName
        status
        healthyCount
        totalCount
        lastCheckedAt
        errorSummary
      }
    }
  }
`

export type DashboardAgentStatus = 'running' | 'stopped' | 'exception'
export type DashboardAgentHealthStatus = 'RUNNING' | 'STOPPED' | 'ABNORMAL' | 'UNKNOWN'
export type DashboardNoticeStatus = 'success' | 'warning' | 'danger'
export type DashboardAlertSeverity = 'CRITICAL' | 'WARNING' | 'INFO'
export type DashboardHealthStatus = 'HEALTHY' | 'WARNING' | 'DEGRADED' | 'CRITICAL'

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
  successfulCalls: number
  failedCalls: number
  successRate: number
  p95LatencyMs: number
  avgLatencyMs?: number | null
  overallStatus: DashboardHealthStatus
  criticalCount: number
  warningCount: number
  totalModels: number
  healthyModels: number
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
  severity: DashboardAlertSeverity
  resourceType?: string | null
  resourceId?: string | null
  resourceName?: string | null
  durationSeconds?: number | null
}

export interface DashboardRun {
  runId: string
  requestId?: string | null
  agentId: string
  agentName: string
  modelName: string
  modelProvider?: string | null
  status: string
  inputTokens: number
  outputTokens: number
  totalTokens: number
  latencyMs: number
  retryCount?: number | null
  errorType?: string | null
  errorMessage?: string | null
  startedAt: string
  finishedAt?: string | null
}

export interface DashboardAgentHealthDistribution {
  status: DashboardAgentHealthStatus
  count: number
}

export interface DashboardAgentHealthRow {
  agentId: string
  agentName: string
  status: DashboardAgentHealthStatus
  healthyInstanceCount: number
  totalInstanceCount: number
  primaryModelId?: string | null
  primaryModelName?: string | null
  lastActiveAt?: string | null
  lastHealthCheckAt?: string | null
  healthMessage?: string | null
}

export interface DashboardAgentHealth {
  totalAgents: number
  runningAgents: number
  stoppedAgents: number
  abnormalAgents: number
  unknownAgents: number
  agentsWithoutAvailableModel: number
  abnormalInstances: number
  distributions: DashboardAgentHealthDistribution[]
  agents: DashboardAgentHealthRow[]
}

export interface DashboardActiveAlert {
  alertId: string
  severity: DashboardAlertSeverity
  title: string
  resourceType: string
  resourceId?: string | null
  resourceName: string
  status: string
  occurredAt: string
}

export interface DashboardTopConsumer {
  id: string
  name: string
  provider?: string | null
  totalTokens: number
  estimatedCost: number
}

export interface MonthlyUsageSnapshot {
  inputTokens: number
  outputTokens: number
  totalTokens: number
  estimatedCost: number
  projectedMonthlyCost: number
  changeFromPreviousMonth?: number | null
  topAgent?: DashboardTopConsumer | null
  topModel?: DashboardTopConsumer | null
}

export interface DashboardComponentHealth {
  componentType: string
  componentName: string
  status: string
  healthyCount: number
  totalCount: number
  lastCheckedAt?: string | null
  errorSummary?: string | null
}

export interface DashboardOverview {
  generatedAt: string
  stats: DashboardStats
  recentAgents?: DashboardRecentAgent[]
  notices?: DashboardNotice[]
  recentRuns?: DashboardRun[]
  agentHealth: DashboardAgentHealth
  activeAlerts: DashboardActiveAlert[]
  monthlyUsage: MonthlyUsageSnapshot
  componentHealth: DashboardComponentHealth[]
}

export interface DashboardOverviewVars {
  recentLimit?: number | null
  noticeLimit?: number | null
}

export interface DashboardOverviewResult {
  dashboardOverview: DashboardOverview
}
