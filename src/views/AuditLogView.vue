<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useQuery } from '@vue/apollo-composable'
import { useLocaleStore } from '@/stores/locale'
import { useToast } from '@/composables/useToast'
import { graphqlErrorMessage } from '@/api/graphql/errors'
import { csvCell } from '@/utils/csv'
import {
  AUDIT_LOGS_QUERY,
  type AuditLogNode,
  type AuditLogsResult,
  type AuditLogsVars,
} from '@/api/graphql/queries/audit-logs'
import { apolloClient } from '@/api/graphql/client'
import '@/components/icons'

const locale = useLocaleStore()
const toast = useToast()

const PAGE_SIZE_OPTIONS = [10, 20, 50] as const
type PageSize = (typeof PAGE_SIZE_OPTIONS)[number]
type TimeWindow = '1d' | '7d' | 'custom'

const ACTION_PREFIXES = [
  'user.',
  'role.',
  'key.',
  'rate_limit.',
  'model_gateway.',
  'gateway.',
  'model_route.',
  'router.',
  'agent.',
  'agent_config.',
  'resource_pool.',
  'ova_template_family.',
  'ova_template_version.',
] as const
type ActionPrefix = (typeof ACTION_PREFIXES)[number]

const ACTION_VERB_KEYS = [
  'add', 'assign_role', 'change_password', 'create', 'delete', 'deploy',
  'issue', 'login', 'recycle', 'regenerate', 'register', 'remove',
  'remove_role', 'reset_password', 'revert_snapshot', 'revoke', 'set_default',
  'set_enabled', 'set_knowledge', 'set_permissions', 'set_status', 'set_tier',
  'snapshot', 'sync', 'test', 'toggle_enabled', 'update', 'upsert',
] as const

// `auditLog.action.<verb>` keys live in the locale dictionary; this set is
// used to quickly check whether an unknown verb has a translation. If not,
// we fall back to the snake_case verb (see actionLabel()).
const KNOWN_VERB_KEYS = new Set<string>(ACTION_VERB_KEYS)

const timeWindow = ref<TimeWindow>('1d')
const pageSize = ref<PageSize>(10)
const currentPage = ref(1)
const actionPrefix = ref<ActionPrefix | null>(null)
const searchInput = ref('')
const actorInput = ref('')
const appliedSearch = ref('')
const appliedActorUserId = ref('')
const resultFilter = ref<'all' | 'success' | 'fail'>('all')
const resourceTypeInput = ref('')
const appliedResourceType = ref('')
const customFrom = ref('')
const customTo = ref('')

// Time window pushed to the server (from/to) instead of filtering client-side —
// client-side filtering + offset pagination gave uneven pages and wrong counts.
const serverWindow = computed<{ from: string | null; to: string | null }>(() => {
  if (timeWindow.value === 'custom') {
    return {
      from: customFrom.value ? new Date(customFrom.value).toISOString() : null,
      to: customTo.value ? new Date(customTo.value).toISOString() : null,
    }
  }
  const days = timeWindow.value === '1d' ? 1 : 7
  const from = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
  return { from: from.toISOString(), to: null }
})

const queryVars = computed<AuditLogsVars>(() => ({
  filter: {
    actionPrefix: actionPrefix.value,
    search: appliedSearch.value.trim() || null,
    actorUserId: appliedActorUserId.value.trim() || null,
    from: serverWindow.value.from,
    to: serverWindow.value.to,
    result: resultFilter.value === 'all' ? null : resultFilter.value,
    resourceType: appliedResourceType.value.trim() || null,
  },
  page: {
    limit: pageSize.value,
    offset: (currentPage.value - 1) * pageSize.value,
  },
}))

const { result, loading, error, refetch } = useQuery<AuditLogsResult, AuditLogsVars>(
  AUDIT_LOGS_QUERY,
  queryVars,
  () => ({ fetchPolicy: 'cache-and-network' }),
)

const logs = computed<AuditLogNode[]>(() => result.value?.auditLogs.items ?? [])
const totalCount = computed(() => result.value?.auditLogs.total ?? 0)
const totalPages = computed(() => Math.max(1, Math.ceil(totalCount.value / pageSize.value)))

// The server now applies the time window (serverWindow → filter.from/to), so the
// page renders exactly what came back — no client-side re-filtering.
const visibleLogs = computed(() => logs.value)

const summaryText = computed(() => {
  if (totalCount.value === 0 || logs.value.length === 0) {
    return locale.t('auditLog.pagination.empty')
  }
  const start = (currentPage.value - 1) * pageSize.value + 1
  const end = Math.min(start + logs.value.length - 1, totalCount.value)
  return locale
    .t('auditLog.pagination.summary')
    .replace('{start}', String(start))
    .replace('{end}', String(end))
    .replace('{total}', String(totalCount.value))
})

const hasActiveFilters = computed(
  () =>
    actionPrefix.value !== null ||
    timeWindow.value !== '1d' ||
    resultFilter.value !== 'all' ||
    Boolean(appliedResourceType.value.trim()) ||
    Boolean(appliedSearch.value.trim()) ||
    Boolean(appliedActorUserId.value.trim()),
)

watch(totalPages, (pages) => {
  if (currentPage.value > pages) currentPage.value = pages
})

const errorMessage = computed(() =>
  error.value ? graphqlErrorMessage(error.value, locale.t('auditLog.error.load')) : null,
)

function applyFilters() {
  appliedSearch.value = searchInput.value.trim()
  appliedActorUserId.value = actorInput.value.trim()
  appliedResourceType.value = resourceTypeInput.value.trim()
  currentPage.value = 1
}

function clearFilters() {
  timeWindow.value = '1d'
  actionPrefix.value = null
  searchInput.value = ''
  actorInput.value = ''
  appliedSearch.value = ''
  appliedActorUserId.value = ''
  resultFilter.value = 'all'
  resourceTypeInput.value = ''
  appliedResourceType.value = ''
  customFrom.value = ''
  customTo.value = ''
  currentPage.value = 1
}

function onResultChange(event: Event) {
  resultFilter.value = (event.target as HTMLSelectElement).value as 'all' | 'success' | 'fail'
  currentPage.value = 1
}

// Export streams EVERY row matching the active filters (not just the visible
// page) via one-shot apolloClient.query() paging, capped so a huge range can't
// exhaust the tab. Mirrors the app's useAgentExport convention.
const EXPORT_PAGE_SIZE = 500
const EXPORT_CAP = 5000
const exportingCsv = ref(false)

async function fetchAllAuditLogs(): Promise<{ rows: AuditLogNode[]; total: number }> {
  const filter = queryVars.value.filter
  const rows: AuditLogNode[] = []
  let total = 0
  for (let offset = 0; offset < EXPORT_CAP; offset += EXPORT_PAGE_SIZE) {
    const { data } = await apolloClient.query<AuditLogsResult, AuditLogsVars>({
      query: AUDIT_LOGS_QUERY,
      variables: { filter, page: { limit: EXPORT_PAGE_SIZE, offset } },
      fetchPolicy: 'network-only',
    })
    total = data.auditLogs.total
    rows.push(...data.auditLogs.items)
    if (rows.length >= total || data.auditLogs.items.length < EXPORT_PAGE_SIZE) break
  }
  return { rows, total }
}

async function exportCsv() {
  if (exportingCsv.value) return
  exportingCsv.value = true
  try {
    const { rows, total } = await fetchAllAuditLogs()
    if (rows.length === 0) {
      toast.info(locale.t('auditLog.export.empty'))
      return
    }
    const header = ['createdAt', 'actor', 'action', 'resourceType', 'resourceId', 'ip', 'result']
    const lines = [header.join(',')]
    for (const l of rows) {
      lines.push(
        [
          l.createdAt,
          l.actorName ?? l.actorUserId,
          l.action,
          l.resourceType,
          l.resourceId,
          l.ip,
          l.result,
        ]
          .map(csvCell)
          .join(','),
      )
    }
    // UTF-8 BOM so Excel renders Chinese actor/resource names correctly.
    const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `audit-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
    if (rows.length < total) {
      toast.info(locale.t('auditLog.export.truncated').replace('{count}', String(rows.length)))
    } else {
      toast.success(locale.t('auditLog.export.success').replace('{count}', String(rows.length)))
    }
  } catch (err) {
    toast.error(graphqlErrorMessage(err, locale.t('auditLog.export.fail')))
  } finally {
    exportingCsv.value = false
  }
}

function selectTimeWindow(next: TimeWindow) {
  timeWindow.value = next
  currentPage.value = 1
}

function onActionPrefixChange(event: Event) {
  const next = (event.target as HTMLSelectElement).value
  actionPrefix.value = next ? (next as ActionPrefix) : null
  currentPage.value = 1
}

async function refresh() {
  if (loading.value) return
  applyFilters()
  try {
    await refetch()
    toast.success(locale.t('auditLog.toast.refreshed'))
  } catch (err) {
    toast.error(graphqlErrorMessage(err, locale.t('auditLog.toast.refreshFailed')))
  }
}

function onPageSizeChange(event: Event) {
  const next = Number((event.target as HTMLSelectElement).value)
  if (!PAGE_SIZE_OPTIONS.includes(next as PageSize)) return
  pageSize.value = next as PageSize
  currentPage.value = 1
}

function goToPage(page: number) {
  if (page < 1 || page > totalPages.value) return
  currentPage.value = page
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

function shortId(value: string | null | undefined, keep = 8): string {
  if (!value) return '—'
  return value.length > keep + 4 ? `${value.slice(0, keep)}...` : value
}

function actorLabel(log: AuditLogNode): string {
  if (log.actorName) return log.actorName
  if (!log.actorUserId) return locale.t('auditLog.value.system')
  return locale.t('auditLog.value.user').replace('{id}', shortId(log.actorUserId))
}

function isSuccess(value: string): boolean {
  return value.toLowerCase() === 'success' || value.toLowerCase() === 'true'
}

function actionPrefixLabel(prefix: string): string {
  const key = `auditLog.category.${prefix.replace(/\.$/, '')}`
  const label = locale.t(key)
  return label === key ? prefix.replace(/\.$/, '') : label
}

function actionLabel(action: string): string {
  const [category, ...verbParts] = action.split('.')
  const verb = verbParts.join('.') || action
  const categoryText = actionPrefixLabel(`${category}.`)
  const verbKey = `auditLog.action.${verb}`
  const verbText = KNOWN_VERB_KEYS.has(verb)
    ? locale.t(verbKey)
    : verb.replace(/_/g, ' ')
  return locale.locale === 'zh' ? `${categoryText}${verbText}` : `${categoryText} ${verbText}`
}

function actionDescription(log: AuditLogNode): string {
  const resource = log.resourceId ? shortId(log.resourceId, 12) : ''
  const type = log.resourceType ? log.resourceType.replace(/_/g, ' ') : ''
  const base = actionLabel(log.action)
  if (!resource && !type) return base
  if (locale.locale === 'zh') {
    return `${base}${type ? ` ${type}` : ''}${resource ? ` ${resource}` : ''}`
  }
  return `${base}${type ? ` ${type}` : ''}${resource ? ` ${resource}` : ''}`
}

function detailText(log: AuditLogNode): string {
  if (!log.detail) return actionDescription(log)
  try {
    return JSON.stringify(JSON.parse(log.detail), null, 2)
  } catch {
    return log.detail
  }
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

async function copyResourceId(value: string | null) {
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
    toast.success(locale.t('auditLog.toast.copied'))
  } catch (err) {
    toast.error(graphqlErrorMessage(err, locale.t('auditLog.toast.copyFailed')))
  }
}
</script>

<template>
  <section class="audit-page">
    <header class="page-head">
      <h1 cds-text="title" class="heading">{{ locale.t('auditLog.title') }}</h1>
      <p cds-text="body" class="desc muted">{{ locale.t('auditLog.description') }}</p>
    </header>

    <div class="toolbar" :aria-label="locale.t('auditLog.filter.toolbar')">
        <div class="time-tabs" role="group" :aria-label="locale.t('auditLog.filter.timeRange')">
          <button
            type="button"
            class="time-tab"
            :class="{ active: timeWindow === '1d' }"
            @click="selectTimeWindow('1d')"
          >
            <cds-icon shape="calendar" size="sm" aria-hidden="true"></cds-icon>
            {{ locale.t('auditLog.filter.last1d') }}
          </button>
          <button
            type="button"
            class="time-tab"
            :class="{ active: timeWindow === '7d' }"
            @click="selectTimeWindow('7d')"
          >
            {{ locale.t('auditLog.filter.last7d') }}
          </button>
          <button
            type="button"
            class="time-tab"
            :class="{ active: timeWindow === 'custom' }"
            @click="selectTimeWindow('custom')"
          >
            {{ locale.t('auditLog.filter.customRange') }}
          </button>
        </div>

        <button
          type="button"
          class="refresh-button"
          :disabled="loading"
          :aria-label="locale.t('auditLog.action.refresh')"
          :title="locale.t('auditLog.action.refresh')"
          @click="refresh"
        >
          <cds-icon shape="refresh" size="md" :class="{ spinning: loading }" aria-hidden="true"></cds-icon>
        </button>

        <div class="toolbar-break"></div>

        <input
          v-model="actorInput"
          class="control-input actor-input"
          type="text"
          :placeholder="locale.t('auditLog.filter.actorPlaceholder')"
          :aria-label="locale.t('auditLog.filter.actorPlaceholder')"
          @keyup.enter="applyFilters"
          @change="applyFilters"
        />

        <cds-select control-width="shrink" class="action-select">
          <select
            :value="actionPrefix ?? ''"
            :aria-label="locale.t('auditLog.filter.actionType')"
            @change="onActionPrefixChange"
          >
            <option value="">{{ locale.t('auditLog.filter.allActionTypes') }}</option>
            <option v-for="prefix in ACTION_PREFIXES" :key="prefix" :value="prefix">
              {{ actionPrefixLabel(prefix) }}
            </option>
          </select>
        </cds-select>

        <label class="search-box">
          <cds-icon shape="search" size="sm" aria-hidden="true"></cds-icon>
          <input
            v-model="searchInput"
            type="search"
            :placeholder="locale.t('auditLog.filter.searchPlaceholder')"
            :aria-label="locale.t('auditLog.filter.searchPlaceholder')"
            @keyup.enter="applyFilters"
            @change="applyFilters"
          />
        </label>

        <cds-select control-width="shrink" class="action-select">
          <select :value="resultFilter" :aria-label="locale.t('auditLog.filter.result')" @change="onResultChange">
            <option value="all">{{ locale.t('auditLog.filter.allResults') }}</option>
            <option value="success">{{ locale.t('auditLog.result.success') }}</option>
            <option value="fail">{{ locale.t('auditLog.result.fail') }}</option>
          </select>
        </cds-select>

        <input
          v-model="resourceTypeInput"
          class="control-input actor-input"
          type="text"
          :placeholder="locale.t('auditLog.filter.resourceTypePlaceholder')"
          :aria-label="locale.t('auditLog.filter.resourceTypePlaceholder')"
          @keyup.enter="applyFilters"
          @change="applyFilters"
        />

        <cds-button action="outline" size="sm" :disabled="exportingCsv" @click="exportCsv">
          <cds-icon shape="download" size="sm" aria-hidden="true"></cds-icon>
          {{ exportingCsv ? locale.t('auditLog.export.inProgress') : locale.t('auditLog.action.export') }}
        </cds-button>
      </div>

      <div v-if="timeWindow === 'custom'" class="custom-range">
        <label class="time-field">
          <span>{{ locale.t('auditLog.filter.from') }}</span>
          <input type="datetime-local" v-model="customFrom" @change="currentPage = 1" />
        </label>
        <label class="time-field">
          <span>{{ locale.t('auditLog.filter.to') }}</span>
          <input type="datetime-local" v-model="customTo" @change="currentPage = 1" />
        </label>
      </div>

      <div v-if="hasActiveFilters" class="filter-summary">
        <span>{{ locale.t('auditLog.filter.activeHint') }}</span>
        <button type="button" class="link-button" @click="clearFilters">
          {{ locale.t('auditLog.filter.clear') }}
        </button>
      </div>

      <div v-if="errorMessage" class="error-banner" role="alert">
        <cds-icon shape="error-standard" size="sm"></cds-icon>
        <span>{{ errorMessage }}</span>
      </div>

    <div class="grid-card">
      <cds-grid
        border="row"
        column-layout="flex"
        role="grid"
        :aria-label="locale.t('auditLog.table.label')"
      >
        <cds-grid-column width="14%">
          <div class="col-head">
            <span>{{ locale.t('auditLog.col.actionTime') }}</span>
          </div>
        </cds-grid-column>
        <cds-grid-column width="13%">
          <div class="col-head">
            <span>{{ locale.t('auditLog.col.actor') }}</span>
          </div>
        </cds-grid-column>
        <cds-grid-column width="12%">
          <div class="col-head">
            <span>{{ locale.t('auditLog.col.actionType') }}</span>
          </div>
        </cds-grid-column>
        <cds-grid-column width="14%">
          <div class="col-head">
            <span>{{ locale.t('auditLog.col.resourceId') }}</span>
          </div>
        </cds-grid-column>
        <cds-grid-column width="12%">
          <div class="col-head">
            <span>{{ locale.t('auditLog.col.ip') }}</span>
          </div>
        </cds-grid-column>
        <cds-grid-column width="22%">
          <div class="col-head">
            <span>{{ locale.t('auditLog.col.description') }}</span>
          </div>
        </cds-grid-column>
        <cds-grid-column width="13%">
          <div class="col-head">
            <span>{{ locale.t('auditLog.col.result') }}</span>
          </div>
        </cds-grid-column>

        <cds-grid-row v-for="log in visibleLogs" :key="log.id">
          <cds-grid-cell class="mono nowrap time-cell">{{ formatDateTime(log.createdAt) }}</cds-grid-cell>
          <cds-grid-cell>
            <span class="ellipsis" :title="log.actorUserId ?? locale.t('auditLog.value.system')">
              {{ actorLabel(log) }}
            </span>
          </cds-grid-cell>
          <cds-grid-cell>
            <span class="ellipsis strong" :title="log.action">{{ actionLabel(log.action) }}</span>
          </cds-grid-cell>
          <cds-grid-cell>
            <button
              v-if="log.resourceId"
              type="button"
              class="resource-copy"
              :title="log.resourceId"
              :aria-label="locale.t('auditLog.action.copyResource')"
              @click="copyResourceId(log.resourceId)"
            >
              <span class="ellipsis">{{ shortId(log.resourceId, 6) }}</span>
              <cds-icon shape="copy" size="sm" aria-hidden="true"></cds-icon>
            </button>
            <span v-else class="muted">—</span>
          </cds-grid-cell>
          <cds-grid-cell>
            <span class="ellipsis" :title="log.ip ?? ''">{{ log.ip ?? '—' }}</span>
          </cds-grid-cell>
          <cds-grid-cell>
            <span class="ellipsis" :title="detailText(log)">{{ actionDescription(log) }}</span>
          </cds-grid-cell>
          <cds-grid-cell>
            <span class="result-pill" :data-tone="isSuccess(log.result) ? 'success' : 'danger'">
              <span class="result-dot" aria-hidden="true"></span>
              {{
                locale.t(
                  isSuccess(log.result) ? 'auditLog.result.success' : 'auditLog.result.fail',
                )
              }}
            </span>
          </cds-grid-cell>
        </cds-grid-row>

        <cds-grid-placeholder v-if="loading && visibleLogs.length === 0" role="status" aria-live="polite">
          <cds-icon shape="history" size="xl"></cds-icon>
          <p cds-text="subsection">{{ locale.t('auditLog.loading') }}</p>
        </cds-grid-placeholder>

        <cds-grid-placeholder v-else-if="visibleLogs.length === 0" role="status" aria-live="polite">
          <cds-icon shape="list" size="xl"></cds-icon>
          <p cds-text="subsection">
            {{ hasActiveFilters ? locale.t('auditLog.emptyFiltered') : locale.t('auditLog.empty') }}
          </p>
        </cds-grid-placeholder>

        <cds-grid-footer v-if="totalCount > 0">
          <div class="audit-pager">
            <label for="audit-log-page-size">
              {{ locale.t('auditLog.pagination.pageSize') }}
            </label>
            <cds-select control-width="shrink">
              <select
                id="audit-log-page-size"
                :value="pageSize"
                :aria-label="locale.t('auditLog.pagination.pageSize')"
                @change="onPageSizeChange"
              >
                <option v-for="option in PAGE_SIZE_OPTIONS" :key="option" :value="option">
                  {{ option }}
                </option>
              </select>
            </cds-select>

            <span class="range-summary">{{ summaryText }}</span>

            <cds-pagination :aria-label="locale.t('auditLog.pagination.label')">
              <cds-pagination-button
                action="first"
                :disabled="currentPage <= 1"
                :aria-label="locale.t('auditLog.pager.first')"
                @click="goToPage(1)"
              ></cds-pagination-button>
              <cds-pagination-button
                action="prev"
                :disabled="currentPage <= 1"
                :aria-label="locale.t('auditLog.pager.prev')"
                @click="goToPage(currentPage - 1)"
              ></cds-pagination-button>
              <cds-input cds-pagination-number>
                <input
                  type="number"
                  :value="currentPage"
                  :min="1"
                  :max="totalPages"
                  :aria-label="locale.t('auditLog.pagination.page')"
                  @change="goToPage(Number(($event.target as HTMLInputElement).value))"
                />
              </cds-input>
              <cds-pagination-button
                action="next"
                :disabled="currentPage >= totalPages"
                :aria-label="locale.t('auditLog.pager.next')"
                @click="goToPage(currentPage + 1)"
              ></cds-pagination-button>
              <cds-pagination-button
                action="last"
                :disabled="currentPage >= totalPages"
                :aria-label="locale.t('auditLog.pager.last')"
                @click="goToPage(totalPages)"
              ></cds-pagination-button>
            </cds-pagination>
          </div>
        </cds-grid-footer>
      </cds-grid>
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
.audit-page {
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
.time-tabs {
  display: inline-flex;
  align-items: center;
  flex: 0 0 auto;
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
.toolbar-break {
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
  width: 230px;
  padding: 5px 9px;
}
.action-select {
  flex: 0 0 auto;
}
.search-box {
  display: inline-flex;
  align-items: center;
  flex: 0 0 auto;
  gap: 6px;
  width: 240px;
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
.control-input:focus,
.search-box:focus-within {
  border-color: var(--cds-alias-object-interaction-color, #0072a3);
  outline: 2px solid color-mix(in srgb, var(--cds-alias-object-interaction-color, #0072a3) 20%, transparent);
  outline-offset: 1px;
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
.error-banner {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-bottom: 1px solid var(--cds-alias-status-danger, #c92100);
  color: var(--cds-alias-status-danger, #c92100);
  background: color-mix(in srgb, var(--cds-alias-status-danger, #c92100) 8%, transparent);
  font-size: 13px;
}
.grid-card {
  /* Mirrors ModelGatewayView's `.grid-card` wrapper: provides the
     card chrome (border, radius, background) and owns the horizontal
     scrollbar. cds-grid-footer inside is positioned by cds-grid itself.
     Right-edge alignment is handled by `.audit-page`'s negative
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

/* Hand-assembled pager that lives inside cds-grid-footer. cds-grid
   pushes slotted cds-pagination to the right; the label + select +
   summary sit on the left of the pagination. */
.audit-pager {
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
.audit-pager > label {
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
.nowrap {
  white-space: nowrap;
}
.strong {
  font-weight: 500;
}
.muted {
  color: var(--cds-alias-typography-color-300, #565656);
}
.ellipsis {
  display: inline-block;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  vertical-align: bottom;
}
.resource-copy {
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
.resource-copy cds-icon {
  flex: 0 0 auto;
  color: var(--cds-alias-object-app-foreground, #313131);
}
.result-pill {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-weight: 500;
}
.result-dot {
  width: 12px;
  height: 12px;
  border-radius: 999px;
  background: var(--cds-alias-status-neutral, #6a6a6a);
}
.result-pill[data-tone='success'] {
  color: var(--cds-alias-status-success, #247144);
}
.result-pill[data-tone='success'] .result-dot {
  background: var(--cds-alias-status-success, #247144);
}
.result-pill[data-tone='danger'] {
  color: var(--cds-alias-status-danger, #b53d35);
}
.result-pill[data-tone='danger'] .result-dot {
  background: var(--cds-alias-status-danger, #b53d35);
}
.spinning {
  animation: audit-spin 1s linear infinite;
  transform-origin: center;
}
@keyframes audit-spin {
  to {
    transform: rotate(360deg);
  }
}
@media (max-width: 1080px) {
  .toolbar {
    align-items: flex-start;
    flex-wrap: wrap;
  }
  .toolbar-break {
    display: none;
  }
  .actor-input,
  .search-box {
    flex: 1 1 220px;
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
