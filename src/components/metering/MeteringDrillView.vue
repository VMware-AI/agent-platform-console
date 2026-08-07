<script setup lang="ts">
// Shared metering drill-down view. Rendered three times as a child of the
// metering route, with a different `mode` per route:
//   - mode='agent'  → 智能体详情 (rows = 该智能体用的所有模型)
//   - mode='model'  → 模型详情   (rows = 用了该模型的所有智能体)
//   - mode='pair'   → 组合详情   (no rows; single summary panel)
//
// Spec §4-§6 + §8 + §16: KPI cards, Ranking, Empty/Error states, breadcrumb
// back-navigation that returns to the previous list URL state. No chart click
// side-effects of its own — the back button + browser history are enough for
// the user's flow.

import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useQuery } from '@vue/apollo-composable'
import { useLocaleStore } from '@/stores/locale'
import {
  AGENTS_FOR_MODEL_QUERY,
  type AgentsForModelResult,
  type AgentsForModelVars,
  MODELS_FOR_AGENT_QUERY,
  type ModelsForAgentResult,
  type ModelsForAgentVars,
  AGENT_MODEL_USAGE_QUERY,
  type AgentModelUsageResult,
  type AgentModelUsageVars,
} from '@/api/graphql/queries/metering'
import MeteringEmptyState from '@/components/metering/MeteringEmptyState.vue'
import MeteringErrorState from '@/components/metering/MeteringErrorState.vue'
import { fmtNumber, fmtCompact } from '@/utils/meter-format'
import { useCurrencyDisplay } from '@/composables/useCurrencyDisplay'
import { useMeteringDrillState } from '@/composables/useMeteringDrillState'
import { graphqlErrorMessage } from '@/api/graphql/errors'

// Single shared component, parameterised by mode. The `mode` prop changes
// which query runs and which summary fields appear.
const props = withDefaults(
  defineProps<{
    mode: 'agent' | 'model' | 'pair'
    agentId?: string
    agentName?: string
    model?: string
    range: 'LAST_7_DAYS' | 'LAST_30_DAYS' | 'THIS_MONTH'
  }>(),
  { agentId: '', agentName: '', model: '' },
)

const router = useRouter()
const locale = useLocaleStore()
const drill = useMeteringDrillState()
const { formatCost } = useCurrencyDisplay()

const breadcrumb = computed(() => {
  const crumbs: Array<{ label: string; to: { name: string; query: Record<string, string> } }> = [
    { label: locale.t('metering.title'), to: { name: 'obs.metering', query: drillPathQuerySafe() } },
  ]
  if (props.mode === 'agent' || props.mode === 'pair') {
    crumbs.push({
      label: props.agentName || props.agentId || '?',
      to: { name: 'obs.metering.drill', query: drillPathQuerySafe() },
    })
  }
  if (props.mode === 'model' || props.mode === 'pair') {
    crumbs.push({
      label: props.model || '?',
      to: { name: 'obs.metering.drill', query: drillPathQuerySafe() },
    })
  }
  return crumbs
})

function drillPathQuerySafe() {
  // Re-serialise the drill state into raw query pairs so the breadcrumb /
  // back link lands the user on the previous URL with all params intact.
  const s = drill.state.value
  const out: Record<string, string> = {}
  if (s.source && s.source !== 'platform') out.source = s.source
  if (s.range && s.range !== 'LAST_7_DAYS') out.range = s.range
  if (s.dimension && s.dimension !== 'agent') out.dimension = s.dimension
  return out
}

// ---------- data per mode ----------
// useQuery doesn't accept a Variables-typed Ref<null>; the Apollo composable
// requires a concrete vars object (an empty `{ range }` is a valid no-op). We
// gate via `enabled: false` so the unused query's network isn't wasted.
const modelsVars = computed<ModelsForAgentVars>(() => ({
  agentId: props.mode === 'agent' ? props.agentId : '',
  range: props.range,
}))
const modelsRes = useQuery<ModelsForAgentResult, ModelsForAgentVars>(
  MODELS_FOR_AGENT_QUERY,
  modelsVars,
  () => ({ enabled: props.mode === 'agent' && !!props.agentId, fetchPolicy: 'cache-and-network' }),
)

const agentsVars = computed<AgentsForModelVars>(() => ({
  model: props.mode === 'model' ? props.model : '',
  range: props.range,
}))
const agentsRes = useQuery<AgentsForModelResult, AgentsForModelVars>(
  AGENTS_FOR_MODEL_QUERY,
  agentsVars,
  () => ({ enabled: props.mode === 'model' && !!props.model, fetchPolicy: 'cache-and-network' }),
)

const pairVars = computed<AgentModelUsageVars>(() => ({
  agentId: props.mode === 'pair' ? props.agentId : '',
  model: props.mode === 'pair' ? props.model : '',
  range: props.range,
}))
const pairRes = useQuery<AgentModelUsageResult, AgentModelUsageVars>(
  AGENT_MODEL_USAGE_QUERY,
  pairVars,
  () => ({
    enabled: props.mode === 'pair' && !!props.agentId && !!props.model,
    fetchPolicy: 'cache-and-network',
  }),
)

// Pick the active result based on mode so the template stays DRY.
const active = computed(() => {
  if (props.mode === 'agent') return modelsRes
  if (props.mode === 'model') return agentsRes
  return pairRes
})

interface DrillRow {
  /** Display label shown on-screen — truncated by the rank component. */
  label: string
  /** Stable identifier used for navigation (model name or agent ID). */
  id: string
  cost: number
  totalTokens: number
  inputTokens: number
  outputTokens: number
  requests: number
}

const rows = computed<DrillRow[]>(() => {
  if (props.mode === 'agent') {
    const data = modelsRes.result.value?.modelsForAgent ?? []
    return data.map((m) => ({
      label: m.model,
      id: m.model,
      cost: m.cost,
      totalTokens: m.totalTokens,
      inputTokens: m.inputTokens,
      outputTokens: m.outputTokens,
      requests: m.requests,
    }))
  }
  if (props.mode === 'model') {
    const data = agentsRes.result.value?.agentsForModel ?? []
    return data.map((a) => ({
      label: a.agentName || a.agentId,
      id: a.agentId,
      cost: a.cost,
      totalTokens: a.totalTokens,
      inputTokens: a.inputTokens,
      outputTokens: a.outputTokens,
      requests: a.requests,
    }))
  }
  const pair = pairRes.result.value?.agentModelUsage
  if (!pair) return []
  return [{
    label: props.model ?? '?',
    id: props.model ?? '?',
    cost: pair.cost,
    totalTokens: pair.totalTokens,
    inputTokens: pair.inputTokens,
    outputTokens: pair.outputTokens,
    requests: pair.requests,
  }]
})

const pairSummary = computed(() => pairRes.result.value?.agentModelUsage ?? null)

const isLoading = computed(() => active.value.loading.value)
const hasError = computed(() => Boolean(active.value.error.value))
const errorMessage = computed(() =>
  active.value.error.value ? graphqlErrorMessage(active.value.error.value, locale.t('metering.error.title')) : '',
)

function back() {
  // Spec §8 rule 6: "返回上一级后恢复原来的日期、分页、搜索和排序条件". This
  // uses router.back() so the browser history is honoured, not a hardcoded
  // route (which would lose filter state).
  if (window.history.length > 1) router.back()
  else router.replace({ name: 'obs.metering', query: drillPathQuerySafe() })
}

function gotoPeer(name: string) {
  if (props.mode === 'agent') {
    void router.push({
      name: 'obs.metering.pair',
      query: { ...drillPathQuerySafe(), agentId: props.agentId, model: name },
    })
  } else if (props.mode === 'model') {
    void router.push({
      name: 'obs.metering.pair',
      query: { ...drillPathQuerySafe(), agentId: name, model: props.model },
    })
  }
}

const titleText = computed(() => {
  const agent = props.agentName || props.agentId
  const model = props.model
  if (props.mode === 'agent') return agent
  if (props.mode === 'model') return model
  return `${agent} × ${model}`
})

// KPI derivations — agent/model mode folds the per-row totals into a single
// set of KPI cards, just like the main page. Pair mode reads the single
// pair summary row directly. Both shapes produce consistent numbers.
const topCost = computed(() =>
  props.mode === 'pair' ? (pairSummary.value?.cost ?? 0) : rows.value.reduce((s, r) => s + r.cost, 0),
)
const topTokens = computed(() =>
  props.mode === 'pair' ? (pairSummary.value?.totalTokens ?? 0) : rows.value.reduce((s, r) => s + r.totalTokens, 0),
)
const topInput = computed(() =>
  props.mode === 'pair' ? (pairSummary.value?.inputTokens ?? 0) : rows.value.reduce((s, r) => s + r.inputTokens, 0),
)
const topOutput = computed(() =>
  props.mode === 'pair' ? (pairSummary.value?.outputTokens ?? 0) : rows.value.reduce((s, r) => s + r.outputTokens, 0),
)

const leader = computed(() => Math.max(1, ...rows.value.map((r) => r.totalTokens)))
function barWidth(value: number): number {
  return Math.min(100, Math.max(0, Math.round((value / leader.value) * 100)))
}

const emptyTitle = computed(() => {
  if (props.mode === 'agent') return '该智能体暂无模型调用记录'
  if (props.mode === 'model') return '当前时间范围内没有智能体调用该模型'
  return '当前智能体与模型组合暂无计量记录'
})
</script>

<template>
  <section class="metering-drill">
    <!-- breadcrumb always available so a card-level error doesn't trap the user -->
    <nav class="crumb" aria-label="breadcrumb">
      <span v-for="(c, i) in breadcrumb" :key="i" class="crumb-item">
        <router-link v-if="i < breadcrumb.length - 1" :to="c.to">{{ c.label }}</router-link>
        <span v-else>{{ c.label }}</span>
        <span v-if="i < breadcrumb.length - 1" class="sep">/</span>
      </span>
    </nav>

    <header class="drill-head">
      <h1 class="drill-title">{{ titleText }}</h1>
      <button type="button" class="back-btn" @click="back">← 返回</button>
    </header>

    <MeteringErrorState
      v-if="hasError"
      :title="locale.t('metering.error.title')"
      :description="errorMessage"
      class="drill-state"
      @retry="() => active.refetch()"
    />
    <template v-else-if="isLoading && rows.length === 0">
      <div class="drill-state muted">{{ locale.t('metering.spend.loading') }}</div>
    </template>
    <template v-else>
      <!-- KPI strip — agent + model use 4 shared cards; pair reuses the same
           cards plus the single pair summary card so the user always sees
           something, even with zero usage. -->
      <div class="kpi-strip">
        <cds-card class="kpi">
          <div class="kpi-content">
            <span class="kpi-label">{{ locale.t('metering.spend.totalCost') }}</span>
            <strong class="kpi-value">{{ formatCost(topCost, locale.locale) }}</strong>
          </div>
        </cds-card>
        <cds-card class="kpi">
          <div class="kpi-content">
            <span class="kpi-label">{{ locale.t('metering.spend.totalTokens') }}</span>
            <strong class="kpi-value">{{ fmtNumber(topTokens, locale.locale) }}</strong>
          </div>
        </cds-card>
        <cds-card class="kpi">
          <div class="kpi-content">
            <span class="kpi-label">{{ locale.t('metering.token.input') }}</span>
            <strong class="kpi-value">{{ fmtNumber(topInput, locale.locale) }}</strong>
          </div>
        </cds-card>
        <cds-card class="kpi">
          <div class="kpi-content">
            <span class="kpi-label">{{ locale.t('metering.token.output') }}</span>
            <strong class="kpi-value">{{ fmtNumber(topOutput, locale.locale) }}</strong>
          </div>
        </cds-card>
      </div>

      <!-- Agent+Model stats: which side had top values. In 'pair' mode both
           values are the same — show nothing extra here, the title + pair
           summary card carry the meaning. -->
      <div v-if="mode !== 'pair'" class="rank-host">
        <header class="rank-head">
          <h2>
            {{ mode === 'agent'
              ? locale.t('metering.chart.modelRanking')
              : locale.t('metering.table.agentTitle') }}
          </h2>
          <span class="rank-sub">{{ fmtNumber(rows.length, locale.locale) }}</span>
        </header>
        <ul class="rank-list">
          <li v-for="r in rows" :key="r.id" class="rank-row">
            <button type="button" class="rank-btn" @click="gotoPeer(r.id)">
              <span class="rank-label" :title="r.label">{{ r.label }}</span>
              <span class="rank-bar-rail">
                <span
                  class="rank-bar-fill"
                  :style="{ width: barWidth(r.totalTokens) + '%' }"
                ></span>
              </span>
              <span class="rank-meta">{{ fmtCompact(r.totalTokens, locale.locale) }} · {{ formatCost(r.cost, locale.locale) }}</span>
            </button>
          </li>
        </ul>
        <MeteringEmptyState
          v-if="rows.length === 0"
          :title="emptyTitle"
          :show-action="false"
          compact
        />
      </div>

      <!-- Pair mode: single summary card, no list. Surfaces the explicit
           pair totals so the user has a number to glance at beyond the
           generic KPI strip. -->
      <div v-if="mode === 'pair' && pairSummary" class="pair-summary">
        <cds-card class="card">
          <div class="kpi-content">
            <span class="kpi-label">{{ locale.t('metering.spend.completionTokens') }}</span>
            <strong class="kpi-value">
              {{ fmtNumber(pairSummary.totalTokens, locale.locale) }}
            </strong>
            <span class="kpi-sub">{{ fmtNumber(pairSummary.requests, locale.locale) }} 次调用</span>
          </div>
        </cds-card>
      </div>
    </template>
  </section>
</template>

<style scoped>
.metering-drill {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 20px 24px 32px;
  color: var(--cds-alias-object-app-foreground, #1d2939);
}
.crumb {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--cds-alias-typography-color-300, #667085);
  flex-wrap: wrap;
}
.crumb-item a {
  color: var(--cds-alias-status-info, #0072a3);
  text-decoration: none;
}
.crumb-item a:hover {
  text-decoration: underline;
}
.crumb-item .sep {
  margin: 0 6px;
  opacity: 0.5;
}
.drill-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.drill-title {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
  color: var(--cds-alias-object-app-foreground, #1d2939);
}
.back-btn {
  padding: 6px 12px;
  border: 1px solid var(--cds-alias-object-interaction-border, #d0d5dd);
  border-radius: 6px;
  background: var(--cds-alias-object-container-background, #fff);
  font-size: 12px;
  cursor: pointer;
  color: var(--cds-alias-object-app-foreground, #1d2939);
}
.back-btn:hover {
  border-color: var(--cds-alias-status-info, #0072a3);
}
.kpi-strip {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 16px;
}
.kpi-content {
  padding: 16px 18px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.kpi-label {
  font-size: 12px;
  color: var(--cds-alias-typography-color-300, #667085);
}
.kpi-value {
  font-size: 22px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  color: var(--cds-alias-object-app-foreground, #1d2939);
}
.kpi-sub {
  font-size: 11px;
  color: var(--cds-alias-typography-color-300, #667085);
}
.rank-host {
  background: var(--cds-alias-object-container-background, #fff);
  border: 1px solid #e4e7ec;
  border-radius: 8px;
  padding: 16px 18px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.rank-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
}
.rank-head h2 {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
}
.rank-sub {
  font-size: 12px;
  color: var(--cds-alias-typography-color-300, #667085);
  font-variant-numeric: tabular-nums;
}
.rank-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.rank-btn {
  display: grid;
  grid-template-columns: 1fr 96px 110px;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 6px 8px;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 4px;
  cursor: pointer;
  font: inherit;
  font-size: 12px;
  color: var(--cds-alias-object-app-foreground, #1d2939);
  text-align: left;
}
.rank-btn:hover {
  background: var(--cds-alias-object-app-background, #f5f7fa);
  border-color: var(--cds-alias-object-border-color, #e4e7ec);
}
.rank-btn:focus-visible {
  outline: 2px solid var(--cds-alias-status-info, #0072a3);
  outline-offset: 2px;
}
.rank-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.rank-bar-rail {
  display: block;
  height: 8px;
  background: var(--cds-alias-object-app-background, #f5f7fa);
  border-radius: 4px;
  overflow: hidden;
}
.rank-bar-fill {
  display: block;
  height: 100%;
  background: var(--chart-color-input, #4b76bd);
}
.rank-meta {
  font-variant-numeric: tabular-nums;
  text-align: right;
  color: var(--cds-alias-typography-color-300, #667085);
}
.pair-summary {
  margin-top: 4px;
}
.drill-state {
  padding: 1.5rem 0;
}
@media (max-width: 1200px) {
  .kpi-strip { grid-template-columns: repeat(2, 1fr); }
}
</style>
