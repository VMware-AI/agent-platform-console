<script setup lang="ts">
/**
 * Resource Pool Access view (`/platform/resources`).
 *
 * Mirrors AgentListView's grid + pager architecture. The list loads via
 * `useQuery(RESOURCE_POOLS_QUERY)` and row actions + the toolbar "接入资源池"
 * button run real `useMutation`s against the backend GraphQL endpoint (`/query`,
 * via Apollo `apolloClient`); after each mutation `refetch()` re-pulls the list
 * so the grid stays fresh.
 *
 * Per spec:
 *  - 6 visible columns (no esxi / vm counts)
 *  - 4 row icons (cog / sync / pencil / trash) — sync/edit/delete hit real
 *    mutations; manage is a placeholder toast
 *  - "当前同步状态" banner rendered inline above the grid (single cds-alert)
 *  - Sort / filter / pager work the same as AgentListView
 */
import { computed, ref } from 'vue'
import { useMutation, useQuery } from '@vue/apollo-composable'
import { useLocaleStore } from '@/stores/locale'
import { useToast } from '@/composables/useToast'
import {
  RESOURCE_POOLS_QUERY,
  CREATE_RESOURCE_POOL_MUTATION,
  UPDATE_RESOURCE_POOL_MUTATION,
  DELETE_RESOURCE_POOL_MUTATION,
  SYNC_RESOURCE_POOL_MUTATION,
} from '@/api/graphql/queries/resourcePools'
import type {
  CreateResourcePoolPayload,
  CreateResourcePoolVars,
  DeleteResourcePoolPayload,
  DeleteResourcePoolVars,
  ResourcePool,
  ResourcePoolFilter,
  ResourcePoolsQueryResult,
  ResourcePoolsQueryVars,
  ResourcePoolSort,
  ResourcePoolSortField,
  SyncResourcePoolPayload,
  SyncResourcePoolVars,
  UpdateResourcePoolPayload,
  UpdateResourcePoolVars,
} from '@/api/graphql/types/resource-pool'
import '@/components/icons'

import CreateOrEditResourcePoolDialog from './resource-list/CreateOrEditResourcePoolDialog.vue'
import ConfirmDialog from './user-role/ConfirmDialog.vue'

const locale = useLocaleStore()
const toast = useToast()

/* ---------- filter / sort / pagination state ----------
 * Only the `name` column is sortable + filterable in the UI. Endpoint,
 * 同步状态, 数据中心数 and 集群数 have plain headers (no sort/filter icons).
 * The toolbar search box shares `nameKeyword` with the column filter. */
const nameKeyword = ref('')
const sort = ref<ResourcePoolSort | null>(null)
const currentPage = ref(1)
const PAGE_SIZE_OPTIONS = [10, 20, 50, 100] as const
type PageSize = (typeof PAGE_SIZE_OPTIONS)[number]
const pageSize = ref<PageSize>(10)

const filter = computed<ResourcePoolFilter | null>(() => {
  const f: ResourcePoolFilter = {}
  if (nameKeyword.value.trim()) f.nameKeyword = nameKeyword.value.trim()
  return Object.keys(f).length > 0 ? f : null
})

const variables = computed<ResourcePoolsQueryVars>(() => ({
  filter: filter.value ?? undefined,
  pagination: { page: currentPage.value, pageSize: pageSize.value },
  sort: sort.value ?? undefined,
}))

const { result, loading, error, refetch } = useQuery<ResourcePoolsQueryResult, ResourcePoolsQueryVars>(
  RESOURCE_POOLS_QUERY,
  variables,
  () => ({ fetchPolicy: 'cache-and-network' }),
)

const pools = computed<ResourcePool[]>(() => result.value?.resourcePools.nodes ?? [])
const totalCount = computed(() => result.value?.resourcePools.totalCount ?? 0)
const pageInfo = computed(() => result.value?.resourcePools.pageInfo)

/* ---------- Sort cycle ---------- */
type SortState = 'none' | 'ascending' | 'descending'

function sortStateFor(field: ResourcePoolSortField): SortState {
  if (!sort.value || sort.value.field !== field) return 'none'
  return sort.value.direction === 'ASC' ? 'ascending' : 'descending'
}

function onSortClick(field: ResourcePoolSortField) {
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
  // `cds-button-action` dispatches the click from its inner element; we want
  // the outer host element so cds-dropdown can position against it.
  // (cds-dropdown's anchor prop accepts either an HTMLElement or a CSS id
  // selector — but when given a string it prepends another `#`, so passing
  // a pre-hashed id like "#foo" would be searched as "##foo" and miss.
  // Pass the element reference instead, matching AgentListView's pattern.)
  const host = (target as HTMLElement | null)?.closest('cds-button-action') as HTMLElement | null
  openFilterAnchor.value = host ?? (target as HTMLElement | null)
}
function closeFilter() {
  openFilterAnchor.value = null
  openFilterKey.value = null
}

function onNameKeywordInput(e: Event) {
  nameKeyword.value = (e.target as HTMLInputElement).value
  // The `filter` computed reads nameKeyword reactively — just reset the
  // pager so the user lands on page 1 of the newly filtered results.
  currentPage.value = 1
}

/* ---------- Pager helpers (verbatim pattern from AgentListView) ---------- */
function goToPage(page: number) {
  const total = pageInfo.value?.totalPages ?? 1
  if (page >= 1 && page <= total) currentPage.value = page
}
function onPrevPage() { goToPage(currentPage.value - 1) }
function onNextPage() { goToPage(currentPage.value + 1) }
function onPageInput(e: Event) {
  const next = parseInt((e.target as HTMLInputElement).value, 10)
  const total = pageInfo.value?.totalPages ?? 1
  if (Number.isFinite(next) && next >= 1 && next <= total) currentPage.value = next
}
function onPageSizeSelect(e: Event) {
  const next = parseInt((e.target as HTMLSelectElement).value, 10)
  if (!Number.isFinite(next)) return
  pageSize.value = next as PageSize
  currentPage.value = 1
}

const summaryText = computed(() => {
  const total = totalCount.value
  if (total === 0) {
    return locale
      .t('agents.footer.summary')
      .replace('{start}', '0')
      .replace('{end}', '0')
      .replace('{total}', '0')
  }
  const start = (currentPage.value - 1) * pageSize.value + 1
  const end = Math.min(currentPage.value * pageSize.value, total)
  return locale
    .t('agents.footer.summary')
    .replace('{start}', String(start))
    .replace('{end}', String(end))
    .replace('{total}', String(total))
})

/** 端点是否为可点击的 http(s) URL — 协议缺失时保持纯文本展示,
 *  否则浏览器会把相对路径拼到当前路由上,反而误导用户。 */
function isClickableEndpoint(value: string): boolean {
  return /^https?:\/\//i.test(value)
}

function fmtDateTime(iso: string): string {
  try {
    return new Intl.DateTimeFormat('zh-CN', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(iso))
  } catch {
    return iso
  }
}

/** "X 分钟前" / "X 小时前" / "X 天前" — used by the 同步状态 column. */
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
  return fmtDateTime(iso)
}

/** "同步状态" badge mapping — green (success) when the pool has been
 *  synced at least once, gray (neutral) when syncStatus === 'NEVER'. */
function syncBadgeFor(p: ResourcePool): 'success' | 'neutral' {
  return p.syncStatus === 'NEVER' ? 'neutral' : 'success'
}

function syncBadgeText(p: ResourcePool): string {
  if (p.syncStatus === 'NEVER') {
    return locale.t('resources.status.neverSynced')
  }
  return locale
    .t('resources.status.syncedAgo')
    .replace('{ago}', fmtSyncAgo(p.lastSyncedAt))
}

/* ---------- Mutations ---------- */
const { mutate: createPoolMutate, loading: creating } = useMutation<{
  createResourcePool: CreateResourcePoolPayload
}, CreateResourcePoolVars>(CREATE_RESOURCE_POOL_MUTATION)
const { mutate: updatePoolMutate } = useMutation<{
  updateResourcePool: UpdateResourcePoolPayload
}, UpdateResourcePoolVars>(UPDATE_RESOURCE_POOL_MUTATION)
const { mutate: deletePoolMutate, loading: deleting } = useMutation<{
  deleteResourcePool: DeleteResourcePoolPayload
}, DeleteResourcePoolVars>(DELETE_RESOURCE_POOL_MUTATION)
const { mutate: syncPoolMutate, loading: syncing } = useMutation<{
  syncResourcePool: SyncResourcePoolPayload
}, SyncResourcePoolVars>(SYNC_RESOURCE_POOL_MUTATION)

/* ---------- Row action dialogs ---------- */
const editingPool = ref<ResourcePool | null>(null)
const deletingPool = ref<ResourcePool | null>(null)
const createDialogOpen = ref(false)

function openCreate() {
  editingPool.value = null
  createDialogOpen.value = true
}
function openEdit(p: ResourcePool) {
  editingPool.value = p
  createDialogOpen.value = true
}
function closeCreateDialog() {
  createDialogOpen.value = false
  editingPool.value = null
}

async function onSubmit(payload: {
  mode: 'create' | 'update'
  input: CreateResourcePoolVars['input'] | UpdateResourcePoolVars['input']
}) {
  try {
    if (payload.mode === 'create') {
      const r = await createPoolMutate({ input: payload.input as CreateResourcePoolVars['input'] })
      const pool = r?.data?.createResourcePool.pool
      if (pool) {
        toast.success(locale.t('resources.toast.createOk').replace('{name}', pool.name))
      }
    } else if (editingPool.value) {
      const r = await updatePoolMutate({
        id: editingPool.value.id,
        input: payload.input as UpdateResourcePoolVars['input'],
      })
      const pool = r?.data?.updateResourcePool.pool
      if (pool) {
        toast.success(locale.t('resources.toast.updateOk').replace('{name}', pool.name))
      }
    }
    editingPool.value = null
    refetch()
  } catch (err) {
     
    console.error('[resources] submit failed', err)
    toast.error(
      locale.t(payload.mode === 'create' ? 'resources.toast.createFail' : 'resources.toast.updateFail'),
    )
  }
}

function onManage(p: ResourcePool) {
  // "管理" is a navigation-style action — for now just toast a placeholder.
   
  console.log('[resources] manage', { id: p.id })
  toast.info(locale.t('resources.action.manage'))
}

async function onSync(p: ResourcePool) {
  try {
    const r = await syncPoolMutate({ id: p.id })
    const syncedAt = r?.data?.syncResourcePool.syncedAt
    if (syncedAt) {
      toast.success(locale.t('resources.toast.syncOk').replace('{name}', p.name))
      refetch()
    }
  } catch (err) {
     
    console.error('[resources] sync failed', err)
    toast.error(locale.t('resources.toast.syncFail'))
  }
}

function openDelete(p: ResourcePool) {
  deletingPool.value = p
}

async function doDelete() {
  const p = deletingPool.value
  if (!p) return
  deletingPool.value = null
  try {
    const r = await deletePoolMutate({ id: p.id })
    const deletedName = r?.data?.deleteResourcePool.deletedName ?? p.name
    toast.success(locale.t('resources.toast.deleteOk').replace('{name}', deletedName))
    refetch()
  } catch (err) {
     
    console.error('[resources] delete failed', err)
    toast.error(locale.t('resources.toast.deleteFail'))
  }
}
</script>

<template>
  <section class="resource-pool-list">
    <header class="page-head">
      <h1 cds-text="title" class="heading">{{ locale.t('resources.title') }}</h1>
      <p cds-text="body" class="desc muted">{{ locale.t('resources.description') }}</p>
    </header>

    <!-- Toolbar: primary "接入资源池" (far left) + search input -->
    <div class="toolbar">
      <cds-button
        class="toolbar-create"
        action="outline"
        status="primary"
        :disabled="creating"
        @click="openCreate"
      >
        <cds-icon shape="plus-circle" size="sm" aria-hidden="true"></cds-icon>
        {{ locale.t('resources.toolbar.create') }}
      </cds-button>
      <cds-input class="toolbar-search">
        <input
          type="search"
          :value="nameKeyword"
          :placeholder="locale.t('resources.toolbar.search')"
          @input="(e: Event) => { nameKeyword = (e.target as HTMLInputElement).value }"
        />
      </cds-input>
    </div>

    <cds-alert v-if="error" status="danger" closable>
      {{ locale.t('resources.error') }}
    </cds-alert>

    <cds-grid :border="'row'" :column-layout="'flex'" role="grid" aria-label="resource-pools">
      <!-- 7 columns; widths sum to 100% -->
      <cds-grid-column :width="'12%'">
        <div class="col-head">
          <span>{{ locale.t('resources.col.name') }}</span>
          <span class="col-head-actions">
            <cds-button-action
              id="resources-filter-name"
              :aria-label="`sort ${locale.t('resources.col.name')}`"
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
              id="resources-filter-name-input"
              shape="filter"
              :aria-label="`filter ${locale.t('resources.col.name')}`"
              :expanded="!!nameKeyword"
              @click="(e: MouseEvent) => openFilter('nameKeyword', e.target)"
            ></cds-button-action>
          </span>
        </div>
      </cds-grid-column>

      <cds-grid-column :width="'18%'">
        <div class="col-head">
          <span>{{ locale.t('resources.col.endpoint') }}</span>
        </div>
      </cds-grid-column>

      <cds-grid-column :width="'12%'">
        <div class="col-head">
          <span>{{ locale.t('resources.col.status') }}</span>
        </div>
      </cds-grid-column>

      <cds-grid-column :width="'16%'">
        <div class="col-head">
          <span>{{ locale.t('resources.col.contentLibrary') }}</span>
          <span class="col-head-actions">
            <cds-button-action
              :aria-label="`sort ${locale.t('resources.col.contentLibrary')}`"
              @click="onSortClick('CONTENT_LIBRARY_NAME')"
            >
              <cds-icon
                v-if="sortStateFor('CONTENT_LIBRARY_NAME') === 'ascending'" shape="angle" direction="up" size="sm"
              ></cds-icon>
              <cds-icon
                v-else-if="sortStateFor('CONTENT_LIBRARY_NAME') === 'descending'" shape="angle" direction="down" size="sm"
              ></cds-icon>
              <cds-icon v-else shape="two-way-arrows" class="col-sort-rotated" size="sm"></cds-icon>
            </cds-button-action>
          </span>
        </div>
      </cds-grid-column>

      <!-- 创建时间列 -->
      <cds-grid-column :width="'10%'">
        <div class="col-head">
          <span>{{ locale.t('resources.col.createdAt') }}</span>
        </div>
      </cds-grid-column>

      <!-- 更新时间列 -->
      <cds-grid-column :width="'10%'">
        <div class="col-head">
          <span>{{ locale.t('resources.col.updatedAt') }}</span>
        </div>
      </cds-grid-column>

      <cds-grid-column :width="'12%'">
        <div class="col-head col-actions">
          <span>{{ locale.t('resources.col.actions') }}</span>
        </div>
      </cds-grid-column>

      <!-- Body rows -->
      <cds-grid-row v-for="p in pools" :key="p.id">
        <cds-grid-cell>{{ p.name }}</cds-grid-cell>
        <cds-grid-cell class="endpoint-cell">
          <a
            v-if="isClickableEndpoint(p.endpoint)"
            class="endpoint-link"
            :href="p.endpoint"
            target="_blank"
            rel="noopener noreferrer"
            :title="p.endpoint"
          >{{ p.endpoint }}</a>
          <span v-else class="muted" :title="p.endpoint">{{ p.endpoint }}</span>
        </cds-grid-cell>
        <cds-grid-cell class="muted">
          <cds-badge :status="syncBadgeFor(p)" class="status-badge">
            {{ syncBadgeText(p) }}
          </cds-badge>
        </cds-grid-cell>
        <cds-grid-cell class="content-library-cell" :title="p.contentLibraryName">
          {{ p.contentLibraryName }}
        </cds-grid-cell>
        <cds-grid-cell class="muted">{{ fmtDateTime(p.createdAt) }}</cds-grid-cell>
        <cds-grid-cell class="muted">{{ fmtDateTime(p.updatedAt) }}</cds-grid-cell>
        <cds-grid-cell>
          <span class="actions-cell">
            <cds-button-action
              shape="cog"
              :title="locale.t('resources.action.manage')"
              :aria-label="locale.t('resources.action.manage')"
              @click="onManage(p)"
            ></cds-button-action>
            <cds-button-action
              shape="sync"
              :title="locale.t('resources.action.sync')"
              :aria-label="locale.t('resources.action.sync')"
              :disabled="syncing"
              @click="onSync(p)"
            ></cds-button-action>
            <cds-button-action
              shape="pencil"
              :title="locale.t('resources.action.edit')"
              :aria-label="locale.t('resources.action.edit')"
              @click="openEdit(p)"
            ></cds-button-action>
            <cds-button-action
              shape="trash"
              :title="locale.t('resources.action.delete')"
              :aria-label="locale.t('resources.action.delete')"
              :disabled="deleting"
              @click="openDelete(p)"
            ></cds-button-action>
          </span>
        </cds-grid-cell>
      </cds-grid-row>

      <cds-grid-placeholder v-if="loading && pools.length === 0">
        <cds-progress-circle size="xl" status="info"></cds-progress-circle>
        <p cds-text="subsection">{{ locale.t('resources.loading') }}</p>
      </cds-grid-placeholder>

      <cds-grid-placeholder v-else-if="pools.length === 0">
        <cds-icon shape="history" size="xl"></cds-icon>
        <p cds-text="subsection">{{ locale.t('resources.empty') }}</p>
      </cds-grid-placeholder>

      <!-- Footer: hand-assembled pager -->
      <cds-grid-footer v-if="pageInfo && totalCount > 0">
        <span></span>
        <div class="pager">
          <label class="pager-page-size-label" for="resources-page-size">
            {{ locale.t('agents.pager.pageSize') }}
          </label>
          <cds-select control-width="shrink">
            <select
              id="resources-page-size"
              :value="pageSize"
              :aria-label="locale.t('agents.pager.pageSize')"
              @change="onPageSizeSelect"
            >
              <option
                v-for="opt in PAGE_SIZE_OPTIONS"
                :key="opt"
                :value="opt"
                :selected="opt === pageSize"
              >
                {{ opt }}
              </option>
            </select>
          </cds-select>

          <span class="pager-summary" cds-text="body">{{ summaryText }}</span>

          <cds-pagination :aria-label="locale.t('agents.pager.label')">
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
              @click="onPrevPage"
            ></cds-pagination-button>
            <cds-input cds-pagination-number>
              <input
                type="number"
                :value="currentPage"
                :aria-label="locale.t('agents.pager.page')"
                :min="1"
                :max="pageInfo.totalPages"
                @input="onPageInput"
              />
            </cds-input>
            <cds-pagination-button
              action="next"
              :disabled="currentPage >= pageInfo.totalPages"
              :aria-label="locale.t('agents.pager.next')"
              @click="onNextPage"
            ></cds-pagination-button>
            <cds-pagination-button
              action="last"
              :disabled="currentPage >= pageInfo.totalPages"
              :aria-label="locale.t('agents.pager.last')"
              @click="goToPage(pageInfo.totalPages)"
            ></cds-pagination-button>
          </cds-pagination>
        </div>
      </cds-grid-footer>
    </cds-grid>

    <!-- Column text-search dropdown (matches AgentListView's pattern: a bare
         cds-input with a typing listener — no apply/clear buttons, the filter
         applies on each keystroke.  Triggered from the 资源池名称 header.) -->
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
            :placeholder="locale.t('resources.col.name.search')"
            :aria-label="locale.t('resources.col.name.search')"
            @input="onNameKeywordInput"
          />
        </cds-input>
      </div>
    </cds-dropdown>

    <!-- Create / edit dialog: open for both "接入资源池" (no pool) and "编辑" (with pool) -->
    <CreateOrEditResourcePoolDialog
      :open="createDialogOpen"
      :pool="editingPool"
      @close="closeCreateDialog"
      @submit="onSubmit"
    />

    <ConfirmDialog
      :open="!!deletingPool"
      :title="locale.t('resources.confirm.delete.title')"
      :body="(deletingPool?.name ? locale.t('resources.confirm.delete.body').replace('{name}', deletingPool.name) : '')"
      danger
      @close="deletingPool = null"
      @confirm="doDelete"
    />
  </section>
</template>

<style scoped>
.resource-pool-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
}

.resource-pool-list :deep(cds-grid) {
  display: block;
  width: 100%;
  max-width: 100%;
  min-width: 0;
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

.toolbar :deep(.toolbar-search) {
  /* Search box stays a comfortable width — does not stretch to fill
     the row, so the "接入资源池" outline button sits flush on the
     left next to it. */
  width: 360px;
  flex: 0 0 auto;
}

/* cds-input's shadow-DOM `.input-message-container` is the wrapper that
   holds both the input and the cds-control-message slots. When no
   control message is slotted, the wrapper still renders an empty bar
   that takes vertical space at the top of the page. Collapse it so
   the search box height is just the input row. */
.toolbar :deep(.input-message-container) {
  display: contents;
}
/* Inside the toolbar, suppress cds-input's bottom border — it draws a
   visible horizontal line just before the "接入资源池" button.

   IMPORTANT: cds-input is a web component. Its `.input-container` lives
   inside its shadow DOM, so Vue's scoped `:deep(.input-container)`
   selector never matches (scoped :deep() only crosses Vue component
   boundaries, not web-component shadow boundaries). The supported way
   to override cds-input chrome from outside is to set its CSS custom
   properties on the host element — the host IS in the light DOM, so
   this scoped selector actually hits. */
.toolbar-search {
  --border-bottom: 0;
}

/* "当前同步状态" inline banner */
.sync-status-banner {
  display: flex;
  align-items: center;
  gap: 8px;
}
.sync-status-banner :deep(cds-icon) {
  flex-shrink: 0;
}

.muted {
  color: var(--cds-alias-typography-color-300, #565656);
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

.col-head.col-actions {
  justify-content: flex-end;
}

.endpoint-cell {
  word-break: break-all;
  font-size: 12px;
}

.content-library-cell {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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
  min-width: 72px;
}
.status-badge :deep(.badge) {
  padding: 4px 12px;
  font-size: 13px;
  border-radius: 12px;
}

.actions-cell {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.pager {
  display: inline-flex;
  align-items: center;
  gap: var(--cds-global-space-4, 8px);
  margin-left: auto;
  white-space: nowrap;
}

.pager-page-size-label {
  color: var(--cds-alias-typography-color-300, #565656);
  cursor: default;
}

.pager-summary {
  color: var(--cds-alias-typography-color-300, #565656);
  white-space: nowrap;
}

</style>