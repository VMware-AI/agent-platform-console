<script setup lang="ts">
import { computed, ref } from 'vue'
import { useQuery } from '@vue/apollo-composable'
import { useLocaleStore } from '@/stores/locale'
import { useToast } from '@/composables/useToast'
import { graphqlErrorMessage } from '@/api/graphql/errors'
import {
  SPEND_REPORT_QUERY,
  BUDGETS_QUERY,
  type SpendGroupBy,
  type SpendReportResult,
  type SpendReportVars,
  type BudgetsResult,
} from '@/api/graphql/queries/spend'
import '@/components/icons'

// Gateway-authoritative spend view (LLD-15). Data comes from the backend's
// fan-out over litellm's spend endpoints; this component never touches litellm.

const locale = useLocaleStore()
const toast = useToast()

const DIMENSIONS: { key: SpendGroupBy; label: string }[] = [
  { key: 'TEAM', label: 'metering.spend.dim.team' },
  { key: 'MODEL', label: 'metering.spend.dim.model' },
  { key: 'API_KEY', label: 'metering.spend.dim.key' },
]
const groupBy = ref<SpendGroupBy>('TEAM')

/* ---- time window (custom from/to; lifts the 3-range limit of the platform view) ---- */
function toLocalInput(d: Date): string {
  // datetime-local wants "YYYY-MM-DDTHH:mm" in local time.
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
function daysAgo(n: number): Date {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d
}
const fromLocal = ref(toLocalInput(daysAgo(7)))
const toLocal = ref(toLocalInput(new Date()))

function applyQuickRange(days: number) {
  fromLocal.value = toLocalInput(daysAgo(days))
  toLocal.value = toLocalInput(new Date())
}

// Backend Time scalar is RFC3339 — convert the local input to an ISO instant.
// Guard against a cleared/invalid field (new Date('').toISOString() throws) by
// falling back to the default window so the query variable stays valid.
function toIso(local: string, fallback: Date): string {
  const d = new Date(local)
  return Number.isNaN(d.getTime()) ? fallback.toISOString() : d.toISOString()
}
const isoFrom = computed(() => toIso(fromLocal.value, daysAgo(7)))
const isoTo = computed(() => toIso(toLocal.value, new Date()))

const variables = computed<SpendReportVars>(() => ({
  input: { from: isoFrom.value, to: isoTo.value, groupBy: groupBy.value },
}))

const { result, loading, error } = useQuery<SpendReportResult, SpendReportVars>(
  SPEND_REPORT_QUERY,
  variables,
  () => ({ fetchPolicy: 'cache-and-network' }),
)

const report = computed(() => result.value?.spendReport ?? null)
const rows = computed(() => report.value?.rows ?? [])
const totals = computed(() => report.value?.totals ?? null)
const byDay = computed(() => report.value?.byDay ?? [])
const failedGateways = computed(() => (report.value?.gateways ?? []).filter((g) => !g.ok))

/* ---- budgets (TEAM dimension only) ---- */
const { result: budgetsResult } = useQuery<BudgetsResult>(
  BUDGETS_QUERY,
  { scope: 'TEAMS' },
  () => ({ enabled: groupBy.value === 'TEAM', fetchPolicy: 'cache-and-network' }),
)
const budgets = computed(() => budgetsResult.value?.budgets ?? [])
const showBudgets = computed(() => groupBy.value === 'TEAM' && budgets.value.length > 0)

/* ---- formatting ---- */
function fmtCost(n: number): string {
  return `$${n.toFixed(2)}`
}
function fmtNum(n: number): string {
  return n.toLocaleString()
}
function fmtPct(n: number | null): string {
  return n == null ? '—' : `${n.toFixed(0)}%`
}

/* ---- cost trend SVG (byDay) ---- */
const CHART_W = 640
const CHART_H = 140
const PAD = 8
const trendPath = computed(() => {
  const pts = byDay.value
  if (pts.length === 0) return { line: '', area: '', max: 0 }
  const max = Math.max(...pts.map((p) => p.spend), 0.0001)
  const dx = pts.length > 1 ? (CHART_W - PAD * 2) / (pts.length - 1) : 0
  const y = (v: number) => CHART_H - PAD - (v / max) * (CHART_H - PAD * 2)
  const coords = pts.map((p, i) => `${PAD + i * dx},${y(p.spend)}`)
  const line = `M${coords.join(' L')}`
  const area = `${line} L${PAD + (pts.length - 1) * dx},${CHART_H - PAD} L${PAD},${CHART_H - PAD} Z`
  return { line, area, max }
})

/* ---- Top-N (rows already sorted by spend desc server-side) ---- */
const topRows = computed(() => rows.value.slice(0, 5))
const maxRowSpend = computed(() => (topRows.value[0]?.spend ?? 0) || 1)

/* ---- CSV export ---- */
function exportCsv() {
  if (rows.value.length === 0) {
    toast.info(locale.t('metering.spend.export.empty'))
    return
  }
  const header = ['key', 'label', 'spend', 'promptTokens', 'completionTokens', 'totalTokens', 'requests']
  const lines = [header.join(',')]
  for (const r of rows.value) {
    lines.push(
      [r.key, `"${r.label.replace(/"/g, '""')}"`, r.spend, r.promptTokens, r.completionTokens, r.totalTokens, r.requests].join(','),
    )
  }
  // UTF-8 BOM so Excel renders Chinese department/model labels correctly.
  const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `spend-${groupBy.value.toLowerCase()}-${fromLocal.value.slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}
</script>

<template>
  <div class="spend-panel">
    <!-- controls: dimension + time window -->
    <div class="controls">
      <div class="dim-group" role="group" :aria-label="locale.t('metering.spend.dimension')">
        <button
          v-for="d in DIMENSIONS"
          :key="d.key"
          type="button"
          class="dim-button"
          :class="{ active: groupBy === d.key }"
          :aria-pressed="groupBy === d.key"
          @click="groupBy = d.key"
        >
          {{ locale.t(d.label) }}
        </button>
      </div>

      <div class="time-controls">
        <label class="time-field">
          <span>{{ locale.t('metering.spend.from') }}</span>
          <input type="datetime-local" v-model="fromLocal" />
        </label>
        <label class="time-field">
          <span>{{ locale.t('metering.spend.to') }}</span>
          <input type="datetime-local" v-model="toLocal" />
        </label>
        <button type="button" class="quick" @click="applyQuickRange(7)">7d</button>
        <button type="button" class="quick" @click="applyQuickRange(30)">30d</button>
        <cds-button action="outline" size="sm" @click="exportCsv">
          <cds-icon shape="export" size="sm" aria-hidden="true"></cds-icon>
          {{ locale.t('metering.spend.export') }}
        </cds-button>
      </div>
    </div>

    <!-- partial-failure banner -->
    <cds-alert-group v-if="failedGateways.length > 0" status="warning" class="gw-banner">
      <cds-alert>
        {{ locale.t('metering.spend.partialFail').replace('{names}', failedGateways.map((g) => g.gatewayName).join(', ')) }}
      </cds-alert>
    </cds-alert-group>

    <div v-if="error" class="state-msg error">{{ graphqlErrorMessage(error, locale.t('metering.spend.loadFail')) }}</div>
    <div v-else-if="loading && !report" class="state-msg muted">{{ locale.t('metering.spend.loading') }}</div>

    <template v-else>
      <!-- KPI cards -->
      <div class="kpi-row">
        <cds-card class="kpi">
          <div class="card-content">
            <span class="kpi-label">{{ locale.t('metering.spend.totalCost') }}</span>
            <strong class="kpi-value">{{ fmtCost(totals?.spend ?? 0) }}</strong>
          </div>
        </cds-card>
        <cds-card class="kpi">
          <div class="card-content">
            <span class="kpi-label">{{ locale.t('metering.spend.totalTokens') }}</span>
            <strong class="kpi-value">{{ fmtNum(totals?.totalTokens ?? 0) }}</strong>
          </div>
        </cds-card>
        <cds-card class="kpi">
          <div class="card-content">
            <span class="kpi-label">{{ locale.t('metering.spend.promptTokens') }}</span>
            <strong class="kpi-value">{{ fmtNum(totals?.promptTokens ?? 0) }}</strong>
          </div>
        </cds-card>
        <cds-card class="kpi">
          <div class="card-content">
            <span class="kpi-label">{{ locale.t('metering.spend.completionTokens') }}</span>
            <strong class="kpi-value">{{ fmtNum(totals?.completionTokens ?? 0) }}</strong>
          </div>
        </cds-card>
      </div>

      <!-- cost trend -->
      <cds-card class="trend-card">
        <div class="card-content">
          <h2>{{ locale.t('metering.spend.trend') }}</h2>
          <svg v-if="byDay.length > 0" :viewBox="`0 0 ${CHART_W} ${CHART_H}`" class="trend-svg" preserveAspectRatio="none">
            <path :d="trendPath.area" class="trend-area" />
            <path :d="trendPath.line" class="trend-line" />
          </svg>
          <p v-else class="muted empty">{{ locale.t('metering.spend.noData') }}</p>
        </div>
      </cds-card>

      <!-- budget cards (TEAM only) -->
      <div v-if="showBudgets" class="budget-row">
        <cds-card v-for="b in budgets" :key="b.scope" class="budget-card">
          <div class="card-content">
            <span class="budget-label">{{ b.label }}</span>
            <div class="budget-bar">
              <div
                class="budget-fill"
                :class="{ over: (b.utilizationPct ?? 0) >= 90 }"
                :style="{ width: `${Math.min(b.utilizationPct ?? 0, 100)}%` }"
              ></div>
            </div>
            <div class="budget-meta">
              <span>{{ fmtCost(b.spend) }}{{ b.maxBudget != null ? ` / ${fmtCost(b.maxBudget)}` : '' }}</span>
              <span class="muted">{{ fmtPct(b.utilizationPct) }}</span>
            </div>
          </div>
        </cds-card>
      </div>

      <!-- Top-N + detail table -->
      <div class="tables">
        <cds-card class="rank-card">
          <div class="card-content">
            <h2>{{ locale.t('metering.spend.topSpend') }}</h2>
            <ul class="rank-list">
              <li v-for="r in topRows" :key="r.key">
                <span class="rank-label" :title="r.label">{{ r.label }}</span>
                <span class="rank-bar-wrap">
                  <span class="rank-bar" :style="{ width: `${(r.spend / maxRowSpend) * 100}%` }"></span>
                </span>
                <span class="rank-val">{{ fmtCost(r.spend) }}</span>
              </li>
              <li v-if="topRows.length === 0" class="muted">{{ locale.t('metering.spend.noData') }}</li>
            </ul>
          </div>
        </cds-card>

        <cds-card class="detail-card">
          <div class="card-content">
            <h2>{{ locale.t('metering.spend.detail') }}</h2>
            <div class="table-scroll">
              <table class="spend-table">
                <thead>
                  <tr>
                    <th>{{ locale.t('metering.spend.col.label') }}</th>
                    <th class="num">{{ locale.t('metering.spend.col.spend') }}</th>
                    <th class="num">{{ locale.t('metering.spend.col.total') }}</th>
                    <th class="num">{{ locale.t('metering.spend.col.prompt') }}</th>
                    <th class="num">{{ locale.t('metering.spend.col.completion') }}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="r in rows" :key="r.key">
                    <td :title="r.key">{{ r.label }}</td>
                    <td class="num">{{ fmtCost(r.spend) }}</td>
                    <td class="num">{{ fmtNum(r.totalTokens) }}</td>
                    <td class="num">{{ fmtNum(r.promptTokens) }}</td>
                    <td class="num">{{ fmtNum(r.completionTokens) }}</td>
                  </tr>
                  <tr v-if="rows.length === 0">
                    <td colspan="5" class="muted empty">{{ locale.t('metering.spend.noData') }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </cds-card>
      </div>
    </template>
  </div>
</template>

<style scoped>
.spend-panel {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}
.controls {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  align-items: center;
  justify-content: space-between;
}
.dim-group {
  display: inline-flex;
  border: 1px solid var(--cds-alias-object-interaction-border, #ccc);
  border-radius: 0.25rem;
  overflow: hidden;
}
.dim-button {
  padding: 0.35rem 0.9rem;
  background: transparent;
  border: none;
  cursor: pointer;
  font-size: 0.8rem;
}
.dim-button.active {
  background: var(--cds-alias-status-info, #0072a3);
  color: #fff;
}
.time-controls {
  display: inline-flex;
  gap: 0.5rem;
  align-items: flex-end;
  flex-wrap: wrap;
}
.time-field {
  display: flex;
  flex-direction: column;
  font-size: 0.7rem;
  gap: 0.15rem;
}
.time-field input {
  padding: 0.25rem 0.4rem;
}
.quick {
  padding: 0.35rem 0.6rem;
  cursor: pointer;
  border: 1px solid var(--cds-alias-object-interaction-border, #ccc);
  border-radius: 0.25rem;
  background: transparent;
  font-size: 0.75rem;
}
.gw-banner {
  margin: 0;
}
.kpi-row {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 0.75rem;
}
.kpi .card-content {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  padding: 0.75rem 1rem;
}
.kpi-label {
  font-size: 0.75rem;
  color: var(--cds-global-typography-color-500, #666);
}
.kpi-value {
  font-size: 1.4rem;
}
.trend-card .card-content {
  padding: 0.75rem 1rem;
}
.trend-svg {
  width: 100%;
  height: 140px;
}
.trend-area {
  fill: var(--cds-alias-status-info-tint, rgba(0, 114, 163, 0.15));
  stroke: none;
}
.trend-line {
  fill: none;
  stroke: var(--cds-alias-status-info, #0072a3);
  stroke-width: 2;
  vector-effect: non-scaling-stroke;
}
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
.budget-bar {
  height: 8px;
  border-radius: 4px;
  background: var(--cds-alias-object-interaction-background, #eee);
  overflow: hidden;
}
.budget-fill {
  height: 100%;
  background: var(--cds-alias-status-info, #0072a3);
}
.budget-fill.over {
  background: var(--cds-alias-status-danger, #e12200);
}
.budget-meta {
  display: flex;
  justify-content: space-between;
  font-size: 0.8rem;
}
.tables {
  display: grid;
  grid-template-columns: 1fr 1.6fr;
  gap: 0.75rem;
}
.rank-list {
  list-style: none;
  padding: 0;
  margin: 0.5rem 0 0;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.rank-list li {
  display: grid;
  grid-template-columns: 6rem 1fr 4rem;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.8rem;
}
.rank-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.rank-bar-wrap {
  background: var(--cds-alias-object-interaction-background, #eee);
  border-radius: 3px;
  height: 10px;
}
.rank-bar {
  display: block;
  height: 100%;
  background: var(--cds-alias-status-info, #0072a3);
  border-radius: 3px;
}
.rank-val {
  text-align: right;
}
.card-content h2 {
  font-size: 0.9rem;
  margin: 0;
}
.table-scroll {
  overflow-x: auto;
  margin-top: 0.5rem;
}
.spend-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.8rem;
}
.spend-table th,
.spend-table td {
  padding: 0.4rem 0.6rem;
  border-bottom: 1px solid var(--cds-alias-object-interaction-border, #eee);
  text-align: left;
}
.spend-table th.num,
.spend-table td.num {
  text-align: right;
  font-variant-numeric: tabular-nums;
}
.state-msg {
  padding: 1rem;
}
.state-msg.error {
  color: var(--cds-alias-status-danger, #e12200);
}
.muted {
  color: var(--cds-global-typography-color-500, #888);
}
.empty {
  text-align: center;
  padding: 1rem;
}
@media (max-width: 900px) {
  .kpi-row {
    grid-template-columns: repeat(2, 1fr);
  }
  .tables {
    grid-template-columns: 1fr;
  }
}
</style>
