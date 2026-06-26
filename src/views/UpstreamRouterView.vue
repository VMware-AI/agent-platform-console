<script setup lang="ts">
/**
 * 上游与路由分层 (Upstreams & Router Tiers) — schema/gateway-routing.graphql.
 *
 * Two-tab page wired to the real backend (no mocks):
 *   - 上游 (Upstreams): CRUD list. upsertUpstream keys by `name`; deleteUpstream
 *     removes by id (confirm dialog). apiKey is write-only (secret store).
 *   - 路由分层 (Router Tiers): maps each difficulty tier (SIMPLE/MEDIUM/COMPLEX/
 *     REASONING) to a model alias via setRouterTier; the only write is upsert.
 *
 * Both queries/mutations are gated `@hasPermission(perm: "route:manage")`; the
 * backend surfaces denials as GraphQL errors shown via toast.
 */
import { computed, nextTick, ref } from 'vue'
import { useQuery } from '@vue/apollo-composable'
import { apolloClient } from '@/api/graphql/client'
import { useLocaleStore } from '@/stores/locale'
import { useToast } from '@/composables/useToast'
import { graphqlErrorMessage } from '@/api/graphql/errors'
import ConfirmDialog from '@/views/user-role/ConfirmDialog.vue'
import UpstreamFormDialog from '@/views/upstream-router/UpstreamFormDialog.vue'
import RouterTierFormDialog from '@/views/upstream-router/RouterTierFormDialog.vue'
import {
  UPSTREAMS_ROUTING_QUERY,
  UPSERT_UPSTREAM_ROUTING,
  DELETE_UPSTREAM_ROUTING,
  ROUTER_TIERS_ROUTING_QUERY,
  SET_ROUTER_TIER_ROUTING,
  type UpstreamNode,
  type UpstreamsRoutingResult,
  type UpsertUpstreamRoutingResult,
  type UpsertUpstreamRoutingVars,
  type DeleteUpstreamRoutingResult,
  type DeleteUpstreamRoutingVars,
  type RouterTierLevel,
  type RouterTierNode,
  type RouterTiersRoutingResult,
  type SetRouterTierRoutingResult,
  type SetRouterTierRoutingVars,
} from '@/api/graphql/queries/gateway-routing'
import '@/components/icons'

const locale = useLocaleStore()
const toast = useToast()

type TabKey = 'upstreams' | 'tiers'
const activeTab = ref<TabKey>('upstreams')

// a11y: a proper tablist with roving tabindex + arrow-key navigation. Only the
// active tab is in the tab order; Left/Right/Home/End move (and activate) the
// selection per the WAI-ARIA tabs pattern.
const TAB_ORDER: TabKey[] = ['upstreams', 'tiers']
const tabRefs = ref<Record<TabKey, HTMLButtonElement | null>>({
  upstreams: null,
  tiers: null,
})

function setTabRef(key: TabKey, el: Element | null) {
  tabRefs.value[key] = el as HTMLButtonElement | null
}

function selectTab(key: TabKey) {
  activeTab.value = key
}

function onTabKeydown(event: KeyboardEvent) {
  const current = TAB_ORDER.indexOf(activeTab.value)
  let nextIndex = current
  if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
    nextIndex = (current + 1) % TAB_ORDER.length
  } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
    nextIndex = (current - 1 + TAB_ORDER.length) % TAB_ORDER.length
  } else if (event.key === 'Home') {
    nextIndex = 0
  } else if (event.key === 'End') {
    nextIndex = TAB_ORDER.length - 1
  } else {
    return
  }
  event.preventDefault()
  const nextKey = TAB_ORDER[nextIndex]
  activeTab.value = nextKey
  nextTick(() => tabRefs.value[nextKey]?.focus())
}

// ---- Upstreams ----
const {
  result: upstreamsResult,
  loading: upstreamsLoading,
  error: upstreamsError,
  refetch: refetchUpstreams,
} = useQuery<UpstreamsRoutingResult>(UPSTREAMS_ROUTING_QUERY)

const upstreams = computed<UpstreamNode[]>(() => upstreamsResult.value?.upstreams ?? [])

const upstreamDialogOpen = ref(false)
const editingUpstream = ref<UpstreamNode | null>(null)
const savingUpstream = ref(false)
const pendingDelete = ref<UpstreamNode | null>(null)

const deleteBody = computed(() =>
  locale.t('upstreamRouter.confirm.deleteBody').replace('{name}', pendingDelete.value?.name ?? ''),
)

function openCreateUpstream() {
  editingUpstream.value = null
  upstreamDialogOpen.value = true
}

function openEditUpstream(upstream: UpstreamNode) {
  editingUpstream.value = upstream
  upstreamDialogOpen.value = true
}

function closeUpstreamDialog() {
  if (savingUpstream.value) return
  upstreamDialogOpen.value = false
  editingUpstream.value = null
}

async function submitUpstream(input: UpsertUpstreamRoutingVars['input']) {
  if (savingUpstream.value) return
  const isEditing = Boolean(editingUpstream.value)
  savingUpstream.value = true
  try {
    await apolloClient.mutate<UpsertUpstreamRoutingResult, UpsertUpstreamRoutingVars>({
      mutation: UPSERT_UPSTREAM_ROUTING,
      variables: { input },
    })
    toast.success(locale.t(isEditing ? 'upstreamRouter.toast.updated' : 'upstreamRouter.toast.created'))
    upstreamDialogOpen.value = false
    editingUpstream.value = null
    await refetchUpstreams()
  } catch (error) {
    toast.error(graphqlErrorMessage(error, locale.t('upstreamRouter.toast.saveFailed')))
  } finally {
    savingUpstream.value = false
  }
}

function requestDeleteUpstream(upstream: UpstreamNode) {
  pendingDelete.value = upstream
}

function closeDeleteUpstream() {
  pendingDelete.value = null
}

async function confirmDeleteUpstream() {
  const target = pendingDelete.value
  pendingDelete.value = null
  if (!target) return
  try {
    await apolloClient.mutate<DeleteUpstreamRoutingResult, DeleteUpstreamRoutingVars>({
      mutation: DELETE_UPSTREAM_ROUTING,
      variables: { id: target.id },
    })
    toast.success(locale.t('upstreamRouter.toast.deleted'))
    await refetchUpstreams()
  } catch (error) {
    toast.error(graphqlErrorMessage(error, locale.t('upstreamRouter.toast.deleteFailed')))
  }
}

// ---- Router tiers ----
const {
  result: tiersResult,
  loading: tiersLoading,
  error: tiersError,
  refetch: refetchTiers,
} = useQuery<RouterTiersRoutingResult>(ROUTER_TIERS_ROUTING_QUERY)

const tiers = computed<RouterTierNode[]>(() => tiersResult.value?.routerTiers ?? [])
const usedTiers = computed<RouterTierLevel[]>(() => tiers.value.map((t) => t.tier))
const allTiersMapped = computed(() => usedTiers.value.length >= 4)

const tierDialogOpen = ref(false)
const editingTier = ref<RouterTierNode | null>(null)
const savingTier = ref(false)

function openCreateTier() {
  editingTier.value = null
  tierDialogOpen.value = true
}

function openEditTier(tier: RouterTierNode) {
  editingTier.value = tier
  tierDialogOpen.value = true
}

function closeTierDialog() {
  if (savingTier.value) return
  tierDialogOpen.value = false
  editingTier.value = null
}

async function submitTier(payload: { tier: RouterTierLevel; modelAlias: string }) {
  if (savingTier.value) return
  savingTier.value = true
  try {
    await apolloClient.mutate<SetRouterTierRoutingResult, SetRouterTierRoutingVars>({
      mutation: SET_ROUTER_TIER_ROUTING,
      variables: { tier: payload.tier, modelAlias: payload.modelAlias },
    })
    toast.success(locale.t('upstreamRouter.toast.tierSaved'))
    tierDialogOpen.value = false
    editingTier.value = null
    await refetchTiers()
  } catch (error) {
    toast.error(graphqlErrorMessage(error, locale.t('upstreamRouter.toast.tierSaveFailed')))
  } finally {
    savingTier.value = false
  }
}

// ---- shared ----
async function refreshActive() {
  try {
    if (activeTab.value === 'upstreams') {
      if (upstreamsLoading.value) return
      await refetchUpstreams()
    } else {
      if (tiersLoading.value) return
      await refetchTiers()
    }
    toast.success(locale.t('upstreamRouter.toast.refreshed'))
  } catch (error) {
    toast.error(graphqlErrorMessage(error, locale.t('upstreamRouter.toast.refreshFailed')))
  }
}

function providerLabel(provider: string): string {
  return locale.t(`upstreamRouter.provider.${provider}`)
}

function tierLevelLabel(level: string): string {
  return locale.t(`upstreamRouter.tierLevel.${level}`)
}
</script>

<template>
  <section class="ur-page">
    <header class="page-head">
      <h1 cds-text="title" class="heading">{{ locale.t('upstreamRouter.title') }}</h1>
      <p cds-text="body" class="desc muted">{{ locale.t('upstreamRouter.description') }}</p>
    </header>

    <div class="content-card">
      <div class="tabs" role="tablist" :aria-label="locale.t('upstreamRouter.title')">
        <button
          :ref="(el) => setTabRef('upstreams', el as Element | null)"
          id="ur-tab-upstreams"
          type="button"
          role="tab"
          class="tab"
          :class="{ active: activeTab === 'upstreams' }"
          :aria-selected="activeTab === 'upstreams'"
          :tabindex="activeTab === 'upstreams' ? 0 : -1"
          aria-controls="ur-panel-upstreams"
          @click="selectTab('upstreams')"
          @keydown="onTabKeydown"
        >
          <cds-icon shape="router" size="sm" aria-hidden="true"></cds-icon>
          {{ locale.t('upstreamRouter.tab.upstreams') }}
        </button>
        <button
          :ref="(el) => setTabRef('tiers', el as Element | null)"
          id="ur-tab-tiers"
          type="button"
          role="tab"
          class="tab"
          :class="{ active: activeTab === 'tiers' }"
          :aria-selected="activeTab === 'tiers'"
          :tabindex="activeTab === 'tiers' ? 0 : -1"
          aria-controls="ur-panel-tiers"
          @click="selectTab('tiers')"
          @keydown="onTabKeydown"
        >
          <cds-icon shape="forking" size="sm" aria-hidden="true"></cds-icon>
          {{ locale.t('upstreamRouter.tab.tiers') }}
        </button>
        <cds-button
          action="ghost"
          class="refresh-button"
          :disabled="activeTab === 'upstreams' ? upstreamsLoading : tiersLoading"
          :aria-label="locale.t('upstreamRouter.action.refresh')"
          :title="locale.t('upstreamRouter.action.refresh')"
          @click="refreshActive"
        >
          <cds-icon
            shape="refresh"
            size="md"
            :class="{ spinning: activeTab === 'upstreams' ? upstreamsLoading : tiersLoading }"
          ></cds-icon>
          <span>{{ locale.t('upstreamRouter.action.refresh') }}</span>
        </cds-button>
      </div>

      <!-- Upstreams tab -->
      <div
        v-show="activeTab === 'upstreams'"
        id="ur-panel-upstreams"
        class="tab-panel"
        role="tabpanel"
        tabindex="0"
        aria-labelledby="ur-tab-upstreams"
      >
        <div class="toolbar">
          <cds-button action="outline" status="primary" @click="openCreateUpstream">
            <cds-icon shape="plus-circle" size="sm" aria-hidden="true"></cds-icon>
            {{ locale.t('upstreamRouter.action.create') }}
          </cds-button>
        </div>

        <div class="grid-card">
          <cds-grid border="row" column-layout="flex" role="grid" :aria-label="locale.t('upstreamRouter.tab.upstreams')">
            <cds-grid-column width="22%">{{ locale.t('upstreamRouter.upstream.col.name') }}</cds-grid-column>
            <cds-grid-column width="14%">{{ locale.t('upstreamRouter.upstream.col.provider') }}</cds-grid-column>
            <cds-grid-column width="20%">{{ locale.t('upstreamRouter.upstream.col.model') }}</cds-grid-column>
            <cds-grid-column width="20%">{{ locale.t('upstreamRouter.upstream.col.apiBase') }}</cds-grid-column>
            <cds-grid-column width="12%">{{ locale.t('upstreamRouter.upstream.col.status') }}</cds-grid-column>
            <cds-grid-column width="12%">{{ locale.t('upstreamRouter.upstream.col.actions') }}</cds-grid-column>

            <cds-grid-row v-for="upstream in upstreams" :key="upstream.id">
              <cds-grid-cell>
                <strong class="cell-strong" :title="upstream.name">{{ upstream.name }}</strong>
              </cds-grid-cell>
              <cds-grid-cell>{{ providerLabel(upstream.provider) }}</cds-grid-cell>
              <cds-grid-cell>
                <span class="cell-ellipsis" :title="upstream.model">{{ upstream.model }}</span>
              </cds-grid-cell>
              <cds-grid-cell>
                <span v-if="upstream.apiBase" class="cell-ellipsis" :title="upstream.apiBase">
                  {{ upstream.apiBase }}
                </span>
                <span v-else class="muted">{{ locale.t('upstreamRouter.upstream.apiBaseDefault') }}</span>
              </cds-grid-cell>
              <cds-grid-cell>
                <cds-badge :status="upstream.enabled ? 'success' : 'neutral'" class="status-badge">
                  <cds-icon :shape="upstream.enabled ? 'check-circle' : 'ban'" size="sm" aria-hidden="true"></cds-icon>
                  {{ locale.t(upstream.enabled ? 'upstreamRouter.status.enabled' : 'upstreamRouter.status.disabled') }}
                </cds-badge>
              </cds-grid-cell>
              <cds-grid-cell>
                <div class="row-actions">
                  <button type="button" class="row-action" @click="openEditUpstream(upstream)">
                    <cds-icon shape="pencil" size="sm"></cds-icon>
                    <span>{{ locale.t('upstreamRouter.action.edit') }}</span>
                  </button>
                  <button type="button" class="row-action danger" @click="requestDeleteUpstream(upstream)">
                    <cds-icon shape="trash" size="sm"></cds-icon>
                    <span>{{ locale.t('upstreamRouter.action.delete') }}</span>
                  </button>
                </div>
              </cds-grid-cell>
            </cds-grid-row>

            <cds-grid-placeholder v-if="upstreamsLoading" role="status" aria-live="polite">
              <p cds-text="subsection">{{ locale.t('upstreamRouter.upstream.loading') }}</p>
            </cds-grid-placeholder>
            <cds-grid-placeholder v-else-if="upstreamsError" role="alert" aria-live="assertive">
              <cds-icon shape="ban" size="xl" aria-hidden="true"></cds-icon>
              <p cds-text="subsection">{{ locale.t('upstreamRouter.upstream.error') }}</p>
            </cds-grid-placeholder>
            <cds-grid-placeholder v-else-if="upstreams.length === 0" role="status" aria-live="polite">
              <cds-icon shape="router" size="xl" aria-hidden="true"></cds-icon>
              <p cds-text="subsection">{{ locale.t('upstreamRouter.upstream.empty') }}</p>
              <cds-button action="outline" size="sm" @click="openCreateUpstream">
                {{ locale.t('upstreamRouter.action.create') }}
              </cds-button>
            </cds-grid-placeholder>
          </cds-grid>
        </div>
      </div>

      <!-- Router tiers tab -->
      <div
        v-show="activeTab === 'tiers'"
        id="ur-panel-tiers"
        class="tab-panel"
        role="tabpanel"
        tabindex="0"
        aria-labelledby="ur-tab-tiers"
      >
        <div class="toolbar">
          <cds-button
            action="outline"
            status="primary"
            :disabled="allTiersMapped"
            :title="allTiersMapped ? locale.t('upstreamRouter.tier.allMapped') : undefined"
            @click="openCreateTier"
          >
            <cds-icon shape="plus-circle" size="sm" aria-hidden="true"></cds-icon>
            {{ locale.t('upstreamRouter.action.addTier') }}
          </cds-button>
        </div>

        <div class="grid-card">
          <cds-grid border="row" column-layout="flex" role="grid" :aria-label="locale.t('upstreamRouter.tab.tiers')">
            <cds-grid-column width="30%">{{ locale.t('upstreamRouter.tier.col.tier') }}</cds-grid-column>
            <cds-grid-column width="50%">{{ locale.t('upstreamRouter.tier.col.modelAlias') }}</cds-grid-column>
            <cds-grid-column width="20%">{{ locale.t('upstreamRouter.tier.col.actions') }}</cds-grid-column>

            <cds-grid-row v-for="tier in tiers" :key="tier.id">
              <cds-grid-cell>
                <strong class="cell-strong">{{ tierLevelLabel(tier.tier) }}</strong>
              </cds-grid-cell>
              <cds-grid-cell>
                <span v-if="tier.modelAlias" class="cell-ellipsis" :title="tier.modelAlias">
                  {{ tier.modelAlias }}
                </span>
                <span v-else class="muted">{{ locale.t('upstreamRouter.tier.unset') }}</span>
              </cds-grid-cell>
              <cds-grid-cell>
                <div class="row-actions">
                  <button type="button" class="row-action" @click="openEditTier(tier)">
                    <cds-icon shape="pencil" size="sm"></cds-icon>
                    <span>{{ locale.t('upstreamRouter.action.edit') }}</span>
                  </button>
                </div>
              </cds-grid-cell>
            </cds-grid-row>

            <cds-grid-placeholder v-if="tiersLoading" role="status" aria-live="polite">
              <p cds-text="subsection">{{ locale.t('upstreamRouter.tier.loading') }}</p>
            </cds-grid-placeholder>
            <cds-grid-placeholder v-else-if="tiersError" role="alert" aria-live="assertive">
              <cds-icon shape="ban" size="xl" aria-hidden="true"></cds-icon>
              <p cds-text="subsection">{{ locale.t('upstreamRouter.tier.error') }}</p>
            </cds-grid-placeholder>
            <cds-grid-placeholder v-else-if="tiers.length === 0" role="status" aria-live="polite">
              <cds-icon shape="forking" size="xl" aria-hidden="true"></cds-icon>
              <p cds-text="subsection">{{ locale.t('upstreamRouter.tier.empty') }}</p>
              <cds-button action="outline" size="sm" @click="openCreateTier">
                {{ locale.t('upstreamRouter.action.addTier') }}
              </cds-button>
            </cds-grid-placeholder>
          </cds-grid>
        </div>
      </div>
    </div>

    <UpstreamFormDialog
      v-if="upstreamDialogOpen"
      :open="upstreamDialogOpen"
      :upstream="editingUpstream"
      :saving="savingUpstream"
      @close="closeUpstreamDialog"
      @submit="submitUpstream"
    />

    <RouterTierFormDialog
      v-if="tierDialogOpen"
      :open="tierDialogOpen"
      :tier="editingTier"
      :used-tiers="usedTiers"
      :saving="savingTier"
      @close="closeTierDialog"
      @submit="submitTier"
    />

    <ConfirmDialog
      :open="pendingDelete !== null"
      :title="locale.t('upstreamRouter.confirm.deleteTitle')"
      :body="deleteBody"
      danger
      @close="closeDeleteUpstream"
      @confirm="confirmDeleteUpstream"
    />
  </section>
</template>

<style scoped>
.ur-page {
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
  max-width: 760px;
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
.tabs {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 4px;
  border-bottom: 1px solid var(--cds-alias-object-border-color, #d7d7d7);
}
.tab {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  border: 0;
  border-bottom: 2px solid transparent;
  background: transparent;
  color: var(--cds-alias-typography-color-300, #565656);
  font: inherit;
  font-size: 14px;
  cursor: pointer;
}
.tab:hover {
  color: var(--cds-alias-object-app-foreground, #1b1b1b);
}
.tab.active {
  color: var(--cds-alias-object-interaction-color, #0072a3);
  border-bottom-color: var(--cds-alias-object-interaction-color, #0072a3);
  font-weight: 600;
}
.refresh-button {
  margin-left: auto;
}
.tab-panel {
  flex: 1 1 auto;
  min-height: 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.toolbar {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 10px;
}
.grid-card {
  flex: 1 1 auto;
  min-height: 0;
  min-width: 0;
  overflow: auto;
  border: 1px solid var(--cds-alias-object-border-color, #d7d7d7);
  border-radius: 4px;
}
.ur-page cds-grid {
  display: block;
  width: 100%;
  min-width: 760px;
  min-height: 100%;
}
.cell-strong {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.cell-ellipsis {
  display: inline-block;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  vertical-align: bottom;
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
.muted {
  color: var(--cds-alias-typography-color-300, #565656);
}
.spinning {
  animation: ur-spin 1s linear infinite;
  transform-origin: center;
}
@keyframes ur-spin {
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
