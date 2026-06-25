<script setup lang="ts">
/**
 * 自定义角色与权限 (Custom Roles & Permissions) — backend schema/rbac.graphql.
 *
 * Platform-level admin page for fine-grained custom roles, distinct from the
 * platform `Role` enum on User.role and from the colleague's UserRoleView /
 * user-role/RolesTab (which manage user↔role assignment). This page is the
 * authoritative editor for the roles themselves and the permission matrix.
 *
 * Master-detail:
 *   - left: custom roles (createCustomRole + deleteCustomRole; system roles are
 *     read-only and cannot be deleted)
 *   - right: a permission matrix for the selected role — every catalog
 *     `Permission` is a checkbox row; ticking marks the role as holding that
 *     key. Save calls setRolePermissions(roleId, permissionKeys) which replaces
 *     the role's whole permission set, then refetches.
 *   - an "add permission" affordance defines a new permission via
 *     upsertPermission (admin-only).
 *
 * Graceful degradation: `permissions` and `upsertPermission` are admin-only
 * (@hasRole(any:[admin])). A tenant_admin can still manage roles + the matrix,
 * so when the catalog query errors we fall back to the union of keys already
 * held across roles and hide the admin-only "add permission" control.
 */
import { computed, ref, watch } from 'vue'
import { useQuery } from '@vue/apollo-composable'
import { apolloClient } from '@/api/graphql/client'
import { useLocaleStore } from '@/stores/locale'
import { useToast } from '@/composables/useToast'
import { graphqlErrorMessage } from '@/api/graphql/errors'
import CustomRoleDialogs from '@/views/custom-role/CustomRoleDialogs.vue'
import {
  CUSTOM_ROLES_QUERY,
  PERMISSIONS_QUERY,
  CREATE_CUSTOM_ROLE,
  DELETE_CUSTOM_ROLE,
  SET_ROLE_PERMISSIONS,
  UPSERT_PERMISSION,
  type CustomRoleNode,
  type CustomRolesResult,
  type PermissionNode,
  type PermissionsResult,
  type CreateCustomRoleResult,
  type CreateCustomRoleVars,
  type DeleteCustomRoleResult,
  type DeleteCustomRoleVars,
  type SetRolePermissionsResult,
  type SetRolePermissionsVars,
  type UpsertPermissionResult,
  type UpsertPermissionVars,
} from '@/api/graphql/queries/custom-roles'
import '@/components/icons'

const locale = useLocaleStore()
const toast = useToast()

// Self-contained i18n. The shared locale store does not carry customRole.* and
// is off-limits for this change; `locale.t` echoes the raw key when missing, so
// this view resolves customRole.* itself and defers to the store for the rest.
// See the report for the canonical zh/en list to fold into the store later.
const FALLBACK: Record<string, { zh: string; en: string }> = {
  'customRole.title': { zh: '自定义角色与权限', en: 'Custom Roles & Permissions' },
  'customRole.description': {
    zh: '管理细粒度的自定义角色及其权限矩阵。系统内置角色只读；自定义角色可创建、删除并按权限键勾选授权。',
    en: 'Manage fine-grained custom roles and their permission matrix. Built-in system roles are read-only; custom roles can be created, deleted, and granted permissions by key.',
  },
  'customRole.action.refresh': { zh: '刷新', en: 'Refresh' },
  'customRole.action.create': { zh: '创建角色', en: 'Create Role' },
  'customRole.action.cancel': { zh: '取消', en: 'Cancel' },
  'customRole.action.delete': { zh: '删除', en: 'Delete' },
  'customRole.action.save': { zh: '保存', en: 'Save' },
  'customRole.list.title': { zh: '角色列表', en: 'Roles' },
  'customRole.list.loading': { zh: '加载中…', en: 'Loading…' },
  'customRole.list.empty': { zh: '暂无自定义角色', en: 'No custom roles' },
  'customRole.list.error': { zh: '角色加载失败', en: 'Failed to load roles' },
  'customRole.badge.system': { zh: '系统', en: 'System' },
  'customRole.detail.empty': { zh: '请选择左侧的一个角色以编辑权限', en: 'Select a role to edit its permissions' },
  'customRole.detail.createdAt': { zh: '创建时间', en: 'Created At' },
  'customRole.detail.permissionCount': { zh: '已授权 {count} 项权限', en: '{count} permission(s) granted' },
  'customRole.matrix.title': { zh: '权限矩阵', en: 'Permission Matrix' },
  'customRole.matrix.loading': { zh: '正在加载权限…', en: 'Loading permissions…' },
  'customRole.matrix.empty': { zh: '暂无可分配的权限', en: 'No permissions available' },
  'customRole.matrix.searchPlaceholder': { zh: '搜索权限键', en: 'Search permission keys' },
  'customRole.matrix.systemReadonly': { zh: '系统内置角色为只读，无法修改其权限。', en: 'Built-in system roles are read-only; their permissions cannot be changed.' },
  'customRole.matrix.catalogUnavailable': {
    zh: '无法读取完整权限目录（需管理员权限），仅显示各角色已使用的权限键。',
    en: 'Full permission catalog unavailable (admin only); showing only keys already used by roles.',
  },
  'customRole.permission.add': { zh: '新增权限', en: 'Add Permission' },
  'customRole.permission.addTitle': { zh: '定义权限', en: 'Define Permission' },
  'customRole.permission.keyLabel': { zh: '权限键', en: 'Permission Key' },
  'customRole.permission.keyPlaceholder': { zh: '例如 agent:deploy', en: 'e.g. agent:deploy' },
  'customRole.permission.descLabel': { zh: '描述（可选）', en: 'Description (optional)' },
  'customRole.permission.descPlaceholder': { zh: '简要说明该权限的用途', en: 'Briefly describe what it grants' },
  'customRole.create.title': { zh: '创建自定义角色', en: 'Create Custom Role' },
  'customRole.create.nameLabel': { zh: '角色名称', en: 'Role Name' },
  'customRole.create.namePlaceholder': { zh: '输入角色名称', en: 'Enter a role name' },
  'customRole.delete.title': { zh: '删除角色', en: 'Delete Role' },
  'customRole.delete.message': { zh: '确定要删除角色「{name}」吗？此操作不可撤销。', en: 'Delete the role “{name}”? This cannot be undone.' },
  'customRole.toast.created': { zh: '已创建角色', en: 'Role created' },
  'customRole.toast.createFailed': { zh: '创建角色失败', en: 'Failed to create role' },
  'customRole.toast.deleted': { zh: '已删除角色', en: 'Role deleted' },
  'customRole.toast.deleteFailed': { zh: '删除角色失败', en: 'Failed to delete role' },
  'customRole.toast.saved': { zh: '权限已保存', en: 'Permissions saved' },
  'customRole.toast.saveFailed': { zh: '保存权限失败', en: 'Failed to save permissions' },
  'customRole.toast.permissionAdded': { zh: '已定义权限', en: 'Permission defined' },
  'customRole.toast.permissionFailed': { zh: '定义权限失败', en: 'Failed to define permission' },
  'customRole.toast.refreshed': { zh: '已刷新', en: 'Refreshed' },
  'customRole.toast.refreshFailed': { zh: '刷新失败', en: 'Failed to refresh' },
}

// Resolve customRole.* from the local fallback, else defer to the store.
function tt(key: string): string {
  const entry = FALLBACK[key]
  if (entry) return entry[locale.locale]
  return locale.t(key)
}

function format(key: string, vars: Record<string, string>): string {
  return Object.entries(vars).reduce(
    (text, [name, value]) => text.replace(`{${name}}`, value),
    tt(key),
  )
}

const selectedRoleId = ref<string | null>(null)
const dialogMode = ref<'createRole' | 'addPermission' | null>(null)
const dialogBusy = ref(false)
const pendingDeleteId = ref<string | null>(null)
const deleting = ref(false)
const saving = ref(false)
const matrixSearch = ref('')

// `pendingKeys` is the in-progress edit of the selected role's permission set.
// It diverges from the role's saved `permissions` as the admin ticks boxes; a
// non-null value means "dirty". null = synced with the backend.
const pendingKeys = ref<Set<string> | null>(null)

const {
  result: rolesResult,
  loading: rolesLoading,
  error: rolesError,
  refetch: refetchRoles,
} = useQuery<CustomRolesResult>(CUSTOM_ROLES_QUERY)

// The permission catalog is admin-only; let it fail softly (errorPolicy=all so
// the rest of the page keeps working for tenant_admins who can't read it).
const {
  result: permsResult,
  loading: permsLoading,
  error: permsError,
} = useQuery<PermissionsResult>(PERMISSIONS_QUERY, undefined, { errorPolicy: 'all' })

const roles = computed<CustomRoleNode[]>(() => rolesResult.value?.customRoles ?? [])
const catalog = computed<PermissionNode[]>(() => permsResult.value?.permissions ?? [])
const catalogAvailable = computed(() => !permsError.value && catalog.value.length > 0)

const selectedRole = computed<CustomRoleNode | null>(
  () => roles.value.find((role) => role.id === selectedRoleId.value) ?? null,
)

// Keep a valid selection: default to the first role, clear if it vanished.
watch(
  roles,
  (list) => {
    if (list.length === 0) {
      selectedRoleId.value = null
      return
    }
    if (!list.some((role) => role.id === selectedRoleId.value)) {
      selectedRoleId.value = list[0].id
    }
  },
  { immediate: true },
)

// Reset the dirty edit buffer whenever the selected role (or its saved set)
// changes, so the matrix always starts from the backend truth.
watch(
  () => selectedRole.value,
  () => {
    pendingKeys.value = null
  },
)

// The set of keys to render as matrix rows: the catalog when readable, else the
// union of keys already held across every role (so tenant_admins still get a
// usable matrix even without the catalog).
const matrixKeys = computed<{ key: string; description: string | null }[]>(() => {
  if (catalogAvailable.value) {
    return catalog.value.map((perm) => ({ key: perm.key, description: perm.description }))
  }
  const union = new Set<string>()
  for (const role of roles.value) for (const key of role.permissions) union.add(key)
  return [...union].sort((a, b) => a.localeCompare(b)).map((key) => ({ key, description: null }))
})

const filteredMatrixKeys = computed(() => {
  const term = matrixSearch.value.trim().toLowerCase()
  if (!term) return matrixKeys.value
  return matrixKeys.value.filter(
    (row) =>
      row.key.toLowerCase().includes(term) ||
      (row.description?.toLowerCase().includes(term) ?? false),
  )
})

// Effective held-key set for the selected role: the dirty buffer if editing,
// else the role's saved permissions.
const heldKeys = computed<Set<string>>(() => {
  if (pendingKeys.value) return pendingKeys.value
  return new Set(selectedRole.value?.permissions ?? [])
})

const isSystemRole = computed(() => selectedRole.value?.isSystem ?? false)
const matrixEditable = computed(() => !!selectedRole.value && !isSystemRole.value)

// Dirty = the pending buffer differs from the saved set (order-insensitive).
const isDirty = computed(() => {
  if (!pendingKeys.value || !selectedRole.value) return false
  const saved = selectedRole.value.permissions
  if (saved.length !== pendingKeys.value.size) return true
  return saved.some((key) => !pendingKeys.value!.has(key))
})

const grantedCount = computed(() => heldKeys.value.size)
const canDefinePermission = computed(() => catalogAvailable.value || !permsError.value)

function selectRole(id: string) {
  selectedRoleId.value = id
}

// Toggle a key in the dirty buffer, lazily forking it from the saved set.
function toggleKey(key: string) {
  if (!matrixEditable.value || saving.value) return
  const next = new Set(pendingKeys.value ?? selectedRole.value?.permissions ?? [])
  if (next.has(key)) next.delete(key)
  else next.add(key)
  pendingKeys.value = next
}

function resetEdits() {
  pendingKeys.value = null
}

function openCreate() {
  dialogMode.value = 'createRole'
}

function openAddPermission() {
  dialogMode.value = 'addPermission'
}

function closeDialog() {
  if (!dialogBusy.value) dialogMode.value = null
}

function requestDelete(id: string) {
  pendingDeleteId.value = id
}

function cancelDelete() {
  if (!deleting.value) pendingDeleteId.value = null
}

const pendingDeleteRole = computed<CustomRoleNode | null>(
  () => roles.value.find((role) => role.id === pendingDeleteId.value) ?? null,
)

async function createRole(name: string) {
  if (dialogBusy.value) return
  dialogBusy.value = true
  try {
    await apolloClient.mutate<CreateCustomRoleResult, CreateCustomRoleVars>({
      mutation: CREATE_CUSTOM_ROLE,
      variables: { input: { name } },
    })
    toast.success(tt('customRole.toast.created'))
    dialogMode.value = null
    await refetchRoles()
  } catch (error) {
    toast.error(graphqlErrorMessage(error, tt('customRole.toast.createFailed')))
  } finally {
    dialogBusy.value = false
  }
}

async function addPermission(payload: { key: string; description: string }) {
  if (dialogBusy.value) return
  dialogBusy.value = true
  try {
    await apolloClient.mutate<UpsertPermissionResult, UpsertPermissionVars>({
      mutation: UPSERT_PERMISSION,
      variables: { key: payload.key, description: payload.description || null },
      refetchQueries: [{ query: PERMISSIONS_QUERY }],
    })
    toast.success(tt('customRole.toast.permissionAdded'))
    dialogMode.value = null
  } catch (error) {
    toast.error(graphqlErrorMessage(error, tt('customRole.toast.permissionFailed')))
  } finally {
    dialogBusy.value = false
  }
}

async function confirmDelete() {
  const role = pendingDeleteRole.value
  if (!role || deleting.value) return
  deleting.value = true
  try {
    await apolloClient.mutate<DeleteCustomRoleResult, DeleteCustomRoleVars>({
      mutation: DELETE_CUSTOM_ROLE,
      variables: { id: role.id },
    })
    toast.success(tt('customRole.toast.deleted'))
    pendingDeleteId.value = null
    if (selectedRoleId.value === role.id) selectedRoleId.value = null
    await refetchRoles()
  } catch (error) {
    toast.error(graphqlErrorMessage(error, tt('customRole.toast.deleteFailed')))
  } finally {
    deleting.value = false
  }
}

async function savePermissions() {
  const role = selectedRole.value
  if (!role || !pendingKeys.value || saving.value) return
  saving.value = true
  try {
    await apolloClient.mutate<SetRolePermissionsResult, SetRolePermissionsVars>({
      mutation: SET_ROLE_PERMISSIONS,
      variables: { roleId: role.id, permissionKeys: [...pendingKeys.value] },
    })
    toast.success(tt('customRole.toast.saved'))
    pendingKeys.value = null
    await refetchRoles()
  } catch (error) {
    toast.error(graphqlErrorMessage(error, tt('customRole.toast.saveFailed')))
  } finally {
    saving.value = false
  }
}

async function refresh() {
  if (rolesLoading.value) return
  try {
    await refetchRoles()
    toast.success(tt('customRole.toast.refreshed'))
  } catch (error) {
    toast.error(graphqlErrorMessage(error, tt('customRole.toast.refreshFailed')))
  }
}
</script>

<template>
  <section class="custom-role-page">
    <header class="page-head">
      <h1 cds-text="title" class="heading">{{ tt('customRole.title') }}</h1>
      <p cds-text="body" class="desc muted">{{ tt('customRole.description') }}</p>
    </header>

    <div class="content-card">
      <div class="toolbar">
        <cds-button action="outline" status="primary" @click="openCreate">
          <cds-icon shape="plus-circle" size="sm" aria-hidden="true"></cds-icon>
          {{ tt('customRole.action.create') }}
        </cds-button>

        <cds-button
          action="ghost"
          class="refresh-button"
          :disabled="rolesLoading"
          :aria-label="tt('customRole.action.refresh')"
          :title="tt('customRole.action.refresh')"
          @click="refresh"
        >
          <cds-icon shape="refresh" size="md" :class="{ spinning: rolesLoading }"></cds-icon>
          <span>{{ tt('customRole.action.refresh') }}</span>
        </cds-button>
      </div>

      <div class="master-detail">
        <!-- Master: roles list -->
        <aside class="list-panel" :aria-label="tt('customRole.list.title')">
          <h2 cds-text="subsection" class="panel-title">{{ tt('customRole.list.title') }}</h2>

          <p v-if="rolesLoading && roles.length === 0" class="panel-state muted">
            {{ tt('customRole.list.loading') }}
          </p>
          <p v-else-if="rolesError" class="panel-state error">
            {{ tt('customRole.list.error') }}
          </p>
          <p v-else-if="roles.length === 0" class="panel-state muted">
            {{ tt('customRole.list.empty') }}
          </p>

          <ul v-else class="role-list">
            <li v-for="role in roles" :key="role.id" class="role-li">
              <button
                type="button"
                class="role-item"
                :class="{ active: role.id === selectedRoleId }"
                :aria-pressed="role.id === selectedRoleId"
                @click="selectRole(role.id)"
              >
                <span class="role-name" :title="role.name">{{ role.name }}</span>
                <span class="role-meta">
                  <cds-badge v-if="role.isSystem" status="info" class="system-badge">
                    {{ tt('customRole.badge.system') }}
                  </cds-badge>
                  <span class="role-count muted">{{ role.permissions.length }}</span>
                </span>
              </button>
              <cds-button
                v-if="!role.isSystem"
                action="ghost"
                size="sm"
                class="role-delete"
                :aria-label="tt('customRole.action.delete')"
                :title="tt('customRole.action.delete')"
                @click="requestDelete(role.id)"
              >
                <cds-icon shape="trash" size="sm" aria-hidden="true"></cds-icon>
              </cds-button>
            </li>
          </ul>
        </aside>

        <!-- Detail: permission matrix -->
        <div class="detail-panel">
          <div v-if="!selectedRole" class="detail-empty">
            <cds-icon shape="shield-check" size="xl"></cds-icon>
            <p cds-text="subsection">{{ tt('customRole.detail.empty') }}</p>
          </div>

          <template v-else>
            <header class="detail-head">
              <h2 cds-text="section" class="detail-title">{{ selectedRole.name }}</h2>
              <cds-badge v-if="selectedRole.isSystem" status="info">
                {{ tt('customRole.badge.system') }}
              </cds-badge>
            </header>

            <p class="detail-sub muted">
              {{ format('customRole.detail.permissionCount', { count: String(grantedCount) }) }}
              · {{ tt('customRole.detail.createdAt') }}: {{ selectedRole.createdAt }}
            </p>

            <cds-alert v-if="isSystemRole" status="info" class="matrix-alert">
              {{ tt('customRole.matrix.systemReadonly') }}
            </cds-alert>
            <cds-alert v-else-if="permsError" status="warning" class="matrix-alert">
              {{ tt('customRole.matrix.catalogUnavailable') }}
            </cds-alert>

            <section class="matrix-section">
              <div class="matrix-head">
                <h3 cds-text="subsection" class="matrix-title">{{ tt('customRole.matrix.title') }}</h3>
                <div class="matrix-actions">
                  <cds-button
                    v-if="canDefinePermission"
                    action="outline"
                    size="sm"
                    @click="openAddPermission"
                  >
                    <cds-icon shape="plus-circle" size="sm" aria-hidden="true"></cds-icon>
                    {{ tt('customRole.permission.add') }}
                  </cds-button>
                </div>
              </div>

              <cds-input control-width="shrink" class="matrix-search">
                <input
                  v-model="matrixSearch"
                  type="search"
                  autocomplete="off"
                  :placeholder="tt('customRole.matrix.searchPlaceholder')"
                  :aria-label="tt('customRole.matrix.searchPlaceholder')"
                />
              </cds-input>

              <p v-if="permsLoading && matrixKeys.length === 0" class="panel-state muted">
                {{ tt('customRole.matrix.loading') }}
              </p>
              <p v-else-if="filteredMatrixKeys.length === 0" class="panel-state muted">
                {{ tt('customRole.matrix.empty') }}
              </p>

              <ul v-else class="matrix-list">
                <li v-for="row in filteredMatrixKeys" :key="row.key">
                  <label class="matrix-row" :class="{ disabled: !matrixEditable }">
                    <input
                      type="checkbox"
                      class="app-checkbox"
                      :checked="heldKeys.has(row.key)"
                      :disabled="!matrixEditable || saving"
                      :aria-label="row.key"
                      @change="toggleKey(row.key)"
                    />
                    <span class="matrix-key" :title="row.key">{{ row.key }}</span>
                    <small v-if="row.description" class="matrix-desc muted" :title="row.description">
                      {{ row.description }}
                    </small>
                  </label>
                </li>
              </ul>

              <div v-if="matrixEditable" class="matrix-footer">
                <cds-button action="outline" :disabled="!isDirty || saving" @click="resetEdits">
                  {{ tt('customRole.action.cancel') }}
                </cds-button>
                <cds-button
                  status="primary"
                  :loading-state="saving ? 'loading' : 'default'"
                  :disabled="!isDirty || saving"
                  @click="savePermissions"
                >
                  {{ tt('customRole.action.save') }}
                </cds-button>
              </div>
            </section>
          </template>
        </div>
      </div>
    </div>

    <!-- Create role / add permission dialogs -->
    <CustomRoleDialogs
      :mode="dialogMode"
      :busy="dialogBusy"
      :can-define-permission="canDefinePermission"
      :tt="tt"
      @close="closeDialog"
      @create-role="createRole"
      @add-permission="addPermission"
    />

    <!-- Delete confirmation -->
    <cds-modal
      :hidden="!pendingDeleteRole"
      :closable="!deleting"
      size="sm"
      @closeChange="cancelDelete"
    >
      <cds-modal-header>
        <h2 cds-text="title" class="modal-title">{{ tt('customRole.delete.title') }}</h2>
      </cds-modal-header>
      <cds-modal-content>
        <cds-alert status="danger">
          {{ format('customRole.delete.message', { name: pendingDeleteRole?.name ?? '' }) }}
        </cds-alert>
      </cds-modal-content>
      <cds-modal-actions>
        <cds-button action="outline" :disabled="deleting" @click="cancelDelete">
          {{ tt('customRole.action.cancel') }}
        </cds-button>
        <cds-button
          status="danger"
          :loading-state="deleting ? 'loading' : 'default'"
          :disabled="deleting"
          @click="confirmDelete"
        >
          {{ tt('customRole.action.delete') }}
        </cds-button>
      </cds-modal-actions>
    </cds-modal>
  </section>
</template>

<style scoped>
.custom-role-page {
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
.master-detail {
  flex: 1 1 auto;
  min-height: 0;
  min-width: 0;
  display: grid;
  grid-template-columns: minmax(220px, 320px) 1fr;
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
.role-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.role-li {
  display: flex;
  align-items: center;
  gap: 4px;
}
.role-item {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 10px 12px;
  border: 1px solid transparent;
  border-radius: 4px;
  background: transparent;
  color: var(--cds-alias-object-app-foreground, #1b1b1b);
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.role-item:hover {
  background: var(--cds-alias-object-app-background, #f4f4f4);
}
.role-item.active {
  border-color: var(--cds-alias-object-interaction-color, #0072a3);
  background: color-mix(in srgb, var(--cds-alias-object-interaction-color, #0072a3) 8%, transparent);
}
.role-name {
  font-weight: 600;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.role-meta {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  flex: 0 0 auto;
}
.system-badge {
  font-size: 11px;
}
.role-count {
  font-size: 12px;
  min-width: 16px;
  text-align: right;
}
.role-delete {
  flex: 0 0 auto;
}
.detail-panel {
  display: flex;
  flex-direction: column;
  min-height: 0;
  gap: 12px;
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
.detail-sub {
  margin: 0;
  font-size: 13px;
}
.matrix-alert {
  margin: 0;
}
.matrix-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-top: 8px;
  border-top: 1px solid var(--cds-alias-object-border-color, #e8e8e8);
  min-height: 0;
}
.matrix-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.matrix-title {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
}
.matrix-actions {
  display: inline-flex;
  gap: 8px;
}
.matrix-search {
  max-width: 320px;
}
.matrix-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.matrix-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border: 1px solid var(--cds-alias-object-border-color, #e8e8e8);
  border-radius: 4px;
  cursor: pointer;
}
.matrix-row.disabled {
  cursor: default;
  opacity: 0.75;
}
.matrix-key {
  flex: 0 0 auto;
  font-family: var(--cds-global-typography-monospace-font-family, monospace);
  font-size: 13px;
  font-weight: 600;
}
.matrix-desc {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
}
.matrix-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding-top: 8px;
}
/* Native checkbox (cds-checkbox's reactive :checked fights Vue's render;
   see AgentListView). accent-color matches the design-system info color. */
.app-checkbox {
  width: 16px;
  height: 16px;
  margin: 0;
  flex: 0 0 auto;
  cursor: pointer;
  accent-color: var(--cds-alias-status-info, #0079ad);
}
.app-checkbox:focus-visible {
  outline: 2px solid var(--cds-alias-status-info, #0079ad);
  outline-offset: 2px;
}
.app-checkbox:disabled {
  cursor: default;
}
.modal-title {
  margin: 0;
}
.muted {
  color: var(--cds-alias-typography-color-300, #565656);
}
.spinning {
  animation: custom-role-spin 1s linear infinite;
  transform-origin: center;
}
@keyframes custom-role-spin {
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
