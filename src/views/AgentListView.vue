<script setup lang="ts">
 
import '@/components/icons'
import { computed, ref, watch } from 'vue'
import { useToast } from '@/composables/useToast'
import { useAgentExport } from '@/composables/useAgentExport'
import { useMutation, useQuery } from '@vue/apollo-composable'
import { useLocaleStore } from '@/stores/locale'
import { useAuthStore } from '@/stores/auth'
import AppDropdown from '@/components/AppDropdown.vue'
import AccessInfoDialog from '@/components/AccessInfoDialog.vue'
import ConfigureAgentDialog from '@/components/ConfigureAgentDialog.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'

import {
  AGENTS_QUERY,
  AGENT_QUERY,
  SET_AGENT_STATUS_MUTATION,
  RECYCLE_AGENT_MUTATION,
  HARD_DELETE_AGENT_MUTATION,
  RESTART_AGENT_MUTATION,
} from '@/api/graphql/queries/agents'
import { apolloClient } from '@/api/graphql/client'
import type {
  Agent,
  AgentQueryResult,
  AgentQueryVars,
  AgentSortField,
  AgentsQueryResult,
  AgentsQueryVars,
  SortDirection,
  StatusKey,
  TypeKey,
} from '@/types/agents'
import { STATUS_FROM_GQL, TYPE_FROM_GQL } from '@/types/agents'

const locale = useLocaleStore()

/* ---------- Query variables (GraphQL) ---------- */

const PAGE_SIZE_OPTIONS = [10, 20, 50, 100, 0] as const
type PageSize = (typeof PAGE_SIZE_OPTIONS)[number]
const PAGE_SIZE_LABELS: Record<PageSize, string> = { 10: '10', 20: '20', 50: '50', 100: '100', 0: 'All' }
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
    f.status = statusFilter.value as Agent['status']
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
  // pageSize 0 = "All" → expand to a large sentinel; backend clamps as needed.
  pageSize: pageSize.value === 0 ? 10000 : pageSize.value,
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
  'exception',
  'provisioning',
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

type RowActionKey = 'rotateKey' | 'restart' | 'stop' | 'start' | 'update' | 'delete' | 'hardDelete' | 'copyAccess'

// Actions vary by status so the menu never shows a no-op (e.g. "stop" on
// an already-stopped agent or "start" on a running one).
const ACTIONS_BY_STATUS: Partial<Record<StatusKey, RowActionKey[]>> = {
  running:   ['rotateKey', 'update', 'restart', 'stop', 'delete', 'hardDelete', 'copyAccess'],
  stopped:   ['rotateKey', 'update', 'start', 'delete', 'hardDelete', 'copyAccess'],
  exception: ['rotateKey', 'update', 'restart', 'stop', 'delete', 'hardDelete', 'copyAccess'],
}

const ICON_FOR_ACTION: Record<RowActionKey, string> = {
  rotateKey: 'key',
  restart: 'sync',
  stop: 'stop',
  // 'play' — visually maps to "power on / start" (VCSA convention).
  start: 'play',
  update: 'update',
  delete: 'trash',
  // 'ban' icon: stronger than 'trash', signals destructive / blocklisting flavor.
  // The Carbon cds-icon shape set includes 'ban'; ConfirmDialog also uses 'danger'
  // styling so the differentiation is mostly the type-to-confirm dialog itself.
  hardDelete: 'ban',
  copyAccess: 'eye',
}

const auth = useAuthStore()

function badgeStatusFor(status: Agent['status']): 'success' | 'neutral' | 'danger' {
  if (status === 'running') return 'success'
  if (status === 'exception') return 'danger'
  if (status === 'provisioning') return 'neutral'
  return 'neutral'
}

/* Row action handlers — wired to real backend mutations. */
const actionTarget = ref<Agent | null>(null)
const actionConfirmOpen = ref(false)
const actionConfirmMode = ref<'stop' | 'restart' | 'start' | 'delete' | 'hardDelete'>('stop')

const { mutate: setStatusMutate } = useMutation(SET_AGENT_STATUS_MUTATION)
const { mutate: recycleMutate } = useMutation(RECYCLE_AGENT_MUTATION)
const { mutate: hardDeleteMutate } = useMutation(HARD_DELETE_AGENT_MUTATION)
const { mutate: restartMutate } = useMutation(RESTART_AGENT_MUTATION)

function openActionConfirm(agent: Agent, mode: 'stop' | 'restart' | 'start' | 'delete' | 'hardDelete') {
  actionTarget.value = agent
  actionConfirmMode.value = mode
  actionConfirmOpen.value = true
}

function closeActionConfirm() {
  actionConfirmOpen.value = false
  actionTarget.value = null
}

// Mirror the bodySegments helper in ModelGatewayView.vue: convert the i18n body
// into [{text: ...}, {text: <name>, bold: true}, ...] so {{name}} renders with
// emphasis. Required because the agency uses type-to-confirm in the dialog.
const hardDeleteBodySegments = computed<{ text: string; bold?: boolean }[]>(() => {
  if (actionConfirmMode.value !== 'hardDelete' || !actionTarget.value) {
    return []
  }
  const template = locale.t('agents.confirm.hardDeleteBody')
  const name = actionTarget.value.name
  const idx = template.indexOf('{{name}}')
  if (idx < 0) return [{ text: template }]
  return [
    { text: template.slice(0, idx) },
    { text: name, bold: true },
    { text: template.slice(idx + '{{name}}'.length) },
  ]
})

async function confirmAction() {
  const agent = actionTarget.value
  if (!agent) return
  const mode = actionConfirmMode.value
  closeActionConfirm()
  try {
    if (mode === 'hardDelete') {
      // hardDeleteAgent PHYSICALLY removes the agent row. confirm: true required
      // server-side; the type-to-confirm dialog (ConfirmDialog bodySegments +
      // expected-input) already enforces the user typed the agent name verbatim.
      await hardDeleteMutate({ input: { agentId: agent.id, confirm: true } })
      toast.success(locale.t('agents.action.hardDeletedOk').replace('{name}', agent.name))
    } else if (mode === 'delete') {
      await recycleMutate({ input: { agentId: agent.id, confirm: true } })
      toast.success(locale.t('agents.action.deletedOk').replace('{name}', agent.name))
    } else if (mode === 'restart') {
      // Graceful guest reboot via VMware Tools → backend restartAgent mutation.
      await restartMutate({ id: agent.id })
      toast.success(locale.t('agents.action.restartedOk').replace('{name}', agent.name))
    } else if (mode === 'stop') {
      await setStatusMutate({ id: agent.id, status: 'stopped' })
      toast.success(locale.t('agents.action.stoppedOk').replace('{name}', agent.name))
    } else {
      // mode === 'start'
      await setStatusMutate({ id: agent.id, status: 'running' })
      toast.success(locale.t('agents.action.startedOk').replace('{name}', agent.name))
    }
    await refetch()
  } catch (err: unknown) {
    console.error(`[agents] ${mode} failed`, err)
    if (mode === 'hardDelete') {
      toast.error(locale.t('agents.action.hardDeleteFailed'))
    } else {
      toast.error(locale.t('agents.action.failed'))
    }
  }
}

function onConfigure(agent: Agent) {
  try {
    configureTarget.value = agent
    configureDialogOpen.value = true
  } catch (err: unknown) {
    console.warn('[agents] configure dialog failed', err)
    toast.error('无法打开配置面板')
  }
}
function closeConfigureDialog() {
  configureDialogOpen.value = false
  configureTarget.value = null
}
function onConfigureRotateKey(agent: Agent) {
  closeConfigureDialog()
  onCopyAccess(agent)
}
function onConfigureRestart(agent: Agent) {
  closeConfigureDialog()
  openActionConfirm(agent, 'restart')
}

function onRowAction(agent: Agent, key: RowActionKey) {
  if (key === 'copyAccess') {
    onCopyAccess(agent)
  } else if (key === 'restart') {
    openActionConfirm(agent, 'restart')
  } else if (key === 'stop') {
    openActionConfirm(agent, 'stop')
  } else if (key === 'start') {
    openActionConfirm(agent, 'start')
  } else if (key === 'delete') {
    openActionConfirm(agent, 'delete')
  } else if (key === 'hardDelete') {
    openActionConfirm(agent, 'hardDelete')
  } else {
    console.log(`[agents] row:${key}`, { id: agent.id })
  }
  closeRowActions()
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

// Access info dialog state
const accessDialogOpen = ref(false)
const accessTarget = ref<Agent | null>(null)
const accessLoading = ref(false)
const accessError = ref<string | null>(null)

// Configure dialog state
const configureDialogOpen = ref(false)
const configureTarget = ref<Agent | null>(null)

async function onCopyKey(agent: Agent) {
  if (!agent.apiKey) return
  const text = agent.apiKey.name
  const fallbackCopy = () => {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    document.execCommand('copy')
    document.body.removeChild(ta)
  }
  try {
    // Secure-context clipboard API — only on HTTPS or localhost
    if (window.isSecureContext && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
    } else {
      fallbackCopy()
    }
    toast.success(locale.t('agents.action.copyKeyOk').replace('{name}', text))
  } catch (err) {
    console.warn('[agents] copy-key failed', { id: agent.id, err })
    // Try fallback if clipboard API threw
    try { fallbackCopy(); toast.success(locale.t('agents.action.copyKeyOk').replace('{name}', text)) }
    catch { toast.error(locale.t('agents.action.copyKeyFail')) }
  }
}

async function onCopyAccess(agent: Agent) {
  accessTarget.value = agent
  accessDialogOpen.value = true
  accessLoading.value = true
  accessError.value = null

  try {
    const { data } = await apolloClient.query<AgentQueryResult, AgentQueryVars>({
      query: AGENT_QUERY,
      variables: { id: agent.id },
      fetchPolicy: 'network-only', // bypass cache — credentials come from vCenter
    })
    if (data?.agent?.credentials) {
      // Merge fresh credentials into target so the dialog sees them
      accessTarget.value = { ...agent, credentials: data.agent.credentials }
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    accessError.value = msg || '无法获取虚拟机凭据'
  } finally {
    accessLoading.value = false
  }
}
function closeAccessDialog() {
  accessDialogOpen.value = false
  accessTarget.value = null
  accessLoading.value = false
  accessError.value = null
}
function retryAccessInfo() {
  const agent = accessTarget.value
  if (!agent) return
  // Re-trigger the full fetch flow
  accessLoading.value = true
  accessError.value = null
  apolloClient.query<AgentQueryResult, AgentQueryVars>({
    query: AGENT_QUERY,
    variables: { id: agent.id },
    fetchPolicy: 'network-only',
  }).then(({ data }) => {
    if (data?.agent?.credentials) {
      accessTarget.value = { ...agent, credentials: data.agent.credentials }
    }
  }).catch((err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err)
    accessError.value = msg || '重试失败'
  }).finally(() => {
    accessLoading.value = false
  })
}


const BATCH_KEYS = ['start', 'stop', 'update', 'delete', 'hardDelete'] as const

/** Map a batch-menu key → its sibling row-action key in `ICON_FOR_ACTION`,
 *  so "批量启动 / 批量停止 / 批量更新" share the same glyph as the
 *  matching item in the per-row "更多" menu. */
const BATCH_ICON_FOR_KEY: Record<(typeof BATCH_KEYS)[number], string> = {
  start: ICON_FOR_ACTION.restart, // sync
  stop: ICON_FOR_ACTION.stop,    // stop
  update: ICON_FOR_ACTION.update, // update
  delete: 'trash',                // matches the more-menu `delete` icon
  hardDelete: ICON_FOR_ACTION.hardDelete, // ban — matches the more-menu hardDelete
}
type BatchKey = (typeof BATCH_KEYS)[number]

/* Batch confirm dialog state. Currently only the destructive pairs (delete and
 * hardDelete) go through a confirmation flow; start/stop/update handlers stay
 * placeholder for now since the matching single-row behaviors are also stub.
 * Destructive dialog state has its own ref-set so the existing per-row confirm
 * flow stays untouched. */
const batchConfirmOpen = ref(false)
const batchConfirmMode = ref<'delete' | 'hardDelete'>('delete')

/** Resolve selectedIds → list of Agent objects (filtered to currently-loaded
 * rows so the confirm dialog can show names). Agents not visible in the
 * current page are silently dropped — admin selection-cap is "what's on
 * screen". */
const selectedAgents = computed<Agent[]>(() => {
  const idSet = selectedIds.value
  if (idSet.size === 0) return []
  return agents.value.filter((a) => idSet.has(a.id))
})

/** Names for the confirm dialog body. Each on its own line; type-to-confirm
 * requires the user to re-enter each name exactly. */
/** Space-separated list — the operator can type (or paste) agent names with
 *  any whitespace separator and ConfirmDialog's trimmed compare will match as
 *  long as the names themselves are exact. We use spaces rather than newlines
 *  because a single-line paste from the agent list column is the most common
 *  path; typing newlines in a single-line input is awkward. */
const batchNamesText = computed(() => selectedAgents.value.map((a) => a.name).join(' '))

/** expected-input for the per-name confirmation: newline-separated list of the
 * selected agent names. ConfirmDialog compares typed (trimmed) input against
 * this verbatim — refuse the mutation if anything is missing/extra. */
const batchExpectedInput = computed(() => batchNamesText.value)

/** Title + body for the batch hard-delete confirm dialog. Body uses
 * bodySegments so {{names}} is rendered as a bold block. */
const batchHardDeleteBodySegments = computed<{ text: string; bold?: boolean }[]>(() => {
  if (batchConfirmMode.value !== 'hardDelete') return []
  const tpl = locale.t('agents.confirm.hardDeleteBatchBody')
  const count = selectedAgents.value.length
  const idx = tpl.indexOf('{{names}}')
  const filled = tpl.replace('{count}', String(count)).replace('{{names}}', batchNamesText.value)
  if (idx < 0) return [{ text: filled }]
  // Pre-block (with {count} replaced) + bold name list + post-block.
  const preBlock = filled.slice(0, filled.indexOf(batchNamesText.value))
  const postBlock = filled.slice(filled.indexOf(batchNamesText.value) + batchNamesText.value.length)
  return [
    { text: preBlock },
    { text: batchNamesText.value, bold: true },
    { text: postBlock },
  ]
})

function onBatch(key: BatchKey, close: () => void) {
  if (selectedIds.value.size === 0) {
    close()
    return
  }
  // Only the destructive keys reach the dialog. start/stop/update remain TODO
  // — they would loop setAgentStatus / batch updater mutations that aren't
  // part of this PR.
  if (key === 'delete') {
    batchConfirmMode.value = 'delete'
    batchConfirmOpen.value = true
    close()
    return
  }
  if (key === 'hardDelete') {
    // Front-end gate matches the row-action guard: hardDelete is admin-only.
    if (auth.role !== 'admin') {
      toast.error(locale.t('agents.action.hardDeleteFailed'))
      close()
      return
    }
    batchConfirmMode.value = 'hardDelete'
    batchConfirmOpen.value = true
    close()
    return
  }
  // start/stop/update: not implemented in this PR — keep no-op for now so
  // the menu still works visually. (Use the per-row actions for these until
  // we wire them up.)
  console.log(`[agents] batch:${key} (not implemented): selected ${selectedIds.value.size}`)
  close()
}

function closeBatchConfirm() {
  batchConfirmOpen.value = false
  selectedIds.value = new Set()
}

async function confirmBatchAction() {
  const list = selectedAgents.value
  const mode = batchConfirmMode.value
  closeBatchConfirm()
  if (list.length === 0) return

  let ok = 0
  let fail = 0
  for (const ag of list) {
    try {
      if (mode === 'hardDelete') {
        await hardDeleteMutate({ input: { agentId: ag.id, confirm: true } })
      } else {
        await recycleMutate({ input: { agentId: ag.id, confirm: true } })
      }
      ok++
    } catch (err) {
      // continue with the rest of the batch — per-row isolation so a single
      // failure (e.g. one agent's resource pool is unreachable) does not
      // block the rest from being deleted.
      console.error(`[agents] batch ${mode} failed for ${ag.id} (${ag.name})`, err)
      fail++
    }
  }
  await refetch()
  toast.success(
    locale.t('agents.batch.done')
      .replace('{ok}', String(ok))
      .replace('{fail}', String(fail)),
  )
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
    return new Intl.DateTimeFormat('zh-CN', {
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
  // "All" mode: pageSize=0, render the full count in the summary without slicing.
  if (pageSize.value === 0) {
    return locale
      .t('agents.footer.summary')
      .replace('{start}', '1')
      .replace('{end}', String(total))
      .replace('{total}', String(total))
  }
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

    <!-- Multi-condition filter bar -->
    <div class="filter-bar">
      <cds-input class="filter-input">
        <input
          type="text"
          :placeholder="locale.t('agents.col.name.search')"
          :aria-label="locale.t('agents.col.name.search')"
          :value="columnFilters.nameKeyword"
          @input="(e: Event) => setColumnFilter('nameKeyword', (e.target as HTMLInputElement).value)"
        />
        <cds-icon slot="prefix" shape="search" size="sm" aria-hidden="true"></cds-icon>
      </cds-input>

      <AppDropdown align="start">
        <template #trigger>
          <cds-button action="outline" size="sm">
            {{ typeFilter === 'all' ? locale.t('agents.type.filter.all') : locale.t(`agents.type.${typeFilter}`) }}
            <cds-icon shape="angle" direction="down" size="sm" aria-hidden="true"></cds-icon>
          </cds-button>
        </template>
        <template #default="{ close }">
          <button
            v-for="t in TYPE_OPTIONS"
            :key="t"
            type="button"
            class="menu-opt"
            :class="{ active: typeFilter === t }"
            @click="setTypeFilter(t); close()"
          >
            <span>{{ t === 'all' ? locale.t('agents.type.filter.all') : locale.t(`agents.type.${t}`) }}</span>
            <cds-icon v-if="typeFilter === t" shape="check" size="sm"></cds-icon>
          </button>
        </template>
      </AppDropdown>

      <AppDropdown align="start">
        <template #trigger>
          <cds-button action="outline" size="sm">
            {{ statusFilter === 'all' ? locale.t('agents.status.filter.all') : locale.t(`agents.status.${statusFilter}`) }}
            <cds-icon shape="angle" direction="down" size="sm" aria-hidden="true"></cds-icon>
          </cds-button>
        </template>
        <template #default="{ close }">
          <button
            v-for="s in STATUS_OPTIONS"
            :key="s"
            type="button"
            class="menu-opt"
            :class="{ active: statusFilter === s }"
            @click="setStatusFilter(s); close()"
          >
            <span>{{ s === 'all' ? locale.t('agents.status.filter.all') : locale.t(`agents.status.${s}`) }}</span>
            <cds-icon v-if="statusFilter === s" shape="check" size="sm"></cds-icon>
          </button>
        </template>
      </AppDropdown>

      <cds-input class="filter-input">
        <input
          type="text"
          :placeholder="locale.t('agents.col.username.search')"
          :aria-label="locale.t('agents.col.username.search')"
          :value="columnFilters.usernameKeyword"
          @input="(e: Event) => setColumnFilter('usernameKeyword', (e.target as HTMLInputElement).value)"
        />
      </cds-input>
    </div>

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
            v-show="key !== 'hardDelete' || auth.role === 'admin'"
            type="button"
            class="menu-opt"
            :class="{ danger: key === 'delete' || key === 'hardDelete' }"
            :aria-label="locale.t(`agents.batch.${key}`)"
            @click="onBatch(key, close)"
          >
            <cds-icon :shape="BATCH_ICON_FOR_KEY[key]" size="sm" aria-hidden="true"></cds-icon>
            <span>{{ locale.t(`agents.batch.${key}`) }}</span>
          </button>
        </template>
      </AppDropdown>

      <cds-button
        action="ghost"
        class="toolbar-refresh"
        :aria-label="locale.t('agents.list.refresh')"
        :title="locale.t('agents.list.refresh')"
        :disabled="loading"
        @click="onRefresh"
      >
        <cds-icon
          shape="refresh"
          size="md"
          :class="{ spinning: loading }"
          aria-hidden="true"
        ></cds-icon>
      </cds-button>
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
      aria-label="agents"
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
              :aria-label="`sort ${locale.t('agents.col.name')}`"
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
              :aria-label="`filter ${locale.t('agents.col.name')}`"
              :expanded="columnFilters.nameKeyword.length > 0"
              @click="(e: MouseEvent) => openColumnFilter('nameKeyword', e.target)"
            ></cds-button-action>
          </span>
        </cds-grid-column>

        <cds-grid-column :width="'10%'">
          {{ locale.t('agents.col.type') }}
          <span class="col-head-actions">
            <cds-button-action
              :aria-label="`sort ${locale.t('agents.col.type')}`"
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
              :aria-label="`filter ${locale.t('agents.col.type')}`"
              :expanded="typeFilter !== 'all'"
              @click="(e: MouseEvent) => openFilter('TYPE', e.target)"
            ></cds-button-action>
          </span>
        </cds-grid-column>

        <cds-grid-column :width="'9%'">
          {{ locale.t('agents.col.status') }}
          <span class="col-head-actions">
            <cds-button-action
              :aria-label="`sort ${locale.t('agents.col.status')}`"
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
              :aria-label="`filter ${locale.t('agents.col.status')}`"
              :expanded="statusFilter !== 'all'"
              @click="(e: MouseEvent) => openFilter('STATUS', e.target)"
            ></cds-button-action>
          </span>
        </cds-grid-column>

        <cds-grid-column :width="'14%'">
          {{ locale.t('agents.col.key') }}
          <span class="col-head-actions">
            <cds-button-action
              :aria-label="`sort ${locale.t('agents.col.key')}`"
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
              :aria-label="`filter ${locale.t('agents.col.key')}`"
              :expanded="columnFilters.keyKeyword.length > 0"
              @click="(e: MouseEvent) => openColumnFilter('keyKeyword', e.target)"
            ></cds-button-action>
          </span>
        </cds-grid-column>

        <cds-grid-column :width="'10%'">
          {{ locale.t('agents.col.username') }}
          <span class="col-head-actions">
            <cds-button-action
              :aria-label="`sort ${locale.t('agents.col.username')}`"
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
              :aria-label="`filter ${locale.t('agents.col.username')}`"
              :expanded="columnFilters.usernameKeyword.length > 0"
              @click="(e: MouseEvent) => openColumnFilter('usernameKeyword', e.target)"
            ></cds-button-action>
          </span>
        </cds-grid-column>

        <cds-grid-column :width="'12%'">
          {{ locale.t('agents.col.createdAt') }}
          <span class="col-head-actions">
            <cds-button-action
              :aria-label="`sort ${locale.t('agents.col.createdAt')}`"
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
              :aria-label="`sort ${locale.t('agents.col.updatedAt')}`"
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
              <cds-icon
                :shape="agent.status === 'running' ? 'success' : agent.status === 'exception' ? 'error' : agent.status === 'provisioning' ? 'hourglass' : 'pause'"
                size="xs"
                aria-hidden="true"
                class="status-icon"
              ></cds-icon>
              <span>{{ locale.t('agents.status.' + agent.status) }}</span>
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
            <span
              class="username-cell"
              :title="agent.owner?.displayName || undefined"
            >{{ agent.owner?.displayName ?? '—' }}</span>
          </cds-grid-cell>
          <cds-grid-cell class="muted time-cell">{{ fmtDateTime(agent.createdAt) }}</cds-grid-cell>
          <cds-grid-cell class="muted time-cell">{{ fmtDateTime(agent.updatedAt) }}</cds-grid-cell>
          <cds-grid-cell>
            <span class="actions-cell">
              <cds-button action="outline" size="sm" @click="onCopyAccess(agent)">
                <cds-icon shape="eye" size="sm" aria-hidden="true"></cds-icon>
                {{ locale.t('agents.action.visit') }}
              </cds-button>
              <cds-button
                action="outline"
                size="sm"
                :disabled="agent.status === 'exception'"
                :title="agent.status === 'exception' ? '异常状态实例暂不支持配置' : undefined"
                @click="onConfigure(agent)"
              >
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
          <cds-icon shape="history" size="xl"></cds-icon>
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
                  {{ PAGE_SIZE_LABELS[opt] }}
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

    <!-- Access Info Dialog -->
    <AccessInfoDialog
      :open="accessDialogOpen"
      :agent="accessTarget"
      :loading="accessLoading"
      :error="accessError"
      @close="closeAccessDialog"
      @retry="retryAccessInfo"
    />

    <!-- Configure Agent Dialog -->
    <ConfigureAgentDialog
      :open="configureDialogOpen"
      :agent="configureTarget"
      @close="closeConfigureDialog"
      @rotate-key="onConfigureRotateKey"
      @restart="onConfigureRestart"
      @open-access-info="(agent: Agent) => { closeConfigureDialog(); onCopyAccess(agent) }"
    />

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
          v-for="key in (rowActionsTarget ? ACTIONS_BY_STATUS[STATUS_FROM_GQL[rowActionsTarget.status]] : [])"
          :key="key"
          v-show="key !== 'hardDelete' || auth.role === 'admin'"
          type="button"
          class="menu-opt"
          :class="{ danger: key === 'delete' || key === 'hardDelete' }"
          :aria-label="locale.t(`agents.action.${key}`)"
          @click="rowActionsTarget && onRowAction(rowActionsTarget, key)"
        >
          <cds-icon :shape="ICON_FOR_ACTION[key]" size="sm" aria-hidden="true"></cds-icon>
          <span>{{ locale.t(`agents.action.${key}`) }}</span>
        </button>
      </div>
    </cds-dropdown>
  </section>
  <!-- Action confirm dialog (stop/restart/delete) -->
  <ConfirmDialog
    :open="actionConfirmOpen && actionConfirmMode !== 'hardDelete'"
    :title="actionConfirmMode === 'stop' ? '停止智能体' : actionConfirmMode === 'start' ? '启动智能体' : actionConfirmMode === 'restart' ? '重启智能体' : '删除智能体'"
    :body="actionConfirmMode === 'stop' ? `确定停止 ${actionTarget?.name ?? ''} 吗？` : actionConfirmMode === 'start' ? `确定启动 ${actionTarget?.name ?? ''} 吗？` : actionConfirmMode === 'restart' ? `确定重启 ${actionTarget?.name ?? ''} 吗？` : `确定删除 ${actionTarget?.name ?? ''} 吗？此操作不可撤销。`"
    confirm-text="确认"
    cancel-text="取消"
    @confirm="confirmAction"
    @cancel="closeActionConfirm"
  />

  <!-- Hard-delete confirm dialog: type-to-confirm, agent name must match exactly.
       Pre-existing ConfirmDialog supports bodySegments + expected-input (see
       ModelGatewayView.vue:618 for the canonical usage). -->
  <ConfirmDialog
    :open="actionConfirmOpen && actionConfirmMode === 'hardDelete'"
    :title="locale.t('agents.confirm.hardDeleteTitle')"
    :body-segments="hardDeleteBodySegments"
    :input-placeholder="locale.t('agents.confirm.hardDeleteInputPlaceholder')"
    :expected-input="actionTarget?.name ?? ''"
    danger
    @confirm="confirmAction"
    @cancel="closeActionConfirm"
  />

  <!-- Batch soft-delete (recycle): single-step confirm listing the count. -->
  <ConfirmDialog
    :open="batchConfirmOpen && batchConfirmMode === 'delete'"
    :title="locale.t('agents.confirm.deleteTitle')"
    :body="locale.t('agents.confirm.batchDeleteBody').replace('{count}', String(selectedAgents.length))"
    confirm-text="确认"
    cancel-text="取消"
    @confirm="confirmBatchAction"
    @cancel="closeBatchConfirm"
  />

  <!-- Batch hard-delete (admin only): type-to-confirm with the full name list
       (newline-separated). Accepts any ordering since ConfirmDialog compares
       text. Operator must type every selected agent's name. -->
  <ConfirmDialog
    :open="batchConfirmOpen && batchConfirmMode === 'hardDelete'"
    :title="locale.t('agents.confirm.hardDeleteBatchTitle').replace('{count}', String(selectedAgents.length))"
    :body-segments="batchHardDeleteBodySegments"
    :input-placeholder="locale.t('agents.confirm.hardDeleteInputPlaceholder')"
    :expected-input="batchExpectedInput"
    danger
    @confirm="confirmBatchAction"
    @cancel="closeBatchConfirm"
  />
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
  font-size: 18px;
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

/* ---------- Multi-condition filter bar ---------- */
.filter-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
  flex-wrap: wrap;
}
.filter-input {
  width: 200px;
}

/* ---------- Username cell (truncate + hover tooltip) ---------- */
.username-cell {
  display: block;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  cursor: default;
}

/* ---------- Status icon ---------- */
.status-icon {
  margin-right: 4px;
  flex-shrink: 0;
}

.toolbar {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  flex-shrink: 0;
  margin-top: 20px;
}

/* Refresh button: fully transparent — no background, no border, no focus
   ring, no pressed-state wash — so it reads as a bare icon at every
   interaction state. cds-button's `:active` rule paints an *inset* box-shadow
   on the internal `.private-host` (the "top edge" the user keeps seeing);
   the only way to defeat it from outside the shadow DOM is to set the
   `--box-shadow-color` token it uses as transparent. */
.toolbar-refresh,
.toolbar-refresh:hover,
.toolbar-refresh:focus,
.toolbar-refresh:focus-visible,
.toolbar-refresh:active {
  --background: transparent;
  --background-hover: var(--cds-alias-object-opacity-100, rgba(0, 0, 0, 0.06));
  --background-active: var(--cds-alias-object-opacity-200, rgba(0, 0, 0, 0.12));
  --border-color: transparent;
  --border-width: 0;
  --box-shadow-color: transparent;
  --color: var(--cds-alias-object-app-foreground, #1b1b1b);
  /* Keep a guaranteed clickable area even though the button looks bare. */
  min-width: 32px;
  min-height: 32px;
  outline: none !important;
  box-shadow: none !important;
}

/* When the refresh button is in-flight, spin the icon itself (replaces
   cds-button's built-in progress-circle, per the user's spec). The
   animation runs at 1s per full turn, linear, infinite. Applied to the
   cds-icon host; its internal SVG rotates with the host transform. */
.toolbar-refresh .spinning {
  animation: refresh-spin 1s linear infinite;
  transform-origin: center;
}
@keyframes refresh-spin {
  from { transform: rotate(0deg); }
  to   { transform: rotate(360deg); }
}
@media (prefers-reduced-motion: reduce) {
  .toolbar-refresh .spinning {
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
   horizontal scroll on the page even when the columns use % widths. */
.agent-list cds-grid {
  display: block;
  width: 100%;
  max-width: 100%;
  min-width: 0;
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
