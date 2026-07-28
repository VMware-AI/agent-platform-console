<script setup lang="ts">
// Donut chart for model-distribution & input/output ratio views.
//
// Refactor notes (PR A.2):
//   - Empty state delegates to MeteringEmptyState (shared grammar with the
//     table / line charts).
//   - Slightly larger default size (180) for spec §11 "图表尺寸不要过小".
//   - Legend labels truncate and show full text via title=, per spec §14
//     "超长模型名截断并提供 Tooltip".

import { computed } from 'vue'
import { truncate } from '@/utils/meter-format'
import { useLocaleStore } from '@/stores/locale'
import MeteringEmptyState from '@/components/metering/MeteringEmptyState.vue'

export interface DonutSegment {
  label: string
  value: number
  color: string
}

const props = withDefaults(
  defineProps<{
    segments: DonutSegment[]
    size?: number
    centerLabel?: string
    centerValue?: string
    emptyText?: string
    /** Width budget for the legend labels, in characters. */
    legendMaxChars?: number
  }>(),
  {
    size: 180,
    centerLabel: '',
    centerValue: '',
    emptyText: '',
    legendMaxChars: 18,
  },
)

const locale = useLocaleStore()

const STROKE_WIDTH = 26
const radius = computed(() => (props.size - STROKE_WIDTH) / 2)
const circumference = computed(() => 2 * Math.PI * radius.value)
const center = computed(() => props.size / 2)

const total = computed(() => props.segments.reduce((sum, s) => sum + s.value, 0))
const hasData = computed(() => total.value > 0)

interface ArcData {
  label: string
  color: string
  dashArray: string
  dashOffset: string
  pct: number
}

const arcs = computed<ArcData[]>(() => {
  if (!hasData.value) return []
  let cumulative = 0
  return props.segments.map((s) => {
    const dashLen = (s.value / total.value) * circumference.value
    const result: ArcData = {
      label: s.label,
      color: s.color,
      dashArray: `${dashLen} ${circumference.value - dashLen}`,
      dashOffset: `${-cumulative}`,
      pct: Math.round((s.value / total.value) * 100),
    }
    cumulative += dashLen
    return result
  })
})

const legendItems = computed(() =>
  props.segments.slice(0, 5).map((s) => ({
    label: truncate(s.label, props.legendMaxChars),
    fullLabel: s.label,
    color: s.color,
    pct: total.value > 0 ? Math.round((s.value / total.value) * 100) : 0,
  })),
)
</script>

<template>
  <div class="donut-chart-wrap" v-if="hasData">
    <svg
      :viewBox="`0 0 ${size} ${size}`"
      :width="size"
      :height="size"
      class="donut-svg"
      role="img"
    >
      <circle
        v-for="arc in arcs"
        :key="arc.label"
        :cx="center"
        :cy="center"
        :r="radius"
        fill="none"
        :stroke="arc.color"
        :stroke-width="STROKE_WIDTH"
        :stroke-dasharray="arc.dashArray"
        :stroke-dashoffset="arc.dashOffset"
        stroke-linecap="butt"
        transform="rotate(-90)"
        :transform-origin="`${center} ${center}`"
      >
        <title>{{ arc.label }}: {{ arc.pct }}%</title>
      </circle>
      <text
        v-if="centerLabel"
        :x="center"
        :y="center - 6"
        text-anchor="middle"
        class="donut-center-label"
      >
        {{ centerLabel }}
      </text>
      <text
        v-if="centerValue"
        :x="center"
        :y="center + 14"
        text-anchor="middle"
        class="donut-center-value"
      >
        {{ centerValue }}
      </text>
    </svg>

    <div class="donut-legend">
      <div v-for="item in legendItems" :key="item.fullLabel" class="donut-legend-item" :title="item.fullLabel">
        <span class="legend-dot" :style="{ background: item.color }"></span>
        <span class="legend-label">{{ item.label }}</span>
        <span class="legend-pct">{{ item.pct }}%</span>
      </div>
    </div>
  </div>
  <MeteringEmptyState
    v-else
    :title="emptyText || locale.t('metering.empty.title')"
    compact
  />
</template>

<style scoped>
.donut-chart-wrap {
  display: flex;
  align-items: center;
  gap: 24px;
  flex-wrap: wrap;
  justify-content: center;
}
.donut-svg {
  flex-shrink: 0;
}
.donut-center-label {
  fill: currentColor;
  opacity: 0.6;
  font-size: 11px;
  font-family: inherit;
}
.donut-center-value {
  fill: currentColor;
  font-size: 20px;
  font-weight: 700;
  font-family: inherit;
  font-variant-numeric: tabular-nums;
}
.donut-legend {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
  flex: 1;
}
.donut-legend-item {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  min-width: 0;
}
.legend-dot {
  width: 10px;
  height: 10px;
  border-radius: 2px;
  flex-shrink: 0;
}
.legend-label {
  opacity: 0.85;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
  min-width: 0;
}
.legend-pct {
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  flex-shrink: 0;
}
</style>
