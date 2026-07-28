<script setup lang="ts">
// Metering line / area chart.
//
// Refactor notes (PR A.2):
//   - Height bumped to 280 (was 190) per spec §9.1 ("280-320px").
//   - K/M axis formatter via `fmtCompact` from @/utils/meter-format, while the
//     tooltip still shows full numbers via `formatYTick` -- per spec §9.1
//     "Tooltip 展示完整数字和日期" / "纵轴自动格式化".
//   - Empty state delegates to MeteringEmptyState (shared icon + retry) so
//     charts and tables share visual grammar per spec §12.
//   - Crosshair + per-point dot on hover, instead of a free-floating tooltip.
//   - When only 1 point exists the polyline becomes a centered dot, not the
//     previous "huge triangle" artifact (spec §9.1 "单个数据点时应显示点和数值,
//     不要绘制成异常的大面积三角形").
//   - Mouse-leave clears the tooltip and crosshair.

import { computed, ref } from 'vue'
import { fmtCompact, fmtNumber } from '@/utils/meter-format'
import { useLocaleStore } from '@/stores/locale'
import MeteringEmptyState from '@/components/metering/MeteringEmptyState.vue'

export interface LineSeries {
  name: string
  color: string
  data: { x: string; y: number }[]
}

export interface LineChartTooltip {
  x: string
  values: { name: string; color: string; value: string }[]
}

const props = withDefaults(
  defineProps<{
    series: LineSeries[]
    areaSeriesIndex?: number
    comparison?: LineSeries | null
    height?: number
    /** Custom format for axis tick labels (defaults to fmtCompact). */
    formatY?: (v: number) => string
    /** Custom format for tooltip values (defaults to fmtNumber full). */
    formatYTooltip?: (v: number) => string
    formatX?: (v: string) => string
    emptyText?: string
  }>(),
  {
    areaSeriesIndex: undefined,
    comparison: null,
    height: 280,
    formatY: (v: number) => fmtCompact(v),
    formatYTooltip: (v: number) => fmtNumber(v),
    formatX: (v: string) => v,
    emptyText: '',
  },
)

const locale = useLocaleStore()

const PLOT_LEFT = 48
const PLOT_RIGHT = 545
const PLOT_TOP = 24
const PLOT_BOTTOM = 232
const TICK_COUNT = 5
const CHART_WIDTH = 580

const tooltip = ref<LineChartTooltip | null>(null)
const tooltipLeft = ref(0)
const crosshairX = ref<number | null>(null)

const allValues = computed(() => {
  const vals: number[] = []
  for (const s of props.series) {
    for (const d of s.data) vals.push(d.y)
  }
  if (props.comparison) {
    for (const d of props.comparison.data) vals.push(d.y)
  }
  return vals
})

function niceCeil(value: number): number {
  if (value <= 0) return 0
  const exponent = Math.floor(Math.log10(value))
  const magnitude = Math.pow(10, exponent)
  const fraction = value / magnitude
  const niceFraction = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10
  return niceFraction * magnitude
}

const maxY = computed(() => niceCeil(Math.max(...allValues.value, 0)))

function scaleY(value: number): number {
  if (maxY.value <= 0) return PLOT_BOTTOM
  const ratio = Math.min(Math.max(value / maxY.value, 0), 1)
  return PLOT_BOTTOM - ratio * (PLOT_BOTTOM - PLOT_TOP)
}

const yTicks = computed(() =>
  Array.from({ length: TICK_COUNT + 1 }, (_, i) => {
    const value = (maxY.value / TICK_COUNT) * (TICK_COUNT - i)
    return { value, y: scaleY(value) }
  }),
)

const hasData = computed(() => allValues.value.length > 0)

function trendX(index: number, length: number): number {
  if (length <= 1) return (PLOT_LEFT + PLOT_RIGHT) / 2
  return PLOT_LEFT + (index / (length - 1)) * (PLOT_RIGHT - PLOT_LEFT)
}

interface MappedPoint {
  x: number
  y: number
  label: string
  rawY: number
}
interface MappedSeries {
  name: string
  color: string
  points: MappedPoint[]
  polyline: string
  isSinglePoint: boolean
}

const mappedSeries = computed<MappedSeries[]>(() =>
  props.series.map((s) => {
    const points = s.data.map((d, i) => ({
      x: trendX(i, s.data.length),
      y: scaleY(d.y),
      label: props.formatX(d.x),
      rawY: d.y,
    }))
    return {
      name: s.name,
      color: s.color,
      points,
      polyline: points.map((p) => `${p.x},${p.y}`).join(' '),
      isSinglePoint: points.length === 1,
    }
  }),
)

const comparisonMapped = computed(() => {
  if (!props.comparison) return null
  const s = props.comparison
  const points = s.data.map((d, i) => ({
    x: trendX(i, s.data.length),
    y: scaleY(d.y),
    label: props.formatX(d.x),
    rawY: d.y,
  }))
  return {
    name: s.name,
    color: s.color,
    points,
    polyline: points.map((p) => `${p.x},${p.y}`).join(' '),
    isSinglePoint: points.length === 1,
  }
})

const areaPath = computed(() => {
  if (props.areaSeriesIndex == null || !mappedSeries.value[props.areaSeriesIndex]) return ''
  const ms = mappedSeries.value[props.areaSeriesIndex]
  if (ms.points.length === 0) return ''
  const top = ms.points.map((p) => `${p.x} ${p.y}`).join(' L ')
  const first = ms.points[0]
  const last = ms.points[ms.points.length - 1]
  return `M ${first.x} ${first.y} L ${top} L ${last.x} ${PLOT_BOTTOM} L ${first.x} ${PLOT_BOTTOM} Z`
})

// Show at most ~6 x-tick labels to avoid overlap (spec §9.1 "坐标轴文字较小" --
// we keep them readable by thinning, not by shrinking font).
const xLabelStride = computed(() => {
  const first = mappedSeries.value[0]?.points ?? []
  if (first.length <= 7) return 1
  return Math.ceil(first.length / 6)
})
const visibleXLabels = computed(() => {
  const first = mappedSeries.value[0]?.points ?? []
  if (first.length === 0) return []
  // Always include the first, the last, and evenly distributed points in between.
  const stride = xLabelStride.value
  return first.filter((_, i) => i === 0 || i === first.length - 1 || i % stride === 0)
})

function findNearestIndex(mouseX: number, points: MappedPoint[]): number {
  if (points.length === 0) return -1
  if (points.length === 1) return 0
  let bestIdx = 0
  let bestDist = Infinity
  for (let i = 0; i < points.length; i++) {
    const d = Math.abs(points[i].x - mouseX)
    if (d < bestDist) {
      bestDist = d
      bestIdx = i
    }
  }
  return bestIdx
}

// Index into the (shared x-grid) series used by the hover markers below.
// Re-evaluated when the tooltip flips on/off so the marker snaps to the
// nearest point, matching the crosshair.
const hoverIndex = computed(() => {
  if (!tooltip.value) return -1
  const first = mappedSeries.value[0]
  if (!first) return -1
  return first.points.findIndex((p) => p.label === tooltip.value!.x)
})

function onHover(event: MouseEvent) {
  if (!hasData.value) return
  const svg = event.currentTarget as SVGSVGElement
  const rect = svg.getBoundingClientRect()
  const scale = CHART_WIDTH / rect.width
  const mouseX = (event.clientX - rect.left) * scale
  // Clamp into the plot area; nearest-point logic takes over from there.
  const first = mappedSeries.value[0]
  if (!first || first.points.length === 0) return
  const idx = findNearestIndex(mouseX, first.points)
  const anchor = first.points[idx]
  if (!anchor) return
  crosshairX.value = anchor.x

  const bestValues: LineChartTooltip['values'] = []
  for (const ms of mappedSeries.value) {
    const pt = ms.points[idx]
    if (pt) {
      bestValues.push({ name: ms.name, color: ms.color, value: props.formatYTooltip(pt.rawY) })
    }
  }
  if (comparisonMapped.value) {
    const pt = comparisonMapped.value.points[idx]
    if (pt) {
      bestValues.push({
        name: comparisonMapped.value.name,
        color: comparisonMapped.value.color,
        value: props.formatYTooltip(pt.rawY),
      })
    }
  }
  if (bestValues.length > 0) {
    tooltipLeft.value = (anchor.x / CHART_WIDTH) * rect.width
    tooltip.value = { x: anchor.label, values: bestValues }
  }
}

function onLeave() {
  tooltip.value = null
  crosshairX.value = null
}
</script>

<template>
  <div class="line-chart-wrap">
    <svg
      class="line-chart-svg"
      :viewBox="`0 0 ${CHART_WIDTH} ${height}`"
      role="img"
      @mousemove="onHover"
      @mouseleave="onLeave"
    >
      <defs>
        <linearGradient id="mLineArea" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stop-color="var(--chart-color-input, #4b76bd)" stop-opacity="0.28" />
          <stop offset="100%" stop-color="var(--chart-color-input, #4b76bd)" stop-opacity="0.02" />
        </linearGradient>
      </defs>

      <g class="grid-lines">
        <line
          v-for="tick in yTicks"
          :key="`gl-${tick.value}`"
          :x1="PLOT_LEFT"
          :y1="tick.y"
          :x2="PLOT_RIGHT"
          :y2="tick.y"
        />
      </g>

      <template v-if="hasData">
        <g class="axis-labels y-axis">
          <text
            v-for="tick in yTicks"
            :key="`ty-${tick.value}`"
            x="42"
            :y="tick.y + 4"
            text-anchor="end"
          >
            {{ formatY(tick.value) }}
          </text>
        </g>

        <path v-if="areaPath" :d="areaPath" fill="url(#mLineArea)" />

        <polyline
          v-if="comparisonMapped"
          class="trend-line comparison-line"
          :points="comparisonMapped.polyline"
          :stroke="comparisonMapped.color"
        />

        <polyline
          v-for="ms in mappedSeries"
          v-show="!ms.isSinglePoint"
          :key="ms.name"
          class="trend-line"
          :points="ms.polyline"
          :stroke="ms.color"
        />

        <!-- Single-data-point case: draw a dot, no polyline -->
        <g v-for="ms in mappedSeries" :key="`single-${ms.name}`">
          <circle
            v-for="pt in ms.points"
            v-show="ms.isSinglePoint"
            :key="`dot-${ms.name}-${pt.label}`"
            :cx="pt.x"
            :cy="pt.y"
            r="5"
            :fill="ms.color"
            class="single-point"
          />
          <text
            v-for="pt in ms.points"
            v-show="ms.isSinglePoint"
            :key="`dotlabel-${ms.name}-${pt.label}`"
            :x="pt.x"
            :y="pt.y - 10"
            text-anchor="middle"
            class="point-label"
          >
            {{ formatYTooltip(pt.rawY) }}
          </text>
        </g>

        <!-- Hover crosshair -->
        <line
          v-if="crosshairX != null"
          :x1="crosshairX"
          :y1="PLOT_TOP"
          :x2="crosshairX"
          :y2="PLOT_BOTTOM"
          class="crosshair"
        />

        <!-- Hover markers (one per series, at the snapped index) -->
        <circle
          v-for="ms in mappedSeries"
          :key="`hm-${ms.name}`"
          v-show="hoverIndex >= 0 && ms.points.length > 0"
          :cx="ms.points[Math.min(hoverIndex, ms.points.length - 1)]?.x ?? -9999"
          :cy="ms.points[Math.min(hoverIndex, ms.points.length - 1)]?.y ?? -9999"
          r="4"
          :fill="ms.color"
          class="hover-marker"
        />

        <g class="axis-labels x-axis">
          <text
            v-for="point in visibleXLabels"
            :key="`tx-${point.label}-${point.x}`"
            :x="point.x"
            :y="height - 10"
            text-anchor="middle"
            class="date-label"
          >
            {{ point.label }}
          </text>
        </g>
      </template>
    </svg>

    <!-- Empty state: shared component, fills the same plot area -->
    <MeteringEmptyState
      v-if="!hasData"
      :title="emptyText || locale.t('metering.empty.title')"
      :description="locale.t('metering.empty.desc')"
      class="chart-empty-slot"
    />

    <div
      v-if="tooltip"
      class="chart-tooltip"
      :style="{ left: `${tooltipLeft}px` }"
    >
      <div class="tooltip-date">{{ tooltip.x }}</div>
      <div v-for="v in tooltip.values" :key="v.name" class="tooltip-row">
        <span class="tooltip-dot" :style="{ background: v.color }"></span>
        <span class="tooltip-name">{{ v.name }}</span>
        <span class="tooltip-val">{{ v.value }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.line-chart-wrap {
  position: relative;
  width: 100%;
  height: 100%;
  min-height: 0;
  flex: 1;
}
.line-chart-svg {
  width: 100%;
  height: 100%;
  min-height: 0;
  flex: 1;
  overflow: visible;
  display: block;
}
.chart-empty-slot {
  position: absolute;
  inset: 0;
  background: var(--cds-alias-object-app-background, transparent);
}
.grid-lines line {
  stroke: currentColor;
  stroke-opacity: 0.10;
  stroke-width: 1;
}
.axis-labels text {
  fill: currentColor;
  opacity: 0.65;
  font-size: 11px;
  font-family: inherit;
}
.x-axis text {
  opacity: 0.75;
}
.trend-line {
  fill: none;
  stroke-width: 2;
  stroke-linejoin: round;
  stroke-linecap: round;
}
.comparison-line {
  stroke-dasharray: 5 3;
  stroke-opacity: 0.55;
}
.single-point {
  filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.15));
}
.point-label {
  fill: currentColor;
  font-size: 11px;
  font-weight: 600;
  font-family: inherit;
}
.crosshair {
  stroke: currentColor;
  stroke-opacity: 0.35;
  stroke-width: 1;
  stroke-dasharray: 2 3;
  pointer-events: none;
}
.hover-marker {
  stroke: var(--cds-alias-object-container-background, #fff);
  stroke-width: 2;
  pointer-events: none;
}
.chart-tooltip {
  position: absolute;
  top: 0;
  transform: translate(-50%, calc(-100% - 8px));
  background: var(--cds-alias-object-container-background, #fff);
  border: 1px solid var(--cds-alias-object-border-color, #e4e7ec);
  border-radius: 6px;
  padding: 8px 12px;
  font-size: 12px;
  pointer-events: none;
  white-space: nowrap;
  box-shadow: 0 4px 12px rgba(16, 24, 40, 0.08);
  z-index: 10;
}
.tooltip-date {
  font-weight: 600;
  margin-bottom: 4px;
  color: var(--cds-alias-object-app-foreground, #1d2939);
}
.tooltip-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 2px;
}
.tooltip-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}
.tooltip-name {
  opacity: 0.7;
}
.tooltip-val {
  font-weight: 600;
  margin-left: auto;
  padding-left: 12px;
  font-variant-numeric: tabular-nums;
}
</style>
