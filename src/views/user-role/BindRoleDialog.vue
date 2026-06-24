<script setup lang="ts">
/**
 * Bind users to a role dialog.
 *
 * UX: pick a role from the dropdown, then check every user that should
 * belong to it. Submit calls `assignUsersToRole`. The original trigger
 * (which row this dialog was opened for) is `props.user` — used only as
 * the default selection in the role dropdown if the user has a current
 * role.
 */
import { computed, ref, watch } from 'vue'
import { useMutation } from '@vue/apollo-composable'
import { useLocaleStore } from '@/stores/locale'
import { useToast } from '@/composables/useToast'
import { ASSIGN_USERS_TO_ROLE_MUTATION } from '@/api/graphql/queries/users'
import type {
  AccountUser,
  Role,
  AssignUsersToRolePayload,
} from '@/api/graphql/types'
import '@/components/icons'

const props = defineProps<{
  open: boolean
  /** Optional — the row that opened the dialog (used for default role). */
  user?: AccountUser | null
  roles: Role[]
  allUsers: AccountUser[]
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'assigned', payload: AssignUsersToRolePayload): void
}>()

const locale = useLocaleStore()
const toast = useToast()

const selectedRoleId = ref<string>('')
const selectedUserIds = ref<Set<string>>(new Set())

watch(
  () => props.open,
  (o) => {
    if (o) {
      selectedRoleId.value = props.user?.role.id ?? props.roles[0]?.id ?? ''
      // Pre-check the row's user (so the common case "move this user to a
      // different role" is one extra click).
      selectedUserIds.value = new Set(props.user ? [props.user.id] : [])
    }
  },
  { immediate: true },
)

function toggleUser(id: string) {
  const s = new Set(selectedUserIds.value)
  if (s.has(id)) s.delete(id)
  else s.add(id)
  selectedUserIds.value = s
}

const submitDisabled = computed(
  () => selectedUserIds.value.size === 0 || !selectedRoleId.value,
)

const { mutate: assignUsers, loading: submitting } = useMutation<{
  assignUsersToRole: AssignUsersToRolePayload
}>(ASSIGN_USERS_TO_ROLE_MUTATION)

async function onSubmit() {
  if (submitDisabled.value) {
    toast.error(locale.t('users.bind.empty'))
    return
  }
  try {
    const res = await assignUsers({
      input: {
        roleId: selectedRoleId.value,
        userIds: [...selectedUserIds.value],
      },
    })
    const payload = res?.data?.assignUsersToRole
    if (!payload) throw new Error('no payload')
    emit('assigned', payload)
    toast.success(
      locale.t('users.toast.bindOk').replace('{count}', String(payload.assignedCount)),
    )
  } catch (err) {
     
    console.error('[users] assignUsersToRole failed', err)
    toast.error(locale.t('users.toast.bindFail'))
  }
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
    <Transition name="bind-fade">
      <div
        v-if="open"
        class="bind-backdrop"
        role="dialog"
        aria-modal="true"
        :aria-label="locale.t('users.bind.title')"
        @click="onBackdropClick"
      >
        <div class="bind-card" @click.stop>
          <h2 cds-text="section" class="bind-title">
            {{ locale.t('users.bind.title') }}
          </h2>

          <label class="bind-field">
            <span class="bind-label">{{ locale.t('users.bind.role') }}</span>
            <cds-select control-width="shrink">
              <select
                :value="selectedRoleId"
                @change="(e: Event) => selectedRoleId = (e.target as HTMLSelectElement).value"
              >
                <option v-for="r in roles" :key="r.id" :value="r.id">
                  {{ r.name }}
                </option>
              </select>
            </cds-select>
          </label>

          <div class="bind-field">
            <span class="bind-label">{{ locale.t('users.bind.users') }}</span>
            <div class="bind-user-list">
              <label v-for="u in allUsers" :key="u.id" class="bind-user-row">
                <input
                  type="checkbox"
                  class="app-checkbox"
                  :checked="selectedUserIds.has(u.id)"
                  @change="toggleUser(u.id)"
                />
                <span>{{ u.username }}</span>
                <small class="muted">{{ u.email }}</small>
              </label>
            </div>
            <small v-if="selectedUserIds.size === 0" class="bind-empty">
              {{ locale.t('users.bind.empty') }}
            </small>
          </div>

          <div class="bind-actions">
            <cds-button type="button" action="outline" @click="close">
              {{ locale.t('users.bind.cancel') }}
            </cds-button>
            <cds-button
              type="button"
              action="solid"
              status="primary"
              :disabled="submitDisabled"
              :loading-state="submitting ? 'loading' : 'default'"
              @click="onSubmit"
            >
              {{ locale.t('users.bind.submit') }}
            </cds-button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.bind-backdrop {
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

.bind-card {
  width: min(560px, 100%);
  max-height: min(90vh, 720px);
  display: flex;
  flex-direction: column;
  background: var(--cds-alias-object-container-background, #ffffff);
  color: var(--cds-alias-object-app-foreground, #1b1b1b);
  border-radius: 12px;
  box-shadow: 0 30px 80px rgba(0, 0, 0, 0.35);
  padding: 24px;
  gap: 16px;
}

.bind-title {
  margin: 0;
  font-size: 18px;
}

.bind-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.bind-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--cds-alias-typography-color-300, #565656);
}

.bind-user-list {
  border: 1px solid var(--cds-alias-object-border-color, #e8e8e8);
  border-radius: 6px;
  max-height: 320px;
  overflow: auto;
}

.bind-user-row {
  display: grid;
  grid-template-columns: 16px 1fr auto;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  font-size: 13px;
  cursor: pointer;
  border-bottom: 1px solid var(--cds-alias-object-border-color, #e8e8e8);
}
.bind-user-row:last-child {
  border-bottom: 0;
}
.bind-user-row:hover {
  background: var(--cds-alias-object-app-background, #fafafa);
}

.bind-empty {
  color: var(--cds-alias-status-warning, #ffa600);
  font-size: 12px;
}

.bind-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.muted {
  color: var(--cds-alias-typography-color-300, #565656);
}

.bind-fade-enter-active,
.bind-fade-leave-active {
  transition: opacity 0.18s ease;
}
.bind-fade-enter-from,
.bind-fade-leave-to {
  opacity: 0;
}
</style>