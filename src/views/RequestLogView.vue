<script setup lang="ts">
import { computed, ref } from 'vue'
import { useQuery } from '@vue/apollo-composable'
import { useLocaleStore } from '@/stores/locale'
import { useToast } from '@/composables/useToast'
import { graphqlErrorMessage } from '@/api/graphql/errors'
import { csvCell } from '@/utils/csv'
import {
  REQUEST_LOGS_QUERY,
  type RequestLogFilterInput,
  type RequestLogNode,
  type RequestLogsResult,
  type RequestLogsVars,
} from '@/api/graphql/queries/request-logs'
import { apolloClient } from '@/api/graphql/client'
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
const detailModalId = ref<string | null>(null)
const customFrom = ref('')
const customTo = ref('')
const userInput = ref('')
const appliedUserId = ref('')

const offset = computed(() => (currentPage.value - 1) * pageSize.value)

// Time window pushed to the server (from/to) instead of client-side filtering,
// which combined with offset paging gave uneven pages + wrong "has more" (LLD-15 T5).
const serverWindow = computed<{ from: string | null; to: string | null }>(() => {
  if (timeWindow.value === 'custom') {
    return {
      from: customFrom.value ? new Date(customFrom.value).toISOString() : null,
      to: customTo.value ? new Date(customTo.value).toISOString() : null,
    }
  }
  const hours = timeWindow.value === '1h' ? 1 : 6
  return { from: new Date(Date.now() - hours * 60 * 60 * 1000).toISOString(), to: null }
})

const filter = computed<RequestLogFilterInput | null>(() => {
  const next: RequestLogFilterInput = {}
  // 200 = exact success; 4xx/5xx map to the server-side status band.
  if (statusFilter.value === '200') next.statusCode = 200
  else if (statusFilter.value === '4xx') next.statusClass = 'CLIENT_ERROR'
  else if (statusFilter.value === '5xx') next.statusClass = 'SERVER_ERROR'
  if (appliedModel.value.trim()) next.model = appliedModel.value.trim()
  if (appliedAgentId.value.trim()) next.agentId = appliedAgentId.value.trim()
  if (appliedRequestId.value.trim()) next.requestId = appliedRequestId.value.trim()
  if (appliedUserId.value.trim()) next.userId = appliedUserId.value.trim()
  const w = serverWindow.value
  if (w.from) next.from = w.from
  if (w.to) next.to = w.to
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

const logs = computed<RequestLogNode[]>(() => result.value?.requestLogs.items ?? [])
const totalCount = computed(() => result.value?.requestLogs.total ?? 0)
// Server applies every filter now, so render exactly what came back.
const visibleLogs = computed(() => logs.value)
const totalPages = computed(() => Math.max(1, Math.ceil(totalCount.value / pageSize.value)))
const hasNextPage = computed(() => currentPage.value < totalPages.value)
const hasPrevPage = computed(() => currentPage.value > 1)
const isEmpty = computed(() => !loading.value && visibleLogs.value.length === 0)

// Export streams EVERY row matching the active filters (not just the visible
// page) via one-shot apolloClient.query() paging, capped so a huge range can't
// exhaust the tab. Mirrors the app's useAgentExport convention.
const EXPORT_PAGE_SIZE = 500
const EXPORT_CAP = 5000
const exportingCsv = ref(false)

async function fetchAllRequestLogs(): Promise<{ rows: RequestLogNode[]; total: number }> {
  const activeFilter = filter.value
  const rows: RequestLogNode[] = []
  let total = 0
  for (let offset = 0; offset < EXPORT_CAP; offset += EXPORT_PAGE_SIZE) {
    const { data } = await apolloClient.query<RequestLogsResult, RequestLogsVars>({
      query: REQUEST_LOGS_QUERY,
      variables: { filter: activeFilter, page: { limit: EXPORT_PAGE_SIZE, offset } },
      fetchPolicy: 'network-only',
    })
    total = data.requestLogs.total
    rows.push(...data.requestLogs.items)
    if (rows.length >= total || data.requestLogs.items.length < EXPORT_PAGE_SIZE) break
  }
  return { rows, total }
}

async function exportCsv() {
  if (exportingCsv.value) return
  exportingCsv.value = true
  try {
    const { rows, total } = await fetchAllRequestLogs()
    if (rows.length === 0) {
      toast.info(locale.t('requestLog.export.empty'))
      return
    }
    const header = ['createdAt', 'requestId', 'userId', 'agentId', 'model', 'inputTokens', 'outputTokens', 'latencyMs', 'statusCode']
    const lines = [header.join(',')]
    for (const l of rows) {
      lines.push(
        [l.createdAt, l.requestId, l.userId, l.agentId, l.model, l.inputTokens, l.outputTokens, l.latencyMs, l.statusCode]
          .map(csvCell)
          .join(','),
      )
    }
    // UTF-8 BOM so Excel renders any Chinese fields correctly.
    const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `request-logs-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
    if (rows.length < total) {
      toast.info(locale.t('requestLog.export.truncated').replace('{count}', String(rows.length)))
    } else {
      toast.success(locale.t('requestLog.export.success').replace('{count}', String(rows.length)))
    }
  } catch (err) {
    toast.error(graphqlErrorMessage(err, locale.t('requestLog.export.fail')))
  } finally {
    exportingCsv.value = false
  }
}

const rangeText = computed(() => {
  if (visibleLogs.value.length === 0) return locale.t('requestLog.pagination.empty')
  const start = offset.value + 1
  const end = offset.value + visibleLogs.value.length
  return locale
    .t('requestLog.pagination.summary')
    .replace('{start}', String(start))
    .replace('{end}', String(end))
    .replace('{total}', String(totalCount.value))
})

const anyFilterActive = computed(
  () =>
    statusFilter.value !== 'all' ||
    timeWindow.value !== '1h' ||
    Boolean(appliedModel.value.trim()) ||
    Boolean(appliedAgentId.value.trim()) ||
    Boolean(appliedRequestId.value.trim()) ||
    Boolean(appliedUserId.value.trim()),
)

function applyToolbarFilters() {
  appliedModel.value = modelInput.value.trim()
  appliedAgentId.value = agentIdInput.value.trim()
  appliedRequestId.value = requestIdInput.value.trim()
  appliedUserId.value = userInput.value.trim()
  currentPage.value = 1
}

function clearAllFilters() {
  timeWindow.value = '1h'
  statusFilter.value = 'all'
  modelInput.value = ''
  agentIdInput.value = ''
  requestIdInput.value = ''
  userInput.value = ''
  appliedModel.value = ''
  appliedAgentId.value = ''
  appliedRequestId.value = ''
  appliedUserId.value = ''
  customFrom.value = ''
  customTo.value = ''
  currentPage.value = 1
}

function selectTimeWindow(next: TimeWindow) {
  timeWindow.value = next
  currentPage.value = 1
}

function selectStatusFilter(next: StatusFilter) {
  // Toggle: clicking the active band clears back to "all".
  statusFilter.value = statusFilter.value === next ? 'all' : next
  currentPage.value = 1
}

function onPageSizeChange(event: Event) {
  const next = Number((event.target as HTMLSelectElement).value)
  if (!PAGE_SIZE_OPTIONS.includes(next as PageSize)) return
  pageSize.value = next as PageSize
  currentPage.value = 1
}

function goFirst() {
  if (!hasPrevPage.value) return
  currentPage.value = 1
  detailModalId.value = null
}

function goPrev() {
  if (!hasPrevPage.value) return
  currentPage.value -= 1
  detailModalId.value = null
}

function goNext() {
  if (!hasNextPage.value) return
  currentPage.value += 1
  detailModalId.value = null
}

function goLast() {
  if (!hasNextPage.value) return
  currentPage.value = totalPages.value
  detailModalId.value = null
}

function goToPage(page: number) {
  const clamped = Math.max(1, Math.min(totalPages.value, Math.floor(page) || 1))
  if (clamped === currentPage.value) return
  currentPage.value = clamped
  detailModalId.value = null
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

// cds-grid doesn't have a built-in row-span mechanism, so promote the
// detail panel to a cds-modal dialog. Track the open log id so the
// modal title / body can pull data from the visible list.
const detailModalLog = computed<RequestLogNode | null>(() => {
  if (!detailModalId.value) return null
  return visibleLogs.value.find((l) => l.id === detailModalId.value) ?? null
})

function openDetail(log: RequestLogNode) {
  if (!log.detail) return
  detailModalId.value = log.id
}

function closeDetail() {
  detailModalId.value = null
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
        <div class="status-chips" :aria-label="locale.t('requestLog.filter.statusGroup')">
          <button
            type="button"
            class="status-chip"
            :class="{ active: statusFilter === '200' }"
            :aria-pressed="statusFilter === '200'"
            @click="selectStatusFilter('200')"
          >
            <span class="chip-check" aria-hidden="true"></span>
            200
          </button>
          <button
            type="button"
            class="status-chip"
            :class="{ active: statusFilter === '4xx' }"
            :aria-pressed="statusFilter === '4xx'"
            @click="selectStatusFilter('4xx')"
          >
            <span class="chip-check" aria-hidden="true"></span>
            4xx
          </button>
          <button
            type="button"
            class="status-chip"
            :class="{ active: statusFilter === '5xx' }"
            :aria-pressed="statusFilter === '5xx'"
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
        <input
          v-model="userInput"
          class="control-input"
          type="text"
          :placeholder="locale.t('requestLog.filter.userPlaceholder')"
          :aria-label="locale.t('requestLog.filter.userPlaceholder')"
          @keyup.enter="applyToolbarFilters"
          @change="applyToolbarFilters"
        />
        <cds-button action="outline" size="sm" :disabled="exportingCsv" @click="exportCsv">
          <cds-icon shape="download" size="sm" aria-hidden="true"></cds-icon>
          {{ exportingCsv ? locale.t('requestLog.export.inProgress') : locale.t('requestLog.action.export') }}
        </cds-button>
      </div>

      <div v-if="timeWindow === 'custom'" class="custom-range">
        <label class="time-field">
          <span>{{ locale.t('requestLog.filter.from') }}</span>
          <input type="datetime-local" v-model="customFrom" @change="currentPage = 1" />
        </label>
        <label class="time-field">
          <span>{{ locale.t('requestLog.filter.to') }}</span>
          <input type="datetime-local" v-model="customTo" @change="currentPage = 1" />
        </label>
      </div>

      <div v-if="anyFilterActive" class="filter-summary">
        <span>{{ locale.t('requestLog.filter.activeHint') }}</span>
        <button type="button" class="link-button" @click="clearAllFilters">
          {{ locale.t('requestLog.filter.clearAll') }}
        </button>
      </div>

    <div class="grid-card">
      <cds-grid
        border="row"
        column-layout="flex"
        role="grid"
        :aria-label="locale.t('requestLog.table.label')"
      >
        <cds-grid-column width="13%">
          <div class="col-head">
            <span>{{ locale.t('requestLog.col.time') }}</span>
          </div>
        </cds-grid-column>
        <cds-grid-column width="13%">
          <div class="col-head">
            <span>{{ locale.t('requestLog.col.requestId') }}</span>
          </div>
        </cds-grid-column>
        <cds-grid-column width="16%">
          <div class="col-head">
            <span>{{ locale.t('requestLog.col.agentId') }}</span>
          </div>
        </cds-grid-column>
        <cds-grid-column width="10%">
          <div class="col-head">
            <span>{{ locale.t('requestLog.col.user') }}</span>
          </div>
        </cds-grid-column>
        <cds-grid-column width="11%">
          <div class="col-head">
            <span>{{ locale.t('requestLog.col.model') }}</span>
          </div>
        </cds-grid-column>
        <cds-grid-column width="8%">
          <div class="col-head">
            <span>{{ locale.t('requestLog.col.inputTokens') }}</span>
          </div>
        </cds-grid-column>
        <cds-grid-column width="8%">
          <div class="col-head">
            <span>{{ locale.t('requestLog.col.outputTokens') }}</span>
          </div>
        </cds-grid-column>
        <cds-grid-column width="9%">
          <div class="col-head">
            <span>{{ locale.t('requestLog.col.latencyMs') }}</span>
          </div>
        </cds-grid-column>
        <cds-grid-column width="6%">
          <div class="col-head">
            <span>{{ locale.t('requestLog.col.status') }}</span>
          </div>
        </cds-grid-column>
        <cds-grid-column width="6%">
          <div class="col-head">
            <span>{{ locale.t('requestLog.col.actions') }}</span>
          </div>
        </cds-grid-column>

        <cds-grid-row v-for="log in visibleLogs" :key="log.id">
          <cds-grid-cell class="mono nowrap time-cell">{{ formatDateTime(log.createdAt) }}</cds-grid-cell>
          <cds-grid-cell>
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
          </cds-grid-cell>
          <cds-grid-cell>
            <span class="ellipsis" :title="dash(log.agentId)">{{ dash(log.agentId) }}</span>
          </cds-grid-cell>
          <cds-grid-cell>
            <span class="ellipsis mono" :title="dash(log.userId)">{{ log.userId ? log.userId.slice(0, 8) : '—' }}</span>
          </cds-grid-cell>
          <cds-grid-cell>
            <span class="ellipsis" :title="dash(log.model)">{{ dash(log.model) }}</span>
          </cds-grid-cell>
          <cds-grid-cell class="tabular num-cell">{{ formatNumber(log.inputTokens) }}</cds-grid-cell>
          <cds-grid-cell class="tabular num-cell">{{ formatNumber(log.outputTokens) }}</cds-grid-cell>
          <cds-grid-cell class="tabular num-cell">{{ formatNumber(log.latencyMs) }}</cds-grid-cell>
          <cds-grid-cell>
            <span class="status-pill" :data-tone="statusTone(log.statusCode)">
              <span class="status-dot" aria-hidden="true"></span>
              {{ log.statusCode }}
            </span>
          </cds-grid-cell>
          <cds-grid-cell class="action-cell">
            <button
              type="button"
              class="row-action"
              :disabled="!log.detail"
              :title="locale.t('requestLog.action.toggleDetail')"
              :aria-label="locale.t('requestLog.action.toggleDetail')"
              @click="openDetail(log)"
            >
              <cds-icon shape="zoom" size="sm"></cds-icon>
            </button>
          </cds-grid-cell>
        </cds-grid-row>

        <cds-grid-placeholder v-if="loading && visibleLogs.length === 0" role="status" aria-live="polite">
          <cds-icon shape="history" size="xl"></cds-icon>
          <p cds-text="subsection">{{ locale.t('requestLog.loading') }}</p>
        </cds-grid-placeholder>

        <cds-grid-placeholder v-else-if="isEmpty" role="status" aria-live="polite">
          <cds-icon shape="filter" size="xl"></cds-icon>
          <p cds-text="subsection">{{ locale.t('requestLog.empty') }}</p>
        </cds-grid-placeholder>

        <cds-grid-footer v-if="totalCount > 0">
          <div class="log-pager">
            <label for="request-log-page-size">
              {{ locale.t('requestLog.pagination.pageSize') }}
            </label>
            <cds-select control-width="shrink">
              <select
                id="request-log-page-size"
                :value="pageSize"
                :aria-label="locale.t('requestLog.pagination.pageSize')"
                @change="onPageSizeChange"
              >
                <option v-for="option in PAGE_SIZE_OPTIONS" :key="option" :value="option">
                  {{ option }}
                </option>
              </select>
            </cds-select>

            <span class="range-summary">{{ rangeText }}</span>

            <cds-pagination :aria-label="locale.t('requestLog.pagination.label')">
              <cds-pagination-button
                action="first"
                :disabled="!hasPrevPage"
                :aria-label="locale.t('agents.pager.first')"
                @click="goFirst"
              ></cds-pagination-button>
              <cds-pagination-button
                action="prev"
                :disabled="!hasPrevPage"
                :aria-label="locale.t('agents.pager.prev')"
                @click="goPrev"
              ></cds-pagination-button>
              <cds-input cds-pagination-number>
                <input
                  type="number"
                  :value="currentPage"
                  :min="1"
                  :max="totalPages"
                  :aria-label="locale.t('requestLog.pagination.page')"
                  @change="goToPage(Number(($event.target as HTMLInputElement).value))"
                />
              </cds-input>
              <cds-pagination-button
                action="next"
                :disabled="!hasNextPage"
                :aria-label="locale.t('agents.pager.next')"
                @click="goNext"
              ></cds-pagination-button>
              <cds-pagination-button
                action="last"
                :disabled="!hasNextPage"
                :aria-label="locale.t('agents.pager.last')"
                @click="goLast"
              ></cds-pagination-button>
            </cds-pagination>
          </div>
        </cds-grid-footer>
      </cds-grid>

      <!-- Detail modal — replaces the inline expandable row pattern that
           the raw HTML <table> supported. cds-grid doesn't have a
           built-in row-span mechanism, so we promote the detail to a
           modal dialog triggered by the action button. -->
      <cds-modal
        :hidden="detailModalId === null"
        size="md"
        @closeChange="closeDetail"
      >
        <cds-modal-header>
          <h2 cds-text="title" class="modal-title">
            {{ locale.t('requestLog.detail.title') }}
          </h2>
        </cds-modal-header>
        <cds-modal-content>
          <pre class="detail-text">{{ detailText(detailModalLog?.detail) }}</pre>
        </cds-modal-content>
        <cds-modal-actions>
          <cds-button action="outline" @click="closeDetail">
            {{ locale.t('common.close') }}
          </cds-button>
        </cds-modal-actions>
      </cds-modal>
    </div>
  </section>
</template>

<style scoped>
.custom-range {
  display: flex;
  gap: 0.75rem;
  margin: 0 0 0.5rem;
}
.custom-range .time-field {
  display: flex;
  flex-direction: column;
  font-size: 0.7rem;
  gap: 0.15rem;
}
.custom-range .time-field input {
  padding: 0.25rem 0.4rem;
}
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
  color: var(--cds-alias-object-interaction-color, #0072a3);
}
.refresh-button:focus-visible {
  outline: 2px solid var(--cds-alias-object-interaction-color, #0072a3);
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
.grid-card {
  /* Mirrors ModelGatewayView's `.grid-card` wrapper: provides the
     card chrome (border, radius, background) and owns the horizontal
     scrollbar. cds-grid-footer inside is positioned by cds-grid itself.
     Right-edge alignment is handled by `.request-log-page`'s negative
     margin-right (so title / toolbar / card stay aligned with the
     AppShell topbar at wide viewports). */
  overflow-x: auto;
  overflow-y: hidden;
  min-width: 0;
  border: 1px solid var(--cds-alias-object-border-color, #d7d7d7);
  border-radius: 6px;
  background: var(--cds-alias-object-container-background, #fff);
  /* Don't grow vertically: the page wrapper already stretches via the
     page flex layout. Growing too would push the scrollbar to the
     bottom of the page instead of keeping it under the table. */
  flex: 0 0 auto;
}

/* The cds-grid itself reserves the table's natural width; its shadow-DOM
   `.scroll-container` already has `overflow: auto`, so the card-level
   `overflow-x: auto` here only kicks in as a backstop. Same shape as
   ModelGatewayView + VirtualKeyView — at viewports below the natural
   width the table scrolls horizontally instead of squeezing the action
   column past the icon button. */
.request-log-page cds-grid {
  display: block;
  width: 100%;
  max-width: 100%;
  min-width: 0;
  overflow-x: auto;
  overflow-y: hidden;
  /* Mirrors the 1180px floor used by ModelGatewayView and VirtualKeyView —
     wide enough that all 10 columns keep their declared percentage shares
     (incl. the 3% actions column hosting the row zoom button) without
     clipping, narrow enough that 1366×768 viewports still get a scrollbar. */
  min-width: 1180px;
}

/* Hand-assembled pager that lives inside cds-grid-footer. cds-grid
   pushes slotted cds-pagination to the right; the label + select +
   summary sit on the left of the pagination. */
.log-pager {
  display: inline-flex;
  align-items: center;
  gap: var(--cds-global-space-4, 8px);
  white-space: nowrap;
  font-size: 12px;
  color: var(--cds-alias-typography-color-300, #565656);
  /* cds-grid-footer slots children inline; margin-left: auto pushes
     this to the right edge of the footer row, matching model-gateway. */
  margin-left: auto;
}
.log-pager > label {
  color: var(--cds-alias-typography-color-300, #565656);
}
.range-summary {
  color: var(--cds-alias-typography-color-300, #565656);
  white-space: nowrap;
}

/* Cell-content helpers — reused across multiple cds-grid cells. */
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
/* 4xx (client error) = amber, distinct from 5xx danger red. */
.status-pill[data-tone='warning'] {
  color: var(--cds-alias-status-warning, #9a6700);
}
.status-pill[data-tone='warning'] .status-dot {
  background: var(--cds-alias-status-warning, #c25400);
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
/* Detail modal — JSON pretty-print, monospaced, scrollable. */
.detail-text {
  margin: 0;
  min-height: 72px;
  max-height: 360px;
  overflow: auto;
  color: var(--cds-alias-object-app-foreground, #1b1b1b);
  background: var(--cds-alias-object-app-background, #f5f7fa);
  border: 1px solid var(--cds-alias-object-border-color, #d7d7d7);
  border-radius: 4px;
  padding: 12px;
  font-family: var(--cds-global-typography-monospace-font-family, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace);
  font-size: 12px;
  line-height: 1.45;
  white-space: pre-wrap;
  word-break: break-word;
}
.modal-title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--cds-alias-object-app-foreground, #1d2129);
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
}
@media (prefers-reduced-motion: reduce) {
  .spinning {
    animation: none;
  }
}
</style>
// Cache bust Mon Jul 20 13:24:44 CST 2026
