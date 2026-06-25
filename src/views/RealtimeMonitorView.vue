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

// ---- Time window → derived granularity ------------------------------------
// Granularity is NOT user-selectable: it is derived from the window so the bucket
// count stays bounded (e.g. 7 days at MINUTE granularity would be ~10k buckets).
type TimeWindow = '1h' | '6h' | '24h' | '7d'

interface WindowDef {
  key: TimeWindow
  label: string
  ms: number
  granularity: RequestMetricsGranularity
}

const MINUTE_MS = 60 * 1000
const HOUR_MS = 60 * MINUTE_MS
const DAY_MS = 24 * HOUR_MS

const TIME_WINDOWS: readonly WindowDef[] = [
  { key: '1h', label: 'monitor.window.1h', ms: HOUR_MS, granularity: 'MINUTE' },
  { key: '6h', label: 'monitor.window.6h', ms: 6 * HOUR_MS, granularity: 'MINUTE' },
  { key: '24h', label: 'monitor.window.24h', ms: DAY_MS, granularity: 'HOUR' },
  { key: '7d', label: 'monitor.window.7d', ms: 7 * DAY_MS, granularity: 'DAY' },
]

// Bucket width per granularity — used to snap the window end to a bucket boundary.
const GRANULARITY_MS: Record<RequestMetricsGranularity, number> = {
  MINUTE: MINUTE_MS,
  HOUR: HOUR_MS,
  DAY: DAY_MS,
}

const selectedWindow = ref<TimeWindow>('1h')

const windowDef = computed<WindowDef>(
  () => TIME_WINDOWS.find((w) => w.key === selectedWindow.value) ?? TIME_WINDOWS[0],
)

// ---- Refresh interval ------------------------------------------------------
// "off" disables the timer (manual refresh only). Other values poll by bumping
// `nowTick`, which recomputes the reactive variables and triggers a refetch.
type RefreshInterval = '5s' | '10s' | '30s' | 'off'

interface IntervalDef {
  key: RefreshInterval
  label: string
  ms: number | null
}

const REFRESH_INTERVALS: readonly IntervalDef[] = [
  { key: '5s', label: 'monitor.interval.5s', ms: 5 * 1000 },
  { key: '10s', label: 'monitor.interval.10s', ms: 10 * 1000 },
  { key: '30s', label: 'monitor.interval.30s', ms: 30 * 1000 },
  { key: 'off', label: 'monitor.interval.off', ms: null },
]

const selectedInterval = ref<RefreshInterval>('10s')

const intervalDef = computed<IntervalDef>(
  () => REFRESH_INTERVALS.find((i) => i.key === selectedInterval.value) ?? REFRESH_INTERVALS[1],
)

// ---- Reactive query variables ---------------------------------------------
// `nowTick` is the live clock, advanced by the poll timer / manual refresh. The
// window END is snapped UP to the next bucket boundary so (a) the requested range
// aligns with the backend's truncated buckets — no partial leading bucket — and
// (b) `variables` stays constant within a bucket period, bounding distinct query
// keys. Liveness within a bucket comes from an explicit `refetch()` on the timer
// (see `poll`), not from `variables` changing.
const nowTick = ref(Date.now())

const variables = computed<RequestMetricsVars>(() => {
  const unitMs = GRANULARITY_MS[windowDef.value.granularity]
  const end = Math.ceil(nowTick.value / unitMs) * unitMs
  const from = new Date(end - windowDef.value.ms)
  const to = new Date(end)
  return {
    from: from.toISOString(),
    to: to.toISOString(),
    granularity: windowDef.value.granularity,
    // No filter UI in v1 — aggregate across the whole org.
    filter: null,
  }
})

// `no-cache`: this is a singleton, always-polling page whose `to` rolls forward
// over time; caching would accumulate one ROOT_QUERY entry per bucket boundary
// for the life of the tab. We always want fresh data and never re-read the cache.
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

// ---- Polling (timer + visibility pause) -----------------------------------
// A single interval id; restarted whenever the interval changes. The timer is
// paused while the tab is hidden (no point polling a backgrounded page) and
// resumed — with an immediate tick — when it becomes visible again.
let pollTimer: ReturnType<typeof setInterval> | null = null

// One poll cycle: roll the snapped window forward (tracking "now" and crossing
// bucket boundaries) AND refetch. Within a bucket the snapped `variables` don't
// change, so the explicit refetch is what keeps the current bucket live; at a
// boundary `variables` also change and useQuery refetches (a harmless extra call).
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
  const ms = intervalDef.value.ms
  // "off" → no timer; also never poll while hidden.
  if (ms === null || (typeof document !== 'undefined' && document.hidden)) return
  pollTimer = setInterval(poll, ms)
}

function manualRefresh() {
  poll()
}

function onVisibilityChange() {
  if (typeof document === 'undefined') return
  if (document.hidden) {
    stopPolling()
  } else {
    // Catch up on data missed while hidden, then resume the timer.
    poll()
    startPolling()
  }
}

// Restart the timer when the interval selection changes.
watch(selectedInterval, () => startPolling())

// Refresh immediately when the window changes (its variables recompute, which
// auto-refetches; poll() also re-anchors `to` to "now" at the moment of switch).
watch(selectedWindow, () => poll())

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

// ---- Formatting ------------------------------------------------------------
function formatNumber(value: number): string {
  return new Intl.NumberFormat(locale.locale === 'zh' ? 'zh-CN' : 'en-US').format(value)
}

const summary = computed(() => metrics.value?.summary ?? null)

const kpiTotalRequests = computed(() => formatNumber(summary.value?.totalRequests ?? 0))
const kpiErrorRate = computed(() => `${((summary.value?.errorRate ?? 0) * 100).toFixed(1)}%`)
const kpiAvgLatency = computed(() => `${formatNumber(summary.value?.avgLatencyMs ?? 0)} ms`)
const kpiP95Latency = computed(() => `${formatNumber(summary.value?.p95LatencyMs ?? 0)} ms`)
const kpiInputTokens = computed(() => formatNumber(summary.value?.totalInputTokens ?? 0))
const kpiOutputTokens = computed(() => formatNumber(summary.value?.totalOutputTokens ?? 0))

const kpiCards = computed(() => [
  { key: 'totalRequests', label: 'monitor.kpi.totalRequests', value: kpiTotalRequests.value },
  { key: 'errorRate', label: 'monitor.kpi.errorRate', value: kpiErrorRate.value },
  { key: 'avgLatency', label: 'monitor.kpi.avgLatency', value: kpiAvgLatency.value },
  { key: 'p95Latency', label: 'monitor.kpi.p95Latency', value: kpiP95Latency.value },
  { key: 'inputTokens', label: 'monitor.kpi.inputTokens', value: kpiInputTokens.value },
  { key: 'outputTokens', label: 'monitor.kpi.outputTokens', value: kpiOutputTokens.value },
])

// ---- SVG chart geometry (data-driven, immutable) --------------------------
// Shared viewBox (0 0 560 190); plot area bounded by the grid lines. Values are
// scaled linearly against a "nice" max so the highest point reaches the top. This
// mirrors MeteringCenterView's geometry so the two pages read consistently.
const PLOT_LEFT = 44
const PLOT_RIGHT = 545
const PLOT_TOP = 25
const PLOT_BOTTOM = 165
const TICK_COUNT = 4

function niceCeil(value: number): number {
  if (value <= 0) return 0
  const exponent = Math.floor(Math.log10(value))
  const magnitude = Math.pow(10, exponent)
  const fraction = value / magnitude
  const niceFraction = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10
  return niceFraction * magnitude
}

function scaleY(value: number, max: number): number {
  if (max <= 0) return PLOT_BOTTOM
  const ratio = Math.min(Math.max(value / max, 0), 1)
  return PLOT_BOTTOM - ratio * (PLOT_BOTTOM - PLOT_TOP)
}

// X position for a bucket index across the plot width (single point → centred).
function plotX(index: number, length: number): number {
  if (length <= 1) return (PLOT_LEFT + PLOT_RIGHT) / 2
  return PLOT_LEFT + (index / (length - 1)) * (PLOT_RIGHT - PLOT_LEFT)
}

// X-axis label for a bucket timestamp; HH:MM for sub-day granularity, M/D for DAY.
function bucketLabel(iso: string): string {
  const parsed = new Date(iso)
  if (Number.isNaN(parsed.getTime())) return iso
  if (windowDef.value.granularity === 'DAY') {
    return `${parsed.getMonth() + 1}/${parsed.getDate()}`
  }
  const hh = String(parsed.getHours()).padStart(2, '0')
  const mm = String(parsed.getMinutes()).padStart(2, '0')
  return `${hh}:${mm}`
}

// Per-bucket error rate as a percentage, guarding division by zero.
function bucketErrorPct(bucket: RequestMetricsBucket): number {
  if (bucket.requestCount <= 0) return 0
  return (bucket.errorCount / bucket.requestCount) * 100
}

// A y-axis tick set (top → 0) for a given nice max.
function ticksFor(max: number): Array<{ value: number; y: number }> {
  return Array.from({ length: TICK_COUNT + 1 }, (_, i) => {
    const value = (max / TICK_COUNT) * (TICK_COUNT - i)
    return { value, y: scaleY(value, max) }
  })
}

interface SeriesPoint {
  x: number
  y: number
}

// Build a polyline points string for a single value accessor over the buckets.
function lineFor(accessor: (b: RequestMetricsBucket) => number, max: number): string {
  const list = buckets.value
  return list
    .map((b, i) => {
      const point: SeriesPoint = { x: plotX(i, list.length), y: scaleY(accessor(b), max) }
      return `${point.x},${point.y}`
    })
    .join(' ')
}

// Closed area path under a single value accessor, back along the baseline.
function areaFor(accessor: (b: RequestMetricsBucket) => number, max: number): string {
  const list = buckets.value
  if (list.length === 0) return ''
  const top = list.map((b, i) => `${plotX(i, list.length)} ${scaleY(accessor(b), max)}`).join(' L ')
  const firstX = plotX(0, list.length)
  const lastX = plotX(list.length - 1, list.length)
  return `M ${firstX} ${PLOT_BOTTOM} L ${top} L ${lastX} ${PLOT_BOTTOM} Z`
}

// X-axis labels, thinned so dense windows do not overflow with text.
const xLabels = computed(() => {
  const list = buckets.value
  if (list.length === 0) return []
  const maxLabels = 8
  const step = Math.max(1, Math.ceil(list.length / maxLabels))
  return list
    .map((b, i) => ({ x: plotX(i, list.length), label: bucketLabel(b.timestamp), index: i }))
    .filter((entry) => entry.index % step === 0 || entry.index === list.length - 1)
})

// ---- Chart (a): request volume --------------------------------------------
const requestMax = computed(() =>
  niceCeil(buckets.value.reduce((max, b) => Math.max(max, b.requestCount), 0)),
)
const requestTicks = computed(() => ticksFor(requestMax.value))
const requestLine = computed(() => lineFor((b) => b.requestCount, requestMax.value))
const requestArea = computed(() => areaFor((b) => b.requestCount, requestMax.value))

// ---- Chart (b): error rate (%) --------------------------------------------
const errorMax = computed(() =>
  niceCeil(buckets.value.reduce((max, b) => Math.max(max, bucketErrorPct(b)), 0)),
)
const errorTicks = computed(() => ticksFor(errorMax.value))
const errorLine = computed(() => lineFor((b) => bucketErrorPct(b), errorMax.value))
const errorArea = computed(() => areaFor((b) => bucketErrorPct(b), errorMax.value))

// ---- Chart (c): latency (avg + p95) ---------------------------------------
const latencyMax = computed(() =>
  niceCeil(buckets.value.reduce((max, b) => Math.max(max, b.avgLatencyMs, b.p95LatencyMs), 0)),
)
const latencyTicks = computed(() => ticksFor(latencyMax.value))
const latencyAvgLine = computed(() => lineFor((b) => b.avgLatencyMs, latencyMax.value))
const latencyP95Line = computed(() => lineFor((b) => b.p95LatencyMs, latencyMax.value))

// ---- Chart (d): tokens (input + output) -----------------------------------
const tokenMax = computed(() =>
  niceCeil(
    buckets.value.reduce((max, b) => Math.max(max, b.inputTokensTotal, b.outputTokensTotal), 0),
  ),
)
const tokenTicks = computed(() => ticksFor(tokenMax.value))
const tokenInputLine = computed(() => lineFor((b) => b.inputTokensTotal, tokenMax.value))
const tokenOutputLine = computed(() => lineFor((b) => b.outputTokensTotal, tokenMax.value))
</script>

<template>
  <section class="monitor-page">
    <header class="page-header">
      <h1 cds-text="title" class="heading">{{ locale.t('monitor.title') }}</h1>
      <p cds-text="body" class="desc muted">{{ locale.t('monitor.description') }}</p>
    </header>

    <div class="toolbar">
      <label class="inline-control">
        <span>{{ locale.t('monitor.window.label') }}</span>
        <cds-select control-width="shrink">
          <select v-model="selectedWindow" :aria-label="locale.t('monitor.window.label')">
            <option v-for="win in TIME_WINDOWS" :key="win.key" :value="win.key">
              {{ locale.t(win.label) }}
            </option>
          </select>
        </cds-select>
      </label>

      <label class="inline-control">
        <span>{{ locale.t('monitor.interval.label') }}</span>
        <cds-select control-width="shrink">
          <select v-model="selectedInterval" :aria-label="locale.t('monitor.interval.label')">
            <option v-for="opt in REFRESH_INTERVALS" :key="opt.key" :value="opt.key">
              {{ locale.t(opt.label) }}
            </option>
          </select>
        </cds-select>
      </label>

      <cds-button
        action="ghost"
        class="refresh-button"
        :disabled="loading"
        :aria-label="locale.t('monitor.action.refresh')"
        :title="locale.t('monitor.action.refresh')"
        @click="manualRefresh"
      >
        <cds-icon shape="refresh" size="md" :class="{ spinning: loading }"></cds-icon>
        <span>{{ locale.t('monitor.action.refresh') }}</span>
      </cds-button>
    </div>

    <div class="kpi-grid">
      <cds-card v-for="card in kpiCards" :key="card.key" class="kpi-card">
        <div class="card-content kpi-content">
          <span class="kpi-label">{{ locale.t(card.label) }}</span>
          <strong class="kpi-value">{{ card.value }}</strong>
        </div>
      </cds-card>
    </div>

    <div class="chart-grid">
      <!-- (a) Request volume -->
      <cds-card class="chart-card">
        <div class="card-content chart-content">
          <h2>{{ locale.t('monitor.chart.requests') }}</h2>
          <svg
            class="line-chart"
            viewBox="0 0 560 190"
            role="img"
            :aria-label="locale.t('monitor.chart.requests')"
          >
            <defs>
              <linearGradient id="monitorRequestArea" x1="0" x2="0" y1="0" y2="1">
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
            <template v-if="hasData">
              <g class="axis-labels">
                <text v-for="tick in requestTicks" :key="`rq-y-${tick.value}`" x="4" :y="tick.y + 4">
                  {{ formatNumber(Math.round(tick.value)) }}
                </text>
                <text
                  v-for="entry in xLabels"
                  :key="`rq-x-${entry.index}`"
                  :x="entry.x"
                  y="184"
                  class="date-label"
                >
                  {{ entry.label }}
                </text>
              </g>
              <path :d="requestArea" fill="url(#monitorRequestArea)" />
              <polyline class="trend-line input-line" :points="requestLine" />
            </template>
            <text v-else class="chart-empty" x="280" y="95">{{ locale.t('monitor.empty') }}</text>
          </svg>
        </div>
      </cds-card>

      <!-- (b) Error rate -->
      <cds-card class="chart-card">
        <div class="card-content chart-content">
          <h2>{{ locale.t('monitor.chart.errorRate') }}</h2>
          <svg
            class="line-chart"
            viewBox="0 0 560 190"
            role="img"
            :aria-label="locale.t('monitor.chart.errorRate')"
          >
            <defs>
              <linearGradient id="monitorErrorArea" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stop-color="#c92100" stop-opacity="0.26" />
                <stop offset="100%" stop-color="#c92100" stop-opacity="0.03" />
              </linearGradient>
            </defs>
            <g class="grid-lines">
              <line x1="44" y1="25" x2="545" y2="25" />
              <line x1="44" y1="60" x2="545" y2="60" />
              <line x1="44" y1="95" x2="545" y2="95" />
              <line x1="44" y1="130" x2="545" y2="130" />
              <line x1="44" y1="165" x2="545" y2="165" />
            </g>
            <template v-if="hasData">
              <g class="axis-labels">
                <text v-for="tick in errorTicks" :key="`er-y-${tick.value}`" x="4" :y="tick.y + 4">
                  {{ tick.value.toFixed(1) }}%
                </text>
                <text
                  v-for="entry in xLabels"
                  :key="`er-x-${entry.index}`"
                  :x="entry.x"
                  y="184"
                  class="date-label"
                >
                  {{ entry.label }}
                </text>
              </g>
              <path :d="errorArea" fill="url(#monitorErrorArea)" />
              <polyline class="trend-line error-line" :points="errorLine" />
            </template>
            <text v-else class="chart-empty" x="280" y="95">{{ locale.t('monitor.empty') }}</text>
          </svg>
        </div>
      </cds-card>

      <!-- (c) Latency (avg + p95) -->
      <cds-card class="chart-card">
        <div class="card-content chart-content">
          <div class="card-heading-row">
            <h2>{{ locale.t('monitor.chart.latency') }}</h2>
            <div class="chart-legend">
              <span><i class="legend-mark input"></i>{{ locale.t('monitor.kpi.avgLatency') }}</span>
              <span><i class="legend-mark p95"></i>{{ locale.t('monitor.kpi.p95Latency') }}</span>
            </div>
          </div>
          <svg
            class="line-chart"
            viewBox="0 0 560 190"
            role="img"
            :aria-label="locale.t('monitor.chart.latency')"
          >
            <g class="grid-lines">
              <line x1="44" y1="25" x2="545" y2="25" />
              <line x1="44" y1="60" x2="545" y2="60" />
              <line x1="44" y1="95" x2="545" y2="95" />
              <line x1="44" y1="130" x2="545" y2="130" />
              <line x1="44" y1="165" x2="545" y2="165" />
            </g>
            <template v-if="hasData">
              <g class="axis-labels">
                <text v-for="tick in latencyTicks" :key="`lt-y-${tick.value}`" x="4" :y="tick.y + 4">
                  {{ formatNumber(Math.round(tick.value)) }}
                </text>
                <text
                  v-for="entry in xLabels"
                  :key="`lt-x-${entry.index}`"
                  :x="entry.x"
                  y="184"
                  class="date-label"
                >
                  {{ entry.label }}
                </text>
              </g>
              <polyline class="trend-line input-line" :points="latencyAvgLine" />
              <polyline class="trend-line p95-line" :points="latencyP95Line" />
            </template>
            <text v-else class="chart-empty" x="280" y="95">{{ locale.t('monitor.empty') }}</text>
          </svg>
        </div>
      </cds-card>

      <!-- (d) Tokens (input + output) -->
      <cds-card class="chart-card">
        <div class="card-content chart-content">
          <div class="card-heading-row">
            <h2>{{ locale.t('monitor.chart.tokens') }}</h2>
            <div class="chart-legend">
              <span><i class="legend-mark input"></i>{{ locale.t('monitor.kpi.inputTokens') }}</span>
              <span><i class="legend-mark output"></i>{{ locale.t('monitor.kpi.outputTokens') }}</span>
            </div>
          </div>
          <svg
            class="line-chart"
            viewBox="0 0 560 190"
            role="img"
            :aria-label="locale.t('monitor.chart.tokens')"
          >
            <g class="grid-lines">
              <line x1="44" y1="25" x2="545" y2="25" />
              <line x1="44" y1="60" x2="545" y2="60" />
              <line x1="44" y1="95" x2="545" y2="95" />
              <line x1="44" y1="130" x2="545" y2="130" />
              <line x1="44" y1="165" x2="545" y2="165" />
            </g>
            <template v-if="hasData">
              <g class="axis-labels">
                <text v-for="tick in tokenTicks" :key="`tk-y-${tick.value}`" x="4" :y="tick.y + 4">
                  {{ formatNumber(Math.round(tick.value)) }}
                </text>
                <text
                  v-for="entry in xLabels"
                  :key="`tk-x-${entry.index}`"
                  :x="entry.x"
                  y="184"
                  class="date-label"
                >
                  {{ entry.label }}
                </text>
              </g>
              <polyline class="trend-line input-line" :points="tokenInputLine" />
              <polyline class="trend-line output-line" :points="tokenOutputLine" />
            </template>
            <text v-else class="chart-empty" x="280" y="95">{{ locale.t('monitor.empty') }}</text>
          </svg>
        </div>
      </cds-card>
    </div>

    <p v-if="isInitialLoading" class="loading-hint muted">{{ locale.t('monitor.loading') }}</p>
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
}
.heading {
  margin: 0;
  font-size: 24px;
  line-height: 1.3;
  font-weight: 600;
  letter-spacing: -0.01em;
}
.desc {
  margin: 8px 0 0;
  color: var(--cds-alias-typography-color-300, #565656);
  font-size: 14px;
  line-height: 1.5;
  max-width: 720px;
}
.toolbar {
  display: flex;
  align-items: center;
  gap: 16px;
  flex: 0 0 auto;
}
.inline-control {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
}
.inline-control cds-select {
  width: 160px;
  font-weight: 400;
}
.refresh-button {
  margin-left: auto;
}
.monitor-page :deep(cds-card) {
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
.kpi-grid {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 10px;
  flex: 0 0 auto;
}
.kpi-content {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.kpi-label {
  font-size: 12px;
  color: var(--cds-alias-typography-color-300, #565656);
}
.kpi-value {
  font-size: 24px;
  line-height: 1.1;
  font-weight: 600;
  letter-spacing: -0.02em;
  font-variant-numeric: tabular-nums;
}
.chart-grid {
  min-height: 190px;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  flex: 1 1 auto;
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
.legend-mark.p95 { background: #e0a33e; }
.line-chart {
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
.axis-labels text {
  fill: currentColor;
  opacity: 0.72;
  font-size: 10px;
  font-family: inherit;
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
.input-line { stroke: #4b76bd; }
.output-line { stroke: #9aa8bb; }
.p95-line { stroke: #e0a33e; }
.error-line { stroke: #c92100; }
.loading-hint {
  flex: 0 0 auto;
  margin: 0;
  font-size: 12px;
}
.muted {
  color: var(--cds-alias-typography-color-300, #565656);
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
@media (max-width: 1120px) {
  .kpi-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
  .chart-grid {
    grid-template-columns: 1fr;
  }
  .chart-card {
    min-height: 240px;
  }
}
@media (max-width: 650px) {
  .toolbar {
    align-items: stretch;
    flex-direction: column;
  }
  .refresh-button {
    margin-left: 0;
  }
  .kpi-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .inline-control {
    justify-content: space-between;
  }
  .inline-control cds-select {
    width: min(160px, 60vw);
  }
}
@media (prefers-reduced-motion: reduce) {
  .spinning {
    animation: none;
  }
}
</style>
