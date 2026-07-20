<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useQuery } from '@vue/apollo-composable'
import { apolloClient } from '@/api/graphql/client'
import AppDropdown from '@/components/AppDropdown.vue'
import ModelRouteFormModal from '@/components/ModelRouteFormModal.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import { useLocaleStore } from '@/stores/locale'
import { useAuthStore } from '@/stores/auth'
import { useToast } from '@/composables/useToast'
import { graphqlErrorMessage } from '@/api/graphql/errors'
import type { ModelRouteGatewayOption } from '@/types/model-route'
import {
  MODEL_ROUTES_QUERY,
  CREATE_MODEL_ROUTE,
  UPDATE_MODEL_ROUTE,
  DELETE_MODEL_ROUTE,
  type ModelRoutesResult,
  type ModelRouteNode,
  type CreateModelRouteResult,
  type CreateModelRouteVars,
  type UpdateModelRouteResult,
  type UpdateModelRouteVars,
  type DeleteModelRouteResult,
  type DeleteModelRouteVars,
} from '@/api/graphql/queries/model-routes'
import { MODEL_GATEWAYS_QUERY } from '@/api/graphql/queries/model-gateways'
import {
  PROVIDER_MODELS_QUERY,
  type ProviderModelInfoResult,
  type ProviderModelNode,
} from '@/api/graphql/queries/supplier-models'
import '@/components/icons'

const locale = useLocaleStore()
const auth = useAuthStore()
const toast = useToast()

// We use ModelRouteNode directly (no toUiRoute adapter) — the GraphQL
// shape now matches what the table + form need. The form still consumes
// a `ModelRouteGatewayOption[]` for the picker; the rest is the raw node.
function toRoute(node: ModelRouteNode): ModelRouteNode {
  return node
}

const PAGE_SIZE_OPTIONS = [10, 20, 50] as const
type PageSize = (typeof PAGE_SIZE_OPTIONS)[number]
type BatchAction = 'delete'
// Inline badge budget before we fall back to "+N overflow" — matches
// VirtualKeyView's MODELS_VISIBLE_LIMIT so the two surfaces read as the
// same chip treatment. 3 was picked because at the 20% MODELS column
// width that's the longest list that fits on one line without wrapping
// for typical model names.
const MODELS_VISIBLE_LIMIT = 3
// STATUS was previously a sortable + filterable column driven by the now-removed
// `enabled` field; STRATEGY / MODELS were dropped from the sortable set
// (their sort affordances were removed from the table header — the rows
// still render the values, just without a clickable sort caret). NAME /
// GATEWAY remain sortable.
type RouteSortField = 'NAME' | 'GATEWAY'
type SortDirection = 'ASC' | 'DESC'
type RouteFilterKey = RouteSortField | 'STRATEGY' | 'MODELS'

const { result, loading, refetch } = useQuery<ModelRoutesResult>(MODEL_ROUTES_QUERY)
const routes = computed<ModelRouteNode[]>(() => (result.value?.modelRoutes ?? []).map(toRoute))

// Provider models (供应商模型) — feed the M2 form's shuttle candidate list.
// New API: ProviderModelInfo (paged). The shuttle needs `id / name /
// provider / status` shape; provider now derives from the first spec's
// customLlmProvider (top-level `provider` is gone), and we no longer
// filter by `enabled` (top-level `enabled` is also gone).
//
// Filtered by the form's currently selected model gateway. Empty when no
// gateway is picked yet, so the shuttle stays empty until the operator
// chooses a gateway — matches the 「颁发密钥」 page (where the model list
// only loads after a gateway is selected) and prevents the operator from
// pre-picking models against a gateway they then change.
const formGatewayId = ref<string>('')
// useQuery vars are reactive — pass a getter so the query re-fires when
// `formGatewayId` changes. Passing `null` for `filter.modelGatewayId`
// when no gateway is selected skips the server-side filter entirely.
const providerResult = useQuery<ProviderModelInfoResult>(
  PROVIDER_MODELS_QUERY,
  () => ({
    page: { limit: 1000, offset: 0 },
    filter: formGatewayId.value ? { modelGatewayId: formGatewayId.value } : null,
  }),
  () => ({
    enabled: Boolean(formGatewayId.value),
  }),
)
// Local mirror of the gateway-scoped provider-model list. Apollo's
// `result.value` keeps its previous payload after the query is disabled
// (it doesn't auto-clear), so reading it directly would leak the last
// gateway's model list into the shuttle when the form reopens or the
// operator picks "请先选择模型网关". `providerModels` only mirrors the
// Apollo result when (a) a gateway is currently selected and (b) the
// fetch isn't mid-flight — that way clearing `formGatewayId` on
// `closeForm` actually empties the shuttle, even if Apollo hasn't
// observed the disabled state yet.
const providerModels = ref<ProviderModelNode[]>([])
watch(
  [() => formGatewayId.value, () => providerResult.result.value, () => providerResult.loading.value],
  ([gateway, result, loading]) => {
    if (!gateway || loading) {
      providerModels.value = []
      return
    }
    providerModels.value = result?.providerModelInfo?.data ?? []
  },
  { immediate: true },
)

// Gateway picker options come from the real model-gateway list (so a route can be
// created even before any route references a gateway).
const gatewaysResult = useQuery<{ modelGateways: { nodes: Array<{ id: string; name: string }> } }>(
  MODEL_GATEWAYS_QUERY,
  { page: { limit: 1000, offset: 0 } },
)
const GATEWAYS = computed<ModelRouteGatewayOption[]>(() =>
  (gatewaysResult.result.value?.modelGateways?.nodes ?? []).map((gateway) => ({
    id: gateway.id,
    name: gateway.name,
  })),
)

// Shuttle candidates: the form's left column. We pass the full ProviderModel
// shape (ModelRouteFormModal's SlotItem is structural; the form only reads
// id / name / provider / status). The form filters further by
// !selectedIds internally.
//
// Excludes models whose health probe hasn't reported the model usable:
//   - `full_outage`: every spec is failing — the route would 100% fail over
//     to its fallback chain. Not a viable primary, only a fallback — and
//     even then only useful when a caller wants the route to be a "dead
//     branch" by design, which the form does not model.
//   - `unknown`: probe hasn't run yet; litellm returns no verdict. Same
//     rationale as full_outage — picking it as a primary silently risks
//     runtime failures the operator can't see.
//
// `partial_outage` is intentionally kept: at least one spec is healthy,
// and the route's strategy decides how to distribute across them — that's
// the whole point of the strategy picker.
const shuttleCandidates = computed(() =>
  providerModels.value
    .filter((m) => m.status !== 'full_outage' && m.status !== 'unknown')
    .map((m) => ({
      id: m.id,
      name: m.name,
      provider: m.modelSpecs[0]?.litellmParams.customLlmProvider ?? '—',
      status: m.status,
      gatewayName: m.modelGateway?.name,
      specCount: m.modelSpecs.length,
    })),
)

// allRoutesForFallback — every route in the system is a candidate to be
// a fallback for any other route. The form filters out the current route
// itself (a route can't fall back to its own name).
const allRoutesForFallback = computed(() =>
  routes.value.map((r) => ({ id: r.id, name: r.name })),
)

const selectedIds = ref<Set<string>>(new Set())
const pageSize = ref<PageSize>(10)
const currentPage = ref(1)
const formOpen = ref(false)
const editingRoute = ref<ModelRouteNode | null>(null)
const saving = ref(false)
const pendingDeleteIds = ref<string[]>([])
const sortField = ref<RouteSortField | null>(null)
const sortDirection = ref<SortDirection>('ASC')
const nameFilter = ref('')
const gatewayFilter = ref('ALL')
const modelsFilter = ref('')
const filterMenuAnchor = ref<HTMLElement | null>(null)
const filterMenuKey = ref<RouteFilterKey | null>(null)

const filteredRoutes = computed(() => {
  const nameKeyword = nameFilter.value.trim().toLocaleLowerCase()
  const modelsKeyword = modelsFilter.value.trim().toLocaleLowerCase()
  const filtered = routes.value.filter((route) => {
    if (nameKeyword && !route.name.toLocaleLowerCase().includes(nameKeyword)) return false
    if (gatewayFilter.value !== 'ALL' && route.modelGateway.id !== gatewayFilter.value) return false
    if (
      modelsKeyword &&
      !route.supportedModels.some((model) => model.toLocaleLowerCase().includes(modelsKeyword))
    ) {
      return false
    }
    return true
  })

  if (!sortField.value) return filtered
  const direction = sortDirection.value === 'ASC' ? 1 : -1
  return [...filtered].sort((left, right) => {
    const valueFor = (route: ModelRouteNode): string | number => {
      if (sortField.value === 'NAME') return route.name
      return route.modelGateway.name
    }
    const leftValue = valueFor(left)
    const rightValue = valueFor(right)
    if (typeof leftValue === 'number' && typeof rightValue === 'number') {
      return (leftValue - rightValue) * direction
    }
    return String(leftValue).localeCompare(String(rightValue), locale.locale) * direction
  })
})

const totalCount = computed(() => filteredRoutes.value.length)
const totalPages = computed(() => Math.max(1, Math.ceil(totalCount.value / pageSize.value)))
const visibleRoutes = computed(() => {
  const offset = (currentPage.value - 1) * pageSize.value
  return filteredRoutes.value.slice(offset, offset + pageSize.value)
})
const selectedCount = computed(() => selectedIds.value.size)
const allVisibleSelected = computed(
  () =>
    visibleRoutes.value.length > 0 &&
    visibleRoutes.value.every((route) => selectedIds.value.has(route.id)),
)
const summaryText = computed(() => {
  const start = totalCount.value === 0 ? 0 : (currentPage.value - 1) * pageSize.value + 1
  const end = Math.min(currentPage.value * pageSize.value, totalCount.value)
  return locale
    .t('gatewayModel.pagination.summary')
    .replace('{start}', String(start))
    .replace('{end}', String(end))
    .replace('{total}', String(totalCount.value))
})
const deleteDialogTitle = computed(() =>
  locale.t('gatewayModel.confirm.batchDeleteTitle'),
)
const deleteDialogBody = computed(() =>
  locale
    .t('gatewayModel.confirm.batchDeleteBody')
    .replace('{count}', String(Math.max(pendingDeleteIds.value.length, 0))),
)
function toggleSelect(id: string, checked: boolean) {
  const next = new Set(selectedIds.value)
  if (checked) next.add(id)
  else next.delete(id)
  selectedIds.value = next
}

function toggleSelectAll(checked: boolean) {
  const next = new Set(selectedIds.value)
  for (const route of visibleRoutes.value) {
    if (checked) next.add(route.id)
    else next.delete(route.id)
  }
  selectedIds.value = next
}

function openCreate() {
  editingRoute.value = null
  // Pre-fill with the route's existing gateway so its model list loads
  // when the form opens. For new routes, leave empty so the shuttle
  // waits for the operator's gateway pick.
  formGatewayId.value = ''
  formOpen.value = true
}

function openEdit(route: ModelRouteNode) {
  editingRoute.value = route
  formGatewayId.value = route.modelGateway.id
  formOpen.value = true
}

function closeForm() {
  if (saving.value) return
  formOpen.value = false
  editingRoute.value = null
  // Reset the upstream filter so the next open starts with no
  // pre-fetched provider-model list — reopens the form clean.
  formGatewayId.value = ''
}

function onGatewayChanged(gatewayId: string) {
  formGatewayId.value = gatewayId
}

async function submitRoute(
  draft: import('@/components/ModelRouteFormModal.vue').ModelRouteFormDraft,
) {
  if (saving.value) return
  const editing = editingRoute.value
  saving.value = true
  try {
    if (editing) {
      await apolloClient.mutate<UpdateModelRouteResult, UpdateModelRouteVars>({
        mutation: UPDATE_MODEL_ROUTE,
        variables: { id: editing.id, input: draft },
      })
      toast.success(locale.t('gatewayModel.toast.updated'))
    } else {
      await apolloClient.mutate<CreateModelRouteResult, CreateModelRouteVars>({
        mutation: CREATE_MODEL_ROUTE,
        variables: { input: draft },
      })
      currentPage.value = 1
      toast.success(locale.t('gatewayModel.toast.created'))
    }
    formOpen.value = false
    editingRoute.value = null
    await refetch()
  } catch (error) {
    toast.error(graphqlErrorMessage(error, locale.t('gatewayModel.toast.actionFailed')))
  } finally {
    saving.value = false
  }
}

function sortStateFor(field: RouteSortField): 'none' | 'ascending' | 'descending' {
  if (sortField.value !== field) return 'none'
  return sortDirection.value === 'ASC' ? 'ascending' : 'descending'
}

function toggleSort(field: RouteSortField) {
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

function openFilterMenu(key: RouteFilterKey, event: MouseEvent) {
  filterMenuKey.value = key
  filterMenuAnchor.value = event.currentTarget as HTMLElement
}

function closeFilterMenu() {
  filterMenuAnchor.value = null
  filterMenuKey.value = null
}

function hasFilter(key: RouteFilterKey): boolean {
  if (key === 'NAME') return Boolean(nameFilter.value.trim())
  if (key === 'GATEWAY') return gatewayFilter.value !== 'ALL'
  return Boolean(modelsFilter.value.trim())
}

function setTextFilter(key: 'NAME' | 'MODELS', value: string) {
  if (key === 'NAME') nameFilter.value = value
  else modelsFilter.value = value
  currentPage.value = 1
}

function setGatewayFilter(value: string) {
  gatewayFilter.value = value
  currentPage.value = 1
  closeFilterMenu()
}

function clearActiveFilter() {
  if (filterMenuKey.value === 'NAME') nameFilter.value = ''
  else if (filterMenuKey.value === 'GATEWAY') gatewayFilter.value = 'ALL'
  else if (filterMenuKey.value === 'MODELS') modelsFilter.value = ''
  currentPage.value = 1
  closeFilterMenu()
}

function performBatch(action: BatchAction, close: () => void) {
  const ids = [...selectedIds.value]
  close()
  if (ids.length === 0) return
  // Only `delete` remains — `enable` / `disable` were removed when the
  // `enabled` field and setModelRouteEnabled mutation were dropped.
  pendingDeleteIds.value = ids
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
      apolloClient.mutate<DeleteModelRouteResult, DeleteModelRouteVars>({
        mutation: DELETE_MODEL_ROUTE,
        variables: { id },
      }),
    ),
  )
  const deletedIds = ids.filter((_, index) => outcomes[index].status === 'fulfilled')
  const failures = outcomes.filter(
    (outcome): outcome is PromiseRejectedResult => outcome.status === 'rejected',
  )
  if (deletedIds.length > 0) {
    toast.success(locale.t('gatewayModel.toast.deleted').replace('{count}', String(deletedIds.length)))
  }
  if (failures.length > 0) {
    toast.error(graphqlErrorMessage(failures[0].reason, locale.t('gatewayModel.toast.actionFailed')))
  }
  selectedIds.value = new Set([...selectedIds.value].filter((id) => !deletedIds.includes(id)))
  await refetch()
  if (currentPage.value > totalPages.value) currentPage.value = totalPages.value
}

// manageGateway was removed along with the row's manage button — the
// toast-only "open the gateway manager" hint no longer has a caller.
// If a future view needs the same action, reintroduce a function that
// does it instead of just emitting a toast.

async function refreshRoutes() {
  if (loading.value) return
  try {
    await refetch()
    toast.success(locale.t('gatewayModel.toast.refreshed'))
  } catch (error) {
    toast.error(graphqlErrorMessage(error, locale.t('gatewayModel.toast.actionFailed')))
  }
}

function onPageSizeChange(event: Event) {
  const next = Number((event.target as HTMLSelectElement).value)
  if (!PAGE_SIZE_OPTIONS.includes(next as PageSize)) return
  pageSize.value = next as PageSize
  currentPage.value = 1
}

// Render an ISO timestamp as `YYYY/MM/DD HH:MM` in the operator's local
// timezone (the `time-zone` of a `Date` instance is always the runtime
// locale). Mirrors `formatGatewayTime` in ModelGatewayView.vue so the
// two pages read timestamps the same way. Returns the literal em-dash
// for null/undefined/invalid — the table cell needs a non-empty
// placeholder so the column width doesn't collapse on missing rows.
function formatTimestamp(value: string | null | undefined): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  const pad = (n: number) => String(n).padStart(2, '0')
  return (
    `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}`
  )
}

function goToPage(page: number) {
  if (page < 1 || page > totalPages.value) return
  currentPage.value = page
}
</script>

<template>
  <section class="route-page">
    <header class="page-head">
      <h1 cds-text="title" class="heading">{{ locale.t('gatewayModel.title') }}</h1>
      <p cds-text="body" class="desc muted">{{ locale.t('gatewayModel.description') }}</p>
    </header>

    <div class="toolbar">
      <cds-button v-if="auth.role === 'admin'" action="outline" status="primary" @click="openCreate">
        <cds-icon shape="plus-circle" size="sm" aria-hidden="true"></cds-icon>
        {{ locale.t('gatewayModel.action.create') }}
      </cds-button>

      <AppDropdown v-if="auth.role === 'admin'" align="start" :disabled="selectedCount === 0">
        <template #trigger>
          <cds-button
            action="outline"
            :disabled="selectedCount === 0"
            :title="selectedCount === 0 ? locale.t('gatewayModel.batch.disabled') : undefined"
          >
            <cds-icon shape="cog" size="sm" aria-hidden="true"></cds-icon>
            {{ locale.t('gatewayModel.action.batch') }}
            <cds-icon shape="angle" direction="down" size="sm" aria-hidden="true"></cds-icon>
          </cds-button>
        </template>
        <template #default="{ close }">
          <button class="menu-option danger" type="button" @click="performBatch('delete', close)">
            <cds-icon shape="trash" size="sm" aria-hidden="true"></cds-icon>
            {{ locale.t('gatewayModel.batch.delete') }}
          </button>
        </template>
      </AppDropdown>

      <button
        type="button"
        class="refresh-button"
        :disabled="loading"
        :aria-label="locale.t('gatewayModel.action.refresh')"
        :title="locale.t('gatewayModel.action.refresh')"
        @click="refreshRoutes"
      >
        <cds-icon
          shape="refresh"
          size="md"
          :class="{ spinning: loading }"
          aria-hidden="true"
        ></cds-icon>
      </button>
    </div>

    <cds-grid
      border="row"
      column-layout="flex"
      role="grid"
      scroll-lock
      :aria-label="locale.t('gatewayModel.table.label')"
    >
      <cds-grid-column type="action" :resizable="false">
        <input
          type="checkbox"
          class="app-checkbox"
          :checked="allVisibleSelected"
          :aria-label="locale.t('gatewayModel.col.selectAll')"
          @change="toggleSelectAll(($event.target as HTMLInputElement).checked)"
        />
      </cds-grid-column>
      <cds-grid-column width="16%">
        <div class="column-head">
          <span>{{ locale.t('gatewayModel.col.name') }}</span>
          <span class="column-head-actions">
            <cds-button-action
              :aria-label="
                locale.t('gatewayModel.sort').replace('{column}', locale.t('gatewayModel.col.name'))
              "
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
              :aria-label="
                locale.t('gatewayModel.filter').replace('{column}', locale.t('gatewayModel.col.name'))
              "
              @click="(event: MouseEvent) => openFilterMenu('NAME', event)"
            ></cds-button-action>
          </span>
        </div>
      </cds-grid-column>
      <cds-grid-column width="16%">
        <div class="column-head">
          <span>{{ locale.t('gatewayModel.col.gateway') }}</span>
          <span class="column-head-actions">
            <cds-button-action
              shape="filter"
              :expanded="hasFilter('GATEWAY')"
              :aria-label="
                locale
                  .t('gatewayModel.filter')
                  .replace('{column}', locale.t('gatewayModel.col.gateway'))
              "
              @click="(event: MouseEvent) => openFilterMenu('GATEWAY', event)"
            ></cds-button-action>
          </span>
        </div>
      </cds-grid-column>
      <cds-grid-column width="20%">
        <div class="column-head">
          <span>{{ locale.t('gatewayModel.col.models') }}</span>
          <span class="column-head-actions">
            <cds-button-action
              shape="filter"
              :expanded="hasFilter('MODELS')"
              :aria-label="
                locale
                  .t('gatewayModel.filter')
                  .replace('{column}', locale.t('gatewayModel.col.models'))
              "
              @click="(event: MouseEvent) => openFilterMenu('MODELS', event)"
            ></cds-button-action>
          </span>
        </div>
      </cds-grid-column>
      <cds-grid-column width="13%">
        <div class="column-head">
          <span>{{ locale.t('gatewayModel.col.strategy') }}</span>
        </div>
      </cds-grid-column>
      <cds-grid-column width="12%">
        <div class="column-head">
          <span>{{ locale.t('gatewayModel.col.createdAt') }}</span>
        </div>
      </cds-grid-column>
      <cds-grid-column width="12%">
        <div class="column-head">
          <span>{{ locale.t('gatewayModel.col.updatedAt') }}</span>
        </div>
      </cds-grid-column>
      <cds-grid-column width="13%">{{ locale.t('gatewayModel.col.actions') }}</cds-grid-column>

      <cds-grid-row v-for="route in visibleRoutes" :key="route.id">
        <cds-grid-cell>
          <input
            type="checkbox"
            class="app-checkbox"
            :checked="selectedIds.has(route.id)"
            :aria-label="locale.t('gatewayModel.col.selectRoute').replace('{name}', route.name)"
            @change="toggleSelect(route.id, ($event.target as HTMLInputElement).checked)"
          />
        </cds-grid-cell>
        <cds-grid-cell>
          <strong class="route-name" :title="route.name">{{ route.name }}</strong>
        </cds-grid-cell>
        <cds-grid-cell>
          <span class="gateway-name" :title="route.modelGateway.name">
            {{ route.modelGateway.name }}
          </span>
        </cds-grid-cell>
        <cds-grid-cell>
          <div class="models-cell" :title="route.supportedModels.join(', ')">
            <cds-badge
              v-for="model in route.supportedModels.slice(0, MODELS_VISIBLE_LIMIT)"
              :key="model"
              status="neutral"
              class="model-badge"
            >
              {{ model }}
            </cds-badge>
            <button
              v-if="route.supportedModels.length > MODELS_VISIBLE_LIMIT"
              type="button"
              class="model-overflow"
              :aria-label="`${locale.t('gatewayModel.col.models')}: +${
                route.supportedModels.length - MODELS_VISIBLE_LIMIT
              }`"
            >
              +{{ route.supportedModels.length - MODELS_VISIBLE_LIMIT }}
            </button>
          </div>
        </cds-grid-cell>
        <cds-grid-cell>
          <span class="strategy-cell">{{
            locale.t(`gatewayModel.strategy.${route.strategy}`)
          }}</span>
        </cds-grid-cell>
        <cds-grid-cell>
          <span class="time-cell" :title="route.createdAt">
            {{ formatTimestamp(route.createdAt) }}
          </span>
        </cds-grid-cell>
        <cds-grid-cell>
          <span class="time-cell" :title="route.updatedAt">
            {{ formatTimestamp(route.updatedAt) }}
          </span>
        </cds-grid-cell>
        <cds-grid-cell>
          <div class="row-actions">
            <button
              v-if="auth.role === 'admin'"
              type="button"
              class="row-action"
              :title="locale.t('gatewayModel.action.edit')"
              @click="openEdit(route)"
            >
              <cds-icon shape="pencil" size="sm"></cds-icon>
              <span>{{ locale.t('gatewayModel.action.edit') }}</span>
            </button>
          </div>
        </cds-grid-cell>
      </cds-grid-row>

      <cds-grid-placeholder v-if="visibleRoutes.length === 0">
        <cds-icon shape="forking" size="xl"></cds-icon>
        <p cds-text="subsection">{{ locale.t('gatewayModel.empty') }}</p>
      </cds-grid-placeholder>

      <cds-grid-footer v-if="totalCount > 0">
        <span v-if="selectedCount > 0" class="selected-summary">
          {{ locale.t('gatewayModel.selected').replace('{count}', String(selectedCount)) }}
        </span>
        <div class="pager">
          <label for="model-route-page-size">{{
            locale.t('gatewayModel.pagination.pageSize')
          }}</label>
          <cds-select control-width="shrink">
            <select
              id="model-route-page-size"
              :value="pageSize"
              :aria-label="locale.t('gatewayModel.pagination.pageSize')"
              @change="onPageSizeChange"
            >
              <option v-for="option in PAGE_SIZE_OPTIONS" :key="option" :value="option">
                {{ option }}
              </option>
            </select>
          </cds-select>
          <span class="pager-summary">{{ summaryText }}</span>
          <cds-pagination :aria-label="locale.t('gatewayModel.pagination.label')">
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
        <cds-input v-if="filterMenuKey === 'NAME'">
          <input
            type="text"
            :value="nameFilter"
            :placeholder="locale.t('gatewayModel.filter.namePlaceholder')"
            :aria-label="locale.t('gatewayModel.filter.namePlaceholder')"
            @input="setTextFilter('NAME', ($event.target as HTMLInputElement).value)"
          />
        </cds-input>

        <cds-input v-else-if="filterMenuKey === 'MODELS'">
          <input
            type="text"
            :value="modelsFilter"
            :placeholder="locale.t('gatewayModel.filter.modelsPlaceholder')"
            :aria-label="locale.t('gatewayModel.filter.modelsPlaceholder')"
            @input="setTextFilter('MODELS', ($event.target as HTMLInputElement).value)"
          />
        </cds-input>

        <div v-else-if="filterMenuKey === 'GATEWAY'" class="filter-options">
          <button
            type="button"
            class="filter-option"
            :class="{ active: gatewayFilter === 'ALL' }"
            @click="setGatewayFilter('ALL')"
          >
            <span>{{ locale.t('gatewayModel.filter.all') }}</span>
            <cds-icon v-if="gatewayFilter === 'ALL'" shape="check" size="sm"></cds-icon>
          </button>
          <button
            v-for="gateway in GATEWAYS"
            :key="gateway.id"
            type="button"
            class="filter-option"
            :class="{ active: gatewayFilter === gateway.id }"
            @click="setGatewayFilter(gateway.id)"
          >
            <span>{{ gateway.name }}</span>
            <cds-icon v-if="gatewayFilter === gateway.id" shape="check" size="sm"></cds-icon>
          </button>
        </div>

        <div v-if="hasFilter(filterMenuKey)" class="filter-footer">
          <cds-button action="outline" size="sm" @click="clearActiveFilter">
            {{ locale.t('gatewayModel.filter.clear') }}
          </cds-button>
        </div>
      </div>
    </cds-dropdown>

    <ModelRouteFormModal
      v-if="formOpen"
      :open="formOpen"
      :route="editingRoute"
      :gateways="GATEWAYS"
      :candidates="shuttleCandidates"
      :candidates-loading="providerResult.loading.value"
      :all-routes="allRoutesForFallback"
      :saving="saving"
      @close="closeForm"
      @submit="submitRoute"
      @gateway-changed="onGatewayChanged"
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
.route-page {
  height: 100%;
  min-height: 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

/* Wrap the cds-grid in a card that owns the horizontal scrollbar —
   same pattern as ModelGatewayView. The card scrolls independently
   of the page header / toolbar / pagination above it, so the title
   stays put while the table extends. */
.route-page .grid-card {
  overflow-x: auto;
  overflow-y: hidden;
  min-width: 0;
  border: 1px solid var(--cds-alias-object-border-color, #d7d7d7);
  border-radius: 6px;
  background: var(--cds-alias-object-container-background, #fff);
  flex-shrink: 0;
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
.route-page cds-grid {
  display: block;
  flex: 1 1 auto;
  min-height: 0;
  min-width: 0;
  max-width: 100%;
  width: 100%;
  /* min-width: 1180px reserves the table's natural width; the
     `.grid-card` wrapper (overflow-x: auto) provides the horizontal
     scrollbar when the viewport drops below this width. */
  min-width: 1180px;
}
/* Force cds-grid columns + cells to shrink below their intrinsic content
   width so the table never overflows the viewport horizontally. Both
   `min-width: 0` (override the custom element default `min-width: auto`)
   and `overflow: hidden` (clip cells whose content is still too wide for
   the column) are needed for this to work reliably. */
.route-page cds-grid-column,
.route-page cds-grid-cell {
  min-width: 0;
  overflow: hidden;
}
/* cds-grid's shadow-DOM `.scroll-container` has `overflow: auto`, so when
   the sum of column widths exceeds the host width (e.g. 36px checkbox
   column + 100% percentage columns = ~1025px on a 990px scroll-container)
   a horizontal scrollbar appears inside the grid even though the page
   itself does not overflow. The fix is the cds-grid `scroll-lock`
   attribute on the `<cds-grid>` element, which sets the inner scroll
   container to `overflow: hidden`. */
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
  gap: 2px;
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
.route-name {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
/* Static text cell for the gateway column. The previous `.gateway-link`
   button-with-popout-icon was removed when the manageGateway action
   left the row menu — read here as plain label text with the same
   overflow ellipsis treatment as the name cell. */
.gateway-name {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
/* Static strategy cell — the inline dropdown editor was removed when
   the uiStrategy field was dropped; the cell now just renders the
   gateway-level strategy as text, matching the visual weight of
   other passive cells in the row. */
.strategy-cell {
  display: inline-block;
  padding: 3px 8px;
  min-height: 28px;
  color: var(--cds-alias-object-app-foreground, #1b1b1b);
}
.filter-panel {
  min-width: 240px;
  padding: 8px;
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
/* Created / updated timestamp cells. Mirrors the same `.time-cell`
   treatment used in ModelGatewayView.vue:743-747 — tabular-nums so the
   digits don't jitter between rows (the column will otherwise reflow
   as digit widths differ), and a slightly muted color so the timestamp
   reads as secondary metadata relative to the route's name and gateway. */
.time-cell {
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  color: var(--cds-alias-typography-color-300, #565656);
  font-size: 12px;
}
/* Model badges cell — same info-blue chip treatment as
   VirtualKeyView's `.model-badge` (VirtualKeyView.vue:2132-2160): a
   soft blue-50 fill with info-blue border + text, replacing the prior
   cds-badge neutral slate (#3a4d55) which clashed with the row's white
   background. Padding bumped from the cds default (~0px inline) to
   14px inline so the text breathes inside the border.

   The cell stays single-row tall (no max-height cap) — the route page
   treats the model list as primary content rather than a per-key
   attribute, so we let rows grow vertically rather than clipping into
   the "+N overflow" affordance unnecessarily. */
.models-cell {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  align-items: center;
}
.model-badge {
  --background: var(--cds-alias-object-app-blue-50, rgba(0, 114, 163, 0.08));
  --border-color: var(--cds-alias-status-info, #0079ad);
  --color: var(--cds-alias-status-info, #0079ad);
  --padding: 0 14px;
  font-size: 11px;
}
/* +N overflow trigger — visual sibling to .model-badge so the two read
   as a continuous treatment. Solid-fill hover so the click affordance
   is obvious. font-weight: 600 keeps the `+N` glyph deliberate. */
.model-overflow {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 1px 8px;
  border: 1px solid var(--cds-alias-status-info, #0079ad);
  border-radius: 3px;
  background: transparent;
  color: var(--cds-alias-status-info, #0079ad);
  font: inherit;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
}
.model-overflow:hover {
  background: var(--cds-alias-status-info, #0079ad);
  color: #fff;
}
.model-overflow:focus-visible {
  outline: 2px solid var(--cds-alias-status-info, #0079ad);
  outline-offset: 1px;
}
.row-actions {
  display: flex;
  align-items: center;
  gap: 4px;
  /* Allow buttons to wrap to a second line when the 操作 column is too
     narrow to hold them all on one row — the alternative (forcing the
     column wider) would push the table beyond the viewport and re-introduce
     the horizontal scrollbar. */
  flex-wrap: wrap;
}
.row-action {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  min-width: 35px;
  padding: 3px 2px;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: var(--cds-alias-object-interaction-color, #006e9c);
  font: inherit;
  cursor: pointer;
}
.row-action:focus-visible {
  outline: 2px solid var(--cds-alias-status-info, #0079ad);
  outline-offset: 1px;
}
.row-action span {
  font-size: 10px;
  line-height: 1.1;
  white-space: nowrap;
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
  animation: route-spin 1s linear infinite;
  transform-origin: center;
}
@keyframes route-spin {
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
