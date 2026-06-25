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

function format(key: string, vars: Record<string, string>): string {
  return Object.entries(vars).reduce(
    (text, [name, value]) => text.replace(`{${name}}`, value),
    locale.t(key),
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
    toast.success(locale.t('customRole.toast.created'))
    dialogMode.value = null
    await refetchRoles()
  } catch (error) {
    toast.error(graphqlErrorMessage(error, locale.t('customRole.toast.createFailed')))
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
    toast.success(locale.t('customRole.toast.permissionAdded'))
    dialogMode.value = null
  } catch (error) {
    toast.error(graphqlErrorMessage(error, locale.t('customRole.toast.permissionFailed')))
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
    toast.success(locale.t('customRole.toast.deleted'))
    pendingDeleteId.value = null
    if (selectedRoleId.value === role.id) selectedRoleId.value = null
    await refetchRoles()
  } catch (error) {
    toast.error(graphqlErrorMessage(error, locale.t('customRole.toast.deleteFailed')))
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
    toast.success(locale.t('customRole.toast.saved'))
    pendingKeys.value = null
    await refetchRoles()
  } catch (error) {
    toast.error(graphqlErrorMessage(error, locale.t('customRole.toast.saveFailed')))
  } finally {
    saving.value = false
  }
}

async function refresh() {
  if (rolesLoading.value) return
  try {
    await refetchRoles()
    toast.success(locale.t('customRole.toast.refreshed'))
  } catch (error) {
    toast.error(graphqlErrorMessage(error, locale.t('customRole.toast.refreshFailed')))
  }
}
</script>

<template>
  <section class="custom-role-page">
    <header class="page-head">
      <h1 cds-text="title" class="heading">{{ locale.t('customRole.title') }}</h1>
      <p cds-text="body" class="desc muted">{{ locale.t('customRole.description') }}</p>
    </header>

    <div class="content-card">
      <div class="toolbar">
        <cds-button action="outline" status="primary" @click="openCreate">
          <cds-icon shape="plus-circle" size="sm" aria-hidden="true"></cds-icon>
          {{ locale.t('customRole.action.create') }}
        </cds-button>

        <cds-button
          action="ghost"
          class="refresh-button"
          :disabled="rolesLoading"
          :aria-label="locale.t('customRole.action.refresh')"
          :title="locale.t('customRole.action.refresh')"
          @click="refresh"
        >
          <cds-icon shape="refresh" size="md" :class="{ spinning: rolesLoading }"></cds-icon>
          <span>{{ locale.t('customRole.action.refresh') }}</span>
        </cds-button>
      </div>

      <div class="master-detail">
        <!-- Master: roles list -->
        <aside class="list-panel" :aria-label="locale.t('customRole.list.title')">
          <h2 cds-text="subsection" class="panel-title">{{ locale.t('customRole.list.title') }}</h2>

          <p v-if="rolesLoading && roles.length === 0" class="panel-state muted">
            {{ locale.t('customRole.list.loading') }}
          </p>
          <p v-else-if="rolesError" class="panel-state error">
            {{ locale.t('customRole.list.error') }}
          </p>
          <p v-else-if="roles.length === 0" class="panel-state muted">
            {{ locale.t('customRole.list.empty') }}
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
                    {{ locale.t('customRole.badge.system') }}
                  </cds-badge>
                  <span class="role-count muted">{{ role.permissions.length }}</span>
                </span>
              </button>
              <cds-button
                v-if="!role.isSystem"
                action="ghost"
                size="sm"
                class="role-delete"
                :aria-label="locale.t('customRole.action.delete')"
                :title="locale.t('customRole.action.delete')"
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
            <p cds-text="subsection">{{ locale.t('customRole.detail.empty') }}</p>
          </div>

          <template v-else>
            <header class="detail-head">
              <h2 cds-text="section" class="detail-title">{{ selectedRole.name }}</h2>
              <cds-badge v-if="selectedRole.isSystem" status="info">
                {{ locale.t('customRole.badge.system') }}
              </cds-badge>
            </header>

            <p class="detail-sub muted">
              {{ format('customRole.detail.permissionCount', { count: String(grantedCount) }) }}
              · {{ locale.t('customRole.detail.createdAt') }}: {{ selectedRole.createdAt }}
            </p>

            <cds-alert v-if="isSystemRole" status="info" class="matrix-alert">
              {{ locale.t('customRole.matrix.systemReadonly') }}
            </cds-alert>
            <cds-alert v-else-if="permsError" status="warning" class="matrix-alert">
              {{ locale.t('customRole.matrix.catalogUnavailable') }}
            </cds-alert>

            <section class="matrix-section">
              <div class="matrix-head">
                <h3 cds-text="subsection" class="matrix-title">{{ locale.t('customRole.matrix.title') }}</h3>
                <div class="matrix-actions">
                  <cds-button
                    v-if="canDefinePermission"
                    action="outline"
                    size="sm"
                    @click="openAddPermission"
                  >
                    <cds-icon shape="plus-circle" size="sm" aria-hidden="true"></cds-icon>
                    {{ locale.t('customRole.permission.add') }}
                  </cds-button>
                </div>
              </div>

              <cds-input control-width="shrink" class="matrix-search">
                <input
                  v-model="matrixSearch"
                  type="search"
                  autocomplete="off"
                  :placeholder="locale.t('customRole.matrix.searchPlaceholder')"
                  :aria-label="locale.t('customRole.matrix.searchPlaceholder')"
                />
              </cds-input>

              <p v-if="permsLoading && matrixKeys.length === 0" class="panel-state muted">
                {{ locale.t('customRole.matrix.loading') }}
              </p>
              <p v-else-if="filteredMatrixKeys.length === 0" class="panel-state muted">
                {{ locale.t('customRole.matrix.empty') }}
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
                  {{ locale.t('customRole.action.cancel') }}
                </cds-button>
                <cds-button
                  status="primary"
                  :loading-state="saving ? 'loading' : 'default'"
                  :disabled="!isDirty || saving"
                  @click="savePermissions"
                >
                  {{ locale.t('customRole.action.save') }}
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
        <h2 cds-text="title" class="modal-title">{{ locale.t('customRole.delete.title') }}</h2>
      </cds-modal-header>
      <cds-modal-content>
        <cds-alert status="danger">
          {{ format('customRole.delete.message', { name: pendingDeleteRole?.name ?? '' }) }}
        </cds-alert>
      </cds-modal-content>
      <cds-modal-actions>
        <cds-button action="outline" :disabled="deleting" @click="cancelDelete">
          {{ locale.t('customRole.action.cancel') }}
        </cds-button>
        <cds-button
          status="danger"
          :loading-state="deleting ? 'loading' : 'default'"
          :disabled="deleting"
          @click="confirmDelete"
        >
          {{ locale.t('customRole.action.delete') }}
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
