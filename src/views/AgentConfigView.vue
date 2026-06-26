<script setup lang="ts">
/**
 * 智能体配置 (Agent Config) — list management view for LLD-11 OKF knowledge grounding.
 *
 * The backend currently exposes browsing AgentConfigs and replacing their
 * mounted knowledge artifacts. There is no create/delete config mutation yet,
 * so the page keeps those actions out of the write path while matching the
 * requested management-table layout.
 */
import { computed, ref, watch } from 'vue'
import { useQuery } from '@vue/apollo-composable'
import AppDropdown from '@/components/AppDropdown.vue'
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

const ALL_TYPES = '__ALL__'
const PAGE_SIZE_OPTIONS = [5, 10, 20] as const
type PageSize = (typeof PAGE_SIZE_OPTIONS)[number]

const agentTypeFilter = ref<string>(ALL_TYPES)
const currentPage = ref(1)
const pageSize = ref<PageSize>(5)
const selectedConfigId = ref<string | null>(null)
const detailOpen = ref(false)
const dialogOpen = ref(false)
const saving = ref(false)

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

const agentTypes = computed<string[]>(() => {
  const set = new Set<string>()
  for (const config of configs.value) set.add(config.agentType)
  if (agentTypeFilter.value !== ALL_TYPES) set.add(agentTypeFilter.value)
  return [...set].sort((a, b) => a.localeCompare(b, locale.locale))
})

const totalCount = computed(() => configs.value.length)
const totalPages = computed(() => Math.max(1, Math.ceil(totalCount.value / pageSize.value)))
const visibleConfigs = computed(() => {
  const offset = (currentPage.value - 1) * pageSize.value
  return configs.value.slice(offset, offset + pageSize.value)
})
const selectedConfig = computed<AgentConfigNode | null>(
  () => configs.value.find((config) => config.id === selectedConfigId.value) ?? null,
)
const pageNumbers = computed(() => {
  const pages = totalPages.value
  if (pages <= 5) return Array.from({ length: pages }, (_, index) => index + 1)
  if (currentPage.value <= 3) return [1, 2, 3]
  if (currentPage.value >= pages - 2) return [pages - 2, pages - 1, pages]
  return [currentPage.value - 1, currentPage.value, currentPage.value + 1]
})
const showLeadingEllipsis = computed(() => totalPages.value > 5 && pageNumbers.value[0] > 1)
const showTrailingEllipsis = computed(
  () => totalPages.value > 5 && pageNumbers.value[pageNumbers.value.length - 1] < totalPages.value,
)
const hasActiveFilter = computed(() => agentTypeFilter.value !== ALL_TYPES)

watch(totalPages, (pages) => {
  if (currentPage.value > pages) currentPage.value = pages
})

watch(configs, (list) => {
  if (list.length === 0) {
    selectedConfigId.value = null
    detailOpen.value = false
    return
  }
  if (selectedConfigId.value && !list.some((config) => config.id === selectedConfigId.value)) {
    selectedConfigId.value = null
    detailOpen.value = false
  }
})

function onAgentTypeChange(event: Event) {
  agentTypeFilter.value = (event.target as HTMLSelectElement).value
  currentPage.value = 1
}

function onPageSizeChange(event: Event) {
  pageSize.value = Number((event.target as HTMLSelectElement).value) as PageSize
  currentPage.value = 1
}

function goToPage(page: number) {
  currentPage.value = Math.min(Math.max(page, 1), totalPages.value)
}

function openDetails(config: AgentConfigNode) {
  selectedConfigId.value = config.id
  detailOpen.value = true
}

function closeDetails() {
  detailOpen.value = false
}

function openEditor(config: AgentConfigNode) {
  selectedConfigId.value = config.id
  dialogOpen.value = true
}

function closeEditor() {
  if (saving.value) return
  dialogOpen.value = false
}

function clearFilter() {
  agentTypeFilter.value = ALL_TYPES
  currentPage.value = 1
}

function refreshFromMenu(close: () => void) {
  void refresh()
  close()
}

function clearFilterFromMenu(close: () => void) {
  clearFilter()
  close()
}

function unavailableDelete(config: AgentConfigNode) {
  toast.info(locale.t('agentConfig.toast.deleteUnavailable').replace('{name}', config.name))
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
    toast.success(locale.t('agentConfig.toast.saved'))
    dialogOpen.value = false
    await refetchConfigs()
  } catch (error) {
    toast.error(graphqlErrorMessage(error, locale.t('agentConfig.toast.saveFailed')))
  } finally {
    saving.value = false
  }
}

async function refresh() {
  if (configsLoading.value) return
  try {
    await refetchConfigs()
    toast.success(locale.t('agentConfig.toast.refreshed'))
  } catch (error) {
    toast.error(graphqlErrorMessage(error, locale.t('agentConfig.toast.refreshFailed')))
  }
}

function formatTimestamp(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString(locale.locale === 'zh' ? 'zh-CN' : 'en-US')
}
</script>

<template>
  <section class="agent-config-page">
    <header class="page-head">
      <h1 cds-text="title" class="heading">{{ locale.t('agentConfig.title') }}</h1>
    </header>

    <div class="content-card">
      <div class="toolbar">
        <AppDropdown align="start">
          <template #trigger="{ open }">
            <cds-button action="outline" size="sm" :aria-expanded="open ? 'true' : 'false'">
              <cds-icon shape="cog" size="sm" aria-hidden="true"></cds-icon>
              {{ locale.t('agentConfig.action.batch') }}
              <cds-icon shape="angle" direction="down" size="sm" aria-hidden="true"></cds-icon>
            </cds-button>
          </template>
          <template #default="{ close }">
            <button
              type="button"
              class="menu-option"
              @click="refreshFromMenu(close)"
            >
              <cds-icon shape="refresh" size="sm" aria-hidden="true"></cds-icon>
              {{ locale.t('agentConfig.action.refresh') }}
            </button>
            <button
              type="button"
              class="menu-option"
              :disabled="!hasActiveFilter"
              @click="clearFilterFromMenu(close)"
            >
              <cds-icon shape="filter" size="sm" aria-hidden="true"></cds-icon>
              {{ locale.t('agentConfig.action.clearFilter') }}
            </button>
          </template>
        </AppDropdown>

        <cds-select control-width="shrink" class="type-filter">
          <label>{{ locale.t('agentConfig.filter.agentType') }}</label>
          <select
            :value="agentTypeFilter"
            :aria-label="locale.t('agentConfig.filter.agentType')"
            @change="onAgentTypeChange"
          >
            <option :value="ALL_TYPES">{{ locale.t('agentConfig.filter.allTypes') }}</option>
            <option v-for="type in agentTypes" :key="type" :value="type">{{ type }}</option>
          </select>
        </cds-select>

        <button
          type="button"
          class="refresh-button"
          :disabled="configsLoading"
          :aria-label="locale.t('agentConfig.action.refresh')"
          :title="locale.t('agentConfig.action.refresh')"
          @click="refresh"
        >
          <cds-icon shape="refresh" size="md" :class="{ spinning: configsLoading }"></cds-icon>
        </button>
      </div>

      <div class="grid-card">
        <cds-grid
          border="row"
          column-layout="flex"
          role="grid"
          :aria-label="locale.t('agentConfig.table.label')"
        >
          <cds-grid-column width="46%">{{ locale.t('agentConfig.col.name') }}</cds-grid-column>
          <cds-grid-column width="26%">{{ locale.t('agentConfig.col.agentType') }}</cds-grid-column>
          <cds-grid-column width="28%">{{ locale.t('agentConfig.col.actions') }}</cds-grid-column>

          <cds-grid-row v-for="config in visibleConfigs" :key="config.id">
            <cds-grid-cell>
              <div class="name-cell">
                <strong class="config-name" :title="config.name">{{ config.name }}</strong>
                <cds-badge v-if="config.isDefault" status="info" class="default-badge">
                  {{ locale.t('agentConfig.badge.default') }}
                </cds-badge>
              </div>
            </cds-grid-cell>
            <cds-grid-cell>
              <span class="config-type" :title="config.agentType">{{ config.agentType }}</span>
            </cds-grid-cell>
            <cds-grid-cell>
              <div class="row-actions">
                <button type="button" class="row-action solid" @click="openDetails(config)">
                  {{ locale.t('agentConfig.action.view') }}
                </button>
                <button type="button" class="row-action solid" @click="openEditor(config)">
                  {{ locale.t('agentConfig.action.edit') }}
                </button>
                <button type="button" class="row-action solid" @click="unavailableDelete(config)">
                  {{ locale.t('agentConfig.action.delete') }}
                </button>
              </div>
            </cds-grid-cell>
          </cds-grid-row>

          <cds-grid-placeholder v-if="configsLoading && configs.length === 0" role="status" aria-live="polite">
            <cds-icon shape="sync" size="xl" aria-hidden="true" class="spinning"></cds-icon>
            <p cds-text="subsection">{{ locale.t('agentConfig.list.loading') }}</p>
          </cds-grid-placeholder>

          <cds-grid-placeholder v-else-if="configsError" role="alert" aria-live="polite">
            <cds-icon shape="ban" size="xl" aria-hidden="true"></cds-icon>
            <p cds-text="subsection">{{ locale.t('agentConfig.list.error') }}</p>
            <cds-button action="outline" size="sm" @click="refresh">
              {{ locale.t('agentConfig.action.refresh') }}
            </cds-button>
          </cds-grid-placeholder>

          <cds-grid-placeholder v-else-if="configs.length === 0" role="status" aria-live="polite">
            <cds-icon shape="cog" size="xl" aria-hidden="true"></cds-icon>
            <p cds-text="subsection">{{ locale.t('agentConfig.list.empty') }}</p>
          </cds-grid-placeholder>

          <cds-grid-footer v-if="totalCount > 0">
            <div class="pager">
              <label for="agent-config-page-size">{{ locale.t('agentConfig.pagination.pageSize') }}</label>
              <cds-select control-width="shrink">
                <select
                  id="agent-config-page-size"
                  :value="pageSize"
                  :aria-label="locale.t('agentConfig.pagination.pageSize')"
                  @change="onPageSizeChange"
                >
                  <option v-for="option in PAGE_SIZE_OPTIONS" :key="option" :value="option">
                    {{ option }}
                  </option>
                </select>
              </cds-select>
              <span class="pager-label">{{ locale.t('agentConfig.pagination.page') }}</span>
              <button
                v-if="showLeadingEllipsis"
                type="button"
                class="pager-link"
                :aria-label="locale.t('agentConfig.pager.first')"
                @click="goToPage(1)"
              >
                1
              </button>
              <span v-if="showLeadingEllipsis" class="pager-ellipsis">...</span>
              <button
                v-for="page in pageNumbers"
                :key="page"
                type="button"
                class="pager-link"
                :class="{ active: page === currentPage }"
                :aria-current="page === currentPage ? 'page' : undefined"
                @click="goToPage(page)"
              >
                {{ page }}
              </button>
              <span v-if="showTrailingEllipsis" class="pager-ellipsis">...</span>
              <button
                v-if="showTrailingEllipsis"
                type="button"
                class="pager-link"
                :aria-label="locale.t('agentConfig.pager.last')"
                @click="goToPage(totalPages)"
              >
                {{ totalPages }}
              </button>
              <button
                type="button"
                class="pager-next"
                :disabled="currentPage >= totalPages"
                @click="goToPage(currentPage + 1)"
              >
                {{ locale.t('agentConfig.pagination.next') }}
              </button>
            </div>
          </cds-grid-footer>
        </cds-grid>
      </div>
    </div>

    <cds-modal :hidden="!detailOpen" :closable="true" size="md" @closeChange="closeDetails">
      <cds-modal-header>
        <h2 cds-text="section">{{ selectedConfig?.name ?? locale.t('agentConfig.detail.title') }}</h2>
      </cds-modal-header>
      <cds-modal-content>
        <div v-if="selectedConfig" class="detail-content">
          <dl class="detail-grid">
            <div class="detail-row">
              <dt>{{ locale.t('agentConfig.detail.agentType') }}</dt>
              <dd>{{ selectedConfig.agentType }}</dd>
            </div>
            <div class="detail-row">
              <dt>{{ locale.t('agentConfig.detail.isDefault') }}</dt>
              <dd>
                {{ selectedConfig.isDefault ? locale.t('agentConfig.detail.yes') : locale.t('agentConfig.detail.no') }}
              </dd>
            </div>
            <div class="detail-row">
              <dt>{{ locale.t('agentConfig.detail.createdAt') }}</dt>
              <dd>{{ formatTimestamp(selectedConfig.createdAt) }}</dd>
            </div>
            <div class="detail-row">
              <dt>{{ locale.t('agentConfig.detail.artifactId') }}</dt>
              <dd>{{ selectedConfig.artifactId ?? '—' }}</dd>
            </div>
          </dl>

          <section class="knowledge-section">
            <div class="knowledge-head">
              <h3 cds-text="subsection" class="knowledge-title">
                {{ locale.t('agentConfig.knowledge.sectionTitle') }}
                <span class="knowledge-count muted">({{ selectedConfig.knowledge.length }})</span>
              </h3>
              <cds-button action="outline" size="sm" @click="openEditor(selectedConfig)">
                <cds-icon shape="pencil" size="sm" aria-hidden="true"></cds-icon>
                {{ locale.t('agentConfig.knowledge.edit') }}
              </cds-button>
            </div>

            <p v-if="selectedConfig.knowledge.length === 0" class="panel-state muted">
              {{ locale.t('agentConfig.knowledge.empty') }}
            </p>
            <ul v-else class="pack-list">
              <li v-for="pack in selectedConfig.knowledge" :key="pack.id" class="pack-item">
                <cds-icon shape="book" size="sm" aria-hidden="true"></cds-icon>
                <span class="pack-name" :title="pack.name">{{ pack.name }}</span>
                <small class="pack-version muted">v{{ pack.version }}</small>
              </li>
            </ul>
          </section>
        </div>
      </cds-modal-content>
      <cds-modal-actions>
        <cds-button action="outline" @click="closeDetails">{{ locale.t('agentConfig.detail.close') }}</cds-button>
      </cds-modal-actions>
    </cds-modal>

    <AgentConfigKnowledgeDialog
      :open="dialogOpen"
      :config="selectedConfig"
      :artifacts="knowledgeArtifacts"
      :saving="saving"
      :artifacts-loading="artifactsLoading"
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
}
.content-card {
  flex: 1 1 auto;
  min-height: 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
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
.type-filter {
  min-width: 180px;
}
.refresh-button {
  margin-left: auto;
  width: 32px;
  height: 32px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--cds-alias-object-border-color, #d7d7d7);
  border-radius: 4px;
  background: var(--cds-alias-object-container-background, #fff);
  color: var(--cds-alias-object-interaction-color, #006e9c);
  cursor: pointer;
}
.refresh-button:hover {
  background: var(--cds-alias-object-app-background, #f4f4f4);
}
.refresh-button:disabled {
  cursor: not-allowed;
  opacity: 0.65;
}
.grid-card {
  flex: 1 1 auto;
  min-height: 0;
  min-width: 0;
  overflow: auto;
  border: 1px solid var(--cds-alias-object-border-color, #d7d7d7);
  border-radius: 4px;
}
.agent-config-page cds-grid {
  display: block;
  width: 100%;
  min-width: 760px;
  min-height: 100%;
}
.name-cell {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.config-name,
.config-type {
  display: block;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.default-badge {
  flex: 0 0 auto;
}
.row-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  white-space: nowrap;
}
.row-action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 52px;
  min-height: 28px;
  padding: 4px 11px;
  border: 1px solid var(--cds-alias-object-interaction-color, #006e9c);
  border-radius: 4px;
  background: var(--cds-alias-object-interaction-color, #006e9c);
  color: var(--cds-alias-object-interaction-background, #fff);
  font: inherit;
  font-size: 13px;
  cursor: pointer;
}
.row-action:hover {
  background: color-mix(in srgb, var(--cds-alias-object-interaction-color, #006e9c) 88%, #000);
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
.menu-option:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}
.pager {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  width: 100%;
  min-width: 0;
  padding: 4px 0;
  font-size: 14px;
}
.pager-label {
  margin-left: auto;
  font-weight: 600;
}
.pager-link,
.pager-next {
  border: 0;
  background: transparent;
  color: var(--cds-alias-object-app-foreground, #1b1b1b);
  font: inherit;
  cursor: pointer;
  border-radius: 4px;
}
.pager-link {
  min-width: 28px;
  height: 28px;
  padding: 0 6px;
}
.pager-link:hover,
.pager-next:hover {
  background: var(--cds-alias-object-app-background, #f4f4f4);
}
.pager-link.active {
  background: var(--cds-alias-object-interaction-color, #006e9c);
  color: var(--cds-alias-object-interaction-background, #fff);
}
.pager-next {
  padding: 4px 6px;
}
.pager-next:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}
.pager-ellipsis {
  color: var(--cds-alias-typography-color-300, #565656);
}
.detail-content {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.detail-grid {
  margin: 0;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px 24px;
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
.panel-state {
  margin: 0;
  padding: 16px 4px;
  font-size: 13px;
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
  .toolbar {
    align-items: stretch;
    flex-wrap: wrap;
  }
  .refresh-button {
    margin-left: 0;
  }
  .pager {
    justify-content: flex-start;
    flex-wrap: wrap;
  }
  .pager-label {
    margin-left: 0;
  }
  .detail-grid {
    grid-template-columns: 1fr;
  }
}
@media (max-width: 620px) {
  .row-actions {
    gap: 4px;
  }
  .row-action {
    min-width: 44px;
    padding: 4px 7px;
  }
}
@media (prefers-reduced-motion: reduce) {
  .spinning {
    animation: none;
  }
}
</style>
