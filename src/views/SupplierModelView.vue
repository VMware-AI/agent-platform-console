<script setup lang="ts">
import { computed, ref } from 'vue'
import { useQuery } from '@vue/apollo-composable'
import { apolloClient } from '@/api/graphql/client'
import AppDropdown from '@/components/AppDropdown.vue'
import SupplierModelFormModal from '@/components/SupplierModelFormModal.vue'
import SupplierModelSpecsDrawer from '@/components/SupplierModelSpecsDrawer.vue'
import SupplierModelViewModal from '@/components/SupplierModelViewModal.vue'
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

// All reactive refs MUST be declared before the useQuery calls below.
// @vue/apollo-composable wraps a reactive variables function in a `computed`
// and observes it via `watch(variablesRef, ..., { deep: true })`. That watch
// evaluates the computed synchronously on init, so any ref read inside the
// reactive fn must already be in scope — referencing a not-yet-initialized
// `const` throws `ReferenceError: Cannot access 'nameFilter' before initialization`.
// Column-key aliases — the UI header keys (`'HEALTH'`, `'GATEWAY'`) differ
// from the wire-level sort enum (`'STATUS'`, `'GATEWAY'`). All sort-state
// functions below operate on column keys and translate to/from the wire
// field via this map, so the page template never sees the wire enum.
// Note: GATEWAY is column-only — it has a filter button but no sort
// button, so `toggleSort('GATEWAY')` is never invoked. We still keep the
// mapping here so the column-key/wire-field lookup stays uniform.
type SortColumnKey = 'NAME' | 'HEALTH' | 'GATEWAY'
const COLUMN_TO_SORT_FIELD: Record<SortColumnKey, ProviderModelSortField> = {
  NAME: 'NAME',
  HEALTH: 'STATUS',
  GATEWAY: 'GATEWAY',
}

const selectedIds = ref<Set<string>>(new Set())
const nameFilter = ref('')
const statusFilter = ref<StatusFilter>('ALL')
// `''` means "no gateway filter" — null would collide with the
// `modelGatewayId?: string | null` GraphQL filter input, where null is
// the canonical "no filter" wire value. We resolve `''` → `null` at the
// useQuery boundary (see the `filter` object below).
const gatewayFilter = ref<string>('')
const pageSize = ref<PageSize>(10)
const currentPage = ref(1)
const sortField = ref<ProviderModelSortField | null>(null)
const sortDirection = ref<SortDirection>('ASC')
const filterMenuAnchor = ref<HTMLElement | null>(null)
const filterMenuKey = ref<SortColumnKey | null>(null)

const formOpen = ref(false)
const editingModel = ref<ProviderModelNode | null>(null)
const saving = ref(false)
const specsDrawerModel = ref<ProviderModelNode | null>(null)
const specsViewModel = ref<ProviderModelNode | null>(null)
const pendingDeleteIds = ref<string[]>([])

const { result, loading, refetch } = useQuery<ProviderModelInfoResult>(
  PROVIDER_MODELS_QUERY,
  () => ({
    filter: {
      search: nameFilter.value.trim() || null,
      status: statusFilter.value === 'ALL' ? null : statusFilter.value,
      modelGatewayId: gatewayFilter.value || null,
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
    ? locale.t('supplier.model.confirm.batchDeleteTitle')
    : locale.t('supplier.model.confirm.deleteTitle'),
)
const deleteDialogBody = computed(() => {
  if (pendingDeleteIds.value.length > 1) {
    return locale
      .t('supplier.model.confirm.batchDeleteBody')
      .replace('{count}', String(pendingDeleteIds.value.length))
      .replace('{token}', BATCH_DELETE_TOKEN)
  }
  const target = models.value.find(
    (m) => m.id === pendingDeleteIds.value[0],
  )
  return locale
    .t('supplier.model.confirm.deleteBody')
    .replace('{name}', target?.name ?? '')
})

// Single-row delete: user must type the model's exact name to enable the
// confirm button. Batch delete: user must type the literal confirmation
// token (BATCH_DELETE_TOKEN). This is a stronger secondary guard than a
// bare OK/Cancel dialog — it forces the user to slow down for
// irreversible actions, matching the project's type-to-confirm pattern
// (Users tab delete flow does the same).
const BATCH_DELETE_TOKEN = '确认删除'
const deleteExpectedInput = computed(() => {
  if (pendingDeleteIds.value.length <= 1) {
    return (
      models.value.find((m) => m.id === pendingDeleteIds.value[0])?.name ?? ''
    )
  }
  return BATCH_DELETE_TOKEN
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

function sortStateFor(field: SortColumnKey): 'none' | 'ascending' | 'descending' {
  // Compare via the column→wire map so the column key never sees the wire
  // enum directly. Without this, the previous `'HEALTH'` column key
  // silently never matched `sortField.value === 'STATUS'` and the status
  // header's sort icon stayed frozen in the idle state — the column key
  // and wire field names were aligned by hand-written `===` checks that
  // drifted the moment we added a column whose column-key and wire-field
  // differ (GATEWAY).
  if (sortField.value !== COLUMN_TO_SORT_FIELD[field]) return 'none'
  return sortDirection.value === 'ASC' ? 'ascending' : 'descending'
}

function toggleSort(field: SortColumnKey) {
  const target = COLUMN_TO_SORT_FIELD[field]
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

function openFilterMenu(key: SortColumnKey, event: MouseEvent) {
  filterMenuKey.value = key
  filterMenuAnchor.value = event.currentTarget as HTMLElement
}

function closeFilterMenu() {
  filterMenuKey.value = null
  filterMenuAnchor.value = null
}

function hasFilter(key: SortColumnKey): boolean {
  if (key === 'NAME') return Boolean(nameFilter.value.trim())
  if (key === 'GATEWAY') return Boolean(gatewayFilter.value)
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

function setGatewayFilter(value: string) {
  gatewayFilter.value = value
  currentPage.value = 1
}

function clearActiveFilter() {
  if (filterMenuKey.value === 'NAME') nameFilter.value = ''
  else if (filterMenuKey.value === 'HEALTH') statusFilter.value = 'ALL'
  else if (filterMenuKey.value === 'GATEWAY') gatewayFilter.value = ''
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
      locale.t(isEditing ? 'supplier.model.toast.updated' : 'supplier.model.toast.created'),
    )
    if (!isEditing) currentPage.value = 1
    formOpen.value = false
    editingModel.value = null
    await refetch()
  } catch (error) {
    toast.error(graphqlErrorMessage(error, locale.t('supplier.model.toast.saveFailed')))
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

function openSpecsView(m: ProviderModelNode) {
  specsViewModel.value = m
}

function closeSpecsView() {
  specsViewModel.value = null
}

// `formatDateTime` matches VirtualKeyView.formatDateTime so the
// timestamp columns read consistently across the admin surface. ISO
// strings are converted to "YYYY-MM-DD HH:mm" in the user's local
// timezone; null/invalid fall through to an em-dash so the cell never
// renders the raw ISO string.
function formatDateTime(value: string | null): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

// `organization` lives on each spec (litellmParams.organization) and
// is broadcast from a single row-level input on submit — so most rows
// share one value across all specs. We surface the first non-empty
// value; heterogeneous rows (rare in practice) show the first spec's
// value. Empty → empty string so the cell renders "—".
function primaryOrganization(m: ProviderModelNode): string {
  for (const s of m.modelSpecs) {
    if (s.litellmParams.organization) return s.litellmParams.organization
  }
  return ''
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
    // Defensive: an Apollo errorPolicy of 'none' (the default) throws on
    // graphQLErrors, so reaching this line usually means r.data.testProviderConnection
    // is a non-null status. Guard the implicit chain with explicit checks
    // so a malformed response (data === null, data.testProviderConnection === null
    // because the backend resolver returned null on failure, etc.) surfaces
    // as an error toast instead of silently doing nothing.
    if (r.data?.testProviderConnection) {
      toast.success(locale.t('supplier.model.toast.healthChecked'))
      await refetch()
      return
    }
    if (r.errors && r.errors.length > 0) {
      toast.error(
        graphqlErrorMessage(
          { graphQLErrors: r.errors },
          locale.t('supplier.model.toast.refreshFailed'),
        ),
      )
      return
    }
    // No error, no usable data — treat as failure so the user is told
    // something happened instead of seeing no feedback at all.
    toast.error(locale.t('supplier.model.toast.refreshFailed'))
  } catch (error) {
    toast.error(
      graphqlErrorMessage(error, locale.t('supplier.model.toast.refreshFailed')),
    )
  }
}

async function refreshAll() {
  if (loading.value) return
  try {
    await refetch()
    toast.success(locale.t('supplier.model.toast.refreshed'))
  } catch (error) {
    toast.error(graphqlErrorMessage(error, locale.t('supplier.model.toast.refreshFailed')))
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
        .t('supplier.model.toast.deleted')
        .replace('{count}', String(deletedIds.length)),
    )
  }
  if (failures.length > 0) {
    toast.error(
      graphqlErrorMessage(failures[0].reason, locale.t('supplier.model.toast.deleteFailed')),
    )
  }
  selectedIds.value = new Set(
    [...selectedIds.value].filter((id) => !deletedIds.includes(id)),
  )
  await refetch()
  if (currentPage.value > totalPages.value) currentPage.value = totalPages.value
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

        <cds-grid-column width="16%">
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

        <cds-grid-column width="8%">
          <div class="column-head">
            <span>{{ locale.t('supplier.col.gateway') }}</span>
            <span class="column-head-actions">
              <cds-button-action
                shape="filter"
                :expanded="hasFilter('GATEWAY')"
                :aria-label="locale.t('supplier.filter').replace('{column}', locale.t('supplier.col.gateway'))"
                @click="(event: MouseEvent) => openFilterMenu('GATEWAY', event)"
              ></cds-button-action>
            </span>
          </div>
        </cds-grid-column>

        <cds-grid-column width="8%">
          <div class="column-head">
            <span>{{ locale.t('supplier.col.status') }}</span>
            <span class="column-head-actions">
              <cds-button-action
                shape="filter"
                :expanded="hasFilter('HEALTH')"
                :aria-label="locale.t('supplier.filter').replace('{column}', locale.t('supplier.col.status'))"
                @click="(event: MouseEvent) => openFilterMenu('HEALTH', event)"
              ></cds-button-action>
            </span>
          </div>
        </cds-grid-column>

        <cds-grid-column width="13%">
          <div class="column-head">
            <span>{{ locale.t('supplier.col.specs') }}</span>
          </div>
        </cds-grid-column>

        <cds-grid-column width="8%">{{ locale.t('supplier.col.organization') }}</cds-grid-column>

        <cds-grid-column width="10%">{{ locale.t('supplier.col.lastCheckedAt') }}</cds-grid-column>

        <cds-grid-column width="9%">{{ locale.t('supplier.col.createdAt') }}</cds-grid-column>

        <cds-grid-column width="9%">{{ locale.t('supplier.col.updatedAt') }}</cds-grid-column>

        <cds-grid-column width="19%">{{ locale.t('supplier.col.actions') }}</cds-grid-column>

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
          <cds-grid-cell class="muted-cell">
            {{ m.modelGateway.name }}
          </cds-grid-cell>
          <cds-grid-cell>
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
            <button
              type="button"
              class="specs-link-pill"
              :title="locale.t('supplier.action.view')"
              :aria-label="locale.t('supplier.action.view')"
              @click="openSpecsView(m)"
            >
              <span class="specs-count-badge">{{ m.modelSpecs.length }}</span>
              <cds-icon shape="eye" size="sm" aria-hidden="true"></cds-icon>
              <span>{{ locale.t('supplier.action.view') }}</span>
            </button>
          </cds-grid-cell>
          <cds-grid-cell class="muted-cell">
            {{ primaryOrganization(m) || '—' }}
          </cds-grid-cell>
          <cds-grid-cell class="muted-cell">
            {{ formatDateTime(m.lastCheckedAt) }}
          </cds-grid-cell>
          <cds-grid-cell class="muted-cell">
            {{ formatDateTime(m.createdAt) }}
          </cds-grid-cell>
          <cds-grid-cell class="muted-cell">
            {{ formatDateTime(m.updatedAt) }}
          </cds-grid-cell>
          <cds-grid-cell>
            <div class="row-actions">
              <button
                v-if="auth.role === 'admin'"
                type="button"
                class="row-action"
                :title="locale.t('supplier.action.checkHealth')"
                @click="refreshOne(m)"
              >
                <cds-icon shape="network-globe" size="sm"></cds-icon>
                <span>{{ locale.t('supplier.action.checkHealth') }}</span>
              </button>
              <button
                v-if="auth.role === 'admin'"
                type="button"
                class="row-action"
                @click="openSpecsDrawer(m)"
              >
                <cds-icon shape="list" size="sm"></cds-icon>
                <span>{{ locale.t('supplier.action.manageSpecs') }}</span>
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
      :hidden="!filterMenuAnchor"
      :anchor="filterMenuAnchor"
      closable
      @closeChange="closeFilterMenu"
    >
      <div class="filter-panel">
        <cds-input v-if="filterMenuKey === 'NAME'">
          <input
            type="text"
            :value="nameFilter"
            :placeholder="locale.t('supplier.filter.namePlaceholder')"
            :aria-label="locale.t('supplier.filter.namePlaceholder')"
            @input="setNameFilter(($event.target as HTMLInputElement).value)"
          />
        </cds-input>
        <div v-else-if="filterMenuKey === 'GATEWAY'" class="filter-options">
          <button
            type="button"
            class="filter-option"
            :class="{ active: gatewayFilter === '' }"
            @click="setGatewayFilter('')"
          >
            <span>{{ locale.t('supplier.filter.gateway.ALL') }}</span>
            <cds-icon v-if="gatewayFilter === ''" shape="check" size="sm"></cds-icon>
          </button>
          <button
            v-for="g in gateways"
            :key="g.id"
            type="button"
            class="filter-option"
            :class="{ active: gatewayFilter === g.id }"
            @click="setGatewayFilter(g.id)"
          >
            <span>{{ g.name }}</span>
            <cds-icon v-if="gatewayFilter === g.id" shape="check" size="sm"></cds-icon>
          </button>
        </div>
        <div v-else-if="filterMenuKey === 'HEALTH'" class="filter-options">
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
        <div v-if="filterMenuKey && hasFilter(filterMenuKey)" class="filter-footer">
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

    <SupplierModelViewModal
      v-if="specsViewModel"
      :open="Boolean(specsViewModel)"
      :model="specsViewModel"
      @close="closeSpecsView"
    />

    <ConfirmDialog
      :open="pendingDeleteIds.length > 0"
      :title="deleteDialogTitle"
      :body="deleteDialogBody"
      :expected-input="deleteExpectedInput"
      :input-placeholder="locale.t('supplier.model.confirm.tokenPlaceholder')"
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
  color: inherit;
}
.refresh-button:focus-visible {
  outline: 2px solid currentColor;
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
.status-badge {
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
  gap: 8px;
  flex-wrap: wrap;
  /* Don't let the action row be compressed by the grid cell's flex
     layout — earlier, when the "操作" column was 10%, the four icon+
     label buttons (探测 / 编辑 / 管理模型 / 删除) added up to ~150px
     but the cell only allocated ~120px, causing the row to overflow
     past the column boundary and get clipped. flex-shrink:0 keeps the
     row intact; the cell will visually extend past its percentage
     width if needed, which is preferable to silent truncation. */
  flex-shrink: 0;
}
.row-action {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  min-width: 40px;
  padding: 2px;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: var(--cds-alias-object-interaction-color, #006e9c);
  font: inherit;
  cursor: pointer;
}
.row-action span {
  font-size: 10px;
  line-height: 1.15;
  white-space: nowrap;
}
.row-action:focus-visible {
  outline: 2px solid var(--cds-alias-status-info, #0079ad);
  outline-offset: 1px;
}
.row-action:disabled,
.row-action.disabled {
  opacity: 0.55;
}
.row-action.danger {
  color: var(--cds-alias-status-danger, #c92100);
}
/* Outer pill — wraps an inner count badge + the icon + label as one
   segmented button. Info-blue chrome so the whole pill reads as the
   primary action. The inner count badge is on the far left with a small
   right margin so it visually segments from the icon/label area. */
.specs-link-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  appearance: none;
  margin: 0;
  padding: 2px 10px 2px 4px;
  border: 1px solid var(--cds-alias-status-info, #0079ad);
  border-radius: 999px;
  background: var(--cds-alias-object-app-blue-50, rgba(0, 114, 163, 0.08));
  color: var(--cds-alias-status-info, #0079ad);
  font: inherit;
  font-size: 12px;
  font-weight: 500;
  line-height: 1.4;
  cursor: pointer;
  transition:
    background-color 0.12s ease,
    border-color 0.12s ease,
    color 0.12s ease,
    transform 0.12s ease;
  white-space: nowrap;
}
.specs-link-pill > cds-icon {
  color: inherit;
  display: inline-flex;
}
.specs-link-pill:hover:not(:disabled) {
  background: var(--cds-alias-status-info, #0079ad);
  border-color: var(--cds-alias-status-info, #0079ad);
  color: #fff;
}
.specs-link-pill:hover:not(:disabled) > cds-icon {
  color: #fff;
}
.specs-link-pill:active:not(:disabled) {
  transform: translateY(1px);
}
/* Container flexing the count badge and the action pill horizontally
   inside the cell. No longer used — superseded by the merged
   specs-link-pill (inner count badge + outer pill); kept in case the
   split layout is re-introduced later. */
.specs-viewer {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  white-space: nowrap;
}
.specs-link-pill {
  /* Don't shrink — flex's default min-width:auto collapses the pill's
     text on tight cells, making "查看" wrap and look nested inside the
     badge. Setting flex-shrink:0 keeps the pill's chrome intact at the
     expense of letting the cell overflow if the column is truly too
     narrow (15% accommodates the badge + pill comfortably). */
  flex-shrink: 0;
}
/* Read-only auxiliary columns (organization, timestamps) read as
   secondary information next to the model's status badge — a softer
   grey nudges the eye to the action column without making the cells
   look broken. */
.muted-cell {
  color: var(--cds-alias-typography-color-300, #565656);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}
/* Inner count chip — sits inside .specs-link-pill as a darker segment,
   so the whole pill reads as one button with a numeric prefix. Uses
   inline-flex + tabular-nums so single-digit ("3") and double-digit
   ("12") widths stay predictable. */
.specs-count-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 22px;
  height: 20px;
  padding: 0 8px;
  margin-right: 4px;
  border-radius: 999px;
  background: hsl(199, 80%, 28%);
  color: #fff;
  font-size: 12px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  line-height: 1;
  white-space: nowrap;
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
/* Carbon <cds-input> host sits inside cds-dropdown's popup-content — by
   default the host shrinks to its label width because cds-input's
   user-agent shadow root forces `width: auto !important`. Force 100% so
   the inner native <input> stretches to the popup content width and
   matches the resource pool name filter's look. */
.filter-panel > cds-input {
  width: 100%;
  box-sizing: border-box;
}
.filter-panel > cds-input > input {
  width: 100%;
  box-sizing: border-box;
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