<script setup lang="ts">
import { computed, ref } from 'vue'
import { useQuery } from '@vue/apollo-composable'
import { apolloClient } from '@/api/graphql/client'
import AppDropdown from '@/components/AppDropdown.vue'
import VirtualKeyFormModal from '@/components/VirtualKeyFormModal.vue'
import VirtualKeySecretDialog from '@/components/VirtualKeySecretDialog.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import { useLocaleStore } from '@/stores/locale'
import { useToast } from '@/composables/useToast'
import { graphqlErrorMessage } from '@/api/graphql/errors'
import type {
  VirtualKey,
  VirtualKeyDraft,
  VirtualKeyOption,
  VirtualKeyStatus,
} from '@/types/virtual-key'
import {
  VIRTUAL_KEYS_QUERY,
  ISSUE_VIRTUAL_KEY,
  REGENERATE_VIRTUAL_KEY,
  SET_VIRTUAL_KEY_ENABLED,
  REVOKE_VIRTUAL_KEY,
  type VirtualKeysResult,
  type IssueVirtualKeyResult,
  type IssueVirtualKeyVars,
  type RegenerateVirtualKeyResult,
  type RegenerateVirtualKeyVars,
  type SetVirtualKeyEnabledResult,
  type SetVirtualKeyEnabledVars,
  type RevokeVirtualKeyResult,
  type RevokeVirtualKeyVars,
} from '@/api/graphql/queries/virtual-keys'
import { AGENTS_QUERY } from '@/api/graphql/queries/agents'
import { USERS_QUERY } from '@/api/graphql/queries/users'
import {
  RATE_LIMIT_POLICIES_QUERY,
  type RateLimitPoliciesResult,
} from '@/api/graphql/queries/rate-limit-policies'
import '@/components/icons'

const locale = useLocaleStore()
const toast = useToast()

const PAGE_SIZE_OPTIONS = [10, 20, 50] as const
const STATUS_FILTER_OPTIONS = ['ALL', 'ENABLED', 'DISABLED'] as const
type PageSize = (typeof PAGE_SIZE_OPTIONS)[number]
type BatchAction = 'enable' | 'disable' | 'delete'
type SortDirection = 'ASC' | 'DESC'
type KeyColumn = 'NAME' | 'AGENT' | 'STATUS' | 'CREATED_AT' | 'EXPIRES_AT' | 'POLICY'

const COLUMNS: Array<{ key: KeyColumn; label: string; width: string }> = [
  { key: 'NAME', label: 'virtualKey.col.name', width: '17%' },
  { key: 'AGENT', label: 'virtualKey.col.agent', width: '15%' },
  { key: 'STATUS', label: 'virtualKey.col.status', width: '9%' },
  { key: 'CREATED_AT', label: 'virtualKey.col.createdAt', width: '13%' },
  { key: 'EXPIRES_AT', label: 'virtualKey.col.expiresAt', width: '13%' },
  { key: 'POLICY', label: 'virtualKey.col.policy', width: '13%' },
]

// Selector data sources. Agents/users are paged on the backend; pull a large page
// so the issue form's dropdowns hold the full set.
const SELECTOR_PAGE = { page: 1, pageSize: 1000 }

interface UserNode {
  id: string
  username: string
  displayName: string
  email: string
}
interface UsersQueryResult {
  users: { nodes: UserNode[] }
}
interface AgentNode {
  id: string
  name: string
}
interface AgentsQueryResult {
  agents: { nodes: AgentNode[] }
}

const {
  result: keysData,
  loading,
  refetch: refetchKeys,
} = useQuery<VirtualKeysResult>(VIRTUAL_KEYS_QUERY, { userId: null })
const { result: usersData } = useQuery<UsersQueryResult>(USERS_QUERY, { pagination: SELECTOR_PAGE })
const { result: agentsData } = useQuery<AgentsQueryResult>(AGENTS_QUERY, {
  pagination: SELECTOR_PAGE,
})
const { result: policiesData } = useQuery<RateLimitPoliciesResult>(RATE_LIMIT_POLICIES_QUERY)

const userOptions = computed<VirtualKeyOption[]>(() =>
  (usersData.value?.users?.nodes ?? []).map((user) => ({
    id: user.id,
    name: user.displayName || user.username || user.email,
  })),
)
const agentOptions = computed<VirtualKeyOption[]>(() =>
  (agentsData.value?.agents?.nodes ?? []).map((agent) => ({ id: agent.id, name: agent.name })),
)
const policyOptions = computed<VirtualKeyOption[]>(() =>
  (policiesData.value?.rateLimitPolicies ?? []).map((policy) => ({
    id: policy.id,
    name: policy.name,
  })),
)
const agentNameById = computed(() => {
  const map = new Map<string, string>()
  for (const option of agentOptions.value) map.set(option.id, option.name)
  return map
})
const policyNameById = computed(() => {
  const map = new Map<string, string>()
  for (const option of policyOptions.value) map.set(option.id, option.name)
  return map
})

const virtualKeys = computed<VirtualKey[]>(() =>
  (keysData.value?.virtualKeys ?? []).map((node) => ({
    id: node.id,
    name: node.alias ?? '',
    userId: node.userId,
    agentId: node.agentId,
    status: node.status,
    createdAt: node.createdAt,
    expiresAt: node.expiresAt,
    policyId: node.rateLimitPolicyId,
    policyName: node.rateLimitPolicyId
      ? (policyNameById.value.get(node.rateLimitPolicyId) ?? '—')
      : '—',
  })),
)

const selectedIds = ref<Set<string>>(new Set())
const pageSize = ref<PageSize>(10)
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
const policyFilter = ref('')
const filterMenuAnchor = ref<HTMLElement | null>(null)
const filterMenuKey = ref<KeyColumn | null>(null)

function displayName(key: VirtualKey): string {
  return key.name || '—'
}
function agentName(key: VirtualKey): string {
  if (!key.agentId) return '—'
  return agentNameById.value.get(key.agentId) ?? key.agentId
}

const filteredKeys = computed(() => {
  const nameKeyword = nameFilter.value.trim().toLocaleLowerCase()
  const agentKeyword = agentFilter.value.trim().toLocaleLowerCase()
  const policyKeyword = policyFilter.value.trim().toLocaleLowerCase()
  const filtered = virtualKeys.value.filter((key) => {
    if (nameKeyword && !displayName(key).toLocaleLowerCase().includes(nameKeyword)) return false
    if (agentKeyword && !agentName(key).toLocaleLowerCase().includes(agentKeyword)) return false
    if (statusFilter.value === 'ENABLED' && key.status !== 'active') return false
    if (statusFilter.value === 'DISABLED' && key.status !== 'disabled') return false
    if (createdAtFilter.value && key.createdAt.slice(0, 10) !== createdAtFilter.value) return false
    if (expiresAtFilter.value && (key.expiresAt ?? '').slice(0, 10) !== expiresAtFilter.value)
      return false
    if (policyKeyword && !key.policyName.toLocaleLowerCase().includes(policyKeyword)) return false
    return true
  })

  if (!sortField.value) return filtered
  const direction = sortDirection.value === 'ASC' ? 1 : -1
  const statusRank = (status: VirtualKeyStatus) =>
    status === 'active' ? 2 : status === 'disabled' ? 1 : 0
  return [...filtered].sort((left, right) => {
    const valueFor = (key: VirtualKey): string | number => {
      if (sortField.value === 'NAME') return displayName(key)
      if (sortField.value === 'AGENT') return agentName(key)
      if (sortField.value === 'STATUS') return statusRank(key.status)
      if (sortField.value === 'CREATED_AT') return key.createdAt
      if (sortField.value === 'EXPIRES_AT') return key.expiresAt ?? ''
      return key.policyName
    }
    const leftValue = valueFor(left)
    const rightValue = valueFor(right)
    if (typeof leftValue === 'number' && typeof rightValue === 'number') {
      return (leftValue - rightValue) * direction
    }
    return String(leftValue).localeCompare(String(rightValue), locale.locale) * direction
  })
})

const totalCount = computed(() => filteredKeys.value.length)
const totalPages = computed(() => Math.max(1, Math.ceil(totalCount.value / pageSize.value)))
const visibleKeys = computed(() => {
  const offset = (currentPage.value - 1) * pageSize.value
  return filteredKeys.value.slice(offset, offset + pageSize.value)
})
const selectedCount = computed(() => selectedIds.value.size)
const allVisibleSelected = computed(() => {
  const selectable = visibleKeys.value.filter((key) => key.status !== 'revoked')
  return selectable.length > 0 && selectable.every((key) => selectedIds.value.has(key.id))
})
const summaryText = computed(() => {
  const start = totalCount.value === 0 ? 0 : (currentPage.value - 1) * pageSize.value + 1
  const end = Math.min(currentPage.value * pageSize.value, totalCount.value)
  return locale
    .t('virtualKey.pagination.summary')
    .replace('{start}', String(start))
    .replace('{end}', String(end))
    .replace('{total}', String(totalCount.value))
})
const deleteDialogTitle = computed(() =>
  pendingDeleteIds.value.length > 1
    ? locale.t('virtualKey.confirm.batchDeleteTitle')
    : locale.t('virtualKey.confirm.deleteTitle'),
)
const deleteDialogBody = computed(() => {
  if (pendingDeleteIds.value.length > 1) {
    return locale
      .t('virtualKey.confirm.batchDeleteBody')
      .replace('{count}', String(pendingDeleteIds.value.length))
  }
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
  if (status === 'active') return locale.t('virtualKey.status.enabled')
  if (status === 'disabled') return locale.t('virtualKey.status.disabled')
  return locale.t('virtualKey.status.revoked')
}

function formatDateTime(value: string | null): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  const pad = (number: number) => String(number).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
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
    if (key.status === 'revoked') continue // terminal — not actionable
    if (checked) next.add(key.id)
    else next.delete(key.id)
  }
  selectedIds.value = next
}

function sortStateFor(field: KeyColumn): 'none' | 'ascending' | 'descending' {
  if (sortField.value !== field) return 'none'
  return sortDirection.value === 'ASC' ? 'ascending' : 'descending'
}

function toggleSort(field: KeyColumn) {
  const state = sortStateFor(field)
  if (state === 'none') {
    sortField.value = field
    sortDirection.value = 'ASC'
  } else if (state === 'ascending') {
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

function hasFilter(key: KeyColumn): boolean {
  if (key === 'NAME') return Boolean(nameFilter.value.trim())
  if (key === 'AGENT') return Boolean(agentFilter.value.trim())
  if (key === 'STATUS') return statusFilter.value !== 'ALL'
  if (key === 'CREATED_AT') return Boolean(createdAtFilter.value)
  if (key === 'EXPIRES_AT') return Boolean(expiresAtFilter.value)
  return Boolean(policyFilter.value.trim())
}

function textFilterValue(key: Exclude<KeyColumn, 'STATUS'>): string {
  if (key === 'NAME') return nameFilter.value
  if (key === 'AGENT') return agentFilter.value
  if (key === 'CREATED_AT') return createdAtFilter.value
  if (key === 'EXPIRES_AT') return expiresAtFilter.value
  return policyFilter.value
}

function setTextFilter(key: Exclude<KeyColumn, 'STATUS'>, value: string) {
  if (key === 'NAME') nameFilter.value = value
  else if (key === 'AGENT') agentFilter.value = value
  else if (key === 'CREATED_AT') createdAtFilter.value = value
  else if (key === 'EXPIRES_AT') expiresAtFilter.value = value
  else policyFilter.value = value
  currentPage.value = 1
}

function setStatusFilter(value: 'ALL' | 'ENABLED' | 'DISABLED') {
  statusFilter.value = value
  currentPage.value = 1
  closeFilterMenu()
}

function clearActiveFilter() {
  if (!filterMenuKey.value) return
  if (filterMenuKey.value === 'STATUS') statusFilter.value = 'ALL'
  else setTextFilter(filterMenuKey.value, '')
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
  secretOpen.value = false
  secretValue.value = ''
}

async function submitKey(draft: VirtualKeyDraft) {
  if (saving.value) return
  saving.value = true
  try {
    const { data } = await apolloClient.mutate<IssueVirtualKeyResult, IssueVirtualKeyVars>({
      mutation: ISSUE_VIRTUAL_KEY,
      variables: {
        input: {
          userId: draft.userId,
          agentId: draft.agentId || null,
          rateLimitPolicyId: draft.policyId || null,
          alias: draft.name || null,
          expiresAt: draft.expiresAt || null,
        },
      },
    })
    formOpen.value = false
    // Reveal the one-time secret BEFORE refetching — the secret is unrecoverable,
    // so a failure of the (independent) list query must never suppress it.
    const secret = data?.issueVirtualKey?.secret
    if (secret) revealSecret(secret)
    toast.success(locale.t('virtualKey.toast.created'))
    currentPage.value = 1
  } catch (error) {
    toast.error(graphqlErrorMessage(error, locale.t('virtualKey.toast.issueFailed')))
    return
  } finally {
    saving.value = false
  }
  await refetchKeys()?.catch(() => {})
}

async function setEnabled(ids: string[], enabled: boolean) {
  // Revoked keys are terminal — the backend rejects enable/disable on them, so
  // drop them rather than surface a spurious partial-failure toast.
  const actionable = ids.filter(
    (id) => virtualKeys.value.find((key) => key.id === id)?.status !== 'revoked',
  )
  if (actionable.length === 0) return
  const outcomes = await Promise.allSettled(
    actionable.map((id) =>
      apolloClient.mutate<SetVirtualKeyEnabledResult, SetVirtualKeyEnabledVars>({
        mutation: SET_VIRTUAL_KEY_ENABLED,
        variables: { id, enabled },
      }),
    ),
  )
  const ok = outcomes.filter((outcome) => outcome.status === 'fulfilled').length
  const failure = outcomes.find(
    (outcome): outcome is PromiseRejectedResult => outcome.status === 'rejected',
  )
  if (ok > 0) {
    toast.success(
      locale
        .t(enabled ? 'virtualKey.toast.enabled' : 'virtualKey.toast.disabled')
        .replace('{count}', String(ok)),
    )
  }
  if (failure) {
    toast.error(graphqlErrorMessage(failure.reason, locale.t('virtualKey.toast.saveFailed')))
  }
  await refetchKeys()
}

function toggleEnabled(key: VirtualKey, close?: () => void) {
  close?.()
  void setEnabled([key.id], key.status !== 'active')
}

async function regenerate(key: VirtualKey, close?: () => void) {
  close?.()
  if (saving.value) return
  saving.value = true
  try {
    const { data } = await apolloClient.mutate<
      RegenerateVirtualKeyResult,
      RegenerateVirtualKeyVars
    >({
      mutation: REGENERATE_VIRTUAL_KEY,
      variables: { id: key.id },
    })
    // Reveal before refetch — the rotated secret is returned once and unrecoverable.
    const secret = data?.regenerateVirtualKey?.secret
    if (secret) revealSecret(secret)
    toast.success(locale.t('virtualKey.toast.regenerated'))
  } catch (error) {
    toast.error(graphqlErrorMessage(error, locale.t('virtualKey.toast.regenerateFailed')))
    return
  } finally {
    saving.value = false
  }
  await refetchKeys()?.catch(() => {})
}

function performBatch(action: BatchAction, close: () => void) {
  const ids = [...selectedIds.value]
  close()
  if (ids.length === 0) return
  if (action === 'delete') {
    pendingDeleteIds.value = ids
    return
  }
  void setEnabled(ids, action === 'enable').then(() => {
    selectedIds.value = new Set()
  })
}

function requestDelete(key: VirtualKey, close?: () => void) {
  close?.()
  pendingDeleteIds.value = [key.id]
}

function closeDelete() {
  pendingDeleteIds.value = []
}

async function confirmDelete() {
  // Skip already-revoked keys — revoke is terminal and errors on them.
  const ids = pendingDeleteIds.value.filter(
    (id) => virtualKeys.value.find((key) => key.id === id)?.status !== 'revoked',
  )
  pendingDeleteIds.value = []
  if (ids.length === 0) return
  const outcomes = await Promise.allSettled(
    ids.map((id) =>
      apolloClient.mutate<RevokeVirtualKeyResult, RevokeVirtualKeyVars>({
        mutation: REVOKE_VIRTUAL_KEY,
        variables: { id },
      }),
    ),
  )
  const revokedIds = ids.filter((_, index) => outcomes[index].status === 'fulfilled')
  const failure = outcomes.find(
    (outcome): outcome is PromiseRejectedResult => outcome.status === 'rejected',
  )
  if (revokedIds.length > 0) {
    toast.success(locale.t('virtualKey.toast.deleted').replace('{count}', String(revokedIds.length)))
  }
  if (failure) {
    toast.error(graphqlErrorMessage(failure.reason, locale.t('virtualKey.toast.revokeFailed')))
  }
  selectedIds.value = new Set([...selectedIds.value].filter((id) => !revokedIds.includes(id)))
  await refetchKeys()
  if (currentPage.value > totalPages.value) currentPage.value = totalPages.value
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

async function copyValue(value: string | null, successKey: string) {
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
    toast.success(locale.t(successKey))
  } catch (err) {
    toast.error(graphqlErrorMessage(err, locale.t('virtualKey.toast.copyFailed')))
  }
}

async function refreshKeys() {
  if (loading.value) return
  try {
    await refetchKeys()
    toast.success(locale.t('virtualKey.toast.refreshed'))
  } catch (error) {
    toast.error(graphqlErrorMessage(error, locale.t('virtualKey.toast.refreshFailed')))
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
            :title="selectedCount === 0 ? locale.t('virtualKey.batch.disabled') : undefined"
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

      <cds-button
        action="ghost"
        class="refresh-button"
        :disabled="loading"
        :aria-label="locale.t('virtualKey.action.refresh')"
        :title="locale.t('virtualKey.action.refresh')"
        @click="refreshKeys"
      >
        <cds-icon shape="refresh" size="md" :class="{ spinning: loading }"></cds-icon>
        <span>{{ locale.t('virtualKey.action.refresh') }}</span>
      </cds-button>
    </div>

    <div class="grid-card">
      <cds-grid
        border="row"
        column-layout="flex"
        role="grid"
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
            <strong v-if="column.key === 'NAME'" class="key-name" :title="displayName(keyItem)">
              {{ displayName(keyItem) }}
            </strong>
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
            <span v-else class="policy-cell" :title="keyItem.policyName">{{ keyItem.policyName }}</span>
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
                  <button class="menu-option" type="button" @click="regenerate(keyItem, close)">
                    <cds-icon shape="refresh" size="sm"></cds-icon>
                    {{ locale.t('virtualKey.action.regenerate') }}
                  </button>
                  <button class="menu-option" type="button" @click="toggleEnabled(keyItem, close)">
                    <cds-icon :shape="keyItem.status === 'active' ? 'ban' : 'check-circle'" size="sm"></cds-icon>
                    {{ locale.t(keyItem.status === 'active' ? 'virtualKey.action.disable' : 'virtualKey.action.enable') }}
                  </button>
                  <button class="menu-option danger" type="button" @click="requestDelete(keyItem, close)">
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
          <cds-button action="outline" size="sm" @click="openCreate">
            {{ locale.t('virtualKey.action.create') }}
          </cds-button>
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
        <input
          v-else
          class="filter-input"
          type="text"
          :value="textFilterValue('POLICY')"
          :placeholder="locale.t('virtualKey.filter.policyPlaceholder')"
          :aria-label="locale.t('virtualKey.filter.policyPlaceholder')"
          @input="setTextFilter('POLICY', ($event.target as HTMLInputElement).value)"
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
      :users="userOptions"
      :agents="agentOptions"
      :policies="policyOptions"
      :saving="saving"
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
  margin-left: auto;
}
.grid-card {
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
  overflow: auto;
  border: 1px solid var(--cds-alias-object-border-color, #d7d7d7);
  border-radius: 6px;
  background: var(--cds-alias-object-container-background, #fff);
}
.virtual-key-page cds-grid {
  display: block;
  width: 100%;
  min-width: 960px;
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
.policy-cell,
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
