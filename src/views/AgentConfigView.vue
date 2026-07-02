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
import { apolloClient } from '@/api/graphql/client'
import { useLocaleStore } from '@/stores/locale'
import { useAuthStore } from '@/stores/auth'
import { useToast } from '@/composables/useToast'
import { graphqlErrorMessage } from '@/api/graphql/errors'
import AgentConfigKnowledgeDialog from '@/views/AgentConfigKnowledgeDialog.vue'
import {
  AGENT_CONFIGS_QUERY,
  KNOWLEDGE_ARTIFACTS_QUERY,
  SET_AGENT_CONFIG_KNOWLEDGE,
} from '@/api/graphql/queries/agent-config'
import type {
  AgentConfigNode,
  AgentConfigsResult,
  AgentConfigsVars,
  KnowledgeArtifactsResult,
  SetAgentConfigKnowledgeResult,
  SetAgentConfigKnowledgeVars,
} from '@/types/agent-config'
import '@/components/icons'

const locale = useLocaleStore()
const auth = useAuthStore()
const toast = useToast()

const PAGE_SIZE_OPTIONS = [5, 10, 20] as const
type PageSize = (typeof PAGE_SIZE_OPTIONS)[number]
type SortDirection = 'ASC' | 'DESC'

/* 当前列的排序方向 — null 表示未排序。后端 schema 尚未暴露 AgentConfigs
 * 的 sort/filter 参数(只支持 agentType),所以这里的排序与名称过滤都
 * 在前端 in-memory 完成。数据量是平台级配置,通常几十条,前端处理足够。
 * 等后端补齐 sort/filter 入参后,把 `filteredConfigs` 直接喂给 useQuery
 * 的 variables 即可,UI 状态完全保留。 */
const sortDirection = ref<SortDirection | null>(null)
const nameKeyword = ref('')

const currentPage = ref(1)
const pageSize = ref<PageSize>(5)
const selectedConfigId = ref<string | null>(null)
const detailOpen = ref(false)
const dialogOpen = ref(false)
const saving = ref(false)

const {
  result: configsResult,
  loading: configsLoading,
  error: configsError,
  refetch: refetchConfigs,
} = useQuery<AgentConfigsResult, AgentConfigsVars>(AGENT_CONFIGS_QUERY)

const { result: artifactsResult, loading: artifactsLoading } =
  useQuery<KnowledgeArtifactsResult>(KNOWLEDGE_ARTIFACTS_QUERY)

const configs = computed<AgentConfigNode[]>(() => configsResult.value?.agentConfigs ?? [])
const knowledgeArtifacts = computed(() => artifactsResult.value?.artifacts ?? [])

/* Apply name keyword filter (case-insensitive) then sort by name. The order
 * is filter → sort → paginate so the user sees a stable, predictable slice
 * of matching rows in the current sort direction. */
const filteredConfigs = computed<AgentConfigNode[]>(() => {
  const keyword = nameKeyword.value.trim().toLocaleLowerCase(locale.locale)
  if (!keyword) return configs.value
  return configs.value.filter((config) =>
    config.name.toLocaleLowerCase(locale.locale).includes(keyword),
  )
})

const sortedConfigs = computed<AgentConfigNode[]>(() => {
  if (!sortDirection.value) return filteredConfigs.value
  const direction = sortDirection.value
  const list = [...filteredConfigs.value]
  list.sort((a, b) => a.name.localeCompare(b.name, locale.locale))
  if (direction === 'DESC') list.reverse()
  return list
})

const totalCount = computed(() => sortedConfigs.value.length)
const totalPages = computed(() => Math.max(1, Math.ceil(totalCount.value / pageSize.value)))
const visibleConfigs = computed(() => {
  const offset = (currentPage.value - 1) * pageSize.value
  return sortedConfigs.value.slice(offset, offset + pageSize.value)
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

function onPageSizeChange(event: Event) {
  pageSize.value = Number((event.target as HTMLSelectElement).value) as PageSize
  currentPage.value = 1
}

/* 三态循环：none → asc → desc → none。点击同一按钮不会跳到
 * "按其它列排序"的语义,只翻当前方向。 */
function sortStateFor(): SortDirection | 'none' {
  if (sortDirection.value === 'ASC') return 'ASC'
  if (sortDirection.value === 'DESC') return 'DESC'
  return 'none'
}

function onSortClick() {
  const cur = sortStateFor()
  if (cur === 'none') sortDirection.value = 'ASC'
  else if (cur === 'ASC') sortDirection.value = 'DESC'
  else sortDirection.value = null
  currentPage.value = 1
}

/* 列过滤锚点 — 单锚点单 key 复用模式(参考 ModelGatewayView)。
 * cds-button-action 派发的 click 来自其内部元素,所以要取 closest 到
 * 外层 cds-button-action 宿主,cds-dropdown 才能正确定位。 */
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

function onNameKeywordInput(event: Event) {
  nameKeyword.value = (event.target as HTMLInputElement).value
  /* filter computed 读 nameKeyword 响应式 — 只需把分页归零到第 1 页。 */
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
  if (!['admin', 'tenant_admin'].includes(auth.role ?? '')) {
    toast.warning(locale.t('common.noPermission'))
    return
  }
  selectedConfigId.value = config.id
  dialogOpen.value = true
}

function closeEditor() {
  if (saving.value) return
  dialogOpen.value = false
}

function openCreate() {
  /* 后端目前未暴露 createConfig mutation — 与"资源池接入"早期草稿
   * 阶段一致,先以占位 toast 告知"即将上线",避免在没有写接口的情况下
   * 打开一个没法真正提交的对话框。等 createConfig 接口就绪后再
   * 换成真正的 CreateOrEditAgentConfigDialog。 */
  toast.info(locale.t('agentConfig.action.createUnavailable'))
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
      <p cds-text="body" class="desc muted">{{ locale.t('agentConfig.description') }}</p>
    </header>

    <div class="content-card">
      <div class="toolbar">
        <cds-button
          class="toolbar-create"
          action="outline"
          status="primary"
          @click="openCreate"
        >
          <cds-icon shape="plus-circle" size="sm" aria-hidden="true"></cds-icon>
          {{ locale.t('agentConfig.action.create') }}
        </cds-button>
        <button
          type="button"
          class="refresh-button"
          :disabled="configsLoading"
          :aria-label="locale.t('agentConfig.action.refresh')"
          :title="locale.t('agentConfig.action.refresh')"
          @click="refresh"
        >
          <cds-icon
            shape="refresh"
            size="md"
            :class="{ spinning: configsLoading }"
            aria-hidden="true"
          ></cds-icon>
        </button>
      </div>

      <cds-grid
        border="row"
        column-layout="flex"
        role="grid"
        :aria-label="locale.t('agentConfig.table.label')"
      >
        <cds-grid-column width="46%">
          <div class="col-head">
            <span>{{ locale.t('agentConfig.col.name') }}</span>
            <span class="col-head-actions">
              <cds-button-action
                id="agent-config-sort-name"
                :aria-label="locale.t('agentConfig.sort').replace('{column}', locale.t('agentConfig.col.name'))"
                @click="onSortClick"
              >
                <cds-icon
                  v-if="sortStateFor() === 'ASC'" shape="angle" direction="up" size="sm"
                ></cds-icon>
                <cds-icon
                  v-else-if="sortStateFor() === 'DESC'" shape="angle" direction="down" size="sm"
                ></cds-icon>
                <cds-icon v-else shape="two-way-arrows" class="col-sort-rotated" size="sm"></cds-icon>
              </cds-button-action>
              <cds-button-action
                id="agent-config-filter-name-input"
                shape="filter"
                :aria-label="locale.t('agentConfig.filter').replace('{column}', locale.t('agentConfig.col.name'))"
                :expanded="!!nameKeyword"
                @click="(e: MouseEvent) => openFilter('nameKeyword', e.target)"
              ></cds-button-action>
            </span>
          </div>
        </cds-grid-column>
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
              <button
                v-if="['admin','tenant_admin'].includes(auth.role ?? '')"
                type="button"
                class="row-action solid"
                @click="openEditor(config)"
              >
                {{ locale.t('agentConfig.action.edit') }}
              </button>
              <button
                v-if="['admin','tenant_admin'].includes(auth.role ?? '')"
                type="button"
                class="row-action solid"
                @click="unavailableDelete(config)"
              >
                {{ locale.t('agentConfig.action.delete') }}
              </button>
            </div>
          </cds-grid-cell>
        </cds-grid-row>

        <cds-grid-placeholder v-if="configsLoading && sortedConfigs.length === 0" role="status" aria-live="polite">
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

        <cds-grid-placeholder v-else-if="sortedConfigs.length === 0" role="status" aria-live="polite">
          <cds-icon shape="details" size="xl" aria-hidden="true"></cds-icon>
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

      <!-- Column text-search dropdown: 与 ModelGatewayView 保持一致,
           cds-input 直接监听 input 事件,每次按键即过滤、无"应用"按钮。 -->
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
              :placeholder="locale.t('agentConfig.col.name.search')"
              :aria-label="locale.t('agentConfig.col.name.search')"
              @input="onNameKeywordInput"
            />
          </cds-input>
        </div>
      </cds-dropdown>
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
              <cds-button
                v-if="['admin','tenant_admin'].includes(auth.role ?? '')"
                action="outline"
                size="sm"
                @click="openEditor(selectedConfig)"
              >
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
.content-card {
  flex: 1 1 auto;
  min-height: 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 20px;
}
.toolbar {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 12px;
}
.toolbar :deep(.toolbar-create) {
  /* Match the resource-pool "接入资源池" button: explicit size keeps the
     cds-button host from stretching across the toolbar row. */
  flex: 0 0 auto;
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
.agent-config-page cds-grid {
  display: block;
  flex: 1 1 auto;
  min-height: 0;
  min-width: 760px;
  width: 100%;
  overflow: auto;
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
.col-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  width: 100%;
  min-width: 0;
}
.col-head-actions {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex: 0 0 auto;
}
/* 与 ModelGatewayView 的列头排序图标一致 — `two-way-arrows` 横向
 * 排列,把"无排序"状态渲染成上下双向箭头,旋转 90° 看起来像
 * "上下"指示器。 */
.col-sort-rotated {
  transform: rotate(90deg);
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
