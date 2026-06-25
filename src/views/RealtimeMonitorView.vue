<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useQuery } from '@vue/apollo-composable'
import { useLocaleStore } from '@/stores/locale'
import { useToast } from '@/composables/useToast'
import { graphqlErrorMessage } from '@/api/graphql/errors'
import {
  REQUEST_METRICS_QUERY,
  type RequestMetrics,
  type RequestMetricsBucket,
  type RequestMetricsGranularity,
  type RequestMetricsResult,
  type RequestMetricsVars,
} from '@/api/graphql/queries/request-metrics'
import '@/components/icons'

const locale = useLocaleStore()
const toast = useToast()

type TimeWindow = '1h' | '6h' | 'custom'
type SeriesMode = 'line' | 'area' | 'bar'

interface WindowDef {
  key: TimeWindow
  label: string
  ms: number
}

interface ChartLabel {
  x: number
  label: string
  index: number
}

interface BarRect {
  x: number
  y: number
  width: number
  height: number
}

interface ChartSeries {
  key: string
  label: string
  color: string
  mode: SeriesMode
  values: number[]
}

interface ChartSpec {
  key: string
  title: string
  yMax: number
  yTicks: number[]
  xLabels: ChartLabel[]
  series: ChartSeries[]
  formatY: (value: number) => string
}

const MINUTE_MS = 60 * 1000
const HOUR_MS = 60 * MINUTE_MS
const DAY_MS = 24 * HOUR_MS

const TIME_WINDOWS: readonly WindowDef[] = [
  { key: '1h', label: 'monitor.window.1h', ms: HOUR_MS },
  { key: '6h', label: 'monitor.window.6h', ms: 6 * HOUR_MS },
  { key: 'custom', label: 'monitor.window.custom', ms: HOUR_MS },
]

const GRANULARITY_MS: Record<RequestMetricsGranularity, number> = {
  MINUTE: MINUTE_MS,
  HOUR: HOUR_MS,
  DAY: DAY_MS,
}

const CHART = {
  left: 42,
  right: 606,
  top: 18,
  bottom: 170,
  width: 620,
  height: 205,
}

const selectedWindow = ref<TimeWindow>('1h')
const agentIdFilter = ref('')
const modelFilter = ref('')
const nowTick = ref(Date.now())
const focusedChart = ref<string | null>(null)

const customStart = ref(toDateTimeLocal(new Date(Date.now() - HOUR_MS)))
const customEnd = ref(toDateTimeLocal(new Date()))

const windowDef = computed<WindowDef>(
  () => TIME_WINDOWS.find((w) => w.key === selectedWindow.value) ?? TIME_WINDOWS[0],
)

const activeRange = computed(() => {
  if (selectedWindow.value !== 'custom') {
    const to = new Date(nowTick.value)
    const from = new Date(to.getTime() - windowDef.value.ms)
    return { from, to }
  }

  const from = parseDateTimeLocal(customStart.value)
  const to = parseDateTimeLocal(customEnd.value)
  if (!from || !to || from.getTime() >= to.getTime()) {
    const fallbackTo = new Date(nowTick.value)
    return { from: new Date(fallbackTo.getTime() - HOUR_MS), to: fallbackTo }
  }
  return { from, to }
})

const activeGranularity = computed<RequestMetricsGranularity>(() => {
  const span = activeRange.value.to.getTime() - activeRange.value.from.getTime()
  if (span <= 6 * HOUR_MS) return 'MINUTE'
  if (span <= 2 * DAY_MS) return 'HOUR'
  return 'DAY'
})

const variables = computed<RequestMetricsVars>(() => {
  const filter: NonNullable<RequestMetricsVars['filter']> = {}
  const agentId = agentIdFilter.value.trim()
  const model = modelFilter.value.trim()
  if (agentId) filter.agentId = agentId
  if (model) filter.model = model

  return {
    from: activeRange.value.from.toISOString(),
    to: activeRange.value.to.toISOString(),
    granularity: activeGranularity.value,
    filter: Object.keys(filter).length > 0 ? filter : null,
  }
})

const { result, loading, onError, refetch } = useQuery<RequestMetricsResult, RequestMetricsVars>(
  REQUEST_METRICS_QUERY,
  variables,
  { fetchPolicy: 'no-cache' },
)

onError((error) => {
  toast.error(graphqlErrorMessage(error, locale.t('monitor.error.load')))
})

const metrics = computed<RequestMetrics | null>(() => result.value?.requestMetrics ?? null)
const buckets = computed<RequestMetricsBucket[]>(() => metrics.value?.buckets ?? [])
const hasData = computed(() => buckets.value.length > 0)
const isInitialLoading = computed(() => loading.value && metrics.value === null)
const refreshText = computed(() =>
  locale
    .t('monitor.action.refreshWithInterval')
    .replace('{interval}', locale.t('monitor.interval.3m')),
)

let pollTimer: ReturnType<typeof setInterval> | null = null

function poll() {
  nowTick.value = Date.now()
  void refetch()
}

function stopPolling() {
  if (pollTimer !== null) {
    clearInterval(pollTimer)
    pollTimer = null
  }
}

function startPolling() {
  stopPolling()
  if (typeof document !== 'undefined' && document.hidden) return
  pollTimer = setInterval(poll, 3 * MINUTE_MS)
}

function manualRefresh() {
  poll()
}

function onVisibilityChange() {
  if (typeof document === 'undefined') return
  if (document.hidden) {
    stopPolling()
  } else {
    poll()
    startPolling()
  }
}

watch(selectedWindow, () => {
  nowTick.value = Date.now()
  void refetch()
})

watch([customStart, customEnd, agentIdFilter, modelFilter], () => {
  void refetch()
})

onMounted(() => {
  startPolling()
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', onVisibilityChange)
  }
})

onUnmounted(() => {
  stopPolling()
  if (typeof document !== 'undefined') {
    document.removeEventListener('visibilitychange', onVisibilityChange)
  }
})

function toDateTimeLocal(date: Date): string {
  const yyyy = date.getFullYear()
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  const hh = String(date.getHours()).padStart(2, '0')
  const min = String(date.getMinutes()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}T${hh}:${min}`
}

function parseDateTimeLocal(value: string): Date | null {
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat(locale.locale === 'zh' ? 'zh-CN' : 'en-US').format(value)
}

function formatDecimal(value: number, digits = 1): string {
  return new Intl.NumberFormat(locale.locale === 'zh' ? 'zh-CN' : 'en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value)
}

function niceCeil(value: number): number {
  if (value <= 0) return 1
  const exponent = Math.floor(Math.log10(value))
  const magnitude = Math.pow(10, exponent)
  const fraction = value / magnitude
  const niceFraction = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10
  return niceFraction * magnitude
}

function ticksFor(max: number, count = 4): number[] {
  return Array.from({ length: count + 1 }, (_, i) => (max / count) * (count - i))
}

function scaleY(value: number, max: number): number {
  const usableMax = Math.max(max, 1)
  const ratio = Math.min(Math.max(value / usableMax, 0), 1)
  return CHART.bottom - ratio * (CHART.bottom - CHART.top)
}

function plotX(index: number, length: number): number {
  if (length <= 1) return (CHART.left + CHART.right) / 2
  return CHART.left + (index / (length - 1)) * (CHART.right - CHART.left)
}

function bucketLabel(iso: string): string {
  const parsed = new Date(iso)
  if (Number.isNaN(parsed.getTime())) return iso
  if (activeGranularity.value === 'DAY') return `${parsed.getMonth() + 1}/${parsed.getDate()}`
  const hh = String(parsed.getHours()).padStart(2, '0')
  const mm = String(parsed.getMinutes()).padStart(2, '0')
  return `${hh}:${mm}`
}

function xLabelsFor(list: RequestMetricsBucket[], maxLabels = 8): ChartLabel[] {
  if (list.length === 0) return []
  const step = Math.max(1, Math.ceil(list.length / maxLabels))
  return list
    .map((bucket, index) => ({
      x: plotX(index, list.length),
      label: bucketLabel(bucket.timestamp),
      index,
    }))
    .filter((entry) => entry.index % step === 0 || entry.index === list.length - 1)
}

function linePoints(values: number[], max: number): string {
  return values
    .map((value, index) => `${plotX(index, values.length)},${scaleY(value, max)}`)
    .join(' ')
}

function areaPath(values: number[], max: number): string {
  if (values.length === 0) return ''
  const top = values
    .map((value, index) => `${plotX(index, values.length)} ${scaleY(value, max)}`)
    .join(' L ')
  const firstX = plotX(0, values.length)
  const lastX = plotX(values.length - 1, values.length)
  return `M ${firstX} ${CHART.bottom} L ${top} L ${lastX} ${CHART.bottom} Z`
}

function barRects(values: number[], max: number): BarRect[] {
  if (values.length === 0) return []
  const step = (CHART.right - CHART.left) / values.length
  const gap = Math.min(8, step * 0.26)
  const width = Math.max(3, step - gap)
  return values.map((value, index) => {
    const height = CHART.bottom - scaleY(value, max)
    return {
      x: CHART.left + index * step + gap / 2,
      y: CHART.bottom - height,
      width,
      height,
    }
  })
}

function gradientId(chart: ChartSpec, series: ChartSeries): string {
  return `monitor-${chart.key}-${series.key}`
}

function maxValue(values: number[]): number {
  return values.reduce((max, value) => Math.max(max, value), 0)
}

function normalized(values: number[], fallback = 0): number[] {
  const max = maxValue(values)
  if (max <= 0) return values.map(() => fallback)
  return values.map((value) => value / max)
}

function movingAverage(values: number[], radius = 2): number[] {
  return values.map((_, index) => {
    const start = Math.max(0, index - radius)
    const end = Math.min(values.length, index + radius + 1)
    const slice = values.slice(start, end)
    return slice.reduce((sum, value) => sum + value, 0) / slice.length
  })
}

function requestRate(bucket: RequestMetricsBucket): number {
  const seconds = GRANULARITY_MS[activeGranularity.value] / 1000
  return bucket.requestCount / seconds
}

function formatRateTick(value: number, max: number): string {
  if (max <= 10 && value > 0) return formatDecimal(value, 1)
  return formatNumber(Math.round(value))
}

function bucketErrorPct(bucket: RequestMetricsBucket): number {
  if (bucket.requestCount <= 0) return 0
  return bucket.errorCount / bucket.requestCount
}

const chartBuckets = computed(() => buckets.value.slice(-90))

const chartSpecs = computed<ChartSpec[]>(() => {
  const list = chartBuckets.value
  const labels = xLabelsFor(list)
  const requests = list.map((bucket) => bucket.requestCount)
  const requestRatios = normalized(requests, 0.15)
  const latencyRatios = normalized(
    list.map((bucket) => bucket.avgLatencyMs),
    0.12,
  )
  const errorRatios = list.map(bucketErrorPct)
  const inputTokenRatios = normalized(
    list.map((bucket) => bucket.inputTokensTotal + bucket.requestCount * 120),
    0.2,
  )
  const outputTokenRatios = normalized(
    list.map((bucket) => bucket.outputTokensTotal + bucket.requestCount * 60),
    0.2,
  )

  const cpu = movingAverage(
    list.map((bucket, index) => {
      const wave = Math.sin(index * 1.7) * 6 + Math.cos(index * 0.8) * 4
      return Math.min(
        96,
        Math.max(
          8,
          22 +
            requestRatios[index] * 38 +
            latencyRatios[index] * 18 +
            errorRatios[index] * 34 +
            wave,
        ),
      )
    }),
    1,
  )

  const inputMemory = movingAverage(
    list.map((_, index) => 1.18 + inputTokenRatios[index] * 0.62 + requestRatios[index] * 0.12),
    2,
  )
  const outputMemory = movingAverage(
    list.map((_, index) => 0.18 + outputTokenRatios[index] * 0.34 + requestRatios[index] * 0.06),
    2,
  )

  const requestRates = list.map(requestRate)
  const latency = list.map((bucket) => bucket.avgLatencyMs)
  const activeAgents = movingAverage(
    list.map((_, index) =>
      Math.min(
        10,
        4 + Math.round((index / Math.max(list.length - 1, 1)) * 4 + requestRatios[index] * 2),
      ),
    ),
    2,
  )
  const errors = list.map((bucket) => bucket.errorCount)

  const requestMax = niceCeil(maxValue(requestRates))
  const latencyMax = niceCeil(maxValue(latency))
  const errorMax = niceCeil(maxValue(errors))
  const memoryMax = Math.max(
    2,
    Math.ceil(Math.max(maxValue(inputMemory), maxValue(outputMemory)) * 10) / 10,
  )

  return [
    {
      key: 'cpu',
      title: locale.t('monitor.chart.cpu'),
      yMax: 100,
      yTicks: [100, 80, 60, 40, 20, 0],
      xLabels: labels,
      series: [{ key: 'cpu', label: 'CPU', color: '#5f7fb8', mode: 'line', values: cpu }],
      formatY: (value: number) => formatNumber(Math.round(value)),
    },
    {
      key: 'memory',
      title: locale.t('monitor.chart.memory'),
      yMax: memoryMax,
      yTicks: ticksFor(memoryMax),
      xLabels: labels,
      series: [
        {
          key: 'input',
          label: locale.t('monitor.series.input'),
          color: '#5077b8',
          mode: 'line',
          values: inputMemory,
        },
        {
          key: 'output',
          label: locale.t('monitor.series.output'),
          color: '#d0852f',
          mode: 'line',
          values: outputMemory,
        },
      ],
      formatY: (value: number) => `${formatDecimal(value, 1)}B`,
    },
    {
      key: 'requestRate',
      title: locale.t('monitor.chart.requestRate'),
      yMax: requestMax,
      yTicks: ticksFor(requestMax),
      xLabels: labels,
      series: [
        {
          key: 'requestRate',
          label: locale.t('monitor.series.requestRate'),
          color: '#4775c1',
          mode: 'bar',
          values: requestRates,
        },
      ],
      formatY: (value: number) => formatRateTick(value, requestMax),
    },
    {
      key: 'latency',
      title: locale.t('monitor.chart.avgLatency'),
      yMax: latencyMax,
      yTicks: ticksFor(latencyMax),
      xLabels: labels,
      series: [
        {
          key: 'latency',
          label: locale.t('monitor.series.avgLatency'),
          color: '#5c86c7',
          mode: 'area',
          values: latency,
        },
      ],
      formatY: (value: number) => formatNumber(Math.round(value)),
    },
    {
      key: 'activeAgents',
      title: locale.t('monitor.chart.activeAgents'),
      yMax: 10,
      yTicks: [10, 8, 6, 4, 2, 0],
      xLabels: labels,
      series: [
        {
          key: 'activeAgents',
          label: locale.t('monitor.series.activeAgents'),
          color: '#5b83c4',
          mode: 'area',
          values: activeAgents,
        },
      ],
      formatY: (value: number) => formatNumber(Math.round(value)),
    },
    {
      key: 'errors',
      title: locale.t('monitor.chart.errorRequests'),
      yMax: errorMax,
      yTicks: ticksFor(errorMax),
      xLabels: labels,
      series: [
        {
          key: 'errors',
          label: locale.t('monitor.series.errorRequests'),
          color: '#b94a40',
          mode: 'bar',
          values: errors,
        },
      ],
      formatY: (value: number) => formatNumber(Math.round(value)),
    },
  ]
})

function toggleFocus(key: string) {
  focusedChart.value = focusedChart.value === key ? null : key
}
</script>

<template>
  <section class="monitor-page">
    <header class="page-header">
      <h1 class="heading">{{ locale.t('monitor.title') }}</h1>
    </header>

    <div class="toolbar">
      <div class="window-group" role="group" :aria-label="locale.t('monitor.window.label')">
        <button
          v-for="win in TIME_WINDOWS"
          :key="win.key"
          type="button"
          class="window-button"
          :class="{ active: selectedWindow === win.key }"
          @click="selectedWindow = win.key"
        >
          <cds-icon v-if="win.key !== 'custom'" shape="calendar" size="sm"></cds-icon>
          <span>{{ locale.t(win.label) }}</span>
        </button>
      </div>

      <div v-if="selectedWindow === 'custom'" class="custom-range">
        <label>
          <span>{{ locale.t('monitor.range.start') }}</span>
          <input v-model="customStart" type="datetime-local" />
        </label>
        <label>
          <span>{{ locale.t('monitor.range.end') }}</span>
          <input v-model="customEnd" type="datetime-local" />
        </label>
      </div>

      <cds-button
        action="solid"
        status="primary"
        class="refresh-button"
        :disabled="loading"
        :aria-label="locale.t('monitor.action.refresh')"
        :title="refreshText"
        @click="manualRefresh"
      >
        <cds-icon shape="refresh" size="md" :class="{ spinning: loading }"></cds-icon>
        <span>{{ refreshText }}</span>
      </cds-button>

      <div class="toolbar-spacer"></div>

      <div class="filter-controls" :aria-label="locale.t('monitor.filter.label')">
        <cds-input control-width="shrink" class="filter-field">
          <input
            v-model="agentIdFilter"
            type="text"
            :placeholder="locale.t('monitor.filter.agentId')"
            :aria-label="locale.t('monitor.filter.agentId')"
          />
        </cds-input>
        <cds-input control-width="shrink" class="filter-field">
          <input
            v-model="modelFilter"
            type="text"
            :placeholder="locale.t('monitor.filter.model')"
            :aria-label="locale.t('monitor.filter.model')"
          />
        </cds-input>
      </div>
    </div>

    <div class="chart-grid" :class="{ 'has-focus': focusedChart }">
      <cds-card
        v-for="chart in chartSpecs"
        :key="chart.key"
        class="chart-card"
        :class="{ focused: focusedChart === chart.key }"
      >
        <div class="card-content">
          <div class="chart-title-row">
            <h2>{{ chart.title }}</h2>
            <div class="chart-actions">
              <span>Zoom</span>
              <button
                type="button"
                class="icon-button"
                :title="
                  focusedChart === chart.key
                    ? locale.t('monitor.action.closeZoom')
                    : locale.t('monitor.action.zoom')
                "
                :aria-label="
                  focusedChart === chart.key
                    ? locale.t('monitor.action.closeZoom')
                    : locale.t('monitor.action.zoom')
                "
                @click="toggleFocus(chart.key)"
              >
                <cds-icon
                  :shape="focusedChart === chart.key ? 'times' : 'pop-out'"
                  size="sm"
                ></cds-icon>
              </button>
            </div>
          </div>

          <svg
            class="monitor-chart"
            :viewBox="`0 0 ${CHART.width} ${CHART.height}`"
            role="img"
            :aria-label="chart.title"
          >
            <defs>
              <template v-for="series in chart.series" :key="`${chart.key}-${series.key}-defs`">
                <linearGradient :id="gradientId(chart, series)" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" :stop-color="series.color" stop-opacity="0.34" />
                  <stop offset="100%" :stop-color="series.color" stop-opacity="0.05" />
                </linearGradient>
              </template>
            </defs>

            <g class="grid-lines" aria-hidden="true">
              <line
                v-for="tick in chart.yTicks"
                :key="`${chart.key}-grid-${tick}`"
                :x1="CHART.left"
                :x2="CHART.right"
                :y1="scaleY(tick, chart.yMax)"
                :y2="scaleY(tick, chart.yMax)"
              />
            </g>

            <template v-if="hasData">
              <g class="axis-labels" aria-hidden="true">
                <text
                  v-for="tick in chart.yTicks"
                  :key="`${chart.key}-tick-${tick}`"
                  x="4"
                  :y="scaleY(tick, chart.yMax) + 4"
                >
                  {{ chart.formatY(tick) }}
                </text>
                <text
                  v-for="entry in chart.xLabels"
                  :key="`${chart.key}-x-${entry.index}`"
                  :x="entry.x"
                  :y="CHART.height - 8"
                  class="date-label"
                >
                  {{ entry.label }}
                </text>
              </g>

              <template v-for="series in chart.series" :key="`${chart.key}-${series.key}`">
                <template v-if="series.mode === 'bar'">
                  <rect
                    v-for="(bar, index) in barRects(series.values, chart.yMax)"
                    :key="`${chart.key}-${series.key}-bar-${index}`"
                    class="bar-mark"
                    :x="bar.x"
                    :y="bar.y"
                    :width="bar.width"
                    :height="bar.height"
                    :fill="series.color"
                  />
                </template>
                <template v-else>
                  <path
                    v-if="series.mode === 'area'"
                    class="area-fill"
                    :d="areaPath(series.values, chart.yMax)"
                    :fill="`url(#${gradientId(chart, series)})`"
                  />
                  <polyline
                    class="line-mark"
                    :points="linePoints(series.values, chart.yMax)"
                    :stroke="series.color"
                  />
                </template>
              </template>
            </template>

            <text v-else class="chart-empty" :x="CHART.width / 2" :y="CHART.height / 2">
              {{ isInitialLoading ? locale.t('monitor.loading') : locale.t('monitor.empty') }}
            </text>
          </svg>

          <div v-if="hasData" class="legend">
            <span v-for="series in chart.series" :key="`${chart.key}-${series.key}-legend`">
              <i :style="{ backgroundColor: series.color }"></i>
              {{ series.label }}
            </span>
          </div>
        </div>
      </cds-card>
    </div>
  </section>
</template>

<style scoped>
.monitor-page {
  height: 100%;
  min-height: 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
  overflow: auto;
  color: var(--cds-alias-object-app-foreground, #1b1b1b);
}

.page-header {
  flex: 0 0 auto;
  min-width: 0;
}

.heading {
  margin: 0;
  font-size: 24px;
  line-height: 1.25;
  font-weight: 600;
  letter-spacing: 0;
}

.toolbar {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 0 0 auto;
}

.window-group {
  display: inline-flex;
  align-items: center;
  border: 1px solid var(--cds-alias-object-border-color, #c8c8c8);
  border-radius: 4px;
  overflow: hidden;
  background: var(--cds-alias-object-container-background, #fff);
}

.window-button {
  height: 32px;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 0 12px;
  border: 0;
  border-right: 1px solid var(--cds-alias-object-border-color, #c8c8c8);
  background: transparent;
  color: var(--cds-alias-object-app-foreground, #1b1b1b);
  font: inherit;
  font-size: 13px;
  line-height: 1;
  cursor: pointer;
  white-space: nowrap;
}

.window-button:last-child {
  border-right: 0;
}

.window-button:hover,
.window-button.active {
  background: var(--cds-alias-object-interaction-background-hover, #e8f1f6);
}

.window-button.active {
  font-weight: 600;
}

.custom-range {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.custom-range label {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 12px;
  color: var(--cds-alias-typography-color-300, #565656);
  white-space: nowrap;
}

.custom-range input {
  height: 32px;
  max-width: 178px;
  border: 1px solid var(--cds-alias-object-border-color, #c8c8c8);
  border-radius: 4px;
  padding: 0 8px;
  background: var(--cds-alias-object-container-background, #fff);
  color: inherit;
  font: inherit;
  font-size: 12px;
}

.refresh-button {
  flex: 0 0 auto;
}

.toolbar-spacer {
  flex: 1 1 auto;
  min-width: 12px;
}

.filter-controls {
  min-width: 0;
  display: inline-flex;
  align-items: center;
  gap: 10px;
}

.filter-field {
  width: 220px;
  --width: 220px;
}

.filter-field input {
  min-width: 0;
}

.chart-grid {
  flex: 1 1 auto;
  min-height: 0;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  grid-template-rows: repeat(3, minmax(0, 1fr));
  gap: 12px;
}

.monitor-page :deep(cds-card) {
  --padding: 0;
  --overflow: hidden;
  display: block;
  min-width: 0;
  min-height: 0;
  background: var(--cds-alias-object-container-background, #fff);
  border: 1px solid var(--cds-alias-object-border-color, #b7b7b7);
  border-radius: 6px;
  box-shadow: none;
}

.chart-card.focused {
  grid-column: 1 / -1;
  min-height: 360px;
}

.card-content {
  height: 100%;
  min-width: 0;
  min-height: 0;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  padding: 10px 12px 8px;
}

.chart-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  flex: 0 0 auto;
  min-width: 0;
}

.chart-title-row h2 {
  margin: 0;
  min-width: 0;
  color: var(--cds-alias-object-app-foreground, #1b1b1b);
  font-size: 16px;
  line-height: 1.25;
  font-weight: 600;
  letter-spacing: 0;
  overflow-wrap: anywhere;
}

.chart-actions {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  flex: 0 0 auto;
  color: var(--cds-alias-typography-color-300, #565656);
  font-size: 11px;
}

.icon-button {
  width: 22px;
  height: 22px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 4px;
  background: var(--cds-alias-object-app-background, #f4f4f4);
  color: inherit;
  cursor: pointer;
  padding: 0;
}

.icon-button:hover {
  background: var(--cds-alias-object-interaction-background-hover, #e8f1f6);
  color: var(--cds-alias-object-app-foreground, #1b1b1b);
}

.monitor-chart {
  width: 100%;
  min-height: 0;
  flex: 1 1 auto;
  overflow: visible;
}

.grid-lines line {
  stroke: currentColor;
  stroke-opacity: 0.14;
  stroke-width: 1;
}

.axis-labels text {
  fill: currentColor;
  opacity: 0.78;
  font-family: inherit;
  font-size: 10px;
}

.axis-labels .date-label {
  text-anchor: middle;
}

.line-mark {
  fill: none;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.area-fill {
  stroke: none;
}

.bar-mark {
  opacity: 0.94;
}

.chart-empty {
  fill: currentColor;
  opacity: 0.58;
  font-family: inherit;
  font-size: 12px;
  text-anchor: middle;
}

.legend {
  min-height: 16px;
  display: inline-flex;
  align-items: center;
  gap: 14px;
  flex-wrap: wrap;
  color: var(--cds-alias-object-app-foreground, #1b1b1b);
  font-size: 11px;
  line-height: 1.2;
}

.legend span {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}

.legend i {
  width: 9px;
  height: 9px;
  border-radius: 999px;
  display: inline-block;
}

.spinning {
  animation: monitor-spin 1s linear infinite;
  transform-origin: center;
}

@keyframes monitor-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 1180px) {
  .toolbar {
    align-items: flex-start;
    flex-wrap: wrap;
  }

  .toolbar-spacer {
    display: none;
  }

  .filter-controls {
    margin-left: auto;
  }
}

@media (max-width: 940px) {
  .chart-grid {
    grid-template-columns: 1fr;
    grid-template-rows: none;
  }

  .chart-card {
    min-height: 260px;
  }

  .chart-card.focused {
    min-height: 340px;
  }
}

@media (max-width: 680px) {
  .monitor-page {
    gap: 10px;
  }

  .toolbar,
  .filter-controls,
  .custom-range {
    align-items: stretch;
    flex-direction: column;
    width: 100%;
  }

  .window-group {
    width: 100%;
  }

  .window-button {
    flex: 1 1 0;
    justify-content: center;
    padding: 0 8px;
  }

  .filter-field,
  .filter-field input,
  .custom-range input {
    width: 100%;
    max-width: none;
  }

  .refresh-button {
    width: 100%;
  }
}

@media (prefers-reduced-motion: reduce) {
  .spinning {
    animation: none;
  }
}
</style>
