<script setup lang="ts">
/**
 * Create-only user form dialog. Mirrors the backend `CreateUser` mutation:
 *  - Required: username, displayName, email, roleId, passwordMode
 *  - passwordMode is a radio (auto | custom); when auto, the backend generates
 *    a temp password which is surfaced via the <PasswordRevealDialog> opened
 *    by the parent on success.
 *
 * Implementation notes:
 *  - Uses Clarity's native components directly — `cds-modal` for the panel
 *    chrome, `cds-input` for text fields, `cds-select` for the role dropdown,
 *    `cds-radio` for the password mode toggle — following the official
 *    https://core.clarity.design/core-components/* examples.
 *
 *  - Dedupe is double-checked:
 *     1. While typing, debounce 300 ms and query `userExists(username/email)`
 *        — a small inline hint appears under the field.
 *     2. On submit, the resolver does the same check authoritatively and
 *        throws `GraphQLError('USERNAME_TAKEN' | 'EMAIL_TAKEN')` if a race
 *        condition slipped past the front-end.
 *
 *  - Password section:
 *     - `radio auto | custom` (default custom)
 *     - in `auto` mode the password is server-generated and surfaced via
 *       `<PasswordRevealDialog>` opened by the parent
 *     - in `custom` mode a cds-password input is shown with live complexity
 *       feedback; submit is disabled until the rules pass.
 */
import { computed, ref, watch } from 'vue'
import { useMutation } from '@vue/apollo-composable'
import { useLocaleStore } from '@/stores/locale'
import { useToast } from '@/composables/useToast'
import { graphqlErrorMessage } from '@/api/graphql/errors'
import {
  CREATE_USER_MUTATION,
  USER_EXISTS_QUERY,
} from '@/api/graphql/queries/users'
import type { Role, CreateUserInput, CreateUserPayload, PasswordMode } from '@/types/user-role'
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
const passwordMode = ref<PasswordMode>('CUSTOM')
const customPassword = ref('')
const confirmPassword = ref('')

/* dedupe + validation flags */
const usernameTaken = ref(false)
const emailTaken = ref(false)
const checkingUsername = ref(false)
const checkingEmail = ref(false)
let usernameTimer: number | null = null
let emailTimer: number | null = null

/* ---------- reset on open ---------- */
watch(
  () => props.open,
  (o) => {
    if (!o) return
    username.value = ''
    displayName.value = ''
    email.value = ''
    roleId.value = props.roles[0]?.id ?? ''
    enabled.value = true
    passwordMode.value = 'CUSTOM'
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
      console.warn('[users] email dedupe check failed', err)
    } finally {
      checkingEmail.value = false
    }
  }, 300)
}

/* ---------- complexity + match ----------
   Only computed / consulted in CUSTOM mode. */
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
  if (passwordMode.value === 'CUSTOM') {
    if (!complexity.value.ok) return false
    if (!passwordsMatch.value) return false
  }
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
    passwordMode: passwordMode.value,
    customPassword: passwordMode.value === 'CUSTOM' ? customPassword.value : null,
    enabled: enabled.value,
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
      toast.error(graphqlErrorMessage(err, locale.t('users.toast.createFail')))
    }
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
    @closeChange="close"
  >
    <cds-modal-header>
      <h3 cds-text="title">{{ locale.t('users.form.title.create') }}</h3>
    </cds-modal-header>

    <cds-modal-content>
      <form class="user-form" cds-layout="vertical align:stretch gap:md" @submit.prevent="onSubmit">
        <!-- username -->
        <cds-control>
          <cds-input>
            <label>
              {{ locale.t('users.form.username') }}<sup class="required-mark" aria-hidden="true">{{ locale.t('users.form.requiredMark') }}</sup>
            </label>
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

        <!-- displayName (required by the backend CreateUser schema) -->
        <cds-control>
          <cds-input>
            <label>
              {{ locale.t('users.form.displayName') }}<sup class="required-mark" aria-hidden="true">{{ locale.t('users.form.requiredMark') }}</sup>
            </label>
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
            <label>
              {{ locale.t('users.form.email') }}<sup class="required-mark" aria-hidden="true">{{ locale.t('users.form.requiredMark') }}</sup>
            </label>
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
            <label>
              {{ locale.t('users.form.role') }}<sup class="required-mark" aria-hidden="true">{{ locale.t('users.form.requiredMark') }}</sup>
            </label>
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

        <!-- password mode: auto | custom.
             Native <input type="radio"> instead of <cds-radio-group>/<cds-radio>:
             the Clarity web-component radios render an empty shell inside
             <cds-modal>'s slot because their internal design tokens don't
             reach the modal's teleport target. Native radios keep the same
             behavior and styling via Clarity's design-token CSS variables.
             Layout: the label is slotted into cds-input's own label slot so it
             shares the same horizontal start position as the other field
             labels ("密码", "确认密码"). The two options sit inline to the
             right of the label, separated by a vertical divider. -->
        <div class="pwd-mode">
          <div class="pwd-mode-label">{{ locale.t('users.form.passwordMode.label') }}</div>
          <div class="pwd-mode-options">
            <label class="pwd-mode-option">
              <input
                type="radio"
                name="password-mode"
                value="CUSTOM"
                :checked="passwordMode === 'CUSTOM'"
                @change="passwordMode = 'CUSTOM'"
              />
              <span>{{ locale.t('users.form.passwordMode.custom') }}</span>
            </label>
            <span class="pwd-mode-divider" aria-hidden="true"></span>
            <label class="pwd-mode-option">
              <input
                type="radio"
                name="password-mode"
                value="AUTO"
                :checked="passwordMode === 'AUTO'"
                @change="passwordMode = 'AUTO'"
              />
              <span>{{ locale.t('users.form.passwordMode.auto') }}</span>
            </label>
          </div>
          <p v-if="passwordMode === 'AUTO'" class="user-form-hint muted pwd-mode-hint">
            {{ locale.t('users.form.passwordMode.autoHint') }}
          </p>
        </div>

        <!-- password fields (CUSTOM only) -->
        <template v-if="passwordMode === 'CUSTOM'">
          <cds-control>
            <cds-password>
              <label>
                {{ locale.t('users.form.customPassword') }}<sup class="required-mark" aria-hidden="true">{{ locale.t('users.form.requiredMark') }}</sup>
              </label>
              <input
                slot="input"
                type="password"
                :value="customPassword"
                @input="(e: Event) => customPassword = (e.target as HTMLInputElement).value"
              />
            </cds-password>
          </cds-control>

          <div class="user-form-hint muted">
            {{ locale.t('users.form.passwordHint') }}
          </div>
          <div
            v-if="customPassword.length > 0 && complexity.reasons.length > 0"
            class="user-form-error"
            data-testid="password-complexity-errors"
          >{{ complexity.reasons.join('，') }}</div>

          <cds-control>
            <cds-password>
              <label>
                {{ locale.t('users.form.confirmPassword') }}<sup class="required-mark" aria-hidden="true">{{ locale.t('users.form.requiredMark') }}</sup>
              </label>
              <input
                slot="input"
                type="password"
                :value="confirmPassword"
                @input="(e: Event) => confirmPassword = (e.target as HTMLInputElement).value"
              />
            </cds-password>
          </cds-control>
          <div
            v-if="confirmPassword.length > 0 && !passwordsMatch"
            class="user-form-error"
            data-testid="password-mismatch-error"
          >{{ locale.t('users.form.passwordMismatch') }}</div>
        </template>

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
  max-width: 70%;
  margin-left: 0;
  margin-right: auto;
}

.user-form-hint,
.user-form-error {
  padding-left: 74px;
}

.user-form-hint {
  font-size: 12px;
  color: var(--cds-alias-typography-color-300, #565656);
  margin-top: -8px;
}

.user-form-error {
  font-size: 12px;
  color: var(--cds-alias-status-danger, #c21d00);
  margin: 2px 0 0;
}

/* Required-field marker: a red asterisk hugging the top-right of the
   preceding label text. Rendered as <sup> so the browser does the
   baseline-shift for us, but we additionally pull it above the cap-line
   with negative top margin and zero out <sup>'s default whitespace below
   the baseline so it floats at the very top. */
.required-mark {
  color: var(--cds-alias-status-danger, #c21d00);
  font-size: 0.7em;
  font-weight: 700;
  line-height: 1;
  /* Lift above the cap-line: -0.2em clears top-gap padding, -0.3em
     additional pull adds the "upper-right corner" appearance. */
  margin: -0.5em 0 0 1px;
  display: inline-block;
}

/* Password-mode row: a custom <div> grid that emulates the layout Clarity
   uses inside cds-input (label column on the left, control on the right).
   The label is a plain <div> with the same font-size / weight / muted color
   as cds-input's internal label, padded to the same left offset so the
   label's start position aligns with "密码" / "确认密码". Replaces
   <cds-radio-group>/<cds-radio>, which renders an invisible shell inside
   <cds-modal>. */
.pwd-mode {
  display: grid;
  /* cds-input's label sits at --padding's left edge (12px by default), and
     the field rows beneath use the same offset. Match it. */
  grid-template-columns: 74px 1fr;
  column-gap: 0;
  row-gap: 4px;
  align-items: center;
  /* Reset the form's default cds-control margins — we manage our own. */
  margin: 0 0 0 8px;
  padding: 0;
}
.pwd-mode-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--cds-alias-typography-color-300, #565656);
  line-height: 1.4;
  /* Same left padding as cds-input's label container (cds-input applies
     --padding around its input control, and the label is left-aligned at
     the same x as the input's text). */
  padding-left: 12px;
  padding-right: 8px;
  align-self: center;
}
.pwd-mode-options {
  display: inline-flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  /* Sit on the same baseline as the label. */
  align-self: center;
}
.pwd-mode-option {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 400;
  /* Match the "密码" / "确认密码" label text — same font-size, no extra
     weight, default text color. */
  color: var(--cds-alias-object-app-foreground, #1b1b1b);
  cursor: pointer;
  user-select: none;
  white-space: nowrap;
}
.pwd-mode-divider {
  width: 1px;
  height: 14px;
  background: var(--cds-alias-object-border-color, #d0d0d0);
}
.pwd-mode-option input[type='radio'] {
  /* Native radio is the only reliable control in this slot context; let the
     browser draw it. Accent color follows the platform primary so it matches
     Clarity's checked state. */
  accent-color: var(--cds-alias-status-info, #0079ad);
  cursor: pointer;
  width: 14px;
  height: 14px;
  margin: 0;
}
.pwd-mode-option input[type='radio']:disabled {
  cursor: not-allowed;
}
.pwd-mode-option:has(input:disabled) {
  cursor: not-allowed;
  opacity: 0.5;
}
/* The auto-hint is a third row spanning both columns. We force `display:
   block` + `min-width: 0` + `width: 100%` so the grid item respects the
   1fr track and lets text wrap normally (without it, CSS Grid's default
   `min-width: auto` collapsed the cell to one character wide, turning
   "由后端生成,创建后通过一次性弹窗显示" into a vertical stack). */
.pwd-mode-hint {
  grid-column: 1 / -1;
  display: block;
  min-width: 0;
  width: 100%;
  white-space: normal;
  word-break: break-word;
  /* Extra breathing room above the auto-hint so it doesn't sit flush against
     the radio row above. Overrides .user-form-hint's -8px top margin. */
  margin-top: 8px;
  /* No extra padding-left — .user-form-hint already adds 74px (matches
     the "密码须包含大小写字母..." line below the password input). */
}

:deep(cds-modal) {
  --width: 560px;
}
</style>