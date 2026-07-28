<script setup lang="ts">
// Callers: MeteringCenterView.vue (platform tab KPI row), GatewaySpendPanel.vue (gateway tab KPI row)
// Pure presentational component — no data I/O, all data via props

export interface KpiCard {
  label: string
  value: string
  change?: {
    direction: 'up' | 'down' | 'neutral'
    text: string
  }
}

defineProps<{
  cards: KpiCard[]
}>()
</script>

<template>
  <div class="kpi-row">
    <cds-card v-for="card in cards" :key="card.label" class="kpi">
      <div class="card-content">
        <span class="kpi-label">{{ card.label }}</span>
        <strong class="kpi-value">{{ card.value }}</strong>
        <span
          v-if="card.change"
          class="kpi-change"
          :class="card.change.direction"
        >
          {{ card.change.text }}
        </span>
      </div>
    </cds-card>
  </div>
</template>

<style scoped>
.kpi-row {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 0.75rem;
  min-width: 0;
}
.kpi .card-content {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  min-width: 0;
  padding: 0.75rem 1rem;
}
.kpi-label {
  font-size: 0.75rem;
  color: var(--cds-global-typography-color-500, #666);
}
.kpi-value {
  font-size: 1.4rem;
  font-variant-numeric: tabular-nums;
}
.kpi-change {
  font-size: 0.7rem;
  font-weight: 600;
}
.kpi-change.up { color: var(--cds-alias-status-success, #1b8a4b); }
.kpi-change.down { color: var(--cds-alias-status-danger, #c92100); }
.kpi-change.neutral { color: var(--cds-global-typography-color-500, #888); }
@media (max-width: 900px) {
  .kpi-row { grid-template-columns: repeat(2, 1fr); }
}
</style>
