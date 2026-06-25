<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import AppDropdown from '@/components/AppDropdown.vue'
import ModelRouteFormModal from '@/components/ModelRouteFormModal.vue'
import ConfirmDialog from '@/views/user-role/ConfirmDialog.vue'
import { useLocaleStore } from '@/stores/locale'
import { useToast } from '@/composables/useToast'
import type {
  ModelRoute,
  ModelRouteDraft,
  ModelRouteGatewayOption,
  ModelRouteStrategy,
} from '@/types/model-route'
import { MODEL_ROUTE_STRATEGIES } from '@/types/model-route'
import '@/components/icons'

const locale = useLocaleStore()
const toast = useToast()

const GATEWAYS: ModelRouteGatewayOption[] = [
  { id: 'gateway-1', name: 'LiteLLM_Router_1' },
  { id: 'gateway-2', name: 'LiteLLM_Router_2' },
  { id: 'gateway-3', name: 'LiteLLM_Router_3' },
  { id: 'gateway-4', name: 'LiteLLM_Router_4' },
]

const INITIAL_ROUTES: ModelRoute[] = [
  {
    id: 'route-1',
    name: 'global_litellm_router',
    gatewayId: 'gateway-1',
    gatewayName: 'LiteLLM_Router_1',
    strategy: 'ROUND_ROBIN',
    supportedModels: ['gpt-4o', 'llama-3-70b', 'mixtral-8x7b', 'claude-3-sonnet'],
    enabled: true,
    createdAt: '2026-06-11T08:00:00Z',
    updatedAt: '2026-06-24T05:20:00Z',
  },
  {
    id: 'route-2',
    name: 'global_reasoning_router',
    gatewayId: 'gateway-1',
    gatewayName: 'LiteLLM_Router_1',
    strategy: 'WEIGHTED_ROUND_ROBIN',
    supportedModels: ['deepseek-r1', 'mixtral-8x7b', 'claude-3-opus'],
    enabled: true,
    createdAt: '2026-06-12T08:00:00Z',
    updatedAt: '2026-06-24T04:30:00Z',
  },
  {
    id: 'route-3',
    name: 'global_code_router',
    gatewayId: 'gateway-2',
    gatewayName: 'LiteLLM_Router_2',
    strategy: 'ROUND_ROBIN',
    supportedModels: ['gpt-4.1', 'claude-3.7-sonnet', 'qwen2.5-coder'],
    enabled: false,
    createdAt: '2026-06-13T08:00:00Z',
    updatedAt: '2026-06-23T11:10:00Z',
  },
  {
    id: 'route-4',
    name: 'global_chat_router',
    gatewayId: 'gateway-3',
    gatewayName: 'LiteLLM_Router_3',
    strategy: 'RANDOM',
    supportedModels: ['claude-3.5-sonnet', 'gemini-2.5-pro', 'gpt-4o-mini'],
    enabled: false,
    createdAt: '2026-06-14T08:00:00Z',
    updatedAt: '2026-06-22T09:40:00Z',
  },
  {
    id: 'route-5',
    name: 'image_generation_router',
    gatewayId: 'gateway-2',
    gatewayName: 'LiteLLM_Router_2',
    strategy: 'WEIGHTED_ROUND_ROBIN',
    supportedModels: ['gpt-image-1', 'flux-1.1-pro', 'imagen-3'],
    enabled: true,
    createdAt: '2026-06-15T08:00:00Z',
    updatedAt: '2026-06-24T03:15:00Z',
  },
  {
    id: 'route-6',
    name: 'embedding_router',
    gatewayId: 'gateway-4',
    gatewayName: 'LiteLLM_Router_4',
    strategy: 'ROUND_ROBIN',
    supportedModels: ['text-embedding-3-large', 'bge-m3'],
    enabled: true,
    createdAt: '2026-06-16T08:00:00Z',
    updatedAt: '2026-06-24T02:45:00Z',
  },
  {
    id: 'route-7',
    name: 'china_region_router',
    gatewayId: 'gateway-4',
    gatewayName: 'LiteLLM_Router_4',
    strategy: 'RANDOM',
    supportedModels: ['qwen-max', 'deepseek-v3', 'glm-4-plus'],
    enabled: true,
    createdAt: '2026-06-17T08:00:00Z',
    updatedAt: '2026-06-23T16:20:00Z',
  },
  {
    id: 'route-8',
    name: 'fallback_router',
    gatewayId: 'gateway-3',
    gatewayName: 'LiteLLM_Router_3',
    strategy: 'ROUND_ROBIN',
    supportedModels: ['gpt-4o-mini', 'claude-3-haiku', 'llama-3.1-8b'],
    enabled: false,
    createdAt: '2026-06-18T08:00:00Z',
    updatedAt: '2026-06-21T07:00:00Z',
  },
  {
    id: 'route-9',
    name: 'document_analysis_router',
    gatewayId: 'gateway-2',
    gatewayName: 'LiteLLM_Router_2',
    strategy: 'WEIGHTED_ROUND_ROBIN',
    supportedModels: ['gemini-2.5-pro', 'claude-3.7-sonnet'],
    enabled: true,
    createdAt: '2026-06-19T08:00:00Z',
    updatedAt: '2026-06-23T03:30:00Z',
  },
  {
    id: 'route-10',
    name: 'fast_response_router',
    gatewayId: 'gateway-1',
    gatewayName: 'LiteLLM_Router_1',
    strategy: 'RANDOM',
    supportedModels: ['gpt-4o-mini', 'gemini-2.0-flash'],
    enabled: true,
    createdAt: '2026-06-20T08:00:00Z',
    updatedAt: '2026-06-24T01:00:00Z',
  },
  {
    id: 'route-11',
    name: 'batch_processing_router',
    gatewayId: 'gateway-3',
    gatewayName: 'LiteLLM_Router_3',
    strategy: 'ROUND_ROBIN',
    supportedModels: ['llama-3.1-70b', 'mixtral-8x7b'],
    enabled: true,
    createdAt: '2026-06-21T08:00:00Z',
    updatedAt: '2026-06-23T05:40:00Z',
  },
  {
    id: 'route-12',
    name: 'sandbox_router',
    gatewayId: 'gateway-4',
    gatewayName: 'LiteLLM_Router_4',
    strategy: 'RANDOM',
    supportedModels: ['llama-3.1-8b', 'qwen2.5-7b'],
    enabled: false,
    createdAt: '2026-06-22T08:00:00Z',
    updatedAt: '2026-06-22T08:00:00Z',
  },
]

const PAGE_SIZE_OPTIONS = [10, 20, 50] as const
const STATUS_FILTER_OPTIONS = ['ALL', 'ENABLED', 'DISABLED'] as const
type PageSize = (typeof PAGE_SIZE_OPTIONS)[number]
type BatchAction = 'enable' | 'disable' | 'delete'
type RouteSortField = 'NAME' | 'GATEWAY' | 'STRATEGY' | 'MODELS' | 'STATUS'
type SortDirection = 'ASC' | 'DESC'
type RouteFilterKey = RouteSortField

const routes = ref<ModelRoute[]>(INITIAL_ROUTES.map((route) => ({ ...route })))
const selectedIds = ref<Set<string>>(new Set())
const pageSize = ref<PageSize>(10)
const currentPage = ref(1)
const loading = ref(false)
const formOpen = ref(false)
const editingRoute = ref<ModelRoute | null>(null)
const saving = ref(false)
const pendingDeleteIds = ref<string[]>([])
const strategyMenuAnchor = ref<HTMLElement | null>(null)
const strategyMenuTarget = ref<ModelRoute | null>(null)
const sortField = ref<RouteSortField | null>(null)
const sortDirection = ref<SortDirection>('ASC')
const nameFilter = ref('')
const gatewayFilter = ref('ALL')
const strategyFilter = ref<'ALL' | ModelRouteStrategy>('ALL')
const modelsFilter = ref('')
const statusFilter = ref<'ALL' | 'ENABLED' | 'DISABLED'>('ALL')
const filterMenuAnchor = ref<HTMLElement | null>(null)
const filterMenuKey = ref<RouteFilterKey | null>(null)
let nextRouteId = 13
let refreshTimer: ReturnType<typeof setTimeout> | null = null

const filteredRoutes = computed(() => {
  const nameKeyword = nameFilter.value.trim().toLocaleLowerCase()
  const modelsKeyword = modelsFilter.value.trim().toLocaleLowerCase()
  const filtered = routes.value.filter((route) => {
    if (nameKeyword && !route.name.toLocaleLowerCase().includes(nameKeyword)) return false
    if (gatewayFilter.value !== 'ALL' && route.gatewayId !== gatewayFilter.value) return false
    if (strategyFilter.value !== 'ALL' && route.strategy !== strategyFilter.value) return false
    if (
      modelsKeyword &&
      !route.supportedModels.some((model) => model.toLocaleLowerCase().includes(modelsKeyword))
    ) {
      return false
    }
    if (statusFilter.value === 'ENABLED' && !route.enabled) return false
    if (statusFilter.value === 'DISABLED' && route.enabled) return false
    return true
  })

  if (!sortField.value) return filtered
  const direction = sortDirection.value === 'ASC' ? 1 : -1
  return [...filtered].sort((left, right) => {
    const valueFor = (route: ModelRoute): string | number => {
      if (sortField.value === 'NAME') return route.name
      if (sortField.value === 'GATEWAY') return route.gatewayName
      if (sortField.value === 'STRATEGY') return route.strategy
      if (sortField.value === 'MODELS') return route.supportedModels.join(' ')
      return route.enabled ? 1 : 0
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
    .t('modelRoute.pagination.summary')
    .replace('{start}', String(start))
    .replace('{end}', String(end))
    .replace('{total}', String(totalCount.value))
})
const deleteDialogTitle = computed(() =>
  pendingDeleteIds.value.length > 1
    ? locale.t('modelRoute.confirm.batchDeleteTitle')
    : locale.t('modelRoute.confirm.deleteTitle'),
)
const deleteDialogBody = computed(() => {
  if (pendingDeleteIds.value.length > 1) {
    return locale
      .t('modelRoute.confirm.batchDeleteBody')
      .replace('{count}', String(pendingDeleteIds.value.length))
  }
  const target = routes.value.find((route) => route.id === pendingDeleteIds.value[0])
  return locale.t('modelRoute.confirm.deleteBody').replace('{name}', target?.name ?? '')
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
  for (const route of visibleRoutes.value) {
    if (checked) next.add(route.id)
    else next.delete(route.id)
  }
  selectedIds.value = next
}

function openCreate() {
  editingRoute.value = null
  formOpen.value = true
}

function openEdit(route: ModelRoute) {
  editingRoute.value = route
  formOpen.value = true
}

function closeForm() {
  if (saving.value) return
  formOpen.value = false
  editingRoute.value = null
}

function submitRoute(draft: ModelRouteDraft) {
  if (saving.value) return
  saving.value = true
  const now = new Date().toISOString()
  if (editingRoute.value) {
    const id = editingRoute.value.id
    routes.value = routes.value.map((route) =>
      route.id === id ? { ...route, ...draft, updatedAt: now } : route,
    )
    toast.success(locale.t('modelRoute.toast.updated'))
  } else {
    routes.value = [
      {
        id: `route-${nextRouteId++}`,
        ...draft,
        createdAt: now,
        updatedAt: now,
      },
      ...routes.value,
    ]
    currentPage.value = 1
    toast.success(locale.t('modelRoute.toast.created'))
  }
  saving.value = false
  formOpen.value = false
  editingRoute.value = null
}

function changeStrategy(route: ModelRoute, value: string) {
  const strategy = value as ModelRouteStrategy
  if (!MODEL_ROUTE_STRATEGIES.includes(strategy)) return
  routes.value = routes.value.map((item) =>
    item.id === route.id ? { ...item, strategy, updatedAt: new Date().toISOString() } : item,
  )
  toast.success(locale.t('modelRoute.toast.strategyUpdated').replace('{name}', route.name))
}

function openStrategyMenu(route: ModelRoute, event: MouseEvent) {
  closeFilterMenu()
  strategyMenuTarget.value = route
  strategyMenuAnchor.value = event.currentTarget as HTMLElement
}

function closeStrategyMenu() {
  strategyMenuAnchor.value = null
  strategyMenuTarget.value = null
}

function chooseStrategy(strategy: ModelRouteStrategy) {
  if (!strategyMenuTarget.value) return
  changeStrategy(strategyMenuTarget.value, strategy)
  closeStrategyMenu()
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
  closeStrategyMenu()
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
  if (key === 'STRATEGY') return strategyFilter.value !== 'ALL'
  if (key === 'MODELS') return Boolean(modelsFilter.value.trim())
  return statusFilter.value !== 'ALL'
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

function setStrategyFilter(value: 'ALL' | ModelRouteStrategy) {
  strategyFilter.value = value
  currentPage.value = 1
  closeFilterMenu()
}

function setStatusFilter(value: 'ALL' | 'ENABLED' | 'DISABLED') {
  statusFilter.value = value
  currentPage.value = 1
  closeFilterMenu()
}

function clearActiveFilter() {
  if (filterMenuKey.value === 'NAME') nameFilter.value = ''
  else if (filterMenuKey.value === 'GATEWAY') gatewayFilter.value = 'ALL'
  else if (filterMenuKey.value === 'STRATEGY') strategyFilter.value = 'ALL'
  else if (filterMenuKey.value === 'MODELS') modelsFilter.value = ''
  else if (filterMenuKey.value === 'STATUS') statusFilter.value = 'ALL'
  currentPage.value = 1
  closeFilterMenu()
}

function setEnabled(ids: string[], enabled: boolean) {
  const idSet = new Set(ids)
  routes.value = routes.value.map((route) =>
    idSet.has(route.id) ? { ...route, enabled, updatedAt: new Date().toISOString() } : route,
  )
  toast.success(
    locale
      .t(enabled ? 'modelRoute.toast.enabled' : 'modelRoute.toast.disabled')
      .replace('{count}', String(ids.length)),
  )
}

function toggleEnabled(route: ModelRoute) {
  setEnabled([route.id], !route.enabled)
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

function requestDelete(route: ModelRoute) {
  pendingDeleteIds.value = [route.id]
}

function closeDelete() {
  pendingDeleteIds.value = []
}

function confirmDelete() {
  const ids = new Set(pendingDeleteIds.value)
  const count = ids.size
  routes.value = routes.value.filter((route) => !ids.has(route.id))
  selectedIds.value = new Set([...selectedIds.value].filter((id) => !ids.has(id)))
  pendingDeleteIds.value = []
  if (currentPage.value > totalPages.value) currentPage.value = totalPages.value
  toast.success(locale.t('modelRoute.toast.deleted').replace('{count}', String(count)))
}

function manageGateway(route: ModelRoute) {
  toast.info(locale.t('modelRoute.toast.manageGateway').replace('{name}', route.gatewayName))
}

function refreshRoutes() {
  if (loading.value) return
  loading.value = true
  if (refreshTimer) clearTimeout(refreshTimer)
  refreshTimer = setTimeout(() => {
    loading.value = false
    toast.success(locale.t('modelRoute.toast.refreshed'))
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
  <section class="route-page">
    <header class="page-head">
      <h1 cds-text="title" class="heading">{{ locale.t('modelRoute.title') }}</h1>
      <p cds-text="body" class="desc muted">{{ locale.t('modelRoute.description') }}</p>
    </header>

    <div class="toolbar">
      <cds-button action="outline" status="primary" @click="openCreate">
        <cds-icon shape="plus-circle" size="sm" aria-hidden="true"></cds-icon>
        {{ locale.t('modelRoute.action.create') }}
      </cds-button>

      <AppDropdown align="start" :disabled="selectedCount === 0">
        <template #trigger>
          <cds-button
            action="outline"
            :disabled="selectedCount === 0"
            :title="selectedCount === 0 ? locale.t('modelRoute.batch.disabled') : undefined"
          >
            <cds-icon shape="cog" size="sm" aria-hidden="true"></cds-icon>
            {{ locale.t('modelRoute.action.batch') }}
            <cds-icon shape="angle" direction="down" size="sm" aria-hidden="true"></cds-icon>
          </cds-button>
        </template>
        <template #default="{ close }">
          <button class="menu-option" type="button" @click="performBatch('enable', close)">
            <cds-icon shape="check-circle" size="sm" aria-hidden="true"></cds-icon>
            {{ locale.t('modelRoute.batch.enable') }}
          </button>
          <button class="menu-option" type="button" @click="performBatch('disable', close)">
            <cds-icon shape="ban" size="sm" aria-hidden="true"></cds-icon>
            {{ locale.t('modelRoute.batch.disable') }}
          </button>
          <button class="menu-option danger" type="button" @click="performBatch('delete', close)">
            <cds-icon shape="trash" size="sm" aria-hidden="true"></cds-icon>
            {{ locale.t('modelRoute.batch.delete') }}
          </button>
        </template>
      </AppDropdown>

      <cds-button
        action="ghost"
        class="refresh-button"
        :disabled="loading"
        :aria-label="locale.t('modelRoute.action.refresh')"
        :title="locale.t('modelRoute.action.refresh')"
        @click="refreshRoutes"
      >
        <cds-icon
          shape="refresh"
          size="md"
          :class="{ spinning: loading }"
          aria-hidden="true"
        ></cds-icon>
        <span>{{ locale.t('modelRoute.action.refresh') }}</span>
      </cds-button>
    </div>

    <div class="grid-card">
      <cds-grid
        border="row"
        column-layout="flex"
        role="grid"
        :aria-label="locale.t('modelRoute.table.label')"
      >
        <cds-grid-column type="action" :resizable="false">
          <input
            type="checkbox"
            class="app-checkbox"
            :checked="allVisibleSelected"
            :aria-label="locale.t('modelRoute.col.selectAll')"
            @change="toggleSelectAll(($event.target as HTMLInputElement).checked)"
          />
        </cds-grid-column>
        <cds-grid-column width="18%">
          <div class="column-head">
            <span>{{ locale.t('modelRoute.col.name') }}</span>
            <span class="column-head-actions">
              <cds-button-action
                :aria-label="
                  locale.t('modelRoute.sort').replace('{column}', locale.t('modelRoute.col.name'))
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
                  locale.t('modelRoute.filter').replace('{column}', locale.t('modelRoute.col.name'))
                "
                @click="(event: MouseEvent) => openFilterMenu('NAME', event)"
              ></cds-button-action>
            </span>
          </div>
        </cds-grid-column>
        <cds-grid-column width="18%">
          <div class="column-head">
            <span>{{ locale.t('modelRoute.col.gateway') }}</span>
            <span class="column-head-actions">
              <cds-button-action
                :aria-label="
                  locale
                    .t('modelRoute.sort')
                    .replace('{column}', locale.t('modelRoute.col.gateway'))
                "
                @click="toggleSort('GATEWAY')"
              >
                <cds-icon
                  v-if="sortStateFor('GATEWAY') === 'ascending'"
                  shape="angle"
                  direction="up"
                  size="sm"
                ></cds-icon>
                <cds-icon
                  v-else-if="sortStateFor('GATEWAY') === 'descending'"
                  shape="angle"
                  direction="down"
                  size="sm"
                ></cds-icon>
                <cds-icon v-else shape="two-way-arrows" class="sort-idle" size="sm"></cds-icon>
              </cds-button-action>
              <cds-button-action
                shape="filter"
                :expanded="hasFilter('GATEWAY')"
                :aria-label="
                  locale
                    .t('modelRoute.filter')
                    .replace('{column}', locale.t('modelRoute.col.gateway'))
                "
                @click="(event: MouseEvent) => openFilterMenu('GATEWAY', event)"
              ></cds-button-action>
            </span>
          </div>
        </cds-grid-column>
        <cds-grid-column width="17%">
          <div class="column-head">
            <span>{{ locale.t('modelRoute.col.strategy') }}</span>
            <span class="column-head-actions">
              <cds-button-action
                :aria-label="
                  locale
                    .t('modelRoute.sort')
                    .replace('{column}', locale.t('modelRoute.col.strategy'))
                "
                @click="toggleSort('STRATEGY')"
              >
                <cds-icon
                  v-if="sortStateFor('STRATEGY') === 'ascending'"
                  shape="angle"
                  direction="up"
                  size="sm"
                ></cds-icon>
                <cds-icon
                  v-else-if="sortStateFor('STRATEGY') === 'descending'"
                  shape="angle"
                  direction="down"
                  size="sm"
                ></cds-icon>
                <cds-icon v-else shape="two-way-arrows" class="sort-idle" size="sm"></cds-icon>
              </cds-button-action>
              <cds-button-action
                shape="filter"
                :expanded="hasFilter('STRATEGY')"
                :aria-label="
                  locale
                    .t('modelRoute.filter')
                    .replace('{column}', locale.t('modelRoute.col.strategy'))
                "
                @click="(event: MouseEvent) => openFilterMenu('STRATEGY', event)"
              ></cds-button-action>
            </span>
          </div>
        </cds-grid-column>
        <cds-grid-column width="20%">
          <div class="column-head">
            <span>{{ locale.t('modelRoute.col.models') }}</span>
            <span class="column-head-actions">
              <cds-button-action
                :aria-label="
                  locale.t('modelRoute.sort').replace('{column}', locale.t('modelRoute.col.models'))
                "
                @click="toggleSort('MODELS')"
              >
                <cds-icon
                  v-if="sortStateFor('MODELS') === 'ascending'"
                  shape="angle"
                  direction="up"
                  size="sm"
                ></cds-icon>
                <cds-icon
                  v-else-if="sortStateFor('MODELS') === 'descending'"
                  shape="angle"
                  direction="down"
                  size="sm"
                ></cds-icon>
                <cds-icon v-else shape="two-way-arrows" class="sort-idle" size="sm"></cds-icon>
              </cds-button-action>
              <cds-button-action
                shape="filter"
                :expanded="hasFilter('MODELS')"
                :aria-label="
                  locale
                    .t('modelRoute.filter')
                    .replace('{column}', locale.t('modelRoute.col.models'))
                "
                @click="(event: MouseEvent) => openFilterMenu('MODELS', event)"
              ></cds-button-action>
            </span>
          </div>
        </cds-grid-column>
        <cds-grid-column width="9%">
          <div class="column-head">
            <span>{{ locale.t('modelRoute.col.status') }}</span>
            <span class="column-head-actions">
              <cds-button-action
                :aria-label="
                  locale.t('modelRoute.sort').replace('{column}', locale.t('modelRoute.col.status'))
                "
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
                :aria-label="
                  locale
                    .t('modelRoute.filter')
                    .replace('{column}', locale.t('modelRoute.col.status'))
                "
                @click="(event: MouseEvent) => openFilterMenu('STATUS', event)"
              ></cds-button-action>
            </span>
          </div>
        </cds-grid-column>
        <cds-grid-column width="18%">{{ locale.t('modelRoute.col.actions') }}</cds-grid-column>

        <cds-grid-row v-for="route in visibleRoutes" :key="route.id">
          <cds-grid-cell>
            <input
              type="checkbox"
              class="app-checkbox"
              :checked="selectedIds.has(route.id)"
              :aria-label="locale.t('modelRoute.col.selectRoute').replace('{name}', route.name)"
              @change="toggleSelect(route.id, ($event.target as HTMLInputElement).checked)"
            />
          </cds-grid-cell>
          <cds-grid-cell>
            <strong class="route-name" :title="route.name">{{ route.name }}</strong>
          </cds-grid-cell>
          <cds-grid-cell>
            <button type="button" class="gateway-link" @click="manageGateway(route)">
              {{ route.gatewayName }}
              <cds-icon shape="pop-out" size="sm" aria-hidden="true"></cds-icon>
            </button>
          </cds-grid-cell>
          <cds-grid-cell>
            <button
              type="button"
              class="strategy-trigger"
              aria-haspopup="menu"
              :aria-expanded="strategyMenuTarget?.id === route.id"
              :aria-label="
                locale.t('modelRoute.action.changeStrategy').replace('{name}', route.name)
              "
              @click="(event: MouseEvent) => openStrategyMenu(route, event)"
            >
              <span>{{ locale.t(`modelRoute.strategy.${route.strategy}`) }}</span>
              <cds-icon shape="angle" direction="down" size="sm" aria-hidden="true"></cds-icon>
            </button>
          </cds-grid-cell>
          <cds-grid-cell>
            <div class="model-list" :title="route.supportedModels.join(', ')">
              <span v-for="model in route.supportedModels.slice(0, 3)" :key="model">{{
                model
              }}</span>
              <span v-if="route.supportedModels.length > 3" class="more-models">
                +{{ route.supportedModels.length - 3 }}
              </span>
            </div>
          </cds-grid-cell>
          <cds-grid-cell>
            <cds-badge :status="route.enabled ? 'success' : 'neutral'" class="status-badge">
              <cds-icon
                :shape="route.enabled ? 'check-circle' : 'ban'"
                size="sm"
                aria-hidden="true"
              ></cds-icon>
              {{
                locale.t(route.enabled ? 'modelRoute.status.enabled' : 'modelRoute.status.disabled')
              }}
            </cds-badge>
          </cds-grid-cell>
          <cds-grid-cell>
            <div class="row-actions">
              <button
                type="button"
                class="row-action"
                :title="
                  locale.t(route.enabled ? 'modelRoute.action.disable' : 'modelRoute.action.enable')
                "
                @click="toggleEnabled(route)"
              >
                <cds-icon :shape="route.enabled ? 'ban' : 'check-circle'" size="sm"></cds-icon>
                <span>{{
                  locale.t(route.enabled ? 'modelRoute.action.disable' : 'modelRoute.action.enable')
                }}</span>
              </button>
              <button
                type="button"
                class="row-action"
                :title="locale.t('modelRoute.action.edit')"
                @click="openEdit(route)"
              >
                <cds-icon shape="pencil" size="sm"></cds-icon>
                <span>{{ locale.t('modelRoute.action.edit') }}</span>
              </button>
              <button
                type="button"
                class="row-action"
                :title="locale.t('modelRoute.action.manage')"
                @click="manageGateway(route)"
              >
                <cds-icon shape="cog" size="sm"></cds-icon>
                <span>{{ locale.t('modelRoute.action.manage') }}</span>
              </button>
              <button
                type="button"
                class="row-action danger"
                :title="locale.t('modelRoute.action.delete')"
                @click="requestDelete(route)"
              >
                <cds-icon shape="trash" size="sm"></cds-icon>
                <span>{{ locale.t('modelRoute.action.delete') }}</span>
              </button>
            </div>
          </cds-grid-cell>
        </cds-grid-row>

        <cds-grid-placeholder v-if="visibleRoutes.length === 0">
          <cds-icon shape="forking" size="xl"></cds-icon>
          <p cds-text="subsection">{{ locale.t('modelRoute.empty') }}</p>
          <cds-button action="outline" size="sm" @click="openCreate">
            {{ locale.t('modelRoute.action.create') }}
          </cds-button>
        </cds-grid-placeholder>

        <cds-grid-footer v-if="totalCount > 0">
          <span v-if="selectedCount > 0" class="selected-summary">
            {{ locale.t('modelRoute.selected').replace('{count}', String(selectedCount)) }}
          </span>
          <div class="pager">
            <label for="model-route-page-size">{{
              locale.t('modelRoute.pagination.pageSize')
            }}</label>
            <cds-select control-width="shrink">
              <select
                id="model-route-page-size"
                :value="pageSize"
                :aria-label="locale.t('modelRoute.pagination.pageSize')"
                @change="onPageSizeChange"
              >
                <option v-for="option in PAGE_SIZE_OPTIONS" :key="option" :value="option">
                  {{ option }}
                </option>
              </select>
            </cds-select>
            <span class="pager-summary">{{ summaryText }}</span>
            <cds-pagination :aria-label="locale.t('modelRoute.pagination.label')">
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
      v-if="strategyMenuAnchor && strategyMenuTarget"
      :hidden="false"
      :anchor="strategyMenuAnchor"
      closable
      @closeChange="closeStrategyMenu"
    >
      <div class="strategy-menu" role="menu">
        <button
          v-for="strategy in MODEL_ROUTE_STRATEGIES"
          :key="strategy"
          type="button"
          class="strategy-menu-option"
          :class="{ active: strategyMenuTarget.strategy === strategy }"
          role="menuitemradio"
          :aria-checked="strategyMenuTarget.strategy === strategy"
          @click="chooseStrategy(strategy)"
        >
          <span>{{ locale.t(`modelRoute.strategy.${strategy}`) }}</span>
          <cds-icon
            v-if="strategyMenuTarget.strategy === strategy"
            shape="check"
            size="sm"
            aria-hidden="true"
          ></cds-icon>
        </button>
      </div>
    </cds-dropdown>

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
            :placeholder="locale.t('modelRoute.filter.namePlaceholder')"
            :aria-label="locale.t('modelRoute.filter.namePlaceholder')"
            @input="setTextFilter('NAME', ($event.target as HTMLInputElement).value)"
          />
        </cds-input>

        <cds-input v-else-if="filterMenuKey === 'MODELS'">
          <input
            type="text"
            :value="modelsFilter"
            :placeholder="locale.t('modelRoute.filter.modelsPlaceholder')"
            :aria-label="locale.t('modelRoute.filter.modelsPlaceholder')"
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
            <span>{{ locale.t('modelRoute.filter.all') }}</span>
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

        <div v-else-if="filterMenuKey === 'STRATEGY'" class="filter-options">
          <button
            type="button"
            class="filter-option"
            :class="{ active: strategyFilter === 'ALL' }"
            @click="setStrategyFilter('ALL')"
          >
            <span>{{ locale.t('modelRoute.filter.all') }}</span>
            <cds-icon v-if="strategyFilter === 'ALL'" shape="check" size="sm"></cds-icon>
          </button>
          <button
            v-for="strategy in MODEL_ROUTE_STRATEGIES"
            :key="strategy"
            type="button"
            class="filter-option"
            :class="{ active: strategyFilter === strategy }"
            @click="setStrategyFilter(strategy)"
          >
            <span>{{ locale.t(`modelRoute.strategy.${strategy}`) }}</span>
            <cds-icon v-if="strategyFilter === strategy" shape="check" size="sm"></cds-icon>
          </button>
        </div>

        <div v-else-if="filterMenuKey === 'STATUS'" class="filter-options">
          <button
            v-for="status in STATUS_FILTER_OPTIONS"
            :key="status"
            type="button"
            class="filter-option"
            :class="{ active: statusFilter === status }"
            @click="setStatusFilter(status)"
          >
            <span>{{ locale.t(`modelRoute.filter.status.${status}`) }}</span>
            <cds-icon v-if="statusFilter === status" shape="check" size="sm"></cds-icon>
          </button>
        </div>

        <div v-if="hasFilter(filterMenuKey)" class="filter-footer">
          <cds-button action="outline" size="sm" @click="clearActiveFilter">
            {{ locale.t('modelRoute.filter.clear') }}
          </cds-button>
        </div>
      </div>
    </cds-dropdown>

    <ModelRouteFormModal
      v-if="formOpen"
      :open="formOpen"
      :route="editingRoute"
      :gateways="GATEWAYS"
      :saving="saving"
      @close="closeForm"
      @submit="submitRoute"
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
.grid-card {
  flex: 1 1 auto;
  min-height: 0;
  min-width: 0;
  overflow: auto;
  border: 1px solid var(--cds-alias-object-border-color, #d7d7d7);
  border-radius: 6px;
  background: var(--cds-alias-object-container-background, #fff);
}
.route-page cds-grid {
  display: block;
  width: 100%;
  min-width: 900px;
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
.gateway-link {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  max-width: 100%;
  padding: 0;
  overflow: hidden;
  border: 0;
  background: transparent;
  color: var(--cds-alias-object-interaction-color, #0072a3);
  font: inherit;
  text-overflow: ellipsis;
  white-space: nowrap;
  cursor: pointer;
}
.gateway-link:hover {
  text-decoration: underline;
}
.strategy-trigger {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  width: 100%;
  min-width: 128px;
  min-height: 28px;
  padding: 3px 8px;
  border: 0;
  border-bottom: 1px solid var(--cds-alias-object-border-color, #9a9a9a);
  background: transparent;
  color: var(--cds-alias-object-app-foreground, #1b1b1b);
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.strategy-trigger:hover,
.strategy-trigger[aria-expanded='true'] {
  border-bottom-color: var(--cds-alias-object-interaction-color, #0072a3);
  background: var(--cds-alias-object-app-background, #f4f4f4);
}
.strategy-trigger:focus-visible {
  outline: 2px solid var(--cds-alias-status-info, #0079ad);
  outline-offset: 1px;
}
.strategy-menu {
  min-width: 180px;
  padding: 4px 0;
}
.strategy-menu-option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  width: 100%;
  padding: 8px 12px;
  border: 0;
  background: transparent;
  color: var(--cds-alias-object-app-foreground, #1b1b1b);
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.strategy-menu-option:hover,
.strategy-menu-option.active {
  background: var(--cds-alias-object-app-background, #f4f4f4);
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
.model-list {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  max-height: 48px;
  overflow: hidden;
}
.model-list > span {
  padding: 2px 6px;
  border-radius: 3px;
  background: var(--cds-alias-object-app-background, #f3f6f8);
  color: var(--cds-alias-typography-color-400, #313131);
  font-size: 11px;
  line-height: 1.4;
  white-space: nowrap;
}
.model-list .more-models {
  color: var(--cds-alias-object-interaction-color, #0072a3);
}
.status-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-width: 64px;
  white-space: nowrap;
}
.row-actions {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-wrap: nowrap;
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
.row-action:hover {
  background: var(--cds-alias-object-app-background, #f4f4f4);
}
.row-action:focus-visible,
.gateway-link:focus-visible {
  outline: 2px solid var(--cds-alias-status-info, #0079ad);
  outline-offset: 1px;
}
.row-action span {
  font-size: 10px;
  line-height: 1.1;
  white-space: nowrap;
}
.row-action.danger {
  color: var(--cds-alias-status-danger, #c92100);
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
