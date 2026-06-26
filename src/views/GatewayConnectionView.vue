<script setup lang="ts">
/**
 * 网关连接 (Gateway Connections) — `/model-gateway/connections`.
 *
 * Lists the raw GatewayConnection entities (schema/gateway-routing.graphql) and
 * runs real mutations against the backend GraphQL endpoint via Apollo:
 *   - register (create) via RegisterGatewayConnectionDialog
 *   - delete (confirm) via ConfirmDialog
 *   - test connection (row action) → testGatewayConnection returns a bare
 *     GatewayStatus enum; the result is surfaced as a toast keyed off the enum.
 * A header banner shows modelGatewaySyncSummary (litellm sync rollup).
 *
 * All ops are @hasRole(any: [admin]); a non-admin reaching this page sees the
 * backend authorization error surfaced via toast.
 */
import { computed, ref } from 'vue'
import { useQuery } from '@vue/apollo-composable'
import { apolloClient } from '@/api/graphql/client'
import { useLocaleStore } from '@/stores/locale'
import { useToast } from '@/composables/useToast'
import { graphqlErrorMessage } from '@/api/graphql/errors'
import ConfirmDialog from '@/views/user-role/ConfirmDialog.vue'
import RegisterGatewayConnectionDialog from '@/views/gateway-connection/RegisterGatewayConnectionDialog.vue'
import {
  GATEWAY_CONNECTIONS_LIST_QUERY,
  GATEWAY_CONNECTIONS_SYNC_SUMMARY_QUERY,
  REGISTER_GATEWAY_CONNECTION,
  TEST_GATEWAY_CONNECTION,
  DELETE_GATEWAY_CONNECTION,
  type GatewayConnectionNode,
  type GatewayConnectionsListResult,
  type GatewayConnectionsSyncSummaryResult,
  type GatewayStatus,
  type GatewaySyncState,
  type RegisterGatewayConnectionInput,
  type RegisterGatewayConnectionResult,
  type RegisterGatewayConnectionVars,
  type TestGatewayConnectionResult,
  type TestGatewayConnectionVars,
  type DeleteGatewayConnectionResult,
  type DeleteGatewayConnectionVars,
} from '@/api/graphql/queries/gateway-connections'
import '@/components/icons'

const locale = useLocaleStore()
const toast = useToast()

const {
  result: listResult,
  loading,
  error,
  refetch,
} = useQuery<GatewayConnectionsListResult>(GATEWAY_CONNECTIONS_LIST_QUERY)

const { result: summaryResult, refetch: refetchSummary } =
  useQuery<GatewayConnectionsSyncSummaryResult>(GATEWAY_CONNECTIONS_SYNC_SUMMARY_QUERY)

const connections = computed<GatewayConnectionNode[]>(
  () => listResult.value?.gatewayConnections ?? [],
)
const syncSummary = computed(() => summaryResult.value?.modelGatewaySyncSummary ?? null)

const registerOpen = ref(false)
const saving = ref(false)
const testingId = ref<string | null>(null)
const deletingConnection = ref<GatewayConnectionNode | null>(null)

function statusBadge(status: GatewayStatus): 'success' | 'danger' | 'neutral' {
  if (status === 'connected') return 'success'
  if (status === 'error') return 'danger'
  return 'neutral'
}

function syncStateBadge(state: GatewaySyncState): 'success' | 'danger' | 'neutral' {
  if (state === 'SYNCED') return 'success'
  if (state === 'FAILED') return 'danger'
  if (state === 'NEVER') return 'neutral'
  return 'neutral'
}

function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  try {
    return new Intl.DateTimeFormat(locale.locale === 'zh' ? 'zh-CN' : 'en-US', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(iso))
  } catch {
    return iso
  }
}

const summaryCountsText = computed(() => {
  const s = syncSummary.value
  if (!s) return ''
  return locale.t('gatewayConn.summary.counts')
    .replace('{ok}', String(s.successCount))
    .replace('{fail}', String(s.failedCount))
})

function openRegister() {
  registerOpen.value = true
}

function closeRegister() {
  if (saving.value) return
  registerOpen.value = false
}

async function submitRegister(input: RegisterGatewayConnectionInput) {
  if (saving.value) return
  saving.value = true
  try {
    await apolloClient.mutate<RegisterGatewayConnectionResult, RegisterGatewayConnectionVars>({
      mutation: REGISTER_GATEWAY_CONNECTION,
      variables: { input },
    })
    toast.success(locale.t('gatewayConn.toast.created'))
    registerOpen.value = false
    await Promise.all([refetch(), refetchSummary()])
  } catch (err) {
    toast.error(graphqlErrorMessage(err, locale.t('gatewayConn.toast.createFailed')))
  } finally {
    saving.value = false
  }
}

async function testConnection(connection: GatewayConnectionNode) {
  if (testingId.value) return
  testingId.value = connection.id
  try {
    const response = await apolloClient.mutate<
      TestGatewayConnectionResult,
      TestGatewayConnectionVars
    >({
      mutation: TEST_GATEWAY_CONNECTION,
      variables: { id: connection.id },
    })
    const status = response.data?.testGatewayConnection
    if (status === 'connected') {
      toast.success(locale.t('gatewayConn.toast.testConnected').replace('{name}', connection.name))
    } else if (status === 'error') {
      toast.error(locale.t('gatewayConn.toast.testError').replace('{name}', connection.name))
    } else {
      toast.warning(locale.t('gatewayConn.toast.testDisconnected').replace('{name}', connection.name))
    }
    await Promise.all([refetch(), refetchSummary()])
  } catch (err) {
    toast.error(graphqlErrorMessage(err, locale.t('gatewayConn.toast.testFailed')))
  } finally {
    testingId.value = null
  }
}

function requestDelete(connection: GatewayConnectionNode) {
  deletingConnection.value = connection
}

function closeDelete() {
  deletingConnection.value = null
}

async function confirmDelete() {
  const connection = deletingConnection.value
  deletingConnection.value = null
  if (!connection) return
  try {
    await apolloClient.mutate<DeleteGatewayConnectionResult, DeleteGatewayConnectionVars>({
      mutation: DELETE_GATEWAY_CONNECTION,
      variables: { id: connection.id },
    })
    toast.success(locale.t('gatewayConn.toast.deleted'))
    await Promise.all([refetch(), refetchSummary()])
  } catch (err) {
    toast.error(graphqlErrorMessage(err, locale.t('gatewayConn.toast.deleteFailed')))
  }
}

async function refreshConnections() {
  if (loading.value) return
  try {
    await Promise.all([refetch(), refetchSummary()])
    toast.success(locale.t('gatewayConn.toast.refreshed'))
  } catch (err) {
    toast.error(graphqlErrorMessage(err, locale.t('gatewayConn.toast.refreshFailed')))
  }
}

const deleteDialogBody = computed(() =>
  deletingConnection.value
    ? locale.t('gatewayConn.confirm.deleteBody').replace('{name}', deletingConnection.value.name)
    : '',
)

function isClickableEndpoint(value: string): boolean {
  return /^https?:\/\//i.test(value)
}
</script>

<template>
  <section class="gateway-conn-page">
    <header class="page-head">
      <h1 cds-text="title" class="heading">{{ locale.t('gatewayConn.title') }}</h1>
      <p cds-text="body" class="desc muted">{{ locale.t('gatewayConn.description') }}</p>
    </header>

    <cds-alert v-if="syncSummary" status="info" class="sync-summary" aria-live="polite">
      <div class="summary-row">
        <span class="summary-label">{{ locale.t('gatewayConn.summary.title') }}</span>
        <cds-badge :status="syncStateBadge(syncSummary.state)">
          {{ locale.t(`gatewayConn.syncState.${syncSummary.state}`) }}
        </cds-badge>
        <span class="summary-counts">{{ summaryCountsText }}</span>
        <span class="summary-synced muted">
          {{ locale.t('gatewayConn.summary.lastSynced') }}:
          {{ syncSummary.lastSyncedAt ? fmtDateTime(syncSummary.lastSyncedAt) : locale.t('gatewayConn.summary.never') }}
        </span>
        <span v-if="syncSummary.message" class="summary-message muted">— {{ syncSummary.message }}</span>
      </div>
    </cds-alert>

    <div class="toolbar">
      <cds-button action="outline" status="primary" @click="openRegister">
        <cds-icon shape="plus-circle" size="sm" aria-hidden="true"></cds-icon>
        {{ locale.t('gatewayConn.action.register') }}
      </cds-button>

      <cds-button
        action="ghost"
        class="refresh-button"
        :disabled="loading"
        :aria-label="locale.t('gatewayConn.action.refresh')"
        :title="locale.t('gatewayConn.action.refresh')"
        @click="refreshConnections"
      >
        <cds-icon shape="refresh" size="md" :class="{ spinning: loading }"></cds-icon>
        <span>{{ locale.t('gatewayConn.action.refresh') }}</span>
      </cds-button>
    </div>

    <cds-alert v-if="error" status="danger" closable role="alert">
      {{ locale.t('gatewayConn.error') }}
    </cds-alert>

    <div class="grid-card">
      <cds-grid
        border="row"
        column-layout="flex"
        role="grid"
        :aria-label="locale.t('gatewayConn.title')"
      >
        <cds-grid-column width="22%">{{ locale.t('gatewayConn.col.name') }}</cds-grid-column>
        <cds-grid-column width="28%">{{ locale.t('gatewayConn.col.endpoint') }}</cds-grid-column>
        <cds-grid-column width="12%">{{ locale.t('gatewayConn.col.status') }}</cds-grid-column>
        <cds-grid-column width="14%">{{ locale.t('gatewayConn.col.strategy') }}</cds-grid-column>
        <cds-grid-column width="12%">{{ locale.t('gatewayConn.col.createdAt') }}</cds-grid-column>
        <cds-grid-column width="12%">{{ locale.t('gatewayConn.col.actions') }}</cds-grid-column>

        <cds-grid-row v-for="connection in connections" :key="connection.id">
          <cds-grid-cell>
            <strong class="conn-name" :title="connection.name">{{ connection.name }}</strong>
          </cds-grid-cell>
          <cds-grid-cell class="endpoint-cell">
            <a
              v-if="isClickableEndpoint(connection.endpoint)"
              class="endpoint-link"
              :href="connection.endpoint"
              target="_blank"
              rel="noopener noreferrer"
              :title="connection.endpoint"
            >{{ connection.endpoint }}</a>
            <span v-else class="muted" :title="connection.endpoint">{{ connection.endpoint }}</span>
          </cds-grid-cell>
          <cds-grid-cell>
            <cds-badge :status="statusBadge(connection.status)" class="status-badge">
              {{ locale.t(`gatewayConn.status.${connection.status}`) }}
            </cds-badge>
          </cds-grid-cell>
          <cds-grid-cell class="muted">
            {{ locale.t(`gatewayConn.strategy.${connection.loadBalanceStrategy}`) }}
          </cds-grid-cell>
          <cds-grid-cell class="muted">{{ fmtDateTime(connection.createdAt) }}</cds-grid-cell>
          <cds-grid-cell>
            <div class="row-actions">
              <button
                type="button"
                class="row-action"
                :disabled="testingId === connection.id"
                :aria-busy="testingId === connection.id"
                @click="testConnection(connection)"
              >
                <cds-icon shape="sync" size="sm" aria-hidden="true" :class="{ spinning: testingId === connection.id }"></cds-icon>
                <span>{{ locale.t('gatewayConn.action.test') }}</span>
              </button>
              <button type="button" class="row-action danger" @click="requestDelete(connection)">
                <cds-icon shape="trash" size="sm" aria-hidden="true"></cds-icon>
                <span>{{ locale.t('gatewayConn.action.delete') }}</span>
              </button>
            </div>
          </cds-grid-cell>
        </cds-grid-row>

        <cds-grid-placeholder v-if="loading && connections.length === 0" role="status" aria-live="polite">
          <cds-progress-circle size="xl" status="info" aria-hidden="true"></cds-progress-circle>
          <p cds-text="subsection">{{ locale.t('gatewayConn.loading') }}</p>
        </cds-grid-placeholder>

        <cds-grid-placeholder v-else-if="connections.length === 0" role="status" aria-live="polite">
          <cds-icon shape="internet-of-things" size="xl" aria-hidden="true"></cds-icon>
          <p cds-text="subsection">{{ locale.t('gatewayConn.empty') }}</p>
          <cds-button action="outline" size="sm" @click="openRegister">
            {{ locale.t('gatewayConn.action.register') }}
          </cds-button>
        </cds-grid-placeholder>
      </cds-grid>
    </div>

    <RegisterGatewayConnectionDialog
      v-if="registerOpen"
      :open="registerOpen"
      :saving="saving"
      @close="closeRegister"
      @submit="submitRegister"
    />

    <ConfirmDialog
      :open="!!deletingConnection"
      :title="locale.t('gatewayConn.confirm.deleteTitle')"
      :body="deleteDialogBody"
      danger
      @close="closeDelete"
      @confirm="confirmDelete"
    />
  </section>
</template>

<style scoped>
.gateway-conn-page {
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
.muted {
  color: var(--cds-alias-typography-color-300, #565656);
}
.sync-summary {
  flex: 0 0 auto;
}
.summary-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
}
.summary-label {
  font-weight: 600;
}
.summary-counts {
  white-space: nowrap;
}
.summary-message {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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
.gateway-conn-page cds-grid {
  display: block;
  width: 100%;
  min-width: 820px;
  min-height: 100%;
}
.conn-name {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.endpoint-cell {
  word-break: break-all;
  font-size: 12px;
}
.endpoint-link {
  color: var(--cds-alias-object-interaction-color, #0072a3);
  text-decoration: none;
}
.endpoint-link:hover {
  text-decoration: underline;
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
.row-action:disabled {
  opacity: 0.55;
  cursor: default;
}
.row-action.danger {
  color: var(--cds-alias-status-danger, #c92100);
}
.spinning {
  animation: gateway-conn-spin 1s linear infinite;
  transform-origin: center;
}
@keyframes gateway-conn-spin {
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
