<script setup lang="ts">
/**
 * 技能管理 (Skills) — Skill hub CRUD wired to the real backend.
 *
 * A list of skills (cds-grid) with create + edit (both via upsertSkill) in a
 * dialog, and delete (deleteSkill) behind a confirm. Mirrors RateLimitPolicyView
 * for list/sort/filter/paginate/refresh ergonomics and reuses the shared
 * cds-* components, AppDropdown and ConfirmDialog.
 *
 * Both mutations are gated @hasRole(any: [admin]); a non-admin caller gets the
 * backend error surfaced via toast. The recommended route guard is meta.admin.
 *
 * i18n is self-contained (FALLBACK + tt) so this view never edits the shared
 * locale store. See the report for the canonical zh/en list to add later.
 */
import { computed, ref } from 'vue'
import { useQuery } from '@vue/apollo-composable'
import { apolloClient } from '@/api/graphql/client'
import AppDropdown from '@/components/AppDropdown.vue'
import SkillFormDialog from '@/views/skill/SkillFormDialog.vue'
import ConfirmDialog from '@/views/user-role/ConfirmDialog.vue'
import { useLocaleStore } from '@/stores/locale'
import { useToast } from '@/composables/useToast'
import { graphqlErrorMessage } from '@/api/graphql/errors'
import {
  SKILLS_QUERY,
  UPSERT_SKILL,
  DELETE_SKILL,
  type SkillsResult,
  type SkillNode,
  type UpsertSkillInput,
  type UpsertSkillResult,
  type UpsertSkillVars,
  type DeleteSkillResult,
  type DeleteSkillVars,
} from '@/api/graphql/queries/skills'
import '@/components/icons'

const FALLBACK: Record<string, { zh: string; en: string }> = {
  'skill.title': { zh: '技能管理', en: 'Skills' },
  'skill.description': {
    zh: '管理技能库中的技能制品，供智能体在部署时挂载与调用。',
    en: 'Manage skill artifacts in the skill hub for agents to mount and invoke at deploy time.',
  },
  'skill.action.create': { zh: '新建技能', en: 'New Skill' },
  'skill.action.refresh': { zh: '刷新', en: 'Refresh' },
  'skill.action.batch': { zh: '批量操作', en: 'Batch' },
  'skill.action.edit': { zh: '编辑', en: 'Edit' },
  'skill.action.delete': { zh: '删除', en: 'Delete' },
  'skill.batch.disabled': { zh: '请先选择技能', en: 'Select skills first' },
  'skill.batch.delete': { zh: '删除所选', en: 'Delete selected' },
  'skill.col.selectAll': { zh: '全选', en: 'Select all' },
  'skill.col.selectSkill': { zh: '选择技能 {name}', en: 'Select skill {name}' },
  'skill.col.name': { zh: '名称', en: 'Name' },
  'skill.col.version': { zh: '版本', en: 'Version' },
  'skill.col.description': { zh: '描述', en: 'Description' },
  'skill.col.uri': { zh: '资源地址', en: 'URI' },
  'skill.col.createdAt': { zh: '创建时间', en: 'Created At' },
  'skill.col.actions': { zh: '操作', en: 'Actions' },
  'skill.sort': { zh: '按 {column} 排序', en: 'Sort by {column}' },
  'skill.filter': { zh: '按 {column} 筛选', en: 'Filter by {column}' },
  'skill.filter.namePlaceholder': { zh: '搜索技能名称', en: 'Search skill name' },
  'skill.filter.clear': { zh: '清除筛选', en: 'Clear filter' },
  'skill.table.label': { zh: '技能列表', en: 'Skills table' },
  'skill.empty': { zh: '暂无技能', en: 'No skills yet' },
  'skill.emptyDescription': { zh: '—', en: '—' },
  'skill.selected': { zh: '已选 {count} 项', en: '{count} selected' },
  'skill.pagination.pageSize': { zh: '每页', en: 'Page size' },
  'skill.pagination.summary': { zh: '第 {start}–{end} 条，共 {total} 条', en: '{start}–{end} of {total}' },
  'skill.pagination.label': { zh: '分页', en: 'Pagination' },
  'skill.pager.first': { zh: '首页', en: 'First page' },
  'skill.pager.prev': { zh: '上一页', en: 'Previous page' },
  'skill.pager.page': { zh: '页码', en: 'Page' },
  'skill.pager.next': { zh: '下一页', en: 'Next page' },
  'skill.pager.last': { zh: '末页', en: 'Last page' },
  'skill.toast.created': { zh: '技能已创建', en: 'Skill created' },
  'skill.toast.updated': { zh: '技能已更新', en: 'Skill updated' },
  'skill.toast.saveFailed': { zh: '保存技能失败', en: 'Failed to save skill' },
  'skill.toast.deleted': { zh: '已删除 {count} 个技能', en: 'Deleted {count} skill(s)' },
  'skill.toast.deleteFailed': { zh: '删除技能失败', en: 'Failed to delete skill' },
  'skill.toast.refreshed': { zh: '技能列表已刷新', en: 'Skills refreshed' },
  'skill.toast.refreshFailed': { zh: '刷新失败', en: 'Failed to refresh' },
  'skill.confirm.deleteTitle': { zh: '删除技能', en: 'Delete skill' },
  'skill.confirm.batchDeleteTitle': { zh: '批量删除技能', en: 'Delete skills' },
  'skill.confirm.deleteBody': {
    zh: '确定要删除技能「{name}」吗？此操作不可撤销。',
    en: 'Delete the skill "{name}"? This cannot be undone.',
  },
  'skill.confirm.batchDeleteBody': {
    zh: '确定要删除所选的 {count} 个技能吗？此操作不可撤销。',
    en: 'Delete the {count} selected skill(s)? This cannot be undone.',
  },
}

function tt(key: string): string {
  const entry = FALLBACK[key]
  if (entry) return entry[locale.locale]
  return locale.t(key)
}

function format(key: string, replacements: Record<string, string>): string {
  return Object.entries(replacements).reduce(
    (text, [token, value]) => text.replace(`{${token}}`, value),
    tt(key),
  )
}

const locale = useLocaleStore()
const toast = useToast()

const PAGE_SIZE_OPTIONS = [10, 20, 50] as const
type PageSize = (typeof PAGE_SIZE_OPTIONS)[number]
type SkillColumn = 'NAME' | 'VERSION' | 'CREATED_AT'
type SortDirection = 'ASC' | 'DESC'

const { result, loading, refetch } = useQuery<SkillsResult>(SKILLS_QUERY)
const skills = computed<SkillNode[]>(() => result.value?.skills ?? [])

const selectedIds = ref<Set<string>>(new Set())
const pageSize = ref<PageSize>(10)
const currentPage = ref(1)
const formOpen = ref(false)
const editingSkill = ref<SkillNode | null>(null)
const saving = ref(false)
const pendingDeleteIds = ref<string[]>([])
const sortField = ref<SkillColumn | null>(null)
const sortDirection = ref<SortDirection>('ASC')
const nameFilter = ref('')
const filterMenuAnchor = ref<HTMLElement | null>(null)
const filterMenuOpen = ref(false)

const filteredSkills = computed(() => {
  const keyword = nameFilter.value.trim().toLocaleLowerCase()
  const filtered = skills.value.filter(
    (skill) => !keyword || skill.name.toLocaleLowerCase().includes(keyword),
  )
  if (!sortField.value) return filtered
  const direction = sortDirection.value === 'ASC' ? 1 : -1
  const field = sortField.value
  return [...filtered].sort((left, right) => {
    if (field === 'CREATED_AT') {
      return left.createdAt.localeCompare(right.createdAt) * direction
    }
    const leftValue = field === 'VERSION' ? left.version : left.name
    const rightValue = field === 'VERSION' ? right.version : right.name
    return leftValue.localeCompare(rightValue, locale.locale) * direction
  })
})

const totalCount = computed(() => filteredSkills.value.length)
const totalPages = computed(() => Math.max(1, Math.ceil(totalCount.value / pageSize.value)))
const visibleSkills = computed(() => {
  const offset = (currentPage.value - 1) * pageSize.value
  return filteredSkills.value.slice(offset, offset + pageSize.value)
})
const selectedCount = computed(() => selectedIds.value.size)
const allVisibleSelected = computed(
  () =>
    visibleSkills.value.length > 0 &&
    visibleSkills.value.every((skill) => selectedIds.value.has(skill.id)),
)
const summaryText = computed(() => {
  const start = totalCount.value === 0 ? 0 : (currentPage.value - 1) * pageSize.value + 1
  const end = Math.min(currentPage.value * pageSize.value, totalCount.value)
  return format('skill.pagination.summary', {
    start: String(start),
    end: String(end),
    total: String(totalCount.value),
  })
})
const deleteDialogTitle = computed(() =>
  pendingDeleteIds.value.length > 1
    ? tt('skill.confirm.batchDeleteTitle')
    : tt('skill.confirm.deleteTitle'),
)
const deleteDialogBody = computed(() => {
  if (pendingDeleteIds.value.length > 1) {
    return format('skill.confirm.batchDeleteBody', { count: String(pendingDeleteIds.value.length) })
  }
  const target = skills.value.find((skill) => skill.id === pendingDeleteIds.value[0])
  return format('skill.confirm.deleteBody', { name: target?.name ?? '' })
})

function formatTimestamp(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString(locale.locale === 'zh' ? 'zh-CN' : 'en-US')
}

function toggleSelect(id: string, checked: boolean) {
  const next = new Set(selectedIds.value)
  if (checked) next.add(id)
  else next.delete(id)
  selectedIds.value = next
}

function toggleSelectAll(checked: boolean) {
  const next = new Set(selectedIds.value)
  for (const skill of visibleSkills.value) {
    if (checked) next.add(skill.id)
    else next.delete(skill.id)
  }
  selectedIds.value = next
}

function sortStateFor(field: SkillColumn): 'none' | 'ascending' | 'descending' {
  if (sortField.value !== field) return 'none'
  return sortDirection.value === 'ASC' ? 'ascending' : 'descending'
}

function toggleSort(field: SkillColumn) {
  const state = sortStateFor(field)
  if (state === 'none') {
    sortField.value = field
    sortDirection.value = 'ASC'
  } else if (state === 'ascending') {
    sortDirection.value = 'DESC'
  } else {
    sortField.value = null
    sortDirection.value = 'ASC'
  }
  currentPage.value = 1
}

function openFilterMenu(event: MouseEvent) {
  filterMenuOpen.value = true
  filterMenuAnchor.value = event.currentTarget as HTMLElement
}

function closeFilterMenu() {
  filterMenuOpen.value = false
  filterMenuAnchor.value = null
}

function hasNameFilter(): boolean {
  return Boolean(nameFilter.value.trim())
}

function setNameFilter(value: string) {
  nameFilter.value = value
  currentPage.value = 1
}

function clearNameFilter() {
  nameFilter.value = ''
  currentPage.value = 1
  closeFilterMenu()
}

function openCreate() {
  editingSkill.value = null
  formOpen.value = true
}

function openEdit(skill: SkillNode) {
  editingSkill.value = skill
  formOpen.value = true
}

function closeForm() {
  if (saving.value) return
  formOpen.value = false
  editingSkill.value = null
}

async function submitSkill(draft: UpsertSkillInput) {
  if (saving.value) return
  const isEditing = Boolean(editingSkill.value)
  saving.value = true
  try {
    await apolloClient.mutate<UpsertSkillResult, UpsertSkillVars>({
      mutation: UPSERT_SKILL,
      variables: { input: draft },
    })
    toast.success(tt(isEditing ? 'skill.toast.updated' : 'skill.toast.created'))
    if (!isEditing) currentPage.value = 1
    formOpen.value = false
    editingSkill.value = null
    await refetch()
  } catch (error) {
    toast.error(graphqlErrorMessage(error, tt('skill.toast.saveFailed')))
  } finally {
    saving.value = false
  }
}

function requestDelete(skill: SkillNode) {
  pendingDeleteIds.value = [skill.id]
}

function requestBatchDelete(close: () => void) {
  const ids = [...selectedIds.value]
  close()
  if (ids.length === 0) return
  pendingDeleteIds.value = ids
}

function closeDelete() {
  pendingDeleteIds.value = []
}

async function confirmDelete() {
  const ids = [...pendingDeleteIds.value]
  pendingDeleteIds.value = []
  if (ids.length === 0) return
  const outcomes = await Promise.allSettled(
    ids.map((id) =>
      apolloClient.mutate<DeleteSkillResult, DeleteSkillVars>({
        mutation: DELETE_SKILL,
        variables: { id },
      }),
    ),
  )
  const deletedIds = ids.filter((_, index) => outcomes[index].status === 'fulfilled')
  const failures = outcomes.filter(
    (outcome): outcome is PromiseRejectedResult => outcome.status === 'rejected',
  )
  if (deletedIds.length > 0) {
    toast.success(format('skill.toast.deleted', { count: String(deletedIds.length) }))
  }
  if (failures.length > 0) {
    toast.error(graphqlErrorMessage(failures[0].reason, tt('skill.toast.deleteFailed')))
  }
  selectedIds.value = new Set([...selectedIds.value].filter((id) => !deletedIds.includes(id)))
  await refetch()
  if (currentPage.value > totalPages.value) currentPage.value = totalPages.value
}

async function refreshSkills() {
  if (loading.value) return
  try {
    await refetch()
    toast.success(tt('skill.toast.refreshed'))
  } catch (error) {
    toast.error(graphqlErrorMessage(error, tt('skill.toast.refreshFailed')))
  }
}

function onPageSizeChange(event: Event) {
  const next = Number((event.target as HTMLSelectElement).value)
  if (!PAGE_SIZE_OPTIONS.includes(next as PageSize)) return
  pageSize.value = next as PageSize
  currentPage.value = 1
}

function goToPage(page: number) {
  if (page < 1 || page > totalPages.value) return
  currentPage.value = page
}
</script>

<template>
  <section class="skill-page">
    <header class="page-head">
      <h1 cds-text="title" class="heading">{{ tt('skill.title') }}</h1>
      <p cds-text="body" class="desc muted">{{ tt('skill.description') }}</p>
    </header>

    <div class="content-card">
      <div class="toolbar">
        <cds-button action="outline" status="primary" @click="openCreate">
          <cds-icon shape="plus-circle" size="sm" aria-hidden="true"></cds-icon>
          {{ tt('skill.action.create') }}
        </cds-button>

        <AppDropdown align="start" :disabled="selectedCount === 0">
          <template #trigger>
            <cds-button
              action="outline"
              :disabled="selectedCount === 0"
              :title="selectedCount === 0 ? tt('skill.batch.disabled') : undefined"
            >
              <cds-icon shape="cog" size="sm" aria-hidden="true"></cds-icon>
              {{ tt('skill.action.batch') }}
              <cds-icon shape="angle" direction="down" size="sm" aria-hidden="true"></cds-icon>
            </cds-button>
          </template>
          <template #default="{ close }">
            <button class="menu-option danger" type="button" @click="requestBatchDelete(close)">
              <cds-icon shape="trash" size="sm"></cds-icon>
              {{ tt('skill.batch.delete') }}
            </button>
          </template>
        </AppDropdown>

        <cds-button
          action="ghost"
          class="refresh-button"
          :disabled="loading"
          :aria-label="tt('skill.action.refresh')"
          :title="tt('skill.action.refresh')"
          @click="refreshSkills"
        >
          <cds-icon shape="refresh" size="md" :class="{ spinning: loading }"></cds-icon>
          <span>{{ tt('skill.action.refresh') }}</span>
        </cds-button>
      </div>

      <div class="grid-card">
        <cds-grid border="row" column-layout="flex" role="grid" :aria-label="tt('skill.table.label')">
          <cds-grid-column type="action" :resizable="false">
            <input
              type="checkbox"
              class="app-checkbox"
              :checked="allVisibleSelected"
              :aria-label="tt('skill.col.selectAll')"
              @change="toggleSelectAll(($event.target as HTMLInputElement).checked)"
            />
          </cds-grid-column>

          <cds-grid-column width="24%">
            <div class="column-head">
              <span>{{ tt('skill.col.name') }}</span>
              <span class="column-head-actions">
                <cds-button-action
                  :aria-label="format('skill.sort', { column: tt('skill.col.name') })"
                  @click="toggleSort('NAME')"
                >
                  <cds-icon
                    v-if="sortStateFor('NAME') === 'ascending'"
                    shape="angle"
                    direction="up"
                    size="sm"
                  ></cds-icon>
                  <cds-icon
                    v-else-if="sortStateFor('NAME') === 'descending'"
                    shape="angle"
                    direction="down"
                    size="sm"
                  ></cds-icon>
                  <cds-icon v-else shape="two-way-arrows" class="sort-idle" size="sm"></cds-icon>
                </cds-button-action>
                <cds-button-action
                  shape="filter"
                  :expanded="hasNameFilter()"
                  :aria-label="format('skill.filter', { column: tt('skill.col.name') })"
                  @click="(event: MouseEvent) => openFilterMenu(event)"
                ></cds-button-action>
              </span>
            </div>
          </cds-grid-column>

          <cds-grid-column width="12%">
            <div class="column-head">
              <span>{{ tt('skill.col.version') }}</span>
              <span class="column-head-actions">
                <cds-button-action
                  :aria-label="format('skill.sort', { column: tt('skill.col.version') })"
                  @click="toggleSort('VERSION')"
                >
                  <cds-icon
                    v-if="sortStateFor('VERSION') === 'ascending'"
                    shape="angle"
                    direction="up"
                    size="sm"
                  ></cds-icon>
                  <cds-icon
                    v-else-if="sortStateFor('VERSION') === 'descending'"
                    shape="angle"
                    direction="down"
                    size="sm"
                  ></cds-icon>
                  <cds-icon v-else shape="two-way-arrows" class="sort-idle" size="sm"></cds-icon>
                </cds-button-action>
              </span>
            </div>
          </cds-grid-column>

          <cds-grid-column width="22%">{{ tt('skill.col.description') }}</cds-grid-column>
          <cds-grid-column width="18%">{{ tt('skill.col.uri') }}</cds-grid-column>

          <cds-grid-column width="12%">
            <div class="column-head">
              <span>{{ tt('skill.col.createdAt') }}</span>
              <span class="column-head-actions">
                <cds-button-action
                  :aria-label="format('skill.sort', { column: tt('skill.col.createdAt') })"
                  @click="toggleSort('CREATED_AT')"
                >
                  <cds-icon
                    v-if="sortStateFor('CREATED_AT') === 'ascending'"
                    shape="angle"
                    direction="up"
                    size="sm"
                  ></cds-icon>
                  <cds-icon
                    v-else-if="sortStateFor('CREATED_AT') === 'descending'"
                    shape="angle"
                    direction="down"
                    size="sm"
                  ></cds-icon>
                  <cds-icon v-else shape="two-way-arrows" class="sort-idle" size="sm"></cds-icon>
                </cds-button-action>
              </span>
            </div>
          </cds-grid-column>

          <cds-grid-column width="12%">{{ tt('skill.col.actions') }}</cds-grid-column>

          <cds-grid-row v-for="skill in visibleSkills" :key="skill.id">
            <cds-grid-cell>
              <input
                type="checkbox"
                class="app-checkbox"
                :checked="selectedIds.has(skill.id)"
                :aria-label="format('skill.col.selectSkill', { name: skill.name })"
                @change="toggleSelect(skill.id, ($event.target as HTMLInputElement).checked)"
              />
            </cds-grid-cell>
            <cds-grid-cell>
              <strong class="skill-name" :title="skill.name">{{ skill.name }}</strong>
            </cds-grid-cell>
            <cds-grid-cell>
              <cds-badge status="neutral">{{ skill.version }}</cds-badge>
            </cds-grid-cell>
            <cds-grid-cell>
              <span class="ellipsis" :title="skill.description ?? ''">{{ skill.description || '—' }}</span>
            </cds-grid-cell>
            <cds-grid-cell>
              <span class="ellipsis mono" :title="skill.uri">{{ skill.uri }}</span>
            </cds-grid-cell>
            <cds-grid-cell>
              <span class="muted">{{ formatTimestamp(skill.createdAt) }}</span>
            </cds-grid-cell>
            <cds-grid-cell>
              <div class="row-actions">
                <button type="button" class="row-action" @click="openEdit(skill)">
                  <cds-icon shape="pencil" size="sm"></cds-icon>
                  <span>{{ tt('skill.action.edit') }}</span>
                </button>
                <button type="button" class="row-action danger" @click="requestDelete(skill)">
                  <cds-icon shape="trash" size="sm"></cds-icon>
                  <span>{{ tt('skill.action.delete') }}</span>
                </button>
              </div>
            </cds-grid-cell>
          </cds-grid-row>

          <cds-grid-placeholder v-if="visibleSkills.length === 0">
            <cds-icon shape="book" size="xl"></cds-icon>
            <p cds-text="subsection">{{ tt('skill.empty') }}</p>
            <cds-button action="outline" size="sm" @click="openCreate">
              {{ tt('skill.action.create') }}
            </cds-button>
          </cds-grid-placeholder>

          <cds-grid-footer v-if="totalCount > 0">
            <span v-if="selectedCount > 0" class="selected-summary">
              {{ format('skill.selected', { count: String(selectedCount) }) }}
            </span>
            <div class="pager">
              <label for="skill-page-size">{{ tt('skill.pagination.pageSize') }}</label>
              <cds-select control-width="shrink">
                <select
                  id="skill-page-size"
                  :value="pageSize"
                  :aria-label="tt('skill.pagination.pageSize')"
                  @change="onPageSizeChange"
                >
                  <option v-for="option in PAGE_SIZE_OPTIONS" :key="option" :value="option">
                    {{ option }}
                  </option>
                </select>
              </cds-select>
              <span class="pager-summary">{{ summaryText }}</span>
              <cds-pagination :aria-label="tt('skill.pagination.label')">
                <cds-pagination-button
                  action="first"
                  :disabled="currentPage <= 1"
                  :aria-label="tt('skill.pager.first')"
                  @click="goToPage(1)"
                ></cds-pagination-button>
                <cds-pagination-button
                  action="prev"
                  :disabled="currentPage <= 1"
                  :aria-label="tt('skill.pager.prev')"
                  @click="goToPage(currentPage - 1)"
                ></cds-pagination-button>
                <cds-input cds-pagination-number>
                  <input
                    type="number"
                    :value="currentPage"
                    :min="1"
                    :max="totalPages"
                    :aria-label="tt('skill.pager.page')"
                    @change="goToPage(Number(($event.target as HTMLInputElement).value))"
                  />
                </cds-input>
                <cds-pagination-button
                  action="next"
                  :disabled="currentPage >= totalPages"
                  :aria-label="tt('skill.pager.next')"
                  @click="goToPage(currentPage + 1)"
                ></cds-pagination-button>
                <cds-pagination-button
                  action="last"
                  :disabled="currentPage >= totalPages"
                  :aria-label="tt('skill.pager.last')"
                  @click="goToPage(totalPages)"
                ></cds-pagination-button>
              </cds-pagination>
            </div>
          </cds-grid-footer>
        </cds-grid>
      </div>
    </div>

    <cds-dropdown
      v-if="filterMenuAnchor && filterMenuOpen"
      :hidden="false"
      :anchor="filterMenuAnchor"
      closable
      @closeChange="closeFilterMenu"
    >
      <div class="filter-panel">
        <input
          class="filter-input"
          type="text"
          :value="nameFilter"
          :placeholder="tt('skill.filter.namePlaceholder')"
          :aria-label="tt('skill.filter.namePlaceholder')"
          @input="setNameFilter(($event.target as HTMLInputElement).value)"
        />
        <div v-if="hasNameFilter()" class="filter-footer">
          <cds-button action="outline" size="sm" @click="clearNameFilter">
            {{ tt('skill.filter.clear') }}
          </cds-button>
        </div>
      </div>
    </cds-dropdown>

    <SkillFormDialog
      v-if="formOpen"
      :open="formOpen"
      :skill="editingSkill"
      :saving="saving"
      @close="closeForm"
      @submit="submitSkill"
    />

    <ConfirmDialog
      :open="pendingDeleteIds.length > 0"
      :title="deleteDialogTitle"
      :body="deleteDialogBody"
      danger
      @close="closeDelete"
      @confirm="confirmDelete"
    />
  </section>
</template>

<style scoped>
.skill-page {
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
.skill-page cds-grid {
  display: block;
  width: 100%;
  min-width: 880px;
  min-height: 100%;
}
.column-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 4px;
  width: 100%;
  min-width: 0;
}
.column-head-actions {
  display: inline-flex;
  align-items: center;
  gap: 1px;
  flex: 0 0 auto;
}
.sort-idle {
  transform: rotate(90deg);
}
.app-checkbox {
  width: 16px;
  height: 16px;
  accent-color: var(--cds-alias-object-interaction-color, #0072a3);
}
.skill-name {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ellipsis {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.mono {
  font-family: var(--cds-global-typography-monospace-font-family, monospace);
  font-size: 12px;
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
.menu-option.danger {
  color: var(--cds-alias-status-danger, #c92100);
}
.filter-panel {
  min-width: 250px;
  padding: 8px;
}
.filter-input {
  width: 100%;
  min-height: 32px;
  padding: 6px 9px;
  border: 1px solid var(--cds-alias-object-border-color, #8c8c8c);
  border-radius: 3px;
  background: var(--cds-alias-object-container-background, #fff);
  color: var(--cds-alias-object-app-foreground, #1b1b1b);
  font: inherit;
}
.filter-input:focus {
  border-color: var(--cds-alias-object-interaction-color, #0072a3);
  outline: 2px solid color-mix(in srgb, var(--cds-alias-object-interaction-color, #0072a3) 20%, transparent);
  outline-offset: 1px;
}
.filter-footer {
  display: flex;
  justify-content: flex-end;
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid var(--cds-alias-object-border-color, #e8e8e8);
}
.selected-summary {
  color: var(--cds-alias-typography-color-300, #565656);
}
.pager {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  margin-left: auto;
  white-space: nowrap;
}
.pager > label,
.pager-summary {
  color: var(--cds-alias-typography-color-300, #565656);
}
.spinning {
  animation: skill-spin 1s linear infinite;
  transform-origin: center;
}
@keyframes skill-spin {
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
