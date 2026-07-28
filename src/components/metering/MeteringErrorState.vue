<script setup lang="ts">
// Error state for one metering card / chart when its query fails.
// Per spec §12 — single failure must NOT white-screen the whole page; the
// other cards keep rendering. Caller wires the retry button to its refetch().

import { useLocaleStore } from '@/stores/locale'
import { computed } from 'vue'

const props = withDefaults(defineProps<{
  title?: string
  description?: string
  actionLabel?: string
  compact?: boolean
}>(), {
  title: '',
  description: '',
  actionLabel: '',
  compact: false,
})

const emit = defineEmits<{
  (e: 'retry'): void
}>()

const locale = useLocaleStore()
const fallbackTitle = computed(() => props.title || locale.t('metering.error.title'))
const fallbackDesc = computed(() => props.description || locale.t('metering.error.desc'))
const fallbackAction = computed(() => props.actionLabel || locale.t('metering.error.retry'))
</script>

<template>
  <div class="metering-error" :class="{ compact }" role="alert">
    <svg class="icon" viewBox="0 0 48 48" aria-hidden="true">
      <!-- Triangle warning glyph: glass-card convention without being a
           templated Material Symbol — outline-only, semantically distinct
           from the empty-state bar chart. -->
      <path d="M24 8 L42 36 L6 36 Z" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linejoin="round" />
      <line x1="24" y1="20" x2="24" y2="28" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" />
      <circle cx="24" cy="33" r="1.5" fill="currentColor" />
    </svg>
    <p v-if="fallbackTitle" class="title">{{ fallbackTitle }}</p>
    <p v-if="fallbackDesc" class="desc">{{ fallbackDesc }}</p>
    <button v-if="fallbackAction" type="button" class="action" @click="emit('retry')">
      {{ fallbackAction }}
    </button>
  </div>
</template>

<style scoped>
.metering-error {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 2rem 1rem;
  text-align: center;
  color: var(--cds-alias-status-danger, #f04438);
  min-height: 0;
}
.metering-error.compact {
  padding: 1rem 0.5rem;
}
.icon {
  width: 44px;
  height: 44px;
}
.title {
  margin: 0;
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--cds-alias-status-danger, #f04438);
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
  border: 1px solid var(--cds-alias-status-danger, #f04438);
  border-radius: 6px;
  background: var(--cds-alias-object-container-background, #fff);
  color: var(--cds-alias-status-danger, #f04438);
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}
.action:hover {
  background: var(--cds-alias-status-danger, #f04438);
  color: #fff;
}
.action:focus-visible {
  outline: 2px solid var(--cds-alias-status-danger, #f04438);
  outline-offset: 2px;
}
</style>
