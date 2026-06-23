<script setup lang="ts">
/**
 * Create-only user form dialog. Per spec the row-level "编辑" button is
 * removed, so this dialog only handles the create flow.
 *
 * Implementation note: this dialog now uses Clarity's native components
 * directly — `cds-modal` for the panel chrome, `cds-input` for text fields,
 * and `cds-select` for the role dropdown — following the official
 * https://core.clarity.design/core-components/modal / input / select
 * examples. The earlier "native <input class='app-input'>" fallback was
 * a workaround that the user has now asked us to retire.
 *
 * Dedupe is double-checked:
 *  1. While typing, debounce 300 ms and query `userExists(username/email)` —
 *     a small inline hint appears under the field.
 *  2. On submit, the resolver does the same check authoritatively and
 *     throws `GraphQLError('USERNAME_TAKEN' | 'EMAIL_TAKEN')` if a race
 *     condition slipped past the front-end.
 *
 * Password section:
 *  - `radio auto | custom` (default auto)
 *  - in `auto` mode the password is server-generated and surfaced via the
 *    `<PasswordRevealDialog>` opened by the parent
 *  - in `custom` mode a cds-password input is shown with live complexity
 *    feedback; submit is disabled until the rules pass.
 */
import { computed, ref, watch } from 'vue'
import { useMutation } from '@vue/apollo-composable'
import { useLocaleStore } from '@/stores/locale'
import { useToast } from '@/composables/useToast'
import {
  CREATE_USER_MUTATION,
  USER_EXISTS_QUERY,
} from '@/api/graphql/queries/users'
import type { Role, CreateUserInput, CreateUserPayload } from '@/api/graphql/types'
import { passwordMeets } from '@/composables/usePasswordComplexity'
import '@/components/icons'

const props = defineProps<{
  open: boolean
  roles: Role[]
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (
    e: 'submitted',
    payload: { user: CreateUserPayload['user']; generatedPassword: string | null },
  ): void
}>()

const locale = useLocaleStore()
const toast = useToast()

/* ---------- form state ---------- */
const username = ref('')
const displayName = ref('')
const email = ref('')
const roleId = ref<string>('')
const enabled = ref(true)
/* Per spec the user must always supply their own password — there is no
   "auto-generate" path on the create form. */
const customPassword = ref('')
const confirmPassword = ref('')

/* The parent (`UsersTab.vue`) now gates this dialog with `v-if="showCreate"`,
   so the component only mounts when it should be visible. cds-modal
   initializes its inherited `hidden` to `false` on first connect and the
   close button emits `closeChange`, so we just forward it. */

/* dedupe + validation flags */
const usernameTaken = ref(false)
const emailTaken = ref(false)
const checkingUsername = ref(false)
const checkingEmail = ref(false)
let usernameTimer: number | null = null
let emailTimer: number | null = null

/* ---------- reset on open ----------
   The parent mounts this component only when `open` is already true
   (see UsersTab.vue `v-if="showCreate"`), so the reset block fires once
   on mount via `immediate: true`. We do not need to imperatively set
   any JS property on cds-modal — its internal `hidden` state initializes
   to `false` on first connect, and the close button emits `closeChange`
   which we forward to the parent. */
const modalRef = ref<HTMLElement | null>(null)

watch(
  () => props.open,
  (o) => {
    if (!o) return
    username.value = ''
    displayName.value = ''
    email.value = ''
    roleId.value = props.roles[0]?.id ?? ''
    enabled.value = true
    customPassword.value = ''
    confirmPassword.value = ''
    usernameTaken.value = false
    emailTaken.value = false
    checkingUsername.value = false
    checkingEmail.value = false
  },
  { immediate: true },
)

/* ---------- dedupe with debounce ---------- */
function scheduleUsernameCheck() {
  if (usernameTimer !== null) window.clearTimeout(usernameTimer)
  checkingUsername.value = true
  usernameTimer = window.setTimeout(async () => {
    if (!username.value.trim()) {
      usernameTaken.value = false
      checkingUsername.value = false
      return
    }
    try {
      const { apolloClient } = await import('@/api/graphql/client')
      const r = await apolloClient.query({
        query: USER_EXISTS_QUERY,
        variables: { username: username.value.trim(), email: null },
        fetchPolicy: 'network-only',
      })
      usernameTaken.value = !!r.data?.userExists
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[users] username dedupe check failed', err)
    } finally {
      checkingUsername.value = false
    }
  }, 300)
}

function scheduleEmailCheck() {
  if (emailTimer !== null) window.clearTimeout(emailTimer)
  checkingEmail.value = true
  emailTimer = window.setTimeout(async () => {
    if (!email.value.trim()) {
      emailTaken.value = false
      checkingEmail.value = false
      return
    }
    try {
      const { apolloClient } = await import('@/api/graphql/client')
      const r = await apolloClient.query({
        query: USER_EXISTS_QUERY,
        variables: { username: null, email: email.value.trim() },
        fetchPolicy: 'network-only',
      })
      emailTaken.value = !!r.data?.userExists
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[users] email dedupe check failed', err)
    } finally {
      checkingEmail.value = false
    }
  }, 300)
}

/* ---------- complexity + match ---------- */
const complexity = computed(() => passwordMeets(customPassword.value))
const passwordsMatch = computed(
  () => customPassword.value === confirmPassword.value,
)

/* ---------- overall form validity ---------- */
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const formValid = computed(() => {
  if (!username.value.trim()) return false
  if (!displayName.value.trim()) return false
  if (!emailRegex.test(email.value.trim())) return false
  if (!roleId.value) return false
  if (usernameTaken.value || emailTaken.value) return false
  if (!complexity.value.ok) return false
  if (!passwordsMatch.value) return false
  return true
})

/* ---------- submit ---------- */
const { mutate: createUser, loading: submitting } = useMutation<{
  createUser: CreateUserPayload
}>(CREATE_USER_MUTATION)

async function onSubmit() {
  if (!formValid.value) return
  const input: CreateUserInput = {
    username: username.value.trim(),
    displayName: displayName.value.trim(),
    email: email.value.trim(),
    roleId: roleId.value,
    passwordMode: 'CUSTOM',
    enabled: enabled.value,
    customPassword: customPassword.value,
  }
  try {
    const res = await createUser({ input })
    const payload = res?.data?.createUser
    if (!payload) throw new Error('no payload')
    emit('submitted', {
      user: payload.user,
      generatedPassword: payload.generatedPassword,
    })
    toast.success(
      locale.t('users.toast.createOk').replace('{name}', payload.user.username),
    )
  } catch (err: unknown) {
    const code =
      (err as { graphQLErrors?: Array<{ extensions?: { code?: string } }> })
        ?.graphQLErrors?.[0]?.extensions?.code ?? ''
    if (code === 'USERNAME_TAKEN') {
      usernameTaken.value = true
      toast.error(locale.t('users.toast.duplicateUsername'))
    } else if (code === 'EMAIL_TAKEN') {
      emailTaken.value = true
      toast.error(locale.t('users.toast.duplicateEmail'))
    } else {
      toast.error(locale.t('users.toast.createFail'))
    }
  }
}

function close() {
  emit('close')
}
</script>

<template>
  <!-- cds-modal is a Lit web component; we let it manage its own visibility
       since this component is mounted only while open (see `v-if` in the
       parent and the `watch(immediate: true)` reset block). -->
  <cds-modal
    closable
    size="md"
    @closeChange="close"
  >
    <cds-modal-header>
      <h3 cds-text="title">{{ locale.t('users.form.title.create') }}</h3>
    </cds-modal-header>

    <cds-modal-content>
      <form class="user-form" @submit.prevent="onSubmit">
        <!-- username -->
        <cds-control>
          <cds-input>
            <label>{{ locale.t('users.form.username') }}</label>
            <input
              slot="input"
              type="text"
              :value="username"
              :aria-invalid="usernameTaken"
              @input="(e: Event) => { username = (e.target as HTMLInputElement).value; scheduleUsernameCheck() }"
            />
            <cds-control-message
              v-if="checkingUsername"
              status="info"
            >{{ locale.t('users.form.username.checking') }}</cds-control-message>
            <cds-control-message
              v-else-if="usernameTaken"
              status="error"
            >{{ locale.t('users.form.username.taken') }}</cds-control-message>
          </cds-input>
        </cds-control>

        <!-- displayName -->
        <cds-control>
          <cds-input>
            <label>{{ locale.t('users.form.displayName') }}</label>
            <input
              slot="input"
              type="text"
              :value="displayName"
              @input="(e: Event) => displayName = (e.target as HTMLInputElement).value"
            />
          </cds-input>
        </cds-control>

        <!-- email -->
        <cds-control>
          <cds-input>
            <label>{{ locale.t('users.form.email') }}</label>
            <input
              slot="input"
              type="email"
              :value="email"
              :aria-invalid="emailTaken"
              @input="(e: Event) => { email = (e.target as HTMLInputElement).value; scheduleEmailCheck() }"
            />
            <cds-control-message
              v-if="checkingEmail"
              status="info"
            >{{ locale.t('users.form.email.checking') }}</cds-control-message>
            <cds-control-message
              v-else-if="emailTaken"
              status="error"
            >{{ locale.t('users.form.email.taken') }}</cds-control-message>
          </cds-input>
        </cds-control>

        <!-- role -->
        <cds-control>
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

        <!-- password: always custom — no toggle, no auto-generate path. -->
        <cds-control>
          <cds-password>
            <label>{{ locale.t('users.form.customPassword') }}</label>
            <input
              slot="input"
              type="password"
              :value="customPassword"
              @input="(e: Event) => customPassword = (e.target as HTMLInputElement).value"
            />
            <ul v-if="complexity.reasons.length > 0" class="user-form-error-list">
              <li v-for="r in complexity.reasons" :key="r">{{ r }}</li>
            </ul>
            <cds-control-message
              v-else-if="customPassword.length > 0"
              status="success"
            >✓ {{ locale.t('users.form.passwordHint').slice(0, 8) }}</cds-control-message>
          </cds-password>
        </cds-control>

        <!-- complexity rule hint, sits directly under the password input -->
        <div class="user-form-hint muted">
          {{ locale.t('users.form.passwordHint') }}
        </div>

        <cds-control>
          <cds-password>
            <label>{{ locale.t('users.form.confirmPassword') }}</label>
            <input
              slot="input"
              type="password"
              :value="confirmPassword"
              @input="(e: Event) => confirmPassword = (e.target as HTMLInputElement).value"
            />
            <cds-control-message
              v-if="customPassword.length > 0 && !passwordsMatch"
              status="error"
            >{{ locale.t('users.form.passwordMismatch') }}</cds-control-message>
          </cds-password>
        </cds-control>

        <!-- enabled toggle at the bottom of the form, defaults to on -->
        <cds-control>
          <cds-toggle>
            <label>{{ locale.t('users.form.enabled') }}</label>
            <input
              type="checkbox"
              slot="input"
              :checked="enabled"
              @change="(e: Event) => enabled = (e.target as HTMLInputElement).checked"
            />
          </cds-toggle>
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
        {{ locale.t('users.form.submit') }}
      </cds-button>
    </cds-modal-actions>
  </cds-modal>
</template>

<style scoped>
.user-form {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.user-form-hint {
  font-size: 12px;
  color: var(--cds-alias-typography-color-300, #565656);
}

.user-form-error-list {
  margin: 4px 0 0;
  padding-left: 16px;
  font-size: 12px;
  color: var(--cds-alias-status-danger, #c21d00);
}

/* The cds-modal renders into a top-level overlay (Teleport-like). Pull the
   host out of the scoped tree by targeting it via :deep — the cds-modal
   internals (backdrop + card) live in light DOM but the host is
   teleported to <body> so deep selectors are required. */
:deep(cds-modal) {
  --width: 560px;
}
</style>