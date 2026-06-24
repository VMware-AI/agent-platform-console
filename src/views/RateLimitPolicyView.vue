<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import AppDropdown from '@/components/AppDropdown.vue'
import RateLimitPolicyFormModal from '@/components/RateLimitPolicyFormModal.vue'
import ConfirmDialog from '@/views/user-role/ConfirmDialog.vue'
import { useLocaleStore } from '@/stores/locale'
import { useToast } from '@/composables/useToast'
import type { RateLimitPolicy, RateLimitPolicyDraft } from '@/types/rate-limit-policy'
import '@/components/icons'

const locale = useLocaleStore()
const toast = useToast()

const INITIAL_POLICIES: RateLimitPolicy[] = [
  {
    id: 'policy-1',
    name: 'global_api_limit',
    type: 'COMBINED',
    tokenLimitPerMinute: 500_000,
    requestLimitPerMinute: 5_000,
    enabled: true,
    appliedAgentCount: 18,
  },
  {
    id: 'policy-2',
    name: 'agent_openclaw_limit',
    type: 'TOKEN',
    tokenLimitPerMinute: 120_000,
    requestLimitPerMinute: 0,
    enabled: true,
    appliedAgentCount: 3,
  },
  {
    id: 'policy-3',
    name: 'agent_openclaw_limit',
    type: 'REQUEST',
    tokenLimitPerMinute: 0,
    requestLimitPerMinute: 1_200,
    enabled: true,
    appliedAgentCount: 2,
  },
  {
    id: 'policy-4',
    name: 'agent_openclaw_limit',
    type: 'COMBINED',
    tokenLimitPerMinute: 80_000,
    requestLimitPerMinute: 800,
    enabled: false,
    appliedAgentCount: 1,
  },
  {
    id: 'policy-5',
    name: 'agent_openclaw_limit',
    type: 'TOKEN',
    tokenLimitPerMinute: 160_000,
    requestLimitPerMinute: 0,
    enabled: true,
    appliedAgentCount: 4,
  },
  {
    id: 'policy-6',
    name: 'agent_openclaw_limit',
    type: 'COMBINED',
    tokenLimitPerMinute: 100_000,
    requestLimitPerMinute: 1_000,
    enabled: true,
    appliedAgentCount: 3,
  },
  {
    id: 'policy-7',
    name: 'agent_openclaw_limit',
    type: 'REQUEST',
    tokenLimitPerMinute: 0,
    requestLimitPerMinute: 950,
    enabled: true,
    appliedAgentCount: 2,
  },
  {
    id: 'policy-8',
    name: 'agent_openclaw_limit',
    type: 'TOKEN',
    tokenLimitPerMinute: 90_000,
    requestLimitPerMinute: 0,
    enabled: false,
    appliedAgentCount: 1,
  },
  {
    id: 'policy-9',
    name: 'agent_openclaw_limit',
    type: 'COMBINED',
    tokenLimitPerMinute: 140_000,
    requestLimitPerMinute: 1_400,
    enabled: true,
    appliedAgentCount: 5,
  },
  {
    id: 'policy-10',
    name: 'agent_openclaw_limit',
    type: 'REQUEST',
    tokenLimitPerMinute: 0,
    requestLimitPerMinute: 700,
    enabled: false,
    appliedAgentCount: 0,
  },
  {
    id: 'policy-11',
    name: 'document_analysis_limit',
    type: 'TOKEN',
    tokenLimitPerMinute: 220_000,
    requestLimitPerMinute: 0,
    enabled: true,
    appliedAgentCount: 2,
  },
  {
    id: 'policy-12',
    name: 'sandbox_api_limit',
    type: 'COMBINED',
    tokenLimitPerMinute: 40_000,
    requestLimitPerMinute: 300,
    enabled: false,
    appliedAgentCount: 4,
  },
]

const PAGE_SIZE_OPTIONS = [10, 20, 50] as const
const STATUS_FILTER_OPTIONS = ['ALL', 'ENABLED', 'DISABLED'] as const
type PageSize = (typeof PAGE_SIZE_OPTIONS)[number]
type PolicyColumn = 'NAME' | 'STATUS'
type SortDirection = 'ASC' | 'DESC'
type BatchAction = 'enable' | 'disable' | 'delete'

const policies = ref<RateLimitPolicy[]>(INITIAL_POLICIES.map((policy) => ({ ...policy })))
const selectedIds = ref<Set<string>>(new Set())
const pageSize = ref<PageSize>(10)
const currentPage = ref(1)
const loading = ref(false)
const formOpen = ref(false)
const editingPolicy = ref<RateLimitPolicy | null>(null)
const saving = ref(false)
const pendingDeleteIds = ref<string[]>([])
const sortField = ref<PolicyColumn | null>(null)
const sortDirection = ref<SortDirection>('ASC')
const nameFilter = ref('')
const statusFilter = ref<'ALL' | 'ENABLED' | 'DISABLED'>('ALL')
const filterMenuAnchor = ref<HTMLElement | null>(null)
const filterMenuKey = ref<PolicyColumn | null>(null)
let nextPolicyId = 13
let refreshTimer: ReturnType<typeof setTimeout> | null = null

const filteredPolicies = computed(() => {
  const nameKeyword = nameFilter.value.trim().toLocaleLowerCase()
  const filtered = policies.value.filter((policy) => {
    if (nameKeyword && !policy.name.toLocaleLowerCase().includes(nameKeyword)) return false
    if (statusFilter.value === 'ENABLED' && !policy.enabled) return false
    if (statusFilter.value === 'DISABLED' && policy.enabled) return false
    return true
  })

  if (!sortField.value) return filtered
  const direction = sortDirection.value === 'ASC' ? 1 : -1
  return [...filtered].sort((left, right) => {
    if (sortField.value === 'STATUS') {
      return ((left.enabled ? 1 : 0) - (right.enabled ? 1 : 0)) * direction
    }
    return left.name.localeCompare(right.name, locale.locale) * direction
  })
})

const totalCount = computed(() => filteredPolicies.value.length)
const totalPages = computed(() => Math.max(1, Math.ceil(totalCount.value / pageSize.value)))
const visiblePolicies = computed(() => {
  const offset = (currentPage.value - 1) * pageSize.value
  return filteredPolicies.value.slice(offset, offset + pageSize.value)
})
const selectedCount = computed(() => selectedIds.value.size)
const allVisibleSelected = computed(
  () =>
    visiblePolicies.value.length > 0 &&
    visiblePolicies.value.every((policy) => selectedIds.value.has(policy.id)),
)
const summaryText = computed(() => {
  const start = totalCount.value === 0 ? 0 : (currentPage.value - 1) * pageSize.value + 1
  const end = Math.min(currentPage.value * pageSize.value, totalCount.value)
  return locale
    .t('rateLimit.pagination.summary')
    .replace('{start}', String(start))
    .replace('{end}', String(end))
    .replace('{total}', String(totalCount.value))
})
const deleteDialogTitle = computed(() =>
  pendingDeleteIds.value.length > 1
    ? locale.t('rateLimit.confirm.batchDeleteTitle')
    : locale.t('rateLimit.confirm.deleteTitle'),
)
const deleteDialogBody = computed(() => {
  if (pendingDeleteIds.value.length > 1) {
    return locale
      .t('rateLimit.confirm.batchDeleteBody')
      .replace('{count}', String(pendingDeleteIds.value.length))
  }
  const target = policies.value.find((policy) => policy.id === pendingDeleteIds.value[0])
  return locale.t('rateLimit.confirm.deleteBody').replace('{name}', target?.name ?? '')
})

onBeforeUnmount(() => {
  if (refreshTimer) clearTimeout(refreshTimer)
})

function toggleSelect(id: string, checked: boolean) {
  const next = new Set(selectedIds.value)
  if (checked) next.add(id)
  else next.delete(id)
  selectedIds.value = next
}

function toggleSelectAll(checked: boolean) {
  const next = new Set(selectedIds.value)
  for (const policy of visiblePolicies.value) {
    if (checked) next.add(policy.id)
    else next.delete(policy.id)
  }
  selectedIds.value = next
}

function sortStateFor(field: PolicyColumn): 'none' | 'ascending' | 'descending' {
  if (sortField.value !== field) return 'none'
  return sortDirection.value === 'ASC' ? 'ascending' : 'descending'
}

function toggleSort(field: PolicyColumn) {
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

function openFilterMenu(key: PolicyColumn, event: MouseEvent) {
  filterMenuKey.value = key
  filterMenuAnchor.value = event.currentTarget as HTMLElement
}

function closeFilterMenu() {
  filterMenuKey.value = null
  filterMenuAnchor.value = null
}

function hasFilter(key: PolicyColumn): boolean {
  return key === 'NAME' ? Boolean(nameFilter.value.trim()) : statusFilter.value !== 'ALL'
}

function setNameFilter(value: string) {
  nameFilter.value = value
  currentPage.value = 1
}

function setStatusFilter(value: 'ALL' | 'ENABLED' | 'DISABLED') {
  statusFilter.value = value
  currentPage.value = 1
  closeFilterMenu()
}

function clearActiveFilter() {
  if (filterMenuKey.value === 'NAME') nameFilter.value = ''
  else if (filterMenuKey.value === 'STATUS') statusFilter.value = 'ALL'
  currentPage.value = 1
  closeFilterMenu()
}

function openCreate() {
  editingPolicy.value = null
  formOpen.value = true
}

function openEdit(policy: RateLimitPolicy) {
  editingPolicy.value = policy
  formOpen.value = true
}

function closeForm() {
  if (saving.value) return
  formOpen.value = false
  editingPolicy.value = null
}

function submitPolicy(draft: RateLimitPolicyDraft) {
  if (saving.value) return
  saving.value = true
  if (editingPolicy.value) {
    const id = editingPolicy.value.id
    policies.value = policies.value.map((policy) =>
      policy.id === id ? { ...policy, ...draft } : policy,
    )
    toast.success(locale.t('rateLimit.toast.updated'))
  } else {
    policies.value = [
      {
        id: `policy-${nextPolicyId++}`,
        appliedAgentCount: 0,
        ...draft,
      },
      ...policies.value,
    ]
    currentPage.value = 1
    toast.success(locale.t('rateLimit.toast.created'))
  }
  saving.value = false
  formOpen.value = false
  editingPolicy.value = null
}

function setEnabled(ids: string[], enabled: boolean) {
  const idSet = new Set(ids)
  policies.value = policies.value.map((policy) =>
    idSet.has(policy.id) ? { ...policy, enabled } : policy,
  )
  toast.success(
    locale
      .t(enabled ? 'rateLimit.toast.enabled' : 'rateLimit.toast.disabled')
      .replace('{count}', String(ids.length)),
  )
}

function toggleEnabled(policy: RateLimitPolicy) {
  setEnabled([policy.id], !policy.enabled)
}

function performBatch(action: BatchAction, close: () => void) {
  const ids = [...selectedIds.value]
  close()
  if (ids.length === 0) return
  if (action === 'delete') {
    pendingDeleteIds.value = ids
    return
  }
  setEnabled(ids, action === 'enable')
  selectedIds.value = new Set()
}

function requestDelete(policy: RateLimitPolicy) {
  pendingDeleteIds.value = [policy.id]
}

function closeDelete() {
  pendingDeleteIds.value = []
}

function confirmDelete() {
  const ids = new Set(pendingDeleteIds.value)
  const count = ids.size
  policies.value = policies.value.filter((policy) => !ids.has(policy.id))
  selectedIds.value = new Set([...selectedIds.value].filter((id) => !ids.has(id)))
  pendingDeleteIds.value = []
  if (currentPage.value > totalPages.value) currentPage.value = totalPages.value
  toast.success(locale.t('rateLimit.toast.deleted').replace('{count}', String(count)))
}

function applyPolicy(policy: RateLimitPolicy) {
  toast.info(locale.t('rateLimit.toast.apply').replace('{name}', policy.name))
}

function refreshPolicies() {
  if (loading.value) return
  loading.value = true
  if (refreshTimer) clearTimeout(refreshTimer)
  refreshTimer = setTimeout(() => {
    loading.value = false
    toast.success(locale.t('rateLimit.toast.refreshed'))
  }, 500)
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
  <section class="rate-limit-page">
    <header class="page-head">
      <h1 cds-text="title" class="heading">{{ locale.t('rateLimit.title') }}</h1>
      <p cds-text="body" class="desc muted">{{ locale.t('rateLimit.description') }}</p>
    </header>

    <div class="content-card">
      <div class="toolbar">
        <cds-button action="outline" status="primary" @click="openCreate">
          <cds-icon shape="plus-circle" size="sm" aria-hidden="true"></cds-icon>
          {{ locale.t('rateLimit.action.create') }}
        </cds-button>

        <AppDropdown align="start" :disabled="selectedCount === 0">
          <template #trigger>
            <cds-button
              action="outline"
              :disabled="selectedCount === 0"
              :title="selectedCount === 0 ? locale.t('rateLimit.batch.disabled') : undefined"
            >
              <cds-icon shape="cog" size="sm" aria-hidden="true"></cds-icon>
              {{ locale.t('rateLimit.action.batch') }}
              <cds-icon shape="angle" direction="down" size="sm" aria-hidden="true"></cds-icon>
            </cds-button>
          </template>
          <template #default="{ close }">
            <button class="menu-option" type="button" @click="performBatch('enable', close)">
              <cds-icon shape="check-circle" size="sm"></cds-icon>
              {{ locale.t('rateLimit.batch.enable') }}
            </button>
            <button class="menu-option" type="button" @click="performBatch('disable', close)">
              <cds-icon shape="ban" size="sm"></cds-icon>
              {{ locale.t('rateLimit.batch.disable') }}
            </button>
            <button class="menu-option danger" type="button" @click="performBatch('delete', close)">
              <cds-icon shape="trash" size="sm"></cds-icon>
              {{ locale.t('rateLimit.batch.delete') }}
            </button>
          </template>
        </AppDropdown>

        <cds-button
          action="ghost"
          class="refresh-button"
          :disabled="loading"
          :aria-label="locale.t('rateLimit.action.refresh')"
          :title="locale.t('rateLimit.action.refresh')"
          @click="refreshPolicies"
        >
          <cds-icon shape="refresh" size="md" :class="{ spinning: loading }"></cds-icon>
          <span>{{ locale.t('rateLimit.action.refresh') }}</span>
        </cds-button>
      </div>

      <div class="grid-card">
        <cds-grid
          border="row"
          column-layout="flex"
          role="grid"
          :aria-label="locale.t('rateLimit.table.label')"
        >
          <cds-grid-column type="action" :resizable="false">
            <input
              type="checkbox"
              class="app-checkbox"
              :checked="allVisibleSelected"
              :aria-label="locale.t('rateLimit.col.selectAll')"
              @change="toggleSelectAll(($event.target as HTMLInputElement).checked)"
            />
          </cds-grid-column>

          <cds-grid-column width="50%">
            <div class="column-head">
              <span>{{ locale.t('rateLimit.col.name') }}</span>
              <span class="column-head-actions">
                <cds-button-action
                  :aria-label="locale.t('rateLimit.sort').replace('{column}', locale.t('rateLimit.col.name'))"
                  @click="toggleSort('NAME')"
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
                  <cds-icon v-else shape="two-way-arrows" class="sort-idle" size="sm"></cds-icon>
                </cds-button-action>
                <cds-button-action
                  shape="filter"
                  :expanded="hasFilter('NAME')"
                  :aria-label="locale.t('rateLimit.filter').replace('{column}', locale.t('rateLimit.col.name'))"
                  @click="(event: MouseEvent) => openFilterMenu('NAME', event)"
                ></cds-button-action>
              </span>
            </div>
          </cds-grid-column>

          <cds-grid-column width="13%">
            <div class="column-head">
              <span>{{ locale.t('rateLimit.col.status') }}</span>
              <span class="column-head-actions">
                <cds-button-action
                  :aria-label="locale.t('rateLimit.sort').replace('{column}', locale.t('rateLimit.col.status'))"
                  @click="toggleSort('STATUS')"
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
                  <cds-icon v-else shape="two-way-arrows" class="sort-idle" size="sm"></cds-icon>
                </cds-button-action>
                <cds-button-action
                  shape="filter"
                  :expanded="hasFilter('STATUS')"
                  :aria-label="locale.t('rateLimit.filter').replace('{column}', locale.t('rateLimit.col.status'))"
                  @click="(event: MouseEvent) => openFilterMenu('STATUS', event)"
                ></cds-button-action>
              </span>
            </div>
          </cds-grid-column>

          <cds-grid-column width="32%">{{ locale.t('rateLimit.col.actions') }}</cds-grid-column>

          <cds-grid-row v-for="policy in visiblePolicies" :key="policy.id">
            <cds-grid-cell>
              <input
                type="checkbox"
                class="app-checkbox"
                :checked="selectedIds.has(policy.id)"
                :aria-label="locale.t('rateLimit.col.selectPolicy').replace('{name}', policy.name)"
                @change="toggleSelect(policy.id, ($event.target as HTMLInputElement).checked)"
              />
            </cds-grid-cell>
            <cds-grid-cell>
              <strong class="policy-name" :title="policy.name">{{ policy.name }}</strong>
            </cds-grid-cell>
            <cds-grid-cell>
              <cds-badge :status="policy.enabled ? 'success' : 'neutral'" class="status-badge">
                <cds-icon :shape="policy.enabled ? 'check-circle' : 'ban'" size="sm"></cds-icon>
                {{ locale.t(policy.enabled ? 'rateLimit.status.enabled' : 'rateLimit.status.disabled') }}
              </cds-badge>
            </cds-grid-cell>
            <cds-grid-cell>
              <div class="row-actions">
                <button type="button" class="row-action" @click="openEdit(policy)">
                  <cds-icon shape="pencil" size="sm"></cds-icon>
                  <span>{{ locale.t('rateLimit.action.edit') }}</span>
                </button>
                <button type="button" class="row-action" @click="applyPolicy(policy)">
                  <cds-icon shape="users" size="sm"></cds-icon>
                  <span>{{ locale.t('rateLimit.action.apply') }}</span>
                </button>
                <button type="button" class="row-action" @click="toggleEnabled(policy)">
                  <cds-icon :shape="policy.enabled ? 'ban' : 'check-circle'" size="sm"></cds-icon>
                  <span>{{ locale.t(policy.enabled ? 'rateLimit.action.disable' : 'rateLimit.action.enable') }}</span>
                </button>
                <button type="button" class="row-action danger" @click="requestDelete(policy)">
                  <cds-icon shape="trash" size="sm"></cds-icon>
                  <span>{{ locale.t('rateLimit.action.delete') }}</span>
                </button>
              </div>
            </cds-grid-cell>
          </cds-grid-row>

          <cds-grid-placeholder v-if="visiblePolicies.length === 0">
            <cds-icon shape="filter" size="xl"></cds-icon>
            <p cds-text="subsection">{{ locale.t('rateLimit.empty') }}</p>
            <cds-button action="outline" size="sm" @click="openCreate">
              {{ locale.t('rateLimit.action.create') }}
            </cds-button>
          </cds-grid-placeholder>

          <cds-grid-footer v-if="totalCount > 0">
            <span v-if="selectedCount > 0" class="selected-summary">
              {{ locale.t('rateLimit.selected').replace('{count}', String(selectedCount)) }}
            </span>
            <div class="pager">
              <label for="rate-limit-page-size">{{ locale.t('rateLimit.pagination.pageSize') }}</label>
              <cds-select control-width="shrink">
                <select
                  id="rate-limit-page-size"
                  :value="pageSize"
                  :aria-label="locale.t('rateLimit.pagination.pageSize')"
                  @change="onPageSizeChange"
                >
                  <option v-for="option in PAGE_SIZE_OPTIONS" :key="option" :value="option">
                    {{ option }}
                  </option>
                </select>
              </cds-select>
              <span class="pager-summary">{{ summaryText }}</span>
              <cds-pagination :aria-label="locale.t('rateLimit.pagination.label')">
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
          :value="nameFilter"
          :placeholder="locale.t('rateLimit.filter.namePlaceholder')"
          :aria-label="locale.t('rateLimit.filter.namePlaceholder')"
          @input="setNameFilter(($event.target as HTMLInputElement).value)"
        />

        <div v-else class="filter-options">
          <button
            v-for="status in STATUS_FILTER_OPTIONS"
            :key="status"
            type="button"
            class="filter-option"
            :class="{ active: statusFilter === status }"
            @click="setStatusFilter(status)"
          >
            <span>{{ locale.t(`rateLimit.filter.status.${status}`) }}</span>
            <cds-icon v-if="statusFilter === status" shape="check" size="sm"></cds-icon>
          </button>
        </div>

        <div v-if="hasFilter(filterMenuKey)" class="filter-footer">
          <cds-button action="outline" size="sm" @click="clearActiveFilter">
            {{ locale.t('rateLimit.filter.clear') }}
          </cds-button>
        </div>
      </div>
    </cds-dropdown>

    <RateLimitPolicyFormModal
      v-if="formOpen"
      :open="formOpen"
      :policy="editingPolicy"
      :saving="saving"
      @close="closeForm"
      @submit="submitPolicy"
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
.rate-limit-page {
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
.rate-limit-page cds-grid {
  display: block;
  width: 100%;
  min-width: 760px;
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
.policy-name {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.status-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-width: 66px;
  white-space: nowrap;
}
.row-actions {
  display: flex;
  align-items: center;
  gap: 2px;
  white-space: nowrap;
}
.row-action {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 4px;
  border: 0;
  border-radius: 3px;
  background: transparent;
  color: var(--cds-alias-object-interaction-color, #006e9c);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}
.row-action:hover {
  background: var(--cds-alias-object-app-background, #f4f4f4);
}
.row-action.danger {
  color: var(--cds-alias-status-danger, #c92100);
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
  animation: rate-limit-spin 1s linear infinite;
  transform-origin: center;
}
@keyframes rate-limit-spin {
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
