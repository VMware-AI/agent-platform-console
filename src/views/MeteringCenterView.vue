<script setup lang="ts">
import { computed, ref } from 'vue'
import { useLocaleStore } from '@/stores/locale'
import '@/components/icons'

type TimeRange = '7d' | '30d' | 'month' | 'custom'
type UsageStatus = 'normal' | 'warning'

interface AgentUsage {
  id: string
  name: string
  template: string
  totalTokens: number
  inputTokens: number
  outputTokens: number
  requests: number
  status: UsageStatus
}

interface ModelUsage {
  name: string
  totalTokens: number
  inputTokens: number
  outputTokens: number
  status: UsageStatus
}

interface DailyUsage {
  date: string
  totalTokens: number
  inputTokens: number
  outputTokens: number
  status: UsageStatus
}

const locale = useLocaleStore()
const selectedRange = ref<TimeRange>('7d')
const selectedAgent = ref('ALL')
const selectedModel = ref('ALL')

const timeRanges: Array<{ key: TimeRange; label: string }> = [
  { key: '7d', label: 'metering.range.7d' },
  { key: '30d', label: 'metering.range.30d' },
  { key: 'month', label: 'metering.range.month' },
  { key: 'custom', label: 'metering.range.custom' },
]

const agents: AgentUsage[] = [
  {
    id: 'Agent_10000001',
    name: 'gpt-4o',
    template: 'OVA 模板',
    totalTokens: 22_000,
    inputTokens: 468,
    outputTokens: 3_500,
    requests: 37,
    status: 'warning',
  },
  {
    id: 'Agent_10000002',
    name: 'AgentCole_son',
    template: 'OVA Suling',
    totalTokens: 13_000,
    inputTokens: 300,
    outputTokens: 2_000,
    requests: 34,
    status: 'warning',
  },
  {
    id: 'Agent_30000003',
    name: 'Hermes',
    template: 'OVA Suling',
    totalTokens: 10_000,
    inputTokens: 300,
    outputTokens: 1_000,
    requests: 6,
    status: 'warning',
  },
  {
    id: 'Agent_30000004',
    name: 'Opendode',
    template: 'OVA Suling',
    totalTokens: 4_000,
    inputTokens: 120,
    outputTokens: 800,
    requests: 0,
    status: 'warning',
  },
  {
    id: 'Agent_30000005',
    name: 'OpenCode_synt',
    template: 'OVA 模板',
    totalTokens: 1_500,
    inputTokens: 130,
    outputTokens: 500,
    requests: 0,
    status: 'warning',
  },
]

const models: ModelUsage[] = [
  { name: 'gpt-4o', totalTokens: 22_000, inputTokens: 460, outputTokens: 3_500, status: 'normal' },
  { name: 'gpt-go', totalTokens: 12_000, inputTokens: 300, outputTokens: 2_000, status: 'normal' },
  { name: 'gptl-fo', totalTokens: 10_000, inputTokens: 300, outputTokens: 1_000, status: 'normal' },
  { name: 'listLLL-R', totalTokens: 7_500, inputTokens: 120, outputTokens: 800, status: 'normal' },
]

const dailyUsage: DailyUsage[] = [
  { date: '2026-06-18', totalTokens: 12_000, inputTokens: 468, outputTokens: 3_500, status: 'normal' },
  { date: '2026-06-19', totalTokens: 12_000, inputTokens: 300, outputTokens: 2_000, status: 'normal' },
  { date: '2026-06-20', totalTokens: 4_200, inputTokens: 300, outputTokens: 1_000, status: 'normal' },
  { date: '2026-06-21', totalTokens: 1_000, inputTokens: 120, outputTokens: 800, status: 'normal' },
  { date: '2026-06-22', totalTokens: 500, inputTokens: 100, outputTokens: 300, status: 'normal' },
]

const agentOptions = computed(() => [
  { value: 'ALL', label: locale.t('metering.filter.allAgents') },
  ...agents.map((agent) => ({ value: agent.id, label: `${agent.id} · ${agent.name}` })),
])

const modelOptions = computed(() => [
  { value: 'ALL', label: locale.t('metering.filter.allModels') },
  ...models.map((model) => ({ value: model.name, label: model.name })),
])

function formatNumber(value: number): string {
  return new Intl.NumberFormat(locale.locale === 'zh' ? 'zh-CN' : 'en-US').format(value)
}

function statusText(status: UsageStatus): string {
  return locale.t(`metering.status.${status}`)
}
</script>

<template>
  <section class="metering-page">
    <header class="page-header">
      <h1 cds-text="title" class="heading">{{ locale.t('metering.title') }}</h1>
    </header>

    <div class="filter-toolbar">
      <div class="range-group" role="group" :aria-label="locale.t('metering.range.label')">
        <button
          v-for="range in timeRanges"
          :key="range.key"
          type="button"
          class="range-button"
          :class="{ active: selectedRange === range.key }"
          :aria-pressed="selectedRange === range.key"
          @click="selectedRange = range.key"
        >
          <cds-icon v-if="range.key === '7d'" shape="calendar" size="sm"></cds-icon>
          {{ locale.t(range.label) }}
        </button>
      </div>

      <div class="filter-selects">
        <label class="inline-filter">
          <span>{{ locale.t('metering.filter.agent') }}</span>
          <cds-select control-width="shrink">
            <select v-model="selectedAgent" :aria-label="locale.t('metering.filter.agent')">
              <option v-for="option in agentOptions" :key="option.value" :value="option.value">
                {{ option.label }}
              </option>
            </select>
          </cds-select>
        </label>
        <label class="inline-filter">
          <span>{{ locale.t('metering.filter.model') }}</span>
          <cds-select control-width="shrink">
            <select v-model="selectedModel" :aria-label="locale.t('metering.filter.model')">
              <option v-for="option in modelOptions" :key="option.value" :value="option.value">
                {{ option.label }}
              </option>
            </select>
          </cds-select>
        </label>
      </div>
    </div>

    <div class="chart-grid">
      <cds-card class="chart-card">
        <div class="card-content chart-content">
          <div class="card-heading-row">
            <h2>{{ locale.t('metering.chart.trend') }}</h2>
            <div class="chart-legend">
              <span><i class="legend-mark input"></i>{{ locale.t('metering.token.input') }}</span>
              <span><i class="legend-mark output"></i>{{ locale.t('metering.token.output') }}</span>
            </div>
          </div>
          <svg
            class="line-chart"
            viewBox="0 0 560 190"
            role="img"
            :aria-label="locale.t('metering.chart.trend')"
          >
            <defs>
              <linearGradient id="meteringArea" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stop-color="#4b76bd" stop-opacity="0.32" />
                <stop offset="100%" stop-color="#4b76bd" stop-opacity="0.04" />
              </linearGradient>
            </defs>
            <g class="grid-lines">
              <line x1="44" y1="25" x2="545" y2="25" />
              <line x1="44" y1="60" x2="545" y2="60" />
              <line x1="44" y1="95" x2="545" y2="95" />
              <line x1="44" y1="130" x2="545" y2="130" />
              <line x1="44" y1="165" x2="545" y2="165" />
            </g>
            <g class="axis-labels">
              <text x="4" y="29">20000</text>
              <text x="4" y="64">15000</text>
              <text x="12" y="99">10000</text>
              <text x="18" y="134">5000</text>
              <text x="30" y="169">0</text>
              <text x="37" y="184">6/16</text>
              <text x="112" y="184">6/17</text>
              <text x="190" y="184">6/18</text>
              <text x="268" y="184">6/19</text>
              <text x="347" y="184">6/20</text>
              <text x="426" y="184">6/21</text>
              <text x="515" y="184">6/22</text>
            </g>
            <path
              d="M44 151 L112 112 L190 119 L268 58 L347 58 L426 87 L486 80 L520 32 L545 42 L545 165 L44 165 Z"
              fill="url(#meteringArea)"
            />
            <polyline
              class="trend-line input-line"
              points="44,151 112,112 190,119 268,58 347,58 426,87 486,80 520,32 545,42"
            />
            <polyline
              class="trend-line output-line"
              points="44,158 112,139 190,142 268,112 347,105 426,126 486,119 520,78 545,83"
            />
          </svg>
        </div>
      </cds-card>

      <cds-card class="chart-card">
        <div class="card-content chart-content">
          <h2>{{ locale.t('metering.chart.ranking') }}</h2>
          <svg
            class="bar-chart"
            viewBox="0 0 560 190"
            role="img"
            :aria-label="locale.t('metering.chart.ranking')"
          >
            <g class="grid-lines">
              <line x1="45" y1="25" x2="545" y2="25" />
              <line x1="45" y1="53" x2="545" y2="53" />
              <line x1="45" y1="81" x2="545" y2="81" />
              <line x1="45" y1="109" x2="545" y2="109" />
              <line x1="45" y1="137" x2="545" y2="137" />
              <line x1="45" y1="165" x2="545" y2="165" />
            </g>
            <g class="axis-labels">
              <text x="7" y="29">2500</text>
              <text x="7" y="57">2000</text>
              <text x="7" y="85">1500</text>
              <text x="7" y="113">1000</text>
              <text x="15" y="141">500</text>
              <text x="29" y="169">0</text>
            </g>
            <g class="bars">
              <rect x="70" y="38" width="52" height="127" />
              <rect x="170" y="60" width="52" height="105" />
              <rect x="270" y="78" width="52" height="87" />
              <rect x="370" y="113" width="52" height="52" />
              <rect x="470" y="114" width="52" height="51" />
            </g>
            <g class="bar-labels">
              <text x="96" y="184">Agent 1</text>
              <text x="196" y="184">AgentCole_son</text>
              <text x="296" y="184">gptl-fo</text>
              <text x="396" y="184">Agent 4</text>
              <text x="496" y="184">Agent 5</text>
            </g>
          </svg>
        </div>
      </cds-card>
    </div>

    <div class="table-grid">
      <cds-card class="table-card agent-table-card">
        <div class="card-content table-content">
          <h2>{{ locale.t('metering.table.agentTitle') }}</h2>
          <div class="table-scroll">
            <table class="usage-table agent-usage-table">
              <thead>
                <tr>
                  <th>{{ locale.t('metering.table.agentId') }}</th>
                  <th>{{ locale.t('metering.table.name') }}</th>
                  <th>{{ locale.t('metering.table.template') }}</th>
                  <th>{{ locale.t('metering.table.totalToken') }}</th>
                  <th>{{ locale.t('metering.token.input') }}</th>
                  <th>{{ locale.t('metering.token.output') }}</th>
                  <th>{{ locale.t('metering.table.requests') }}</th>
                  <th>{{ locale.t('metering.table.status') }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="agent in agents" :key="agent.id">
                  <td :title="agent.id">{{ agent.id }}</td>
                  <td :title="agent.name">{{ agent.name }}</td>
                  <td>{{ agent.template }}</td>
                  <td>{{ formatNumber(agent.totalTokens) }}</td>
                  <td>{{ formatNumber(agent.inputTokens) }}</td>
                  <td>{{ formatNumber(agent.outputTokens) }}</td>
                  <td>{{ agent.requests }}</td>
                  <td><span class="usage-status" :class="agent.status">● {{ statusText(agent.status) }}</span></td>
                </tr>
              </tbody>
            </table>
          </div>
          <div class="table-footer">
            <span>{{ locale.t('metering.table.showing') }}</span>
            <button type="button" disabled>‹</button>
            <button type="button" class="active">1</button>
            <button type="button">2</button>
            <button type="button">›</button>
          </div>
        </div>
      </cds-card>

      <cds-card class="table-card">
        <div class="card-content table-content">
          <h2>{{ locale.t('metering.table.modelTitle') }}</h2>
          <div class="table-scroll">
            <table class="usage-table">
              <thead>
                <tr>
                  <th>{{ locale.t('metering.filter.model') }}</th>
                  <th>{{ locale.t('metering.table.totalToken') }}</th>
                  <th>{{ locale.t('metering.token.input') }}</th>
                  <th>{{ locale.t('metering.token.output') }}</th>
                  <th>{{ locale.t('metering.table.status') }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="model in models" :key="model.name">
                  <td>{{ model.name }}</td>
                  <td>{{ formatNumber(model.totalTokens) }}</td>
                  <td>{{ formatNumber(model.inputTokens) }}</td>
                  <td>{{ formatNumber(model.outputTokens) }}</td>
                  <td><span class="usage-status" :class="model.status">● {{ statusText(model.status) }}</span></td>
                </tr>
              </tbody>
            </table>
          </div>
          <div class="table-footer">
            <span>{{ locale.t('metering.table.showing') }}</span>
            <button type="button" disabled>‹</button>
            <button type="button" class="active">1</button>
            <button type="button">2</button>
            <button type="button">›</button>
          </div>
        </div>
      </cds-card>

      <cds-card class="table-card">
        <div class="card-content table-content">
          <h2>{{ locale.t('metering.table.dailyTitle') }}</h2>
          <div class="table-scroll">
            <table class="usage-table">
              <thead>
                <tr>
                  <th>{{ locale.t('metering.table.date') }}</th>
                  <th>{{ locale.t('metering.table.totalToken') }}</th>
                  <th>{{ locale.t('metering.token.input') }}</th>
                  <th>{{ locale.t('metering.token.output') }}</th>
                  <th>{{ locale.t('metering.table.status') }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="day in dailyUsage" :key="day.date">
                  <td>{{ day.date }}</td>
                  <td>{{ formatNumber(day.totalTokens) }}</td>
                  <td>{{ formatNumber(day.inputTokens) }}</td>
                  <td>{{ formatNumber(day.outputTokens) }}</td>
                  <td><span class="usage-status" :class="day.status">● {{ statusText(day.status) }}</span></td>
                </tr>
              </tbody>
            </table>
          </div>
          <div class="table-footer">
            <span>{{ locale.t('metering.table.showing') }}</span>
            <button type="button" disabled>‹</button>
            <button type="button" class="active">1</button>
            <button type="button">2</button>
            <button type="button">›</button>
          </div>
        </div>
      </cds-card>
    </div>

    <cds-card class="cost-card">
      <div class="card-content cost-content">
        <h2>{{ locale.t('metering.cost.title') }}</h2>
        <div class="cost-grid">
          <div class="cost-summary">
            <span>{{ locale.t('metering.cost.total') }}</span>
            <strong>$5,000.00</strong>
          </div>
          <div class="cost-summary">
            <span>{{ locale.t('metering.cost.monthly') }}</span>
            <strong>$1,204.00/{{ locale.t('metering.cost.month') }}</strong>
          </div>
        </div>
      </div>
    </cds-card>
  </section>
</template>

<style scoped>
.metering-page {
  height: 100%;
  min-height: 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
  overflow: auto;
  color: var(--cds-alias-object-app-foreground, #1b1b1b);
}
.page-header {
  flex: 0 0 auto;
}
.heading {
  margin: 0;
  font-size: 24px;
  line-height: 1.3;
  font-weight: 600;
  letter-spacing: -0.01em;
}
.filter-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex: 0 0 auto;
}
.range-group {
  display: inline-flex;
  align-items: stretch;
}
.range-button {
  min-height: 32px;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 5px 11px;
  border: 1px solid var(--cds-alias-object-border-color, #b3b3b3);
  border-right: 0;
  background: var(--cds-alias-object-container-background, #fff);
  color: var(--cds-alias-object-app-foreground, #1b1b1b);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}
.range-button:first-child { border-radius: 4px 0 0 4px; }
.range-button:last-child {
  border-right: 1px solid var(--cds-alias-object-border-color, #b3b3b3);
  border-radius: 0 4px 4px 0;
}
.range-button:hover,
.range-button.active {
  color: var(--cds-alias-object-interaction-color, #006e9c);
  background: var(--cds-alias-object-app-background, #f0f5f8);
}
.range-button.active {
  box-shadow: inset 0 -2px 0 var(--cds-alias-object-interaction-color, #0072a3);
}
.filter-selects {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 16px;
  min-width: 0;
}
.inline-filter {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
}
.inline-filter cds-select {
  width: 220px;
  font-weight: 400;
}
.metering-page :deep(cds-card) {
  display: block;
  min-width: 0;
  background: var(--cds-alias-object-container-background, #fff);
  border: 1px solid var(--cds-alias-object-border-color, #b3b3b3);
  border-radius: 6px;
  box-shadow: none;
}
.card-content {
  min-width: 0;
  height: 100%;
  padding: 10px 12px;
}
.card-content h2 {
  margin: 0;
  font-size: 15px;
  line-height: 1.3;
  font-weight: 600;
}
.chart-grid {
  min-height: 190px;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  flex: 1 1 38%;
}
.chart-content {
  display: flex;
  flex-direction: column;
}
.card-heading-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.chart-legend {
  display: inline-flex;
  gap: 12px;
  font-size: 11px;
}
.chart-legend span {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.legend-mark {
  width: 9px;
  height: 9px;
  display: inline-block;
  border-radius: 50%;
}
.legend-mark.input { background: #4b76bd; }
.legend-mark.output { background: #9aa8bb; }
.line-chart,
.bar-chart {
  width: 100%;
  min-height: 0;
  flex: 1;
  overflow: visible;
}
.grid-lines line {
  stroke: currentColor;
  stroke-opacity: 0.12;
  stroke-width: 1;
}
.axis-labels text,
.bar-labels text {
  fill: currentColor;
  opacity: 0.72;
  font-size: 10px;
  font-family: inherit;
}
.bar-labels text {
  text-anchor: middle;
  font-size: 9px;
}
.trend-line {
  fill: none;
  stroke-width: 2;
  stroke-linejoin: round;
  stroke-linecap: round;
}
.input-line { stroke: #4b76bd; }
.output-line { stroke: #9aa8bb; }
.bars rect {
  fill: #4f78bd;
}
.table-grid {
  min-height: 168px;
  display: grid;
  grid-template-columns: 1.45fr 0.82fr 0.82fr;
  gap: 10px;
  flex: 1 1 34%;
}
.table-content {
  display: flex;
  flex-direction: column;
  padding: 8px 9px;
}
.table-scroll {
  min-width: 0;
  margin-top: 6px;
  overflow: auto;
}
.usage-table {
  width: 100%;
  min-width: 240px;
  border-collapse: collapse;
  table-layout: fixed;
  font-size: 9px;
}
.agent-usage-table {
  min-width: 440px;
}
.usage-table th,
.usage-table td {
  padding: 4px 5px;
  overflow: hidden;
  text-align: left;
  text-overflow: ellipsis;
  white-space: nowrap;
  border-bottom: 1px solid var(--cds-alias-object-border-color, #d7d7d7);
}
.usage-table th {
  background: var(--cds-alias-object-app-background, #e9eaee);
  font-weight: 600;
}
.usage-table td:nth-child(n + 4),
.usage-table th:nth-child(n + 4) {
  text-align: right;
  font-variant-numeric: tabular-nums;
}
.usage-table td:last-child,
.usage-table th:last-child {
  text-align: left;
}
.usage-status {
  font-size: 9px;
  font-weight: 600;
}
.usage-status.normal { color: var(--cds-alias-status-success, #1b8a4b); }
.usage-status.warning { color: var(--cds-alias-status-danger, #c92100); }
.table-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 3px;
  margin-top: auto;
  padding-top: 5px;
  font-size: 8px;
}
.table-footer button {
  min-width: 20px;
  height: 20px;
  padding: 0 4px;
  border: 1px solid transparent;
  border-radius: 3px;
  background: transparent;
  color: inherit;
  font: inherit;
  cursor: pointer;
}
.table-footer button.active {
  border-color: var(--cds-alias-object-border-color, #b3b3b3);
  background: var(--cds-alias-object-app-background, #f4f4f4);
}
.table-footer button:disabled {
  opacity: 0.35;
  cursor: default;
}
.cost-card {
  min-height: 102px;
  flex: 0 0 auto;
}
.cost-content {
  display: flex;
  flex-direction: column;
}
.cost-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  margin-top: 8px;
}
.cost-summary {
  min-height: 60px;
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  border: 1px solid var(--cds-alias-object-border-color, #b3b3b3);
  border-radius: 5px;
}
.cost-summary span {
  font-size: 12px;
}
.cost-summary strong {
  margin-top: 2px;
  font-size: 24px;
  line-height: 1.1;
  letter-spacing: -0.02em;
}
@media (max-width: 1120px) {
  .filter-toolbar {
    align-items: flex-start;
    flex-direction: column;
  }
  .filter-selects {
    width: 100%;
    justify-content: flex-start;
  }
  .chart-grid,
  .table-grid {
    grid-template-columns: 1fr;
  }
  .chart-card { min-height: 240px; }
  .table-card { min-height: 210px; }
}
@media (max-width: 650px) {
  .range-group {
    width: 100%;
    overflow-x: auto;
  }
  .range-button { flex: 1 0 auto; }
  .filter-selects {
    align-items: stretch;
    flex-direction: column;
  }
  .inline-filter {
    justify-content: space-between;
  }
  .inline-filter cds-select { width: min(220px, 70vw); }
  .cost-grid { grid-template-columns: 1fr; }
}
</style>
