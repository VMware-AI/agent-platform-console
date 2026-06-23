<script setup lang="ts">
/**
 * Users tab — the "用户管理" half of `/platform/users`.
 *
 * Mirrors AgentListView's structure (header, toolbar, cds-grid with column
 * header sort + per-column keyword filter dropdowns, hand-assembled pager,
 * footer summary). The differences vs AgentListView:
 *  - No row-selection checkbox column (no batch toolbar).
 *  - No row-level "编辑" button — only 重置密码 / 绑定角色 / 启禁用 / 删除.
 *  - `user.id` is fetched and held in memory but never rendered in the UI.
 *  - Dedupe lives inside `UserFormDialog`, not in this tab.
 */
import { computed, ref } from 'vue'
import { useMutation, useQuery } from '@vue/apollo-composable'
import { useLocaleStore } from '@/stores/locale'
import { useToast } from '@/composables/useToast'
import {
  USERS_QUERY,
  ROLES_QUERY,
  RESET_USER_PASSWORD_MUTATION,
  TOGGLE_USER_ENABLED_MUTATION,
  DELETE_USER_MUTATION,
} from '@/api/graphql/queries/users'
import type {
  AccountUser,
  ResetPasswordPayload,
  Role,
  RolesQueryResult,
  ToggleUserEnabledPayload,
  UserConnection,
  UserFilter,
  UsersQueryResult,
  UserSort,
  UserSortField,
} from '@/api/graphql/types'
import '@/components/icons'

import UserFormDialog from './UserFormDialog.vue'
import BindRoleDialog from './BindRoleDialog.vue'
import ConfirmDialog from './ConfirmDialog.vue'
import PasswordRevealDialog from './PasswordRevealDialog.vue'

const locale = useLocaleStore()
const toast = useToast()

/* ---------- Reactive filter / sort / pagination state ---------- */
const filter = ref<UserFilter>({})
const sort = ref<UserSort | null>(null)
const currentPage = ref(1)
const pageSize = ref<10 | 20 | 50 | 100>(10)

const queryVars = computed(() => ({
  filter: filter.value,
  pagination: { page: currentPage.value, pageSize: pageSize.value },
  sort: sort.value,
}))

const { result: usersResult, loading, error, refetch: refetchUsers } =
  useQuery<UsersQueryResult, { filter?: UserFilter; pagination?: unknown; sort?: UserSort | null }>(
    USERS_QUERY,
    queryVars,
    () => ({ fetchPolicy: 'cache-and-network' }),
  )
const { result: rolesResult } = useQuery<RolesQueryResult>(ROLES_QUERY, null, () => ({
  fetchPolicy: 'cache-and-network',
}))

const users = computed<AccountUser[]>(() => usersResult.value?.users.nodes ?? [])
const totalCount = computed(() => usersResult.value?.users.totalCount ?? 0)
const pageInfo = computed(() => usersResult.value?.users.pageInfo ?? null)
const roles = computed<Role[]>(() => rolesResult.value?.roles.nodes ?? [])

/* ---------- Per-column keyword filters ----------
 * Filter values live directly on `filter` (no draft ref). Each input in
 * the column filter dropdown calls `setColumnFilter` on `input`/`change`,
 * which both writes the active filter and resets the pager. */
function setColumnFilter(field: keyof UserFilter, value: string) {
  filter.value = { ...filter.value, [field]: value || null }
  currentPage.value = 1
}

/* ---------- Sort (3-state cycle: none → asc → desc → none) ---------- */
type SortState = 'none' | 'ascending' | 'descending'

function sortStateFor(field: UserSortField): SortState {
  if (!sort.value || sort.value.field !== field) return 'none'
  return sort.value.direction === 'ASC' ? 'ascending' : 'descending'
}

function onSortClick(field: UserSortField) {
  const cur = sortStateFor(field)
  if (cur === 'none') sort.value = { field, direction: 'ASC' }
  else if (cur === 'ascending') sort.value = { field, direction: 'DESC' }
  else sort.value = null
}

/* ---------- Filter dropdown open/close ----------
 * `cds-internal-popup`'s `anchor` property is declared as
 * `@property({type: String})`, so passing an HTMLElement would get coerced
 * to the literal string `"[object HTMLElement]"` and the popup's
 * `querySelector("#" + anchor)` lookup would silently miss. We bind a real
 * id on the trigger cds-button-action and pass that id (without a `#`
 * prefix — the popup prepends one itself). */
const openFilterAnchorId = ref<string | null>(null)
const openFilterKey = ref<keyof UserFilter | null>(null)

function openFilter(key: keyof UserFilter, target: EventTarget | null) {
  openFilterKey.value = key
  const host = (target as HTMLElement | null)?.closest('cds-button-action') as HTMLElement | null
  openFilterAnchorId.value = host?.id ?? null
}
function closeFilter() {
  openFilterAnchorId.value = null
  openFilterKey.value = null
}

/* ---------- Row action dialogs ---------- */
const showCreate = ref(false)
const showBindFor = ref<AccountUser | null>(null)
const showResetConfirm = ref<AccountUser | null>(null)
const showToggleConfirm = ref<AccountUser | null>(null)
const showDeleteConfirm = ref<AccountUser | null>(null)
const revealPayload = ref<{ username: string; password: string } | null>(null)

function openCreate() {
  showCreate.value = true
}
function openBind(user: AccountUser) {
  showBindFor.value = user
}
function openReset(user: AccountUser) {
  showResetConfirm.value = user
}
function openToggle(user: AccountUser) {
  showToggleConfirm.value = user
}
function openDelete(user: AccountUser) {
  showDeleteConfirm.value = user
}

/* ---------- Mutations ---------- */
const { mutate: resetPwdMutate } = useMutation<{ resetUserPassword: ResetPasswordPayload }>(
  RESET_USER_PASSWORD_MUTATION,
)
const { mutate: toggleMutate } = useMutation<{ toggleUserEnabled: ToggleUserEnabledPayload }>(
  TOGGLE_USER_ENABLED_MUTATION,
)
const { mutate: deleteMutate } = useMutation<{ deleteUser: { id: string } }>(
  DELETE_USER_MUTATION,
)

async function doReset() {
  const target = showResetConfirm.value
  if (!target) return
  showResetConfirm.value = null
  try {
    const r = await resetPwdMutate({ id: target.id })
    const p = r?.data?.resetUserPassword
    if (!p) throw new Error('no payload')
    revealPayload.value = { username: p.user.username, password: p.generatedPassword }
    toast.success(locale.t('users.toast.resetPwdOk'))
    refetchUsers()
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[users] reset password failed', err)
    toast.error(locale.t('users.toast.resetPwdFail'))
  }
}

async function doToggle() {
  const target = showToggleConfirm.value
  if (!target) return
  showToggleConfirm.value = null
  try {
    await toggleMutate({ id: target.id })
    toast.success(
      locale
        .t(target.enabled ? 'users.toast.disableOk' : 'users.toast.enableOk')
        .replace('{name}', target.username),
    )
    refetchUsers()
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[users] toggle enabled failed', err)
    toast.error(locale.t('users.toast.toggleFail'))
  }
}

async function doDelete() {
  const target = showDeleteConfirm.value
  if (!target) return
  showDeleteConfirm.value = null
  try {
    await deleteMutate({ id: target.id })
    toast.success(locale.t('users.toast.deleteOk').replace('{name}', target.username))
    refetchUsers()
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[users] delete user failed', err)
    toast.error(locale.t('users.toast.deleteFail'))
  }
}

/* ---------- Pagination handlers ---------- */
function onPageSizeSelect(e: Event) {
  const next = parseInt((e.target as HTMLSelectElement).value, 10)
  if (!Number.isFinite(next)) return
  pageSize.value = next as 10 | 20 | 50 | 100
  currentPage.value = 1
}
function goToPage(page: number) {
  const total = pageInfo.value?.totalPages ?? 1
  if (page >= 1 && page <= total) {
    currentPage.value = page
  }
}
function onPrevPage() {
  goToPage(currentPage.value - 1)
}
function onNextPage() {
  goToPage(currentPage.value + 1)
}
function onPageInput(e: Event) {
  const next = parseInt((e.target as HTMLInputElement).value, 10)
  const total = pageInfo.value?.totalPages ?? 1
  if (Number.isFinite(next) && next >= 1 && next <= total) {
    currentPage.value = next
  }
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

/* ---------- Display helpers ---------- */
function fmtDateTime(iso: string | null): string {
  if (!iso) return '—'
  try {
    return new Intl.DateTimeFormat('zh-CN', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(iso))
  } catch {
    return iso
  }
}

/* ---------- Hand-off for BindRoleDialog "assigned" callback ---------- */
function onAssigned() {
  showBindFor.value = null
  refetchUsers()
}
function onCreateSubmitted(payload: {
  user: AccountUser
  generatedPassword: string | null
}) {
  showCreate.value = false
  if (payload.generatedPassword) {
    revealPayload.value = {
      username: payload.user.username,
      password: payload.generatedPassword,
    }
  }
  refetchUsers()
}
function onRevealClose() {
  revealPayload.value = null
}
</script>

<template>
  <section class="users-tab">
    <!-- Toolbar -->
    <div class="toolbar">
      <cds-button action="outline" status="primary" @click="openCreate">
        <cds-icon shape="plus-circle" size="sm" aria-hidden="true"></cds-icon>
        {{ locale.t('users.toolbar.create') }}
      </cds-button>
    </div>

    <cds-alert v-if="error" status="danger" closable>
      {{ locale.t('users.error') }}
    </cds-alert>

    <cds-grid
      :border="'row'"
      :column-layout="'flex'"
      role="grid"
      aria-label="users"
    >
      <!-- Column: username -->
      <cds-grid-column :width="'14%'">
        <div class="col-head">
          <span>{{ locale.t('users.col.username') }}</span>
          <span class="col-head-actions">
            <cds-button-action
              :aria-label="`sort ${locale.t('users.col.username')}`"
              @click="onSortClick('USERNAME')"
            >
              <cds-icon
                v-if="sortStateFor('USERNAME') === 'ascending'"
                shape="angle" direction="up" size="sm"
              ></cds-icon>
              <cds-icon
                v-else-if="sortStateFor('USERNAME') === 'descending'"
                shape="angle" direction="down" size="sm"
              ></cds-icon>
              <cds-icon
                v-else
                shape="two-way-arrows" class="col-sort-rotated" size="sm"
              ></cds-icon>
            </cds-button-action>
            <cds-button-action
              id="users-filter-username"
              shape="filter"
              :aria-label="`filter ${locale.t('users.col.username')}`"
              :expanded="!!(filter.usernameKeyword)"
              @click="(e: MouseEvent) => openFilter('usernameKeyword', e.target)"
            ></cds-button-action>
          </span>
        </div>
      </cds-grid-column>

      <!-- Column: role -->
      <cds-grid-column :width="'10%'">
        <div class="col-head">
          <span>{{ locale.t('users.col.role') }}</span>
          <span class="col-head-actions">
            <cds-button-action
              :aria-label="`sort ${locale.t('users.col.role')}`"
              @click="onSortClick('ROLE')"
            >
              <cds-icon
                v-if="sortStateFor('ROLE') === 'ascending'"
                shape="angle" direction="up" size="sm"
              ></cds-icon>
              <cds-icon
                v-else-if="sortStateFor('ROLE') === 'descending'"
                shape="angle" direction="down" size="sm"
              ></cds-icon>
              <cds-icon
                v-else
                shape="two-way-arrows" class="col-sort-rotated" size="sm"
              ></cds-icon>
            </cds-button-action>
            <cds-button-action
              id="users-filter-role"
              shape="filter"
              :aria-label="`filter ${locale.t('users.col.role')}`"
              :expanded="!!(filter.roleKeyword)"
              @click="(e: MouseEvent) => openFilter('roleKeyword', e.target)"
            ></cds-button-action>
          </span>
        </div>
      </cds-grid-column>

      <!-- Column: email -->
      <cds-grid-column :width="'18%'">
        <div class="col-head">
          <span>{{ locale.t('users.col.email') }}</span>
          <span class="col-head-actions">
            <cds-button-action
              :aria-label="`sort ${locale.t('users.col.email')}`"
              @click="onSortClick('EMAIL')"
            >
              <cds-icon
                v-if="sortStateFor('EMAIL') === 'ascending'"
                shape="angle" direction="up" size="sm"
              ></cds-icon>
              <cds-icon
                v-else-if="sortStateFor('EMAIL') === 'descending'"
                shape="angle" direction="down" size="sm"
              ></cds-icon>
              <cds-icon
                v-else
                shape="two-way-arrows" class="col-sort-rotated" size="sm"
              ></cds-icon>
            </cds-button-action>
            <cds-button-action
              id="users-filter-email"
              shape="filter"
              :aria-label="`filter ${locale.t('users.col.email')}`"
              :expanded="!!(filter.emailKeyword)"
              @click="(e: MouseEvent) => openFilter('emailKeyword', e.target)"
            ></cds-button-action>
          </span>
        </div>
      </cds-grid-column>

      <!-- Column: last login -->
      <cds-grid-column :width="'16%'">
        <div class="col-head">
          <span>{{ locale.t('users.col.lastLogin') }}</span>
          <span class="col-head-actions">
            <cds-button-action
              :aria-label="`sort ${locale.t('users.col.lastLogin')}`"
              @click="onSortClick('LAST_LOGIN')"
            >
              <cds-icon
                v-if="sortStateFor('LAST_LOGIN') === 'ascending'"
                shape="angle" direction="up" size="sm"
              ></cds-icon>
              <cds-icon
                v-else-if="sortStateFor('LAST_LOGIN') === 'descending'"
                shape="angle" direction="down" size="sm"
              ></cds-icon>
              <cds-icon
                v-else
                shape="two-way-arrows" class="col-sort-rotated" size="sm"
              ></cds-icon>
            </cds-button-action>
          </span>
        </div>
      </cds-grid-column>

      <!-- Column: createdAt -->
      <cds-grid-column :width="'16%'">
        <div class="col-head">
          <span>{{ locale.t('users.col.createdAt') }}</span>
          <span class="col-head-actions">
            <cds-button-action
              :aria-label="`sort ${locale.t('users.col.createdAt')}`"
              @click="onSortClick('CREATED_AT')"
            >
              <cds-icon
                v-if="sortStateFor('CREATED_AT') === 'ascending'"
                shape="angle" direction="up" size="sm"
              ></cds-icon>
              <cds-icon
                v-else-if="sortStateFor('CREATED_AT') === 'descending'"
                shape="angle" direction="down" size="sm"
              ></cds-icon>
              <cds-icon
                v-else
                shape="two-way-arrows" class="col-sort-rotated" size="sm"
              ></cds-icon>
            </cds-button-action>
          </span>
        </div>
      </cds-grid-column>

      <!-- Column: updatedAt -->
      <cds-grid-column :width="'16%'">
        <div class="col-head">
          <span>{{ locale.t('users.col.updatedAt') }}</span>
          <span class="col-head-actions">
            <cds-button-action
              :aria-label="`sort ${locale.t('users.col.updatedAt')}`"
              @click="onSortClick('UPDATED_AT')"
            >
              <cds-icon
                v-if="sortStateFor('UPDATED_AT') === 'ascending'"
                shape="angle" direction="up" size="sm"
              ></cds-icon>
              <cds-icon
                v-else-if="sortStateFor('UPDATED_AT') === 'descending'"
                shape="angle" direction="down" size="sm"
              ></cds-icon>
              <cds-icon
                v-else
                shape="two-way-arrows" class="col-sort-rotated" size="sm"
              ></cds-icon>
            </cds-button-action>
          </span>
        </div>
      </cds-grid-column>

      <!-- Column: actions -->
      <cds-grid-column :width="'10%'">
        <div class="col-head col-actions">
          <span>{{ locale.t('users.col.actions') }}</span>
        </div>
      </cds-grid-column>

      <!-- Body rows -->
      <cds-grid-row v-for="u in users" :key="u.id">
        <cds-grid-cell>{{ u.username }}</cds-grid-cell>
        <cds-grid-cell>{{ u.role.name }}</cds-grid-cell>
        <cds-grid-cell class="muted">{{ u.email }}</cds-grid-cell>
        <cds-grid-cell>{{ fmtDateTime(u.lastLoginAt) }}</cds-grid-cell>
        <cds-grid-cell>{{ fmtDateTime(u.createdAt) }}</cds-grid-cell>
        <cds-grid-cell>{{ fmtDateTime(u.updatedAt) }}</cds-grid-cell>
        <cds-grid-cell>
          <span class="actions-cell">
            <cds-button-action
              shape="lock"
              :title="locale.t('users.action.resetPwd')"
              :aria-label="locale.t('users.action.resetPwd')"
              @click="openReset(u)"
            ></cds-button-action>
            <cds-button-action
              shape="users"
              :title="locale.t('users.action.bindRole')"
              :aria-label="locale.t('users.action.bindRole')"
              @click="openBind(u)"
            ></cds-button-action>
            <cds-button-action
              shape="ban"
              :title="u.enabled ? locale.t('users.action.disable') : locale.t('users.action.enable')"
              :aria-label="u.enabled ? locale.t('users.action.disable') : locale.t('users.action.enable')"
              @click="openToggle(u)"
            ></cds-button-action>
            <cds-button-action
              shape="trash"
              :title="locale.t('users.action.delete')"
              :aria-label="locale.t('users.action.delete')"
              @click="openDelete(u)"
            ></cds-button-action>
          </span>
        </cds-grid-cell>
      </cds-grid-row>

      <cds-grid-placeholder v-if="loading && users.length === 0">
        <cds-progress-circle size="xl" status="info"></cds-progress-circle>
        <p cds-text="subsection">{{ locale.t('users.loading') }}</p>
      </cds-grid-placeholder>

      <cds-grid-placeholder v-else-if="users.length === 0">
        <cds-icon shape="history" size="xl"></cds-icon>
        <p cds-text="subsection">{{ locale.t('users.empty') }}</p>
      </cds-grid-placeholder>

      <!-- Footer: [selected count, bottom-left] + [pager, pushed to the right].
           Mirrors AgentListView exactly so the two pages stay visually
           consistent. -->
      <cds-grid-footer v-if="pageInfo && totalCount > 0">
        <span></span>
        <div class="pager">
          <label class="pager-page-size-label" for="users-page-size">
            {{ locale.t('agents.pager.pageSize') }}
          </label>
          <cds-select control-width="shrink">
            <select
              id="users-page-size"
              :value="pageSize"
              :aria-label="locale.t('agents.pager.pageSize')"
              @change="onPageSizeSelect"
            >
              <option
                v-for="opt in [10, 20, 50, 100]"
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

    <!-- Column filter dropdowns (one anchor reused for all three keyword
         filters + the status select; the popup prepends '#' to the anchor
         id itself, so we pass the bare id.) -->
    <cds-dropdown
      v-if="openFilterAnchorId"
      :hidden="!openFilterKey"
      :anchor="openFilterAnchorId"
      closable
      @closeChange="closeFilter"
    >
      <div cds-layout="vertical align:stretch p:xs" class="filter-panel">
        <cds-input v-if="openFilterKey === 'usernameKeyword'">
          <input
            type="text"
            :value="filter.usernameKeyword ?? ''"
            :placeholder="locale.t('users.col.filter.usernamePlaceholder')"
            :aria-label="locale.t('users.col.filter.usernamePlaceholder')"
            @input="(e: Event) => setColumnFilter('usernameKeyword', (e.target as HTMLInputElement).value)"
          />
        </cds-input>
        <cds-input v-else-if="openFilterKey === 'roleKeyword'">
          <input
            type="text"
            :value="filter.roleKeyword ?? ''"
            :placeholder="locale.t('users.col.filter.rolePlaceholder')"
            :aria-label="locale.t('users.col.filter.rolePlaceholder')"
            @input="(e: Event) => setColumnFilter('roleKeyword', (e.target as HTMLInputElement).value)"
          />
        </cds-input>
        <cds-input v-else-if="openFilterKey === 'emailKeyword'">
          <input
            type="text"
            :value="filter.emailKeyword ?? ''"
            :placeholder="locale.t('users.col.filter.emailPlaceholder')"
            :aria-label="locale.t('users.col.filter.emailPlaceholder')"
            @input="(e: Event) => setColumnFilter('emailKeyword', (e.target as HTMLInputElement).value)"
          />
        </cds-input>
      </div>
    </cds-dropdown>

    <!-- Dialogs -->
    <UserFormDialog
      v-if="showCreate"
      :open="showCreate"
      :roles="roles"
      @close="showCreate = false"
      @submitted="onCreateSubmitted"
    />

    <BindRoleDialog
      v-if="showBindFor"
      :open="!!showBindFor"
      :user="showBindFor"
      :roles="roles"
      :all-users="users"
      @close="showBindFor = null"
      @assigned="onAssigned"
    />

    <ConfirmDialog
      :open="!!showResetConfirm"
      :title="locale.t('users.confirm.reset.title')"
      :body="locale.t('users.confirm.reset.body').replace('{name}', showResetConfirm?.username ?? '')"
      @close="showResetConfirm = null"
      @confirm="doReset"
    />

    <ConfirmDialog
      :open="!!showToggleConfirm"
      :title="locale.t('users.confirm.disable.title')"
      :body="locale.t('users.confirm.disable.body').replace('{name}', showToggleConfirm?.username ?? '')"
      @close="showToggleConfirm = null"
      @confirm="doToggle"
    />

    <ConfirmDialog
      :open="!!showDeleteConfirm"
      :title="locale.t('users.confirm.delete.title')"
      :body="locale.t('users.confirm.delete.body').replace('{name}', showDeleteConfirm?.username ?? '')"
      danger
      @close="showDeleteConfirm = null"
      @confirm="doDelete"
    />

    <PasswordRevealDialog
      v-if="revealPayload"
      :open="!!revealPayload"
      :username="revealPayload.username"
      :password="revealPayload.password"
      @close="onRevealClose"
    />
  </section>
</template>

<style scoped>
.users-tab {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
}

.users-tab :deep(cds-grid) {
  display: block;
  width: 100%;
  max-width: 100%;
  min-width: 0;
}

.toolbar {
  display: flex;
  align-items: center;
  /* Per spec, the "新建用户" button sits flush against the table's
     left edge — same as the "新建用户" affordance in the original
     design screenshot. Future toolbar items append to the right. */
  justify-content: flex-start;
  gap: 8px;
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
  justify-content: flex-start;
}

.actions-cell {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  flex-wrap: wrap;
}

.status-badge {
  min-width: 48px;
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

.filter-panel {
  min-width: 240px;
  gap: 8px;
}
</style>