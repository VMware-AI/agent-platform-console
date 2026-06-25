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
type FilterColumn = 'STATUS' | 'MODEL' | 'AGENT' | 'REQUEST'

// HTTP status families drive the badge colour. 2xx → success, 4xx → warning,
// 5xx → danger, anything else (incl. 0/unknown) → neutral.
type StatusFamily = 'success' | 'warning' | 'danger' | 'neutral'
function statusFamily(code: number): StatusFamily {
  if (code >= 200 && code < 300) return 'success'
  if (code >= 400 && code < 500) return 'warning'
  if (code >= 500) return 'danger'
  return 'neutral'
}

// ---- Filters (wired to RequestLogFilter) ----------------------------------
// Each filter is committed to a separate "applied" ref so editing the draft in
// the dropdown does not refetch on every keystroke — it applies on confirm.
const statusCodeInput = ref('')
const modelInput = ref('')
const agentIdInput = ref('')
const requestIdInput = ref('')

const appliedStatusCode = ref<number | null>(null)
const appliedModel = ref('')
const appliedAgentId = ref('')
const appliedRequestId = ref('')

const filterMenuAnchor = ref<HTMLElement | null>(null)
const filterMenuKey = ref<FilterColumn | null>(null)

// ---- Pagination (offset/limit via PageInput) ------------------------------
// The op returns a bare list with no total, so "has more" is inferred from the
// returned row count: a full page (== limit) implies another page may exist.
const pageSize = ref<PageSize>(20)
const currentPage = ref(1)

const offset = computed(() => (currentPage.value - 1) * pageSize.value)

const filter = computed<RequestLogFilterInput | null>(() => {
  const next: RequestLogFilterInput = {}
  if (appliedStatusCode.value !== null) next.statusCode = appliedStatusCode.value
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
const isEmpty = computed(() => !loading.value && logs.value.length === 0)

const rangeText = computed(() => {
  if (logs.value.length === 0) return locale.t('requestLog.pagination.empty')
  const start = offset.value + 1
  const end = offset.value + logs.value.length
  return locale
    .t('requestLog.pagination.range')
    .replace('{start}', String(start))
    .replace('{end}', String(end))
})

// ---- Formatting ------------------------------------------------------------
function formatDateTime(value: string): string {
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  return new Intl.DateTimeFormat(locale.locale, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(parsed)
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat(locale.locale === 'zh' ? 'zh-CN' : 'en-US').format(value)
}

function formatLatency(ms: number): string {
  return locale.t('requestLog.value.latency').replace('{ms}', formatNumber(ms))
}

function dash(value: string | null): string {
  return value && value.trim() ? value : '—'
}

// ---- Detail expand ---------------------------------------------------------
const expandedId = ref<string | null>(null)
function toggleDetail(log: RequestLogNode) {
  if (!log.detail) return
  expandedId.value = expandedId.value === log.id ? null : log.id
}

// ---- Copy requestId --------------------------------------------------------
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
  } catch {
    toast.error(locale.t('requestLog.toast.copyFailed'))
  }
}

// ---- Filter menu -----------------------------------------------------------
function openFilterMenu(key: FilterColumn, event: MouseEvent) {
  filterMenuKey.value = key
  filterMenuAnchor.value = event.currentTarget as HTMLElement
  // Seed the draft inputs from the applied state so re-opening keeps the value.
  statusCodeInput.value = appliedStatusCode.value === null ? '' : String(appliedStatusCode.value)
  modelInput.value = appliedModel.value
  agentIdInput.value = appliedAgentId.value
  requestIdInput.value = appliedRequestId.value
}

function closeFilterMenu() {
  filterMenuKey.value = null
  filterMenuAnchor.value = null
}

function hasFilter(key: FilterColumn): boolean {
  switch (key) {
    case 'STATUS':
      return appliedStatusCode.value !== null
    case 'MODEL':
      return Boolean(appliedModel.value.trim())
    case 'AGENT':
      return Boolean(appliedAgentId.value.trim())
    case 'REQUEST':
      return Boolean(appliedRequestId.value.trim())
  }
}

const anyFilterActive = computed(
  () =>
    appliedStatusCode.value !== null ||
    Boolean(appliedModel.value.trim()) ||
    Boolean(appliedAgentId.value.trim()) ||
    Boolean(appliedRequestId.value.trim()),
)

function applyActiveFilter() {
  const key = filterMenuKey.value
  if (!key) return
  if (key === 'STATUS') {
    const raw = statusCodeInput.value.trim()
    if (!raw) {
      appliedStatusCode.value = null
    } else {
      const parsed = Number(raw)
      if (!Number.isInteger(parsed) || parsed < 0) {
        toast.warning(locale.t('requestLog.filter.statusInvalid'))
        return
      }
      appliedStatusCode.value = parsed
    }
  } else if (key === 'MODEL') {
    appliedModel.value = modelInput.value.trim()
  } else if (key === 'AGENT') {
    appliedAgentId.value = agentIdInput.value.trim()
  } else if (key === 'REQUEST') {
    appliedRequestId.value = requestIdInput.value.trim()
  }
  currentPage.value = 1
  closeFilterMenu()
}

function clearActiveFilter() {
  const key = filterMenuKey.value
  if (!key) return
  if (key === 'STATUS') {
    statusCodeInput.value = ''
    appliedStatusCode.value = null
  } else if (key === 'MODEL') {
    modelInput.value = ''
    appliedModel.value = ''
  } else if (key === 'AGENT') {
    agentIdInput.value = ''
    appliedAgentId.value = ''
  } else if (key === 'REQUEST') {
    requestIdInput.value = ''
    appliedRequestId.value = ''
  }
  currentPage.value = 1
  closeFilterMenu()
}

function clearAllFilters() {
  appliedStatusCode.value = null
  appliedModel.value = ''
  appliedAgentId.value = ''
  appliedRequestId.value = ''
  statusCodeInput.value = ''
  modelInput.value = ''
  agentIdInput.value = ''
  requestIdInput.value = ''
  currentPage.value = 1
}

// ---- Pagination handlers ---------------------------------------------------
function onPageSizeChange(event: Event) {
  const next = Number((event.target as HTMLSelectElement).value)
  if (!PAGE_SIZE_OPTIONS.includes(next as PageSize)) return
  pageSize.value = next as PageSize
  currentPage.value = 1
}

function goPrev() {
  if (!hasPrevPage.value) return
  currentPage.value -= 1
}

function goNext() {
  if (!hasNextPage.value) return
  currentPage.value += 1
}

async function refreshLogs() {
  if (loading.value) return
  try {
    await refetch()
    toast.success(locale.t('requestLog.toast.refreshed'))
  } catch (error) {
    toast.error(graphqlErrorMessage(error, locale.t('requestLog.toast.refreshFailed')))
  }
}
</script>

<template>
  <section class="request-log-page">
    <header class="page-head">
      <h1 cds-text="title" class="heading">{{ locale.t('requestLog.title') }}</h1>
      <p cds-text="body" class="desc muted">{{ locale.t('requestLog.description') }}</p>
    </header>

    <div class="content-card">
      <div class="toolbar">
        <span v-if="anyFilterActive" class="filter-summary">
          {{ locale.t('requestLog.filter.activeHint') }}
          <button type="button" class="link-button" @click="clearAllFilters">
            {{ locale.t('requestLog.filter.clearAll') }}
          </button>
        </span>

        <cds-button
          action="ghost"
          class="refresh-button"
          :disabled="loading"
          :aria-label="locale.t('requestLog.action.refresh')"
          :title="locale.t('requestLog.action.refresh')"
          @click="refreshLogs"
        >
          <cds-icon shape="refresh" size="md" :class="{ spinning: loading }"></cds-icon>
          <span>{{ locale.t('requestLog.action.refresh') }}</span>
        </cds-button>
      </div>

      <div class="grid-card">
        <cds-grid
          border="row"
          column-layout="flex"
          role="grid"
          :aria-label="locale.t('requestLog.table.label')"
        >
          <cds-grid-column width="15%">{{ locale.t('requestLog.col.time') }}</cds-grid-column>

          <cds-grid-column width="15%">
            <div class="column-head">
              <span>{{ locale.t('requestLog.col.model') }}</span>
              <cds-button-action
                shape="filter"
                :expanded="hasFilter('MODEL')"
                :aria-label="locale.t('requestLog.filter.aria').replace('{column}', locale.t('requestLog.col.model'))"
                @click="(event: MouseEvent) => openFilterMenu('MODEL', event)"
              ></cds-button-action>
            </div>
          </cds-grid-column>

          <cds-grid-column width="13%">
            <div class="column-head">
              <span>{{ locale.t('requestLog.col.agent') }}</span>
              <cds-button-action
                shape="filter"
                :expanded="hasFilter('AGENT')"
                :aria-label="locale.t('requestLog.filter.aria').replace('{column}', locale.t('requestLog.col.agent'))"
                @click="(event: MouseEvent) => openFilterMenu('AGENT', event)"
              ></cds-button-action>
            </div>
          </cds-grid-column>

          <cds-grid-column width="9%">
            <div class="column-head">
              <span>{{ locale.t('requestLog.col.status') }}</span>
              <cds-button-action
                shape="filter"
                :expanded="hasFilter('STATUS')"
                :aria-label="locale.t('requestLog.filter.aria').replace('{column}', locale.t('requestLog.col.status'))"
                @click="(event: MouseEvent) => openFilterMenu('STATUS', event)"
              ></cds-button-action>
            </div>
          </cds-grid-column>

          <cds-grid-column width="10%">{{ locale.t('requestLog.col.latency') }}</cds-grid-column>
          <cds-grid-column width="14%">{{ locale.t('requestLog.col.tokens') }}</cds-grid-column>

          <cds-grid-column width="24%">
            <div class="column-head">
              <span>{{ locale.t('requestLog.col.requestId') }}</span>
              <cds-button-action
                shape="filter"
                :expanded="hasFilter('REQUEST')"
                :aria-label="locale.t('requestLog.filter.aria').replace('{column}', locale.t('requestLog.col.requestId'))"
                @click="(event: MouseEvent) => openFilterMenu('REQUEST', event)"
              ></cds-button-action>
            </div>
          </cds-grid-column>

          <template v-for="log in logs" :key="log.id">
            <cds-grid-row>
              <cds-grid-cell>
                <span class="mono nowrap">{{ formatDateTime(log.createdAt) }}</span>
              </cds-grid-cell>
              <cds-grid-cell>
                <span :title="dash(log.model)" class="ellipsis">{{ dash(log.model) }}</span>
              </cds-grid-cell>
              <cds-grid-cell>
                <span :title="dash(log.agentId)" class="ellipsis mono">{{ dash(log.agentId) }}</span>
              </cds-grid-cell>
              <cds-grid-cell>
                <cds-badge :status="statusFamily(log.statusCode)" class="status-badge">
                  {{ log.statusCode }}
                </cds-badge>
              </cds-grid-cell>
              <cds-grid-cell>
                <span class="nowrap tabular">{{ formatLatency(log.latencyMs) }}</span>
              </cds-grid-cell>
              <cds-grid-cell>
                <span
                  class="nowrap tabular"
                  :title="locale.t('requestLog.value.tokensTitle')
                    .replace('{in}', formatNumber(log.inputTokens))
                    .replace('{out}', formatNumber(log.outputTokens))"
                >
                  {{ formatNumber(log.inputTokens) }} / {{ formatNumber(log.outputTokens) }}
                </span>
              </cds-grid-cell>
              <cds-grid-cell>
                <div class="request-id-cell">
                  <button
                    type="button"
                    class="copy-button"
                    :title="locale.t('requestLog.action.copy')"
                    :aria-label="locale.t('requestLog.action.copy')"
                    @click="copyRequestId(log.requestId)"
                  >
                    <span class="mono ellipsis">{{ log.requestId }}</span>
                    <cds-icon shape="copy" size="sm" aria-hidden="true"></cds-icon>
                  </button>
                  <button
                    v-if="log.detail"
                    type="button"
                    class="detail-toggle"
                    :aria-expanded="expandedId === log.id"
                    :title="locale.t('requestLog.action.toggleDetail')"
                    :aria-label="locale.t('requestLog.action.toggleDetail')"
                    @click="toggleDetail(log)"
                  >
                    <cds-icon
                      shape="angle"
                      :direction="expandedId === log.id ? 'down' : 'right'"
                      size="sm"
                    ></cds-icon>
                  </button>
                </div>
              </cds-grid-cell>
            </cds-grid-row>

            <cds-grid-row v-if="expandedId === log.id && log.detail" class="detail-row">
              <cds-grid-cell class="detail-cell">
                <div class="detail-panel">
                  <span class="detail-label">{{ locale.t('requestLog.col.detail') }}</span>
                  <pre class="detail-text">{{ log.detail }}</pre>
                </div>
              </cds-grid-cell>
            </cds-grid-row>
          </template>

          <cds-grid-placeholder v-if="loading && logs.length === 0">
            <cds-icon shape="history" size="xl"></cds-icon>
            <p cds-text="subsection">{{ locale.t('requestLog.loading') }}</p>
          </cds-grid-placeholder>

          <cds-grid-placeholder v-else-if="isEmpty">
            <cds-icon shape="filter" size="xl"></cds-icon>
            <p cds-text="subsection">{{ locale.t('requestLog.empty') }}</p>
            <cds-button v-if="anyFilterActive" action="outline" size="sm" @click="clearAllFilters">
              {{ locale.t('requestLog.filter.clearAll') }}
            </cds-button>
          </cds-grid-placeholder>

          <cds-grid-footer v-if="logs.length > 0 || hasPrevPage">
            <div class="pager">
              <label for="request-log-page-size">{{ locale.t('requestLog.pagination.pageSize') }}</label>
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
              <span class="pager-summary">{{ rangeText }}</span>
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
            </div>
          </cds-grid-footer>
        </cds-grid>
      </div>
    </div>

    <cds-dropdown
      v-if="filterMenuAnchor && filterMenuKey"
      :hidden="false"
      :anchor="filterMenuAnchor"
      closable
      @closeChange="closeFilterMenu"
    >
      <div class="filter-panel">
        <input
          v-if="filterMenuKey === 'STATUS'"
          class="filter-input"
          type="number"
          inputmode="numeric"
          :value="statusCodeInput"
          :placeholder="locale.t('requestLog.filter.statusPlaceholder')"
          :aria-label="locale.t('requestLog.filter.statusPlaceholder')"
          @input="statusCodeInput = ($event.target as HTMLInputElement).value"
          @keyup.enter="applyActiveFilter"
        />
        <input
          v-else-if="filterMenuKey === 'MODEL'"
          class="filter-input"
          type="text"
          :value="modelInput"
          :placeholder="locale.t('requestLog.filter.modelPlaceholder')"
          :aria-label="locale.t('requestLog.filter.modelPlaceholder')"
          @input="modelInput = ($event.target as HTMLInputElement).value"
          @keyup.enter="applyActiveFilter"
        />
        <input
          v-else-if="filterMenuKey === 'AGENT'"
          class="filter-input"
          type="text"
          :value="agentIdInput"
          :placeholder="locale.t('requestLog.filter.agentPlaceholder')"
          :aria-label="locale.t('requestLog.filter.agentPlaceholder')"
          @input="agentIdInput = ($event.target as HTMLInputElement).value"
          @keyup.enter="applyActiveFilter"
        />
        <input
          v-else
          class="filter-input"
          type="text"
          :value="requestIdInput"
          :placeholder="locale.t('requestLog.filter.requestPlaceholder')"
          :aria-label="locale.t('requestLog.filter.requestPlaceholder')"
          @input="requestIdInput = ($event.target as HTMLInputElement).value"
          @keyup.enter="applyActiveFilter"
        />

        <div class="filter-footer">
          <cds-button
            v-if="hasFilter(filterMenuKey)"
            action="outline"
            size="sm"
            @click="clearActiveFilter"
          >
            {{ locale.t('requestLog.filter.clear') }}
          </cds-button>
          <cds-button action="solid" status="primary" size="sm" @click="applyActiveFilter">
            {{ locale.t('requestLog.filter.apply') }}
          </cds-button>
        </div>
      </div>
    </cds-dropdown>
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
.content-card {
  flex: 1 1 auto;
  min-height: 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 12px;
  border: 1px solid var(--cds-alias-object-border-color, #d7d7d7);
  border-radius: 6px;
  background: var(--cds-alias-object-container-background, #fff);
  margin-top: 20px;
}
.toolbar {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 32px;
}
.filter-summary {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--cds-alias-typography-color-300, #565656);
  font-size: 13px;
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
.refresh-button {
  margin-left: auto;
}
.grid-card {
  flex: 1 1 auto;
  min-height: 0;
  min-width: 0;
  overflow: auto;
  border: 1px solid var(--cds-alias-object-border-color, #d7d7d7);
  border-radius: 4px;
}
.request-log-page cds-grid {
  display: block;
  width: 100%;
  min-width: 920px;
  min-height: 100%;
}
.column-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 4px;
  width: 100%;
  min-width: 0;
}
.mono {
  font-family: var(--cds-global-typography-monospace-font-family, monospace);
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
.status-badge {
  min-width: 44px;
  justify-content: center;
  font-variant-numeric: tabular-nums;
}
.request-id-cell {
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
}
.copy-button {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  padding: 4px 6px;
  border: 0;
  border-radius: 3px;
  background: transparent;
  color: var(--cds-alias-object-interaction-color, #006e9c);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}
.copy-button:hover {
  background: var(--cds-alias-object-app-background, #f4f4f4);
}
.copy-button cds-icon {
  flex: 0 0 auto;
}
.detail-toggle {
  display: inline-flex;
  align-items: center;
  flex: 0 0 auto;
  padding: 4px;
  border: 0;
  border-radius: 3px;
  background: transparent;
  color: var(--cds-alias-object-app-foreground, #1b1b1b);
  cursor: pointer;
}
.detail-toggle:hover {
  background: var(--cds-alias-object-app-background, #f4f4f4);
}
.detail-row {
  background: var(--cds-alias-object-app-background, #f7f7f7);
}
.detail-cell {
  grid-column: 1 / -1;
}
.detail-panel {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px 4px;
  width: 100%;
}
.detail-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--cds-alias-typography-color-300, #565656);
}
.detail-text {
  margin: 0;
  padding: 8px 10px;
  max-height: 220px;
  overflow: auto;
  border: 1px solid var(--cds-alias-object-border-color, #e0e0e0);
  border-radius: 3px;
  background: var(--cds-alias-object-container-background, #fff);
  color: var(--cds-alias-object-app-foreground, #1b1b1b);
  font-family: var(--cds-global-typography-monospace-font-family, monospace);
  font-size: 12px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
}
.pager {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  margin-left: auto;
  white-space: nowrap;
}
.pager > label,
.pager-summary {
  color: var(--cds-alias-typography-color-300, #565656);
}
.page-indicator {
  min-width: 24px;
  text-align: center;
  font-variant-numeric: tabular-nums;
}
.filter-panel {
  min-width: 250px;
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.filter-input {
  width: 100%;
  min-height: 32px;
  padding: 6px 9px;
  border: 1px solid var(--cds-alias-object-border-color, #8c8c8c);
  border-radius: 3px;
  background: var(--cds-alias-object-container-background, #fff);
  color: var(--cds-alias-object-app-foreground, #1b1b1b);
  font: inherit;
}
.filter-input:focus {
  border-color: var(--cds-alias-object-interaction-color, #0072a3);
  outline: 2px solid color-mix(in srgb, var(--cds-alias-object-interaction-color, #0072a3) 20%, transparent);
  outline-offset: 1px;
}
.filter-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding-top: 4px;
  border-top: 1px solid var(--cds-alias-object-border-color, #e8e8e8);
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
@media (max-width: 900px) {
  .refresh-button span {
    display: none;
  }
}
@media (prefers-reduced-motion: reduce) {
  .spinning {
    animation: none;
  }
}
</style>
