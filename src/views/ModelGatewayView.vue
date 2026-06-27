<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useQuery } from '@vue/apollo-composable'
import { apolloClient } from '@/api/graphql/client'
import {
  CREATE_MODEL_GATEWAY,
  DELETE_MODEL_GATEWAY,
  MODEL_GATEWAYS_QUERY,
  TEST_MODEL_GATEWAY_CONNECTION,
  UPDATE_MODEL_GATEWAY,
} from '@/api/graphql/queries/model-gateways'
import type {
  CreateModelGatewayResult,
  CreateModelGatewayVars,
  DeleteModelGatewayResult,
  DeleteModelGatewayVars,
  ModelGateway,
  ModelGatewayFilterInput,
  ModelGatewayInput,
  ModelGatewaySort,
  ModelGatewaySortField,
  ModelGatewaysQueryResult,
  ModelGatewaysQueryVars,
  PageInput,
  TestModelGatewayConnectionResult,
  TestModelGatewayConnectionVars,
  UpdateModelGatewayResult,
  UpdateModelGatewayVars,
} from '@/types/model-gateway'
import { useLocaleStore } from '@/stores/locale'
import { useToast } from '@/composables/useToast'
import AppDropdown from '@/components/AppDropdown.vue'
import ModelGatewayFormModal from '@/components/ModelGatewayFormModal.vue'
import ConfirmDeleteModal from '@/components/ConfirmDeleteModal.vue'
import '@/components/icons'

const locale = useLocaleStore()
const toast = useToast()

const PAGE_SIZE_OPTIONS = [10, 20, 50, 100] as const
type PageSize = (typeof PAGE_SIZE_OPTIONS)[number]
const pageSize = ref<PageSize>(10)
const nameKeyword = ref('')
const sort = ref<ModelGatewaySort | null>(null)
const currentPage = ref(1)

/* ---------- Sort cycle ---------- */
type SortState = 'none' | 'ascending' | 'descending'

function sortStateFor(field: ModelGatewaySortField): SortState {
  if (!sort.value || sort.value.field !== field) return 'none'
  return sort.value.direction === 'ASC' ? 'ascending' : 'descending'
}

function onSortClick(field: ModelGatewaySortField) {
  const cur = sortStateFor(field)
  if (cur === 'none') sort.value = { field, direction: 'ASC' }
  else if (cur === 'ascending') sort.value = { field, direction: 'DESC' }
  else sort.value = null
  currentPage.value = 1
}

/* ---------- Filter dropdown (single anchor, single key) ---------- */
const openFilterAnchor = ref<HTMLElement | null>(null)
const openFilterKey = ref<'nameKeyword' | null>(null)

function openFilter(key: 'nameKeyword', target: EventTarget | null) {
  openFilterKey.value = key
  const host = (target as HTMLElement | null)?.closest('cds-button-action') as HTMLElement | null
  openFilterAnchor.value = host ?? (target as HTMLElement | null)
}
function closeFilter() {
  openFilterAnchor.value = null
  openFilterKey.value = null
}

function onNameKeywordInput(e: Event) {
  nameKeyword.value = (e.target as HTMLInputElement).value
  currentPage.value = 1
}

const variables = computed<ModelGatewaysQueryVars>(() => {
  const filter: ModelGatewayFilterInput = {}
  if (nameKeyword.value.trim()) filter.search = nameKeyword.value.trim()
  const page: PageInput = {
    limit: pageSize.value,
    offset: (currentPage.value - 1) * pageSize.value,
  }
  return {
    filter: Object.keys(filter).length > 0 ? filter : null,
    page,
    sort: sort.value,
  }
})

const { result, loading, error, refetch } = useQuery<
  ModelGatewaysQueryResult,
  ModelGatewaysQueryVars
>(MODEL_GATEWAYS_QUERY, variables, { fetchPolicy: 'cache-and-network' })

const gateways = computed(() => result.value?.modelGateways.nodes ?? [])
const totalCount = computed(() => result.value?.modelGateways.totalCount ?? 0)
const totalPages = computed(() => Math.max(1, Math.ceil(totalCount.value / pageSize.value)))
const rangeStart = computed(() =>
  totalCount.value === 0 ? 0 : (currentPage.value - 1) * pageSize.value + 1,
)
const rangeEnd = computed(() => Math.min(currentPage.value * pageSize.value, totalCount.value))

watch(totalPages, (pages) => {
  if (currentPage.value > pages) currentPage.value = pages
})

watch(pageSize, () => {
  currentPage.value = 1
})

function onPageSizeChange(event: Event) {
  const next = Number((event.target as HTMLSelectElement).value)
  if (PAGE_SIZE_OPTIONS.includes(next as PageSize)) {
    pageSize.value = next as PageSize
  }
}

function goToPage(page: number) {
  if (page < 1 || page > totalPages.value) return
  currentPage.value = page
}

/** 端点是否为可点击的 http(s) URL — 协议缺失时保持纯文本展示,
 *  否则浏览器会把相对路径拼到当前路由上,反而误导用户。 */
function isClickableEndpoint(value: string): boolean {
  return /^https?:\/\//i.test(value)
}

function formatGatewayTime(value: string | null | undefined): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  const pad = (n: number) => String(n).padStart(2, '0')
  return (
    `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}`
  )
}

/** "刚刚" / "X 分钟前" / "X 小时前" / "X 天前" — 同步状态列的相对时间文案。 */
function fmtSyncAgo(iso: string | null | undefined, nowMs: number = Date.now()): string {
  if (!iso) return '—'
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return '—'
  const diffSec = Math.max(0, Math.round((nowMs - then) / 1000))
  if (diffSec < 60) return '刚刚'
  const diffMin = Math.round(diffSec / 60)
  if (diffMin < 60) return `${diffMin} 分钟前`
  const diffHr = Math.round(diffMin / 60)
  if (diffHr < 24) return `${diffHr} 小时前`
  const diffDay = Math.round(diffHr / 24)
  if (diffDay < 30) return `${diffDay} 天前`
  return formatGatewayTime(iso)
}

function syncBadgeFor(gateway: ModelGateway): 'success' | 'neutral' {
  return gateway.lastSyncStatus === 'NEVER' ? 'neutral' : 'success'
}

function syncBadgeText(gateway: ModelGateway): string {
  if (gateway.lastSyncStatus === 'NEVER') {
    return locale.t('gateway.status.neverSynced')
  }
  return locale
    .t('gateway.status.syncedAgo')
    .replace('{ago}', fmtSyncAgo(gateway.lastSyncAt))
}

async function copyName(gateway: ModelGateway) {
  try {
    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(gateway.name)
      } catch {
        copyWithFallback(gateway.name)
      }
    } else {
      copyWithFallback(gateway.name)
    }
    toast.success(locale.t('gateway.toast.copied').replace('{name}', gateway.name))
  } catch {
    toast.error(locale.t('gateway.toast.copyFailed'))
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
  if (!copied) throw new Error('Copy command was rejected')
}

const testingIDs = ref<Set<string>>(new Set())

async function testConnection(gateway: ModelGateway) {
  if (testingIDs.value.has(gateway.id)) return
  testingIDs.value = new Set([...testingIDs.value, gateway.id])
  try {
    const response = await apolloClient.mutate<
      TestModelGatewayConnectionResult,
      TestModelGatewayConnectionVars
    >({
      mutation: TEST_MODEL_GATEWAY_CONNECTION,
      variables: { id: gateway.id },
    })
    const test = response.data?.testModelGatewayConnection
    if (!test) throw new Error('Missing test result')
    if (test.success) {
      toast.success(locale.t('gateway.toast.testSuccess').replace('{name}', gateway.name))
    } else {
      toast.error(test.message || locale.t('gateway.toast.testFailed'))
    }
    await refetch()
  } catch {
    toast.error(locale.t('gateway.toast.testFailed'))
  } finally {
    const next = new Set(testingIDs.value)
    next.delete(gateway.id)
    testingIDs.value = next
  }
}

const formOpen = ref(false)
const editingGateway = ref<ModelGateway | null>(null)
const saving = ref(false)

function openCreate() {
  editingGateway.value = null
  formOpen.value = true
}

function chooseLiteLLM(close: () => void) {
  openCreate()
  close()
}

function openEdit(gateway: ModelGateway) {
  editingGateway.value = gateway
  formOpen.value = true
}

function closeForm() {
  if (saving.value) return
  formOpen.value = false
  editingGateway.value = null
}

async function submitGateway(input: ModelGatewayInput) {
  if (saving.value) return
  saving.value = true
  try {
    if (editingGateway.value) {
      await apolloClient.mutate<UpdateModelGatewayResult, UpdateModelGatewayVars>({
        mutation: UPDATE_MODEL_GATEWAY,
        variables: { id: editingGateway.value.id, input },
      })
      toast.success(locale.t('gateway.toast.updated'))
    } else {
      await apolloClient.mutate<CreateModelGatewayResult, CreateModelGatewayVars>({
        mutation: CREATE_MODEL_GATEWAY,
        variables: { input },
      })
      toast.success(locale.t('gateway.toast.created'))
    }
    formOpen.value = false
    editingGateway.value = null
    currentPage.value = 1
    await refetch()
  } catch {
    toast.error(locale.t('gateway.toast.saveFailed'))
  } finally {
    saving.value = false
  }
}

const deleteTarget = ref<ModelGateway | null>(null)
const deleting = ref(false)

function requestDelete(gateway: ModelGateway) {
  deleteTarget.value = gateway
}

function closeDelete() {
  if (!deleting.value) deleteTarget.value = null
}

async function confirmDelete() {
  if (!deleteTarget.value || deleting.value) return
  deleting.value = true
  try {
    await apolloClient.mutate<DeleteModelGatewayResult, DeleteModelGatewayVars>({
      mutation: DELETE_MODEL_GATEWAY,
      variables: { id: deleteTarget.value.id },
    })
    toast.success(locale.t('gateway.toast.deleted'))
    deleteTarget.value = null
    await refetch()
  } catch {
    toast.error(locale.t('gateway.toast.deleteFailed'))
  } finally {
    deleting.value = false
  }
}
</script>

<template>
  <section class="gateway-page">
    <header class="page-head">
      <h1 cds-text="title" class="heading">{{ locale.t('gateway.title') }}</h1>
      <p cds-text="body" class="desc muted">{{ locale.t('gateway.description') }}</p>
    </header>

    <div class="toolbar">
      <AppDropdown align="start">
        <template #trigger>
          <cds-button
            class="connect-button"
            action="outline"
            status="primary"
          >
            <cds-icon shape="plus-circle" size="sm" aria-hidden="true"></cds-icon>
            {{ locale.t('gateway.connectButton') }}
            <cds-icon shape="angle" direction="down" size="sm" aria-hidden="true"></cds-icon>
          </cds-button>
        </template>
        <template #default="{ close }">
          <button type="button" class="menu-option" @click="chooseLiteLLM(close)">
            <cds-icon shape="router" size="sm" aria-hidden="true"></cds-icon>
            <span>LiteLLM</span>
          </button>
        </template>
      </AppDropdown>
    </div>

    <div class="grid-card">
      <cds-alert v-if="error" status="danger" class="query-error">
        {{ locale.t('gateway.error.load') }}
      </cds-alert>

      <cds-grid
        border="row"
        column-layout="flex"
        role="grid"
        :aria-label="locale.t('gateway.table.label')"
      >
        <cds-grid-column width="20%">
          <div class="col-head">
            <span>{{ locale.t('gateway.col.name') }}</span>
            <span class="col-head-actions">
              <cds-button-action
                id="gateway-sort-name"
                :aria-label="`sort ${locale.t('gateway.col.name')}`"
                @click="onSortClick('NAME')"
              >
                <cds-icon
                  v-if="sortStateFor('NAME') === 'ascending'" shape="angle" direction="up" size="sm"
                ></cds-icon>
                <cds-icon
                  v-else-if="sortStateFor('NAME') === 'descending'" shape="angle" direction="down" size="sm"
                ></cds-icon>
                <cds-icon v-else shape="two-way-arrows" class="col-sort-rotated" size="sm"></cds-icon>
              </cds-button-action>
              <cds-button-action
                id="gateway-filter-name-input"
                shape="filter"
                :aria-label="`filter ${locale.t('gateway.col.name')}`"
                :expanded="!!nameKeyword"
                @click="(e: MouseEvent) => openFilter('nameKeyword', e.target)"
              ></cds-button-action>
            </span>
          </div>
        </cds-grid-column>
        <cds-grid-column width="22%">{{ locale.t('gateway.col.endpoint') }}</cds-grid-column>
        <cds-grid-column width="12%">{{ locale.t('gateway.col.sync') }}</cds-grid-column>
        <cds-grid-column width="14%">{{ locale.t('gateway.col.createdAt') }}</cds-grid-column>
        <cds-grid-column width="14%">{{ locale.t('gateway.col.updatedAt') }}</cds-grid-column>
        <cds-grid-column width="18%">{{ locale.t('gateway.col.actions') }}</cds-grid-column>

        <cds-grid-row v-for="gateway in gateways" :key="gateway.id">
          <cds-grid-cell>
            <span class="name-cell">
              <strong>{{ gateway.name }}</strong>
              <cds-button-action
                shape="copy"
                :aria-label="locale.t('gateway.action.copy')"
                :title="locale.t('gateway.action.copy')"
                @click="copyName(gateway)"
              ></cds-button-action>
            </span>
          </cds-grid-cell>
          <cds-grid-cell>
            <a
              v-if="isClickableEndpoint(gateway.endpoint)"
              class="endpoint"
              :href="gateway.endpoint"
              target="_blank"
              rel="noopener noreferrer"
              :title="gateway.endpoint"
            >{{ gateway.endpoint }}</a>
            <span v-else class="endpoint endpoint-text" :title="gateway.endpoint">{{ gateway.endpoint }}</span>
          </cds-grid-cell>
          <cds-grid-cell>
            <cds-badge :status="syncBadgeFor(gateway)" class="sync-status-badge">
              {{ syncBadgeText(gateway) }}
            </cds-badge>
          </cds-grid-cell>
          <cds-grid-cell class="time-cell">{{ formatGatewayTime(gateway.createdAt) }}</cds-grid-cell>
          <cds-grid-cell class="time-cell">{{ formatGatewayTime(gateway.updatedAt) }}</cds-grid-cell>
          <cds-grid-cell>
            <span class="row-actions">
              <button
                type="button"
                class="row-action"
                :disabled="testingIDs.has(gateway.id)"
                :title="locale.t('gateway.action.sync')"
                @click="testConnection(gateway)"
              >
                <cds-icon
                  shape="sync"
                  size="sm"
                  :class="{ spinning: testingIDs.has(gateway.id) }"
                  aria-hidden="true"
                ></cds-icon>
                <span>{{ locale.t('gateway.action.sync') }}</span>
              </button>
              <button
                type="button"
                class="row-action"
                :title="locale.t('gateway.action.edit')"
                @click="openEdit(gateway)"
              >
                <cds-icon shape="pencil" size="sm" aria-hidden="true"></cds-icon>
                <span>{{ locale.t('gateway.action.edit') }}</span>
              </button>
              <button
                type="button"
                class="row-action danger"
                :title="locale.t('gateway.action.delete')"
                @click="requestDelete(gateway)"
              >
                <cds-icon shape="trash" size="sm" aria-hidden="true"></cds-icon>
                <span>{{ locale.t('gateway.action.delete') }}</span>
              </button>
            </span>
          </cds-grid-cell>
        </cds-grid-row>

        <cds-grid-placeholder v-if="loading && gateways.length === 0">
          <cds-progress-circle size="xl" status="info"></cds-progress-circle>
          <p cds-text="subsection">{{ locale.t('gateway.loading') }}</p>
        </cds-grid-placeholder>

        <cds-grid-placeholder v-else-if="!error && gateways.length === 0">
          <cds-icon shape="router" size="xl"></cds-icon>
          <p cds-text="subsection">{{ locale.t('gateway.empty') }}</p>
          <cds-button action="outline" size="sm" @click="openCreate">
            {{ locale.t('gateway.connectButton') }}
          </cds-button>
        </cds-grid-placeholder>

        <cds-grid-footer v-if="!error && totalCount > 0">
          <div class="gateway-pager">
            <label for="gateway-page-size">
              {{ locale.t('gateway.pagination.pageSize') }}
            </label>
            <cds-select control-width="shrink">
              <select
                id="gateway-page-size"
                :value="pageSize"
                :aria-label="locale.t('gateway.pagination.pageSize')"
                @change="onPageSizeChange"
              >
                <option v-for="option in PAGE_SIZE_OPTIONS" :key="option" :value="option">
                  {{ option }}
                </option>
              </select>
            </cds-select>

            <span class="range-summary">
              {{
                locale
                  .t('gateway.pagination.summary')
                  .replace('{start}', String(rangeStart))
                  .replace('{end}', String(rangeEnd))
                  .replace('{total}', String(totalCount))
              }}
            </span>

            <cds-pagination :aria-label="locale.t('gateway.pagination.label')">
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
                  :aria-label="locale.t('gateway.pagination.page')"
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
      v-if="openFilterAnchor"
      :hidden="!openFilterKey"
      :anchor="openFilterAnchor"
      closable
      @closeChange="closeFilter"
    >
      <div cds-layout="vertical align:stretch p:xs">
        <cds-input v-if="openFilterKey === 'nameKeyword'">
          <input
            type="text"
            :value="nameKeyword"
            :placeholder="locale.t('gateway.col.name.search')"
            :aria-label="locale.t('gateway.col.name.search')"
            @input="onNameKeywordInput"
          />
        </cds-input>
      </div>
    </cds-dropdown>

    <ModelGatewayFormModal
      v-if="formOpen"
      :open="formOpen"
      :gateway="editingGateway"
      :saving="saving"
      @close="closeForm"
      @submit="submitGateway"
    />
    <ConfirmDeleteModal
      v-if="deleteTarget"
      :open="Boolean(deleteTarget)"
      :name="deleteTarget?.name ?? ''"
      :deleting="deleting"
      @close="closeDelete"
      @confirm="confirmDelete"
    />
  </section>
</template>

<style scoped>
.gateway-page {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
  padding-bottom: 18px;
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
.toolbar {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 12px;
  margin-top: 20px;
}
.connect-button {
  white-space: nowrap;
}
.menu-option {
  display: flex;
  align-items: center;
  gap: 10px;
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
.grid-card {
  min-width: 0;
  border: 1px solid var(--cds-alias-object-border-color, #d7d7d7);
  border-radius: 6px;
  background: var(--cds-alias-object-container-background, #fff);
  overflow: hidden;
  flex-shrink: 0;
}
.query-error {
  margin: 10px;
}
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
.col-sort-rotated {
  transform: rotate(90deg);
}
.gateway-page cds-grid {
  display: block;
  width: 100%;
  max-width: 100%;
  min-width: 0;
}
.name-cell {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  min-width: 0;
}
.name-cell strong {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.endpoint {
  color: var(--cds-alias-object-interaction-color, #0072a3);
  text-decoration: none;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  display: block;
}
.endpoint:hover {
  text-decoration: underline;
}
.endpoint-text {
  color: var(--cds-alias-typography-color-300, #565656);
  cursor: default;
}
.sync-status-badge {
  display: inline-flex;
  white-space: nowrap;
}
.time-cell {
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  color: var(--cds-alias-typography-color-300, #565656);
}
.row-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
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
.row-action:hover:not(:disabled) {
  background: var(--cds-alias-object-app-background, #f4f4f4);
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
.range-summary {
  color: var(--cds-alias-typography-color-300, #565656);
  white-space: nowrap;
}
.gateway-pager {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  margin-left: auto;
  white-space: nowrap;
}
.gateway-pager > label {
  color: var(--cds-alias-typography-color-300, #565656);
}
.spinning {
  animation: gateway-spin 1s linear infinite;
  transform-origin: center;
}
@keyframes gateway-spin {
  to {
    transform: rotate(360deg);
  }
}
@media (max-width: 980px) {
  .grid-card {
    overflow-x: auto;
  }
  .gateway-page cds-grid {
    min-width: 980px;
  }
}
@media (max-width: 640px) {
  .gateway-pager {
    flex-wrap: wrap;
    justify-content: flex-end;
  }
}
@media (prefers-reduced-motion: reduce) {
  .spinning {
    animation: none;
  }
}
</style>
