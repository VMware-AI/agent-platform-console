<script setup lang="ts">
import { computed, ref } from 'vue'
import { useQuery } from '@vue/apollo-composable'
import { useLocaleStore } from '@/stores/locale'
import { useToast } from '@/composables/useToast'
import { graphqlErrorMessage } from '@/api/graphql/errors'
import {
  METERING_OVERVIEW_QUERY,
  type AgentUsageRow,
  type DailyUsageRow,
  type MeteringOverview,
  type MeteringOverviewResult,
  type MeteringOverviewVars,
  type MeteringTimeRange,
  type ModelUsageRow,
} from '@/api/graphql/queries/metering'
import GatewaySpendPanel from '@/views/metering/GatewaySpendPanel.vue'
import '@/components/icons'

// Two data sources (LLD-15): the platform's own TokenUsage aggregate ("平台记录")
// and litellm's authoritative spend fanned out across gateways ("网关账").
type MeteringSource = 'platform' | 'gateway'
const source = ref<MeteringSource>('platform')

// UI time-range keys vs. backend MeteringTimeRange. The backend supports exactly
// three ranges, so the UI only exposes those three. A "custom" date-range tab is
// intentionally NOT rendered: it would have no server equivalent today and would
// silently behave like the 7-day window. Re-introduce it only once the backend
// accepts explicit from/to dates and a date picker is wired up.
type TimeRange = '7d' | '30d' | 'month'
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
const toast = useToast()

const selectedRange = ref<TimeRange>('7d')
const selectedAgent = ref('ALL')
const selectedModel = ref('ALL')

// Only ranges with a real backend equivalent are offered. The "custom" tab is
// deliberately omitted — see the TimeRange comment above.
const timeRanges: Array<{ key: TimeRange; label: string }> = [
  { key: '7d', label: 'metering.range.7d' },
  { key: '30d', label: 'metering.range.30d' },
  { key: 'month', label: 'metering.range.month' },
]

const RANGE_TO_BACKEND: Record<TimeRange, MeteringTimeRange> = {
  '7d': 'LAST_7_DAYS',
  '30d': 'LAST_30_DAYS',
  month: 'THIS_MONTH',
}

// Reactive GraphQL variables — useQuery re-fetches whenever the selected range
// changes. `userId` is left null to aggregate across the whole org.
const variables = computed<MeteringOverviewVars>(() => ({
  range: RANGE_TO_BACKEND[selectedRange.value],
  userId: null,
}))

const { result, onError } = useQuery<MeteringOverviewResult, MeteringOverviewVars>(
  METERING_OVERVIEW_QUERY,
  variables,
)

onError((error) => {
  toast.error(graphqlErrorMessage(error, locale.t('metering.title')))
})

const overview = computed<MeteringOverview | null>(() => result.value?.meteringOverview ?? null)

// The backend rows carry no status flag; derive a data-driven one so the
// existing status column keeps rendering — a row with zero requests is flagged
// as a warning (idle / no traffic), otherwise it is normal.
function statusFromRequests(requests: number): UsageStatus {
  return requests > 0 ? 'normal' : 'warning'
}

const agents = computed<AgentUsage[]>(() =>
  (overview.value?.byAgent ?? []).map((row: AgentUsageRow) => ({
    id: row.agentId,
    name: row.agentName,
    // Backend metering rows do not expose the agent's OVA template; show a dash.
    template: '—',
    totalTokens: row.totalTokens,
    inputTokens: row.inputTokens,
    outputTokens: row.outputTokens,
    requests: row.requests,
    status: statusFromRequests(row.requests),
  })),
)

const models = computed<ModelUsage[]>(() =>
  (overview.value?.byModel ?? []).map((row: ModelUsageRow) => ({
    name: row.model,
    totalTokens: row.totalTokens,
    inputTokens: row.inputTokens,
    outputTokens: row.outputTokens,
    status: statusFromRequests(row.requests),
  })),
)

const dailyUsage = computed<DailyUsage[]>(() =>
  (overview.value?.byDay ?? []).map((row: DailyUsageRow) => ({
    date: row.date,
    totalTokens: row.totalTokens,
    inputTokens: row.inputTokens,
    outputTokens: row.outputTokens,
    status: statusFromRequests(row.requests),
  })),
)

// Client-side filters over the fetched rows (the backend query has no per-agent
// / per-model filter variable). Options are derived from the real result.
const filteredAgents = computed<AgentUsage[]>(() =>
  selectedAgent.value === 'ALL'
    ? agents.value
    : agents.value.filter((agent) => agent.id === selectedAgent.value),
)

const filteredModels = computed<ModelUsage[]>(() =>
  selectedModel.value === 'ALL'
    ? models.value
    : models.value.filter((model) => model.name === selectedModel.value),
)

const agentOptions = computed(() => [
  { value: 'ALL', label: locale.t('metering.filter.allAgents') },
  ...agents.value.map((agent) => ({ value: agent.id, label: `${agent.id} · ${agent.name}` })),
])

const modelOptions = computed(() => [
  { value: 'ALL', label: locale.t('metering.filter.allModels') },
  ...models.value.map((model) => ({ value: model.name, label: model.name })),
])

function formatNumber(value: number): string {
  return new Intl.NumberFormat(locale.locale === 'zh' ? 'zh-CN' : 'en-US').format(value)
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat(locale.locale === 'zh' ? 'zh-CN' : 'en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(value)
}

// Guard every hop after an optional: `cost` may be absent on a partial result.
const totalCost = computed(() => formatCurrency(overview.value?.cost?.totalCost ?? 0))
const monthlyCost = computed(
  () => `${formatCurrency(overview.value?.cost?.monthlyCost ?? 0)}/${locale.t('metering.cost.month')}`,
)

function statusText(status: UsageStatus): string {
  return locale.t(`metering.status.${status}`)
}

// Footer text: real row count, no fabricated paginator. Reuses the existing
// `metering.table.showing` key ("显示中"/"Showing") and composes the count in the
// component, since the locale helper does not interpolate placeholders.
function footerText(count: number): string {
  // zh has no plural ("条" for both 1 and N); en uses "row" / "rows".
  const unit = locale.locale === 'zh'
    ? locale.t('metering.spend.unit')
    : count === 1
      ? locale.t('metering.spend.unit').replace(/s$/, '')
      : locale.t('metering.spend.unit')
  return `${locale.t('metering.table.showing')} ${formatNumber(count)} ${unit}`
}

// ---- SVG chart geometry (data-driven) -------------------------------------
// Both charts share the same viewBox (0 0 560 190). The plot area is the box
// bounded by the existing grid lines: x ∈ [PLOT_LEFT, PLOT_RIGHT],
// y ∈ [PLOT_TOP, PLOT_BOTTOM]. Values are scaled linearly against the max value
// present in the real data, so the highest point/bar always reaches the top.
const PLOT_LEFT = 44
const PLOT_RIGHT = 545
const PLOT_TOP = 25
const PLOT_BOTTOM = 165
const TICK_COUNT = 4 // gridlines below the top line → 5 labelled ticks incl. 0

// Round a max value up to a "nice" number so axis ticks read cleanly.
function niceCeil(value: number): number {
  if (value <= 0) return 0
  const exponent = Math.floor(Math.log10(value))
  const magnitude = Math.pow(10, exponent)
  const fraction = value / magnitude
  const niceFraction = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10
  return niceFraction * magnitude
}

// Map a value in [0, max] to a y coordinate (inverted: 0 at bottom).
function scaleY(value: number, max: number): number {
  if (max <= 0) return PLOT_BOTTOM
  const ratio = Math.min(Math.max(value / max, 0), 1)
  return PLOT_BOTTOM - ratio * (PLOT_BOTTOM - PLOT_TOP)
}

// Render the short M/D label the design uses (e.g. "6/22") from an ISO date.
function shortDate(iso: string): string {
  const parsed = new Date(iso)
  if (Number.isNaN(parsed.getTime())) return iso
  return `${parsed.getMonth() + 1}/${parsed.getDate()}`
}

const hasTrendData = computed(() => dailyUsage.value.length > 0)

// Nice max across both series so the input and output lines share one scale.
const trendMax = computed(() =>
  niceCeil(
    dailyUsage.value.reduce(
      (max, day) => Math.max(max, day.inputTokens, day.outputTokens),
      0,
    ),
  ),
)

// Y-axis ticks (top → 0). Values from the real max, positions on the grid.
const trendTicks = computed(() =>
  Array.from({ length: TICK_COUNT + 1 }, (_, i) => {
    const value = (trendMax.value / TICK_COUNT) * (TICK_COUNT - i)
    return { value, y: scaleY(value, trendMax.value) }
  }),
)

// Evenly spaced x for each day across the plot width (single point → centred).
function trendX(index: number, length: number): number {
  if (length <= 1) return (PLOT_LEFT + PLOT_RIGHT) / 2
  return PLOT_LEFT + (index / (length - 1)) * (PLOT_RIGHT - PLOT_LEFT)
}

interface TrendPoint {
  x: number
  inputY: number
  outputY: number
  label: string
}

const trendPoints = computed<TrendPoint[]>(() => {
  const days = dailyUsage.value
  return days.map((day, index) => ({
    x: trendX(index, days.length),
    inputY: scaleY(day.inputTokens, trendMax.value),
    outputY: scaleY(day.outputTokens, trendMax.value),
    label: shortDate(day.date),
  }))
})

const trendInputLine = computed(() =>
  trendPoints.value.map((p) => `${p.x},${p.inputY}`).join(' '),
)
const trendOutputLine = computed(() =>
  trendPoints.value.map((p) => `${p.x},${p.outputY}`).join(' '),
)

// Filled area under the input line, closed back along the baseline.
const trendAreaPath = computed(() => {
  const points = trendPoints.value
  if (points.length === 0) return ''
  const top = points.map((p) => `${p.x} ${p.inputY}`).join(' L ')
  const first = points[0]
  const last = points[points.length - 1]
  return `M ${first.x} ${first.inputY} L ${top} L ${last.x} ${PLOT_BOTTOM} L ${first.x} ${PLOT_BOTTOM} Z`
})

// ---- Ranking bar chart -----------------------------------------------------
const RANKING_TOP_N = 5
const BAR_WIDTH = 52

const rankedAgents = computed(() =>
  [...agents.value].sort((a, b) => b.totalTokens - a.totalTokens).slice(0, RANKING_TOP_N),
)

const hasRankingData = computed(() => rankedAgents.value.length > 0)

const rankingMax = computed(() =>
  niceCeil(rankedAgents.value.reduce((max, agent) => Math.max(max, agent.totalTokens), 0)),
)

const rankingTicks = computed(() =>
  Array.from({ length: TICK_COUNT + 1 }, (_, i) => {
    const value = (rankingMax.value / TICK_COUNT) * (TICK_COUNT - i)
    return { value, y: scaleY(value, rankingMax.value) }
  }),
)

interface RankingBar {
  x: number
  y: number
  height: number
  centerX: number
  label: string
}

const rankingBars = computed<RankingBar[]>(() => {
  const list = rankedAgents.value
  if (list.length === 0) return []
  // Distribute bars evenly across the plot width, centring each slot.
  const slot = (PLOT_RIGHT - PLOT_LEFT) / list.length
  return list.map((agent, index) => {
    const centerX = PLOT_LEFT + slot * (index + 0.5)
    const top = scaleY(agent.totalTokens, rankingMax.value)
    return {
      x: centerX - BAR_WIDTH / 2,
      y: top,
      height: Math.max(PLOT_BOTTOM - top, 0),
      centerX,
      label: agent.name,
    }
  })
})
</script>

<template>
  <section class="metering-page">
    <header class="page-head">
      <h1 cds-text="title" class="heading" :title="locale.t('metering.title')">
        {{ locale.t('metering.title') }}
      </h1>
      <p cds-text="body" class="desc muted">{{ locale.t('metering.description') }}</p>
    </header>

    <div class="source-switch" role="group" :aria-label="locale.t('metering.source.label')">
      <button
        type="button"
        class="source-tab"
        :class="{ active: source === 'platform' }"
        :aria-pressed="source === 'platform'"
        @click="source = 'platform'"
      >
        {{ locale.t('metering.source.platform') }}
      </button>
      <button
        type="button"
        class="source-tab"
        :class="{ active: source === 'gateway' }"
        :aria-pressed="source === 'gateway'"
        @click="source = 'gateway'"
      >
        {{ locale.t('metering.source.gateway') }}
      </button>
    </div>

    <GatewaySpendPanel v-if="source === 'gateway'" />

    <template v-if="source === 'platform'">
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
                <stop offset="0%" stop-color="var(--chart-color-input, #4b76bd)" stop-opacity="0.32" />
                <stop offset="100%" stop-color="var(--chart-color-input, #4b76bd)" stop-opacity="0.04" />
              </linearGradient>
            </defs>
            <g class="grid-lines">
              <line x1="44" y1="25" x2="545" y2="25" />
              <line x1="44" y1="60" x2="545" y2="60" />
              <line x1="44" y1="95" x2="545" y2="95" />
              <line x1="44" y1="130" x2="545" y2="130" />
              <line x1="44" y1="165" x2="545" y2="165" />
            </g>
            <template v-if="hasTrendData">
              <g class="axis-labels">
                <text v-for="tick in trendTicks" :key="`ty-${tick.value}`" x="4" :y="tick.y + 4">
                  {{ formatNumber(Math.round(tick.value)) }}
                </text>
                <text
                  v-for="point in trendPoints"
                  :key="`tx-${point.label}-${point.x}`"
                  :x="point.x"
                  y="184"
                  class="date-label"
                >
                  {{ point.label }}
                </text>
              </g>
              <path :d="trendAreaPath" fill="url(#meteringArea)" />
              <polyline class="trend-line input-line" :points="trendInputLine" />
              <polyline class="trend-line output-line" :points="trendOutputLine" />
            </template>
            <text v-else class="chart-empty" x="280" y="95">
              {{ locale.t('agents.empty') }}
            </text>
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
            <template v-if="hasRankingData">
              <g class="axis-labels">
                <text v-for="tick in rankingTicks" :key="`ry-${tick.value}`" x="7" :y="tick.y + 4">
                  {{ formatNumber(Math.round(tick.value)) }}
                </text>
              </g>
              <g class="bars">
                <rect
                  v-for="bar in rankingBars"
                  :key="`bar-${bar.label}-${bar.x}`"
                  :x="bar.x"
                  :y="bar.y"
                  :width="BAR_WIDTH"
                  :height="bar.height"
                />
              </g>
              <g class="bar-labels">
                <text
                  v-for="bar in rankingBars"
                  :key="`barlabel-${bar.label}-${bar.centerX}`"
                  :x="bar.centerX"
                  y="184"
                >
                  <title>{{ bar.label }}</title>
                  {{ bar.label }}
                </text>
              </g>
            </template>
            <text v-else class="chart-empty" x="280" y="95">
              {{ locale.t('agents.empty') }}
            </text>
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
                <tr v-for="agent in filteredAgents" :key="agent.id">
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
            <span>{{ footerText(filteredAgents.length) }}</span>
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
                <tr v-for="model in filteredModels" :key="model.name">
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
            <span>{{ footerText(filteredModels.length) }}</span>
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
            <span>{{ footerText(dailyUsage.length) }}</span>
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
            <strong>{{ totalCost }}</strong>
          </div>
          <div class="cost-summary">
            <span>{{ locale.t('metering.cost.monthly') }}</span>
            <strong>{{ monthlyCost }}</strong>
          </div>
        </div>
      </div>
    </cds-card>
    </template>
  </section>
</template>

<style scoped>
.source-switch {
  display: inline-flex;
  margin-bottom: 1rem;
  border: 1px solid var(--cds-alias-object-interaction-border, #ccc);
  border-radius: 0.25rem;
  overflow: hidden;
}
.source-tab {
  padding: 0.4rem 1.1rem;
  background: transparent;
  border: none;
  cursor: pointer;
  font-size: 0.85rem;
}
.source-tab.active {
  background: var(--cds-alias-status-info, #0072a3);
  color: #fff;
}
:root,
[cds-theme] {
  --chart-color-input: #4b76bd;
  --chart-color-output: #9aa8bb;
}
:global([cds-theme='dark']) {
  --chart-color-input: #7aaee8;
  --chart-color-output: #b0bec5;
}
.metering-page {
  height: 100%;
  min-height: 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
  overflow: visible;
  color: var(--cds-alias-object-app-foreground, #1b1b1b);
}
.page-head {
  flex: 0 0 auto;
  padding-top: 4px;
}
.heading {
  margin: 0;
  color: var(--cds-alias-object-app-foreground, #1b1b1b);
  font-size: 28px;
  line-height: 1.3;
  font-weight: 600;
  letter-spacing: -0.01em;
}
.desc {
  margin: 12px 0 0;
  color: var(--cds-alias-typography-color-300, #565656);
  font-size: 14px;
  line-height: 1.5;
  max-width: 720px;
}
.muted {
  color: var(--cds-alias-typography-color-300, #565656);
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
  --padding: 0;
  --overflow: hidden;
  display: block;
  box-sizing: border-box;
  min-width: 0;
  background: var(--cds-alias-object-container-background, #fff);
  border: 1px solid var(--cds-alias-object-border-color, #b3b3b3);
  border-radius: 6px;
  box-shadow: none;
}
.card-content {
  box-sizing: border-box;
  min-width: 0;
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
.chart-card,
.table-card {
  height: 100%;
  min-height: 0;
}
.chart-content {
  height: 100%;
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
.legend-mark.input { background: var(--chart-color-input, #4b76bd); }
.legend-mark.output { background: var(--chart-color-output, #9aa8bb); }
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
.axis-labels .date-label {
  text-anchor: middle;
}
.chart-empty {
  fill: currentColor;
  opacity: 0.55;
  font-size: 11px;
  text-anchor: middle;
}
.trend-line {
  fill: none;
  stroke-width: 2;
  stroke-linejoin: round;
  stroke-linecap: round;
}
.input-line { stroke: var(--chart-color-input, #4b76bd); }
.output-line { stroke: var(--chart-color-output, #9aa8bb); }
.bars rect {
  fill: var(--chart-color-input, #4f78bd);
}
.table-grid {
  min-height: 168px;
  display: grid;
  grid-template-columns: 1.45fr 0.82fr 0.82fr;
  gap: 10px;
  flex: 1 1 34%;
}
.table-content {
  height: 100%;
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
.cost-card {
  --height: auto;
  height: auto;
  min-height: 102px;
  flex: 0 0 auto;
}
.cost-content {
  min-height: 100px;
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
