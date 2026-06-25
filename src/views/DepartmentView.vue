<script setup lang="ts">
/**
 * 部门与成员管理 (Departments & Memberships) — backend schema/department.graphql
 * (doc43 / LLD-01). A `Department` maps to a litellm team.
 *
 * Master-detail page wired to the real backend:
 *   - left (master): departments list (`departments`) with create
 *     (`createDepartment`) and delete (`deleteDepartment`, confirm).
 *   - right (detail): the selected department's members
 *     (`departmentMembers(departmentId)`), each row joined client-side against
 *     the `users` query for a display name, with add-member (`addMembership`,
 *     user picker fed by the USERS query) and remove-member
 *     (`removeMembership`, confirm).
 *
 * Mutations createDepartment / deleteDepartment are gated
 * `@hasRole(any: [admin, tenant_admin])`; membership ops are delegated
 * (platform/tenant admins OR the department's dept-admin, checked in-resolver).
 * Non-privileged callers get the backend error surfaced via toast.
 *
 * i18n is self-contained (FALLBACK + tt) — the shared locale store is off-limits
 * for this change. See report for the canonical zh/en list to fold in later.
 */
import { computed, reactive, ref, watch } from 'vue'
import { useQuery } from '@vue/apollo-composable'
import { apolloClient } from '@/api/graphql/client'
import { useLocaleStore } from '@/stores/locale'
import { useToast } from '@/composables/useToast'
import { graphqlErrorMessage } from '@/api/graphql/errors'
import AppDropdown from '@/components/AppDropdown.vue'
import ConfirmDialog from '@/views/user-role/ConfirmDialog.vue'
import { USERS_QUERY } from '@/api/graphql/queries/users'
import type { AccountUser } from '@/api/graphql/types'
import {
  DEPARTMENTS_QUERY,
  DEPARTMENT_MEMBERS_QUERY,
  CREATE_DEPARTMENT_MUTATION,
  DELETE_DEPARTMENT_MUTATION,
  ADD_MEMBERSHIP_MUTATION,
  REMOVE_MEMBERSHIP_MUTATION,
  type DepartmentNode,
  type DepartmentsResult,
  type DepartmentMembersResult,
  type DepartmentMembersVars,
  type MembershipNode,
  type MembershipRole,
  type CreateDepartmentResult,
  type CreateDepartmentVars,
  type DeleteDepartmentResult,
  type DeleteDepartmentVars,
  type AddMembershipResult,
  type AddMembershipVars,
  type RemoveMembershipResult,
  type RemoveMembershipVars,
} from '@/api/graphql/queries/departments'
import '@/components/icons'

const locale = useLocaleStore()
const toast = useToast()

// Local fallback dictionary for the department.* keys. The shared locale store
// (src/stores/locale.ts) does not yet carry these keys and is off-limits for
// this change; `locale.t` returns the raw key when an entry is missing, so this
// view resolves department.* itself and falls back to the store for shared keys.
const FALLBACK: Record<string, { zh: string; en: string }> = {
  'department.title': { zh: '部门与成员管理', en: 'Departments & Memberships' },
  'department.description': {
    zh: '管理部门（对应 litellm 团队）及其成员归属，成员的预算与限流随其所在部门生效。',
    en: 'Manage departments (each backed by a litellm team) and their member assignments; a member inherits the budget and limits of their department.',
  },
  'department.action.refresh': { zh: '刷新', en: 'Refresh' },
  'department.action.create': { zh: '新建部门', en: 'New Department' },
  'department.list.title': { zh: '部门列表', en: 'Departments' },
  'department.list.loading': { zh: '加载中…', en: 'Loading…' },
  'department.list.empty': { zh: '暂无部门', en: 'No departments' },
  'department.list.error': { zh: '部门加载失败', en: 'Failed to load departments' },
  'department.list.delete': { zh: '删除部门', en: 'Delete department' },
  'department.detail.empty': { zh: '请选择左侧的一个部门以查看成员', en: 'Select a department to view its members' },
  'department.detail.team': { zh: 'litellm 团队', en: 'litellm Team' },
  'department.detail.tenant': { zh: '租户', en: 'Tenant' },
  'department.detail.createdAt': { zh: '创建时间', en: 'Created At' },
  'department.detail.none': { zh: '—', en: '—' },
  'department.members.title': { zh: '部门成员', en: 'Members' },
  'department.members.add': { zh: '添加成员', en: 'Add Member' },
  'department.members.loading': { zh: '正在加载成员…', en: 'Loading members…' },
  'department.members.empty': { zh: '该部门暂无成员', en: 'No members in this department' },
  'department.members.error': { zh: '成员加载失败', en: 'Failed to load members' },
  'department.members.remove': { zh: '移除成员', en: 'Remove member' },
  'department.members.unknownUser': { zh: '未知用户', en: 'Unknown user' },
  'department.role.user': { zh: '成员', en: 'Member' },
  'department.role.dept_admin': { zh: '部门管理员', en: 'Dept Admin' },
  'department.create.title': { zh: '新建部门', en: 'New Department' },
  'department.create.nameLabel': { zh: '部门名称', en: 'Department name' },
  'department.create.namePlaceholder': { zh: '例如：研发中心', en: 'e.g. Engineering' },
  'department.create.budgetLabel': { zh: '共享预算（可选）', en: 'Shared budget (optional)' },
  'department.create.budgetHint': { zh: '该部门 litellm 团队的共享额度，留空表示不限', en: 'Shared quota for the department litellm team; blank means unlimited' },
  'department.create.cancel': { zh: '取消', en: 'Cancel' },
  'department.create.submit': { zh: '创建', en: 'Create' },
  'department.create.nameRequired': { zh: '请输入部门名称', en: 'Department name is required' },
  'department.addMember.title': { zh: '添加成员', en: 'Add Member' },
  'department.addMember.userLabel': { zh: '选择用户', en: 'Select user' },
  'department.addMember.userPlaceholder': { zh: '请选择用户', en: 'Select a user' },
  'department.addMember.roleLabel': { zh: '成员角色', en: 'Role' },
  'department.addMember.usersLoading': { zh: '正在加载用户…', en: 'Loading users…' },
  'department.addMember.noUsers': { zh: '没有可添加的用户', en: 'No users available to add' },
  'department.addMember.allAssigned': { zh: '该部门已包含全部用户', en: 'Every user is already a member' },
  'department.addMember.cancel': { zh: '取消', en: 'Cancel' },
  'department.addMember.submit': { zh: '添加', en: 'Add' },
  'department.addMember.userRequired': { zh: '请选择一个用户', en: 'Please select a user' },
  'department.confirm.deleteTitle': { zh: '删除部门', en: 'Delete Department' },
  'department.confirm.deleteBody': {
    zh: '确定要删除该部门吗？其 litellm 团队与成员归属将一并解除，此操作不可撤销。',
    en: 'Delete this department? Its litellm team and member assignments will be removed. This cannot be undone.',
  },
  'department.confirm.removeTitle': { zh: '移除成员', en: 'Remove Member' },
  'department.confirm.removeBody': {
    zh: '确定要将该成员移出此部门吗？',
    en: 'Remove this member from the department?',
  },
  'department.toast.created': { zh: '部门已创建', en: 'Department created' },
  'department.toast.createFailed': { zh: '创建部门失败', en: 'Failed to create department' },
  'department.toast.deleted': { zh: '部门已删除', en: 'Department deleted' },
  'department.toast.deleteFailed': { zh: '删除部门失败', en: 'Failed to delete department' },
  'department.toast.memberAdded': { zh: '成员已添加', en: 'Member added' },
  'department.toast.memberAddFailed': { zh: '添加成员失败', en: 'Failed to add member' },
  'department.toast.memberRemoved': { zh: '成员已移除', en: 'Member removed' },
  'department.toast.memberRemoveFailed': { zh: '移除成员失败', en: 'Failed to remove member' },
  'department.toast.refreshed': { zh: '部门列表已刷新', en: 'Departments refreshed' },
  'department.toast.refreshFailed': { zh: '刷新失败', en: 'Failed to refresh' },
}

// Resolve department.* from the local fallback, otherwise defer to the store.
function tt(key: string): string {
  const entry = FALLBACK[key]
  if (entry) return entry[locale.locale]
  return locale.t(key)
}

const MEMBERSHIP_ROLES: MembershipRole[] = ['user', 'dept_admin']

function roleLabel(role: MembershipRole): string {
  return tt(`department.role.${role}`)
}

/* ---------- Departments (master) ---------- */

const selectedDepartmentId = ref<string | null>(null)

const {
  result: departmentsResult,
  loading: departmentsLoading,
  error: departmentsError,
  refetch: refetchDepartments,
} = useQuery<DepartmentsResult>(DEPARTMENTS_QUERY)

const departments = computed<DepartmentNode[]>(() => departmentsResult.value?.departments ?? [])

const selectedDepartment = computed<DepartmentNode | null>(
  () => departments.value.find((d) => d.id === selectedDepartmentId.value) ?? null,
)

// Keep a valid selection: default to the first department, clear if it vanished.
watch(
  departments,
  (list) => {
    if (list.length === 0) {
      selectedDepartmentId.value = null
      return
    }
    if (!list.some((d) => d.id === selectedDepartmentId.value)) {
      selectedDepartmentId.value = list[0].id
    }
  },
  { immediate: true },
)

function selectDepartment(id: string) {
  selectedDepartmentId.value = id
}

/* ---------- Members (detail) ---------- */

// `enabled` keeps the member query idle until a department is selected; the
// variables are derived reactively so changing the selection refetches.
const memberQueryVars = computed<DepartmentMembersVars>(() => ({
  departmentId: selectedDepartmentId.value ?? '',
}))

const {
  result: membersResult,
  loading: membersLoading,
  error: membersError,
  refetch: refetchMembers,
} = useQuery<DepartmentMembersResult, DepartmentMembersVars>(
  DEPARTMENT_MEMBERS_QUERY,
  memberQueryVars,
  () => ({ enabled: selectedDepartmentId.value !== null, fetchPolicy: 'cache-and-network' }),
)

const members = computed<MembershipNode[]>(() => membersResult.value?.departmentMembers ?? [])

/* ---------- Users (read-only import for the picker + name join) ---------- */

interface UsersQueryResult {
  users: { nodes: AccountUser[] }
}

const { result: usersResult, loading: usersLoading } = useQuery<UsersQueryResult>(USERS_QUERY)

const users = computed<AccountUser[]>(() => usersResult.value?.users.nodes ?? [])

const usersById = computed<Map<string, AccountUser>>(() => {
  const map = new Map<string, AccountUser>()
  for (const u of users.value) map.set(u.id, u)
  return map
})

function userLabel(userId: string): string {
  const user = usersById.value.get(userId)
  if (!user) return `${tt('department.members.unknownUser')} (${userId})`
  return user.displayName || user.username || user.email || userId
}

// Users not yet in the selected department — the add-member picker options.
const assignableUsers = computed<AccountUser[]>(() => {
  const assigned = new Set(members.value.map((m) => m.userId))
  return users.value
    .filter((u) => !assigned.has(u.id))
    .sort((a, b) =>
      (a.displayName || a.username).localeCompare(b.displayName || b.username, locale.locale),
    )
})

/* ---------- Create department ---------- */

const createOpen = ref(false)
const creating = ref(false)
const createForm = reactive<{ name: string; maxBudget: string }>({ name: '', maxBudget: '' })

function openCreate() {
  createForm.name = ''
  createForm.maxBudget = ''
  createOpen.value = true
}

function closeCreate() {
  if (creating.value) return
  createOpen.value = false
}

async function submitCreate() {
  const name = createForm.name.trim()
  if (!name) {
    toast.error(tt('department.create.nameRequired'))
    return
  }
  if (creating.value) return
  // Parse the optional budget defensively: blank → omit; non-numeric → omit.
  const parsedBudget = createForm.maxBudget.trim() === '' ? null : Number(createForm.maxBudget)
  const maxBudget = parsedBudget !== null && Number.isFinite(parsedBudget) ? parsedBudget : null
  creating.value = true
  try {
    const { data } = await apolloClient.mutate<CreateDepartmentResult, CreateDepartmentVars>({
      mutation: CREATE_DEPARTMENT_MUTATION,
      variables: { input: { name, maxBudget } },
    })
    toast.success(tt('department.toast.created'))
    createOpen.value = false
    await refetchDepartments()
    const created = data?.createDepartment
    if (created) selectedDepartmentId.value = created.id
  } catch (error) {
    toast.error(graphqlErrorMessage(error, tt('department.toast.createFailed')))
  } finally {
    creating.value = false
  }
}

/* ---------- Delete department ---------- */

const deleteTarget = ref<DepartmentNode | null>(null)
const deleting = ref(false)

function requestDeleteDepartment(department: DepartmentNode) {
  deleteTarget.value = department
}

function cancelDeleteDepartment() {
  if (deleting.value) return
  deleteTarget.value = null
}

async function confirmDeleteDepartment() {
  const target = deleteTarget.value
  if (!target || deleting.value) return
  deleting.value = true
  try {
    await apolloClient.mutate<DeleteDepartmentResult, DeleteDepartmentVars>({
      mutation: DELETE_DEPARTMENT_MUTATION,
      variables: { id: target.id },
    })
    toast.success(tt('department.toast.deleted'))
    deleteTarget.value = null
    if (selectedDepartmentId.value === target.id) selectedDepartmentId.value = null
    await refetchDepartments()
  } catch (error) {
    toast.error(graphqlErrorMessage(error, tt('department.toast.deleteFailed')))
  } finally {
    deleting.value = false
  }
}

/* ---------- Add member ---------- */

const addMemberOpen = ref(false)
const addingMember = ref(false)
const addForm = reactive<{ userId: string; role: MembershipRole }>({ userId: '', role: 'user' })

function openAddMember() {
  if (!selectedDepartment.value) return
  addForm.userId = ''
  addForm.role = 'user'
  addMemberOpen.value = true
}

function closeAddMember() {
  if (addingMember.value) return
  addMemberOpen.value = false
}

async function submitAddMember() {
  const department = selectedDepartment.value
  if (!department) return
  if (!addForm.userId) {
    toast.error(tt('department.addMember.userRequired'))
    return
  }
  if (addingMember.value) return
  addingMember.value = true
  try {
    await apolloClient.mutate<AddMembershipResult, AddMembershipVars>({
      mutation: ADD_MEMBERSHIP_MUTATION,
      variables: { userId: addForm.userId, departmentId: department.id, role: addForm.role },
    })
    toast.success(tt('department.toast.memberAdded'))
    addMemberOpen.value = false
    await refetchMembers()
  } catch (error) {
    toast.error(graphqlErrorMessage(error, tt('department.toast.memberAddFailed')))
  } finally {
    addingMember.value = false
  }
}

/* ---------- Remove member ---------- */

const removeTarget = ref<MembershipNode | null>(null)
const removing = ref(false)

function requestRemoveMember(membership: MembershipNode) {
  removeTarget.value = membership
}

function cancelRemoveMember() {
  if (removing.value) return
  removeTarget.value = null
}

async function confirmRemoveMember() {
  const target = removeTarget.value
  const department = selectedDepartment.value
  if (!target || !department || removing.value) return
  removing.value = true
  try {
    await apolloClient.mutate<RemoveMembershipResult, RemoveMembershipVars>({
      mutation: REMOVE_MEMBERSHIP_MUTATION,
      variables: { userId: target.userId, departmentId: department.id },
    })
    toast.success(tt('department.toast.memberRemoved'))
    removeTarget.value = null
    await refetchMembers()
  } catch (error) {
    toast.error(graphqlErrorMessage(error, tt('department.toast.memberRemoveFailed')))
  } finally {
    removing.value = false
  }
}

/* ---------- Refresh ---------- */

async function refresh() {
  if (departmentsLoading.value) return
  try {
    await refetchDepartments()
    if (selectedDepartmentId.value) await refetchMembers()
    toast.success(tt('department.toast.refreshed'))
  } catch (error) {
    toast.error(graphqlErrorMessage(error, tt('department.toast.refreshFailed')))
  }
}

function onAddUserChange(event: Event) {
  addForm.userId = (event.target as HTMLSelectElement).value
}

function onAddRoleChange(event: Event) {
  addForm.role = (event.target as HTMLSelectElement).value as MembershipRole
}
</script>

<template>
  <section class="department-page">
    <header class="page-head">
      <h1 cds-text="title" class="heading">{{ tt('department.title') }}</h1>
      <p cds-text="body" class="desc muted">{{ tt('department.description') }}</p>
    </header>

    <div class="content-card">
      <div class="toolbar">
        <cds-button action="solid" status="primary" @click="openCreate">
          <cds-icon shape="plus-circle" size="sm" aria-hidden="true"></cds-icon>
          <span>{{ tt('department.action.create') }}</span>
        </cds-button>

        <cds-button
          action="ghost"
          class="refresh-button"
          :disabled="departmentsLoading"
          :aria-label="tt('department.action.refresh')"
          :title="tt('department.action.refresh')"
          @click="refresh"
        >
          <cds-icon shape="refresh" size="md" :class="{ spinning: departmentsLoading }"></cds-icon>
          <span>{{ tt('department.action.refresh') }}</span>
        </cds-button>
      </div>

      <div class="master-detail">
        <!-- Master: departments list -->
        <aside class="list-panel" :aria-label="tt('department.list.title')">
          <h2 cds-text="subsection" class="panel-title">{{ tt('department.list.title') }}</h2>

          <p v-if="departmentsLoading && departments.length === 0" class="panel-state muted">
            {{ tt('department.list.loading') }}
          </p>
          <p v-else-if="departmentsError" class="panel-state error">
            {{ tt('department.list.error') }}
          </p>
          <p v-else-if="departments.length === 0" class="panel-state muted">
            {{ tt('department.list.empty') }}
          </p>

          <ul v-else class="dept-list">
            <li v-for="department in departments" :key="department.id" class="dept-row">
              <button
                type="button"
                class="dept-item"
                :class="{ active: department.id === selectedDepartmentId }"
                :aria-pressed="department.id === selectedDepartmentId"
                @click="selectDepartment(department.id)"
              >
                <span class="dept-name" :title="department.name">{{ department.name }}</span>
                <span v-if="department.litellmTeamId" class="dept-team muted">
                  {{ department.litellmTeamId }}
                </span>
              </button>

              <AppDropdown align="end">
                <template #trigger>
                  <cds-button
                    action="ghost"
                    size="sm"
                    class="row-menu-trigger"
                    :aria-label="tt('department.list.delete')"
                    :title="tt('department.list.delete')"
                  >
                    <cds-icon shape="ellipsis-vertical" size="sm"></cds-icon>
                  </cds-button>
                </template>
                <template #default="{ close }">
                  <button
                    type="button"
                    class="menu-item danger"
                    @click="close(); requestDeleteDepartment(department)"
                  >
                    <cds-icon shape="trash" size="sm" aria-hidden="true"></cds-icon>
                    {{ tt('department.list.delete') }}
                  </button>
                </template>
              </AppDropdown>
            </li>
          </ul>
        </aside>

        <!-- Detail: selected department + members -->
        <div class="detail-panel">
          <div v-if="!selectedDepartment" class="detail-empty">
            <cds-icon shape="users" size="xl"></cds-icon>
            <p cds-text="subsection">{{ tt('department.detail.empty') }}</p>
          </div>

          <template v-else>
            <header class="detail-head">
              <h2 cds-text="section" class="detail-title">{{ selectedDepartment.name }}</h2>
            </header>

            <dl class="detail-grid">
              <div class="detail-row">
                <dt>{{ tt('department.detail.team') }}</dt>
                <dd>{{ selectedDepartment.litellmTeamId || tt('department.detail.none') }}</dd>
              </div>
              <div class="detail-row">
                <dt>{{ tt('department.detail.tenant') }}</dt>
                <dd>{{ selectedDepartment.tenantId || tt('department.detail.none') }}</dd>
              </div>
              <div class="detail-row">
                <dt>{{ tt('department.detail.createdAt') }}</dt>
                <dd>{{ selectedDepartment.createdAt }}</dd>
              </div>
            </dl>

            <section class="members-section">
              <div class="members-head">
                <h3 cds-text="subsection" class="members-title">
                  {{ tt('department.members.title') }}
                  <span class="members-count muted">({{ members.length }})</span>
                </h3>
                <cds-button action="outline" size="sm" @click="openAddMember">
                  <cds-icon shape="plus-circle" size="sm" aria-hidden="true"></cds-icon>
                  {{ tt('department.members.add') }}
                </cds-button>
              </div>

              <p v-if="membersLoading && members.length === 0" class="panel-state muted">
                {{ tt('department.members.loading') }}
              </p>
              <p v-else-if="membersError" class="panel-state error">
                {{ tt('department.members.error') }}
              </p>
              <p v-else-if="members.length === 0" class="panel-state muted">
                {{ tt('department.members.empty') }}
              </p>

              <ul v-else class="member-list">
                <li v-for="member in members" :key="member.id" class="member-item">
                  <cds-icon shape="user" size="sm" aria-hidden="true"></cds-icon>
                  <span class="member-name" :title="userLabel(member.userId)">
                    {{ userLabel(member.userId) }}
                  </span>
                  <cds-badge
                    v-if="member.role === 'dept_admin'"
                    status="info"
                    class="member-role"
                  >
                    {{ roleLabel(member.role) }}
                  </cds-badge>
                  <cds-badge v-else class="member-role">
                    {{ roleLabel(member.role) }}
                  </cds-badge>
                  <cds-button
                    action="ghost"
                    size="sm"
                    class="member-remove"
                    :aria-label="tt('department.members.remove')"
                    :title="tt('department.members.remove')"
                    @click="requestRemoveMember(member)"
                  >
                    <cds-icon shape="trash" size="sm"></cds-icon>
                  </cds-button>
                </li>
              </ul>
            </section>
          </template>
        </div>
      </div>
    </div>

    <!-- Create department dialog -->
    <Teleport to="body">
      <Transition name="dept-fade">
        <div
          v-if="createOpen"
          class="dept-backdrop"
          role="dialog"
          aria-modal="true"
          :aria-label="tt('department.create.title')"
          @click.self="closeCreate"
        >
          <form class="dept-card" @submit.prevent="submitCreate">
            <h2 cds-text="section" class="dialog-title">{{ tt('department.create.title') }}</h2>

            <cds-input>
              <label>{{ tt('department.create.nameLabel') }}</label>
              <input
                v-model="createForm.name"
                type="text"
                :placeholder="tt('department.create.namePlaceholder')"
                :disabled="creating"
                required
              />
            </cds-input>

            <cds-input>
              <label>{{ tt('department.create.budgetLabel') }}</label>
              <input
                v-model="createForm.maxBudget"
                type="number"
                min="0"
                step="0.01"
                :disabled="creating"
              />
              <cds-control-message>{{ tt('department.create.budgetHint') }}</cds-control-message>
            </cds-input>

            <div class="dialog-actions">
              <cds-button type="button" action="outline" :disabled="creating" @click="closeCreate">
                {{ tt('department.create.cancel') }}
              </cds-button>
              <cds-button
                type="submit"
                action="solid"
                status="primary"
                :disabled="creating || createForm.name.trim() === ''"
                :loading-state="creating ? 'loading' : 'default'"
              >
                {{ tt('department.create.submit') }}
              </cds-button>
            </div>
          </form>
        </div>
      </Transition>
    </Teleport>

    <!-- Add member dialog -->
    <Teleport to="body">
      <Transition name="dept-fade">
        <div
          v-if="addMemberOpen"
          class="dept-backdrop"
          role="dialog"
          aria-modal="true"
          :aria-label="tt('department.addMember.title')"
          @click.self="closeAddMember"
        >
          <form class="dept-card" @submit.prevent="submitAddMember">
            <h2 cds-text="section" class="dialog-title">{{ tt('department.addMember.title') }}</h2>

            <p v-if="usersLoading" class="panel-state muted">
              {{ tt('department.addMember.usersLoading') }}
            </p>
            <p v-else-if="assignableUsers.length === 0" class="panel-state muted">
              {{ users.length === 0 ? tt('department.addMember.noUsers') : tt('department.addMember.allAssigned') }}
            </p>

            <template v-else>
              <cds-select>
                <label>{{ tt('department.addMember.userLabel') }}</label>
                <select
                  :value="addForm.userId"
                  :aria-label="tt('department.addMember.userLabel')"
                  :disabled="addingMember"
                  @change="onAddUserChange"
                >
                  <option value="" disabled>{{ tt('department.addMember.userPlaceholder') }}</option>
                  <option v-for="user in assignableUsers" :key="user.id" :value="user.id">
                    {{ user.displayName || user.username }}<template v-if="user.email"> ({{ user.email }})</template>
                  </option>
                </select>
              </cds-select>

              <cds-select>
                <label>{{ tt('department.addMember.roleLabel') }}</label>
                <select
                  :value="addForm.role"
                  :aria-label="tt('department.addMember.roleLabel')"
                  :disabled="addingMember"
                  @change="onAddRoleChange"
                >
                  <option v-for="role in MEMBERSHIP_ROLES" :key="role" :value="role">
                    {{ roleLabel(role) }}
                  </option>
                </select>
              </cds-select>
            </template>

            <div class="dialog-actions">
              <cds-button type="button" action="outline" :disabled="addingMember" @click="closeAddMember">
                {{ tt('department.addMember.cancel') }}
              </cds-button>
              <cds-button
                type="submit"
                action="solid"
                status="primary"
                :disabled="addingMember || addForm.userId === '' || assignableUsers.length === 0"
                :loading-state="addingMember ? 'loading' : 'default'"
              >
                {{ tt('department.addMember.submit') }}
              </cds-button>
            </div>
          </form>
        </div>
      </Transition>
    </Teleport>

    <!-- Delete department confirm -->
    <ConfirmDialog
      :open="deleteTarget !== null"
      :title="tt('department.confirm.deleteTitle')"
      :body="tt('department.confirm.deleteBody')"
      danger
      @confirm="confirmDeleteDepartment"
      @close="cancelDeleteDepartment"
    />

    <!-- Remove member confirm -->
    <ConfirmDialog
      :open="removeTarget !== null"
      :title="tt('department.confirm.removeTitle')"
      :body="tt('department.confirm.removeBody')"
      danger
      @confirm="confirmRemoveMember"
      @close="cancelRemoveMember"
    />
  </section>
</template>

<style scoped>
.department-page {
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
.dept-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.dept-row {
  display: flex;
  align-items: center;
  gap: 4px;
}
.dept-item {
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
.dept-item:hover {
  background: var(--cds-alias-object-app-background, #f4f4f4);
}
.dept-item.active {
  border-color: var(--cds-alias-object-interaction-color, #0072a3);
  background: color-mix(in srgb, var(--cds-alias-object-interaction-color, #0072a3) 8%, transparent);
}
.dept-name {
  font-weight: 600;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dept-team {
  font-size: 12px;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.row-menu-trigger {
  flex: 0 0 auto;
}
.menu-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 8px 14px;
  border: none;
  background: transparent;
  color: var(--cds-alias-object-app-foreground, #1b1b1b);
  font: inherit;
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
.members-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-top: 12px;
  border-top: 1px solid var(--cds-alias-object-border-color, #e8e8e8);
}
.members-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.members-title {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
}
.members-count {
  font-weight: 400;
}
.member-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.member-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border: 1px solid var(--cds-alias-object-border-color, #e8e8e8);
  border-radius: 4px;
  font-size: 13px;
}
.member-name {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.member-role {
  flex: 0 0 auto;
}
.member-remove {
  flex: 0 0 auto;
}
.muted {
  color: var(--cds-alias-typography-color-300, #565656);
}
.spinning {
  animation: department-spin 1s linear infinite;
  transform-origin: center;
}
@keyframes department-spin {
  to {
    transform: rotate(360deg);
  }
}

/* Dialogs (mirror ConfirmDialog / AboutDialog backdrop + card). */
.dept-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(11, 18, 32, 0.55);
  backdrop-filter: blur(2px);
  -webkit-backdrop-filter: blur(2px);
  display: grid;
  place-items: center;
  z-index: 1100;
  padding: 24px;
}
.dept-card {
  width: min(440px, 100%);
  background: var(--cds-alias-object-container-background, #fff);
  color: var(--cds-alias-object-app-foreground, #1b1b1b);
  border-radius: 12px;
  box-shadow: 0 30px 80px rgba(0, 0, 0, 0.35);
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.dialog-title {
  margin: 0;
  font-size: 18px;
}
.dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
.dept-fade-enter-active,
.dept-fade-leave-active {
  transition: opacity 0.18s ease;
}
.dept-fade-enter-from,
.dept-fade-leave-to {
  opacity: 0;
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
