<script setup lang="ts">
/**
 * 制品库 (Artifacts & versions) — LLD-06.
 *
 * Master-detail page wired to the real backend:
 *   - left: list of artifacts (filter by ArtifactKind). Each row is one named
 *     artifact; the backend `artifacts(kind:)` query may return several rows per
 *     name (one per version), so we collapse to the newest row per name for the
 *     list and surface every version on the right.
 *   - right: the selected artifact's full version history via
 *     `artifactVersions(name:)` (read-only: version / uri / sha256 / createdAt).
 *   - toolbar: create (upsertArtifact) ; per-row: new-version / edit / delete.
 *
 * upsertArtifact / deleteArtifact are gated `@hasRole(any: [admin, tenant_admin])`;
 * non-privileged callers get a backend error surfaced via toast.
 */
import { computed, ref, watch } from 'vue'
import { useQuery } from '@vue/apollo-composable'
import { apolloClient } from '@/api/graphql/client'
import { useLocaleStore } from '@/stores/locale'
import { useToast } from '@/composables/useToast'
import { graphqlErrorMessage } from '@/api/graphql/errors'
import AppDropdown from '@/components/AppDropdown.vue'
import ConfirmDialog from '@/views/user-role/ConfirmDialog.vue'
import ArtifactFormDialog from '@/views/artifact/ArtifactFormDialog.vue'
import {
  PLATFORM_ARTIFACTS_QUERY,
  PLATFORM_ARTIFACT_VERSIONS_QUERY,
  UPSERT_PLATFORM_ARTIFACT,
  DELETE_PLATFORM_ARTIFACT,
  ARTIFACT_KINDS,
  type ArtifactKind,
  type ArtifactNode,
  type PlatformArtifactsResult,
  type PlatformArtifactsVars,
  type PlatformArtifactVersionsResult,
  type PlatformArtifactVersionsVars,
  type UpsertArtifactInputVars,
  type UpsertPlatformArtifactResult,
  type UpsertPlatformArtifactVars,
  type DeletePlatformArtifactResult,
  type DeletePlatformArtifactVars,
} from '@/api/graphql/queries/artifacts'
import '@/components/icons'

const locale = useLocaleStore()
const toast = useToast()

// Local fallback dictionary for artifacts.* keys. The shared locale store
// (src/stores/locale.ts) does not carry these keys and is off-limits for this
// change; locale.t returns the raw key when missing, so this view resolves
// artifacts.* itself and defers to the store for shared keys. The report lists
// the canonical zh/en set to fold into the store later.
const FALLBACK: Record<string, { zh: string; en: string }> = {
  'artifacts.title': { zh: '制品库', en: 'Artifacts' },
  'artifacts.description': {
    zh: '管理脚本、配置、软件包与知识包等制品及其版本；制品在部署时下发或注入智能体所在的虚拟机。',
    en: 'Manage scripts, configs, packages and knowledge artifacts and their versions; artifacts are delivered or injected into the agent VM at deploy.',
  },
  'artifacts.action.refresh': { zh: '刷新', en: 'Refresh' },
  'artifacts.action.create': { zh: '新建制品', en: 'New Artifact' },
  'artifacts.filter.kind': { zh: '制品类型', en: 'Kind' },
  'artifacts.filter.allKinds': { zh: '全部类型', en: 'All kinds' },
  'artifacts.kind.script': { zh: '脚本', en: 'Script' },
  'artifacts.kind.config': { zh: '配置', en: 'Config' },
  'artifacts.kind.package': { zh: '软件包', en: 'Package' },
  'artifacts.kind.knowledge': { zh: '知识包', en: 'Knowledge' },
  'artifacts.list.title': { zh: '制品列表', en: 'Artifacts' },
  'artifacts.list.loading': { zh: '加载中…', en: 'Loading…' },
  'artifacts.list.empty': { zh: '暂无制品', en: 'No artifacts' },
  'artifacts.list.error': { zh: '制品加载失败', en: 'Failed to load artifacts' },
  'artifacts.list.latest': { zh: '最新', en: 'latest' },
  'artifacts.row.menu': { zh: '操作', en: 'Actions' },
  'artifacts.row.newVersion': { zh: '新增版本', en: 'New Version' },
  'artifacts.row.edit': { zh: '编辑', en: 'Edit' },
  'artifacts.row.delete': { zh: '删除', en: 'Delete' },
  'artifacts.detail.empty': { zh: '请选择左侧的一个制品以查看版本', en: 'Select an artifact to view its versions' },
  'artifacts.detail.versions': { zh: '版本列表', en: 'Versions' },
  'artifacts.detail.versionsLoading': { zh: '正在加载版本…', en: 'Loading versions…' },
  'artifacts.detail.versionsEmpty': { zh: '暂无版本', en: 'No versions' },
  'artifacts.detail.versionsError': { zh: '版本加载失败', en: 'Failed to load versions' },
  'artifacts.detail.version': { zh: '版本', en: 'Version' },
  'artifacts.detail.uri': { zh: '地址 (URI)', en: 'URI' },
  'artifacts.detail.sha256': { zh: 'SHA-256', en: 'SHA-256' },
  'artifacts.detail.createdAt': { zh: '创建时间', en: 'Created At' },
  'artifacts.detail.none': { zh: '—', en: '—' },
  'artifacts.dialog.createTitle': { zh: '新建制品', en: 'New Artifact' },
  'artifacts.dialog.versionTitle': { zh: '新增版本', en: 'New Version' },
  'artifacts.dialog.editTitle': { zh: '编辑制品', en: 'Edit Artifact' },
  'artifacts.confirm.deleteTitle': { zh: '删除制品版本', en: 'Delete Artifact Version' },
  'artifacts.confirm.deleteBody': {
    zh: '确定要删除 {name} v{version} 吗？此操作不可撤销。',
    en: 'Delete {name} v{version}? This cannot be undone.',
  },
  'artifacts.form.name': { zh: '名称', en: 'Name' },
  'artifacts.form.namePlaceholder': { zh: '如 nginx-bootstrap', en: 'e.g. nginx-bootstrap' },
  'artifacts.form.kind': { zh: '类型', en: 'Kind' },
  'artifacts.form.version': { zh: '版本', en: 'Version' },
  'artifacts.form.versionPlaceholder': { zh: '如 1.0.0', en: 'e.g. 1.0.0' },
  'artifacts.form.uri': { zh: '地址 (URI)', en: 'URI' },
  'artifacts.form.uriPlaceholder': { zh: '如 s3://bucket/path 或 oci://…', en: 'e.g. s3://bucket/path or oci://…' },
  'artifacts.form.sha256': { zh: 'SHA-256（可选）', en: 'SHA-256 (optional)' },
  'artifacts.form.sha256Placeholder': { zh: '内容摘要', en: 'content digest' },
  'artifacts.form.content': { zh: '内联内容（可选）', en: 'Inline content (optional)' },
  'artifacts.form.contentPlaceholder': { zh: '小型脚本/配置/知识包文本（≤64K）', en: 'Small script / config / knowledge text (≤64K)' },
  'artifacts.form.contentHint': {
    zh: '仅适用于脚本/配置/知识包（≤64K），部署时注入虚拟机。',
    en: 'Only for script / config / knowledge (≤64K); injected into the VM at deploy.',
  },
  'artifacts.form.contentPackageHint': {
    zh: '软件包不支持内联内容，请使用上面的 URI 引用制品。',
    en: 'Packages cannot carry inline content; reference the artifact via the URI above.',
  },
  'artifacts.form.required': { zh: '此项为必填', en: 'This field is required' },
  'artifacts.form.cancel': { zh: '取消', en: 'Cancel' },
  'artifacts.form.save': { zh: '保存', en: 'Save' },
  'artifacts.toast.created': { zh: '制品已保存', en: 'Artifact saved' },
  'artifacts.toast.saveFailed': { zh: '保存制品失败', en: 'Failed to save artifact' },
  'artifacts.toast.deleted': { zh: '制品版本已删除', en: 'Artifact version deleted' },
  'artifacts.toast.deleteFailed': { zh: '删除制品失败', en: 'Failed to delete artifact' },
  'artifacts.toast.refreshed': { zh: '制品列表已刷新', en: 'Artifacts refreshed' },
  'artifacts.toast.refreshFailed': { zh: '刷新失败', en: 'Failed to refresh' },
}

function tt(key: string): string {
  const entry = FALLBACK[key]
  if (entry) return entry[locale.locale]
  return locale.t(key)
}

function fmt(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, k: string) => vars[k] ?? `{${k}}`)
}

const ALL_KINDS = '__ALL__'
const kindFilter = ref<string>(ALL_KINDS)
const selectedName = ref<string | null>(null)

// Dialog state.
const formOpen = ref(false)
const formInitial = ref<ArtifactNode | null>(null)
const formLockIdentity = ref(false)
const formTitle = ref('')
const saving = ref(false)

// Delete confirm state.
const confirmOpen = ref(false)
const deleteTarget = ref<ArtifactNode | null>(null)
const deleting = ref(false)

// --- master list query --------------------------------------------------
const listVars = computed<PlatformArtifactsVars>(() => ({
  kind: kindFilter.value === ALL_KINDS ? undefined : (kindFilter.value as ArtifactKind),
}))

const {
  result: listResult,
  loading: listLoading,
  error: listError,
  refetch: refetchList,
} = useQuery<PlatformArtifactsResult, PlatformArtifactsVars>(PLATFORM_ARTIFACTS_QUERY, listVars)

const allRows = computed<ArtifactNode[]>(() => listResult.value?.artifacts ?? [])

// Collapse to the newest row per name (the master list shows one entry per
// named artifact; full version history lives in the detail pane).
const artifacts = computed<ArtifactNode[]>(() => {
  const byName = new Map<string, ArtifactNode>()
  for (const row of allRows.value) {
    const current = byName.get(row.name)
    if (!current || row.createdAt > current.createdAt) byName.set(row.name, row)
  }
  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name, locale.locale))
})

const selectedArtifact = computed<ArtifactNode | null>(
  () => artifacts.value.find((a) => a.name === selectedName.value) ?? null,
)

// Keep a valid selection: default to first, clear when it vanishes.
watch(
  artifacts,
  (list) => {
    if (list.length === 0) {
      selectedName.value = null
      return
    }
    if (!list.some((a) => a.name === selectedName.value)) {
      selectedName.value = list[0].name
    }
  },
  { immediate: true },
)

// --- detail (versions) query -------------------------------------------
const versionsVars = computed<PlatformArtifactVersionsVars>(() => ({
  name: selectedName.value ?? '',
}))

const versionsEnabled = computed(() => selectedName.value !== null)

const {
  result: versionsResult,
  loading: versionsLoading,
  error: versionsError,
  refetch: refetchVersions,
} = useQuery<PlatformArtifactVersionsResult, PlatformArtifactVersionsVars>(
  PLATFORM_ARTIFACT_VERSIONS_QUERY,
  versionsVars,
  () => ({ enabled: versionsEnabled.value }),
)

const versions = computed<ArtifactNode[]>(() => versionsResult.value?.artifactVersions ?? [])

// --- handlers -----------------------------------------------------------
function selectArtifact(name: string) {
  selectedName.value = name
}

function onKindChange(event: Event) {
  kindFilter.value = (event.target as HTMLSelectElement).value
}

function openCreate() {
  formInitial.value = null
  formLockIdentity.value = false
  formTitle.value = tt('artifacts.dialog.createTitle')
  formOpen.value = true
}

function openNewVersion(artifact: ArtifactNode) {
  // Pre-fill name+kind; blank the version-specific fields for a fresh version.
  formInitial.value = {
    ...artifact,
    version: '',
    uri: '',
    content: null,
    sha256: null,
    metadata: null,
  }
  formLockIdentity.value = true
  formTitle.value = tt('artifacts.dialog.versionTitle')
  formOpen.value = true
}

function openEdit(artifact: ArtifactNode) {
  formInitial.value = artifact
  formLockIdentity.value = true
  formTitle.value = tt('artifacts.dialog.editTitle')
  formOpen.value = true
}

function closeForm() {
  if (saving.value) return
  formOpen.value = false
}

async function submitForm(input: UpsertArtifactInputVars) {
  if (saving.value) return
  saving.value = true
  try {
    await apolloClient.mutate<UpsertPlatformArtifactResult, UpsertPlatformArtifactVars>({
      mutation: UPSERT_PLATFORM_ARTIFACT,
      variables: { input },
    })
    toast.success(tt('artifacts.toast.created'))
    formOpen.value = false
    selectedName.value = input.name
    await refetchList()
    if (versionsEnabled.value) await refetchVersions()
  } catch (error) {
    toast.error(graphqlErrorMessage(error, tt('artifacts.toast.saveFailed')))
  } finally {
    saving.value = false
  }
}

function requestDelete(artifact: ArtifactNode) {
  deleteTarget.value = artifact
  confirmOpen.value = true
}

function closeConfirm() {
  if (deleting.value) return
  confirmOpen.value = false
  deleteTarget.value = null
}

async function confirmDelete() {
  const target = deleteTarget.value
  if (!target || deleting.value) return
  deleting.value = true
  try {
    await apolloClient.mutate<DeletePlatformArtifactResult, DeletePlatformArtifactVars>({
      mutation: DELETE_PLATFORM_ARTIFACT,
      variables: { id: target.id },
    })
    toast.success(tt('artifacts.toast.deleted'))
    confirmOpen.value = false
    deleteTarget.value = null
    await refetchList()
    if (versionsEnabled.value) await refetchVersions()
  } catch (error) {
    toast.error(graphqlErrorMessage(error, tt('artifacts.toast.deleteFailed')))
  } finally {
    deleting.value = false
  }
}

async function refresh() {
  if (listLoading.value) return
  try {
    await refetchList()
    if (versionsEnabled.value) await refetchVersions()
    toast.success(tt('artifacts.toast.refreshed'))
  } catch (error) {
    toast.error(graphqlErrorMessage(error, tt('artifacts.toast.refreshFailed')))
  }
}

const deleteBody = computed(() => {
  const t = deleteTarget.value
  if (!t) return ''
  return fmt(tt('artifacts.confirm.deleteBody'), { name: t.name, version: t.version })
})
</script>

<template>
  <section class="artifact-page">
    <header class="page-head">
      <h1 cds-text="title" class="heading">{{ tt('artifacts.title') }}</h1>
      <p cds-text="body" class="desc muted">{{ tt('artifacts.description') }}</p>
    </header>

    <div class="content-card">
      <div class="toolbar">
        <cds-select control-width="shrink">
          <label>{{ tt('artifacts.filter.kind') }}</label>
          <select
            :value="kindFilter"
            :aria-label="tt('artifacts.filter.kind')"
            @change="onKindChange"
          >
            <option :value="ALL_KINDS">{{ tt('artifacts.filter.allKinds') }}</option>
            <option v-for="k in ARTIFACT_KINDS" :key="k" :value="k">
              {{ tt('artifacts.kind.' + k) }}
            </option>
          </select>
        </cds-select>

        <cds-button action="solid" status="primary" class="create-button" @click="openCreate">
          <cds-icon shape="plus-circle" size="sm" aria-hidden="true"></cds-icon>
          <span>{{ tt('artifacts.action.create') }}</span>
        </cds-button>

        <cds-button
          action="ghost"
          class="refresh-button"
          :disabled="listLoading"
          :aria-label="tt('artifacts.action.refresh')"
          :title="tt('artifacts.action.refresh')"
          @click="refresh"
        >
          <cds-icon shape="refresh" size="md" :class="{ spinning: listLoading }"></cds-icon>
          <span>{{ tt('artifacts.action.refresh') }}</span>
        </cds-button>
      </div>

      <div class="master-detail">
        <!-- Master: artifact list -->
        <aside class="list-panel" :aria-label="tt('artifacts.list.title')">
          <h2 cds-text="subsection" class="panel-title">{{ tt('artifacts.list.title') }}</h2>

          <p v-if="listLoading && artifacts.length === 0" class="panel-state muted">
            {{ tt('artifacts.list.loading') }}
          </p>
          <p v-else-if="listError" class="panel-state error">
            {{ tt('artifacts.list.error') }}
          </p>
          <p v-else-if="artifacts.length === 0" class="panel-state muted">
            {{ tt('artifacts.list.empty') }}
          </p>

          <ul v-else class="artifact-list">
            <li v-for="artifact in artifacts" :key="artifact.name" class="artifact-li">
              <button
                type="button"
                class="artifact-item"
                :class="{ active: artifact.name === selectedName }"
                :aria-pressed="artifact.name === selectedName"
                @click="selectArtifact(artifact.name)"
              >
                <span class="artifact-name" :title="artifact.name">{{ artifact.name }}</span>
                <span class="artifact-meta">
                  <cds-badge status="info" class="kind-badge">
                    {{ tt('artifacts.kind.' + artifact.kind) }}
                  </cds-badge>
                  <small class="artifact-version muted">v{{ artifact.version }}</small>
                </span>
              </button>

              <AppDropdown align="end" class="artifact-actions">
                <template #trigger>
                  <cds-button
                    action="ghost"
                    size="sm"
                    :aria-label="tt('artifacts.row.menu')"
                    :title="tt('artifacts.row.menu')"
                  >
                    <cds-icon shape="ellipsis-vertical" size="sm"></cds-icon>
                  </cds-button>
                </template>
                <template #default="{ close }">
                  <button type="button" class="menu-item" @click="(openNewVersion(artifact), close())">
                    <cds-icon shape="plus-circle" size="sm" aria-hidden="true"></cds-icon>
                    {{ tt('artifacts.row.newVersion') }}
                  </button>
                  <button type="button" class="menu-item" @click="(openEdit(artifact), close())">
                    <cds-icon shape="pencil" size="sm" aria-hidden="true"></cds-icon>
                    {{ tt('artifacts.row.edit') }}
                  </button>
                  <button
                    type="button"
                    class="menu-item danger"
                    @click="(requestDelete(artifact), close())"
                  >
                    <cds-icon shape="trash" size="sm" aria-hidden="true"></cds-icon>
                    {{ tt('artifacts.row.delete') }}
                  </button>
                </template>
              </AppDropdown>
            </li>
          </ul>
        </aside>

        <!-- Detail: selected artifact's versions -->
        <div class="detail-panel">
          <div v-if="!selectedArtifact" class="detail-empty">
            <cds-icon shape="blocks-group" size="xl"></cds-icon>
            <p cds-text="subsection">{{ tt('artifacts.detail.empty') }}</p>
          </div>

          <template v-else>
            <header class="detail-head">
              <h2 cds-text="section" class="detail-title">{{ selectedArtifact.name }}</h2>
              <cds-badge status="info">{{ tt('artifacts.kind.' + selectedArtifact.kind) }}</cds-badge>
            </header>

            <section class="versions-section">
              <h3 cds-text="subsection" class="versions-title">
                {{ tt('artifacts.detail.versions') }}
                <span class="versions-count muted">({{ versions.length }})</span>
              </h3>

              <p v-if="versionsLoading && versions.length === 0" class="panel-state muted">
                {{ tt('artifacts.detail.versionsLoading') }}
              </p>
              <p v-else-if="versionsError" class="panel-state error">
                {{ tt('artifacts.detail.versionsError') }}
              </p>
              <p v-else-if="versions.length === 0" class="panel-state muted">
                {{ tt('artifacts.detail.versionsEmpty') }}
              </p>

              <div v-else class="versions-table-wrap">
                <table class="versions-table">
                  <thead>
                    <tr>
                      <th scope="col">{{ tt('artifacts.detail.version') }}</th>
                      <th scope="col">{{ tt('artifacts.detail.uri') }}</th>
                      <th scope="col">{{ tt('artifacts.detail.sha256') }}</th>
                      <th scope="col">{{ tt('artifacts.detail.createdAt') }}</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="ver in versions" :key="ver.id">
                      <td class="cell-version">v{{ ver.version }}</td>
                      <td class="cell-uri" :title="ver.uri">{{ ver.uri }}</td>
                      <td class="cell-sha" :title="ver.sha256 ?? ''">
                        {{ ver.sha256 || tt('artifacts.detail.none') }}
                      </td>
                      <td class="cell-created">{{ ver.createdAt }}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>
          </template>
        </div>
      </div>
    </div>

    <ArtifactFormDialog
      :open="formOpen"
      :initial="formInitial"
      :lock-identity="formLockIdentity"
      :saving="saving"
      :title="formTitle"
      :tt="tt"
      @close="closeForm"
      @submit="submitForm"
    />

    <ConfirmDialog
      :open="confirmOpen"
      :title="tt('artifacts.confirm.deleteTitle')"
      :body="deleteBody"
      danger
      @confirm="confirmDelete"
      @close="closeConfirm"
    />
  </section>
</template>

<style scoped>
.artifact-page {
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
  grid-template-columns: minmax(240px, 320px) 1fr;
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
.artifact-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.artifact-li {
  display: flex;
  align-items: center;
  gap: 4px;
}
.artifact-item {
  flex: 1 1 auto;
  min-width: 0;
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
.artifact-item:hover {
  background: var(--cds-alias-object-app-background, #f4f4f4);
}
.artifact-item.active {
  border-color: var(--cds-alias-object-interaction-color, #0072a3);
  background: color-mix(in srgb, var(--cds-alias-object-interaction-color, #0072a3) 8%, transparent);
}
.artifact-name {
  font-weight: 600;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.artifact-meta {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}
.kind-badge {
  font-size: 11px;
}
.artifact-version {
  font-size: 12px;
}
.artifact-actions {
  flex: 0 0 auto;
}
.menu-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 8px 14px;
  border: 0;
  background: transparent;
  color: var(--cds-alias-object-app-foreground, #1b1b1b);
  font: inherit;
  font-size: 13px;
  text-align: left;
  cursor: pointer;
}
.menu-item:hover {
  background: var(--cds-alias-object-app-background, #f4f4f4);
}
.menu-item.danger {
  color: var(--cds-alias-status-danger, #c92100);
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
.versions-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.versions-title {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
}
.versions-count {
  font-weight: 400;
}
.versions-table-wrap {
  overflow: auto;
  border: 1px solid var(--cds-alias-object-border-color, #e8e8e8);
  border-radius: 6px;
}
.versions-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}
.versions-table th,
.versions-table td {
  padding: 9px 12px;
  text-align: left;
  border-bottom: 1px solid var(--cds-alias-object-border-color, #e8e8e8);
  vertical-align: top;
}
.versions-table th {
  font-size: 12px;
  font-weight: 600;
  color: var(--cds-alias-typography-color-300, #565656);
  background: var(--cds-alias-object-app-background, #fafafa);
  position: sticky;
  top: 0;
}
.versions-table tbody tr:last-child td {
  border-bottom: 0;
}
.cell-version {
  font-weight: 600;
  white-space: nowrap;
}
.cell-uri,
.cell-sha {
  max-width: 280px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: var(--cds-global-typography-font-family-monospace, monospace);
  font-size: 12px;
}
.cell-created {
  white-space: nowrap;
}
.muted {
  color: var(--cds-alias-typography-color-300, #565656);
}
.spinning {
  animation: artifact-spin 1s linear infinite;
  transform-origin: center;
}
@keyframes artifact-spin {
  to {
    transform: rotate(360deg);
  }
}
@media (max-width: 860px) {
  .master-detail {
    grid-template-columns: 1fr;
  }
  .refresh-button span,
  .create-button span {
    display: none;
  }
}
@media (prefers-reduced-motion: reduce) {
  .spinning {
    animation: none;
  }
}
</style>
