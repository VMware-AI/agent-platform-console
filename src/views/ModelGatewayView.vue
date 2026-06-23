<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
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
  ModelGatewayInput,
  ModelGatewaySyncState,
  ModelGatewaysQueryResult,
  ModelGatewaysQueryVars,
  ModelGatewayStatus,
  TestModelGatewayConnectionResult,
  TestModelGatewayConnectionVars,
  UpdateModelGatewayResult,
  UpdateModelGatewayVars,
} from '@/api/graphql/model-gateway-types'
import { STATUS_KEY_FROM_GQL } from '@/api/graphql/model-gateway-types'
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
const searchText = ref('')
const debouncedSearch = ref('')
const statusFilter = ref<ModelGatewayStatus | 'ALL'>('ALL')
const currentPage = ref(1)
let searchTimer: ReturnType<typeof setTimeout> | null = null

watch(searchText, (value) => {
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = setTimeout(() => {
    debouncedSearch.value = value.trim()
    currentPage.value = 1
  }, 300)
})

watch([statusFilter, pageSize], () => {
  currentPage.value = 1
})

onBeforeUnmount(() => {
  if (searchTimer) clearTimeout(searchTimer)
})

const variables = computed<ModelGatewaysQueryVars>(() => ({
  filter:
    debouncedSearch.value || statusFilter.value !== 'ALL'
      ? {
          search: debouncedSearch.value || null,
          status: statusFilter.value === 'ALL' ? null : statusFilter.value,
        }
      : null,
  page: {
    limit: pageSize.value,
    offset: (currentPage.value - 1) * pageSize.value,
  },
}))

const { result, loading, error, refetch } = useQuery<
  ModelGatewaysQueryResult,
  ModelGatewaysQueryVars
>(MODEL_GATEWAYS_QUERY, variables, { fetchPolicy: 'network-only' })

const gateways = computed(() => result.value?.modelGateways.nodes ?? [])
const totalCount = computed(() => result.value?.modelGateways.totalCount ?? 0)
const syncSummary = computed(() => result.value?.modelGatewaySyncSummary ?? null)
const totalPages = computed(() => Math.max(1, Math.ceil(totalCount.value / pageSize.value)))
const rangeStart = computed(() =>
  totalCount.value === 0 ? 0 : (currentPage.value - 1) * pageSize.value + 1,
)
const rangeEnd = computed(() => Math.min(currentPage.value * pageSize.value, totalCount.value))

watch(totalPages, (pages) => {
  if (currentPage.value > pages) currentPage.value = pages
})

function onStatusChange(event: Event) {
  statusFilter.value = (event.target as HTMLSelectElement).value as ModelGatewayStatus | 'ALL'
}

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

function statusBadge(status: ModelGatewayStatus): 'success' | 'neutral' | 'danger' {
  if (status === 'CONNECTED') return 'success'
  if (status === 'ERROR') return 'danger'
  return 'neutral'
}

function isSynchronized(gateway: ModelGateway): boolean {
  return gateway.lastSyncStatus === 'SYNCED'
}

const syncStateKey: Record<ModelGatewaySyncState, string> = {
  SYNCED: 'synced',
  SYNCING: 'syncing',
  PARTIAL: 'partial',
  FAILED: 'failed',
  NEVER: 'never',
}

const syncBadgeStatus = computed<'success' | 'info' | 'warning' | 'danger' | 'neutral'>(() => {
  const state = syncSummary.value?.state
  if (state === 'SYNCED') return 'success'
  if (state === 'SYNCING') return 'info'
  if (state === 'PARTIAL') return 'warning'
  if (state === 'FAILED') return 'danger'
  return 'neutral'
})

const syncSummaryText = computed(() => {
  const summary = syncSummary.value
  if (!summary) return locale.t('gateway.sync.noLog')
  if (locale.locale === 'zh' && summary.message) return summary.message
  return locale
    .t('gateway.sync.summary')
    .replace('{success}', String(summary.successCount))
    .replace('{failed}', String(summary.failedCount))
})

function formatSyncDate(value: string | null): string {
  if (!value) return locale.t('gateway.sync.never')
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat(locale.locale === 'zh' ? 'zh-CN' : 'en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date)
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

function openAdmin(gateway: ModelGateway) {
  if (!gateway.adminUrl) {
    toast.warning(locale.t('gateway.toast.noAdminUrl'))
    return
  }
  window.open(gateway.adminUrl, '_blank', 'noopener,noreferrer')
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
    <header class="page-header">
      <div class="header-copy">
        <nav class="breadcrumb" :aria-label="locale.t('gateway.breadcrumb.label')">
          <span>{{ locale.t('gateway.breadcrumb.system') }}</span>
          <cds-icon shape="angle" direction="right" size="sm" aria-hidden="true"></cds-icon>
          <span aria-current="page">{{ locale.t('gateway.breadcrumb.current') }}</span>
        </nav>
        <h1>{{ locale.t('gateway.title') }}</h1>
        <p>{{ locale.t('gateway.description') }}</p>
      </div>

      <AppDropdown align="end">
        <template #trigger>
          <cds-button class="connect-button">
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
    </header>

    <div class="grid-card">
      <div class="toolbar">
        <cds-input class="search-control">
          <cds-control-action action="prefix" :aria-label="locale.t('gateway.search')">
            <cds-icon shape="search" size="sm" aria-hidden="true"></cds-icon>
          </cds-control-action>
          <input
            type="search"
            :value="searchText"
            :placeholder="locale.t('gateway.search')"
            :aria-label="locale.t('gateway.search')"
            @input="searchText = ($event.target as HTMLInputElement).value"
          />
        </cds-input>

        <label class="status-label" for="gateway-status-filter">
          {{ locale.t('gateway.filter.status') }}
        </label>
        <cds-select class="status-control" control-width="shrink">
          <select
            id="gateway-status-filter"
            :value="statusFilter"
            :aria-label="locale.t('gateway.filter.status')"
            @change="onStatusChange"
          >
            <option value="ALL">{{ locale.t('gateway.filter.all') }}</option>
            <option value="CONNECTED">{{ locale.t('gateway.status.connected') }}</option>
            <option value="DISCONNECTED">{{ locale.t('gateway.status.disconnected') }}</option>
            <option value="ERROR">{{ locale.t('gateway.status.error') }}</option>
          </select>
        </cds-select>

        <cds-button
          action="ghost"
          class="refresh-button"
          :disabled="loading"
          :aria-label="locale.t('gateway.action.refresh')"
          :title="locale.t('gateway.action.refresh')"
          @click="refetch()"
        >
          <cds-icon
            shape="refresh"
            size="md"
            :class="{ spinning: loading }"
            aria-hidden="true"
          ></cds-icon>
        </cds-button>
      </div>

      <cds-alert v-if="error" status="danger" class="query-error">
        {{ locale.t('gateway.error.load') }}
      </cds-alert>

      <cds-grid
        border="row"
        column-layout="flex"
        role="grid"
        :aria-label="locale.t('gateway.table.label')"
      >
        <cds-grid-column width="16%">{{ locale.t('gateway.col.name') }}</cds-grid-column>
        <cds-grid-column width="18%">{{ locale.t('gateway.col.endpoint') }}</cds-grid-column>
        <cds-grid-column width="9%">{{ locale.t('gateway.col.status') }}</cds-grid-column>
        <cds-grid-column width="9%">{{ locale.t('gateway.col.sync') }}</cds-grid-column>
        <cds-grid-column width="8%">{{ locale.t('gateway.col.models') }}</cds-grid-column>
        <cds-grid-column width="10%">{{ locale.t('gateway.col.strategy') }}</cds-grid-column>
        <cds-grid-column width="8%">{{ locale.t('gateway.col.latency') }}</cds-grid-column>
        <cds-grid-column width="22%">{{ locale.t('gateway.col.actions') }}</cds-grid-column>

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
            <a class="endpoint" :href="gateway.endpoint" target="_blank" rel="noopener noreferrer">
              {{ gateway.endpoint }}
            </a>
          </cds-grid-cell>
          <cds-grid-cell>
            <cds-badge :status="statusBadge(gateway.status)" class="status-badge">
              {{ locale.t(`gateway.status.${STATUS_KEY_FROM_GQL[gateway.status]}`) }}
            </cds-badge>
          </cds-grid-cell>
          <cds-grid-cell>
            <cds-badge
              :status="isSynchronized(gateway) ? 'success' : 'neutral'"
              class="sync-status-badge"
            >
              {{
                locale.t(
                  isSynchronized(gateway)
                    ? 'gateway.sync.synchronized'
                    : 'gateway.sync.notSynchronized',
                )
              }}
            </cds-badge>
          </cds-grid-cell>
          <cds-grid-cell>{{ gateway.backendModelCount }}</cds-grid-cell>
          <cds-grid-cell>{{ locale.t('gateway.strategy.roundRobin') }}</cds-grid-cell>
          <cds-grid-cell>
            {{ gateway.latencyMs == null ? '—' : gateway.latencyMs }}
          </cds-grid-cell>
          <cds-grid-cell>
            <span class="row-actions">
              <button
                type="button"
                class="row-action"
                :disabled="testingIDs.has(gateway.id)"
                :title="locale.t('gateway.action.test')"
                @click="testConnection(gateway)"
              >
                <cds-icon
                  shape="check-circle"
                  size="sm"
                  :class="{ spinning: testingIDs.has(gateway.id) }"
                  aria-hidden="true"
                ></cds-icon>
                <span>{{ locale.t('gateway.action.test') }}</span>
              </button>
              <button
                type="button"
                class="row-action"
                :class="{ disabled: !gateway.adminUrl }"
                :title="locale.t('gateway.action.manage')"
                @click="openAdmin(gateway)"
              >
                <cds-icon shape="cog" size="sm" aria-hidden="true"></cds-icon>
                <span>{{ locale.t('gateway.action.manage') }}</span>
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

    <div v-if="syncSummary" class="sync-panel-row">
      <form
        class="sync-status-form"
        aria-live="polite"
        aria-labelledby="gateway-sync-title"
        @submit.prevent
      >
        <div class="sync-form-header">
          <div>
            <h2 id="gateway-sync-title">{{ locale.t('gateway.sync.title') }}</h2>
            <p>{{ locale.t('gateway.sync.description') }}</p>
          </div>
          <cds-badge :status="syncBadgeStatus">
            {{ locale.t(`gateway.sync.state.${syncStateKey[syncSummary.state]}`) }}
          </cds-badge>
        </div>

        <div class="sync-form-fields">
          <cds-input>
            <label>{{ locale.t('gateway.sync.title') }}</label>
            <input
              readonly
              :value="locale.t(`gateway.sync.state.${syncStateKey[syncSummary.state]}`)"
            />
          </cds-input>
          <cds-input>
            <label>{{ locale.t('gateway.sync.last') }}</label>
            <input readonly :value="formatSyncDate(syncSummary.lastSyncedAt)" />
          </cds-input>
          <cds-input>
            <label>{{ locale.t('gateway.sync.success') }}</label>
            <input readonly :value="String(syncSummary.successCount)" />
          </cds-input>
          <cds-input>
            <label>{{ locale.t('gateway.sync.failed') }}</label>
            <input readonly :value="String(syncSummary.failedCount)" />
          </cds-input>
          <cds-input class="sync-summary-field">
            <label>{{ locale.t('gateway.sync.logTitle') }}</label>
            <input readonly :value="syncSummaryText" />
          </cds-input>
        </div>
      </form>
    </div>

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
  height: 100%;
  min-width: 0;
  overflow: auto;
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 0 2px 18px;
}
.page-header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 24px;
  flex-shrink: 0;
}
.header-copy {
  min-width: 0;
}
.breadcrumb {
  display: flex;
  align-items: center;
  gap: 4px;
  color: var(--cds-alias-typography-color-300, #565656);
  font-size: 13px;
  margin-bottom: 7px;
}
.page-header h1 {
  margin: 0;
  font-size: 28px;
  line-height: 1.25;
  font-weight: 600;
  color: var(--cds-alias-object-app-foreground, #1b1b1b);
}
.page-header p {
  margin: 5px 0 0;
  color: var(--cds-alias-typography-color-300, #565656);
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
.toolbar {
  min-height: 48px;
  padding: 8px 10px;
  display: flex;
  align-items: center;
  gap: 10px;
  border-bottom: 1px solid var(--cds-alias-object-border-color, #e8e8e8);
}
.search-control {
  width: min(360px, 48%);
}
.status-label {
  margin-left: auto;
  color: var(--cds-alias-typography-color-300, #565656);
  white-space: nowrap;
}
.status-control {
  min-width: 148px;
}
.refresh-button {
  --background: transparent;
  --border-color: transparent;
  --box-shadow-color: transparent;
  min-width: 32px;
}
.query-error {
  margin: 10px;
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
.status-badge {
  min-width: 64px;
}
.sync-status-badge {
  min-width: 56px;
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
.sync-panel-row {
  min-width: 0;
}
.sync-status-form {
  width: 100%;
  padding: 16px 18px;
  border: 1px solid var(--cds-alias-object-border-color, #d7d7d7);
  border-radius: 6px;
  background: var(--cds-alias-object-container-background, #fff);
}
.sync-form-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 18px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--cds-alias-object-border-color, #e8e8e8);
}
.sync-form-header h2 {
  margin: 0;
  font-size: 16px;
  line-height: 1.35;
  font-weight: 600;
}
.sync-form-header p {
  margin: 4px 0 0;
  color: var(--cds-alias-typography-color-300, #565656);
  font-size: 12px;
  line-height: 1.45;
}
.sync-form-fields {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px 20px;
  margin: 14px 0 0;
}
.sync-form-fields > * {
  min-width: 0;
}
.sync-summary-field {
  grid-column: 1 / -1;
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
  .page-header {
    align-items: flex-start;
  }
  .toolbar {
    flex-wrap: wrap;
  }
  .search-control {
    width: 100%;
  }
  .status-label {
    margin-left: 0;
  }
  .grid-card {
    overflow-x: auto;
  }
  .gateway-page cds-grid {
    min-width: 980px;
  }
}
@media (max-width: 640px) {
  .page-header {
    flex-direction: column;
  }
  .gateway-pager {
    flex-wrap: wrap;
    justify-content: flex-end;
  }
  .sync-form-fields {
    grid-template-columns: 1fr;
  }
}
@media (prefers-reduced-motion: reduce) {
  .spinning {
    animation: none;
  }
}
</style>
