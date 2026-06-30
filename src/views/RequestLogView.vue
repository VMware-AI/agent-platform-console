<script setup lang="ts">
import { computed, ref } from 'vue'
import { useQuery } from '@vue/apollo-composable'
import { useLocaleStore } from '@/stores/locale'
import { useToast } from '@/composables/useToast'
import { graphqlErrorMessage } from '@/api/graphql/errors'
import {
  REQUEST_LOGS_QUERY,
  type RequestLogFilterInput,
  type RequestLogNode,
  type RequestLogsResult,
  type RequestLogsVars,
} from '@/api/graphql/queries/request-logs'
import '@/components/icons'

const locale = useLocaleStore()
const toast = useToast()

const PAGE_SIZE_OPTIONS = [10, 20, 50] as const
type PageSize = (typeof PAGE_SIZE_OPTIONS)[number]
type TimeWindow = '1h' | '6h' | 'custom'
type StatusFilter = 'all' | '200' | '4xx' | '5xx'

const timeWindow = ref<TimeWindow>('1h')
const statusFilter = ref<StatusFilter>('all')
const modelInput = ref('')
const agentIdInput = ref('')
const requestIdInput = ref('')

const appliedModel = ref('')
const appliedAgentId = ref('')
const appliedRequestId = ref('')

const pageSize = ref<PageSize>(10)
const currentPage = ref(1)
const expandedId = ref<string | null>(null)

const offset = computed(() => (currentPage.value - 1) * pageSize.value)

const serverStatusCode = computed<number | null>(() => (statusFilter.value === '200' ? 200 : null))

const filter = computed<RequestLogFilterInput | null>(() => {
  const next: RequestLogFilterInput = {}
  if (serverStatusCode.value !== null) next.statusCode = serverStatusCode.value
  if (appliedModel.value.trim()) next.model = appliedModel.value.trim()
  if (appliedAgentId.value.trim()) next.agentId = appliedAgentId.value.trim()
  if (appliedRequestId.value.trim()) next.requestId = appliedRequestId.value.trim()
  return Object.keys(next).length > 0 ? next : null
})

const variables = computed<RequestLogsVars>(() => ({
  filter: filter.value,
  page: { limit: pageSize.value, offset: offset.value },
}))

const { result, loading, refetch, onError } = useQuery<RequestLogsResult, RequestLogsVars>(
  REQUEST_LOGS_QUERY,
  variables,
  { fetchPolicy: 'cache-and-network' },
)

onError((error) => {
  toast.error(graphqlErrorMessage(error, locale.t('requestLog.toast.loadFailed')))
})

const logs = computed<RequestLogNode[]>(() => result.value?.requestLogs ?? [])
const hasNextPage = computed(() => logs.value.length === pageSize.value)
const hasPrevPage = computed(() => currentPage.value > 1)

function matchesTimeWindow(log: RequestLogNode): boolean {
  if (timeWindow.value === 'custom') return true
  const createdAt = new Date(log.createdAt).getTime()
  if (Number.isNaN(createdAt)) return true
  const hours = timeWindow.value === '1h' ? 1 : 6
  return Date.now() - createdAt <= hours * 60 * 60 * 1000
}

function matchesStatusFilter(log: RequestLogNode): boolean {
  if (statusFilter.value === 'all') return true
  if (statusFilter.value === '200') return log.statusCode === 200
  if (statusFilter.value === '4xx') return log.statusCode >= 400 && log.statusCode < 500
  if (statusFilter.value === '5xx') return log.statusCode >= 500 && log.statusCode < 600
  return true
}

const visibleLogs = computed(() => logs.value.filter(matchesTimeWindow).filter(matchesStatusFilter))
const isEmpty = computed(() => !loading.value && visibleLogs.value.length === 0)

const rangeText = computed(() => {
  if (visibleLogs.value.length === 0) return locale.t('requestLog.pagination.empty')
  const start = offset.value + 1
  const end = offset.value + visibleLogs.value.length
  return locale
    .t('requestLog.pagination.range')
    .replace('{start}', String(start))
    .replace('{end}', String(end))
})

const anyFilterActive = computed(
  () =>
    statusFilter.value !== 'all' ||
    timeWindow.value !== '1h' ||
    Boolean(appliedModel.value.trim()) ||
    Boolean(appliedAgentId.value.trim()) ||
    Boolean(appliedRequestId.value.trim()),
)

function applyToolbarFilters() {
  appliedModel.value = modelInput.value.trim()
  appliedAgentId.value = agentIdInput.value.trim()
  appliedRequestId.value = requestIdInput.value.trim()
  currentPage.value = 1
}

function clearAllFilters() {
  timeWindow.value = '1h'
  statusFilter.value = 'all'
  modelInput.value = ''
  agentIdInput.value = ''
  requestIdInput.value = ''
  appliedModel.value = ''
  appliedAgentId.value = ''
  appliedRequestId.value = ''
  currentPage.value = 1
}

function selectTimeWindow(next: TimeWindow) {
  timeWindow.value = next
  currentPage.value = 1
}

function selectStatusFilter(next: StatusFilter) {
  statusFilter.value = statusFilter.value === next ? 'all' : next
  currentPage.value = 1
}

function onStatusSelect(event: Event) {
  statusFilter.value = (event.target as HTMLSelectElement).value as StatusFilter
  currentPage.value = 1
}

function onPageSizeChange(event: Event) {
  const next = Number((event.target as HTMLSelectElement).value)
  if (!PAGE_SIZE_OPTIONS.includes(next as PageSize)) return
  pageSize.value = next as PageSize
  currentPage.value = 1
}

function goPrev() {
  if (!hasPrevPage.value) return
  currentPage.value -= 1
  expandedId.value = null
}

function goNext() {
  if (!hasNextPage.value) return
  currentPage.value += 1
  expandedId.value = null
}

async function refreshLogs() {
  if (loading.value) return
  applyToolbarFilters()
  try {
    await refetch()
    toast.success(locale.t('requestLog.toast.refreshed'))
  } catch (error) {
    toast.error(graphqlErrorMessage(error, locale.t('requestLog.toast.refreshFailed')))
  }
}

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

function formatDateTime(value: string): string {
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  const year = parsed.getFullYear()
  const month = pad(parsed.getMonth() + 1)
  const day = pad(parsed.getDate())
  const hour = pad(parsed.getHours())
  const minute = pad(parsed.getMinutes())
  const second = pad(parsed.getSeconds())
  return `${year}-${month}-${day} ${hour}:${minute}:${second}`
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat(locale.locale === 'zh' ? 'zh-CN' : 'en-US').format(value)
}

function dash(value: string | null): string {
  return value && value.trim() ? value : '—'
}

function statusTone(code: number): 'success' | 'warning' | 'danger' | 'neutral' {
  if (code >= 200 && code < 300) return 'success'
  if (code >= 400 && code < 500) return 'warning'
  if (code >= 500) return 'danger'
  return 'neutral'
}

function detailText(detail: string | null): string {
  if (!detail) return ''
  try {
    return JSON.stringify(JSON.parse(detail), null, 2)
  } catch {
    return detail
  }
}

function toggleDetail(log: RequestLogNode) {
  if (!log.detail) return
  expandedId.value = expandedId.value === log.id ? null : log.id
}

function copyWithFallback(value: string) {
  const textarea = document.createElement('textarea')
  textarea.value = value
  textarea.style.position = 'fixed'
  textarea.style.opacity = '0'
  document.body.appendChild(textarea)
  textarea.select()
  const copied = document.execCommand('copy')
  document.body.removeChild(textarea)
  if (!copied) throw new Error('Copy command rejected')
}

async function copyRequestId(value: string) {
  if (!value) return
  try {
    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(value)
      } catch {
        copyWithFallback(value)
      }
    } else {
      copyWithFallback(value)
    }
    toast.success(locale.t('requestLog.toast.copied'))
  } catch (err) {
    toast.error(graphqlErrorMessage(err, locale.t('requestLog.toast.copyFailed')))
  }
}
</script>

<template>
  <section class="request-log-page">
    <header class="page-head">
      <h1 cds-text="title" class="heading">{{ locale.t('requestLog.title') }}</h1>
      <p cds-text="body" class="desc muted">{{ locale.t('requestLog.description') }}</p>
    </header>

    <div class="log-shell">
      <div class="toolbar" :aria-label="locale.t('requestLog.filter.toolbar')">
        <div class="time-tabs" role="group" :aria-label="locale.t('requestLog.filter.timeRange')">
          <button
            type="button"
            class="time-tab"
            :class="{ active: timeWindow === '1h' }"
            @click="selectTimeWindow('1h')"
          >
            <cds-icon shape="calendar" size="sm" aria-hidden="true"></cds-icon>
            {{ locale.t('requestLog.filter.last1h') }}
          </button>
          <button
            type="button"
            class="time-tab"
            :class="{ active: timeWindow === '6h' }"
            @click="selectTimeWindow('6h')"
          >
            {{ locale.t('requestLog.filter.last6h') }}
          </button>
          <button
            type="button"
            class="time-tab"
            :class="{ active: timeWindow === 'custom' }"
            @click="selectTimeWindow('custom')"
          >
            {{ locale.t('requestLog.filter.customRange') }}
          </button>
        </div>

        <button
          type="button"
          class="refresh-button"
          :disabled="loading"
          :aria-label="locale.t('requestLog.action.refresh')"
          :title="locale.t('requestLog.action.refresh')"
          @click="refreshLogs"
        >
          <cds-icon shape="refresh" size="md" :class="{ spinning: loading }" aria-hidden="true"></cds-icon>
        </button>

        <div class="toolbar-spacer"></div>

        <input
          v-model="agentIdInput"
          class="control-input agent-input"
          type="text"
          :placeholder="locale.t('requestLog.filter.agentPlaceholder')"
          :aria-label="locale.t('requestLog.filter.agentPlaceholder')"
          @keyup.enter="applyToolbarFilters"
          @change="applyToolbarFilters"
        />
        <input
          v-model="modelInput"
          class="control-input model-input"
          type="text"
          :placeholder="locale.t('requestLog.filter.modelPlaceholder')"
          :aria-label="locale.t('requestLog.filter.modelPlaceholder')"
          @keyup.enter="applyToolbarFilters"
          @change="applyToolbarFilters"
        />
        <cds-select control-width="shrink" class="status-select">
          <select
            :value="statusFilter"
            :aria-label="locale.t('requestLog.filter.status')"
            @change="onStatusSelect"
          >
            <option value="all">{{ locale.t('requestLog.filter.allStatus') }}</option>
            <option value="200">200</option>
            <option value="4xx">4xx</option>
            <option value="5xx">5xx</option>
          </select>
        </cds-select>
        <div class="status-chips" :aria-label="locale.t('requestLog.filter.statusGroup')">
          <button
            type="button"
            class="status-chip"
            :class="{ active: statusFilter === '200' }"
            @click="selectStatusFilter('200')"
          >
            <span class="chip-check" aria-hidden="true"></span>
            200
          </button>
          <button
            type="button"
            class="status-chip"
            :class="{ active: statusFilter === '4xx' }"
            @click="selectStatusFilter('4xx')"
          >
            <span class="chip-check" aria-hidden="true"></span>
            4xx
          </button>
          <button
            type="button"
            class="status-chip"
            :class="{ active: statusFilter === '5xx' }"
            @click="selectStatusFilter('5xx')"
          >
            <span class="chip-check" aria-hidden="true"></span>
            5xx
          </button>
        </div>
        <label class="search-box">
          <cds-icon shape="search" size="sm" aria-hidden="true"></cds-icon>
          <input
            v-model="requestIdInput"
            type="search"
            :placeholder="locale.t('requestLog.filter.requestPlaceholder')"
            :aria-label="locale.t('requestLog.filter.requestPlaceholder')"
            @keyup.enter="applyToolbarFilters"
            @change="applyToolbarFilters"
          />
        </label>
      </div>

      <div v-if="anyFilterActive" class="filter-summary">
        <span>{{ locale.t('requestLog.filter.activeHint') }}</span>
        <button type="button" class="link-button" @click="clearAllFilters">
          {{ locale.t('requestLog.filter.clearAll') }}
        </button>
      </div>

      <div class="table-wrap">
        <table class="log-table" :aria-label="locale.t('requestLog.table.label')">
          <colgroup>
            <col class="time-col" />
            <col class="request-col" />
            <col class="agent-col" />
            <col class="model-col" />
            <col class="token-col" />
            <col class="token-col" />
            <col class="latency-col" />
            <col class="status-col" />
            <col class="action-col" />
          </colgroup>
          <thead>
            <tr>
              <th scope="col">{{ locale.t('requestLog.col.time') }}</th>
              <th scope="col">{{ locale.t('requestLog.col.requestId') }}</th>
              <th scope="col">{{ locale.t('requestLog.col.agentId') }}</th>
              <th scope="col">{{ locale.t('requestLog.col.model') }}</th>
              <th scope="col">{{ locale.t('requestLog.col.inputTokens') }}</th>
              <th scope="col">{{ locale.t('requestLog.col.outputTokens') }}</th>
              <th scope="col">{{ locale.t('requestLog.col.latencyMs') }}</th>
              <th scope="col">{{ locale.t('requestLog.col.status') }}</th>
              <th scope="col">{{ locale.t('requestLog.col.actions') }}</th>
            </tr>
          </thead>
          <tbody>
            <template v-for="log in visibleLogs" :key="log.id">
              <tr class="data-row" :class="{ expanded: expandedId === log.id }">
                <td class="mono nowrap">{{ formatDateTime(log.createdAt) }}</td>
                <td>
                  <button
                    type="button"
                    class="request-copy"
                    :title="locale.t('requestLog.action.copy')"
                    :aria-label="locale.t('requestLog.action.copy')"
                    @click="copyRequestId(log.requestId)"
                  >
                    <span class="mono ellipsis">{{ log.requestId }}</span>
                    <cds-icon shape="copy" size="sm" aria-hidden="true"></cds-icon>
                  </button>
                </td>
                <td>
                  <span class="ellipsis" :title="dash(log.agentId)">{{ dash(log.agentId) }}</span>
                </td>
                <td>
                  <span class="ellipsis" :title="dash(log.model)">{{ dash(log.model) }}</span>
                </td>
                <td class="tabular">{{ formatNumber(log.inputTokens) }}</td>
                <td class="tabular">{{ formatNumber(log.outputTokens) }}</td>
                <td class="tabular">{{ formatNumber(log.latencyMs) }}</td>
                <td>
                  <span class="status-pill" :data-tone="statusTone(log.statusCode)">
                    <span class="status-dot" aria-hidden="true"></span>
                    {{ log.statusCode }}
                  </span>
                </td>
                <td class="action-cell">
                  <button
                    type="button"
                    class="row-action"
                    :disabled="!log.detail"
                    :aria-expanded="expandedId === log.id"
                    :title="locale.t('requestLog.action.toggleDetail')"
                    :aria-label="locale.t('requestLog.action.toggleDetail')"
                    @click="toggleDetail(log)"
                  >
                    <cds-icon
                      shape="angle"
                      :direction="expandedId === log.id ? 'up' : 'down'"
                      size="sm"
                    ></cds-icon>
                  </button>
                </td>
              </tr>
              <tr v-if="expandedId === log.id && log.detail" class="detail-row">
                <td colspan="9">
                  <pre class="detail-text">{{ detailText(log.detail) }}</pre>
                </td>
              </tr>
            </template>

            <tr v-if="loading && visibleLogs.length === 0">
              <td colspan="9" class="placeholder-cell">
                <cds-icon shape="history" size="xl" class="placeholder-icon"></cds-icon>
                {{ locale.t('requestLog.loading') }}
              </td>
            </tr>
            <tr v-else-if="isEmpty">
              <td colspan="9" class="placeholder-cell">
                <cds-icon shape="filter" size="xl" class="placeholder-icon"></cds-icon>
                {{ locale.t('requestLog.empty') }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <footer class="table-footer">
        <div class="page-size">
          <span>{{ locale.t('requestLog.pagination.pageSize') }}</span>
          <cds-select control-width="shrink">
            <select
              :value="pageSize"
              :aria-label="locale.t('requestLog.pagination.pageSize')"
              @change="onPageSizeChange"
            >
              <option v-for="option in PAGE_SIZE_OPTIONS" :key="option" :value="option">
                {{ option }}
              </option>
            </select>
          </cds-select>
        </div>
        <span class="range-label">{{ rangeText }}</span>
        <cds-pagination :aria-label="locale.t('requestLog.pagination.label')">
          <cds-pagination-button
            action="prev"
            :disabled="!hasPrevPage"
            :aria-label="locale.t('agents.pager.prev')"
            @click="goPrev"
          ></cds-pagination-button>
          <span class="page-indicator">{{ currentPage }}</span>
          <cds-pagination-button
            action="next"
            :disabled="!hasNextPage"
            :aria-label="locale.t('agents.pager.next')"
            @click="goNext"
          ></cds-pagination-button>
        </cds-pagination>
      </footer>
    </div>
  </section>
</template>

<style scoped>
.request-log-page {
  height: 100%;
  min-height: 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.page-head {
  flex: 0 0 auto;
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
.log-shell {
  flex: 1 1 auto;
  min-height: 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--cds-alias-object-border-color, #b3b3b3);
  border-radius: 6px;
  background: var(--cds-alias-object-container-background, #fff);
  overflow: hidden;
}
.toolbar {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px;
  border-bottom: 1px solid var(--cds-alias-object-border-color, #d8d8d8);
  background: var(--cds-alias-object-container-background, #fff);
  overflow-x: auto;
}
.time-tabs,
.status-chips {
  display: inline-flex;
  align-items: center;
  flex: 0 0 auto;
}
.time-tabs {
  border: 1px solid var(--cds-alias-object-border-color, #c8c8c8);
  border-radius: 3px;
  overflow: hidden;
}
.time-tab {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  min-height: 28px;
  padding: 0 10px;
  border: 0;
  border-right: 1px solid var(--cds-alias-object-border-color, #c8c8c8);
  background: var(--cds-alias-object-container-background, #fff);
  color: var(--cds-alias-object-app-foreground, #1b1b1b);
  font: inherit;
  font-size: 13px;
  white-space: nowrap;
  cursor: pointer;
}
.time-tab:last-child {
  border-right: 0;
}
.time-tab:hover,
.time-tab.active {
  background: var(--cds-alias-object-app-background, #f1f5f8);
}
/* Refresh button: chrome-free plain <button> — no background, no border —
   just the icon. Matches ModelGatewayView's reference refresh button. */
.refresh-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: 0;
  padding: 6px 8px;
  margin: 0;
  cursor: pointer;
  color: inherit;
  flex: 0 0 auto;
  border-radius: 0;
}
.refresh-button:hover:not(:disabled) {
  color: var(--cds-alias-object-app-blue, #0072a3);
}
.refresh-button:focus-visible {
  outline: 2px solid var(--cds-alias-object-app-blue, #0072a3);
  outline-offset: 2px;
}
.refresh-button:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}
.toolbar-spacer {
  flex: 1 1 auto;
  min-width: 24px;
}
.control-input,
.search-box {
  min-height: 30px;
  border: 1px solid var(--cds-alias-object-border-color, #c8c8c8);
  border-radius: 3px;
  background: var(--cds-alias-object-container-background, #fff);
  color: var(--cds-alias-object-app-foreground, #1b1b1b);
  font: inherit;
  font-size: 13px;
}
.control-input {
  flex: 0 0 auto;
  width: 160px;
  padding: 5px 9px;
}
.agent-input {
  width: 210px;
}
.model-input {
  width: 110px;
}
.control-input:focus,
.search-box:focus-within {
  border-color: var(--cds-alias-object-interaction-color, #0072a3);
  outline: 2px solid color-mix(in srgb, var(--cds-alias-object-interaction-color, #0072a3) 20%, transparent);
  outline-offset: 1px;
}
.status-select {
  flex: 0 0 auto;
}
.status-chips {
  gap: 4px;
}
.status-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-height: 28px;
  padding: 0 8px;
  border: 1px solid var(--cds-alias-object-border-color, #c8c8c8);
  border-radius: 3px;
  background: var(--cds-alias-object-container-background, #fff);
  color: var(--cds-alias-object-app-foreground, #1b1b1b);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}
.status-chip.active {
  border-color: var(--cds-alias-object-interaction-color, #0072a3);
  background: var(--cds-alias-object-interaction-background-selected, #e5f1f6);
}
.chip-check {
  width: 10px;
  height: 10px;
  border: 1px solid var(--cds-alias-object-border-color, #a5a5a5);
  border-radius: 2px;
  background: var(--cds-alias-object-container-background, #fff);
}
.status-chip.active .chip-check {
  border-color: var(--cds-alias-object-interaction-color, #0072a3);
  background: var(--cds-alias-object-interaction-color, #0072a3);
  box-shadow: inset 0 0 0 2px var(--cds-alias-object-container-background, #fff);
}
.search-box {
  display: inline-flex;
  align-items: center;
  flex: 0 0 auto;
  gap: 6px;
  width: 190px;
  padding: 0 8px;
}
.search-box input {
  width: 100%;
  min-width: 0;
  border: 0;
  outline: 0;
  background: transparent;
  color: inherit;
  font: inherit;
}
.filter-summary {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 30px;
  padding: 0 10px;
  border-bottom: 1px solid var(--cds-alias-object-border-color, #e5e5e5);
  color: var(--cds-alias-typography-color-300, #565656);
  font-size: 12px;
}
.link-button {
  border: 0;
  background: transparent;
  color: var(--cds-alias-object-interaction-color, #006e9c);
  font: inherit;
  cursor: pointer;
  padding: 0;
  text-decoration: underline;
}
.table-wrap {
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto;
}
.log-table {
  width: 100%;
  min-width: 1040px;
  border-collapse: collapse;
  table-layout: fixed;
  font-size: 13px;
  color: var(--cds-alias-object-app-foreground, #1b1b1b);
}
.time-col {
  width: 170px;
}
.request-col {
  width: 150px;
}
.agent-col {
  width: 220px;
}
.model-col {
  width: 100px;
}
.token-col {
  width: 96px;
}
.latency-col {
  width: 112px;
}
.status-col {
  width: 90px;
}
.action-col {
  width: 64px;
}
.log-table th,
.log-table td {
  height: 32px;
  padding: 5px 10px;
  border-bottom: 1px solid var(--cds-alias-object-border-color, #e2e2e2);
  text-align: left;
  vertical-align: middle;
}
.log-table th {
  position: sticky;
  top: 0;
  z-index: 1;
  background: var(--cds-alias-object-app-background, #f4f7f9);
  color: var(--cds-alias-typography-color-400, #313131);
  font-weight: 600;
  white-space: nowrap;
}
.data-row:hover {
  background: var(--cds-alias-object-interaction-background-hover, #eef4f7);
}
.data-row.expanded {
  background: var(--cds-alias-object-app-background, #f5f7fa);
}
.mono {
  font-family: var(--cds-global-typography-monospace-font-family, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace);
}
.tabular {
  font-variant-numeric: tabular-nums;
}
.nowrap {
  white-space: nowrap;
}
.ellipsis {
  display: inline-block;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  vertical-align: bottom;
}
.request-copy {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  width: 100%;
  min-width: 0;
  padding: 2px 0;
  border: 0;
  background: transparent;
  color: var(--cds-alias-object-interaction-color, #006e9c);
  font: inherit;
  cursor: pointer;
}
.request-copy cds-icon {
  flex: 0 0 auto;
  color: var(--cds-alias-object-app-foreground, #313131);
}
.status-pill {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-variant-numeric: tabular-nums;
  font-weight: 500;
}
.status-dot {
  width: 12px;
  height: 12px;
  border-radius: 999px;
  background: var(--cds-alias-status-neutral, #6a6a6a);
}
.status-pill[data-tone='success'] {
  color: var(--cds-alias-status-success, #247144);
}
.status-pill[data-tone='success'] .status-dot {
  background: var(--cds-alias-status-success, #247144);
}
.status-pill[data-tone='warning'] {
  color: var(--cds-alias-status-danger, #b53d35);
}
.status-pill[data-tone='warning'] .status-dot {
  background: var(--cds-alias-status-danger, #b53d35);
}
.status-pill[data-tone='danger'] {
  color: var(--cds-alias-status-danger, #b53d35);
}
.status-pill[data-tone='danger'] .status-dot {
  background: var(--cds-alias-status-danger, #b53d35);
}
.action-cell {
  text-align: center;
}
.row-action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border: 0;
  border-radius: 3px;
  background: transparent;
  color: var(--cds-alias-object-app-foreground, #1b1b1b);
  cursor: pointer;
}
.row-action:hover:not(:disabled) {
  background: var(--cds-alias-object-app-background, #edf2f5);
}
.row-action:disabled {
  opacity: 0.35;
  cursor: default;
}
.detail-row td {
  height: auto;
  padding: 8px 10px 10px;
  background: var(--cds-alias-object-app-background, #f5f7fa);
}
.detail-text {
  margin: 0;
  min-height: 72px;
  max-height: 220px;
  overflow: auto;
  color: var(--cds-alias-object-app-foreground, #1b1b1b);
  font-family: var(--cds-global-typography-monospace-font-family, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace);
  font-size: 12px;
  line-height: 1.45;
  white-space: pre-wrap;
  word-break: break-word;
}
.placeholder-cell {
  height: 180px !important;
  text-align: center !important;
  color: var(--cds-alias-typography-color-300, #565656);
}
.placeholder-icon {
  display: block;
  margin: 0 auto 8px;
  color: var(--cds-alias-typography-color-300, #565656);
}
.table-footer {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  min-height: 38px;
  padding: 6px 10px;
  border-top: 1px solid var(--cds-alias-object-border-color, #d8d8d8);
  color: var(--cds-alias-typography-color-300, #565656);
  font-size: 12px;
}
.page-size {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.range-label {
  white-space: nowrap;
}
.page-indicator {
  min-width: 24px;
  text-align: center;
  color: var(--cds-alias-object-app-foreground, #1b1b1b);
  font-variant-numeric: tabular-nums;
}
.spinning {
  animation: request-log-spin 1s linear infinite;
  transform-origin: center;
}
@keyframes request-log-spin {
  to {
    transform: rotate(360deg);
  }
}
@media (max-width: 1080px) {
  .toolbar {
    align-items: flex-start;
    flex-wrap: wrap;
  }
  .toolbar-spacer {
    display: none;
  }
  .agent-input,
  .model-input,
  .search-box {
    flex: 1 1 180px;
  }
}
@media (max-width: 720px) {
  .heading {
    font-size: 24px;
  }
  .page-size {
    display: none;
  }
  .table-footer {
    justify-content: space-between;
  }
}
@media (prefers-reduced-motion: reduce) {
  .spinning {
    animation: none;
  }
}
</style>
