<script setup lang="ts">
import { computed, watch } from 'vue'
import { useQuery } from '@vue/apollo-composable'
import { useLocaleStore } from '@/stores/locale'
import { useToast } from '@/composables/useToast'
import { graphqlErrorMessage } from '@/api/graphql/errors'
import {
  DASHBOARD_OVERVIEW_QUERY,
  type DashboardAgentStatus,
  type DashboardNotice,
  type DashboardOverviewResult,
  type DashboardOverviewVars,
  type DashboardRecentAgent,
  type DashboardStats,
} from '@/api/graphql/queries/dashboard'
import '@/components/icons'

const locale = useLocaleStore()
const toast = useToast()

const RECENT_LIMIT = 5
const NOTICE_LIMIT = 5

// Read-only overview page: a single query feeds every stat card, the status
// donut, the recent-agents table, and the notices list. No mock data.
const { result, error } = useQuery<DashboardOverviewResult, DashboardOverviewVars>(
  DASHBOARD_OVERVIEW_QUERY,
  { recentLimit: RECENT_LIMIT, noticeLimit: NOTICE_LIMIT },
)

watch(error, (err) => {
  if (err) toast.error(graphqlErrorMessage(err, locale.t('agents.error')))
})

const stats = computed<DashboardStats | null>(
  () => result.value?.dashboardOverview?.stats ?? null,
)
const recentAgents = computed<DashboardRecentAgent[]>(
  () => result.value?.dashboardOverview?.recentAgents ?? [],
)
const notices = computed<DashboardNotice[]>(
  () => result.value?.dashboardOverview?.notices ?? [],
)

// --- Derived display values --------------------------------------------------

// Compact integer formatting (e.g. 52143 → "52k"), matching the original mock
// look of the metric numbers. Locale-aware so it follows the active language.
function formatCompact(value: number): string {
  return new Intl.NumberFormat(locale.locale, {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value)
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat(locale.locale).format(value)
}

function formatCost(value: number): string {
  return new Intl.NumberFormat(locale.locale, {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)
}

function percentOf(part: number, total: number): number {
  if (total <= 0) return 0
  return Math.round((part / total) * 100)
}

// Backend timestamps are ISO strings; render them as a compact local date-time.
// Falls back to the raw value if it is not a parseable date.
function formatDateTime(value: string): string {
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  return new Intl.DateTimeFormat(locale.locale, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(parsed)
}

const runningAgents = computed(() => stats.value?.runningAgents ?? 0)
const stoppedAgents = computed(() => stats.value?.stoppedAgents ?? 0)
const exceptionAgents = computed(() => stats.value?.exceptionAgents ?? 0)
const totalAgents = computed(() => stats.value?.totalAgents ?? 0)

const runningPercent = computed(() => percentOf(runningAgents.value, totalAgents.value))
const stoppedPercent = computed(() => percentOf(stoppedAgents.value, totalAgents.value))
const exceptionPercent = computed(() => percentOf(exceptionAgents.value, totalAgents.value))

// conic-gradient stops for the donut: running → stopped → exception.
const donutGradient = computed(() => {
  const running = runningPercent.value
  const stopped = running + stoppedPercent.value
  return (
    `var(--cds-alias-status-success, #1b8a4b) 0 ${running}%,` +
    `#e6a700 ${running}% ${stopped}%,` +
    `var(--cds-alias-status-danger, #c92100) ${stopped}% 100%`
  )
})

const monthlyCalls = computed(() => stats.value?.monthlyCalls ?? 0)
const monthlyTokens = computed(() => stats.value?.monthlyTokens ?? 0)
const monthlyCost = computed(() => stats.value?.monthlyCost ?? 0)

const monthlyCallsCompact = computed(() => formatCompact(monthlyCalls.value))
const monthlyCallsExact = computed(() => formatNumber(monthlyCalls.value))
const monthlyTokensCompact = computed(() => formatCompact(monthlyTokens.value))
const monthlyCostText = computed(() => formatCost(monthlyCost.value))

function statusLabel(status: DashboardAgentStatus): string {
  return locale.t(`dashboard.status.${status}`)
}
</script>

<template>
  <section class="dashboard">
    <header class="dashboard-header">
      <h1 class="heading" :title="locale.t('dashboard.overview.title')">
        {{ locale.t('dashboard.overview.title') }}
      </h1>
    </header>

    <div class="metric-grid">
      <cds-card class="metric-card">
        <div class="metric-content">
          <h2 class="metric-title">{{ locale.t('dashboard.metric.activeAgents') }}</h2>
          <div class="metric-main-line">
            <span class="health-dot success" aria-hidden="true"></span>
            <strong class="metric-number">{{ runningAgents }}</strong>
            <span class="metric-denominator">/ {{ totalAgents }}</span>
          </div>
          <p class="metric-caption">{{ locale.t('dashboard.metric.activeAgentsCaption') }}</p>
          <p class="metric-caption">{{ locale.t('dashboard.metric.activeAgentsFoot') }}</p>
        </div>
      </cds-card>

      <cds-card class="metric-card">
        <div class="metric-content">
          <h2 class="metric-title">{{ locale.t('dashboard.metric.totalCalls') }}</h2>
          <div class="metric-main-line compact">
            <strong class="metric-number">{{ monthlyCallsCompact }}</strong>
            <span class="metric-hint">{{ locale.t('dashboard.metric.deduplicated') }}</span>
          </div>
          <p class="metric-caption">
            {{ locale.t('dashboard.metric.thisMonth') }}: <strong>{{ monthlyCallsExact }}</strong>
            <span>{{ locale.t('dashboard.metric.detailedCount') }}</span>
          </p>
        </div>
      </cds-card>

      <cds-card class="metric-card">
        <div class="metric-content">
          <h2 class="metric-title">{{ locale.t('dashboard.metric.monthlyToken') }}</h2>
          <div class="metric-token-line">
            <span class="health-dot success" aria-hidden="true"></span>
            <strong>
              {{ locale.t('dashboard.metric.thisMonth') }}: {{ monthlyTokensCompact }} Token ({{ monthlyCostText }})
            </strong>
          </div>
          <div class="metric-cost-row">
            <span>{{ locale.t('dashboard.metric.estimatedCost') }}: {{ monthlyCostText }}</span>
          </div>
        </div>
      </cds-card>

      <cds-card class="metric-card">
        <div class="metric-content">
          <h2 class="metric-title">{{ locale.t('dashboard.metric.platformOverview') }}</h2>
          <p class="metric-caption emphasized">{{ locale.t('dashboard.metric.totalCalls') }}</p>
          <div class="metric-main-line compact overview-number">
            <strong class="metric-number">{{ monthlyCallsCompact }}</strong>
          </div>
          <p class="metric-caption">
            {{ locale.t('dashboard.metric.thisMonth') }}: <strong>{{ monthlyCallsExact }}</strong>
            <span>{{ locale.t('dashboard.metric.detailedCount') }}</span>
          </p>
        </div>
      </cds-card>
    </div>

    <div class="insight-grid">
      <cds-card class="panel-card distribution-card">
        <div class="panel-content">
          <h2 class="panel-title">{{ locale.t('dashboard.distribution.title') }}</h2>
          <div class="distribution-layout">
            <div
              class="donut-stage"
              :aria-label="`${locale.t('dashboard.status.running')} ${runningAgents}, ${locale.t('dashboard.status.stopped')} ${stoppedAgents}, ${locale.t('dashboard.status.exception')} ${exceptionAgents}`"
            >
              <div class="donut-chart" :style="{ background: `conic-gradient(${donutGradient})` }" aria-hidden="true">
                <div class="donut-hole"></div>
              </div>
              <div class="chart-callout exception">
                <span>{{ locale.t('dashboard.status.exception') }}</span>
                <strong>{{ exceptionAgents }} ({{ exceptionPercent }}%)</strong>
              </div>
              <div class="chart-callout running">
                <span>{{ locale.t('dashboard.status.running') }}</span>
                <strong>{{ runningAgents }} ({{ runningPercent }}%)</strong>
              </div>
              <div class="chart-callout stopped">
                <span>{{ locale.t('dashboard.status.stopped') }}</span>
                <strong>{{ stoppedAgents }} ({{ stoppedPercent }}%)</strong>
              </div>
            </div>

            <ul class="distribution-legend" :aria-label="locale.t('dashboard.distribution.title')">
              <li>
                <span class="legend-dot running"></span>
                <span>{{ locale.t('dashboard.status.running') }} {{ runningAgents }} ({{ runningPercent }}%)</span>
              </li>
              <li>
                <span class="legend-dot stopped"></span>
                <span>{{ locale.t('dashboard.status.stopped') }} {{ stoppedAgents }} ({{ stoppedPercent }}%)</span>
              </li>
              <li>
                <span class="legend-dot exception"></span>
                <span>{{ locale.t('dashboard.status.exception') }} {{ exceptionAgents }} ({{ exceptionPercent }}%)</span>
              </li>
            </ul>
          </div>
        </div>
      </cds-card>

      <cds-card class="panel-card recent-card">
        <div class="panel-content">
          <h2 class="panel-title">{{ locale.t('dashboard.recent.title') }}</h2>
          <div class="recent-table-wrap">
            <table class="recent-table">
              <thead>
                <tr>
                  <th scope="col">
                    {{ locale.t('dashboard.recent.name') }}
                    <cds-icon shape="info-circle" size="sm" aria-hidden="true"></cds-icon>
                  </th>
                  <th scope="col">{{ locale.t('dashboard.recent.agentName') }}</th>
                  <th scope="col">{{ locale.t('dashboard.recent.createdAt') }}</th>
                  <th scope="col">{{ locale.t('dashboard.recent.status') }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="agent in recentAgents" :key="agent.id">
                  <td class="instance-name" :title="agent.name">{{ agent.name }}</td>
                  <td>{{ agent.agentName }}</td>
                  <td class="date-cell">{{ formatDateTime(agent.createdAt) }}</td>
                  <td>
                    <span class="status-label" :class="agent.status">
                      <span class="status-dot"></span>
                      {{ statusLabel(agent.status) }}
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </cds-card>
    </div>

    <cds-card class="panel-card notice-card">
      <div class="panel-content">
        <h2 class="panel-title notice-title">{{ locale.t('dashboard.notices.title') }}</h2>
        <ul class="notice-list">
          <li v-for="notice in notices" :key="notice.id">
            <span class="notice-dot" :class="notice.status" aria-hidden="true"></span>
            <span class="notice-text">{{ notice.text }}</span>
            <time :datetime="notice.occurredAt">{{ formatDateTime(notice.occurredAt) }}</time>
          </li>
        </ul>
      </div>
    </cds-card>
  </section>
</template>

<style scoped>
.dashboard {
  height: 100%;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
  overflow: auto;
  color: var(--cds-alias-object-app-foreground, #1b1b1b);
}
.dashboard-header {
  width: 100%;
  min-width: 0;
  flex: 0 0 auto;
  overflow: visible;
}
.heading {
  display: block;
  width: 100%;
  min-height: 32px;
  margin: 0;
  font-size: 24px;
  line-height: 1.3;
  font-weight: 600;
  letter-spacing: -0.01em;
  overflow: visible;
  text-overflow: clip;
  white-space: normal;
  word-break: keep-all;
}
.metric-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
  flex: 0 0 auto;
}
.dashboard :deep(cds-card) {
  display: block;
  min-width: 0;
  background: var(--cds-alias-object-container-background, #fff);
  border: 1px solid var(--cds-alias-object-border-color, #b3b3b3);
  border-radius: 6px;
  box-shadow: none;
}
.metric-card {
  min-height: 112px;
}
.metric-content {
  height: 100%;
  padding: 13px 14px;
  display: flex;
  flex-direction: column;
  justify-content: center;
}
.metric-title,
.panel-title {
  margin: 0;
  font-size: 15px;
  line-height: 1.3;
  font-weight: 600;
}
.metric-main-line {
  min-height: 32px;
  display: flex;
  align-items: center;
  gap: 5px;
}
.metric-main-line.compact {
  gap: 8px;
}
.health-dot,
.status-dot,
.notice-dot,
.legend-dot {
  display: inline-block;
  flex: 0 0 auto;
  border-radius: 50%;
}
.health-dot {
  width: 11px;
  height: 11px;
}
.health-dot.success {
  background: var(--cds-alias-status-success, #1b8a4b);
}
.metric-number {
  font-size: 27px;
  line-height: 1;
  font-weight: 650;
  letter-spacing: -0.02em;
}
.metric-denominator {
  font-size: 21px;
  font-weight: 500;
}
.metric-hint {
  color: var(--cds-alias-typography-color-300, #565656);
  font-size: 12px;
}
.metric-caption {
  margin: 1px 0 0;
  font-size: 12px;
  line-height: 1.35;
}
.metric-caption span {
  color: var(--cds-alias-typography-color-300, #565656);
}
.metric-caption.emphasized {
  margin-top: 2px;
}
.trend-up {
  color: var(--cds-alias-status-success, #14834a);
  font-weight: 600;
}
.metric-token-line {
  min-height: 28px;
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
}
.metric-cost-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-top: 1px;
  font-size: 12px;
}
.usage-progress {
  height: 6px;
  margin-top: 8px;
  overflow: hidden;
  border-radius: 999px;
  background: var(--cds-alias-object-border-color, #d7d7d7);
}
.usage-progress > span {
  display: block;
  width: 20%;
  height: 100%;
  border-radius: inherit;
  background: var(--cds-alias-status-success, #1b8a4b);
}
.overview-number {
  min-height: 26px;
}
.insight-grid {
  min-height: 200px;
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 12px;
  flex: 1 1 auto;
}
.panel-card {
  min-height: 0;
}
.panel-content {
  height: 100%;
  min-height: 0;
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
}
.distribution-layout {
  min-height: 0;
  flex: 1;
  display: grid;
  grid-template-columns: minmax(230px, 1.3fr) minmax(145px, 0.8fr);
  align-items: center;
  gap: 8px;
}
.donut-stage {
  position: relative;
  min-height: 160px;
}
.donut-chart {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 118px;
  height: 118px;
  transform: translate(-50%, -50%);
  border-radius: 50%;
  background: conic-gradient(
    var(--cds-alias-status-success, #1b8a4b) 0 30%,
    #e6a700 30% 80%,
    var(--cds-alias-status-danger, #c92100) 80% 100%
  );
  box-shadow: inset 0 0 0 1px color-mix(in srgb, #000 12%, transparent);
}
.donut-hole {
  position: absolute;
  inset: 28px;
  border-radius: 50%;
  background: var(--cds-alias-object-container-background, #fff);
  box-shadow: 0 0 0 1px color-mix(in srgb, #000 5%, transparent);
}
.chart-callout {
  position: absolute;
  display: flex;
  flex-direction: column;
  font-size: 11px;
  line-height: 1.2;
  white-space: nowrap;
}
.chart-callout strong {
  font-weight: 500;
}
.chart-callout.exception {
  left: 5%;
  top: 15%;
}
.chart-callout.running {
  right: 1%;
  top: 20%;
}
.chart-callout.stopped {
  left: 8%;
  bottom: 8%;
}
.chart-callout::after {
  content: '';
  position: absolute;
  top: 11px;
  width: 34px;
  height: 1px;
  background: currentColor;
  opacity: 0.5;
}
.chart-callout.exception::after,
.chart-callout.stopped::after {
  left: calc(100% + 5px);
  transform: rotate(12deg);
  transform-origin: left;
}
.chart-callout.running::after {
  right: calc(100% + 5px);
  transform: rotate(-12deg);
  transform-origin: right;
}
.distribution-legend {
  margin: 0;
  padding: 0;
  list-style: none;
  display: grid;
  gap: 8px;
  font-size: 12px;
}
.distribution-legend li {
  display: flex;
  align-items: center;
  gap: 6px;
}
.legend-dot {
  width: 11px;
  height: 11px;
}
.legend-dot.running,
.status-label.running .status-dot {
  background: var(--cds-alias-status-success, #1b8a4b);
}
.legend-dot.stopped,
.status-label.stopped .status-dot {
  background: #e6a700;
}
.legend-dot.exception,
.status-label.exception .status-dot {
  background: var(--cds-alias-status-danger, #c92100);
}
.recent-table-wrap {
  min-height: 0;
  margin-top: 10px;
  overflow: auto;
}
.recent-table {
  width: 100%;
  min-width: 470px;
  border-collapse: collapse;
  table-layout: fixed;
  font-size: 11px;
}
.recent-table th,
.recent-table td {
  padding: 8px 7px;
  overflow: hidden;
  text-align: left;
  text-overflow: ellipsis;
  white-space: nowrap;
  border-bottom: 1px solid var(--cds-alias-object-border-color, #d7d7d7);
}
.recent-table th {
  background: var(--cds-alias-object-app-background, #e9eaee);
  font-weight: 600;
}
.recent-table th:nth-child(1) { width: 24%; }
.recent-table th:nth-child(2) { width: 24%; }
.recent-table th:nth-child(3) { width: 28%; }
.recent-table th:nth-child(4) { width: 24%; }
.recent-table th cds-icon {
  vertical-align: -2px;
}
.instance-name {
  font-weight: 600;
}
.date-cell {
  font-variant-numeric: tabular-nums;
}
.status-label {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}
.status-dot {
  width: 9px;
  height: 9px;
}
.notice-card {
  min-height: 126px;
  flex: 0 0 auto;
}
.notice-title {
  padding-bottom: 8px;
  border-bottom: 1px solid var(--cds-alias-object-border-color, #d7d7d7);
}
.notice-list {
  margin: 7px 0 0;
  padding: 0;
  list-style: none;
  display: grid;
  gap: 7px;
}
.notice-list li {
  display: grid;
  grid-template-columns: 11px minmax(0, 1fr) auto;
  align-items: center;
  gap: 7px;
  font-size: 12px;
}
.notice-dot {
  width: 10px;
  height: 10px;
}
.notice-dot.success { background: var(--cds-alias-status-success, #1b8a4b); }
.notice-dot.warning { background: #e6a700; }
.notice-dot.danger { background: var(--cds-alias-status-danger, #c92100); }
.notice-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.notice-list time {
  font-variant-numeric: tabular-nums;
}
@media (max-width: 1120px) {
  .metric-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .insight-grid {
    grid-template-columns: 1fr;
  }
  .distribution-card,
  .recent-card {
    min-height: 220px;
  }
}
@media (max-width: 660px) {
  .metric-grid {
    grid-template-columns: 1fr;
  }
  .distribution-layout {
    grid-template-columns: 1fr;
  }
  .distribution-legend {
    grid-template-columns: repeat(3, auto);
    justify-content: center;
  }
  .notice-list li {
    grid-template-columns: 11px minmax(0, 1fr);
  }
  .notice-list time {
    grid-column: 2;
    color: var(--cds-alias-typography-color-300, #565656);
  }
}
</style>
