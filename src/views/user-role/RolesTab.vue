<script setup lang="ts">
/**
 * Roles tab — the "角色与权限" half of `/platform/users`.
 *
 * Read-only by design:
 *  - The backend has no `deleteRole` mutation; built-in roles are always
 *    present and custom roles are managed elsewhere (RBAC matrix UI, out of
 *    scope for this page).
 *  - `userCount` is clickable and opens `<RoleUsersDialog />` to inspect the
 *    users currently bound to a role.
 */
import { computed, ref } from 'vue'
import { useQuery } from '@vue/apollo-composable'
import { useLocaleStore } from '@/stores/locale'
import { ROLES_QUERY, ROLE_USERS_MIN_QUERY } from '@/api/graphql/queries/users'
import { apolloClient } from '@/api/graphql/client'
import { graphqlErrorMessage } from '@/api/graphql/errors'
import { useToast } from '@/composables/useToast'
import type {
  Role,
  RoleUserMin,
  RolesQueryResult,
  UsersMinQueryResult,
} from '@/types/user-role'
import '@/components/icons'

import RoleUsersDialog from './RoleUsersDialog.vue'

const locale = useLocaleStore()
const toast = useToast()

const { result: rolesResult, loading, error } = useQuery<RolesQueryResult>(
  ROLES_QUERY,
  null,
  () => ({ fetchPolicy: 'cache-and-network' }),
)

const roles = computed<Role[]>(() => rolesResult.value?.roles.nodes ?? [])

/* ---------- Dialog state ---------- */
const showUsersFor = ref<Role | null>(null)
const usersUnderRole = ref<RoleUserMin[]>([])
const usersLoading = ref(false)

/** One-shot `apolloClient.query` (not the reactive `useQuery`) so the visible
 *  Roles tab is undisturbed. The query is fired only when the user explicitly
 *  opens the dialog; `loading` is mirrored into a local ref the dialog
 *  consumes so the empty state doesn't flash before the round-trip resolves. */
async function openRoleUsers(role: Role) {
  showUsersFor.value = role
  usersUnderRole.value = []
  usersLoading.value = true
  try {
    const { data } = await apolloClient.query<UsersMinQueryResult, { roleId: string }>({
      query: ROLE_USERS_MIN_QUERY,
      variables: { roleId: role.id },
      fetchPolicy: 'network-only',
    })
    usersUnderRole.value = data.users.nodes
  } catch (err) {
    console.error('[roles] load users under role failed', err)
    toast.error(graphqlErrorMessage(err, locale.t('users.toast.loadRoleUsersFail')))
    usersUnderRole.value = []
  } finally {
    usersLoading.value = false
  }
}

function closeRoleUsers() {
  showUsersFor.value = null
  usersUnderRole.value = []
  usersLoading.value = false
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
      <cds-grid-column :width="'30%'">
        <div class="col-head"><span>{{ locale.t('roles.col.name') }}</span></div>
      </cds-grid-column>
      <cds-grid-column :width="'55%'">
        <div class="col-head"><span>{{ locale.t('roles.col.description') }}</span></div>
      </cds-grid-column>
      <cds-grid-column :width="'15%'">
        <div class="col-head"><span>{{ locale.t('roles.col.userCount') }}</span></div>
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
      :loading="usersLoading"
      @close="closeRoleUsers"
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
