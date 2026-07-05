<script setup lang="ts">
import { computed, ref } from 'vue'
import { useQuery } from '@vue/apollo-composable'
import { apolloClient } from '@/api/graphql/client'
import AppDropdown from '@/components/AppDropdown.vue'
import SupplierModelFormModal from '@/components/SupplierModelFormModal.vue'
import SupplierModelSpecsDrawer from '@/components/SupplierModelSpecsDrawer.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import { useLocaleStore } from '@/stores/locale'
import { useAuthStore } from '@/stores/auth'
import { useToast } from '@/composables/useToast'
import { graphqlErrorMessage } from '@/api/graphql/errors'
import {
  PROVIDER_MODELS_QUERY,
  CREATE_PROVIDER_MODEL,
  UPDATE_PROVIDER_MODEL,
  DELETE_PROVIDER_MODEL,
  TEST_PROVIDER_CONNECTION,
  BLOCK_PROVIDER_MODEL_SPEC,
  REFRESH_PROVIDER_MODEL_STATUS,
  type ProviderModelInfoResult,
  type ProviderModelNode,
  type ProviderModelStatus,
  type CreateProviderModelInput,
  type UpdateProviderModelInput,
  type CreateProviderModelResult,
  type CreateProviderModelVars,
  type UpdateProviderModelResult,
  type UpdateProviderModelVars,
  type DeleteProviderModelResult,
  type DeleteProviderModelVars,
  type TestProviderConnectionResult,
  type TestProviderConnectionVars,
  type BlockProviderModelSpecResult,
  type BlockProviderModelSpecVars,
  type RefreshProviderModelStatusResult,
  type RefreshProviderModelStatusVars,
  type ProviderModelSortField,
  type SortDirection,
} from '@/api/graphql/queries/supplier-models'
import { MODEL_GATEWAYS_QUERY } from '@/api/graphql/queries/model-gateways'
import { PROVIDER_MODEL_STATUSES } from '@/types/supplier-model'
import '@/components/icons'

const locale = useLocaleStore()
const auth = useAuthStore()
const toast = useToast()

const PAGE_SIZE_OPTIONS = [10, 20, 50] as const
type PageSize = (typeof PAGE_SIZE_OPTIONS)[number]

const STATUS_FILTER_OPTIONS = ['ALL', ...PROVIDER_MODEL_STATUSES] as const
type StatusFilter = 'ALL' | ProviderModelStatus

const { result, loading, refetch } = useQuery<ProviderModelInfoResult>(
  PROVIDER_MODELS_QUERY,
  () => ({
    filter: {
      search: nameFilter.value.trim() || null,
      status: statusFilter.value === 'ALL' ? null : statusFilter.value,
    },
    page: {
      limit: pageSize.value,
      offset: (currentPage.value - 1) * pageSize.value,
    },
    sort: sortField.value
      ? { field: sortField.value, direction: sortDirection.value }
      : null,
  }),
)

const models = computed<ProviderModelNode[]>(
  () => result.value?.providerModelInfo?.data ?? [],
)
const totalCount = computed<number>(
  () => result.value?.providerModelInfo?.total_count ?? 0,
)
const totalPages = computed<number>(() =>
  Math.max(1, result.value?.providerModelInfo?.total_pages ?? 1),
)

// Model Gateways (picker source for form / drawer)
const { result: gatewaysResult } = useQuery(MODEL_GATEWAYS_QUERY, {
  page: { limit: 1000, offset: 0 },
})
const gateways = computed(() =>
  (gatewaysResult.value?.modelGateways?.nodes ?? []).map(
    (g: { id: string; name: string }) => ({ id: g.id, name: g.name }),
  ),
)

const selectedIds = ref<Set<string>>(new Set())
const nameFilter = ref('')
const statusFilter = ref<StatusFilter>('ALL')
const pageSize = ref<PageSize>(10)
const currentPage = ref(1)
const sortField = ref<ProviderModelSortField | null>(null)
const sortDirection = ref<SortDirection>('ASC')
const filterMenuAnchor = ref<HTMLElement | null>(null)
const filterMenuKey = ref<'NAME' | 'HEALTH' | null>(null)

const formOpen = ref(false)
const editingModel = ref<ProviderModelNode | null>(null)
const saving = ref(false)
const specsDrawerModel = ref<ProviderModelNode | null>(null)
const pendingDeleteIds = ref<string[]>([])

const visibleModels = computed(() => models.value)
const selectedCount = computed(() => selectedIds.value.size)
const allVisibleSelected = computed(
  () =>
    visibleModels.value.length > 0 &&
    visibleModels.value.every((m) => selectedIds.value.has(m.id)),
)

const summaryText = computed(() => {
  const start =
    totalCount.value === 0 ? 0 : (currentPage.value - 1) * pageSize.value + 1
  const end = Math.min(currentPage.value * pageSize.value, totalCount.value)
  return locale
    .t('supplier.pagination.summary')
    .replace('{start}', String(start))
    .replace('{end}', String(end))
    .replace('{total}', String(totalCount.value))
})

const deleteDialogTitle = computed(() =>
  pendingDeleteIds.value.length > 1
    ? locale.t('supplier.confirm.batchDeleteTitle')
    : locale.t('supplier.confirm.deleteTitle'),
)
const deleteDialogBody = computed(() => {
  if (pendingDeleteIds.value.length > 1) {
    return locale
      .t('supplier.confirm.batchDeleteBody')
      .replace('{count}', String(pendingDeleteIds.value.length))
  }
  const target = models.value.find(
    (m) => m.id === pendingDeleteIds.value[0],
  )
  return locale
    .t('supplier.confirm.deleteBody')
    .replace('{name}', target?.name ?? '')
})

function toggleSelect(id: string, checked: boolean) {
  const next = new Set(selectedIds.value)
  if (checked) next.add(id)
  else next.delete(id)
  selectedIds.value = next
}

function toggleSelectAll(checked: boolean) {
  const next = new Set(selectedIds.value)
  for (const m of visibleModels.value) {
    if (checked) next.add(m.id)
    else next.delete(m.id)
  }
  selectedIds.value = next
}

function sortStateFor(
  field: 'NAME' | 'HEALTH',
): 'none' | 'ascending' | 'descending' {
  if (sortField.value !== field) return 'none'
  return sortDirection.value === 'ASC' ? 'ascending' : 'descending'
}

function toggleSort(field: 'NAME' | 'HEALTH') {
  const target: ProviderModelSortField = field === 'HEALTH' ? 'STATUS' : 'NAME'
  const state = sortStateFor(field)
  if (state === 'none') {
    sortField.value = target
    sortDirection.value = 'ASC'
  } else if (state === 'ascending') {
    sortDirection.value = 'DESC'
  } else {
    sortField.value = null
    sortDirection.value = 'ASC'
  }
  currentPage.value = 1
}

function openFilterMenu(key: 'NAME' | 'HEALTH', event: MouseEvent) {
  filterMenuKey.value = key
  filterMenuAnchor.value = event.currentTarget as HTMLElement
}

function closeFilterMenu() {
  filterMenuKey.value = null
  filterMenuAnchor.value = null
}

function hasFilter(key: 'NAME' | 'HEALTH'): boolean {
  if (key === 'NAME') return Boolean(nameFilter.value.trim())
  return statusFilter.value !== 'ALL'
}

function setNameFilter(value: string) {
  nameFilter.value = value
  currentPage.value = 1
}

function setStatusFilter(value: StatusFilter) {
  statusFilter.value = value
  currentPage.value = 1
  closeFilterMenu()
}

function clearActiveFilter() {
  if (filterMenuKey.value === 'NAME') nameFilter.value = ''
  else if (filterMenuKey.value === 'HEALTH') statusFilter.value = 'ALL'
  currentPage.value = 1
  closeFilterMenu()
}

function openCreate() {
  editingModel.value = null
  formOpen.value = true
  specsDrawerModel.value = null
}

function openEdit(m: ProviderModelNode) {
  editingModel.value = m
  formOpen.value = true
  specsDrawerModel.value = null
}

function closeForm() {
  if (saving.value) return
  formOpen.value = false
  editingModel.value = null
}

async function submitModel(
  input: CreateProviderModelInput | UpdateProviderModelInput,
) {
  if (saving.value) return
  const isEditing = Boolean(editingModel.value)
  saving.value = true
  try {
    if (isEditing) {
      await apolloClient.mutate<UpdateProviderModelResult, UpdateProviderModelVars>({
        mutation: UPDATE_PROVIDER_MODEL,
        variables: { input: input as UpdateProviderModelInput },
      })
    } else {
      await apolloClient.mutate<CreateProviderModelResult, CreateProviderModelVars>({
        mutation: CREATE_PROVIDER_MODEL,
        variables: { input: input as CreateProviderModelInput },
      })
    }
    toast.success(
      locale.t(isEditing ? 'supplier.toast.updated' : 'supplier.toast.created'),
    )
    if (!isEditing) currentPage.value = 1
    formOpen.value = false
    editingModel.value = null
    await refetch()
  } catch (error) {
    toast.error(graphqlErrorMessage(error, locale.t('supplier.toast.saveFailed')))
  } finally {
    saving.value = false
  }
}

function openSpecsDrawer(m: ProviderModelNode) {
  specsDrawerModel.value = m
  formOpen.value = false
}

function closeSpecsDrawer() {
  specsDrawerModel.value = null
}

async function refreshOne(m: ProviderModelNode) {
  try {
    const r = await apolloClient.mutate<
      TestProviderConnectionResult,
      TestProviderConnectionVars
    >({
      mutation: TEST_PROVIDER_CONNECTION,
      variables: { name: m.name },
    })
    if (r.data?.testProviderConnection) {
      toast.success(locale.t('supplier.toast.refreshed'))
      await refetch()
    }
  } catch (error) {
    toast.error(
      graphqlErrorMessage(error, locale.t('supplier.toast.refreshFailed')),
    )
  }
}

async function batchBlockSpecIds(blocked: boolean) {
  const rows = models.value.filter((m) => selectedIds.value.has(m.id))
  const specPairs = rows.flatMap((m) =>
    m.modelSpecs.map((s) => ({ specId: s.modelInfo.id, name: m.name })),
  )
  if (specPairs.length === 0) return
  const outcomes = await Promise.allSettled(
    specPairs.map((p) =>
      apolloClient.mutate<BlockProviderModelSpecResult, BlockProviderModelSpecVars>({
        mutation: BLOCK_PROVIDER_MODEL_SPEC,
        variables: { input: { specId: p.specId, blocked } },
      }),
    ),
  )
  const ok = outcomes.filter((o) => o.status === 'fulfilled').length
  const failure = outcomes.find(
    (o): o is PromiseRejectedResult => o.status === 'rejected',
  )
  if (ok > 0) {
    const key = blocked
      ? 'supplier.specs.toast.blocked'
      : 'supplier.specs.toast.unblocked'
    toast.success(locale.t(key).replace('{count}', String(ok)))
  }
  if (failure) {
    toast.error(graphqlErrorMessage(failure.reason, locale.t('supplier.toast.saveFailed')))
  }
  selectedIds.value = new Set()
  await refetch()
}

async function refreshAll() {
  if (loading.value) return
  try {
    await refetch()
    toast.success(locale.t('supplier.toast.refreshed'))
  } catch (error) {
    toast.error(graphqlErrorMessage(error, locale.t('supplier.toast.refreshFailed')))
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

function healthBadgeStatus(
  s: ProviderModelStatus,
): 'success' | 'warning' | 'danger' | 'neutral' {
  if (s === 'full_healthy') return 'success'
  if (s === 'partial_outage') return 'warning'
  if (s === 'full_outage') return 'danger'
  return 'neutral'
}

function requestDelete(m: ProviderModelNode) {
  pendingDeleteIds.value = [m.id]
}

function requestBatchDelete() {
  pendingDeleteIds.value = [...selectedIds.value]
}

function closeDelete() {
  pendingDeleteIds.value = []
}

async function confirmDelete() {
  const ids = [...pendingDeleteIds.value]
  pendingDeleteIds.value = []
  if (ids.length === 0) return
  const outcomes = await Promise.allSettled(
    ids.map((id) =>
      apolloClient.mutate<DeleteProviderModelResult, DeleteProviderModelVars>({
        mutation: DELETE_PROVIDER_MODEL,
        variables: { id },
      }),
    ),
  )
  const deletedIds = ids.filter((_, i) => outcomes[i].status === 'fulfilled')
  const failures = outcomes.filter(
    (o): o is PromiseRejectedResult => o.status === 'rejected',
  )
  if (deletedIds.length > 0) {
    toast.success(
      locale
        .t('supplier.toast.deleted')
        .replace('{count}', String(deletedIds.length)),
    )
  }
  if (failures.length > 0) {
    toast.error(
      graphqlErrorMessage(failures[0].reason, locale.t('supplier.toast.deleteFailed')),
    )
  }
  selectedIds.value = new Set(
    [...selectedIds.value].filter((id) => !deletedIds.includes(id)),
  )
  await refetch()
  if (currentPage.value > totalPages.value) currentPage.value = totalPages.value
}

async function refreshOneStatus(m: ProviderModelNode) {
  try {
    await apolloClient.mutate<
      RefreshProviderModelStatusResult,
      RefreshProviderModelStatusVars
    >({
      mutation: REFRESH_PROVIDER_MODEL_STATUS,
      variables: { id: m.id },
    })
    await refetch()
    toast.success(locale.t('supplier.specs.toast.refreshed'))
  } catch (error) {
    toast.error(
      graphqlErrorMessage(error, locale.t('supplier.toast.refreshFailed')),
    )
  }
}
</script>

<template>
  <section class="supplier-page">
    <header class="page-head">
      <h1 cds-text="title" class="heading">{{ locale.t('supplier.title') }}</h1>
      <p cds-text="body" class="desc muted">{{ locale.t('supplier.description') }}</p>
    </header>

    <div class="content-card">
      <div class="toolbar">
        <cds-button
          v-if="auth.role === 'admin'"
          action="outline"
          status="primary"
          @click="openCreate"
        >
          <cds-icon shape="plus-circle" size="sm" aria-hidden="true"></cds-icon>
          {{ locale.t('supplier.action.create') }}
        </cds-button>

        <AppDropdown
          v-if="auth.role === 'admin'"
          align="start"
          :disabled="selectedCount === 0"
        >
          <template #trigger>
            <cds-button
              action="outline"
              :disabled="selectedCount === 0"
              :title="selectedCount === 0 ? locale.t('supplier.batch.disabled') : undefined"
            >
              <cds-icon shape="cog" size="sm" aria-hidden="true"></cds-icon>
              {{ locale.t('supplier.action.batch') }}
              <cds-icon shape="angle" direction="down" size="sm" aria-hidden="true"></cds-icon>
            </cds-button>
          </template>
          <template #default="{ close }">
            <button class="menu-option" type="button" @click="(batchBlockSpecIds(true), close())">
              <cds-icon shape="ban" size="sm"></cds-icon>
              {{ locale.t('supplier.specs.blockAll') }}
            </button>
            <button class="menu-option" type="button" @click="(batchBlockSpecIds(false), close())">
              <cds-icon shape="unlock" size="sm"></cds-icon>
              {{ locale.t('supplier.specs.unblockAll') }}
            </button>
            <button class="menu-option danger" type="button" @click="(requestBatchDelete(), close())">
              <cds-icon shape="trash" size="sm"></cds-icon>
              {{ locale.t('supplier.batch.delete') }}
            </button>
          </template>
        </AppDropdown>

        <button
          type="button"
          class="refresh-button"
          :disabled="loading"
          :aria-label="locale.t('supplier.action.refresh')"
          :title="locale.t('supplier.action.refresh')"
          @click="refreshAll"
        >
          <cds-icon shape="refresh" size="md" :class="{ spinning: loading }" aria-hidden="true"></cds-icon>
        </button>
      </div>

      <cds-grid
        border="row"
        column-layout="flex"
        role="grid"
        scroll-lock
        :aria-label="locale.t('supplier.table.label')"
      >
        <cds-grid-column type="action" :resizable="false">
          <input
            type="checkbox"
            class="app-checkbox"
            :checked="allVisibleSelected"
            :aria-label="locale.t('supplier.col.selectAll')"
            @change="toggleSelectAll(($event.target as HTMLInputElement).checked)"
          />
        </cds-grid-column>

        <cds-grid-column width="22%">
          <div class="column-head">
            <span>{{ locale.t('supplier.col.name') }}</span>
            <span class="column-head-actions">
              <cds-button-action
                :aria-label="locale.t('supplier.sort').replace('{column}', locale.t('supplier.col.name'))"
                @click="toggleSort('NAME')"
              >
                <cds-icon v-if="sortStateFor('NAME') === 'ascending'" shape="angle" direction="up" size="sm"></cds-icon>
                <cds-icon v-else-if="sortStateFor('NAME') === 'descending'" shape="angle" direction="down" size="sm"></cds-icon>
                <cds-icon v-else shape="two-way-arrows" class="sort-idle" size="sm"></cds-icon>
              </cds-button-action>
              <cds-button-action
                shape="filter"
                :expanded="hasFilter('NAME')"
                :aria-label="locale.t('supplier.filter').replace('{column}', locale.t('supplier.col.name'))"
                @click="(event: MouseEvent) => openFilterMenu('NAME', event)"
              ></cds-button-action>
            </span>
          </div>
        </cds-grid-column>

        <cds-grid-column width="14%">{{ locale.t('supplier.col.gateway') }}</cds-grid-column>

        <cds-grid-column width="22%">
          <div class="column-head">
            <span>{{ locale.t('supplier.col.specs') }}</span>
            <span class="column-head-actions">
              <cds-button-action
                :aria-label="locale.t('supplier.sort').replace('{column}', locale.t('supplier.col.specs'))"
                @click="toggleSort('HEALTH')"
              >
                <cds-icon v-if="sortStateFor('HEALTH') === 'ascending'" shape="angle" direction="up" size="sm"></cds-icon>
                <cds-icon v-else-if="sortStateFor('HEALTH') === 'descending'" shape="angle" direction="down" size="sm"></cds-icon>
                <cds-icon v-else shape="two-way-arrows" class="sort-idle" size="sm"></cds-icon>
              </cds-button-action>
            </span>
          </div>
        </cds-grid-column>

        <cds-grid-column width="22%">{{ locale.t('supplier.col.actions') }}</cds-grid-column>

        <cds-grid-row v-for="m in visibleModels" :key="m.id">
          <cds-grid-cell>
            <input
              type="checkbox"
              class="app-checkbox"
              :checked="selectedIds.has(m.id)"
              :aria-label="locale.t('supplier.col.selectModel').replace('{name}', m.name)"
              @change="toggleSelect(m.id, ($event.target as HTMLInputElement).checked)"
            />
          </cds-grid-cell>
          <cds-grid-cell>
            <strong class="model-name" :title="m.name">{{ m.name }}</strong>
          </cds-grid-cell>
          <cds-grid-cell>
            <cds-badge status="neutral" class="provider-badge">
              {{ m.modelGateway.name }}
            </cds-badge>
          </cds-grid-cell>
          <cds-grid-cell>
            <button
              type="button"
              class="specs-link"
              :title="`${m.modelSpecs.length} 个 deployment`"
              @click="openSpecsDrawer(m)"
            >
              {{ m.modelSpecs.length }} 个 deployment
            </button>
            <cds-badge :status="healthBadgeStatus(m.status)" class="status-badge">
              <cds-icon
                :shape="
                  m.status === 'full_healthy'
                    ? 'check-circle'
                    : m.status === 'full_outage'
                      ? 'ban'
                      : 'warning-standard'
                "
                size="sm"
              ></cds-icon>
              {{ locale.t(`supplier.status.${m.status}`) }}
            </cds-badge>
          </cds-grid-cell>
          <cds-grid-cell>
            <div class="row-actions">
              <button
                v-if="auth.role === 'admin'"
                type="button"
                class="row-action"
                :title="locale.t('supplier.action.test')"
                @click="refreshOne(m)"
              >
                <cds-icon shape="network-globe" size="sm"></cds-icon>
                <span>{{ locale.t('supplier.action.test') }}</span>
              </button>
              <button
                v-if="auth.role === 'admin'"
                type="button"
                class="row-action"
                @click="openEdit(m)"
              >
                <cds-icon shape="pencil" size="sm"></cds-icon>
                <span>{{ locale.t('supplier.action.edit') }}</span>
              </button>
              <button
                v-if="auth.role === 'admin'"
                type="button"
                class="row-action"
                @click="openSpecsDrawer(m)"
              >
                <cds-icon shape="list" size="sm"></cds-icon>
                <span>{{ locale.t('supplier.specs.title').replace('{name}', '') }}</span>
              </button>
              <button
                v-if="auth.role === 'admin'"
                type="button"
                class="row-action"
                @click="refreshOneStatus(m)"
              >
                <cds-icon shape="refresh" size="sm"></cds-icon>
              </button>
              <button
                v-if="auth.role === 'admin'"
                type="button"
                class="row-action danger"
                @click="requestDelete(m)"
              >
                <cds-icon shape="trash" size="sm"></cds-icon>
                <span>{{ locale.t('supplier.action.delete') }}</span>
              </button>
            </div>
          </cds-grid-cell>
        </cds-grid-row>

        <cds-grid-placeholder v-if="visibleModels.length === 0 && !loading">
          <cds-icon shape="host" size="xl"></cds-icon>
          <p cds-text="subsection">{{ locale.t('supplier.empty') }}</p>
        </cds-grid-placeholder>

        <cds-grid-footer v-if="totalCount > 0">
          <span v-if="selectedCount > 0" class="selected-summary">
            {{ locale.t('supplier.selected').replace('{count}', String(selectedCount)) }}
          </span>
          <div class="pager">
            <label for="supplier-page-size">{{ locale.t('supplier.pagination.pageSize') }}</label>
            <cds-select control-width="shrink">
              <select
                id="supplier-page-size"
                :value="pageSize"
                :aria-label="locale.t('supplier.pagination.pageSize')"
                @change="onPageSizeChange"
              >
                <option v-for="option in PAGE_SIZE_OPTIONS" :key="option" :value="option">
                  {{ option }}
                </option>
              </select>
            </cds-select>
            <span class="pager-summary">{{ summaryText }}</span>
            <cds-pagination :aria-label="locale.t('supplier.pagination.label')">
              <cds-pagination-button action="first" :disabled="currentPage <= 1" :aria-label="locale.t('agents.pager.first')" @click="goToPage(1)"></cds-pagination-button>
              <cds-pagination-button action="prev" :disabled="currentPage <= 1" :aria-label="locale.t('agents.pager.prev')" @click="goToPage(currentPage - 1)"></cds-pagination-button>
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
              <cds-pagination-button action="next" :disabled="currentPage >= totalPages" :aria-label="locale.t('agents.pager.next')" @click="goToPage(currentPage + 1)"></cds-pagination-button>
              <cds-pagination-button action="last" :disabled="currentPage >= totalPages" :aria-label="locale.t('agents.pager.last')" @click="goToPage(totalPages)"></cds-pagination-button>
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
          :value="nameFilter"
          :placeholder="locale.t('supplier.filter.namePlaceholder')"
          :aria-label="locale.t('supplier.filter.namePlaceholder')"
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
            <span>{{ status === 'ALL' ? locale.t('supplier.filter.status.ALL') : locale.t(`supplier.status.${status}`) }}</span>
            <cds-icon v-if="statusFilter === status" shape="check" size="sm"></cds-icon>
          </button>
        </div>
        <div v-if="hasFilter(filterMenuKey)" class="filter-footer">
          <cds-button action="outline" size="sm" @click="clearActiveFilter">
            {{ locale.t('supplier.filter.clear') }}
          </cds-button>
        </div>
      </div>
    </cds-dropdown>

    <SupplierModelFormModal
      v-if="formOpen"
      :open="formOpen"
      :model="editingModel"
      :gateways="gateways"
      :saving="saving"
      @close="closeForm"
      @submit="submitModel"
    />

    <SupplierModelSpecsDrawer
      v-if="specsDrawerModel"
      :open="Boolean(specsDrawerModel)"
      :model="specsDrawerModel"
      @close="closeSpecsDrawer"
      @changed="refetch"
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
.supplier-page {
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
  margin-top: 20px;
}
.toolbar {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 10px;
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
.supplier-page cds-grid {
  display: block;
  flex: 1 1 auto;
  min-height: 0;
  min-width: 0;
  max-width: 100%;
  width: 100%;
  overflow: hidden;
}
.supplier-page cds-grid-column,
.supplier-page cds-grid-cell {
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
.model-name {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.status-badge,
.provider-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-width: 66px;
  white-space: nowrap;
  text-transform: capitalize;
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
.specs-link {
  display: inline-block;
  margin-right: 8px;
  padding: 4px 6px;
  border: 0;
  background: transparent;
  color: var(--cds-alias-object-interaction-color, #006e9c);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}
.specs-link:hover {
  background: var(--cds-alias-object-app-background, #f4f4f4);
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
  animation: supplier-spin 1s linear infinite;
}
@keyframes supplier-spin {
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