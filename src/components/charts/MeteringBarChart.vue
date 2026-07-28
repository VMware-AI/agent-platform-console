<script setup lang="ts">
// Horizontal Top-N ranking bar chart.
//
// Refactor notes (PR A.2):
//   - Switched from vertical (5 wide vertical bars) to horizontal ranking
//     rows. Spec §9.2: "使用横向条形图，不使用纯黑色柱状图；展示排名、名称、
//     条形图、数值".
//   - Default colors come from --chart-color-input (theme blue), no more
//     hardcoded black ("不使用纯黑色").
//   - Blue gradient applied via CSS linear-gradient, not solid fill.
//   - Each label is truncated and gets the full text via `title=` for
//     tooltips, per spec §9.2 + §14.
//   - For API key rankings, labels are masked (`sk-12ab…9f02`) when caller
//     passes `labelIsKey` -- spec §9.2 "密钥排行中不要完整暴露密钥".
//   - Empty state uses MeteringEmptyState (shared grammar).
//   - Maximum bar width is capped at 70% of the rail so a single row never
//     visually saturates the card (spec §9.2 "不要因为只有一个项目就让条形图
//     占满整张卡片").

import { computed } from 'vue'
import { truncate, apiKeyMask } from '@/utils/meter-format'
import { useLocaleStore } from '@/stores/locale'
import MeteringEmptyState from '@/components/metering/MeteringEmptyState.vue'

export interface BarData {
  label: string
  value: number
  color?: string
}

const props = withDefaults(
  defineProps<{
    bars: BarData[]
    topN?: number
    /** When true, labels are run through apiKeyMask -- used for API key
     *  rankings. */
    labelIsKey?: boolean
    /** Truncate labels to this many code points (default 22 covers spec's
     *  "20-28 个字符" range). */
    labelMaxChars?: number
    /** Format the displayed number value on the right (e.g. "$1.23"). */
    formatValue?: (v: number) => string
    emptyText?: string
  }>(),
  {
    topN: 5,
    labelIsKey: false,
    labelMaxChars: 22,
    formatValue: (v: number) => String(Math.round(v)),
    emptyText: '',
  },
)

const locale = useLocaleStore()

const emit = defineEmits<{
  (e: 'item-click', label: string): void
}>()

interface RankedRow {
  rank: number
  displayLabel: string
  fullLabel: string
  value: number
  /** 0..1, scaled against the leader so the longest bar is `maxRatio`. */
  ratio: number
  color: string
}

const maxRatio = 0.72

const rows = computed<RankedRow[]>(() => {
  const sorted = [...props.bars].sort((a, b) => b.value - a.value).slice(0, props.topN)
  const leader = sorted[0]?.value ?? 0
  return sorted.map((b, i) => {
    const fullLabel = b.label
    const displayLabel = props.labelIsKey
      ? apiKeyMask(fullLabel)
      : truncate(fullLabel, props.labelMaxChars)
    const ratio = leader > 0 ? (b.value / leader) * maxRatio : 0
    return {
      rank: i + 1,
      displayLabel,
      fullLabel,
      value: b.value,
      ratio,
      color: b.color ?? 'var(--chart-color-input, #4b76bd)',
    }
  })
})

const hasData = computed(() => rows.value.length > 0)
</script>

<template>
  <div v-if="hasData" class="bar-list" role="list">
    <div
      v-for="row in rows"
      :key="row.fullLabel + row.rank"
      class="bar-row"
      role="listitem"
      :aria-label="`${row.fullLabel} · ${formatValue(row.value)} · 点击查看详情`"
      tabindex="0"
      @click="emit('item-click', row.fullLabel)"
      @keydown.enter.prevent="emit('item-click', row.fullLabel)"
      @keydown.space.prevent="emit('item-click', row.fullLabel)"
    >
      <span class="bar-rank">{{ row.rank }}</span>
      <span class="bar-label" :title="row.fullLabel">{{ row.displayLabel }}</span>
      <span class="bar-rail">
        <span
          class="bar-fill"
          :style="{ width: `${Math.max(row.ratio * 100, row.value > 0 ? 2 : 0)}%` }"
        ></span>
      </span>
      <span class="bar-value">{{ formatValue(row.value) }}</span>
    </div>
  </div>
  <MeteringEmptyState
    v-else
    :title="emptyText || locale.t('metering.empty.title')"
    compact
  />
</template>

<style scoped>
.bar-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 4px 0;
  width: 100%;
}
.bar-row {
  display: grid;
  grid-template-columns: 22px minmax(0, 1fr) minmax(80px, 2fr) 80px;
  align-items: center;
  gap: 12px;
  font-size: 12px;
  min-width: 0;
  cursor: pointer;
  border-radius: 4px;
  transition: background 0.15s;
}
.bar-row:hover,
.bar-row:focus-visible {
  background: var(--cds-alias-object-app-background, #f5f7fa);
  outline: none;
}
.bar-rank {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 11px;
  background: var(--cds-alias-object-app-background, #f0f5f8);
  color: var(--cds-alias-typography-color-300, #667085);
  font-size: 11px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
.bar-row:first-child .bar-rank {
  background: var(--chart-color-input, #4b76bd);
  color: #fff;
}
.bar-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--cds-alias-object-app-foreground, #1d2939);
}
.bar-rail {
  display: block;
  height: 14px;
  border-radius: 4px;
  background: var(--cds-alias-object-app-background, #f5f7fa);
  overflow: hidden;
  min-width: 60px;
}
.bar-fill {
  display: block;
  height: 100%;
  border-radius: 4px;
  background: linear-gradient(
    90deg,
    var(--chart-color-input, #4b76bd) 0%,
    color-mix(in srgb, var(--chart-color-input, #4b76bd) 70%, #fff) 100%
  );
  transition: width 0.25s ease-out;
}
.bar-value {
  font-variant-numeric: tabular-nums;
  font-weight: 600;
  text-align: right;
  color: var(--cds-alias-object-app-foreground, #1d2939);
}
@media (max-width: 720px) {
  .bar-row { grid-template-columns: 18px minmax(0, 1fr) 64px; }
  .bar-rail { display: none; }
}
</style>
