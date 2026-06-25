<script setup lang="ts">
/**
 * 智能体配置 (Agent Config) — LLD-11 OKF knowledge grounding.
 *
 * Master-detail page wired to the real backend:
 *   - left: list of AgentConfigs (filter by agentType)
 *   - right: the selected config's read-only details (agentType / default flag)
 *     + its mounted OKF knowledge packs (the `knowledge: [Artifact]` edge)
 *   - editor: a multi-select of available kind=knowledge Artifacts that calls
 *     `setAgentConfigKnowledge(configId, ids)` (replaces the mounted set
 *     wholesale), then refetches.
 *
 * The only mutation here is setAgentConfigKnowledge — everything else is
 * read-only. The mutation is gated `@hasRole(any: [admin, tenant_admin])`;
 * non-privileged callers get a backend error surfaced via toast.
 */
import { computed, ref, watch } from 'vue'
import { useQuery } from '@vue/apollo-composable'
import { apolloClient } from '@/api/graphql/client'
import { useLocaleStore } from '@/stores/locale'
import { useToast } from '@/composables/useToast'
import { graphqlErrorMessage } from '@/api/graphql/errors'
import AgentConfigKnowledgeDialog from '@/views/AgentConfigKnowledgeDialog.vue'
import {
  AGENT_CONFIGS_QUERY,
  KNOWLEDGE_ARTIFACTS_QUERY,
  SET_AGENT_CONFIG_KNOWLEDGE,
  type AgentConfigNode,
  type AgentConfigsResult,
  type AgentConfigsVars,
  type KnowledgeArtifactsResult,
  type SetAgentConfigKnowledgeResult,
  type SetAgentConfigKnowledgeVars,
} from '@/api/graphql/queries/agent-config'
import '@/components/icons'

const locale = useLocaleStore()
const toast = useToast()

// Local fallback dictionary for the agentConfig.* keys. The shared locale store
// (src/stores/locale.ts) does not yet carry these keys and is off-limits for
// this change; `locale.t` returns the raw key when an entry is missing, so this
// view resolves agentConfig.* itself and falls back to the store for shared
// keys. See the report for the canonical zh/en list to add to the store later.
const FALLBACK: Record<string, { zh: string; en: string }> = {
  'agentConfig.title': { zh: '智能体配置', en: 'Agent Config' },
  'agentConfig.description': {
    zh: '管理智能体配置及其挂载的 OKF 知识包，知识包将在部署时注入智能体所在的虚拟机。',
    en: 'Manage agent configs and the OKF knowledge packs they mount; packs are injected into the agent VM at deploy.',
  },
  'agentConfig.action.refresh': { zh: '刷新', en: 'Refresh' },
  'agentConfig.filter.agentType': { zh: '智能体类型', en: 'Agent Type' },
  'agentConfig.filter.allTypes': { zh: '全部类型', en: 'All types' },
  'agentConfig.list.title': { zh: '配置列表', en: 'Configs' },
  'agentConfig.list.loading': { zh: '加载中…', en: 'Loading…' },
  'agentConfig.list.empty': { zh: '暂无智能体配置', en: 'No agent configs' },
  'agentConfig.list.error': { zh: '配置加载失败', en: 'Failed to load configs' },
  'agentConfig.badge.default': { zh: '默认', en: 'Default' },
  'agentConfig.detail.empty': { zh: '请选择左侧的一个配置以查看详情', en: 'Select a config to view details' },
  'agentConfig.detail.agentType': { zh: '智能体类型', en: 'Agent Type' },
  'agentConfig.detail.isDefault': { zh: '是否默认', en: 'Default' },
  'agentConfig.detail.createdAt': { zh: '创建时间', en: 'Created At' },
  'agentConfig.detail.yes': { zh: '是', en: 'Yes' },
  'agentConfig.detail.no': { zh: '否', en: 'No' },
  'agentConfig.knowledge.sectionTitle': { zh: '已挂载知识包', en: 'Mounted Knowledge Packs' },
  'agentConfig.knowledge.edit': { zh: '编辑知识包', en: 'Edit Packs' },
  'agentConfig.knowledge.empty': { zh: '尚未挂载任何知识包', en: 'No knowledge packs mounted' },
  'agentConfig.knowledge.dialogTitle': { zh: '编辑挂载的知识包', en: 'Edit Mounted Knowledge Packs' },
  'agentConfig.knowledge.searchPlaceholder': { zh: '搜索知识包名称', en: 'Search knowledge packs' },
  'agentConfig.knowledge.loading': { zh: '正在加载知识包…', en: 'Loading knowledge packs…' },
  'agentConfig.knowledge.emptyArtifacts': { zh: '暂无可用知识包', en: 'No knowledge packs available' },
  'agentConfig.knowledge.selectedCount': { zh: '已选 {count} 个知识包', en: '{count} pack(s) selected' },
  'agentConfig.knowledge.cancel': { zh: '取消', en: 'Cancel' },
  'agentConfig.knowledge.save': { zh: '保存', en: 'Save' },
  'agentConfig.toast.saved': { zh: '已更新挂载的知识包', en: 'Mounted knowledge packs updated' },
  'agentConfig.toast.saveFailed': { zh: '保存知识包失败', en: 'Failed to update knowledge packs' },
  'agentConfig.toast.refreshed': { zh: '配置列表已刷新', en: 'Configs refreshed' },
  'agentConfig.toast.refreshFailed': { zh: '刷新失败', en: 'Failed to refresh' },
}

// Resolve agentConfig.* from the local fallback, otherwise defer to the store.
function tt(key: string): string {
  const entry = FALLBACK[key]
  if (entry) return entry[locale.locale]
  return locale.t(key)
}

const ALL_TYPES = '__ALL__'
const agentTypeFilter = ref<string>(ALL_TYPES)
const selectedConfigId = ref<string | null>(null)
const dialogOpen = ref(false)
const saving = ref(false)

// Pass `undefined` (omit the variable) when no type is selected so the backend
// returns every config the caller can see.
const queryVars = computed<AgentConfigsVars>(() => ({
  agentType: agentTypeFilter.value === ALL_TYPES ? undefined : agentTypeFilter.value,
}))

const {
  result: configsResult,
  loading: configsLoading,
  error: configsError,
  refetch: refetchConfigs,
} = useQuery<AgentConfigsResult, AgentConfigsVars>(AGENT_CONFIGS_QUERY, queryVars)

const { result: artifactsResult, loading: artifactsLoading } =
  useQuery<KnowledgeArtifactsResult>(KNOWLEDGE_ARTIFACTS_QUERY)

const configs = computed<AgentConfigNode[]>(() => configsResult.value?.agentConfigs ?? [])
const knowledgeArtifacts = computed(() => artifactsResult.value?.artifacts ?? [])

// Distinct agentTypes from the (unfiltered) configs to populate the filter.
// When a filter is active the list is already narrowed, so keep the current
// value as a guaranteed option.
const agentTypes = computed<string[]>(() => {
  const set = new Set<string>()
  for (const config of configs.value) set.add(config.agentType)
  if (agentTypeFilter.value !== ALL_TYPES) set.add(agentTypeFilter.value)
  return [...set].sort((a, b) => a.localeCompare(b, locale.locale))
})

const selectedConfig = computed<AgentConfigNode | null>(
  () => configs.value.find((config) => config.id === selectedConfigId.value) ?? null,
)

// Keep a valid selection: default to the first config, clear if it vanished.
watch(
  configs,
  (list) => {
    if (list.length === 0) {
      selectedConfigId.value = null
      return
    }
    if (!list.some((config) => config.id === selectedConfigId.value)) {
      selectedConfigId.value = list[0].id
    }
  },
  { immediate: true },
)

function selectConfig(id: string) {
  selectedConfigId.value = id
}

function onAgentTypeChange(event: Event) {
  agentTypeFilter.value = (event.target as HTMLSelectElement).value
}

function openEditor() {
  if (!selectedConfig.value) return
  dialogOpen.value = true
}

function closeEditor() {
  if (saving.value) return
  dialogOpen.value = false
}

async function submitKnowledge(ids: string[]) {
  const config = selectedConfig.value
  if (!config || saving.value) return
  saving.value = true
  try {
    await apolloClient.mutate<SetAgentConfigKnowledgeResult, SetAgentConfigKnowledgeVars>({
      mutation: SET_AGENT_CONFIG_KNOWLEDGE,
      variables: { configId: config.id, knowledgeArtifactIds: ids },
    })
    toast.success(tt('agentConfig.toast.saved'))
    dialogOpen.value = false
    await refetchConfigs()
  } catch (error) {
    toast.error(graphqlErrorMessage(error, tt('agentConfig.toast.saveFailed')))
  } finally {
    saving.value = false
  }
}

async function refresh() {
  if (configsLoading.value) return
  try {
    await refetchConfigs()
    toast.success(tt('agentConfig.toast.refreshed'))
  } catch (error) {
    toast.error(graphqlErrorMessage(error, tt('agentConfig.toast.refreshFailed')))
  }
}
</script>

<template>
  <section class="agent-config-page">
    <header class="page-head">
      <h1 cds-text="title" class="heading">{{ tt('agentConfig.title') }}</h1>
      <p cds-text="body" class="desc muted">{{ tt('agentConfig.description') }}</p>
    </header>

    <div class="content-card">
      <div class="toolbar">
        <cds-select control-width="shrink">
          <label>{{ tt('agentConfig.filter.agentType') }}</label>
          <select
            :value="agentTypeFilter"
            :aria-label="tt('agentConfig.filter.agentType')"
            @change="onAgentTypeChange"
          >
            <option :value="ALL_TYPES">{{ tt('agentConfig.filter.allTypes') }}</option>
            <option v-for="type in agentTypes" :key="type" :value="type">{{ type }}</option>
          </select>
        </cds-select>

        <cds-button
          action="ghost"
          class="refresh-button"
          :disabled="configsLoading"
          :aria-label="tt('agentConfig.action.refresh')"
          :title="tt('agentConfig.action.refresh')"
          @click="refresh"
        >
          <cds-icon shape="refresh" size="md" :class="{ spinning: configsLoading }"></cds-icon>
          <span>{{ tt('agentConfig.action.refresh') }}</span>
        </cds-button>
      </div>

      <div class="master-detail">
        <!-- Master: config list -->
        <aside class="list-panel" :aria-label="tt('agentConfig.list.title')">
          <h2 cds-text="subsection" class="panel-title">{{ tt('agentConfig.list.title') }}</h2>

          <p v-if="configsLoading && configs.length === 0" class="panel-state muted">
            {{ tt('agentConfig.list.loading') }}
          </p>
          <p v-else-if="configsError" class="panel-state error">
            {{ tt('agentConfig.list.error') }}
          </p>
          <p v-else-if="configs.length === 0" class="panel-state muted">
            {{ tt('agentConfig.list.empty') }}
          </p>

          <ul v-else class="config-list">
            <li v-for="config in configs" :key="config.id">
              <button
                type="button"
                class="config-item"
                :class="{ active: config.id === selectedConfigId }"
                :aria-pressed="config.id === selectedConfigId"
                @click="selectConfig(config.id)"
              >
                <span class="config-name" :title="config.name">{{ config.name }}</span>
                <span class="config-meta">
                  <span class="config-type">{{ config.agentType }}</span>
                  <cds-badge v-if="config.isDefault" status="info" class="default-badge">
                    {{ tt('agentConfig.badge.default') }}
                  </cds-badge>
                </span>
              </button>
            </li>
          </ul>
        </aside>

        <!-- Detail: selected config -->
        <div class="detail-panel">
          <div v-if="!selectedConfig" class="detail-empty">
            <cds-icon shape="cog" size="xl"></cds-icon>
            <p cds-text="subsection">{{ tt('agentConfig.detail.empty') }}</p>
          </div>

          <template v-else>
            <header class="detail-head">
              <h2 cds-text="section" class="detail-title">{{ selectedConfig.name }}</h2>
              <cds-badge v-if="selectedConfig.isDefault" status="info">
                {{ tt('agentConfig.badge.default') }}
              </cds-badge>
            </header>

            <dl class="detail-grid">
              <div class="detail-row">
                <dt>{{ tt('agentConfig.detail.agentType') }}</dt>
                <dd>{{ selectedConfig.agentType }}</dd>
              </div>
              <div class="detail-row">
                <dt>{{ tt('agentConfig.detail.isDefault') }}</dt>
                <dd>
                  {{ selectedConfig.isDefault ? tt('agentConfig.detail.yes') : tt('agentConfig.detail.no') }}
                </dd>
              </div>
              <div class="detail-row">
                <dt>{{ tt('agentConfig.detail.createdAt') }}</dt>
                <dd>{{ selectedConfig.createdAt }}</dd>
              </div>
            </dl>

            <section class="knowledge-section">
              <div class="knowledge-head">
                <h3 cds-text="subsection" class="knowledge-title">
                  {{ tt('agentConfig.knowledge.sectionTitle') }}
                  <span class="knowledge-count muted">({{ selectedConfig.knowledge.length }})</span>
                </h3>
                <cds-button action="outline" size="sm" @click="openEditor">
                  <cds-icon shape="pencil" size="sm" aria-hidden="true"></cds-icon>
                  {{ tt('agentConfig.knowledge.edit') }}
                </cds-button>
              </div>

              <p v-if="selectedConfig.knowledge.length === 0" class="panel-state muted">
                {{ tt('agentConfig.knowledge.empty') }}
              </p>
              <ul v-else class="pack-list">
                <li v-for="pack in selectedConfig.knowledge" :key="pack.id" class="pack-item">
                  <cds-icon shape="book" size="sm" aria-hidden="true"></cds-icon>
                  <span class="pack-name" :title="pack.name">{{ pack.name }}</span>
                  <small class="pack-version muted">v{{ pack.version }}</small>
                </li>
              </ul>
            </section>
          </template>
        </div>
      </div>
    </div>

    <AgentConfigKnowledgeDialog
      :open="dialogOpen"
      :config="selectedConfig"
      :artifacts="knowledgeArtifacts"
      :saving="saving"
      :artifacts-loading="artifactsLoading"
      :tt="tt"
      @close="closeEditor"
      @submit="submitKnowledge"
    />
  </section>
</template>

<style scoped>
.agent-config-page {
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
.master-detail {
  flex: 1 1 auto;
  min-height: 0;
  min-width: 0;
  display: grid;
  grid-template-columns: minmax(220px, 300px) 1fr;
  gap: 12px;
}
.list-panel {
  display: flex;
  flex-direction: column;
  min-height: 0;
  gap: 8px;
  padding: 12px;
  border: 1px solid var(--cds-alias-object-border-color, #d7d7d7);
  border-radius: 4px;
  overflow: auto;
}
.panel-title {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
}
.panel-state {
  margin: 0;
  padding: 16px 4px;
  font-size: 13px;
}
.panel-state.error {
  color: var(--cds-alias-status-danger, #c92100);
}
.config-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.config-item {
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
  padding: 10px 12px;
  border: 1px solid transparent;
  border-radius: 4px;
  background: transparent;
  color: var(--cds-alias-object-app-foreground, #1b1b1b);
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.config-item:hover {
  background: var(--cds-alias-object-app-background, #f4f4f4);
}
.config-item.active {
  border-color: var(--cds-alias-object-interaction-color, #0072a3);
  background: color-mix(in srgb, var(--cds-alias-object-interaction-color, #0072a3) 8%, transparent);
}
.config-name {
  font-weight: 600;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.config-meta {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}
.config-type {
  font-size: 12px;
  color: var(--cds-alias-typography-color-300, #565656);
}
.default-badge {
  font-size: 11px;
}
.detail-panel {
  display: flex;
  flex-direction: column;
  min-height: 0;
  gap: 16px;
  padding: 16px;
  border: 1px solid var(--cds-alias-object-border-color, #d7d7d7);
  border-radius: 4px;
  overflow: auto;
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
.detail-head {
  display: flex;
  align-items: center;
  gap: 12px;
}
.detail-title {
  margin: 0;
  font-size: 18px;
}
.detail-grid {
  margin: 0;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px 24px;
}
.detail-row {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}
.detail-row dt {
  font-size: 12px;
  font-weight: 600;
  color: var(--cds-alias-typography-color-300, #565656);
}
.detail-row dd {
  margin: 0;
  font-size: 14px;
  word-break: break-word;
}
.knowledge-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-top: 12px;
  border-top: 1px solid var(--cds-alias-object-border-color, #e8e8e8);
}
.knowledge-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.knowledge-title {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
}
.knowledge-count {
  font-weight: 400;
}
.pack-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.pack-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border: 1px solid var(--cds-alias-object-border-color, #e8e8e8);
  border-radius: 4px;
  font-size: 13px;
}
.pack-name {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.pack-version {
  flex: 0 0 auto;
}
.muted {
  color: var(--cds-alias-typography-color-300, #565656);
}
.spinning {
  animation: agent-config-spin 1s linear infinite;
  transform-origin: center;
}
@keyframes agent-config-spin {
  to {
    transform: rotate(360deg);
  }
}
@media (max-width: 860px) {
  .master-detail {
    grid-template-columns: 1fr;
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
