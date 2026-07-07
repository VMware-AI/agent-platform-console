<script setup lang="ts">
import { computed, ref } from 'vue'
import { useQuery } from '@vue/apollo-composable'
import { apolloClient } from '@/api/graphql/client'
import AppDropdown from '@/components/AppDropdown.vue'
import VirtualKeyFormModal from '@/components/VirtualKeyFormModal.vue'
import VirtualKeySecretDialog from '@/components/VirtualKeySecretDialog.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import { useLocaleStore } from '@/stores/locale'
import { useAuthStore } from '@/stores/auth'
import { useToast } from '@/composables/useToast'
import { graphqlErrorMessage } from '@/api/graphql/errors'
import type { VirtualKeyOption, VirtualKeyStatus } from '@/types/virtual-key'
import {
  VIRTUAL_KEYS_QUERY,
  GATEWAY_AVAILABLE_MODELS,
  ISSUE_VIRTUAL_KEY,
  REGENERATE_VIRTUAL_KEY,
  SET_VIRTUAL_KEY_ENABLED,
  REVOKE_VIRTUAL_KEY,
  type VirtualKeysResult,
  type VirtualKeyNode,
  type IssueVirtualKeyResult,
  type IssueVirtualKeyVars,
  type RegenerateVirtualKeyResult,
  type RegenerateVirtualKeyVars,
  type SetVirtualKeyEnabledResult,
  type SetVirtualKeyEnabledVars,
  type RevokeVirtualKeyResult,
  type RevokeVirtualKeyVars,
  type GatewayAvailableModelsResult,
  type GatewayAvailableModelsVars,
} from '@/api/graphql/queries/virtual-keys'
import { MODEL_GATEWAYS_QUERY } from '@/api/graphql/queries/model-gateways'
import { AGENTS_QUERY } from '@/api/graphql/queries/agents'
import '@/components/icons'

const locale = useLocaleStore()
const auth = useAuthStore()
const toast = useToast()

const PAGE_SIZE_OPTIONS = [10, 20, 50] as const
const STATUS_FILTER_OPTIONS = ['ALL', 'ENABLED', 'DISABLED'] as const
type PageSize = (typeof PAGE_SIZE_OPTIONS)[number]
type BatchAction = 'enable' | 'disable' | 'delete'
type SortDirection = 'ASC' | 'DESC'
type KeyColumn = 'NAME' | 'AGENT' | 'PROGRESS' | 'STATUS' | 'CREATED_AT' | 'EXPIRES_AT'

const COLUMNS: Array<{ key: KeyColumn; label: string; width: string }> = [
  { key: 'NAME', label: 'virtualKey.col.name', width: '17%' },
  { key: 'AGENT', label: 'virtualKey.col.agent', width: '13%' },
  // 消费进度 — design doc §4.1 "消费控制进度条". Reads key.spend /
  // key.maxBudget; the worker refreshes spend on a tick. Width matches
  // the rest of the columns.
  { key: 'PROGRESS', label: 'virtualKey.col.progress', width: '15%' },
  { key: 'STATUS', label: 'virtualKey.col.status', width: '9%' },
  { key: 'CREATED_AT', label: 'virtualKey.col.createdAt', width: '13%' },
  { key: 'EXPIRES_AT', label: 'virtualKey.col.expiresAt', width: '13%' },
]

// Selector data sources. Agents/gateways are paged on the backend; pull a
// large page so the issue form's dropdowns hold the full set.
const SELECTOR_PAGE = { page: 1, pageSize: 1000 }

interface AgentNode {
  id: string
  name: string
}
interface AgentsQueryResult {
  agents: { nodes: AgentNode[] }
}
interface ModelGatewayFieldsLite {
  id: string
  name: string
}
interface ModelGatewaysResult {
  modelGateways: { nodes: ModelGatewayFieldsLite[]; totalCount: number }
}

// selectedIds — Set for O(1) membership checks during select-all toggles.
const selectedIds = ref(new Set<string>())
const pageSize = ref<PageSize>(20)
const currentPage = ref(1)
const formOpen = ref(false)
const saving = ref(false)
const pendingDeleteIds = ref<string[]>([])
const secretValue = ref('')
const secretOpen = ref(false)
const sortField = ref<KeyColumn | null>(null)
const sortDirection = ref<SortDirection>('ASC')
const nameFilter = ref('')
const agentFilter = ref('')
const statusFilter = ref<'ALL' | 'ENABLED' | 'DISABLED'>('ALL')
const createdAtFilter = ref('')
const expiresAtFilter = ref('')
// Backed by the same inputs that drive the VIRTUAL_KEYS_QUERY vars: when they
// change, the query re-fires with the new value. We keep per-column client
// filters for status / dates / name on top.
const orgFilter = ref('')
const gatewayFilter = ref('')
const filterMenuAnchor = ref<HTMLElement | null>(null)
const filterMenuKey = ref<KeyColumn | null>(null)

// formGateway holds the currently selected modelGateway in the Issue form.
// The available-models sub-query is skipped until the user picks one.
const formGateway = ref('')

const {
  result: keysData,
  loading,
  refetch: refetchKeys,
} = useQuery<VirtualKeysResult, { organizationId: string | null; agentId: string | null; modelGateway: string | null }>(
  VIRTUAL_KEYS_QUERY,
  () => ({
    organizationId: orgFilter.value.trim() || null,
    agentId: agentFilter.value.trim() || null,
    modelGateway: gatewayFilter.value || null,
  }),
)
const { result: gatewaysData } = useQuery<ModelGatewaysResult>(MODEL_GATEWAYS_QUERY, {
  filter: null,
  page: { limit: 1000, offset: 0 },
  sort: null,
})
const { result: agentsData } = useQuery<AgentsQueryResult>(AGENTS_QUERY, {
  pagination: SELECTOR_PAGE,
})
const { result: formAvailableModelsData } = useQuery<
  GatewayAvailableModelsResult,
  GatewayAvailableModelsVars
>(GATEWAY_AVAILABLE_MODELS, () => ({ gatewayConnectionId: formGateway.value }), () => ({
  enabled: Boolean(formGateway.value),
}))

const gatewayOptions = computed<VirtualKeyOption[]>(() =>
  (gatewaysData.value?.modelGateways?.nodes ?? []).map((gateway) => ({
    id: gateway.id,
    name: gateway.name,
  })),
)
const agentOptions = computed<VirtualKeyOption[]>(() =>
  (agentsData.value?.agents?.nodes ?? []).map((agent) => ({ id: agent.id, name: agent.name })),
)
const formAvailableModels = computed<string[]>(
  () => formAvailableModelsData.value?.gatewayAvailableModels ?? [],
)
const agentNameById = computed(() => {
  const map = new Map<string, string>()
  for (const option of agentOptions.value) map.set(option.id, option.name)
  return map
})

const virtualKeys = computed<VirtualKeyNode[]>(
  () => keysData.value?.virtualKeys ?? [],
)

function displayName(key: VirtualKeyNode): string {
  return key.name || '—'
}

function agentName(key: VirtualKeyNode): string {
  if (!key.agentId) return '—'
  return agentNameById.value.get(key.agentId) ?? key.agentId
}

function consumptionProgress(key: VirtualKeyNode): { ratio: number; color: string } | null {
  if (key.maxBudget == null || key.maxBudget <= 0) return null
  const ratio = Math.min(1, Math.max(0, key.spend / key.maxBudget))
  let color = '#48960c'
  if (ratio >= 0.95) color = '#c92100'
  else if (ratio >= 0.7) color = '#e8a32a'
  return { ratio, color }
}

function progressStyle(key: VirtualKeyNode) {
  const progress = consumptionProgress(key)
  if (!progress) return { width: '0%', background: 'transparent' }
  return {
    width: `${(progress.ratio * 100).toFixed(1)}%`,
    background: progress.color,
  }
}

function progressText(key: VirtualKeyNode): string {
  if (key.maxBudget == null || key.maxBudget <= 0) return '—'
  return `${key.spend} / ${key.maxBudget}`
}

function progressTooltip(key: VirtualKeyNode): string {
  if (key.maxBudget == null || key.maxBudget <= 0) return locale.t('virtualKey.col.progress') as string
  return `${((key.spend / key.maxBudget) * 100).toFixed(1)}%`
}

const filteredKeys = computed<VirtualKeyNode[]>(() => {
  const nameKeyword = nameFilter.value.trim().toLocaleLowerCase()
  const agentKeyword = agentFilter.value.trim().toLocaleLowerCase()
  const result = virtualKeys.value.filter((key) => {
    if (nameKeyword && !displayName(key).toLocaleLowerCase().includes(nameKeyword)) return false
    if (agentKeyword && !agentName(key).toLocaleLowerCase().includes(agentKeyword)) return false
    if (statusFilter.value === 'ENABLED' && key.status !== 'active') return false
    if (statusFilter.value === 'DISABLED' && key.status !== 'disabled') return false
    if (createdAtFilter.value && key.createdAt.slice(0, 10) !== createdAtFilter.value) return false
    if (expiresAtFilter.value && (key.expiresAt ?? '').slice(0, 10) !== expiresAtFilter.value)
      return false
    return true
  })
  if (!sortField.value) return result
  const statusRank = (status: VirtualKeyStatus) =>
    status === 'active' ? 2 : status === 'disabled' ? 1 : 0
  const dir = sortDirection.value === 'ASC' ? 1 : -1
  return [...result].sort((a, b) => {
    if (sortField.value === 'STATUS') return (statusRank(a.status) - statusRank(b.status)) * dir
    if (sortField.value === 'CREATED_AT') return (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0) * dir
    if (sortField.value === 'EXPIRES_AT')
      return ((a.expiresAt ?? '') < (b.expiresAt ?? '') ? -1 : (a.expiresAt ?? '') > (b.expiresAt ?? '') ? 1 : 0) * dir
    if (sortField.value === 'NAME') return displayName(a).localeCompare(displayName(b), locale.locale) * dir
    if (sortField.value === 'AGENT') return agentName(a).localeCompare(agentName(b), locale.locale) * dir
    return 0
  })
})

const totalCount = computed(() => filteredKeys.value.length)
const totalPages = computed(() => Math.max(1, Math.ceil(totalCount.value / pageSize.value)))
const visibleKeys = computed<VirtualKeyNode[]>(() =>
  filteredKeys.value.slice((currentPage.value - 1) * pageSize.value, currentPage.value * pageSize.value),
)
const selectedCount = computed(() => selectedIds.value.size)
const allVisibleSelected = computed(() => {
  const selectable = visibleKeys.value.filter((key) => key.status !== 'revoked')
  if (selectable.length === 0) return false
  return selectable.every((key) => selectedIds.value.has(key.id))
})

const summaryText = computed(() => {
  if (totalCount.value === 0) return locale.t('virtualKey.pagination.summary.empty') as string
  const start = (currentPage.value - 1) * pageSize.value + 1
  const end = Math.min(currentPage.value * pageSize.value, totalCount.value)
  return locale
    .t('virtualKey.pagination.summary')
    .replace('{start}', String(start))
    .replace('{end}', String(end))
    .replace('{total}', String(totalCount.value))
})

const deleteDialogTitle = computed(() => {
  if (pendingDeleteIds.value.length > 1) return locale.t('virtualKey.confirm.batchDeleteTitle') as string
  const target = virtualKeys.value.find((key) => key.id === pendingDeleteIds.value[0])
  return locale.t('virtualKey.confirm.deleteTitle').replace('{name}', target ? displayName(target) : '')
})

const deleteDialogBody = computed(() => {
  if (pendingDeleteIds.value.length > 1)
    return locale
      .t('virtualKey.confirm.batchDeleteBody')
      .replace('{count}', String(pendingDeleteIds.value.length))
  const target = virtualKeys.value.find((key) => key.id === pendingDeleteIds.value[0])
  return locale.t('virtualKey.confirm.deleteBody').replace('{name}', target ? displayName(target) : '')
})

function statusVariant(status: VirtualKeyStatus): 'success' | 'neutral' | 'danger' {
  return status === 'active' ? 'success' : status === 'disabled' ? 'neutral' : 'danger'
}

function statusIcon(status: VirtualKeyStatus): string {
  return status === 'active' ? 'check-circle' : status === 'disabled' ? 'ban' : 'times-circle'
}

function statusLabel(status: VirtualKeyStatus): string {
  if (status === 'active') return locale.t('virtualKey.status.enabled') as string
  if (status === 'disabled') return locale.t('virtualKey.status.disabled') as string
  return locale.t('virtualKey.status.revoked') as string
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function toggleSelect(id: string, checked: boolean) {
  const next = new Set(selectedIds.value)
  if (checked) next.add(id)
  else next.delete(id)
  selectedIds.value = next
}

function toggleSelectAll(checked: boolean) {
  const next = new Set(selectedIds.value)
  for (const key of visibleKeys.value) {
    if (key.status === 'revoked') continue
    if (checked) next.add(key.id)
    else next.delete(key.id)
  }
  selectedIds.value = next
}

function sortStateFor(field: KeyColumn): 'idle' | 'ascending' | 'descending' {
  if (sortField.value !== field) return 'idle'
  return sortDirection.value === 'ASC' ? 'ascending' : 'descending'
}

function toggleSort(field: KeyColumn) {
  if (sortField.value !== field) {
    sortField.value = field
    sortDirection.value = 'ASC'
  } else if (sortDirection.value === 'ASC') {
    sortDirection.value = 'DESC'
  } else {
    sortField.value = null
    sortDirection.value = 'ASC'
  }
  currentPage.value = 1
}

function openFilterMenu(key: KeyColumn, event: MouseEvent) {
  filterMenuKey.value = key
  filterMenuAnchor.value = event.currentTarget as HTMLElement
}

function closeFilterMenu() {
  filterMenuKey.value = null
  filterMenuAnchor.value = null
}

function hasFilter(key: KeyColumn | null): boolean {
  if (key === 'NAME') return Boolean(nameFilter.value.trim())
  if (key === 'AGENT') return Boolean(agentFilter.value.trim())
  if (key === 'STATUS') return statusFilter.value !== 'ALL'
  if (key === 'CREATED_AT') return Boolean(createdAtFilter.value)
  if (key === 'EXPIRES_AT') return Boolean(expiresAtFilter.value)
  return false
}

function textFilterValue(key: KeyColumn): string {
  if (key === 'NAME') return nameFilter.value
  if (key === 'AGENT') return agentFilter.value
  if (key === 'CREATED_AT') return createdAtFilter.value
  return expiresAtFilter.value
}

function setTextFilter(key: KeyColumn, value: string) {
  if (key === 'NAME') nameFilter.value = value
  else if (key === 'AGENT') agentFilter.value = value
  else if (key === 'CREATED_AT') createdAtFilter.value = value
  else expiresAtFilter.value = value
  currentPage.value = 1
}

function setStatusFilter(value: (typeof STATUS_FILTER_OPTIONS)[number]) {
  statusFilter.value = value
  currentPage.value = 1
  closeFilterMenu()
}

function clearActiveFilter() {
  if (!filterMenuKey.value) return
  if (filterMenuKey.value === 'NAME') nameFilter.value = ''
  else if (filterMenuKey.value === 'AGENT') agentFilter.value = ''
  else if (filterMenuKey.value === 'STATUS') statusFilter.value = 'ALL'
  else if (filterMenuKey.value === 'CREATED_AT') createdAtFilter.value = ''
  else if (filterMenuKey.value === 'EXPIRES_AT') expiresAtFilter.value = ''
  currentPage.value = 1
  closeFilterMenu()
}

function openCreate() {
  formOpen.value = true
}

function closeForm() {
  if (saving.value) return
  formOpen.value = false
}

function revealSecret(secret: string) {
  secretValue.value = secret
  secretOpen.value = true
}

function closeSecret() {
  secretValue.value = ''
  secretOpen.value = false
}

function onFormGatewayChanged(gatewayId: string) {
  formGateway.value = gatewayId
}

async function submitKey(draft: {
  name: string
  organizationId: string
  modelGateway: string
  agentId?: string | null
  duration?: string
  expiresAt?: string | null
  models?: string[]
  maxBudget?: number
  budgetDuration?: string
  maxParallelRequests?: number
  tpmLimit?: number
  rpmLimit?: number
  rpmLimitType?: string
  tpmLimitType?: string
  allowedRoutes?: string[]
  tags?: string[]
  blocked?: boolean
  keyType?: string
  autoRotate?: boolean
  rotationInterval?: string
}) {
  if (saving.value) return
  saving.value = true
  try {
    const { data } = await apolloClient.mutate<IssueVirtualKeyResult, IssueVirtualKeyVars>({
      mutation: ISSUE_VIRTUAL_KEY,
      variables: {
        input: {
          organizationId: draft.organizationId.trim(),
          name: draft.name.trim(),
          modelGateway: draft.modelGateway,
          agentId: draft.agentId?.trim() || null,
          duration: draft.duration?.trim() || null,
          expiresAt: draft.expiresAt ?? null,
          models: draft.models?.length ? draft.models : null,
          maxBudget: draft.maxBudget ?? null,
          budgetDuration: draft.budgetDuration?.trim() || null,
          maxParallelRequests: draft.maxParallelRequests ?? null,
          rpmLimit: draft.rpmLimit ?? null,
          tpmLimit: draft.tpmLimit ?? null,
          rpmLimitType: draft.rpmLimitType?.trim() || null,
          tpmLimitType: draft.tpmLimitType?.trim() || null,
          allowedRoutes: draft.allowedRoutes,
          tags: draft.tags?.length ? draft.tags : null,
          blocked: draft.blocked ?? null,
          keyType: draft.keyType?.trim() || null,
          autoRotate: draft.autoRotate ?? null,
          rotationInterval: draft.rotationInterval?.trim() || null,
        },
      },
    })
    formOpen.value = false
    // Reveal secret BEFORE refetch — the secret is shown exactly once.
    const secret = data?.issueVirtualKey?.secret
    if (secret) revealSecret(secret)
    toast.success(locale.t('virtualKey.toast.created') as string)
    currentPage.value = 1
  } catch (error) {
    toast.error(graphqlErrorMessage(error, locale.t('virtualKey.toast.issueFailed') as string))
    return
  } finally {
    saving.value = false
  }
  await refetchKeys()?.catch(() => {})
}

async function setEnabled(ids: string[], enabled: boolean) {
  const targets = ids.filter(
    (id) => virtualKeys.value.find((key) => key.id === id)?.status !== 'revoked',
  )
  if (targets.length === 0) return
  const outcomes = await Promise.allSettled(
    targets.map((id) =>
      apolloClient.mutate<SetVirtualKeyEnabledResult, SetVirtualKeyEnabledVars>({
        mutation: SET_VIRTUAL_KEY_ENABLED,
        variables: { id, enabled },
      }),
    ),
  )
  const fulfilled = outcomes.filter((outcome) => outcome.status === 'fulfilled').length
  const rejected = outcomes.find(
    (outcome): outcome is PromiseRejectedResult => outcome.status === 'rejected',
  ) as PromiseRejectedResult | undefined
  const key = enabled ? 'virtualKey.toast.enabled' : 'virtualKey.toast.disabled'
  toast.success((locale.t(key) as string).replace('{count}', String(fulfilled)))
  if (rejected) {
    toast.error(graphqlErrorMessage(rejected.reason, locale.t('virtualKey.toast.saveFailed') as string))
  }
  await refetchKeys()
}

function toggleEnabled(keyNode: VirtualKeyNode, close: () => void) {
  close()
  void setEnabled([keyNode.id], keyNode.status !== 'active')
}

async function regenerate(keyNode: VirtualKeyNode, close: () => void) {
  if (saving.value) return
  close()
  saving.value = true
  try {
    const { data } = await apolloClient.mutate<RegenerateVirtualKeyResult, RegenerateVirtualKeyVars>({
      mutation: REGENERATE_VIRTUAL_KEY,
      variables: { id: keyNode.id },
    })
    // Reveal secret BEFORE refetch.
    const secret = data?.regenerateVirtualKey?.secret
    if (secret) revealSecret(secret)
    toast.success(locale.t('virtualKey.toast.regenerated') as string)
  } catch (error) {
    toast.error(graphqlErrorMessage(error, locale.t('virtualKey.toast.regenerateFailed') as string))
  } finally {
    saving.value = false
  }
  await refetchKeys()?.catch(() => {})
}

function performBatch(action: BatchAction, close: () => void) {
  close()
  const ids = Array.from(selectedIds.value)
  if (ids.length === 0) return
  if (action === 'enable') void setEnabled(ids, true)
  else if (action === 'disable') void setEnabled(ids, false)
  else if (action === 'delete') pendingDeleteIds.value = ids
}

function requestDelete(keyNode: VirtualKeyNode, close: () => void) {
  close()
  pendingDeleteIds.value = [keyNode.id]
}

function closeDelete() {
  pendingDeleteIds.value = []
}

async function confirmDelete() {
  const ids = pendingDeleteIds.value
  if (ids.length === 0) return
  const targets = ids.filter(
    (id) => virtualKeys.value.find((key) => key.id === id)?.status !== 'revoked',
  )
  const outcomes = await Promise.allSettled(
    targets.map((id) =>
      apolloClient.mutate<RevokeVirtualKeyResult, RevokeVirtualKeyVars>({
        mutation: REVOKE_VIRTUAL_KEY,
        variables: { id },
      }),
    ),
  )
  const revokedIds = targets.filter((_, index) => outcomes[index].status === 'fulfilled')
  toast.success((locale.t('virtualKey.toast.deleted') as string).replace('{count}', String(revokedIds.length)))
  const firstRejection = outcomes.find(
    (outcome): outcome is PromiseRejectedResult => outcome.status === 'rejected',
  ) as PromiseRejectedResult | undefined
  if (firstRejection) {
    toast.error(graphqlErrorMessage(firstRejection.reason, locale.t('virtualKey.toast.saveFailed') as string))
  }
  // Selection cleanup — revoked keys are no longer actionable.
  const next = new Set(selectedIds.value)
  for (const id of revokedIds) next.delete(id)
  selectedIds.value = next
  pendingDeleteIds.value = []
  await refetchKeys()
  if (currentPage.value > totalPages.value) currentPage.value = totalPages.value
}

function copyWithFallback(value: string) {
  const textarea = document.createElement('textarea')
  textarea.value = value
  textarea.style.position = 'fixed'
  textarea.style.opacity = '0'
  document.body.appendChild(textarea)
  textarea.focus()
  textarea.select()
  let ok = false
  try {
    ok = document.execCommand('copy')
  } catch {
    ok = false
  }
  document.body.removeChild(textarea)
  return ok
}

async function copyValue(value: string | null, successKey: string) {
  if (value == null) return
  let ok = false
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value)
      ok = true
    } else {
      ok = copyWithFallback(value)
    }
  } catch {
    ok = copyWithFallback(value)
  }
  if (ok) {
    toast.success(locale.t(successKey) as string)
  } else {
    toast.error(locale.t('virtualKey.toast.copyFailed') as string)
  }
}

async function refreshKeys() {
  if (loading.value) return
  try {
    await refetchKeys()
    toast.success(locale.t('virtualKey.toast.refreshed') as string)
  } catch (error) {
    toast.error(graphqlErrorMessage(error, locale.t('virtualKey.toast.refreshFailed') as string))
  }
}

function onPageSizeChange(event: Event) {
  const value = Number((event.target as HTMLSelectElement).value)
  if (PAGE_SIZE_OPTIONS.includes(value as PageSize)) {
    pageSize.value = value as PageSize
    currentPage.value = 1
  }
}

function goToPage(page: number) {
  if (Number.isNaN(page)) return
  const clamped = Math.min(Math.max(1, page), totalPages.value)
  currentPage.value = clamped
}
</script>

<template>
  <section class="virtual-key-page">
    <header class="page-head">
      <h1 cds-text="title" class="heading">{{ locale.t('virtualKey.title') }}</h1>
      <p cds-text="body" class="desc muted">{{ locale.t('virtualKey.description') }}</p>
    </header>

    <div class="toolbar">
      <cds-button action="outline" status="primary" @click="openCreate">
        <cds-icon shape="plus-circle" size="sm" aria-hidden="true"></cds-icon>
        {{ locale.t('virtualKey.action.create') }}
      </cds-button>

      <AppDropdown align="start" :disabled="selectedCount === 0">
        <template #trigger>
          <cds-button
            action="outline"
            :disabled="selectedCount === 0"
            :title="selectedCount === 0 ? (locale.t('virtualKey.batch.disabled') as string) : undefined"
          >
            <cds-icon shape="cog" size="sm" aria-hidden="true"></cds-icon>
            {{ locale.t('virtualKey.action.batch') }}
            <cds-icon shape="angle" direction="down" size="sm" aria-hidden="true"></cds-icon>
          </cds-button>
        </template>
        <template #default="{ close }">
          <button class="menu-option" type="button" @click="performBatch('enable', close)">
            <cds-icon shape="check-circle" size="sm" aria-hidden="true"></cds-icon>
            {{ locale.t('virtualKey.batch.enable') }}
          </button>
          <button class="menu-option" type="button" @click="performBatch('disable', close)">
            <cds-icon shape="ban" size="sm" aria-hidden="true"></cds-icon>
            {{ locale.t('virtualKey.batch.disable') }}
          </button>
          <button class="menu-option danger" type="button" @click="performBatch('delete', close)">
            <cds-icon shape="trash" size="sm" aria-hidden="true"></cds-icon>
            {{ locale.t('virtualKey.batch.delete') }}
          </button>
        </template>
      </AppDropdown>

      <button
        type="button"
        class="refresh-button"
        :disabled="loading"
        :aria-label="locale.t('virtualKey.action.refresh')"
        :title="locale.t('virtualKey.action.refresh')"
        @click="refreshKeys"
      >
        <cds-icon shape="refresh" size="md" :class="{ spinning: loading }" aria-hidden="true"></cds-icon>
      </button>
    </div>

    <cds-grid
      border="row"
      column-layout="flex"
      role="grid"
      scroll-lock
      :aria-label="locale.t('virtualKey.table.label')"
    >
      <cds-grid-column type="action" :resizable="false">
        <input
          type="checkbox"
          class="app-checkbox"
          :checked="allVisibleSelected"
          :aria-label="locale.t('virtualKey.col.selectAll')"
          @change="toggleSelectAll(($event.target as HTMLInputElement).checked)"
        />
      </cds-grid-column>

      <cds-grid-column v-for="column in COLUMNS" :key="column.key" :width="column.width">
        <div class="column-head">
          <span>{{ locale.t(column.label) }}</span>
          <span class="column-head-actions">
            <cds-button-action
              :aria-label="locale.t('virtualKey.sort').replace('{column}', locale.t(column.label))"
              @click="toggleSort(column.key)"
            >
              <cds-icon
                v-if="sortStateFor(column.key) === 'ascending'"
                shape="angle"
                direction="up"
                size="sm"
              ></cds-icon>
              <cds-icon
                v-else-if="sortStateFor(column.key) === 'descending'"
                shape="angle"
                direction="down"
                size="sm"
              ></cds-icon>
              <cds-icon v-else shape="two-way-arrows" class="sort-idle" size="sm"></cds-icon>
            </cds-button-action>
            <cds-button-action
              shape="filter"
              :expanded="hasFilter(column.key)"
              :aria-label="locale.t('virtualKey.filter').replace('{column}', locale.t(column.label))"
              @click="(event: MouseEvent) => openFilterMenu(column.key, event)"
            ></cds-button-action>
          </span>
        </div>
      </cds-grid-column>
      <cds-grid-column width="15%">{{ locale.t('virtualKey.col.actions') }}</cds-grid-column>

      <cds-grid-row v-for="keyItem in visibleKeys" :key="keyItem.id">
        <cds-grid-cell>
          <input
            type="checkbox"
            class="app-checkbox"
            :checked="selectedIds.has(keyItem.id)"
            :disabled="keyItem.status === 'revoked'"
            :aria-label="locale.t('virtualKey.col.selectKey').replace('{name}', displayName(keyItem))"
            @change="toggleSelect(keyItem.id, ($event.target as HTMLInputElement).checked)"
          />
        </cds-grid-cell>

        <cds-grid-cell v-for="column in COLUMNS" :key="column.key">
          <div v-if="column.key === 'NAME'" class="name-cell">
            <strong class="key-name" :title="displayName(keyItem)">
              {{ displayName(keyItem) }}
            </strong>
            <button
              v-if="keyItem.maskedKey"
              type="button"
              class="icon-action"
              :title="keyItem.maskedKey"
              :aria-label="locale.t('virtualKey.action.copyMasked')"
              @click="copyValue(keyItem.maskedKey, 'virtualKey.toast.maskedCopied')"
            >
              <cds-icon shape="copy" size="sm"></cds-icon>
            </button>
          </div>
          <div v-else-if="column.key === 'AGENT'" class="agent-cell">
            <span :title="agentName(keyItem)">{{ agentName(keyItem) }}</span>
            <button
              v-if="keyItem.agentId"
              type="button"
              class="icon-action"
              :title="locale.t('virtualKey.action.copyAgent')"
              @click="copyValue(keyItem.agentId, 'virtualKey.toast.agentCopied')"
            >
              <cds-icon shape="copy" size="sm"></cds-icon>
            </button>
          </div>
          <cds-badge
            v-else-if="column.key === 'STATUS'"
            :status="statusVariant(keyItem.status)"
            class="status-badge"
          >
            <cds-icon :shape="statusIcon(keyItem.status)" size="sm"></cds-icon>
            {{ statusLabel(keyItem.status) }}
          </cds-badge>
          <span v-else-if="column.key === 'CREATED_AT'" class="date-cell">
            {{ formatDateTime(keyItem.createdAt) }}
          </span>
          <span v-else-if="column.key === 'EXPIRES_AT'" class="date-cell">
            {{ formatDateTime(keyItem.expiresAt) }}
          </span>
          <span
            v-else-if="column.key === 'PROGRESS'"
            class="progress-cell"
            :title="progressTooltip(keyItem)"
          >
            <div class="progress-track">
              <div
                class="progress-fill"
                :style="progressStyle(keyItem)"
              ></div>
            </div>
            <span class="progress-text">{{ progressText(keyItem) }}</span>
          </span>
        </cds-grid-cell>

        <cds-grid-cell>
          <div v-if="keyItem.status !== 'revoked'" class="row-actions">
            <AppDropdown align="end" :offset="4">
              <template #trigger>
                <button
                  type="button"
                  class="more-button"
                  :title="locale.t('virtualKey.action.more')"
                  :aria-label="locale.t('virtualKey.action.more')"
                >
                  <cds-icon shape="ellipsis-vertical" size="sm"></cds-icon>
                </button>
              </template>
              <template #default="{ close }">
                <button v-if="auth.role === 'admin'" class="menu-option" type="button" @click="regenerate(keyItem, close)">
                  <cds-icon shape="refresh" size="sm"></cds-icon>
                  {{ locale.t('virtualKey.action.regenerate') }}
                </button>
                <button class="menu-option" type="button" @click="toggleEnabled(keyItem, close)">
                  <cds-icon :shape="keyItem.status === 'active' ? 'ban' : 'check-circle'" size="sm"></cds-icon>
                  {{ locale.t(keyItem.status === 'active' ? 'virtualKey.action.disable' : 'virtualKey.action.enable') }}
                </button>
                <button v-if="auth.role === 'admin'" class="menu-option danger" type="button" @click="requestDelete(keyItem, close)">
                  <cds-icon shape="trash" size="sm"></cds-icon>
                  {{ locale.t('virtualKey.action.delete') }}
                </button>
              </template>
            </AppDropdown>
          </div>
          <span v-else class="revoked-note">{{ locale.t('virtualKey.status.revoked') }}</span>
        </cds-grid-cell>
      </cds-grid-row>

      <cds-grid-placeholder v-if="visibleKeys.length === 0">
        <cds-icon shape="key" size="xl"></cds-icon>
        <p cds-text="subsection">{{ locale.t('virtualKey.empty') }}</p>
      </cds-grid-placeholder>

      <cds-grid-footer v-if="totalCount > 0">
        <span v-if="selectedCount > 0" class="selected-summary">
          {{ locale.t('virtualKey.selected').replace('{count}', String(selectedCount)) }}
        </span>
        <div class="pager">
          <label for="virtual-key-page-size">{{ locale.t('virtualKey.pagination.pageSize') }}</label>
          <cds-select control-width="shrink">
            <select
              id="virtual-key-page-size"
              :value="pageSize"
              :aria-label="locale.t('virtualKey.pagination.pageSize')"
              @change="onPageSizeChange"
            >
              <option v-for="option in PAGE_SIZE_OPTIONS" :key="option" :value="option">
                {{ option }}
              </option>
            </select>
          </cds-select>
          <span class="pager-summary">{{ summaryText }}</span>
          <cds-pagination :aria-label="locale.t('virtualKey.pagination.label')">
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
              @click="goToPage(currentPage - 1)"
            ></cds-pagination-button>
            <cds-input cds-pagination-number>
              <input
                type="number"
                :value="currentPage"
                :min="1"
                :max="totalPages"
                :aria-label="locale.t('agents.pager.page')"
                @change="goToPage(Number(($event.target as HTMLInputElement).value))"
              />
            </cds-input>
            <cds-pagination-button
              action="next"
              :disabled="currentPage >= totalPages"
              :aria-label="locale.t('agents.pager.next')"
              @click="goToPage(currentPage + 1)"
            ></cds-pagination-button>
            <cds-pagination-button
              action="last"
              :disabled="currentPage >= totalPages"
              :aria-label="locale.t('agents.pager.last')"
              @click="goToPage(totalPages)"
            ></cds-pagination-button>
          </cds-pagination>
        </div>
      </cds-grid-footer>
    </cds-grid>

    <cds-dropdown
      v-if="filterMenuAnchor && filterMenuKey"
      :hidden="false"
      :anchor="filterMenuAnchor"
      closable
      @closeChange="closeFilterMenu"
    >
      <div class="filter-panel">
        <input
          v-if="filterMenuKey === 'NAME'"
          class="filter-input"
          type="text"
          :value="textFilterValue('NAME')"
          :placeholder="locale.t('virtualKey.filter.namePlaceholder')"
          :aria-label="locale.t('virtualKey.filter.namePlaceholder')"
          @input="setTextFilter('NAME', ($event.target as HTMLInputElement).value)"
        />
        <input
          v-else-if="filterMenuKey === 'AGENT'"
          class="filter-input"
          type="text"
          :value="textFilterValue('AGENT')"
          :placeholder="locale.t('virtualKey.filter.agentPlaceholder')"
          :aria-label="locale.t('virtualKey.filter.agentPlaceholder')"
          @input="setTextFilter('AGENT', ($event.target as HTMLInputElement).value)"
        />
        <div v-else-if="filterMenuKey === 'STATUS'" class="filter-options">
          <button
            v-for="status in STATUS_FILTER_OPTIONS"
            :key="status"
            type="button"
            class="filter-option"
            :class="{ active: statusFilter === status }"
            @click="setStatusFilter(status)"
          >
            <span>{{ locale.t(`virtualKey.filter.status.${status}`) }}</span>
            <cds-icon v-if="statusFilter === status" shape="check" size="sm"></cds-icon>
          </button>
        </div>
        <input
          v-else-if="filterMenuKey === 'CREATED_AT'"
          class="filter-input"
          type="date"
          :value="textFilterValue('CREATED_AT')"
          :aria-label="locale.t('virtualKey.filter.datePlaceholder')"
          @input="setTextFilter('CREATED_AT', ($event.target as HTMLInputElement).value)"
        />
        <input
          v-else-if="filterMenuKey === 'EXPIRES_AT'"
          class="filter-input"
          type="date"
          :value="textFilterValue('EXPIRES_AT')"
          :aria-label="locale.t('virtualKey.filter.datePlaceholder')"
          @input="setTextFilter('EXPIRES_AT', ($event.target as HTMLInputElement).value)"
        />

        <div v-if="hasFilter(filterMenuKey)" class="filter-footer">
          <cds-button action="outline" size="sm" @click="clearActiveFilter">
            {{ locale.t('virtualKey.filter.clear') }}
          </cds-button>
        </div>
      </div>
    </cds-dropdown>

    <VirtualKeyFormModal
      v-if="formOpen"
      :open="formOpen"
      :gateways="gatewayOptions"
      :agents="agentOptions"
      :available-models="formAvailableModels"
      :saving="saving"
      @gateway-changed="onFormGatewayChanged"
      @close="closeForm"
      @submit="submitKey"
    />

    <VirtualKeySecretDialog
      v-if="secretOpen"
      :open="secretOpen"
      :secret="secretValue"
      @close="closeSecret"
    />

    <ConfirmDialog
      :open="pendingDeleteIds.length > 0"
      :title="deleteDialogTitle"
      :body="deleteDialogBody"
      danger
      @close="closeDelete"
      @confirm="confirmDelete"
    />
  </section>
</template>

<style scoped>
.virtual-key-page {
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
.toolbar {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 20px;
}
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
.virtual-key-page cds-grid {
  display: block;
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
  max-width: 100%;
  width: 100%;
  /* scroll-lock on <cds-grid> disables the shadow-DOM scroll container's
     scrollbars; combined with min-width: 0 + max-width: 100% on the host
     this prevents the table from ever overflowing the viewport. */
  overflow: hidden;
}
/* Force cds-grid columns + cells to clip instead of expanding past their
   intrinsic content width (which would re-introduce the inner scrollbar
   even with scroll-lock applied). */
.virtual-key-page cds-grid-column,
.virtual-key-page cds-grid-cell {
  min-width: 0;
  overflow: hidden;
}
.column-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 4px;
  width: 100%;
  min-width: 0;
}
.column-head > span:first-child {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.column-head-actions {
  display: inline-flex;
  align-items: center;
  gap: 1px;
  flex: 0 0 auto;
}
.sort-idle {
  transform: rotate(90deg);
}
.app-checkbox {
  width: 16px;
  height: 16px;
  accent-color: var(--cds-alias-object-interaction-color, #0072a3);
}
.key-name,
.date-cell {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.key-name {
  font-weight: 600;
}
.date-cell {
  font-variant-numeric: tabular-nums;
}
.progress-cell {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.progress-track {
  flex: 1 1 auto;
  height: 8px;
  background: var(--cds-alias-object-app-background, #f4f4f4);
  border-radius: 4px;
  overflow: hidden;
  min-width: 0;
}
.progress-fill {
  height: 100%;
  transition: width 200ms ease-out;
}
.progress-text {
  flex: 0 0 auto;
  font-variant-numeric: tabular-nums;
  color: var(--cds-alias-typography-color-300, #565656);
  font-size: 12px;
}
.agent-cell {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}
.agent-cell > span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.name-cell {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}
.name-cell .key-name {
  flex: 1 1 auto;
  min-width: 0;
}
.icon-action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  padding: 3px;
  border: 0;
  border-radius: 3px;
  background: transparent;
  color: var(--cds-alias-object-interaction-color, #006e9c);
  cursor: pointer;
}
.icon-action:hover {
  background: var(--cds-alias-object-app-background, #f4f4f4);
}
.status-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-width: 62px;
  white-space: nowrap;
}
.row-actions {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  white-space: nowrap;
}
.revoked-note {
  color: var(--cds-alias-typography-color-300, #565656);
  font-size: 12px;
}
.more-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  min-height: 28px;
  padding: 3px;
  border: 1px solid var(--cds-alias-object-border-color, #b3b3b3);
  border-radius: 3px;
  background: var(--cds-alias-object-container-background, #fff);
  color: var(--cds-alias-object-app-foreground, #1b1b1b);
  font: inherit;
  cursor: pointer;
}
.more-button:hover {
  border-color: var(--cds-alias-object-interaction-color, #0072a3);
  color: var(--cds-alias-object-interaction-color, #0072a3);
}
.menu-option {
  display: flex;
  align-items: center;
  gap: 9px;
  width: 100%;
  padding: 9px 14px;
  border: 0;
  background: transparent;
  color: var(--cds-alias-object-app-foreground, #1b1b1b);
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.menu-option:hover {
  background: var(--cds-alias-object-app-background, #f4f4f4);
}
.menu-option.danger {
  color: var(--cds-alias-status-danger, #c92100);
}
.filter-panel {
  min-width: 250px;
  padding: 8px;
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
.filter-options {
  display: flex;
  flex-direction: column;
  margin: -4px;
}
.filter-option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  width: 100%;
  padding: 8px 10px;
  border: 0;
  background: transparent;
  color: var(--cds-alias-object-app-foreground, #1b1b1b);
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.filter-option:hover,
.filter-option.active {
  background: var(--cds-alias-object-app-background, #f4f4f4);
}
.filter-footer {
  display: flex;
  justify-content: flex-end;
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid var(--cds-alias-object-border-color, #e8e8e8);
}
.selected-summary {
  color: var(--cds-alias-typography-color-300, #565656);
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
.spinning {
  animation: virtual-key-spin 1s linear infinite;
  transform-origin: center;
}
@keyframes virtual-key-spin {
  to {
    transform: rotate(360deg);
  }
}
@media (prefers-reduced-motion: reduce) {
  .spinning {
    animation: none;
  }
}
</style>