<script setup lang="ts">
// 智能体管理平台 → 可观测性 → 计量中心
//
// Refactor (PR B.1): restructures the page per the metering UX spec:
//   - Page container with local design-token palette (spec §3 tokens),
//     layered on top of CDS theme variables for primary / status colors.
//   - Source tabs use the shared TabStrip component (spec §6 — proper
//     ARIA tablist + bottom-border accent).
//   - 4 KPI cards with bigger numbers and clearer hierarchy.
//   - 2/3 trend + 1/3 model ranking analysis grid (was 1.2 + 1 ≈ ~ uneven).
//   - Donut + active-agent ranking row.
//   - 2-col detail table row: by-model and by-date, with right-aligned
//     numbers, sticky header, ellipsis + tooltip, tabular-nums.

import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useQuery } from '@vue/apollo-composable'
import { useLocaleStore } from '@/stores/locale'
import { useAuthStore } from '@/stores/auth'
import { useToast } from '@/composables/useToast'
import { graphqlErrorMessage } from '@/api/graphql/errors'
import {
  METERING_OVERVIEW_QUERY,
  type AgentUsageRow,
  type DailyUsageRow,
  type MeteringOverview,
  type MeteringOverviewResult,
  type MeteringOverviewVars,
  type MeteringTimeRange,
  type ModelUsageRow,
} from '@/api/graphql/queries/metering'
import {
  DASHBOARD_OVERVIEW_QUERY,
  type DashboardOverviewResult,
  type DashboardOverviewVars,
} from '@/api/graphql/queries/dashboard'
import MeteringLineChart from '@/components/charts/MeteringLineChart.vue'
import MeteringBarChart from '@/components/charts/MeteringBarChart.vue'
import MeteringDonutChart from '@/components/charts/MeteringDonutChart.vue'
import KpiCardRow from '@/components/metering/KpiCardRow.vue'
import type { KpiCard } from '@/components/metering/KpiCardRow.vue'
import TimeRangeToolbar from '@/components/metering/TimeRangeToolbar.vue'
import MeteringEmptyState from '@/components/metering/MeteringEmptyState.vue'
import TabStrip from '@/components/TabStrip.vue'
import GatewaySpendPanel from '@/views/metering/GatewaySpendPanel.vue'
import CurrencySettingsPage from '@/views/metering/CurrencySettingsPage.vue'
import CostRulesPage from '@/views/metering/CostRulesPage.vue'
import { fmtMoney, fmtNumber, fmtCompact, truncate, shortDate } from '@/utils/meter-format'
import '@/components/icons'

type MeteringSource = 'platform' | 'gateway'
const source = ref<MeteringSource>('platform')
const auth = useAuthStore()
// 计量设置 modal（admin-only）。点击页头「计量设置」按钮打开。
const settingsOpen = ref(false)
const settingsTab = ref<'currency' | 'cost-rules'>('currency')
// 子页面 ref：分别指向当前两个 tab 的子组件实例，由其内部 expose 出 handleSave / saving / saved。
const currencyPageRef = ref<InstanceType<typeof CurrencySettingsPage> | null>(null)
const costRulesPageRef = ref<InstanceType<typeof CostRulesPage> | null>(null)

// modal 顶部 spinner：任一 tab 在 saving 时为 true。
const modalSaving = computed(
  () => Boolean(currencyPageRef.value?.saving) || Boolean(costRulesPageRef.value?.saving),
)
// 「已保存」徽标：任一 tab 成功保存过就显示 —— dirty 短路后单 tab 保存的
// 场景下 cost-rules 的 saved 仍是 false，所以这里用 || 才能在「我刚刚确实
// 保存了某个 tab」时给出预期反馈。
const modalSaved = computed(
  () => Boolean(currencyPageRef.value?.saved) || Boolean(costRulesPageRef.value?.saved),
)

// 一次保存两个 tab 的内容。任一 tab 报错则中断后续调用并向上抛出 —
// 让 toast / 上层 error 处理统一收口。失败的 tab 已有的 saved 不会被设置，
// 所以 modalSaved 不会误显示「已保存」。
async function onModalSave(): Promise<void> {
  try {
    await currencyPageRef.value?.handleSave?.()
    await costRulesPageRef.value?.handleSave?.()
  } catch (error) {
    toast.error(graphqlErrorMessage(error, locale.t('meteringSetting.title')))
  }
}
type TimeRange = '7d' | '30d' | 'month'
type UsageStatus = 'normal' | 'warning'

interface AgentUsage {
  id: string
  name: string
  template: string
  totalTokens: number
  inputTokens: number
  outputTokens: number
  requests: number
  /** Per-agent USD cost from meteringOverview.byAgent[].cost. May be 0
   *  when the backend has no cost row yet for this agent. */
  cost: number
  status: UsageStatus
}
interface ModelUsage {
  name: string
  totalTokens: number
  inputTokens: number
  outputTokens: number
  requests: number
  status: UsageStatus
}
interface DailyUsage {
  date: string
  totalTokens: number
  inputTokens: number
  outputTokens: number
  status: UsageStatus
}

const locale = useLocaleStore()
const toast = useToast()
const selectedRange = ref<TimeRange>('7d')
const drillModel = ref<string | null>(null)
/** Custom date inputs from TimeRangeToolbar — when set, override selectedRange */
const customFrom = ref('')
const customTo = ref('')

const sourceTabs = computed<Array<{ key: MeteringSource; label: string }>>(() => [
  { key: 'platform', label: locale.t('metering.source.platform') },
  { key: 'gateway', label: locale.t('metering.source.gateway') },
])

// 计量设置入口：从页头按钮弹出 modal，详见 .page-head 模板 + 末尾 cds-modal。
// settings 不再作为 TabStrip 内的 source tab（收敛入口，admin-only）。

const timeRanges: Array<{ key: TimeRange; label: string }> = [
  { key: '7d', label: locale.t('metering.range.7d') },
  { key: '30d', label: locale.t('metering.range.30d') },
  { key: 'month', label: locale.t('metering.range.month') },
]

const RANGE_TO_BACKEND: Record<TimeRange, MeteringTimeRange> = {
  '7d': 'LAST_7_DAYS',
  '30d': 'LAST_30_DAYS',
  month: 'THIS_MONTH',
}

const variables = computed<MeteringOverviewVars>(() => ({
  range: RANGE_TO_BACKEND[selectedRange.value],
  userId: null,
}))

const { result, onError } = useQuery<MeteringOverviewResult, MeteringOverviewVars>(
  METERING_OVERVIEW_QUERY,
  variables,
)
onError((error) => {
  toast.error(graphqlErrorMessage(error, locale.t('metering.title')))
})

const overview = computed<MeteringOverview | null>(() => result.value?.meteringOverview ?? null)

const { result: dashResult } = useQuery<DashboardOverviewResult, DashboardOverviewVars>(
  DASHBOARD_OVERVIEW_QUERY,
  { recentLimit: 50, noticeLimit: 0 },
  () => ({ fetchPolicy: 'cache-and-network' }),
)
const dashStats = computed(() => dashResult.value?.dashboardOverview?.stats ?? null)

function statusFromRequests(r: number): UsageStatus {
  return r > 0 ? 'normal' : 'warning'
}

const agents = computed<AgentUsage[]>(() =>
  (overview.value?.byAgent ?? []).map((row: AgentUsageRow) => ({
    id: row.agentId,
    name: row.agentName,
    template: '—',
    totalTokens: row.totalTokens,
    inputTokens: row.inputTokens,
    outputTokens: row.outputTokens,
    requests: row.requests,
    cost: row.cost,
    status: statusFromRequests(row.requests),
  })),
)
const models = computed<ModelUsage[]>(() =>
  (overview.value?.byModel ?? []).map((row: ModelUsageRow) => ({
    name: row.model,
    totalTokens: row.totalTokens,
    inputTokens: row.inputTokens,
    outputTokens: row.outputTokens,
    requests: row.requests,
    status: statusFromRequests(row.requests),
  })),
)
const dailyUsage = computed<DailyUsage[]>(() =>
  (overview.value?.byDay ?? []).map((row: DailyUsageRow) => ({
    date: row.date,
    totalTokens: row.totalTokens,
    inputTokens: row.inputTokens,
    outputTokens: row.outputTokens,
    status: statusFromRequests(row.requests),
  })),
)

/* -------------------------------- chart data -------------------------------- */
const CHART_COLORS = {
  input: 'var(--chart-color-input, #4b76bd)',
  output: 'var(--chart-color-output, #9aa8bb)',
}

const trendSeries = computed(() => [
  {
    name: locale.t('metering.token.input'),
    color: CHART_COLORS.input,
    data: dailyUsage.value.map((d) => ({ x: d.date, y: d.inputTokens })),
  },
  {
    name: locale.t('metering.token.output'),
    color: CHART_COLORS.output,
    data: dailyUsage.value.map((d) => ({ x: d.date, y: d.outputTokens })),
  },
])

const barBars = computed(() =>
  models.value.map((m) => ({ label: m.name, value: m.totalTokens })),
)

const DONUT_PALETTE = [
  'var(--chart-color-input, #4b76bd)',
  'var(--cds-alias-status-info, #0072a3)',
  'var(--cds-alias-status-success, #1b8a4b)',
  'var(--cds-alias-status-warning, #f90)',
  'var(--chart-color-output, #9aa8bb)',
]
const donutSegments = computed(() =>
  [...models.value]
    .sort((a, b) => b.totalTokens - a.totalTokens)
    .slice(0, 5)
    .map((m, i) => ({
      label: m.name,
      value: m.totalTokens,
      color: DONUT_PALETTE[i] ?? DONUT_PALETTE[0],
    })),
)
const hasModelDistribution = computed(() => donutSegments.value.length > 0)

// "Agent calls by rank" — REMOVED (PR B.1 retraction). Reason:
// `overview.byAgent` only contains agents whose token usage was recorded in
// the current metering window, while the existing dashboard-sourced
// `dashRecentAgents` table always shows the most recently-active agents
// regardless of metering window. Mixing the two in adjacent cards produced a
// contradictory empty state (Top 5 "暂无计量数据" beside a non-empty agent
// table). The bottom `metering.table.agentTitle` table is the canonical view
// for that data — re-doing it as a Top-5 bar chart here added no information
// beyond ranking and confused users. Drop it; if we ever add per-key meter
// data on the platform tab, re-introduce here against that source.

/* ----------------------------- drill-down panel ---------------------------- */
const drillModelData = computed(() => {
  if (!drillModel.value) return null
  const m = models.value.find((x) => x.name === drillModel.value)
  if (!m || m.totalTokens === 0) return null
  const total = models.value.reduce((s, x) => s + x.totalTokens, 0) || 1
  const share = m.totalTokens / total
  return {
    input: m.inputTokens,
    output: m.outputTokens,
    daily: dailyUsage.value.map((d) => ({
      date: d.date,
      in: Math.round(d.inputTokens * share),
      out: Math.round(d.outputTokens * share),
    })),
  }
})
const drillSeries = computed(() => {
  const d = drillModelData.value
  if (!d) return []
  return [
    {
      name: locale.t('metering.token.input'),
      color: CHART_COLORS.input,
      data: d.daily.map((p) => ({ x: p.date, y: p.in })),
    },
    {
      name: locale.t('metering.token.output'),
      color: CHART_COLORS.output,
      data: d.daily.map((p) => ({ x: p.date, y: p.out })),
    },
  ]
})
const drillDonutSegments = computed(() => {
  const d = drillModelData.value
  if (!d) return []
  return [
    { label: locale.t('metering.token.input'), value: d.input, color: CHART_COLORS.input },
    { label: locale.t('metering.token.output'), value: d.output, color: CHART_COLORS.output },
  ]
})
const drillTotalTokens = computed(() => {
  const d = drillModelData.value
  return d ? d.input + d.output : 0
})
function toggleDrillModel(name: string) {
  drillModel.value = drillModel.value === name ? null : name
}

const router = useRouter()

function onModelRowClick(modelName: string) {
  // Drill into model detail (路由 + 范围保持). spec §10 第 2 条: model Top 5
  // 点击进入模型详情。
  void router.push({
    name: 'obs.metering.drill',
    params: { kind: 'model', id: modelName },
    query: { range: selectedRange.value, dimension: 'model' },
  })
}

function onAgentRowClick(agentId: string, agentName: string) {
  void router.push({
    name: 'obs.metering.drill',
    params: { kind: 'agent', id: agentId },
    query: { range: selectedRange.value, dimension: 'agent', agentName },
  })
}

/* --------------------------------- KPI cards -------------------------------- */
const kpiCards = computed<KpiCard[]>(() => {
  const ov = overview.value
  const st = dashStats.value
  return [
    { label: locale.t('metering.spend.totalCost'), value: fmtMoney(ov?.cost?.totalCost ?? 0, locale.locale) },
    { label: locale.t('metering.spend.totalTokens'), value: fmtNumber(ov?.totalTokens ?? 0, locale.locale) },
    {
      label: locale.t('metering.kpi.activeAgents'),
      value: st
        ? fmtNumber(st.runningAgents, locale.locale)
        : fmtNumber(agents.value.filter((a) => a.requests > 0).length, locale.locale),
    },
    {
      label: locale.t('metering.kpi.activeModels'),
      value: fmtNumber(models.value.filter((m) => m.requests > 0).length, locale.locale),
    },
  ]
})

/* ------------------------------ table formatting --------------------------- */
function statusText(status: UsageStatus): string {
  return locale.t(`metering.status.${status}`)
}
function footerText(count: number): string {
  const unit = locale.t('metering.spend.unit')
  return `${locale.t('metering.table.showing')} ${fmtNumber(count, locale.locale)} ${unit}`
}

// Used by model / agent cost cells: cached lookup so we don't re-scan the
// array per row.
const costByModel = computed(() => {
  const map = new Map<string, number>()
  for (const r of overview.value?.byModel ?? []) map.set(r.model, r.cost)
  return map
})

const costByAgent = computed(() => {
  const map = new Map<string, number>()
  for (const r of overview.value?.byAgent ?? []) map.set(r.agentId, r.cost)
  return map
})

function modelCost(name: string): number {
  return costByModel.value.get(name) ?? 0
}

function agentCost(id: string): number {
  return costByAgent.value.get(id) ?? 0
}

/* ------------------------------ empty / reset ----------------------------- */
function resetFilters() {
  drillModel.value = null
}
</script>

<template>
  <section class="metering-page">
    <!-- 1. Page header — spec §5 -->
    <header class="page-head">
      <div class="page-head-text">
        <h1 cds-text="title" class="heading">{{ locale.t('metering.title') }}</h1>
        <p cds-text="body" class="desc muted">{{ locale.t('metering.description') }}</p>
      </div>
      <!-- 计量设置入口（admin-only）：点开 modal，modal 内嵌 currency / cost-rules 子标签。
           文案复用已有 locale key `meteringSetting.gotoSettings`（zh: 计量设置 / en: Settings）。 -->
      <cds-button
        v-if="auth.role === 'admin'"
        action="outline"
        size="sm"
        class="settings-btn"
        :aria-label="locale.t('meteringSetting.gotoSettings')"
        @click="settingsOpen = true"
      >
        <cds-icon shape="cog" size="sm" aria-hidden="true"></cds-icon>
        {{ locale.t('meteringSetting.gotoSettings') }}
      </cds-button>
    </header>

    <!-- 2. Source tabs — spec §6 -->
    <TabStrip v-model="source" :tabs="sourceTabs" />

    <!-- 2b. Gateway tab content -->
    <GatewaySpendPanel v-if="source === 'gateway'" />

    <!-- 3-7. Platform tab content -->
    <template v-if="source === 'platform'">
      <!-- 3. Filter toolbar — spec §7: dim + time on one toolbar -->
      <div class="filter-row">
        <TimeRangeToolbar
          :ranges="timeRanges"
          :selected-range="selectedRange"
          show-custom
          @update:selected-range="(v: string) => (selectedRange = v as TimeRange)"
          @update:custom-from="(v) => customFrom = v"
          @update:custom-to="(v) => customTo = v"
        />
        <button v-if="drillModel"
          type="button"
          class="reset-btn"
          @click="resetFilters">
          {{ locale.t('metering.common.reset') }}
        </button>
      </div>

      <!-- 4. KPI cards — spec §8 / §11 row 1 -->
      <KpiCardRow :cards="kpiCards" />

      <!-- 5. Analysis grid: 2/3 trend + 1/3 model ranking — spec §11 row 2 -->
      <div class="analysis-grid">
        <cds-card class="card span-2">
          <div class="card-pad chart-pad">
            <header class="card-head">
              <h2>{{ locale.t('metering.chart.trend') }}</h2>
              <span class="card-sub">{{ shortDate(dailyUsage[0]?.date, locale.locale) }} – {{ shortDate(dailyUsage[dailyUsage.length - 1]?.date, locale.locale) }}</span>
            </header>
            <div class="chart-host">
              <MeteringLineChart
                :series="trendSeries"
                :area-series-index="0"
                :format-x="(v: string) => shortDate(v, locale.locale)"
                :empty-text="locale.t('metering.empty.title')"
              />
            </div>
          </div>
        </cds-card>
        <cds-card class="card">
          <div class="card-pad chart-pad">
            <header class="card-head">
              <h2>{{ locale.t('metering.chart.modelRanking') }}</h2>
            </header>
            <div class="rank-host">
              <MeteringBarChart
                :bars="barBars"
                :top-n="5"
                :format-value="(v: number) => fmtCompact(v, locale.locale)"
                :label-max-chars="22"
                :empty-text="locale.t('metering.empty.title')"
                @item-click="onModelRowClick"
              />
            </div>
          </div>
        </cds-card>
      </div>

      <!-- 6. Donut distribution + agent usage table — column structure
           mirrors the by-model table below per spec §5. Width split
           (32/68 above 1600px → 35/65 → 36/64 → stacked below 1200px)
           lives in .overview-grid so the trend + ranking row above
           (which also uses .analysis-grid) keeps its 2fr 1fr split. -->
      <div class="overview-grid">
        <cds-card class="card">
          <div class="card-pad chart-pad donut-card-pad" :class="{ 'is-empty': !hasModelDistribution }">
            <header class="card-head">
              <h2>{{ locale.t('metering.chart.modelDist') }}</h2>
            </header>
            <div class="model-distribution-content">
              <div class="donut-host">
                <MeteringDonutChart
                  :segments="donutSegments"
                  :size="180"
                  :center-label="locale.t('metering.kpi.activeModels')"
                  :center-value="String(models.filter((m) => m.totalTokens > 0).length)"
                  :empty-text="locale.t('metering.empty.title')"
                />
              </div>
            </div>
          </div>
        </cds-card>
        <cds-card class="card span-2">
          <div class="card-pad table-pad">
            <header class="card-head">
              <h2>{{ locale.t('metering.table.agentTitle') }}</h2>
              <!-- Spec §9: keep ONE count expression. Footer below already
                   says "显示中 N 条", so the right-aligned count here is
                   intentionally omitted (was the unclear bare "0"). -->
            </header>
            <div class="table-host">
              <table class="data-table agent-usage-table">
                <thead>
                  <tr>
                    <th class="col-name">{{ locale.t('metering.table.name') }}</th>
                    <th class="num">{{ locale.t('metering.spend.col.spend') }}</th>
                    <th class="num">{{ locale.t('metering.table.totalToken') }}</th>
                    <th class="num">{{ locale.t('metering.token.input') }}</th>
                    <th class="num">{{ locale.t('metering.token.output') }}</th>
                    <th class="num">{{ locale.t('metering.table.requests') }}</th>
                    <th>{{ locale.t('metering.table.status') }}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="ag in agents"
                    :key="ag.id"
                    class="drill-row"
                    :title="`${ag.name} · ${ag.id} — 点击查看详情`"
                    @click="onAgentRowClick(ag.id, ag.name)"
                  >
                    <td class="col-name">
                      <span class="cell-name-primary">{{ ag.name }}</span>
                      <span class="cell-name-secondary">{{ ag.id }}</span>
                    </td>
                    <td class="num">{{ fmtMoney(agentCost(ag.id), locale.locale) }}</td>
                    <td class="num">{{ fmtNumber(ag.totalTokens, locale.locale) }}</td>
                    <td class="num">{{ fmtNumber(ag.inputTokens, locale.locale) }}</td>
                    <td class="num">{{ fmtNumber(ag.outputTokens, locale.locale) }}</td>
                    <td class="num">{{ fmtNumber(ag.requests, locale.locale) }}</td>
                    <td>
                      <span class="usage-status" :class="ag.status">
                        ● {{ statusText(ag.status) }}
                      </span>
                    </td>
                  </tr>
                  <tr v-if="agents.length === 0">
                    <td colspan="7" class="empty-cell">
                      <MeteringEmptyState :title="locale.t('metering.empty.title')" :show-action="false" compact />
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div class="table-footer">
              <span>{{ footerText(agents.length) }}</span>
            </div>
          </div>
        </cds-card>
      </div>

      <!-- 7. Drill-down panel — only when a model is selected -->
      <div v-if="drillModel" class="analysis-grid">
        <cds-card class="card">
          <div class="card-pad chart-pad">
            <header class="card-head">
              <h2>{{ locale.t('metering.chart.modelDailyTrend') }} — {{ truncate(drillModel, 22) }}</h2>
              <span class="card-sub">{{ locale.t('metering.table.drillHint') }}</span>
            </header>
            <div class="chart-host">
              <MeteringLineChart
                :series="drillSeries"
                :area-series-index="0"
                :format-x="(v: string) => shortDate(v, locale.locale)"
                :empty-text="locale.t('metering.empty.title')"
              />
            </div>
          </div>
        </cds-card>
        <cds-card class="card">
          <div class="card-pad chart-pad">
            <header class="card-head">
              <h2>{{ locale.t('metering.chart.modelTokens') }} — {{ truncate(drillModel, 22) }}</h2>
            </header>
            <div class="donut-host">
              <MeteringDonutChart
                :segments="drillDonutSegments"
                :center-label="locale.t('metering.token.input')"
                :center-value="fmtNumber(drillTotalTokens, locale.locale)"
                :empty-text="locale.t('metering.empty.title')"
              />
            </div>
          </div>
        </cds-card>
      </div>

      <!-- 8. Detail tables — spec §11 row 4: by-model + by-date -->
      <div class="tables-grid">
        <cds-card class="card">
          <div class="card-pad table-pad">
            <header class="card-head">
              <h2>{{ locale.t('metering.table.modelTitle') }}</h2>
              <span class="card-sub">{{ fmtNumber(models.length, locale.locale) }}</span>
            </header>
            <div class="table-host">
              <table class="data-table">
                <thead>
                  <tr>
                    <th>{{ locale.t('metering.filter.model') }}</th>
                    <th class="num">{{ locale.t('metering.spend.col.spend') }}</th>
                    <th class="num">{{ locale.t('metering.table.totalToken') }}</th>
                    <th class="num">{{ locale.t('metering.token.input') }}</th>
                    <th class="num">{{ locale.t('metering.token.output') }}</th>
                    <th class="num">{{ locale.t('metering.table.requests') }}</th>
                    <th>{{ locale.t('metering.table.status') }}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="model in models"
                    :key="model.name"
                    class="drill-row"
                    :class="{ active: drillModel === model.name }"
                    :title="locale.t('metering.table.drillHint')"
                    @click="toggleDrillModel(model.name)"
                  >
                    <td>
                      <span class="drill-icon">{{ drillModel === model.name ? '▼' : '▶' }}</span>
                      <span :title="model.name">{{ truncate(model.name, 36) }}</span>
                    </td>
                    <td class="num">{{ fmtMoney(modelCost(model.name), locale.locale) }}</td>
                    <td class="num">{{ fmtNumber(model.totalTokens, locale.locale) }}</td>
                    <td class="num">{{ fmtNumber(model.inputTokens, locale.locale) }}</td>
                    <td class="num">{{ fmtNumber(model.outputTokens, locale.locale) }}</td>
                    <td class="num">{{ fmtNumber(model.requests, locale.locale) }}</td>
                    <td>
                      <span class="usage-status" :class="model.status">
                        ● {{ statusText(model.status) }}
                      </span>
                    </td>
                  </tr>
                  <tr v-if="models.length === 0">
                    <td colspan="7" class="empty-cell">
                      <MeteringEmptyState :title="locale.t('metering.empty.title')" :show-action="false" compact />
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div class="table-footer"><span>{{ footerText(models.length) }}</span></div>
          </div>
        </cds-card>
        <cds-card class="card">
          <div class="card-pad table-pad">
            <header class="card-head">
              <h2>{{ locale.t('metering.table.dailyTitle') }}</h2>
              <span class="card-sub">{{ fmtNumber(dailyUsage.length, locale.locale) }}</span>
            </header>
            <div class="table-host">
              <table class="data-table">
                <thead>
                  <tr>
                    <th>{{ locale.t('metering.table.date') }}</th>
                    <th class="num">{{ locale.t('metering.table.totalToken') }}</th>
                    <th class="num">{{ locale.t('metering.token.input') }}</th>
                    <th class="num">{{ locale.t('metering.token.output') }}</th>
                    <th>{{ locale.t('metering.table.status') }}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="day in dailyUsage" :key="day.date">
                    <td>{{ day.date }}</td>
                    <td class="num">{{ fmtNumber(day.totalTokens, locale.locale) }}</td>
                    <td class="num">{{ fmtNumber(day.inputTokens, locale.locale) }}</td>
                    <td class="num">{{ fmtNumber(day.outputTokens, locale.locale) }}</td>
                    <td>
                      <span class="usage-status" :class="day.status">
                        ● {{ statusText(day.status) }}
                      </span>
                    </td>
                  </tr>
                  <tr v-if="dailyUsage.length === 0">
                    <td colspan="5" class="empty-cell">
                      <MeteringEmptyState :title="locale.t('metering.empty.title')" :show-action="false" compact />
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div class="table-footer"><span>{{ footerText(dailyUsage.length) }}</span></div>
          </div>
        </cds-card>
      </div>

      <!-- 9. Cost summary — spec §11 keeps this as a final-row summary -->
      <cds-card class="card cost-card">
        <div class="card-pad">
          <header class="card-head">
            <h2>{{ locale.t('metering.cost.title') }}</h2>
          </header>
          <div class="cost-grid">
            <div class="cost-summary">
              <span class="cost-label">{{ locale.t('metering.cost.total') }}</span>
              <strong class="cost-value">{{ fmtMoney(overview?.cost?.totalCost ?? 0, locale.locale) }}</strong>
            </div>
            <div class="cost-summary">
              <span class="cost-label">{{ locale.t('metering.cost.monthly') }}</span>
              <strong class="cost-value">
                {{ fmtMoney(overview?.cost?.monthlyCost ?? 0, locale.locale) }}
                <span class="cost-suffix">/ {{ locale.t('metering.cost.month') }}</span>
              </strong>
            </div>
          </div>
        </div>
      </cds-card>
    </template>

    <!-- 计量设置 modal（admin-only）。嵌入 CurrencySettingsPage / CostRulesPage
         两个组件，复用现有数据查询 + 保存逻辑，不走路由。 -->
    <cds-modal
      v-if="auth.role === 'admin'"
      size="lg"
      :hidden="!settingsOpen"
      @closeChange="settingsOpen = false"
    >
      <cds-modal-header>
        <h3 cds-text="title">{{ locale.t('meteringSetting.title') }}</h3>
      </cds-modal-header>
      <cds-modal-content>
        <nav class="ms-modal-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            :aria-selected="settingsTab === 'currency'"
            class="ms-modal-tab"
            :class="{ active: settingsTab === 'currency' }"
            @click="settingsTab = 'currency'"
          >
            {{ locale.t('meteringSetting.tabCurrency') }}
          </button>
          <button
            type="button"
            role="tab"
            :aria-selected="settingsTab === 'cost-rules'"
            class="ms-modal-tab"
            :class="{ active: settingsTab === 'cost-rules' }"
            @click="settingsTab = 'cost-rules'"
          >
            {{ locale.t('meteringSetting.tabCostRules') }}
          </button>
        </nav>
        <CurrencySettingsPage v-if="settingsTab === 'currency'" ref="currencyPageRef" />
        <CostRulesPage v-else ref="costRulesPageRef" />
      </cds-modal-content>
      <cds-modal-actions>
        <cds-button action="outline" :disabled="modalSaving" @click="settingsOpen = false">
          {{ locale.t('meteringSetting.cancel') }}
        </cds-button>
        <cds-button
          status="primary"
          :disabled="modalSaving"
          :loading="modalSaving"
          @click="onModalSave"
        >
          {{ modalSaved ? locale.t('branding.saved') : locale.t('branding.save') }}
        </cds-button>
      </cds-modal-actions>
    </cds-modal>
  </section>
</template>

<style scoped>
/* -----------------------------------------------------------------------
   Design tokens — spec §3. Scoped locally to .metering-page so the rest
   of the app's light/dark theme is unaffected; primary / success colors
   still resolve through CDS theme variables via fallbacks.
   ----------------------------------------------------------------------- */
.metering-page {
  /* Spec tokens — keep in sync with §3 of the metering UX spec.
     Each value is sourced from a `--cds-alias-*` token so the whole page
     re-skins under [cds-theme~="dark"] without per-rule overrides. The
     trailing literal in each `var(...)` is the light-mode fallback only. */
  --meter-page-bg: var(--cds-alias-object-container-background, #f5f7fa);
  --meter-card-bg: var(--cds-alias-object-app-background, #ffffff);
  --meter-text: var(--cds-alias-object-app-foreground, #1d2939);
  --meter-text-muted: var(--cds-alias-typography-color-300, #667085);
  --meter-border: var(--cds-alias-object-border-color, #e4e7ec);
  --meter-bg-weak: var(--cds-alias-object-container-background-tint, #fafbfc);
  --meter-radius: 8px;
  /* Status / brand hues stay brand-coloured in both themes — they signal
     state, not surface chrome. CDS gives us dark-theme-tuned tones so
     contrast is preserved. */
  --meter-success: var(--cds-alias-status-success, #12b76a);
  --meter-warning: var(--cds-alias-status-warning, #f79009);
  --meter-danger: var(--cds-alias-status-danger, #f04438);
  --meter-primary: var(--cds-alias-object-app-blue, #0072a3);

  /* Chart color tokens — also referenced by MeteringLineChart / BarChart.
     Pinned to the brand palette (blue / grey) so chart series stay
     recognisable across the two themes; we deliberately don't tie these
     to status-* tokens (those would re-color on theme change and break
     users' mental model of "input vs output"). */
  --chart-color-input: #4b76bd;
  --chart-color-output: #9aa8bb;

  color: var(--meter-text);
  min-width: 0;
  max-width: 100%;
  display: flex;
  flex-direction: column;
  gap: 12px;
  font-family: inherit;
  box-sizing: border-box;
}

/* ---------------------------- 1. page header ---------------------------- */
.page-head {
  flex: 0 0 auto;
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
  flex-wrap: wrap;
}
.page-head-text {
  flex: 1 1 auto;
  min-width: 0;
}
.settings-btn {
  flex: 0 0 auto;
  /* 与页面描述 (`<p class="desc">` 起始位置) 对齐 — 描述位于 h1 下方约 36px 处
     (h1 行高 28*1.3≈36.4 + h1 自身高度 36)，按钮基线贴近描述顶部。 */
  margin-top: 28px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.heading {
  margin: 0;
  color: var(--cds-alias-object-app-foreground, #1b1b1b);
  font-size: 28px;
  line-height: 1.3;
  font-weight: 600;
  letter-spacing: -0.01em;
}
.desc {
  margin: 12px 0 0;
  color: var(--cds-alias-typography-color-300, #565656);
  font-size: 14px;
  line-height: 1.5;
  max-width: 720px;
}
.muted {
  color: var(--cds-alias-typography-color-300, #565656);
}

/* ---------------------------- settings modal ---------------------------- */
/* Modal 内的两个子标签：货币与汇率 / 成本规则。视觉与独立 settings 页的
   .ms-tabs / .ms-tab 一致（下划线指示器），但 scoped 在本组件避免冲突。 */
.ms-modal-tabs {
  display: flex;
  gap: 0;
  border-bottom: 1px solid var(--cds-alias-object-border-color, #d0d5dd);
  margin-bottom: 16px;
}
.ms-modal-tab {
  padding: 8px 16px;
  font-size: 13px;
  font-weight: 500;
  color: var(--cds-alias-object-app-foreground-subtle, #667085);
  background: transparent;
  border: 0;
  border-bottom: 2px solid transparent;
  margin-bottom: -1px;
  cursor: pointer;
  transition: color 0.15s, border-color 0.15s;
  font-family: inherit;
}
.ms-modal-tab:hover {
  color: var(--cds-alias-object-interaction-color, #006e9c);
}
.ms-modal-tab.active {
  color: var(--cds-alias-object-interaction-color, #006e9c);
  border-bottom-color: var(--cds-alias-object-interaction-color, #006e9c);
}

/* ---------------------------- filter row ---------------------------- */
.filter-row {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}
.reset-btn {
  padding: 5px 11px;
  font-size: 12px;
  font-weight: 500;
  border: 1px solid var(--meter-border);
  border-radius: 6px;
  background: var(--meter-card-bg);
  color: var(--meter-text);
  cursor: pointer;
  transition: border-color 0.15s, box-shadow 0.15s;
}
.reset-btn:hover {
  border-color: var(--meter-primary);
  box-shadow: 0 0 0 3px rgba(0, 114, 163, 0.1);
}
/* Focus ring uses the same brand-cyan tint in both themes — it stays low
   enough to read on either light or dark surfaces because alpha is 0.1. */

/* ---------------------------- cards ---------------------------- */
.metering-page :deep(cds-card) {
  --padding: 0;
  --overflow: hidden;
  display: block;
  box-sizing: border-box;
  min-width: 0;
  background: var(--meter-card-bg);
  border: 1px solid var(--meter-border);
  border-radius: var(--meter-radius);
  box-shadow: 0 1px 2px rgba(16, 24, 40, 0.04);
}
.card-pad {
  box-sizing: border-box;
  min-width: 0;
  padding: 16px 18px;
  display: flex;
  flex-direction: column;
  min-height: 0;
}
.card-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 8px;
}
.card-head h2 {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--meter-text);
}
.card-sub {
  font-size: 12px;
  color: var(--meter-text-muted);
  font-variant-numeric: tabular-nums;
}
.card.span-2 { /* visual marker for 2/3 grid spans */ }

/* ---------------------------- analysis grid ---------------------------- */
.analysis-grid {
  display: grid;
  grid-template-columns: 2fr 1fr;
  gap: 16px;
  flex: 0 0 auto;
}
.analysis-grid + .analysis-grid { margin-top: 0; }
.span-2 { min-width: 0; }

/* Donut + agent-table row — narrower donut, wider table (spec §2/§3).
   Default 35/65; promoted to 32/68 at >=1600px; drops to stacked below
   1200px. The .analysis-grid class above is intentionally untouched so
   the trend + ranking row keeps its 2fr 1fr split. */
.overview-grid {
  display: grid;
  grid-template-columns: minmax(380px, 35fr) minmax(0, 65fr);
  gap: 16px;
  flex: 0 0 auto;
  align-items: stretch;
}
.overview-grid + .analysis-grid { margin-top: 0; }
@media (min-width: 1600px) {
  .overview-grid {
    grid-template-columns: minmax(420px, 32fr) minmax(0, 68fr);
  }
}
@media (min-width: 1366px) and (max-width: 1599px) {
  .overview-grid { grid-template-columns: minmax(380px, 35fr) minmax(0, 65fr); }
}
@media (min-width: 1200px) and (max-width: 1365px) {
  .overview-grid {
    grid-template-columns: minmax(360px, 36fr) minmax(0, 64fr);
  }
}
@media (max-width: 1199px) {
  .overview-grid { grid-template-columns: 1fr; }
}

.chart-host {
  flex: 1;
  min-height: 280px;
  display: flex;
}
.chart-host > * { flex: 1; }
.rank-host {
  flex: 1;
  min-height: 200px;
  display: flex;
  flex-direction: column;
}
.rank-host > * { flex: 1; }
.donut-host {
  flex: 1;
  min-height: 240px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.donut-host > * { flex: 1; }
.chart-pad {
  min-height: 320px;
}
/* Donut card inner layout per spec §4 — donut 180px fixed, legend flows
   into remaining width; cards stretch to match the right-side table
   height so the two stay aligned. */
.donut-card-pad {
  display: flex;
  flex-direction: column;
}
/* When the donut has no data, the 180px / 1fr split collapses to a single
   full-width column so the empty state stretches across the card instead
   of being squeezed into the donut slot. */
.donut-card-pad.is-empty .model-distribution-content {
  grid-template-columns: minmax(0, 1fr);
}
.donut-card-pad.is-empty .donut-host {
  /* Keep the empty-state centered horizontally + vertically inside the
     now-full-width column instead of stretching to fill. */
  align-items: center;
  justify-content: center;
}
.model-distribution-content {
  display: grid;
  grid-template-columns: 180px minmax(0, 1fr);
  gap: 16px;
  align-items: center;
  flex: 1;
  min-height: 0;
}
.model-distribution-content .donut-host {
  min-height: 0;
  height: 100%;
}

/* ---------------------------- single-row ---------------------------- */
.single-row {
  display: grid;
  grid-template-columns: 1fr;
  gap: 16px;
}

/* ---------------------------- tables ---------------------------- */
.tables-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr);
  gap: 16px;
  flex: 0 0 auto;
}
.table-pad {
  min-height: 260px;
}
.table-host {
  flex: 1;
  min-height: 200px;
  overflow: auto;
  margin-top: 4px;
  border: 1px solid var(--meter-border);
  border-radius: var(--meter-radius);
}
.data-table {
  width: 100%;
  border-collapse: separate;
  border-spacing: 0;
  font-size: 13px;
  font-variant-numeric: tabular-nums;
  background: var(--meter-card-bg);
  min-width: 360px;
}
.data-table th,
.data-table td {
  padding: 10px 12px;
  text-align: left;
  border-bottom: 1px solid var(--meter-border);
  vertical-align: middle;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 320px;
}
.data-table th {
  position: sticky;
  top: 0;
  z-index: 1;
  background: var(--meter-bg-weak);
  font-weight: 600;
  font-size: 12px;
  color: var(--meter-text-muted);
  letter-spacing: 0.02em;
  text-transform: uppercase;
}
.data-table td.num,
.data-table th.num {
  text-align: right;
  font-variant-numeric: tabular-nums;
}
/* Hover / drill-active row tint — uses a slightly deeper shade than
   `--meter-bg-weak` so the affordance stays visible in light theme. In
   dark theme CDS provides the equivalent dim overlay. */
.data-table tbody tr:hover { background: var(--cds-alias-object-container-background-shade, #f1f3f5); }
.data-table tbody tr:last-child td { border-bottom: 0; }
.data-table .drill-row { cursor: pointer; transition: background 0.15s; }
.data-table .drill-row.active { background: var(--cds-alias-object-container-background-shade, #f1f3f5); font-weight: 600; }

/* Agent-table cell layout (spec §8): primary line = agent name, secondary
   line = agentId. Two stacked spans inside one td keeps the column at
   ~220-260px while still showing both pieces of identifying info. */
.col-name {
  white-space: normal;
  vertical-align: middle;
}
.cell-name-primary {
  display: block;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 500;
  color: var(--meter-text);
}
.cell-name-secondary {
  display: block;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 11px;
  color: var(--meter-text-muted);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  margin-top: 2px;
}

/* Agent-table column widths (spec §7). Applied as fixed table-layout so the
   widths hold against the wide right card and the table scrolls
   horizontally if the card ever narrows below the sum. */
.agent-usage-table {
  table-layout: fixed;
  min-width: 820px;
}
.agent-usage-table th.col-name,
.agent-usage-table td.col-name { width: 240px; }
.agent-usage-table th:nth-child(2),
.agent-usage-table td:nth-child(2) { width: 96px; }
.agent-usage-table th:nth-child(3),
.agent-usage-table td:nth-child(3) { width: 116px; }
.agent-usage-table th:nth-child(4),
.agent-usage-table td:nth-child(4) { width: 110px; }
.agent-usage-table th:nth-child(5),
.agent-usage-table td:nth-child(5) { width: 110px; }
.agent-usage-table th:nth-child(6),
.agent-usage-table td:nth-child(6) { width: 96px; }
.agent-usage-table th:nth-child(7),
.agent-usage-table td:nth-child(7) { width: 84px; }
@media (max-width: 1365px) {
  /* At narrower screens allow the agent table to scroll horizontally instead
     of squeezing fonts (spec §3 1200-1365 + §7 §8). */
  .agent-usage-table { min-width: 720px; }
}
.drill-icon {
  display: inline-block;
  margin-right: 6px;
  font-size: 10px;
  opacity: 0.6;
}
.usage-status {
  font-size: 12px;
  font-weight: 600;
}
.usage-status.normal { color: var(--meter-success); }
.usage-status.warning { color: var(--meter-danger); }
.empty-cell { padding: 0 !important; background: var(--meter-card-bg); }
.data-table thead,
.data-table th {
  background: var(--meter-card-bg);
}
.table-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  padding-top: 8px;
  font-size: 12px;
  color: var(--meter-text-muted);
}

/* ---------------------------- cost summary ---------------------------- */
.cost-card .cost-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
  margin-top: 12px;
}
.cost-summary {
  padding: 14px 16px;
  background: var(--meter-card-bg);
  border: 1px solid var(--meter-border);
  border-radius: var(--meter-radius);
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}
.cost-label { font-size: 12px; color: var(--meter-text-muted); }
.cost-value {
  font-size: 22px;
  font-weight: 700;
  letter-spacing: -0.02em;
  color: var(--meter-text);
  font-variant-numeric: tabular-nums;
  display: flex;
  align-items: baseline;
  gap: 6px;
  flex-wrap: wrap;
}
.cost-suffix {
  font-size: 13px;
  color: var(--meter-text-muted);
  font-weight: 400;
}

/* ---------------------------- responsive ---------------------------- */
@media (max-width: 1366px) {
  .analysis-grid { grid-template-columns: 1fr 1fr; }
}
@media (max-width: 1200px) {
  .analysis-grid,
  .tables-grid { grid-template-columns: 1fr; }
  .span-2 { /* no 2/3 split under 1200 */ }
  .data-table { min-width: 480px; }
}
@media (max-width: 900px) {
  .filter-row { flex-direction: column; align-items: stretch; }
  .cost-grid { grid-template-columns: 1fr; }
}
</style>
