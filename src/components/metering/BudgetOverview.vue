<script setup lang="ts">
// Callers: MeteringCenterView.vue (platform tab), GatewaySpendPanel.vue (gateway tab)
// Extracted from GatewaySpendPanel.vue lines 230-247 (budget-row)
// Pure presentational — all data via props, no I/O

export interface BudgetItem {
  label: string
  spend: number
  maxBudget: number | null
  utilizationPct: number | null
  formatCost: (v: number) => string
}

withDefaults(
  defineProps<{
    budgets: BudgetItem[]
    warningThreshold?: number
  }>(),
  { warningThreshold: 80 },
)

function pctText(pct: number | null): string {
  return pct != null ? `${Math.round(pct)}%` : '—'
}
</script>

<template>
  <div v-if="budgets.length > 0" class="budget-row">
    <cds-card v-for="b in budgets" :key="b.label" class="budget-card">
      <div class="card-content">
        <span class="budget-label">{{ b.label }}</span>
        <div class="budget-bar">
          <div
            class="budget-fill"
            :class="{ over: (b.utilizationPct ?? 0) >= warningThreshold }"
            :style="{ width: `${Math.min(b.utilizationPct ?? 0, 100)}%` }"
          ></div>
        </div>
        <div class="budget-meta">
          <span>{{ b.formatCost(b.spend) }}{{ b.maxBudget != null ? ` / ${b.formatCost(b.maxBudget)}` : '' }}</span>
          <span class="muted">{{ pctText(b.utilizationPct) }}</span>
        </div>
      </div>
    </cds-card>
  </div>
</template>

<style scoped>
.budget-row {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 0.75rem;
}
.budget-card .card-content {
  padding: 0.75rem 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}
.budget-label { font-size: 0.8rem; font-weight: 600; }
.budget-bar {
  height: 8px;
  border-radius: 4px;
  background: var(--cds-alias-object-interaction-background, #eee);
  overflow: hidden;
}
.budget-fill {
  height: 100%;
  background: var(--cds-alias-status-info, #0072a3);
  transition: width 0.3s ease;
}
.budget-fill.over { background: var(--cds-alias-status-danger, #e12200); }
.budget-meta {
  display: flex;
  justify-content: space-between;
  font-size: 0.8rem;
}
.muted { color: var(--cds-global-typography-color-500, #888); }
</style>
