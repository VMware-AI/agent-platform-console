<script setup lang="ts">
// Centered empty state shared by metering charts and tables.
// Per spec §12 — "暂无计量数据" + 重置筛选 action.
// SVG icon (not emoji) per dataviz anti-patterns.

import { useLocaleStore } from '@/stores/locale'
import { computed } from 'vue'

const props = withDefaults(defineProps<{
  /** Allow callers to override the localizable strings if a card needs a
   *  domain-specific message (e.g. "暂无趋势数据" vs generic). */
  title?: string
  description?: string
  actionLabel?: string
  /** Hide the action button when no reset action is meaningful (e.g. a
   *  filtered table the user already knows they emptied). */
  showAction?: boolean
  /** Reduce vertical padding when the empty state sits inside a small KPI
   *  tile rather than a tall chart card. */
  compact?: boolean
}>(), {
  title: '',
  description: '',
  actionLabel: '',
  showAction: true,
  compact: false,
})

const emit = defineEmits<{
  (e: 'action'): void
}>()

const locale = useLocaleStore()
// Default copy — falls back to the current locale's metering.empty keys
// when the caller doesn't override.
const fallbackTitle = computed(() => props.title || locale.t('metering.empty.title'))
const fallbackDesc = computed(() => props.description || locale.t('metering.empty.desc'))
const fallbackAction = computed(() => props.actionLabel || locale.t('metering.empty.action'))
</script>

<template>
  <div class="metering-empty" :class="{ compact }" role="status">
    <svg class="icon" viewBox="0 0 48 48" aria-hidden="true">
      <!-- Bar-chart silhouette: three rising bars inside a soft rectangle,
           matches the chart-heavy context the state usually appears in. -->
      <rect x="6" y="14" width="36" height="26" rx="4" fill="currentColor" fill-opacity="0.08" />
      <rect x="13" y="28" width="5" height="10" rx="1" fill="currentColor" fill-opacity="0.45" />
      <rect x="21.5" y="22" width="5" height="16" rx="1" fill="currentColor" fill-opacity="0.55" />
      <rect x="30" y="18" width="5" height="20" rx="1" fill="currentColor" fill-opacity="0.7" />
    </svg>
    <p v-if="fallbackTitle" class="title">{{ fallbackTitle }}</p>
    <p v-if="fallbackDesc" class="desc">{{ fallbackDesc }}</p>
    <button v-if="showAction" type="button" class="action" @click="emit('action')">
      {{ fallbackAction }}
    </button>
  </div>
</template>

<style scoped>
.metering-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 2.5rem 1rem;
  text-align: center;
  color: var(--cds-alias-typography-color-300, #667085);
  min-height: 0;
}
.metering-empty.compact {
  padding: 1.25rem 0.75rem;
}
.icon {
  width: 48px;
  height: 48px;
  color: var(--cds-alias-status-info, #0072a3);
  opacity: 0.8;
}
.title {
  margin: 0;
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--cds-alias-object-app-foreground, #1d2939);
}
.desc {
  margin: 0;
  font-size: 0.8125rem;
  color: var(--cds-alias-typography-color-300, #667085);
  max-width: 320px;
}
.action {
  margin-top: 0.5rem;
  padding: 0.4rem 0.875rem;
  font-size: 0.8125rem;
  font-weight: 500;
  border: 1px solid var(--cds-alias-object-interaction-border, #d0d5dd);
  border-radius: 6px;
  background: var(--cds-alias-object-container-background, #fff);
  color: var(--cds-alias-object-app-foreground, #1d2939);
  cursor: pointer;
  transition: border-color 0.15s, box-shadow 0.15s;
}
.action:hover {
  border-color: var(--cds-alias-status-info, #0072a3);
  box-shadow: 0 0 0 3px rgba(0, 114, 163, 0.1);
}
.action:focus-visible {
  outline: 2px solid var(--cds-alias-status-info, #0072a3);
  outline-offset: 2px;
}
</style>
