<script setup lang="ts">
/**
 * 智能体快照与生命周期 (Agent Snapshots & Lifecycle) — LLD-03 §4.
 *
 * Master-detail page wired to the real backend:
 *   - top: an agent selector (dropdown of AGENTS) — picks the working agent.
 *   - right/detail: the selected agent's snapshots (agentSnapshots) with
 *       create-snapshot (snapshotAgent) and per-row revert (revertAgentSnapshot,
 *       destructive → ConfirmDialog).
 *   - lifecycle bar: setAgentStatus (start/stop) + recycleAgent (destructive →
 *       ConfirmDialog).
 *
 * Destructive ops (revert, recycle) require a backend `confirm: true` AND a UI
 * ConfirmDialog before the call. All errors surface via toast; state is treated
 * immutably (new refs, no in-place mutation of query results).
 */
import { computed, ref, watch } from 'vue'
import { useQuery } from '@vue/apollo-composable'
import { apolloClient } from '@/api/graphql/client'
import { useLocaleStore } from '@/stores/locale'
import { useToast } from '@/composables/useToast'
import { graphqlErrorMessage } from '@/api/graphql/errors'
import { AGENTS_QUERY } from '@/api/graphql/queries/agents'
import type { AgentsQueryResult, AgentsQueryVars } from '@/api/graphql/types'
import ConfirmDialog from '@/views/user-role/ConfirmDialog.vue'
import CreateSnapshotDialog from '@/views/agent-snapshot/CreateSnapshotDialog.vue'
import {
  AGENT_SNAPSHOTS_QUERY,
  SNAPSHOT_AGENT_MUTATION,
  REVERT_AGENT_SNAPSHOT_MUTATION,
  SET_AGENT_STATUS_MUTATION,
  RECYCLE_AGENT_MUTATION,
  type AgentLifecycleStatus,
  type AgentSnapshotNode,
  type AgentSnapshotsResult,
  type AgentSnapshotsVars,
  type SnapshotAgentResult,
  type SnapshotAgentVars,
  type RevertAgentSnapshotResult,
  type RevertAgentSnapshotVars,
  type SetAgentStatusResult,
  type SetAgentStatusVars,
  type RecycleAgentResult,
  type RecycleAgentVars,
} from '@/api/graphql/queries/agent-snapshots'
import '@/components/icons'

const locale = useLocaleStore()
const toast = useToast()

function fmt(key: string, vars: Record<string, string>): string {
  return locale.t(key).replace(/\{(\w+)\}/g, (_, k: string) => vars[k] ?? `{${k}}`)
}

// --- Agent picker ------------------------------------------------------------
// Reuse the existing AGENTS_QUERY (read-only). Pull a generous first page so the
// dropdown lists agents without re-implementing pagination here.
const AGENT_PAGE_SIZE = 100
const agentsVars: AgentsQueryVars = {
  pagination: { page: 1, pageSize: AGENT_PAGE_SIZE },
}
const {
  result: agentsResult,
  loading: agentsLoading,
} = useQuery<AgentsQueryResult, AgentsQueryVars>(AGENTS_QUERY, agentsVars)

interface PickerAgent {
  id: string
  name: string
  status: AgentLifecycleStatus
}

const agents = computed<PickerAgent[]>(() =>
  (agentsResult.value?.agents.nodes ?? []).map((node) => ({
    id: node.id,
    name: node.name,
    // The AGENTS_QUERY returns the raw backend AgentStatus string (lowercase).
    status: node.status as unknown as AgentLifecycleStatus,
  })),
)

const selectedAgentId = ref<string | null>(null)

const selectedAgent = computed<PickerAgent | null>(
  () => agents.value.find((agent) => agent.id === selectedAgentId.value) ?? null,
)

// Default to the first agent once they load; clear if it vanished.
watch(
  agents,
  (list) => {
    if (list.length === 0) {
      selectedAgentId.value = null
      return
    }
    if (!list.some((agent) => agent.id === selectedAgentId.value)) {
      selectedAgentId.value = list[0].id
    }
  },
  { immediate: true },
)

function onAgentChange(event: Event) {
  selectedAgentId.value = (event.target as HTMLSelectElement).value || null
}

// --- Snapshots for the selected agent ---------------------------------------
const snapshotsVars = computed<AgentSnapshotsVars>(() => ({
  agentId: selectedAgentId.value ?? '',
}))

const {
  result: snapshotsResult,
  loading: snapshotsLoading,
  error: snapshotsError,
  refetch: refetchSnapshots,
} = useQuery<AgentSnapshotsResult, AgentSnapshotsVars>(
  AGENT_SNAPSHOTS_QUERY,
  snapshotsVars,
  // Only query once an agent is selected.
  () => ({ enabled: !!selectedAgentId.value }),
)

const snapshots = computed<AgentSnapshotNode[]>(
  () => snapshotsResult.value?.agentSnapshots ?? [],
)

// --- Lifecycle status display ------------------------------------------------
const STATUS_BADGE: Record<AgentLifecycleStatus, string> = {
  provisioning: 'warning',
  running: 'success',
  stopped: 'neutral',
  exception: 'danger',
}

function statusLabel(status: AgentLifecycleStatus): string {
  return locale.t(`agentSnapshot.status.${status}`)
}
function statusBadge(status: AgentLifecycleStatus): string {
  return STATUS_BADGE[status] ?? 'neutral'
}

const canStart = computed(
  () => !!selectedAgent.value && selectedAgent.value.status !== 'running',
)
const canStop = computed(
  () => !!selectedAgent.value && selectedAgent.value.status === 'running',
)

// --- Create-snapshot dialog --------------------------------------------------
const createOpen = ref(false)
const creating = ref(false)

function openCreate() {
  if (!selectedAgent.value) return
  createOpen.value = true
}
function closeCreate() {
  if (creating.value) return
  createOpen.value = false
}

async function submitCreate(payload: { name: string; description: string | null }) {
  const agent = selectedAgent.value
  if (!agent || creating.value) return
  creating.value = true
  try {
    await apolloClient.mutate<SnapshotAgentResult, SnapshotAgentVars>({
      mutation: SNAPSHOT_AGENT_MUTATION,
      variables: {
        input: { agentId: agent.id, name: payload.name, description: payload.description },
      },
    })
    toast.success(locale.t('agentSnapshot.toast.created'))
    createOpen.value = false
    await refetchSnapshots()
  } catch (error) {
    toast.error(graphqlErrorMessage(error, locale.t('agentSnapshot.toast.createFailed')))
  } finally {
    creating.value = false
  }
}

// --- Revert (destructive) ----------------------------------------------------
const revertTarget = ref<AgentSnapshotNode | null>(null)
const reverting = ref(false)

function askRevert(snapshot: AgentSnapshotNode) {
  revertTarget.value = snapshot
}
function cancelRevert() {
  if (reverting.value) return
  revertTarget.value = null
}

async function confirmRevert() {
  const agent = selectedAgent.value
  const snapshot = revertTarget.value
  if (!agent || !snapshot || reverting.value) return
  reverting.value = true
  try {
    await apolloClient.mutate<RevertAgentSnapshotResult, RevertAgentSnapshotVars>({
      mutation: REVERT_AGENT_SNAPSHOT_MUTATION,
      variables: {
        input: { agentId: agent.id, snapshotName: snapshot.name, confirm: true },
      },
    })
    toast.success(locale.t('agentSnapshot.toast.reverted'))
    revertTarget.value = null
    await refetchSnapshots()
  } catch (error) {
    toast.error(graphqlErrorMessage(error, locale.t('agentSnapshot.toast.revertFailed')))
  } finally {
    reverting.value = false
  }
}

const revertBody = computed(() =>
  revertTarget.value
    ? fmt('agentSnapshot.confirm.revert.body', { name: revertTarget.value.name })
    : '',
)

// --- setAgentStatus (start / stop) -------------------------------------------
const changingStatus = ref(false)

async function changeStatus(status: AgentLifecycleStatus) {
  const agent = selectedAgent.value
  if (!agent || changingStatus.value) return
  changingStatus.value = true
  try {
    await apolloClient.mutate<SetAgentStatusResult, SetAgentStatusVars>({
      mutation: SET_AGENT_STATUS_MUTATION,
      variables: { id: agent.id, status },
    })
    toast.success(locale.t('agentSnapshot.toast.statusChanged'))
  } catch (error) {
    toast.error(graphqlErrorMessage(error, locale.t('agentSnapshot.toast.statusFailed')))
  } finally {
    changingStatus.value = false
  }
}

// --- recycleAgent (destructive) ----------------------------------------------
const recycleOpen = ref(false)
const recycling = ref(false)

function askRecycle() {
  if (!selectedAgent.value) return
  recycleOpen.value = true
}
function cancelRecycle() {
  if (recycling.value) return
  recycleOpen.value = false
}

async function confirmRecycle() {
  const agent = selectedAgent.value
  if (!agent || recycling.value) return
  recycling.value = true
  try {
    await apolloClient.mutate<RecycleAgentResult, RecycleAgentVars>({
      mutation: RECYCLE_AGENT_MUTATION,
      variables: { input: { agentId: agent.id, confirm: true } },
    })
    toast.success(locale.t('agentSnapshot.toast.recycled'))
    recycleOpen.value = false
    await refetchSnapshots()
  } catch (error) {
    toast.error(graphqlErrorMessage(error, locale.t('agentSnapshot.toast.recycleFailed')))
  } finally {
    recycling.value = false
  }
}

const recycleBody = computed(() =>
  selectedAgent.value
    ? fmt('agentSnapshot.confirm.recycle.body', { name: selectedAgent.value.name })
    : '',
)

// --- Refresh -----------------------------------------------------------------
async function refresh() {
  if (!selectedAgentId.value || snapshotsLoading.value) return
  try {
    await refetchSnapshots()
    toast.success(locale.t('agentSnapshot.toast.refreshed'))
  } catch (error) {
    toast.error(graphqlErrorMessage(error, locale.t('agentSnapshot.toast.refreshFailed')))
  }
}
</script>

<template>
  <section class="agent-snapshot-page">
    <header class="page-head">
      <h1 cds-text="title" class="heading">{{ locale.t('agentSnapshot.title') }}</h1>
      <p cds-text="body" class="desc muted">{{ locale.t('agentSnapshot.description') }}</p>
    </header>

    <div class="content-card">
      <!-- Toolbar: agent picker + refresh -->
      <div class="toolbar">
        <cds-select control-width="shrink">
          <label>{{ locale.t('agentSnapshot.picker.label') }}</label>
          <select
            :value="selectedAgentId ?? ''"
            :aria-label="locale.t('agentSnapshot.picker.label')"
            :disabled="agentsLoading || agents.length === 0"
            @change="onAgentChange"
          >
            <option v-if="agents.length === 0" value="" disabled>
              {{ agentsLoading ? locale.t('agentSnapshot.picker.loading') : locale.t('agentSnapshot.picker.empty') }}
            </option>
            <option v-for="agent in agents" :key="agent.id" :value="agent.id">
              {{ agent.name }}
            </option>
          </select>
        </cds-select>

        <cds-button
          action="ghost"
          class="refresh-button"
          :disabled="!selectedAgentId || snapshotsLoading"
          :aria-label="locale.t('agentSnapshot.action.refresh')"
          :title="locale.t('agentSnapshot.action.refresh')"
          @click="refresh"
        >
          <cds-icon shape="refresh" size="md" :class="{ spinning: snapshotsLoading }"></cds-icon>
          <span>{{ locale.t('agentSnapshot.action.refresh') }}</span>
        </cds-button>
      </div>

      <!-- Empty state when no agent is selected -->
      <div v-if="!selectedAgent" class="detail-empty">
        <cds-icon shape="history" size="xl" aria-hidden="true"></cds-icon>
        <p cds-text="subsection" aria-live="polite">{{ locale.t('agentSnapshot.detail.empty') }}</p>
      </div>

      <template v-else>
        <!-- Lifecycle bar -->
        <section class="lifecycle" :aria-label="locale.t('agentSnapshot.lifecycle.title')">
          <div class="lifecycle-status">
            <span class="lifecycle-label muted">{{ locale.t('agentSnapshot.lifecycle.status') }}</span>
            <cds-badge :status="statusBadge(selectedAgent.status)">
              {{ statusLabel(selectedAgent.status) }}
            </cds-badge>
          </div>
          <div class="lifecycle-actions">
            <cds-button
              action="outline"
              size="sm"
              :disabled="!canStart || changingStatus"
              @click="changeStatus('running')"
            >
              <cds-icon shape="bolt" size="sm" aria-hidden="true"></cds-icon>
              {{ locale.t('agentSnapshot.lifecycle.start') }}
            </cds-button>
            <cds-button
              action="outline"
              size="sm"
              :disabled="!canStop || changingStatus"
              @click="changeStatus('stopped')"
            >
              <cds-icon shape="stop" size="sm" aria-hidden="true"></cds-icon>
              {{ locale.t('agentSnapshot.lifecycle.stop') }}
            </cds-button>
            <cds-button
              action="outline"
              status="danger"
              size="sm"
              :disabled="recycling"
              @click="askRecycle"
            >
              <cds-icon shape="trash" size="sm" aria-hidden="true"></cds-icon>
              {{ locale.t('agentSnapshot.lifecycle.recycle') }}
            </cds-button>
          </div>
        </section>

        <!-- Snapshots -->
        <section class="snapshots">
          <div class="snapshots-head">
            <h2 cds-text="subsection" class="snapshots-title">
              {{ locale.t('agentSnapshot.list.title') }}
              <span class="snapshots-count muted">({{ snapshots.length }})</span>
            </h2>
            <cds-button action="solid" status="primary" size="sm" @click="openCreate">
              <cds-icon shape="plus-circle" size="sm" aria-hidden="true"></cds-icon>
              {{ locale.t('agentSnapshot.action.createSnapshot') }}
            </cds-button>
          </div>

          <p
            v-if="snapshotsLoading && snapshots.length === 0"
            class="panel-state muted"
            aria-live="polite"
          >
            {{ locale.t('agentSnapshot.list.loading') }}
          </p>
          <p v-else-if="snapshotsError" class="panel-state error" role="alert">
            {{ locale.t('agentSnapshot.list.error') }}
          </p>
          <p v-else-if="snapshots.length === 0" class="panel-state muted" aria-live="polite">
            {{ locale.t('agentSnapshot.list.empty') }}
          </p>

          <div v-else class="table-wrap">
            <table class="snap-table">
              <thead>
                <tr>
                  <th scope="col">{{ locale.t('agentSnapshot.col.name') }}</th>
                  <th scope="col">{{ locale.t('agentSnapshot.col.description') }}</th>
                  <th scope="col">{{ locale.t('agentSnapshot.col.state') }}</th>
                  <th scope="col">{{ locale.t('agentSnapshot.col.createdAt') }}</th>
                  <th scope="col" class="actions-col">{{ locale.t('agentSnapshot.col.actions') }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="snapshot in snapshots" :key="snapshot.name">
                  <td class="cell-name" :title="snapshot.name">{{ snapshot.name }}</td>
                  <td class="cell-desc muted">
                    {{ snapshot.description || locale.t('agentSnapshot.row.noDescription') }}
                  </td>
                  <td>{{ snapshot.state }}</td>
                  <td>{{ snapshot.createdAt }}</td>
                  <td class="actions-col">
                    <cds-button
                      action="outline"
                      status="danger"
                      size="sm"
                      :disabled="reverting"
                      @click="askRevert(snapshot)"
                    >
                      <cds-icon shape="two-way-arrows" size="sm" aria-hidden="true"></cds-icon>
                      {{ locale.t('agentSnapshot.row.revert') }}
                    </cds-button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      </template>
    </div>

    <!-- Create snapshot dialog -->
    <CreateSnapshotDialog
      :open="createOpen"
      :agent-name="selectedAgent?.name ?? ''"
      :saving="creating"
      @close="closeCreate"
      @submit="submitCreate"
    />

    <!-- Revert confirm (destructive) -->
    <ConfirmDialog
      :open="!!revertTarget"
      :title="locale.t('agentSnapshot.confirm.revert.title')"
      :body="revertBody"
      :danger="true"
      @confirm="confirmRevert"
      @close="cancelRevert"
    />

    <!-- Recycle confirm (destructive) -->
    <ConfirmDialog
      :open="recycleOpen"
      :title="locale.t('agentSnapshot.confirm.recycle.title')"
      :body="recycleBody"
      :danger="true"
      @confirm="confirmRecycle"
      @close="cancelRecycle"
    />
  </section>
</template>

<style scoped>
.agent-snapshot-page {
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
  align-items: flex-end;
  gap: 10px;
}
.refresh-button {
  margin-left: auto;
}
.detail-empty {
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  color: var(--cds-alias-typography-color-300, #565656);
}
.lifecycle {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 16px;
  border: 1px solid var(--cds-alias-object-border-color, #e8e8e8);
  border-radius: 4px;
}
.lifecycle-status {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}
.lifecycle-label {
  font-size: 13px;
}
.lifecycle-actions {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}
.snapshots {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px 16px 16px;
  border: 1px solid var(--cds-alias-object-border-color, #e8e8e8);
  border-radius: 4px;
  overflow: auto;
}
.snapshots-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.snapshots-title {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
}
.snapshots-count {
  font-weight: 400;
}
.panel-state {
  margin: 0;
  padding: 16px 4px;
  font-size: 13px;
}
.panel-state.error {
  color: var(--cds-alias-status-danger, #c92100);
}
.table-wrap {
  min-width: 0;
  overflow: auto;
}
.snap-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}
.snap-table th,
.snap-table td {
  text-align: left;
  padding: 8px 12px;
  border-bottom: 1px solid var(--cds-alias-object-border-color, #e8e8e8);
  vertical-align: middle;
}
.snap-table th {
  font-size: 12px;
  font-weight: 600;
  color: var(--cds-alias-typography-color-300, #565656);
}
.cell-name {
  font-weight: 600;
  max-width: 220px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.cell-desc {
  max-width: 280px;
}
.actions-col {
  text-align: right;
  white-space: nowrap;
}
.muted {
  color: var(--cds-alias-typography-color-300, #565656);
}
.spinning {
  animation: agent-snapshot-spin 1s linear infinite;
  transform-origin: center;
}
@keyframes agent-snapshot-spin {
  to {
    transform: rotate(360deg);
  }
}
@media (max-width: 860px) {
  .lifecycle {
    flex-direction: column;
    align-items: flex-start;
  }
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
