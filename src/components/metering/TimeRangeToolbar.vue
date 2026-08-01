<script setup lang="ts">
// Caller: MeteringCenterView.vue (replacing inline filter-toolbar at lines 374-412)
// Pure presentational — emits on user interaction, no data I/O

export interface TimeRange {
  key: string
  label: string
}

export interface FilterOption {
  value: string
  label: string
}

import { ref, watch } from 'vue'

defineProps<{
  ranges: TimeRange[]
  selectedRange: string
  agentOptions: FilterOption[]
  selectedAgent: string
  modelOptions: FilterOption[]
  selectedModel: string
  agentFilterLabel: string
  modelFilterLabel: string
  showCustom?: boolean
}>()

const emit = defineEmits<{
  'update:selectedRange': [value: string]
  'update:selectedAgent': [value: string]
  'update:selectedModel': [value: string]
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
      <label class="inline-filter">
        <span>{{ agentFilterLabel }}</span>
        <cds-select control-width="shrink">
          <select
            :value="selectedAgent"
            @change="emit('update:selectedAgent', ($event.target as HTMLSelectElement).value)"
          >
            <option v-for="opt in agentOptions" :key="opt.value" :value="opt.value">
              {{ opt.label }}
            </option>
          </select>
        </cds-select>
      </label>
      <label class="inline-filter">
        <span>{{ modelFilterLabel }}</span>
        <cds-select control-width="shrink">
          <select
            :value="selectedModel"
            @change="emit('update:selectedModel', ($event.target as HTMLSelectElement).value)"
          >
            <option v-for="opt in modelOptions" :key="opt.value" :value="opt.value">
              {{ opt.label }}
            </option>
          </select>
        </cds-select>
      </label>
    </div>
  </div>
</template>

<style scoped>
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
.inline-filter cds-select { width: 220px; font-weight: 400; }
@media (max-width: 1120px) {
  .filter-toolbar { align-items: flex-start; flex-direction: column; }
  .filter-selects { width: 100%; justify-content: flex-start; }
}
@media (max-width: 650px) {
  .range-group { width: 100%; overflow-x: auto; }
  .range-button { flex: 1 0 auto; }
  .filter-selects { align-items: stretch; flex-direction: column; }
  .inline-filter { justify-content: space-between; }
  .inline-filter cds-select { width: min(220px, 70vw); }
}
</style>
