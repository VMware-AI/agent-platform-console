<script setup lang="ts">
import '@/components/icons'
import { computed, ref, watch } from 'vue'
import { useToast } from '@/composables/useToast'
import { useAgentExport } from '@/composables/useAgentExport'
import { useMutation, useQuery } from '@vue/apollo-composable'
import { useRouter } from 'vue-router'
import { useLocaleStore } from '@/stores/locale'
import AppDropdown from '@/components/AppDropdown.vue'

import { AGENTS_QUERY } from '@/api/graphql/queries/agents'
import type {
  Agent,
  AgentSortField,
  AgentStatus,
  AgentsQueryResult,
  AgentsQueryVars,
  RecycleAgentResult,
  RecycleAgentVars,
  SetAgentStatusResult,
  SetAgentStatusVars,
  SortDirection,
  StatusKey,
  TypeKey,
} from '@/types/agents'
import { STATUS_FROM_GQL, TYPE_FROM_GQL } from '@/types/agents'
import { graphqlErrorMessage } from '@/api/graphql/errors'

const locale = useLocaleStore()

/* ---------- Query variables (GraphQL) ---------- */

const PAGE_SIZE_OPTIONS = [10, 20, 50, 100] as const
type PageSize = (typeof PAGE_SIZE_OPTIONS)[number]
const pageSize = ref<PageSize>(10)
const currentPage = ref(1)
const statusFilter = ref<StatusKey | 'all'>('all')
const typeFilter = ref<TypeKey | 'all'>('all')
const sort = ref<{ field: AgentSortField; direction: SortDirection } | null>(null)

/* Per-column text-search filters (Name / Key Name / Run-as User). Each one maps
   to its own AgentFilter field; the backend is expected to substring-match. */
type ColumnKeywordField = 'nameKeyword' | 'keyKeyword' | 'usernameKeyword'
const columnFilters = ref<Record<ColumnKeywordField, string>>({
  nameKeyword: '',
  keyKeyword: '',
  usernameKeyword: '',
})
const columnFilterAnchors = ref<Record<ColumnKeywordField, HTMLElement | null>>({
  nameKeyword: null,
  keyKeyword: null,
  usernameKeyword: null,
})

const filter = computed<AgentsQueryVars['filter']>(() => {
  const f: NonNullable<AgentsQueryVars['filter']> = {}
  if (statusFilter.value !== 'all') {
    f.status = statusFilter.value.toUpperCase() as 'RUNNING' | 'STOPPED' | 'ERROR'
  }
  if (typeFilter.value !== 'all') {
    f.type = typeFilter.value
      .toUpperCase()
      .replace(/-/g, '_') as NonNullable<AgentsQueryVars['filter']>['type']
  }
  if (columnFilters.value.nameKeyword) f.nameKeyword = columnFilters.value.nameKeyword
  if (columnFilters.value.keyKeyword) f.keyKeyword = columnFilters.value.keyKeyword
  if (columnFilters.value.usernameKeyword) f.usernameKeyword = columnFilters.value.usernameKeyword
  return Object.keys(f).length > 0 ? f : null
})

const pagination = computed(() => ({
  page: currentPage.value,
  pageSize: pageSize.value,
}))

// Reactive GraphQL variables — useQuery re-fetches when any dep changes.
const variables = computed<AgentsQueryVars>(() => ({
  filter: filter.value,
  pagination: pagination.value,
  sort: sort.value,
}))

const { result, loading, error, refetch } = useQuery<
  AgentsQueryResult,
  AgentsQueryVars
>(AGENTS_QUERY, variables)

const agents = computed<Agent[]>(() => result.value?.agents.nodes ?? [])
const totalCount = computed(() => result.value?.agents.totalCount ?? 0)
const pageInfo = computed(() => result.value?.agents.pageInfo)

/* ---------- Selection (per-row checkbox) ---------- */

const selectedIds = ref<Set<string>>(new Set())

const selectedCount = computed(() => selectedIds.value.size)

function isSelected(id: string) {
  return selectedIds.value.has(id)
}

function toggleSelect(id: string, checked: boolean) {
  const next = new Set(selectedIds.value)
  if (checked) next.add(id)
  else next.delete(id)
  selectedIds.value = next
}

function toggleSelectAll(checked: boolean) {
  if (checked) {
    selectedIds.value = new Set(agents.value.map((a) => a.id))
  } else {
    selectedIds.value = new Set()
  }
}

const allVisibleSelected = computed(
  () => agents.value.length > 0 && agents.value.every((a) => selectedIds.value.has(a.id)),
)

/* Reset selection when page / filters / pageSize change so we don't keep "ghost" ids. */
watch(
  [currentPage, statusFilter, typeFilter, pageSize, columnFilters],
  () => {
    selectedIds.value = new Set()
  },
  { deep: true },
)

/* ---------- Sorting (self-managed, see col-head-actions) ----------
   We previously delegated this to <cds-button-sort>, whose built-in icon
   (two stacked angle triangles) we found visually clunky. The component
   doesn't accept a custom icon, so we now self-host the 3-state cycle on
   a plain <cds-button-action> and pick our own icon per state. */

type ColumnSortState = 'none' | 'ascending' | 'descending'

function sortStateFor(field: AgentSortField): ColumnSortState {
  if (sort.value?.field !== field) return 'none'
  return sort.value.direction === 'ASC' ? 'ascending' : 'descending'
}

function onSortClick(field: AgentSortField) {
  const current = sortStateFor(field)
  if (current === 'none') {
    sort.value = { field, direction: 'ASC' }
  } else if (current === 'ascending') {
    sort.value = { field, direction: 'DESC' }
  } else {
    sort.value = null
  }
  currentPage.value = 1
}

/* ---------- Filter menu helpers (Type / Status) ---------- */

const STATUS_OPTIONS: Array<StatusKey | 'all'> = [
  'all',
  'running',
  'stopped',
  'error',
]

const TYPE_OPTIONS: Array<TypeKey | 'all'> = [
  'all',
  'general-chat',
  'image-generation',
  'basic-llm',
  'openclaw',
  'hermes',
  'claude-code',
  'xiaoguai',
  'qcoder',
  'opencode',
]

function setStatusFilter(value: StatusKey | 'all') {
  statusFilter.value = value
  currentPage.value = 1
}

function setTypeFilter(value: TypeKey | 'all') {
  typeFilter.value = value
  currentPage.value = 1
}

/* Per-column text-search filter (matches the official column-filter pattern:
   a cds-button-action trigger + a cds-dropdown with a cds-input). */
function openColumnFilter(field: ColumnKeywordField, target: EventTarget | null) {
  const host = (target as HTMLElement | null)?.closest(
    'cds-button-action',
  ) as HTMLElement | null
  columnFilterAnchors.value[field] = host ?? (target as HTMLElement | null)
}

function closeColumnFilter(field: ColumnKeywordField) {
  columnFilterAnchors.value[field] = null
}

function setColumnFilter(field: ColumnKeywordField, value: string) {
  columnFilters.value = { ...columnFilters.value, [field]: value }
  currentPage.value = 1
}

/* Anchors for the cds-dropdown column-filter popups.
   Mirrors the `idFilterAnchor` pattern from Clarity's kitchen-sink demo. */
type FilterField = 'TYPE' | 'STATUS'
const filterAnchors = ref<Record<FilterField, HTMLElement | null>>({
  TYPE: null,
  STATUS: null,
})

function openFilter(field: FilterField, target: EventTarget | null) {
  // `cds-button-action` dispatches the click from its inner element; we want
  // the outer host element so cds-dropdown can position against it.
  const host = (target as HTMLElement | null)?.closest(
    'cds-button-action',
  ) as HTMLElement | null
  filterAnchors.value[field] = host ?? (target as HTMLElement | null)
}

function closeFilter(field: FilterField) {
  filterAnchors.value[field] = null
}

/* ---------- Pagination (self-assembled, see cds-grid-footer) ----------
   We don't use <cds-grid-pagination> here because it locks the order to
   [page-size select] [page buttons] and we need [label] [page-size select]
   [summary] [page buttons]. cds-pagination is just a flex container that
   hosts whatever children we project, so we build the pager manually from
   cds-select + cds-pagination-button + cds-input. */

function goToPage(page: number) {
  if (!pageInfo.value) return
  const total = pageInfo.value.totalPages
  if (page < 1 || page > total) return
  currentPage.value = page
}

function onPrevPage() {
  goToPage(currentPage.value - 1)
}

function onNextPage() {
  goToPage(currentPage.value + 1)
}

function onPageInput(e: Event) {
  const raw = (e.target as HTMLInputElement).value
  const next = parseInt(raw, 10)
  const total = pageInfo.value?.totalPages ?? 1
  if (Number.isFinite(next) && next >= 1 && next <= total) {
    currentPage.value = next
  }
}

function onPageSizeSelect(e: Event) {
  const next = parseInt((e.target as HTMLSelectElement).value, 10)
  if (!Number.isFinite(next)) return
  pageSize.value = next as PageSize
  currentPage.value = 1
}

/* ---------- Row actions ---------- */

type RowActionKey = 'rotateKey' | 'restart' | 'stop' | 'update' | 'delete'

// Order is fixed by the product spec:
//   密码更新 → 版本更新 → 重启 → 停止 → 删除
// All five items are exposed for every status so the "更多" menu reads the
// same regardless of the agent's current state.
const ACTIONS_BY_STATUS: Record<StatusKey, RowActionKey[]> = {
  running: ['rotateKey', 'update', 'restart', 'stop', 'delete'],
  stopped: ['rotateKey', 'update', 'restart', 'stop', 'delete'],
  error: ['rotateKey', 'update', 'restart', 'stop', 'delete'],
}

const ICON_FOR_ACTION: Record<RowActionKey, string> = {
  rotateKey: 'key',
  restart: 'sync',
  stop: 'stop',
  update: 'update',
  delete: 'trash',
}

function badgeStatusFor(status: Agent['status']): 'success' | 'neutral' | 'danger' {
  if (status === 'RUNNING') return 'success'
  if (status === 'ERROR') return 'danger'
  return 'neutral'
}

/* ---------- Row / batch actions (real mutations) ----------
 * stop/restart → setAgentStatus; delete → recycleAgent (double-confirm);
 * visit → the agent's endpoint; configure → the detail page. rotateKey and
 * update still have no backend op — those keep the honest "not yet" toast. */

const router = useRouter()
const { mutate: setStatusMutate } = useMutation<SetAgentStatusResult, SetAgentStatusVars>(
  SET_AGENT_STATUS_MUTATION,
)
const { mutate: recycleMutate } = useMutation<RecycleAgentResult, RecycleAgentVars>(
  RECYCLE_AGENT_MUTATION,
)

function notReady() {
  toast.info(locale.t('agents.action.notReady'))
}

function onVisit(agent: Agent) {
  if (!agent.endpoint) {
    toast.info(locale.t('agents.action.noEndpoint'))
    return
  }
  window.open(agent.endpoint, '_blank', 'noopener')
}

function onConfigure(agent: Agent) {
  router.push({ name: 'agents.detail', params: { id: agent.id } })
}

/** Set one agent's status; returns success. The mutation selects id+status, so
 *  the normalized Apollo cache patches the row badge in place — no refetch. */
async function setStatus(agent: Agent, status: AgentStatus, okKey: string): Promise<boolean> {
  try {
    await setStatusMutate({ id: agent.id, status })
    toast.success(locale.t(okKey).replace('{name}', agent.name))
    return true
  } catch (e) {
    toast.error(graphqlErrorMessage(e, locale.t('agents.action.failed')))
    return false
  }
}

const deleteTarget = ref<Agent | null>(null)
const batchDeleteOpen = ref(false)

async function doDelete() {
  const target = deleteTarget.value
  deleteTarget.value = null
  if (!target) return
  try {
    await recycleMutate({ input: { agentId: target.id, confirm: true } })
    toast.success(locale.t('agents.action.deletedOk').replace('{name}', target.name))
  } catch (e) {
    toast.error(graphqlErrorMessage(e, locale.t('agents.action.failed')))
  }
  await refetch()
}

function onRowAction(key: RowActionKey) {
  const target = rowActionsTarget.value
  closeRowActions()
  if (!target) return
  switch (key) {
    case 'stop':
      void setStatus(target, 'STOPPED', 'agents.action.stoppedOk')
      break
    case 'restart':
      void setStatus(target, 'RUNNING', 'agents.action.restartedOk')
      break
    case 'delete':
      deleteTarget.value = target
      break
    default:
      // rotateKey / update — no backend op yet.
      notReady()
  }
}

/* Anchors for the cds-dropdown row-actions popup (per row). */
const rowActionsAnchor = ref<HTMLElement | null>(null)
const rowActionsTarget = ref<Agent | null>(null)

function openRowActions(agent: Agent, target: EventTarget | null) {
  rowActionsTarget.value = agent
  const host = (target as HTMLElement | null)?.closest(
    'cds-button-action',
  ) as HTMLElement | null
  rowActionsAnchor.value = host ?? (target as HTMLElement | null)
}

function closeRowActions() {
  rowActionsAnchor.value = null
  rowActionsTarget.value = null
}

const toast = useToast()

const { runExport, exporting } = useAgentExport({
  // Read at click time so the export always reflects the latest filters
  // (and sort) the user has applied, not whatever they were when this
  // composable was first instantiated.
  readVariables: () => ({
    filter: filter.value,
    sort: sort.value,
  }),
})

/** Map export-in-flight → cds-button's `loadingState` enum. */
const exportState = computed(() => (exporting.value ? 'loading' : 'default'))

async function onCopyKey(agent: Agent) {
  if (!agent.apiKey) return
  const text = agent.apiKey.name
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
    } else {
      // Fallback for non-secure contexts / older browsers
      const ta = document.createElement('textarea')
      ta.value = text
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
    }
    toast.success(locale.t('agents.action.copyKeyOk').replace('{name}', text))
  } catch (err) {
    console.warn('[agents] copy-key failed', { id: agent.id, err })
    toast.error(graphqlErrorMessage(err, locale.t('agents.action.copyKeyFail')))
  }
}

const BATCH_KEYS = ['start', 'stop', 'update', 'delete'] as const

/** Map a batch-menu key → its sibling row-action key in `ICON_FOR_ACTION`,
 *  so "批量启动 / 批量停止 / 批量更新" share the same glyph as the
 *  matching item in the per-row "更多" menu. */
const BATCH_ICON_FOR_KEY: Record<(typeof BATCH_KEYS)[number], string> = {
  start: ICON_FOR_ACTION.restart, // sync
  stop: ICON_FOR_ACTION.stop,    // stop
  update: ICON_FOR_ACTION.update, // update
  delete: 'trash',                // matches the more-menu `delete` icon
}

/** Run one mutation per selected id, then summarize, clear selection, refetch. */
async function runBatch(ids: string[], run: (id: string) => Promise<unknown>) {
  const results = await Promise.allSettled(ids.map(run))
  const ok = results.filter((r) => r.status === 'fulfilled').length
  const fail = results.length - ok
  const summary = locale
    .t('agents.batch.done')
    .replace('{ok}', String(ok))
    .replace('{fail}', String(fail))
  if (fail > 0) toast.error(summary)
  else toast.success(summary)
  selectedIds.value = new Set()
  await refetch()
}

function onBatch(key: (typeof BATCH_KEYS)[number], close: () => void) {
  close()
  if (selectedIds.value.size === 0) {
    toast.info(locale.t('agents.batch.disabled'))
    return
  }
  const ids = [...selectedIds.value]
  switch (key) {
    case 'start':
      void runBatch(ids, (id) => setStatusMutate({ id, status: 'RUNNING' }))
      break
    case 'stop':
      void runBatch(ids, (id) => setStatusMutate({ id, status: 'STOPPED' }))
      break
    case 'delete':
      batchDeleteOpen.value = true
      break
    default:
      // update — no backend op yet.
      notReady()
  }
}

async function doBatchDelete() {
  batchDeleteOpen.value = false
  const ids = [...selectedIds.value]
  await runBatch(ids, (id) => recycleMutate({ input: { agentId: id, confirm: true } }))
}

function onExport() {
  void runExport()
}

function onRefresh() {
  refetch()
}

/** "2026年6月15日 17:00" — matches the format used in ResourcePoolListView
 *  so all "创建时间/更新时间" cells in the console look the same. */
function fmtDateTime(iso: string): string {
  try {
    return new Intl.DateTimeFormat(locale.locale === 'zh' ? 'zh-CN' : 'en-US', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(iso))
  } catch {
    return iso
  }
}

/* ---------- Footer summary (mirrors the old clr-datagrid "X - Y of Z" pattern) ---------- */

const summaryText = computed(() => {
  const total = totalCount.value
  if (total === 0) {
    return locale
      .t('agents.footer.summary')
      .replace('{start}', '0')
      .replace('{end}', '0')
      .replace('{total}', '0')
  }
  const start = (currentPage.value - 1) * pageSize.value + 1
  const end = Math.min(currentPage.value * pageSize.value, total)
  return locale
    .t('agents.footer.summary')
    .replace('{start}', String(start))
    .replace('{end}', String(end))
    .replace('{total}', String(total))
})
</script>

<template>
  <section class="agent-list" cds-layout="vertical gap:md">
    <header class="page-head">
      <h1 cds-text="title" class="heading">{{ locale.t('agents.list.title') }}</h1>
      <p cds-text="body" class="desc muted">{{ locale.t('agents.list.description') }}</p>
    </header>

    <!-- Toolbar: export / batch / refresh -->
    <div class="toolbar">

      <cds-button
        action="outline"
        :loading-state="exportState"
        :disabled="exporting"
        @click="onExport"
      >
        <cds-icon shape="download" size="sm" aria-hidden="true"></cds-icon>
        {{ locale.t('agents.list.export') }}
      </cds-button>

      <AppDropdown align="end" :disabled="selectedCount === 0">
        <template #trigger>
          <cds-button
            action="outline"
            :disabled="selectedCount === 0"
            :title="
              selectedCount === 0
                ? locale.t('agents.batch.disabled')
                : undefined
            "
          >
            <cds-icon shape="cog" size="sm" aria-hidden="true"></cds-icon>
            {{ locale.t('agents.list.batch') }}
            <cds-icon shape="angle" direction="down" size="sm" aria-hidden="true"></cds-icon>
          </cds-button>
        </template>
        <template #default="{ close }">
          <button
            v-for="key in BATCH_KEYS"
            :key="key"
            type="button"
            class="menu-opt"
            :class="{ danger: key === 'delete' }"
            :aria-label="locale.t(`agents.batch.${key}`)"
            @click="onBatch(key, close)"
          >
            <cds-icon :shape="BATCH_ICON_FOR_KEY[key]" size="sm" aria-hidden="true"></cds-icon>
            <span>{{ locale.t(`agents.batch.${key}`) }}</span>
          </button>
        </template>
      </AppDropdown>

      <button
        type="button"
        class="refresh-button"
        :disabled="loading"
        :aria-label="locale.t('agents.list.refresh')"
        :title="locale.t('agents.list.refresh')"
        @click="onRefresh"
      >
        <cds-icon
          shape="refresh"
          size="md"
          :class="{ spinning: loading }"
          aria-hidden="true"
        ></cds-icon>
      </button>
    </div>

    <!-- Error banner sits above the grid (Clarity alert pattern) -->
    <cds-alert
      v-if="error"
      status="danger"
      :aria-live="true"
    >
      {{ locale.t('agents.error') }}
    </cds-alert>

    <cds-grid
      :border="'row'"
      :column-layout="'flex'"
      :selectable="null"
      role="grid"
      :aria-label="locale.t('agents.list.title')"
      scroll-lock
    >
        <!-- Column definitions -->
        <cds-grid-column type="action" :resizable="false">
          <input
            type="checkbox"
            class="app-checkbox"
            :checked="allVisibleSelected"
            :aria-label="locale.t('agents.col.select')"
            @change="(e: Event) => toggleSelectAll((e.target as HTMLInputElement).checked)"
          />
        </cds-grid-column>

        <cds-grid-column :width="'14%'">
          {{ locale.t('agents.col.name') }}
          <span class="col-head-actions">
            <cds-button-action
              :aria-label="locale.t('agents.aria.sort').replace('{column}', locale.t('agents.col.name'))"
              @click="(e: MouseEvent) => onSortClick('NAME')"
            >
              <cds-icon
                v-if="sortStateFor('NAME') === 'ascending'"
                shape="angle"
                direction="up"
                size="sm"
              ></cds-icon>
              <cds-icon
                v-else-if="sortStateFor('NAME') === 'descending'"
                shape="angle"
                direction="down"
                size="sm"
              ></cds-icon>
              <cds-icon
                v-else
                shape="two-way-arrows"
                class="col-sort-rotated"
                size="sm"
              ></cds-icon>
            </cds-button-action>
            <cds-button-action
              shape="filter"
              aria-controls="filter-NAME"
              :aria-label="locale.t('agents.aria.filter').replace('{column}', locale.t('agents.col.name'))"
              :expanded="columnFilters.nameKeyword.length > 0"
              @click="(e: MouseEvent) => openColumnFilter('nameKeyword', e.target)"
            ></cds-button-action>
          </span>
        </cds-grid-column>

        <cds-grid-column :width="'10%'">
          {{ locale.t('agents.col.type') }}
          <span class="col-head-actions">
            <cds-button-action
              :aria-label="locale.t('agents.aria.sort').replace('{column}', locale.t('agents.col.type'))"
              @click="(e: MouseEvent) => onSortClick('TYPE')"
            >
              <cds-icon
                v-if="sortStateFor('TYPE') === 'ascending'"
                shape="angle"
                direction="up"
                size="sm"
              ></cds-icon>
              <cds-icon
                v-else-if="sortStateFor('TYPE') === 'descending'"
                shape="angle"
                direction="down"
                size="sm"
              ></cds-icon>
              <cds-icon
                v-else
                shape="two-way-arrows"
                class="col-sort-rotated"
                size="sm"
              ></cds-icon>
            </cds-button-action>
            <cds-button-action
              shape="filter"
              aria-controls="filter-TYPE"
              :aria-label="locale.t('agents.aria.filter').replace('{column}', locale.t('agents.col.type'))"
              :expanded="typeFilter !== 'all'"
              @click="(e: MouseEvent) => openFilter('TYPE', e.target)"
            ></cds-button-action>
          </span>
        </cds-grid-column>

        <cds-grid-column :width="'9%'">
          {{ locale.t('agents.col.status') }}
          <span class="col-head-actions">
            <cds-button-action
              :aria-label="locale.t('agents.aria.sort').replace('{column}', locale.t('agents.col.status'))"
              @click="(e: MouseEvent) => onSortClick('STATUS')"
            >
              <cds-icon
                v-if="sortStateFor('STATUS') === 'ascending'"
                shape="angle"
                direction="up"
                size="sm"
              ></cds-icon>
              <cds-icon
                v-else-if="sortStateFor('STATUS') === 'descending'"
                shape="angle"
                direction="down"
                size="sm"
              ></cds-icon>
              <cds-icon
                v-else
                shape="two-way-arrows"
                class="col-sort-rotated"
                size="sm"
              ></cds-icon>
            </cds-button-action>
            <cds-button-action
              shape="filter"
              aria-controls="filter-STATUS"
              :aria-label="locale.t('agents.aria.filter').replace('{column}', locale.t('agents.col.status'))"
              :expanded="statusFilter !== 'all'"
              @click="(e: MouseEvent) => openFilter('STATUS', e.target)"
            ></cds-button-action>
          </span>
        </cds-grid-column>

        <cds-grid-column :width="'14%'">
          {{ locale.t('agents.col.key') }}
          <span class="col-head-actions">
            <cds-button-action
              :aria-label="locale.t('agents.aria.sort').replace('{column}', locale.t('agents.col.key'))"
              @click="(e: MouseEvent) => onSortClick('API_KEY_NAME')"
            >
              <cds-icon
                v-if="sortStateFor('API_KEY_NAME') === 'ascending'"
                shape="angle"
                direction="up"
                size="sm"
              ></cds-icon>
              <cds-icon
                v-else-if="sortStateFor('API_KEY_NAME') === 'descending'"
                shape="angle"
                direction="down"
                size="sm"
              ></cds-icon>
              <cds-icon
                v-else
                shape="two-way-arrows"
                class="col-sort-rotated"
                size="sm"
              ></cds-icon>
            </cds-button-action>
            <cds-button-action
              shape="filter"
              aria-controls="filter-KEY"
              :aria-label="locale.t('agents.aria.filter').replace('{column}', locale.t('agents.col.key'))"
              :expanded="columnFilters.keyKeyword.length > 0"
              @click="(e: MouseEvent) => openColumnFilter('keyKeyword', e.target)"
            ></cds-button-action>
          </span>
        </cds-grid-column>

        <cds-grid-column :width="'10%'">
          {{ locale.t('agents.col.username') }}
          <span class="col-head-actions">
            <cds-button-action
              :aria-label="locale.t('agents.aria.sort').replace('{column}', locale.t('agents.col.username'))"
              @click="(e: MouseEvent) => onSortClick('USERNAME')"
            >
              <cds-icon
                v-if="sortStateFor('USERNAME') === 'ascending'"
                shape="angle"
                direction="up"
                size="sm"
              ></cds-icon>
              <cds-icon
                v-else-if="sortStateFor('USERNAME') === 'descending'"
                shape="angle"
                direction="down"
                size="sm"
              ></cds-icon>
              <cds-icon
                v-else
                shape="two-way-arrows"
                class="col-sort-rotated"
                size="sm"
              ></cds-icon>
            </cds-button-action>
            <cds-button-action
              shape="filter"
              aria-controls="filter-USERNAME"
              :aria-label="locale.t('agents.aria.filter').replace('{column}', locale.t('agents.col.username'))"
              :expanded="columnFilters.usernameKeyword.length > 0"
              @click="(e: MouseEvent) => openColumnFilter('usernameKeyword', e.target)"
            ></cds-button-action>
          </span>
        </cds-grid-column>

        <cds-grid-column :width="'12%'">
          {{ locale.t('agents.col.createdAt') }}
          <span class="col-head-actions">
            <cds-button-action
              :aria-label="locale.t('agents.aria.sort').replace('{column}', locale.t('agents.col.createdAt'))"
              @click="(e: MouseEvent) => onSortClick('CREATED_AT')"
            >
              <cds-icon
                v-if="sortStateFor('CREATED_AT') === 'ascending'"
                shape="angle"
                direction="up"
                size="sm"
              ></cds-icon>
              <cds-icon
                v-else-if="sortStateFor('CREATED_AT') === 'descending'"
                shape="angle"
                direction="down"
                size="sm"
              ></cds-icon>
              <cds-icon
                v-else
                shape="two-way-arrows"
                class="col-sort-rotated"
                size="sm"
              ></cds-icon>
            </cds-button-action>
          </span>
        </cds-grid-column>

        <cds-grid-column :width="'12%'">
          {{ locale.t('agents.col.updatedAt') }}
          <span class="col-head-actions">
            <cds-button-action
              :aria-label="locale.t('agents.aria.sort').replace('{column}', locale.t('agents.col.updatedAt'))"
              @click="(e: MouseEvent) => onSortClick('UPDATED_AT')"
            >
              <cds-icon
                v-if="sortStateFor('UPDATED_AT') === 'ascending'"
                shape="angle"
                direction="up"
                size="sm"
              ></cds-icon>
              <cds-icon
                v-else-if="sortStateFor('UPDATED_AT') === 'descending'"
                shape="angle"
                direction="down"
                size="sm"
              ></cds-icon>
              <cds-icon
                v-else
                shape="two-way-arrows"
                class="col-sort-rotated"
                size="sm"
              ></cds-icon>
            </cds-button-action>
          </span>
        </cds-grid-column>

        <cds-grid-column :width="'20%'">
          <div class="col-head col-actions">
            <span>{{ locale.t('agents.col.actions') }}</span>
          </div>
        </cds-grid-column>

        <!-- Body rows -->
        <cds-grid-row v-for="agent in agents" :key="agent.id">
          <cds-grid-cell>
            <input
              type="checkbox"
              class="app-checkbox"
              :checked="isSelected(agent.id)"
              :aria-label="agent.name"
              @change="(e: Event) => toggleSelect(agent.id, (e.target as HTMLInputElement).checked)"
            />
          </cds-grid-cell>
          <cds-grid-cell>
            <router-link
              :to="{ name: 'agents.detail', params: { id: agent.id } }"
              class="cell-name-link"
            >{{ agent.name }}</router-link>
          </cds-grid-cell>
          <cds-grid-cell>
            <span class="muted">{{ locale.t(`agents.type.${TYPE_FROM_GQL[agent.type]}`) }}</span>
          </cds-grid-cell>
          <cds-grid-cell>
            <cds-badge
              :status="badgeStatusFor(agent.status)"
              class="status-badge"
            >
              {{ locale.t(`agents.status.${STATUS_FROM_GQL[agent.status]}`) }}
            </cds-badge>
          </cds-grid-cell>
          <cds-grid-cell>
            <span class="key-cell">
              <span>{{ agent.apiKey?.name ?? '—' }}</span>
              <cds-button-action
                v-if="agent.apiKey"
                shape="copy"
                :title="locale.t('agents.action.copyKey')"
                :aria-label="locale.t('agents.action.copyKey')"
                @click="onCopyKey(agent)"
              ></cds-button-action>
            </span>
          </cds-grid-cell>
          <cds-grid-cell>
            <span>{{ agent.credentials?.username ?? '—' }}</span>
          </cds-grid-cell>
          <cds-grid-cell class="muted time-cell">{{ fmtDateTime(agent.createdAt) }}</cds-grid-cell>
          <cds-grid-cell class="muted time-cell">{{ fmtDateTime(agent.updatedAt) }}</cds-grid-cell>
          <cds-grid-cell>
            <span class="actions-cell">
              <cds-button action="outline" size="sm" @click="onVisit(agent)">
                <cds-icon shape="eye" size="sm" aria-hidden="true"></cds-icon>
                {{ locale.t('agents.action.visit') }}
              </cds-button>
              <cds-button action="outline" size="sm" @click="onConfigure(agent)">
                <cds-icon shape="cog" size="sm" aria-hidden="true"></cds-icon>
                {{ locale.t('agents.action.configure') }}
              </cds-button>
              <cds-button-action
                :id="`row-actions-trigger-${agent.id}`"
                :aria-label="locale.t('agents.action.more')"
                @click="(e: MouseEvent) => openRowActions(agent, e.target)"
              ></cds-button-action>
            </span>
          </cds-grid-cell>
        </cds-grid-row>

        <!-- Loading state (official async-data pattern) — only on the
             initial load. On a manual refresh, the existing rows stay
             visible and the refresh button's `:loading` spinner is the
             feedback, so we don't blank the table out. -->
        <cds-grid-placeholder v-if="loading && agents.length === 0">
          <cds-progress-circle size="xl" status="info"></cds-progress-circle>
          <p cds-text="subsection">{{ locale.t('agents.loading') }}</p>
        </cds-grid-placeholder>

        <!-- Empty state (official placeholder pattern) -->
        <cds-grid-placeholder v-else-if="agents.length === 0">
          <cds-icon shape="atom" size="xl"></cds-icon>
          <p cds-text="subsection">{{ locale.t('agents.empty') }}</p>
        </cds-grid-placeholder>

        <!-- Footer: [selected count, bottom-left] + [pager, pushed to the right].
             The "已选 N 项" affordance lives at the table's bottom-left (instead
             of in the top toolbar) so it's visually anchored to the rows it
             refers to. -->
        <cds-grid-footer v-if="pageInfo && totalCount > 0">
          <span
            v-if="selectedCount > 0"
            class="pager-selected-count"
            cds-text="body"
            aria-live="polite"
          >
            {{ locale
              .t('agents.toolbar.selected')
              .replace('{count}', String(selectedCount)) }}
          </span>
          <div class="pager">
            <label class="pager-page-size-label" for="agents-page-size">
              {{ locale.t('agents.pager.pageSize') }}
            </label>
            <cds-select control-width="shrink">
              <select
                id="agents-page-size"
                :value="pageSize"
                :aria-label="locale.t('agents.pager.pageSize')"
                @change="onPageSizeSelect"
              >
                <option
                  v-for="opt in PAGE_SIZE_OPTIONS"
                  :key="opt"
                  :value="opt"
                  :selected="opt === pageSize"
                >
                  {{ opt }}
                </option>
              </select>
            </cds-select>

            <span class="pager-summary" cds-text="body">{{ summaryText }}</span>

            <cds-pagination :aria-label="locale.t('agents.pager.label')">
              <cds-pagination-button
                action="first"
                :disabled="currentPage <= 1"
                :aria-label="locale.t('agents.pager.first')"
                @click="goToPage(1)"
              ></cds-pagination-button>
              <cds-pagination-button
                action="prev"
                :disabled="currentPage <= 1"
                :aria-label="locale.t('agents.pager.prev')"
                @click="onPrevPage"
              ></cds-pagination-button>
              <cds-input cds-pagination-number>
                <input
                  type="number"
                  :value="currentPage"
                  :aria-label="locale.t('agents.pager.page')"
                  :min="1"
                  :max="pageInfo.totalPages"
                  @input="onPageInput"
                />
              </cds-input>
              <cds-pagination-button
                action="next"
                :disabled="currentPage >= pageInfo.totalPages"
                :aria-label="locale.t('agents.pager.next')"
                @click="onNextPage"
              ></cds-pagination-button>
              <cds-pagination-button
                action="last"
                :disabled="currentPage >= pageInfo.totalPages"
                :aria-label="locale.t('agents.pager.last')"
                @click="goToPage(pageInfo.totalPages)"
              ></cds-pagination-button>
            </cds-pagination>
          </div>
        </cds-grid-footer>
      </cds-grid>

    <!-- Column filter dropdowns (anchored to the cds-button-action triggers above) -->
    <cds-dropdown
      id="filter-TYPE"
      closable
      :hidden="!filterAnchors.TYPE"
      @closeChange="() => closeFilter('TYPE')"
      :anchor="filterAnchors.TYPE"
    >
      <div cds-layout="vertical align:stretch p:xs">
        <button
          v-for="t in TYPE_OPTIONS"
          :key="t"
          type="button"
          class="menu-opt"
          :class="{ active: typeFilter === t }"
          @click="setTypeFilter(t)"
        >
          <span>{{
            t === 'all'
              ? locale.t('agents.type.filter.all')
              : locale.t(`agents.type.${t}`)
          }}</span>
          <cds-icon v-if="typeFilter === t" shape="check" size="sm"></cds-icon>
        </button>
      </div>
    </cds-dropdown>

    <cds-dropdown
      id="filter-STATUS"
      closable
      :hidden="!filterAnchors.STATUS"
      @closeChange="() => closeFilter('STATUS')"
      :anchor="filterAnchors.STATUS"
    >
      <div cds-layout="vertical align:stretch p:xs">
        <button
          v-for="s in STATUS_OPTIONS"
          :key="s"
          type="button"
          class="menu-opt"
          :class="{ active: statusFilter === s }"
          @click="setStatusFilter(s)"
        >
          <span>{{
            s === 'all'
              ? locale.t('agents.status.filter.all')
              : locale.t(`agents.status.${s}`)
          }}</span>
          <cds-icon v-if="statusFilter === s" shape="check" size="sm"></cds-icon>
        </button>
      </div>
    </cds-dropdown>

    <!-- Column text-search dropdowns (official column-filter pattern). -->
    <cds-dropdown
      id="filter-NAME"
      closable
      :hidden="!columnFilterAnchors.nameKeyword"
      @closeChange="() => closeColumnFilter('nameKeyword')"
      :anchor="columnFilterAnchors.nameKeyword"
    >
      <div cds-layout="vertical align:stretch p:xs">
        <cds-input>
          <input
            type="text"
            :placeholder="locale.t('agents.col.name.search')"
            :aria-label="locale.t('agents.col.name.search')"
            :value="columnFilters.nameKeyword"
            @input="(e: Event) => setColumnFilter('nameKeyword', (e.target as HTMLInputElement).value)"
          />
        </cds-input>
      </div>
    </cds-dropdown>

    <cds-dropdown
      id="filter-KEY"
      closable
      :hidden="!columnFilterAnchors.keyKeyword"
      @closeChange="() => closeColumnFilter('keyKeyword')"
      :anchor="columnFilterAnchors.keyKeyword"
    >
      <div cds-layout="vertical align:stretch p:xs">
        <cds-input>
          <input
            type="text"
            :placeholder="locale.t('agents.col.key.search')"
            :aria-label="locale.t('agents.col.key.search')"
            :value="columnFilters.keyKeyword"
            @input="(e: Event) => setColumnFilter('keyKeyword', (e.target as HTMLInputElement).value)"
          />
        </cds-input>
      </div>
    </cds-dropdown>

    <cds-dropdown
      id="filter-USERNAME"
      closable
      :hidden="!columnFilterAnchors.usernameKeyword"
      @closeChange="() => closeColumnFilter('usernameKeyword')"
      :anchor="columnFilterAnchors.usernameKeyword"
    >
      <div cds-layout="vertical align:stretch p:xs">
        <cds-input>
          <input
            type="text"
            :placeholder="locale.t('agents.col.username.search')"
            :aria-label="locale.t('agents.col.username.search')"
            :value="columnFilters.usernameKeyword"
            @input="(e: Event) => setColumnFilter('usernameKeyword', (e.target as HTMLInputElement).value)"
          />
        </cds-input>
      </div>
    </cds-dropdown>

    <!-- Per-row "more" actions dropdown (official row-action pattern) -->
    <cds-dropdown
      id="row-actions"
      closable
      :hidden="!rowActionsAnchor"
      @closeChange="closeRowActions"
      :anchor="rowActionsAnchor"
    >
      <div cds-layout="vertical align:stretch p:xs">
        <button
          v-for="key in rowActionsTarget
            ? ACTIONS_BY_STATUS[STATUS_FROM_GQL[rowActionsTarget.status]]
            : []"
          :key="key"
          type="button"
          class="menu-opt"
          :class="{ danger: key === 'delete' }"
          :aria-label="locale.t(`agents.action.${key}`)"
          @click="onRowAction(key)"
        >
          <cds-icon :shape="ICON_FOR_ACTION[key]" size="sm" aria-hidden="true"></cds-icon>
          <span>{{ locale.t(`agents.action.${key}`) }}</span>
        </button>
      </div>
    </cds-dropdown>

    <ConfirmDialog
      :open="!!deleteTarget"
      :title="locale.t('agents.confirm.deleteTitle')"
      :body="locale.t('agents.confirm.deleteBody').replace('{name}', deleteTarget?.name ?? '')"
      danger
      @close="deleteTarget = null"
      @confirm="doDelete"
    />
    <ConfirmDialog
      :open="batchDeleteOpen"
      :title="locale.t('agents.confirm.deleteTitle')"
      :body="locale.t('agents.confirm.batchDeleteBody').replace('{count}', String(selectedCount))"
      danger
      @close="batchDeleteOpen = false"
      @confirm="doBatchDelete"
    />
  </section>
</template>

<style scoped>
.agent-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  /* The grid is a custom element with default `min-width: auto`, so without
     an explicit width cap it expands to its content's intrinsic min-width
     and re-introduces horizontal page scroll. Force it to honour the
     parent width so the percentage column widths can actually shrink. */
  min-width: 0;
}

.page-head {
  flex-shrink: 0;
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

/* ---------- Toolbar ---------- */

.toolbar {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  flex-shrink: 0;
  margin-top: 20px;
}

/* Refresh button: fully transparent — no background, no border — so it reads
   as a bare icon at every interaction state. Plain <button> element so we can
   override the cds-button theme defaults (which would otherwise paint a fill
   on ghost / outline / solid actions). */
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
  flex-shrink: 0;
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

/* When the refresh button is in-flight, spin the icon itself. The animation
   runs at 1s per full turn, linear, infinite. Applied to the cds-icon host;
   its internal SVG rotates with the host transform. */
.refresh-button .spinning {
  animation: refresh-spin 1s linear infinite;
  transform-origin: center;
}
@keyframes refresh-spin {
  from { transform: rotate(0deg); }
  to   { transform: rotate(360deg); }
}
@media (prefers-reduced-motion: reduce) {
  .refresh-button .spinning {
    animation: none;
  }
}

/* "已选 N 项" affordance — sits at the bottom-left of the table inside
   cds-grid-footer (the footer is already a flex row, so the unpushed
   span naturally lands on the left while `.pager` keeps its
   `margin-left: auto` and stays on the right). */
.pager-selected-count {
  color: var(--cds-alias-typography-color-300, #565656);
  font-size: 13px;
  white-space: nowrap;
  font-weight: 600;
}

/* ---------- cds-grid ---------- */
/* (No card wrapper — matches official datagrid stories which place cds-grid
   directly on the page surface.) */

/* Force the cds-grid host to respect the parent column. Without this the
   element's default `min-width: auto` expands to the intrinsic min-width of
   its cells (long key names + two outline action buttons), forcing a
   horizontal scroll on the page even when the columns use % widths.
   `scroll-lock` on <cds-grid> disables the shadow-DOM scroll container's
   scrollbars; combined with `overflow: hidden` on the host this prevents
   the table from ever overflowing the viewport. */
.agent-list cds-grid {
  display: block;
  width: 100%;
  max-width: 100%;
  min-width: 0;
  overflow: hidden;
}

/* Force cds-grid columns + cells to clip instead of expanding past their
   intrinsic content width (which would re-introduce the inner scrollbar
   even with scroll-lock applied). */
.agent-list cds-grid-column,
.agent-list cds-grid-cell {
  min-width: 0;
  overflow: hidden;
}

/* Native checkbox used for row + header selection. We use a plain <input
   rather than <cds-checkbox> because Vue's reactive `:checked` binding
   fights with cds-checkbox's internal state machine (the input's `checked`
   gets reset on every render before the change handler can read the new
   value). `accent-color` styles the native control with the cds info
   color so it visually matches the rest of the design system. */
.app-checkbox {
  width: 16px;
  height: 16px;
  margin: 0;
  cursor: pointer;
  accent-color: var(--cds-alias-status-info, #0079ad);
}
.app-checkbox:focus-visible {
  outline: 2px solid var(--cds-alias-status-info, #0079ad);
  outline-offset: 2px;
}

/* ---------- cds-grid column heads ---------- */

.col-head {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  width: 100%;
  color: var(--cds-alias-object-app-foreground, #1b1b1b);
}
.col-actions {
  justify-content: flex-start;
}

/* Group <cds-button-sort> + <cds-button-action> in a column header:
   the span is pushed to the right edge of the column (`margin-inline-start: auto`,
   mirroring cds-grid-column's own ::slotted([cds-button-action]) rule), and the
   inner `gap` gives a small breathing room between the two buttons so they don't
   feel like a single tap target. */
.col-head-actions {
  margin-inline-start: auto;
  display: inline-flex;
  align-items: center;
  gap: var(--cds-global-space-4, 6px);
  flex-shrink: 0;
}

/* Rotate the horizontal "two-way-arrows" icon 90° so it reads as a vertical
   up-down double arrow — the "sortable but not currently sorted" indicator.
   The icon's intrinsic viewBox is wider than tall (~36×24), so the rotated
   content is narrower than the host's 16×sm box; we tighten the host's
   vertical alignment so the rotated icon visually centers in the column. */
.col-sort-rotated {
  transform: rotate(90deg);
  transform-origin: center;
}

/* Footer range summary (e.g. "显示 1-10 条,共 50 条"). Sits on the left side
   of cds-grid-footer; cds-grid-pagination is pushed to the right by the
   footer's own ::slotted(cds-grid-pagination){margin-left:auto} rule. */
.pager-summary {
  color: var(--cds-alias-typography-color-300, #565656);
  white-space: nowrap;
}

/* Hand-assembled pager: [label] [page-size select] [summary] [page buttons],
   pushed to the right of cds-grid-footer. We override the cds-grid-footer
   ::slotted(cds-grid-pagination) { margin-left: auto } rule by giving the
   wrapper its own margin-left:auto (the rule only matches the specific tag
   name, our wrapper div is a regular div so the rule doesn't apply). */
.pager {
  display: inline-flex;
  align-items: center;
  gap: var(--cds-global-space-4, 8px);
  margin-left: auto;
  white-space: nowrap;
}

.pager-page-size-label {
  color: var(--cds-alias-typography-color-300, #565656);
  cursor: default;
  user-select: none;
}

/* Status column badge: cds-badge's default `min-width` is 16px, so the pill
   width follows the label text — "异常" (2 chars) ends up narrower than
   "运行中" / "已停止" (3 chars). Force a uniform 48px so all three pills look
   the same width; shorter labels just have a bit more horizontal breathing
   room. Height stays at the cds default (16px). */
.status-badge {
  min-width: 48px;
}

/* ---------- Row cells ---------- */

.cell-name {
  font-weight: 500;
  color: var(--cds-alias-object-app-foreground, #1b1b1b);
}

.cell-name-link {
  font-weight: 500;
  color: var(--cds-alias-object-app-foreground, #1b1b1b);
  text-decoration: none;
}

.cell-name-link:hover {
  color: var(--cds-alias-status-info, #0072a3);
  text-decoration: underline;
}

/* 创建时间 / 更新时间 列: 数字等宽 + 灰字色 + 不换行,
   跟 ModelGatewayView 的 .time-cell 一致,避免列宽 12% 时换行破坏对齐。 */
.time-cell {
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  color: var(--cds-alias-typography-color-300, #565656);
}

.key-cell {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.actions-cell {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  /* Allow buttons to wrap to a second line when the 操作 column is too
     narrow to hold them all on one row — the alternative (clipping) would
     hide part of "访问信息" / "配置". The wrapped row is slightly taller
     than its neighbours; cds-grid handles the alignment automatically. */
  flex-wrap: wrap;
}

/* ---------- Dropdown menu options (used by AppDropdown for batch/more actions
   and by cds-dropdown panels for column filters) ---------- */

.menu-opt {
  display: flex;
  align-items: center;
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
  background: var(--cds-alias-object-border-color, #f4f4f4);
}
.menu-opt.active {
  font-weight: 600;
}
.menu-opt.danger {
  color: var(--cds-alias-status-danger, #c92100);
}
.menu-opt.danger cds-icon {
  color: var(--cds-alias-status-danger, #c92100);
}
</style>
