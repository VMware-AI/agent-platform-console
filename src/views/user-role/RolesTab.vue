<script setup lang="ts">
/**
 * Roles tab — the "角色与权限" half of `/platform/users`.
 *
 * Per spec: no permission matrix, no create / edit role. Just the 3
 * predefined roles with their `userCount` (which becomes a clickable
 * link that opens `<RoleUsersDialog />`).
 *
 * The 删除角色 button is permanently disabled for `builtIn: true` roles
 * (which is all 3 of them).
 */
import { computed, ref } from 'vue'
import { useMutation, useQuery } from '@vue/apollo-composable'
import { useLocaleStore } from '@/stores/locale'
import { useToast } from '@/composables/useToast'
import { graphqlErrorMessage } from '@/api/graphql/errors'
import {
  ROLES_QUERY,
  USERS_BY_ROLE_QUERY,
  DELETE_USER_MUTATION,
} from '@/api/graphql/queries/users'
import type {
  AccountUser,
  Role,
  RolesQueryResult,
  UsersQueryResult,
} from '@/types/user-role'
import '@/components/icons'

import RoleUsersDialog from './RoleUsersDialog.vue'
import ConfirmDialog from './ConfirmDialog.vue'

const locale = useLocaleStore()
const toast = useToast()

const { result: rolesResult, loading, error, refetch: refetchRoles } =
  useQuery<RolesQueryResult>(ROLES_QUERY, null, () => ({ fetchPolicy: 'cache-and-network' }))

const roles = computed<Role[]>(() => rolesResult.value?.roles.nodes ?? [])

/* ---------- Dialog state ---------- */
const showUsersFor = ref<Role | null>(null)
const usersUnderRole = ref<AccountUser[]>([])
const showDeleteConfirm = ref<Role | null>(null)

/** Pull the user list under a given role directly — `users(filter:{roleId})`
 *  is a one-shot query, not the global users query (which is paginated). */
const usersByRoleQuery = useQuery<UsersQueryResult, { roleId: string }>(
  USERS_BY_ROLE_QUERY,
  () => ({ roleId: showUsersFor.value?.id ?? '' }),
  () => ({ enabled: false, fetchPolicy: 'network-only' }),
)

async function openRoleUsers(role: Role) {
  showUsersFor.value = role
  usersUnderRole.value = []
  try {
    const r = await usersByRoleQuery.refetch({ roleId: role.id })
    usersUnderRole.value = r?.data?.users.nodes ?? []
  } catch (err) {
     
    console.error('[roles] load users under role failed', err)
    usersUnderRole.value = []
  }
}

function closeRoleUsers() {
  showUsersFor.value = null
  usersUnderRole.value = []
}

const { mutate: deleteMutate } = useMutation<{ deleteUser: { id: string } }>(
  DELETE_USER_MUTATION,
)

function openDelete(role: Role) {
  showDeleteConfirm.value = role
}

async function doDelete() {
  const target = showDeleteConfirm.value
  if (!target) return
  showDeleteConfirm.value = null
  try {
    await deleteMutate({ id: target.id })
    toast.success(locale.t('roles.toast.deleteOk').replace('{name}', target.name))
    refetchRoles()
  } catch (err) {
     
    console.error('[roles] delete role failed', err)
    toast.error(graphqlErrorMessage(err, locale.t('roles.toast.deleteFail')))
  }
}
</script>

<template>
  <section class="roles-tab">
    <cds-alert v-if="error" status="danger" closable>
      {{ locale.t('roles.error') }}
    </cds-alert>

    <cds-grid
      :border="'row'"
      :column-layout="'flex'"
      role="grid"
      aria-label="roles"
    >
      <cds-grid-column :width="'24%'">
        <div class="col-head"><span>{{ locale.t('roles.col.name') }}</span></div>
      </cds-grid-column>
      <cds-grid-column :width="'52%'">
        <div class="col-head"><span>{{ locale.t('roles.col.description') }}</span></div>
      </cds-grid-column>
      <cds-grid-column :width="'12%'">
        <div class="col-head"><span>{{ locale.t('roles.col.userCount') }}</span></div>
      </cds-grid-column>
      <cds-grid-column :width="'12%'">
        <div class="col-head col-actions">
          <span>{{ locale.t('roles.col.actions') }}</span>
        </div>
      </cds-grid-column>

      <cds-grid-row v-for="r in roles" :key="r.id">
        <cds-grid-cell>{{ r.name }}</cds-grid-cell>
        <cds-grid-cell class="muted">{{ r.description }}</cds-grid-cell>
        <cds-grid-cell>
          <button
            type="button"
            class="user-count-link"
            :title="locale.t('roles.col.userCount')"
            @click="openRoleUsers(r)"
          >
            {{ r.userCount }}
          </button>
        </cds-grid-cell>
        <cds-grid-cell>
          <cds-button-action
            shape="trash"
            :disabled="r.builtIn"
            :title="r.builtIn ? locale.t('roles.action.deleteDisabledHint') : locale.t('roles.action.delete')"
            :aria-label="r.builtIn ? locale.t('roles.action.deleteDisabledHint') : locale.t('roles.action.delete')"
            @click="openDelete(r)"
          ></cds-button-action>
        </cds-grid-cell>
      </cds-grid-row>

      <cds-grid-placeholder v-if="loading && roles.length === 0">
        <cds-progress-circle size="xl" status="info"></cds-progress-circle>
        <p cds-text="subsection">{{ locale.t('roles.loading') }}</p>
      </cds-grid-placeholder>

      <cds-grid-placeholder v-else-if="roles.length === 0">
        <cds-icon shape="history" size="xl"></cds-icon>
        <p cds-text="subsection">{{ locale.t('roles.empty') }}</p>
      </cds-grid-placeholder>
    </cds-grid>

    <RoleUsersDialog
      :open="!!showUsersFor"
      :role="showUsersFor"
      :users="usersUnderRole"
      @close="closeRoleUsers"
    />

    <ConfirmDialog
      :open="!!showDeleteConfirm"
      :title="locale.t('roles.confirm.delete.title')"
      :body="locale.t('roles.confirm.delete.body').replace('{name}', showDeleteConfirm?.name ?? '')"
      danger
      @close="showDeleteConfirm = null"
      @confirm="doDelete"
    />
  </section>
</template>

<style scoped>
.roles-tab {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
}

.roles-tab :deep(cds-grid) {
  display: block;
  width: 100%;
  max-width: 100%;
  min-width: 0;
}

.col-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  width: 100%;
}

.col-head.col-actions {
  justify-content: flex-end;
}

.muted {
  color: var(--cds-alias-typography-color-300, #565656);
}

.user-count-link {
  appearance: none;
  background: transparent;
  border: 0;
  padding: 0;
  font: inherit;
  color: var(--cds-alias-status-info, #0079ad);
  cursor: pointer;
  text-decoration: none;
}
.user-count-link:hover {
  text-decoration: underline;
}
.user-count-link:focus-visible {
  outline: 2px solid var(--cds-alias-status-info, #0079ad);
  outline-offset: 2px;
  border-radius: 2px;
}
</style>