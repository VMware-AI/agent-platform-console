<script setup lang="ts">
/**
 * Read-only "users in this role" dialog. Triggered from the Roles tab when
 * the user clicks the `userCount` cell. Shows username / email / connection
 * status / last login — never the `user.id`.
 */
import { useLocaleStore } from '@/stores/locale'
import type { AccountUser, Role } from '@/api/graphql/types/user-role'
import { CONNECTION_FROM_GQL } from '@/api/graphql/types/user-role'
import '@/components/icons'

defineProps<{
  open: boolean
  role: Role | null
  users: AccountUser[]
}>()

const emit = defineEmits<{
  (e: 'close'): void
}>()

const locale = useLocaleStore()

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

function badgeStatusFor(c: AccountUser['connectionStatus']): 'success' | 'neutral' {
  return c === 'ONLINE' ? 'success' : 'neutral'
}

function close() {
  emit('close')
}

function onBackdropClick(e: MouseEvent) {
  if (e.target === e.currentTarget) close()
}
</script>

<template>
  <Teleport to="body">
    <Transition name="role-users-fade">
      <div
        v-if="open && role"
        class="role-users-backdrop"
        role="dialog"
        aria-modal="true"
        :aria-label="locale.t('users.roleUsers.title').replace('{name}', role.name)"
        @click="onBackdropClick"
      >
        <div class="role-users-card">
          <button
            type="button"
            class="role-users-close-x"
            :aria-label="locale.t('users.roleUsers.close')"
            @click="close"
          >
            <cds-icon shape="times" size="md"></cds-icon>
          </button>

          <h2 cds-text="section" class="role-users-title">
            {{ locale.t('users.roleUsers.title').replace('{name}', role.name) }}
          </h2>

          <div v-if="users.length === 0" class="role-users-empty">
            <cds-icon shape="history" size="xl"></cds-icon>
            <p cds-text="subsection">{{ locale.t('users.roleUsers.empty') }}</p>
          </div>

          <table v-else class="role-users-table" role="table">
            <thead>
              <tr>
                <th>{{ locale.t('users.roleUsers.col.username') }}</th>
                <th>{{ locale.t('users.roleUsers.col.email') }}</th>
                <th>{{ locale.t('users.roleUsers.col.connection') }}</th>
                <th>{{ locale.t('users.roleUsers.col.lastLogin') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="u in users" :key="u.username">
                <td>{{ u.username }}</td>
                <td>{{ u.email }}</td>
                <td>
                  <cds-badge :status="badgeStatusFor(u.connectionStatus)">
                    {{ locale.t(`users.status.${CONNECTION_FROM_GQL[u.connectionStatus]}`) }}
                  </cds-badge>
                </td>
                <td>{{ fmtDateTime(u.lastLoginAt) }}</td>
              </tr>
            </tbody>
          </table>

          <div class="role-users-actions">
            <cds-button type="button" action="outline" @click="close">
              {{ locale.t('users.roleUsers.close') }}
            </cds-button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.role-users-backdrop {
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

.role-users-card {
  position: relative;
  width: min(720px, 100%);
  max-height: min(80vh, 720px);
  background: var(--cds-alias-object-container-background, #ffffff);
  color: var(--cds-alias-object-app-foreground, #1b1b1b);
  border-radius: 12px;
  box-shadow: 0 30px 80px rgba(0, 0, 0, 0.35);
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.role-users-close-x {
  position: absolute;
  top: 12px;
  right: 12px;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: 0;
  color: var(--cds-alias-typography-color-300, #6b6b6b);
  cursor: pointer;
  border-radius: 6px;
}
.role-users-close-x:hover {
  background: var(--cds-alias-object-app-background, #f4f4f4);
  color: var(--cds-alias-object-app-foreground, #1b1b1b);
}
.role-users-close-x :deep(cds-icon) {
  --color: currentColor;
  color: inherit;
}

.role-users-title {
  margin: 0 0 8px;
  font-size: 18px;
}

.role-users-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 48px 16px;
  color: var(--cds-alias-typography-color-300, #565656);
}

.role-users-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

.role-users-table th,
.role-users-table td {
  text-align: left;
  padding: 8px 12px;
  border-bottom: 1px solid var(--cds-alias-object-border-color, #e8e8e8);
}

.role-users-table th {
  background: var(--cds-alias-object-app-background, #fafafa);
  font-weight: 600;
  color: var(--cds-alias-typography-color-300, #565656);
}

.role-users-actions {
  display: flex;
  justify-content: flex-end;
}

.role-users-fade-enter-active,
.role-users-fade-leave-active {
  transition: opacity 0.18s ease;
}
.role-users-fade-enter-from,
.role-users-fade-leave-to {
  opacity: 0;
}
</style>