<script setup lang="ts">
// Caller: MeteringCenterView.vue
// Pure presentational — emits on user interaction, no data I/O

export interface TimeRange {
  key: string
  label: string
}

import { ref, watch } from 'vue'

defineProps<{
  ranges: TimeRange[]
  selectedRange: string
  showCustom?: boolean
}>()

const emit = defineEmits<{
  'update:selectedRange': [value: string]
  'update:customFrom': [value: string]
  'update:customTo': [value: string]
}>()

function toLocalInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
function daysAgo(n: number): Date {
  const d = new Date(); d.setDate(d.getDate() - n); return d
}
const customFrom = ref(toLocalInput(daysAgo(7)))
const customTo = ref(toLocalInput(new Date()))
watch(customFrom, (v) => emit('update:customFrom', v))
watch(customTo, (v) => emit('update:customTo', v))
</script>

<template>
  <div class="filter-toolbar">
    <div class="range-group" role="group">
      <button
        v-for="range in ranges"
        :key="range.key"
        type="button"
        class="range-button"
        :class="{ active: selectedRange === range.key }"
        :aria-pressed="selectedRange === range.key"
        @click="emit('update:selectedRange', range.key)"
      >
        {{ range.label }}
      </button>
    </div>

    <div class="filter-selects">
      <template v-if="showCustom">
        <label class="inline-filter">
          <span>起</span>
          <input type="datetime-local" :value="customFrom" @input="customFrom = ($event.target as HTMLInputElement).value" />
        </label>
        <label class="inline-filter">
          <span>止</span>
          <input type="datetime-local" :value="customTo" @input="customTo = ($event.target as HTMLInputElement).value" />
        </label>
      </template>
    </div>
  </div>
</template>

<style scoped>
.filter-toolbar {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  flex-wrap: wrap;
  gap: 12px;
  flex: 0 0 auto;
}
.range-group {
  display: inline-flex;
  align-items: stretch;
  min-width: 0;
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
  gap: 6px;
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
}
.inline-filter input[type='datetime-local'] {
  width: 220px;
  max-width: 220px;
  min-width: 0;
  font: inherit;
  font-size: 12px;
  padding: 4px 6px;
  border: 1px solid var(--cds-alias-object-border-color, #b3b3b3);
  border-radius: 4px;
  background: var(--cds-alias-object-container-background, #fff);
  color: var(--cds-alias-object-app-foreground, #1b1b1b);
}
/* Match the platform-records time selector (RequestLogView / AuditLogView):
   keep the preset buttons and the custom from/to inputs on a single row
   whenever the surrounding container has room. Wrap to a second row only
   at the very narrow breakpoint (≤650px), which mirrors what
   `.time-tabs` does in the log views. The previous 1120px column break
   made the from/to inputs drop below the preset buttons even at desktop
   widths, which doesn't match the rest of the console. */
@media (max-width: 650px) {
  .range-group { width: 100%; overflow-x: auto; }
  .range-button { flex: 1 0 auto; }
  .filter-toolbar { align-items: flex-start; flex-direction: column; }
  .filter-selects { width: 100%; justify-content: flex-start; }
  .inline-filter { justify-content: space-between; }
}
</style>
