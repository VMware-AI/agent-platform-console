<script setup lang="ts">
import { useLocaleStore } from '@/stores/locale'
import '@/components/icons'

type AgentStatus = 'running' | 'stopped' | 'exception'
type NoticeStatus = 'success' | 'warning' | 'danger'

interface RecentAgent {
  id: string
  name: string
  agentName: string
  createdAt: string
  status: AgentStatus
}

interface SystemNotice {
  id: string
  text: string
  occurredAt: string
  status: NoticeStatus
}

const locale = useLocaleStore()

const recentAgents: RecentAgent[] = [
  {
    id: 'recent-1',
    name: '[OpenClaw-Robot]',
    agentName: 'claw-agent-v1',
    createdAt: '2026-06-18 22:30',
    status: 'running',
  },
  {
    id: 'recent-2',
    name: '[Hermes-Assistant]',
    agentName: 'hermes-pro',
    createdAt: '2026-06-18 19:15',
    status: 'stopped',
  },
  {
    id: 'recent-3',
    name: '[OpenCode-Review]',
    agentName: 'code-v3-base',
    createdAt: '2026-06-18 15:45',
    status: 'exception',
  },
]

const notices: SystemNotice[] = [
  {
    id: 'notice-1',
    text: '资源池 vCenter_DC1 连接成功',
    occurredAt: '2026-06-18 23:30',
    status: 'success',
  },
  {
    id: 'notice-2',
    text: '新的模型路由策略已启用',
    occurredAt: '2026-06-18 22:15',
    status: 'warning',
  },
  {
    id: 'notice-3',
    text: '节点-1 CPU 利用率过高',
    occurredAt: '2026-06-18 21:00',
    status: 'danger',
  },
]

function statusLabel(status: AgentStatus): string {
  return locale.t(`dashboard.status.${status}`)
}
</script>

<template>
  <section class="dashboard">
    <header class="dashboard-header">
      <h1 class="heading">{{ locale.t('dashboard.overview.title') }}</h1>
    </header>

    <div class="metric-grid">
      <cds-card class="metric-card">
        <div class="metric-content">
          <h2 class="metric-title">{{ locale.t('dashboard.metric.activeAgents') }}</h2>
          <div class="metric-main-line">
            <span class="health-dot success" aria-hidden="true"></span>
            <strong class="metric-number">3</strong>
            <span class="metric-denominator">/ 8</span>
          </div>
          <p class="metric-caption">{{ locale.t('dashboard.metric.activeAgentsCaption') }}</p>
          <p class="metric-caption">{{ locale.t('dashboard.metric.activeAgentsFoot') }}</p>
        </div>
      </cds-card>

      <cds-card class="metric-card">
        <div class="metric-content">
          <h2 class="metric-title">{{ locale.t('dashboard.metric.totalCalls') }}</h2>
          <div class="metric-main-line compact">
            <strong class="metric-number">52k</strong>
            <span class="metric-hint">{{ locale.t('dashboard.metric.deduplicated') }}</span>
          </div>
          <p class="metric-caption">
            {{ locale.t('dashboard.metric.today') }}: <strong>52,143</strong>
            <span>{{ locale.t('dashboard.metric.detailedCount') }}</span>
          </p>
          <p class="metric-caption">
            {{ locale.t('dashboard.metric.trend') }}:
            <strong class="trend-up">↑15%</strong>
            <span>{{ locale.t('dashboard.metric.vsYesterday') }}</span>
          </p>
        </div>
      </cds-card>

      <cds-card class="metric-card">
        <div class="metric-content">
          <h2 class="metric-title">{{ locale.t('dashboard.metric.monthlyToken') }}</h2>
          <div class="metric-token-line">
            <span class="health-dot success" aria-hidden="true"></span>
            <strong>{{ locale.t('dashboard.metric.thisMonth') }}: 200k Token ($24.00)</strong>
          </div>
          <div class="metric-cost-row">
            <span>{{ locale.t('dashboard.metric.estimatedCost') }}: $120.00</span>
            <strong>20%</strong>
          </div>
          <div
            class="usage-progress"
            role="progressbar"
            aria-valuemin="0"
            aria-valuemax="100"
            aria-valuenow="20"
            :aria-label="locale.t('dashboard.metric.monthlyToken')"
          >
            <span></span>
          </div>
        </div>
      </cds-card>

      <cds-card class="metric-card">
        <div class="metric-content">
          <h2 class="metric-title">{{ locale.t('dashboard.metric.platformOverview') }}</h2>
          <p class="metric-caption emphasized">{{ locale.t('dashboard.metric.totalCalls') }}</p>
          <div class="metric-main-line compact overview-number">
            <strong class="metric-number">52k</strong>
          </div>
          <p class="metric-caption">
            {{ locale.t('dashboard.metric.today') }}: <strong>52,143</strong>
            <span>{{ locale.t('dashboard.metric.detailedCount') }}</span>
          </p>
          <p class="metric-caption">
            {{ locale.t('dashboard.metric.trend') }}:
            <strong class="trend-up">↑15%</strong>
            <span>{{ locale.t('dashboard.metric.vsYesterday') }}</span>
          </p>
        </div>
      </cds-card>
    </div>

    <div class="insight-grid">
      <cds-card class="panel-card distribution-card">
        <div class="panel-content">
          <h2 class="panel-title">{{ locale.t('dashboard.distribution.title') }}</h2>
          <div class="distribution-layout">
            <div class="donut-stage" aria-label="实例状态分布：运行中 3，已停止 5，异常 2">
              <div class="donut-chart" aria-hidden="true">
                <div class="donut-hole"></div>
              </div>
              <div class="chart-callout exception">
                <span>{{ locale.t('dashboard.status.exception') }}</span>
                <strong>2 (20%)</strong>
              </div>
              <div class="chart-callout running">
                <span>{{ locale.t('dashboard.status.running') }}</span>
                <strong>3 (30%)</strong>
              </div>
              <div class="chart-callout stopped">
                <span>{{ locale.t('dashboard.status.stopped') }}</span>
                <strong>5 (50%)</strong>
              </div>
            </div>

            <ul class="distribution-legend" aria-label="实例状态图例">
              <li>
                <span class="legend-dot running"></span>
                <span>{{ locale.t('dashboard.status.running') }} 3 (30%)</span>
              </li>
              <li>
                <span class="legend-dot stopped"></span>
                <span>{{ locale.t('dashboard.status.stopped') }} 5 (50%)</span>
              </li>
              <li>
                <span class="legend-dot exception"></span>
                <span>{{ locale.t('dashboard.status.exception') }} 2 (20%)</span>
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
                  <td class="date-cell">{{ agent.createdAt }}</td>
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
            <time :datetime="notice.occurredAt.replace(' ', 'T')">{{ notice.occurredAt }}</time>
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
  flex: 0 0 auto;
  /* 为 CJK fallback 字形(PingFang SC / 微软雅黑)预留顶部空间,
     替代被移除的 cds-text="title" ::after 负 margin 吸收的几何。 */
  padding-top: 2px;
}
.heading {
  margin: 0;
  font-size: 24px;
  line-height: 1.3;
  font-weight: 600;
  letter-spacing: -0.01em;
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
