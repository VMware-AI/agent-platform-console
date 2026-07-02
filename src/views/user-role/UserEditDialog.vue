<script setup lang="ts">
/**
 * Change-role dialog (opened from the "更换角色" row action). Mirrors the
 * backend `updateUser` mutation but is intentionally narrower than
 * `UserFormDialog` — only the role can be changed here. Username,
 * displayName, email, enabled state, and password are managed elsewhere
 * (see `UserFormDialog` for create, and the row-level 重置密码 / 启禁用
 * actions for password / enabled).
 *
 * Submit calls `updateUser` with a partial input containing only `roleId`
 * when the value actually changed.
 */
import { computed, ref, watch } from 'vue'
import { useMutation } from '@vue/apollo-composable'
import { useLocaleStore } from '@/stores/locale'
import { useToast } from '@/composables/useToast'
import { graphqlErrorMessage } from '@/api/graphql/errors'
import { UPDATE_USER_MUTATION } from '@/api/graphql/queries/users'
import type {
  AccountUser,
  Role,
  UpdateUserInput,
} from '@/types/user-role'
import '@/components/icons'

const props = defineProps<{
  open: boolean
  user: AccountUser | null
  roles: Role[]
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'submitted', updated: AccountUser): void
}>()

const locale = useLocaleStore()
const toast = useToast()

/* ---------- form state ---------- */
const roleId = ref<string>('')

/* Tracks whether the user has attempted to submit at least once so we don't
   show "field required" errors on initial open. */
const attempted = ref(false)

/* ---------- reset on open ----------
   The dialog is mounted with `v-if="user"` so `props.user` is always non-null
   when mounted; `watch(immediate: true)` seeds the form from the row. */
watch(
  () => [props.open, props.user] as const,
  ([open, u]) => {
    if (!open || !u) return
    roleId.value = u.role.id
    attempted.value = false
  },
  { immediate: true },
)

/* ---------- per-field validity ---------- */
const roleValid = computed(() => roleId.value.length > 0)

const formValid = computed(() => roleValid.value)

/* ---------- change detection ----------
   Only send fields the user actually changed — `UpdateUserInput` is partial,
   so omitting a field tells the backend to leave it alone. */
function buildInput(): UpdateUserInput {
  const u = props.user
  if (!u) return {}
  const input: UpdateUserInput = {}
  if (roleId.value !== u.role.id) {
    input.roleId = roleId.value
  }
  return input
}

/* ---------- submit ---------- */
const { mutate: updateUser, loading: submitting } = useMutation<{
  updateUser: AccountUser
}>(UPDATE_USER_MUTATION)

async function onSubmit() {
  attempted.value = true
  if (!formValid.value || !props.user) return
  const input = buildInput()
  // If nothing changed, treat as a no-op (close silently, no toast).
  if (Object.keys(input).length === 0) {
    emit('close')
    return
  }
  try {
    const res = await updateUser({ id: props.user.id, input })
    const updated = res?.data?.updateUser
    if (!updated) throw new Error('no payload')
    emit('submitted', updated)
    toast.success(
      locale.t('users.toast.updateOk').replace('{name}', updated.username),
    )
  } catch (err: unknown) {
    toast.error(graphqlErrorMessage(err, locale.t('users.toast.updateFail')))
  }
}

function close() {
  emit('close')
}
</script>

<template>
  <cds-modal
    closable
    size="md"
    :hidden="!open"
    @closeChange="close"
  >
    <cds-modal-header>
      <h3 cds-text="title">{{ locale.t('users.form.title.changeRole') }}</h3>
    </cds-modal-header>

    <cds-modal-content>
      <form
        class="user-form"
        cds-layout="vertical align:stretch gap:md"
        @submit.prevent="onSubmit"
      >
        <!-- role -->
        <cds-control :status="attempted && !roleValid ? 'error' : 'neutral'">
          <cds-select>
            <label>{{ locale.t('users.form.role') }}</label>
            <select
              :value="roleId"
              @change="(e: Event) => roleId = (e.target as HTMLSelectElement).value"
            >
              <option v-for="r in roles" :key="r.id" :value="r.id">
                {{ r.name }}
              </option>
            </select>
          </cds-select>
        </cds-control>
      </form>
    </cds-modal-content>

    <cds-modal-actions>
      <cds-button action="outline" @click="close">
        {{ locale.t('users.form.cancel') }}
      </cds-button>
      <cds-button
        type="submit"
        action="solid"
        status="primary"
        :disabled="!formValid || submitting"
        :loading-state="submitting ? 'loading' : 'default'"
        @click="onSubmit"
      >
        {{ locale.t('users.form.submitEdit') }}
      </cds-button>
    </cds-modal-actions>
  </cds-modal>
</template>

<style scoped>
.user-form {
  max-width: 70%;
  margin-left: 0;
  margin-right: auto;
}

:deep(cds-modal) {
  --width: 560px;
}
</style>