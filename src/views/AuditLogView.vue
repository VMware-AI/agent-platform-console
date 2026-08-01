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
const resultFilter = ref<'all' | 'success' | 'fail'>('all')
const resourceTypeInput = ref('')
const customFrom = ref('')
const customTo = ref('')

// Column header filter dropdowns (操作者 / 操作类型 / 资源 / 描述 / 结果) —
// mirrors RequestLogView's single-anchor / single-key pattern. One
// cds-dropdown is reused; the anchor + key state machine auto-closes the
// previous popover when a different header is clicked. All five filters
// apply on keystroke (text inputs) or click (select-like menus).
type ColumnFilterKey = 'actor' | 'actionType' | 'resourceType' | 'description' | 'result'
const openFilterKey = ref<ColumnFilterKey | null>(null)
const openFilterAnchor = ref<HTMLElement | null>(null)

function openFilter(key: ColumnFilterKey, target: EventTarget | null) {
  openFilterKey.value = key
  // cds-button-action dispatches the click from its inner element; anchor
  // cds-dropdown against the outer host so positioning is stable.
  const host = (target as HTMLElement | null)?.closest('cds-button-action') as HTMLElement | null
  openFilterAnchor.value = host ?? (target as HTMLElement | null)
}
function closeFilter() {
  openFilterAnchor.value = null
  openFilterKey.value = null
}

type SelectableFilter = 'actor' | 'resourceType' | 'description'
function onKeywordInput(e: Event, target: SelectableFilter) {
  const value = (e.target as HTMLInputElement).value
  if (target === 'actor') actorInput.value = value
  else if (target === 'resourceType') resourceTypeInput.value = value
  else searchInput.value = value
  currentPage.value = 1
}

const RESULT_OPTIONS = ['all', 'success', 'fail'] as const

function setActionPrefix(next: ActionPrefix | null) {
  actionPrefix.value = next
  currentPage.value = 1
}
function setResultFilter(next: 'all' | 'success' | 'fail') {
  resultFilter.value = next
  currentPage.value = 1
}

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
    search: searchInput.value.trim() || null,
    actorUserId: actorInput.value.trim() || null,
    from: serverWindow.value.from,
    to: serverWindow.value.to,
    result: resultFilter.value === 'all' ? null : resultFilter.value,
    resourceType: resourceTypeInput.value.trim() || null,
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
    Boolean(resourceTypeInput.value.trim()) ||
    Boolean(searchInput.value.trim()) ||
    Boolean(actorInput.value.trim()),
)

watch(totalPages, (pages) => {
  if (currentPage.value > pages) currentPage.value = pages
})

const errorMessage = computed(() =>
  error.value ? graphqlErrorMessage(error.value, locale.t('auditLog.error.load')) : null,
)

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

async function refresh() {
  if (loading.value) return
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
  const resource = log.resourceName
    ? `"${log.resourceName}"`
    : log.resourceId
      ? shortId(log.resourceId, 12)
      : ''
  const type = log.resourceType ? log.resourceType.replace(/_/g, ' ') : ''
  const base = actionLabel(log.action)
  if (!resource && !type) return base
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
            <span class="col-head-actions">
              <cds-button-action
                shape="filter"
                :aria-label="locale.t('auditLog.col.actor.search')"
                :expanded="!!actorInput.trim()"
                @click="(e: MouseEvent) => openFilter('actor', e.target)"
              ></cds-button-action>
            </span>
          </div>
        </cds-grid-column>
        <cds-grid-column width="12%">
          <div class="col-head">
            <span>{{ locale.t('auditLog.col.actionType') }}</span>
            <span class="col-head-actions">
              <cds-button-action
                shape="filter"
                :aria-label="locale.t('auditLog.col.actionType.search')"
                :expanded="actionPrefix !== null"
                @click="(e: MouseEvent) => openFilter('actionType', e.target)"
              ></cds-button-action>
            </span>
          </div>
        </cds-grid-column>
        <cds-grid-column width="14%">
          <div class="col-head">
            <span>{{ locale.t('auditLog.col.resource') }}</span>
            <span class="col-head-actions">
              <cds-button-action
                shape="filter"
                :aria-label="locale.t('auditLog.col.resourceType.search')"
                :expanded="!!resourceTypeInput.trim()"
                @click="(e: MouseEvent) => openFilter('resourceType', e.target)"
              ></cds-button-action>
            </span>
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
            <span class="col-head-actions">
              <cds-button-action
                shape="filter"
                :aria-label="locale.t('auditLog.col.description.search')"
                :expanded="!!searchInput.trim()"
                @click="(e: MouseEvent) => openFilter('description', e.target)"
              ></cds-button-action>
            </span>
          </div>
        </cds-grid-column>
        <cds-grid-column width="13%">
          <div class="col-head">
            <span>{{ locale.t('auditLog.col.result') }}</span>
            <span class="col-head-actions">
              <cds-button-action
                shape="filter"
                :aria-label="locale.t('auditLog.col.result.search')"
                :expanded="resultFilter !== 'all'"
                @click="(e: MouseEvent) => openFilter('result', e.target)"
              ></cds-button-action>
            </span>
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
              :title="log.resourceName ?? log.resourceId"
              :aria-label="locale.t('auditLog.action.copyResource')"
              @click="copyResourceId(log.resourceId)"
            >
              <span class="ellipsis">{{ log.resourceName ?? shortId(log.resourceId, 6) }}</span>
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

      <!-- Column filter dropdowns: a single cds-dropdown reused across the
           five filterable columns. `openFilterKey` selects which input /
           menu to render; `openFilterAnchor` is the cds-button-action host
           the dropdown positions itself against. Three text columns
           (操作者 / 资源 / 描述) get a keypress-immediate input; two
           select-like columns (操作类型 / 结果) get a menu-opt list.
           Mirrors RequestLogView's column-filter pattern. -->
      <cds-dropdown
        v-if="openFilterAnchor"
        :hidden="!openFilterKey"
        :anchor="openFilterAnchor"
        closable
        @closeChange="closeFilter"
      >
        <div cds-layout="vertical align:stretch p:xs">
          <cds-input v-if="openFilterKey === 'actor'">
            <label slot="label">{{ locale.t('auditLog.col.actor.search') }}</label>
            <input
              type="text"
              :value="actorInput"
              :placeholder="locale.t('auditLog.col.actor.search')"
              :aria-label="locale.t('auditLog.col.actor.search')"
              @input="(e: Event) => onKeywordInput(e, 'actor')"
            />
          </cds-input>
          <cds-input v-else-if="openFilterKey === 'resourceType'">
            <label slot="label">{{ locale.t('auditLog.col.resourceType.search') }}</label>
            <input
              type="text"
              :value="resourceTypeInput"
              :placeholder="locale.t('auditLog.col.resourceType.search')"
              :aria-label="locale.t('auditLog.col.resourceType.search')"
              @input="(e: Event) => onKeywordInput(e, 'resourceType')"
            />
          </cds-input>
          <cds-input v-else-if="openFilterKey === 'description'">
            <label slot="label">{{ locale.t('auditLog.col.description.search') }}</label>
            <input
              type="text"
              :value="searchInput"
              :placeholder="locale.t('auditLog.col.description.search')"
              :aria-label="locale.t('auditLog.col.description.search')"
              @input="(e: Event) => onKeywordInput(e, 'description')"
            />
          </cds-input>
          <div v-else-if="openFilterKey === 'actionType'" class="menu-list">
            <button
              type="button"
              class="menu-opt"
              :class="{ active: actionPrefix === null }"
              @click="setActionPrefix(null)"
            >
              <span>{{ locale.t('auditLog.filter.allActionTypes') }}</span>
              <cds-icon v-if="actionPrefix === null" shape="check" size="sm" aria-hidden="true"></cds-icon>
            </button>
            <button
              v-for="prefix in ACTION_PREFIXES"
              :key="prefix"
              type="button"
              class="menu-opt"
              :class="{ active: actionPrefix === prefix }"
              @click="setActionPrefix(prefix)"
            >
              <span>{{ actionPrefixLabel(prefix) }}</span>
              <cds-icon v-if="actionPrefix === prefix" shape="check" size="sm" aria-hidden="true"></cds-icon>
            </button>
          </div>
          <div v-else-if="openFilterKey === 'result'" class="menu-list">
            <button
              v-for="opt in RESULT_OPTIONS"
              :key="opt"
              type="button"
              class="menu-opt"
              :class="{ active: resultFilter === opt }"
              @click="setResultFilter(opt)"
            >
              <span>{{
                opt === 'all'
                  ? locale.t('auditLog.result.all')
                  : locale.t(`auditLog.result.${opt}`)
              }}</span>
              <cds-icon v-if="resultFilter === opt" shape="check" size="sm" aria-hidden="true"></cds-icon>
            </button>
          </div>
        </div>
      </cds-dropdown>
    </div>
  </section>
</template>

<style scoped>
.custom-range {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  margin: 0 0 0.5rem;
}
.custom-range .time-field {
  display: flex;
  flex-direction: row;
  align-items: center;
  font-size: 0.7rem;
  gap: 0.4rem;
}
.custom-range .time-field input {
  padding: 0.25rem 0.4rem;
  /* Match GatewaySpendPanel so the platform log toolbar reads as one
     design system across the metering center. 220px is enough to show
     "2026/07/24 23:45" + the calendar picker chrome without truncation. */
  width: 220px;
  max-width: 220px;
  font-family: inherit;
  font-size: 0.75rem;
  border: 1px solid var(--cds-alias-object-border-color, #ccc);
  border-radius: 4px;
  background: var(--cds-alias-object-container-background, #fff);
  color: var(--cds-alias-object-app-foreground, #1b1b1b);
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
  min-height: 32px;
  padding: 5px 11px;
  border: 0;
  border-right: 1px solid var(--cds-alias-object-border-color, #c8c8c8);
  background: var(--cds-alias-object-container-background, #fff);
  color: var(--cds-alias-object-app-foreground, #1b1b1b);
  font: inherit;
  font-size: 12px;
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
/* Column header layout: title on the left, filter action(s) on the right.
   Mirrors RequestLogView / ResourcePoolListView — `.col-head` flexes with
   `space-between` so the title and the `.col-head-actions` group sit at
   opposite ends of the header cell. */
.col-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  width: 100%;
}
.col-head-actions {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
/* Column-filter option list (inside the dropdown). Mirrors RequestLogView /
   AgentListView's `.menu-opt` pattern. */
.menu-list {
  display: flex;
  flex-direction: column;
  /* Cap the action-type dropdown's height so the 14+ entries don't fill
     the viewport on small windows — the user can scroll within the list
     to reach the lower entries. 320px ≈ 9 menu-opt rows at our padding
     + font-size, enough to keep the most-used entries visible at once. */
  max-height: 320px;
  overflow-y: auto;
}
.menu-opt {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 12px;
  background: transparent;
  border: 0;
  font: inherit;
  color: var(--cds-alias-object-app-foreground, #1b1b1b);
  text-align: left;
  cursor: pointer;
  width: 100%;
}
.menu-opt:hover {
  background: var(--cds-alias-object-app-background, #f1f5f8);
}
.menu-opt.active {
  font-weight: 600;
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

/* The cds-grid inside uses overflow-x: auto + min-width: 1180px so the
   header row and the body rows stay pixel-aligned at every viewport
   width. Without an explicit floor the percentage widths on
   <cds-grid-column> recalculate against the shrinking parent on narrow
   viewports while the header shadow DOM keeps a different base, which
   reads as the two rows sliding apart. Same shape as
   ModelGatewayView + RequestLogView — cds-grid-column sums to 100%, so
   1180px is wide enough that all 7 columns keep their declared shares
   without clipping. */
.audit-page cds-grid {
  display: block;
  width: 100%;
  max-width: 100%;
  min-width: 0;
  overflow-x: auto;
  overflow-y: hidden;
  min-width: 1180px;
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
