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
import { computed, ref } from 'vue'
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

// Self-contained i18n: the shared locale store (src/stores/locale.ts) does not
// carry upstreamRouter.* keys and is off-limits for this change. `tt` resolves
// from this fallback dictionary, deferring to the store only for shared keys.
// See the report for the canonical zh/en list to fold into the store later.
const FALLBACK: Record<string, { zh: string; en: string }> = {
  'upstreamRouter.title': { zh: '上游与路由分层', en: 'Upstreams & Router Tiers' },
  'upstreamRouter.description': {
    zh: '管理算力网关的上游后端,并将难度分层映射到模型别名,实时同步至 litellm 复杂度路由。',
    en: 'Manage gateway upstream backends and map difficulty tiers to model aliases, synced live to the litellm complexity router.',
  },
  'upstreamRouter.tab.upstreams': { zh: '上游', en: 'Upstreams' },
  'upstreamRouter.tab.tiers': { zh: '路由分层', en: 'Router Tiers' },
  'upstreamRouter.action.create': { zh: '新建上游', en: 'New Upstream' },
  'upstreamRouter.action.refresh': { zh: '刷新', en: 'Refresh' },
  'upstreamRouter.action.edit': { zh: '编辑', en: 'Edit' },
  'upstreamRouter.action.delete': { zh: '删除', en: 'Delete' },
  'upstreamRouter.action.save': { zh: '保存', en: 'Save' },
  'upstreamRouter.action.cancel': { zh: '取消', en: 'Cancel' },
  'upstreamRouter.action.addTier': { zh: '新增分层映射', en: 'Add Tier Mapping' },
  // Upstream table
  'upstreamRouter.upstream.col.name': { zh: '名称', en: 'Name' },
  'upstreamRouter.upstream.col.provider': { zh: '提供方', en: 'Provider' },
  'upstreamRouter.upstream.col.model': { zh: '模型', en: 'Model' },
  'upstreamRouter.upstream.col.apiBase': { zh: 'API 地址', en: 'API Base' },
  'upstreamRouter.upstream.col.status': { zh: '状态', en: 'Status' },
  'upstreamRouter.upstream.col.actions': { zh: '操作', en: 'Actions' },
  'upstreamRouter.upstream.empty': { zh: '暂无上游,点击「新建上游」添加。', en: 'No upstreams yet. Click "New Upstream" to add one.' },
  'upstreamRouter.upstream.loading': { zh: '加载中…', en: 'Loading…' },
  'upstreamRouter.upstream.error': { zh: '上游列表加载失败', en: 'Failed to load upstreams' },
  'upstreamRouter.upstream.apiBaseDefault': { zh: '默认', en: 'Default' },
  // Upstream form
  'upstreamRouter.upstream.dialog.createTitle': { zh: '新建上游', en: 'New Upstream' },
  'upstreamRouter.upstream.dialog.editTitle': { zh: '编辑上游', en: 'Edit Upstream' },
  'upstreamRouter.upstream.field.name': { zh: '名称', en: 'Name' },
  'upstreamRouter.upstream.field.namePlaceholder': { zh: '上游唯一名称', en: 'Unique upstream name' },
  'upstreamRouter.upstream.field.nameLocked': { zh: '名称为唯一标识,创建后不可修改。', en: 'Name is the identity and cannot be changed after creation.' },
  'upstreamRouter.upstream.field.provider': { zh: '提供方', en: 'Provider' },
  'upstreamRouter.upstream.field.model': { zh: '模型', en: 'Model' },
  'upstreamRouter.upstream.field.modelPlaceholder': { zh: '如 gpt-4o / claude-3-5-sonnet', en: 'e.g. gpt-4o / claude-3-5-sonnet' },
  'upstreamRouter.upstream.field.apiBase': { zh: 'API 地址(可选)', en: 'API Base (optional)' },
  'upstreamRouter.upstream.field.apiBasePlaceholder': { zh: 'https://… 留空则用提供方默认', en: 'https://… leave blank for provider default' },
  'upstreamRouter.upstream.field.apiKey': { zh: 'API 密钥', en: 'API Key' },
  'upstreamRouter.upstream.field.apiKeyPlaceholder': { zh: '写入密钥库,明文不落库', en: 'Stored in secret store, never persisted in plaintext' },
  'upstreamRouter.upstream.field.apiKeyEditPlaceholder': { zh: '留空则保留现有密钥', en: 'Leave blank to keep the existing key' },
  'upstreamRouter.upstream.field.apiKeyHint': { zh: '密钥仅写入,不会被读取回显。', en: 'The key is write-only and is never read back.' },
  'upstreamRouter.upstream.field.enabled': { zh: '启用', en: 'Enabled' },
  // Tier table
  'upstreamRouter.tier.col.tier': { zh: '难度分层', en: 'Tier' },
  'upstreamRouter.tier.col.modelAlias': { zh: '模型别名', en: 'Model Alias' },
  'upstreamRouter.tier.col.actions': { zh: '操作', en: 'Actions' },
  'upstreamRouter.tier.unset': { zh: '未映射', en: 'Unmapped' },
  'upstreamRouter.tier.empty': { zh: '暂无分层映射', en: 'No tier mappings yet' },
  'upstreamRouter.tier.loading': { zh: '加载中…', en: 'Loading…' },
  'upstreamRouter.tier.error': { zh: '分层映射加载失败', en: 'Failed to load tier mappings' },
  'upstreamRouter.tier.allMapped': { zh: '全部分层均已映射', en: 'All tiers are mapped' },
  // Tier form
  'upstreamRouter.tier.dialog.createTitle': { zh: '新增分层映射', en: 'Add Tier Mapping' },
  'upstreamRouter.tier.dialog.editTitle': { zh: '编辑分层映射', en: 'Edit Tier Mapping' },
  'upstreamRouter.tier.field.tier': { zh: '难度分层', en: 'Tier' },
  'upstreamRouter.tier.field.modelAlias': { zh: '模型别名', en: 'Model Alias' },
  'upstreamRouter.tier.field.modelAliasPlaceholder': { zh: '该分层路由到的模型别名', en: 'Model alias this tier routes to' },
  'upstreamRouter.tier.field.modelAliasHint': { zh: '需为已配置模型路由的别名。', en: 'Must be an alias of a configured model route.' },
  // Provider labels
  'upstreamRouter.provider.vllm': { zh: 'vLLM', en: 'vLLM' },
  'upstreamRouter.provider.openai': { zh: 'OpenAI', en: 'OpenAI' },
  'upstreamRouter.provider.anthropic': { zh: 'Anthropic', en: 'Anthropic' },
  'upstreamRouter.provider.minimax': { zh: 'MiniMax', en: 'MiniMax' },
  'upstreamRouter.provider.codex': { zh: 'Codex', en: 'Codex' },
  // Tier-level labels
  'upstreamRouter.tierLevel.SIMPLE': { zh: '简单 (SIMPLE)', en: 'Simple' },
  'upstreamRouter.tierLevel.MEDIUM': { zh: '中等 (MEDIUM)', en: 'Medium' },
  'upstreamRouter.tierLevel.COMPLEX': { zh: '复杂 (COMPLEX)', en: 'Complex' },
  'upstreamRouter.tierLevel.REASONING': { zh: '推理 (REASONING)', en: 'Reasoning' },
  // Status
  'upstreamRouter.status.enabled': { zh: '已启用', en: 'Enabled' },
  'upstreamRouter.status.disabled': { zh: '已停用', en: 'Disabled' },
  // Confirm
  'upstreamRouter.confirm.deleteTitle': { zh: '删除上游', en: 'Delete Upstream' },
  'upstreamRouter.confirm.deleteBody': { zh: '确定要删除上游「{name}」吗?此操作不可撤销。', en: 'Delete upstream "{name}"? This cannot be undone.' },
  // Toasts
  'upstreamRouter.toast.created': { zh: '上游已创建', en: 'Upstream created' },
  'upstreamRouter.toast.updated': { zh: '上游已更新', en: 'Upstream updated' },
  'upstreamRouter.toast.saveFailed': { zh: '保存上游失败', en: 'Failed to save upstream' },
  'upstreamRouter.toast.deleted': { zh: '上游已删除', en: 'Upstream deleted' },
  'upstreamRouter.toast.deleteFailed': { zh: '删除上游失败', en: 'Failed to delete upstream' },
  'upstreamRouter.toast.tierSaved': { zh: '分层映射已更新', en: 'Tier mapping updated' },
  'upstreamRouter.toast.tierSaveFailed': { zh: '保存分层映射失败', en: 'Failed to save tier mapping' },
  'upstreamRouter.toast.refreshed': { zh: '已刷新', en: 'Refreshed' },
  'upstreamRouter.toast.refreshFailed': { zh: '刷新失败', en: 'Failed to refresh' },
}

// Resolve upstreamRouter.* from the local fallback, otherwise defer to the store.
function tt(key: string): string {
  const entry = FALLBACK[key]
  if (entry) return entry[locale.locale]
  return locale.t(key)
}

type TabKey = 'upstreams' | 'tiers'
const activeTab = ref<TabKey>('upstreams')

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
  tt('upstreamRouter.confirm.deleteBody').replace('{name}', pendingDelete.value?.name ?? ''),
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
    toast.success(tt(isEditing ? 'upstreamRouter.toast.updated' : 'upstreamRouter.toast.created'))
    upstreamDialogOpen.value = false
    editingUpstream.value = null
    await refetchUpstreams()
  } catch (error) {
    toast.error(graphqlErrorMessage(error, tt('upstreamRouter.toast.saveFailed')))
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
    toast.success(tt('upstreamRouter.toast.deleted'))
    await refetchUpstreams()
  } catch (error) {
    toast.error(graphqlErrorMessage(error, tt('upstreamRouter.toast.deleteFailed')))
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
    toast.success(tt('upstreamRouter.toast.tierSaved'))
    tierDialogOpen.value = false
    editingTier.value = null
    await refetchTiers()
  } catch (error) {
    toast.error(graphqlErrorMessage(error, tt('upstreamRouter.toast.tierSaveFailed')))
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
    toast.success(tt('upstreamRouter.toast.refreshed'))
  } catch (error) {
    toast.error(graphqlErrorMessage(error, tt('upstreamRouter.toast.refreshFailed')))
  }
}

function providerLabel(provider: string): string {
  return tt(`upstreamRouter.provider.${provider}`)
}

function tierLevelLabel(level: string): string {
  return tt(`upstreamRouter.tierLevel.${level}`)
}
</script>

<template>
  <section class="ur-page">
    <header class="page-head">
      <h1 cds-text="title" class="heading">{{ tt('upstreamRouter.title') }}</h1>
      <p cds-text="body" class="desc muted">{{ tt('upstreamRouter.description') }}</p>
    </header>

    <div class="content-card">
      <div class="tabs" role="tablist" :aria-label="tt('upstreamRouter.title')">
        <button
          type="button"
          role="tab"
          class="tab"
          :class="{ active: activeTab === 'upstreams' }"
          :aria-selected="activeTab === 'upstreams'"
          @click="activeTab = 'upstreams'"
        >
          <cds-icon shape="router" size="sm" aria-hidden="true"></cds-icon>
          {{ tt('upstreamRouter.tab.upstreams') }}
        </button>
        <button
          type="button"
          role="tab"
          class="tab"
          :class="{ active: activeTab === 'tiers' }"
          :aria-selected="activeTab === 'tiers'"
          @click="activeTab = 'tiers'"
        >
          <cds-icon shape="forking" size="sm" aria-hidden="true"></cds-icon>
          {{ tt('upstreamRouter.tab.tiers') }}
        </button>
        <cds-button
          action="ghost"
          class="refresh-button"
          :disabled="activeTab === 'upstreams' ? upstreamsLoading : tiersLoading"
          :aria-label="tt('upstreamRouter.action.refresh')"
          :title="tt('upstreamRouter.action.refresh')"
          @click="refreshActive"
        >
          <cds-icon
            shape="refresh"
            size="md"
            :class="{ spinning: activeTab === 'upstreams' ? upstreamsLoading : tiersLoading }"
          ></cds-icon>
          <span>{{ tt('upstreamRouter.action.refresh') }}</span>
        </cds-button>
      </div>

      <!-- Upstreams tab -->
      <div v-show="activeTab === 'upstreams'" class="tab-panel" role="tabpanel">
        <div class="toolbar">
          <cds-button action="outline" status="primary" @click="openCreateUpstream">
            <cds-icon shape="plus-circle" size="sm" aria-hidden="true"></cds-icon>
            {{ tt('upstreamRouter.action.create') }}
          </cds-button>
        </div>

        <div class="grid-card">
          <cds-grid border="row" column-layout="flex" role="grid" :aria-label="tt('upstreamRouter.tab.upstreams')">
            <cds-grid-column width="22%">{{ tt('upstreamRouter.upstream.col.name') }}</cds-grid-column>
            <cds-grid-column width="14%">{{ tt('upstreamRouter.upstream.col.provider') }}</cds-grid-column>
            <cds-grid-column width="20%">{{ tt('upstreamRouter.upstream.col.model') }}</cds-grid-column>
            <cds-grid-column width="20%">{{ tt('upstreamRouter.upstream.col.apiBase') }}</cds-grid-column>
            <cds-grid-column width="12%">{{ tt('upstreamRouter.upstream.col.status') }}</cds-grid-column>
            <cds-grid-column width="12%">{{ tt('upstreamRouter.upstream.col.actions') }}</cds-grid-column>

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
                <span v-else class="muted">{{ tt('upstreamRouter.upstream.apiBaseDefault') }}</span>
              </cds-grid-cell>
              <cds-grid-cell>
                <cds-badge :status="upstream.enabled ? 'success' : 'neutral'" class="status-badge">
                  <cds-icon :shape="upstream.enabled ? 'check-circle' : 'ban'" size="sm"></cds-icon>
                  {{ tt(upstream.enabled ? 'upstreamRouter.status.enabled' : 'upstreamRouter.status.disabled') }}
                </cds-badge>
              </cds-grid-cell>
              <cds-grid-cell>
                <div class="row-actions">
                  <button type="button" class="row-action" @click="openEditUpstream(upstream)">
                    <cds-icon shape="pencil" size="sm"></cds-icon>
                    <span>{{ tt('upstreamRouter.action.edit') }}</span>
                  </button>
                  <button type="button" class="row-action danger" @click="requestDeleteUpstream(upstream)">
                    <cds-icon shape="trash" size="sm"></cds-icon>
                    <span>{{ tt('upstreamRouter.action.delete') }}</span>
                  </button>
                </div>
              </cds-grid-cell>
            </cds-grid-row>

            <cds-grid-placeholder v-if="upstreamsLoading">
              <p cds-text="subsection">{{ tt('upstreamRouter.upstream.loading') }}</p>
            </cds-grid-placeholder>
            <cds-grid-placeholder v-else-if="upstreamsError">
              <cds-icon shape="ban" size="xl"></cds-icon>
              <p cds-text="subsection">{{ tt('upstreamRouter.upstream.error') }}</p>
            </cds-grid-placeholder>
            <cds-grid-placeholder v-else-if="upstreams.length === 0">
              <cds-icon shape="router" size="xl"></cds-icon>
              <p cds-text="subsection">{{ tt('upstreamRouter.upstream.empty') }}</p>
              <cds-button action="outline" size="sm" @click="openCreateUpstream">
                {{ tt('upstreamRouter.action.create') }}
              </cds-button>
            </cds-grid-placeholder>
          </cds-grid>
        </div>
      </div>

      <!-- Router tiers tab -->
      <div v-show="activeTab === 'tiers'" class="tab-panel" role="tabpanel">
        <div class="toolbar">
          <cds-button
            action="outline"
            status="primary"
            :disabled="allTiersMapped"
            :title="allTiersMapped ? tt('upstreamRouter.tier.allMapped') : undefined"
            @click="openCreateTier"
          >
            <cds-icon shape="plus-circle" size="sm" aria-hidden="true"></cds-icon>
            {{ tt('upstreamRouter.action.addTier') }}
          </cds-button>
        </div>

        <div class="grid-card">
          <cds-grid border="row" column-layout="flex" role="grid" :aria-label="tt('upstreamRouter.tab.tiers')">
            <cds-grid-column width="30%">{{ tt('upstreamRouter.tier.col.tier') }}</cds-grid-column>
            <cds-grid-column width="50%">{{ tt('upstreamRouter.tier.col.modelAlias') }}</cds-grid-column>
            <cds-grid-column width="20%">{{ tt('upstreamRouter.tier.col.actions') }}</cds-grid-column>

            <cds-grid-row v-for="tier in tiers" :key="tier.id">
              <cds-grid-cell>
                <strong class="cell-strong">{{ tierLevelLabel(tier.tier) }}</strong>
              </cds-grid-cell>
              <cds-grid-cell>
                <span v-if="tier.modelAlias" class="cell-ellipsis" :title="tier.modelAlias">
                  {{ tier.modelAlias }}
                </span>
                <span v-else class="muted">{{ tt('upstreamRouter.tier.unset') }}</span>
              </cds-grid-cell>
              <cds-grid-cell>
                <div class="row-actions">
                  <button type="button" class="row-action" @click="openEditTier(tier)">
                    <cds-icon shape="pencil" size="sm"></cds-icon>
                    <span>{{ tt('upstreamRouter.action.edit') }}</span>
                  </button>
                </div>
              </cds-grid-cell>
            </cds-grid-row>

            <cds-grid-placeholder v-if="tiersLoading">
              <p cds-text="subsection">{{ tt('upstreamRouter.tier.loading') }}</p>
            </cds-grid-placeholder>
            <cds-grid-placeholder v-else-if="tiersError">
              <cds-icon shape="ban" size="xl"></cds-icon>
              <p cds-text="subsection">{{ tt('upstreamRouter.tier.error') }}</p>
            </cds-grid-placeholder>
            <cds-grid-placeholder v-else-if="tiers.length === 0">
              <cds-icon shape="forking" size="xl"></cds-icon>
              <p cds-text="subsection">{{ tt('upstreamRouter.tier.empty') }}</p>
              <cds-button action="outline" size="sm" @click="openCreateTier">
                {{ tt('upstreamRouter.action.addTier') }}
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
      :tt="tt"
      @close="closeUpstreamDialog"
      @submit="submitUpstream"
    />

    <RouterTierFormDialog
      v-if="tierDialogOpen"
      :open="tierDialogOpen"
      :tier="editingTier"
      :used-tiers="usedTiers"
      :saving="savingTier"
      :tt="tt"
      @close="closeTierDialog"
      @submit="submitTier"
    />

    <ConfirmDialog
      :open="pendingDelete !== null"
      :title="tt('upstreamRouter.confirm.deleteTitle')"
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
