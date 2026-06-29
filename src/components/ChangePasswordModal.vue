<script setup lang="ts">
/**
 * Password-change modal — supports two call sites:
 *
 *  1. Forced change at first login (AppShell mounts it via
 *     `v-if="auth.mustChangePassword"`). The modal is non-dismissible —
 *     close attempts are ignored and the modal only closes when the store
 *     flag flips to `false` after a successful submit.
 *
 *  2. User-initiated change from the profile page (`ProfileView.vue` mounts
 *     it inside a "修改密码" button click handler). The modal is fully
 *     dismissible; on success the parent receives a `close` event and on
 *     close-while-submitting it is non-dismissible (preserving the existing
 *     submit-guard semantics).
 *
 * The two modes are selected with the optional `closable` prop — defaults
 * to `false` so the existing forced-flow behavior is preserved when the
 * prop is omitted. ProfileView passes `closable` to opt into dismissal.
 */
import { computed, ref } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { useLocaleStore } from '@/stores/locale'
import { useToast } from '@/composables/useToast'
import { graphqlErrorMessage } from '@/api/graphql/errors'
import { passwordMeets } from '@/composables/usePasswordComplexity'
import '@/components/icons'

const props = defineProps<{
  /** When false (default), the modal swallows close attempts so the user
   *  cannot bypass a forced password change. When true, emits `close`. */
  closable?: boolean
}>()

const emit = defineEmits<{
  (e: 'close'): void
}>()

const auth = useAuthStore()
const locale = useLocaleStore()
const toast = useToast()

const isClosable = computed(() => props.closable === true)

/**
 * Per-field password reveal toggles. Each input gets its own ref because the
 * inputs are independent (e.g. the user might want to peek the new password
 * while leaving the current one hidden). Mirrors LoginView's pattern but
 * scopes the state to this modal since the modal can be re-opened multiple
 * times and we want a clean reset on every open.
 */
const showCurrent = ref(false)
const showNew = ref(false)
const showConfirm = ref(false)

const oldPassword = ref('')
const newPassword = ref('')
const confirmPassword = ref('')
const submitting = ref(false)

const complexity = computed(() => passwordMeets(newPassword.value))
const mismatch = computed(
  () => confirmPassword.value.length > 0 && newPassword.value !== confirmPassword.value,
)

const canSubmit = computed(
  () =>
    oldPassword.value.length > 0 &&
    complexity.value.ok &&
    !mismatch.value &&
    confirmPassword.value.length > 0 &&
    !submitting.value,
)

/** closeChange handler — only honored when the parent opted into dismissal. */
function onCloseChange() {
  if (!isClosable.value) return
  emit('close')
}

/** Reset the form when the modal is dismissed by the user (dismissible mode
 *  only). Forces the next open to start clean. */
function resetForm() {
  oldPassword.value = ''
  newPassword.value = ''
  confirmPassword.value = ''
  // Also collapse the per-field reveal flags so a freshly-opened modal
  // doesn't show stale plaintext from the previous session.
  showCurrent.value = false
  showNew.value = false
  showConfirm.value = false
}

async function onSubmit() {
  if (!canSubmit.value) return
  submitting.value = true
  try {
    const ok = await auth.changePassword(oldPassword.value, newPassword.value)
    if (ok) {
      toast.success(locale.t('changePassword.toast.ok'))
      // Forced-flow mount: AppShell unmounts us once `mustChangePassword`
      // flips to false. Dismissible flow: explicitly emit `close` so the
      // parent can clear its showChangePassword ref.
      if (isClosable.value) {
        resetForm()
        emit('close')
      }
      // No explicit close in forced mode — parent's v-if re-evaluates as
      // soon as auth.mustChangePassword flips to false.
    } else {
      toast.error(
        graphqlErrorMessage(new Error(auth.error ?? ''), locale.t('changePassword.toast.fail')),
      )
    }
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <cds-modal
    size="md"
    :closable="isClosable"
    data-testid="change-password-modal"
    role="alertdialog"
    @closeChange="onCloseChange"
  >
    <cds-modal-header>
      <h3 cds-text="title" class="modal-title">
        {{ locale.t('changePassword.title') }}
      </h3>
    </cds-modal-header>

    <cds-modal-content>
      <p class="intro">{{ locale.t('changePassword.intro') }}</p>

      <!-- Static rule summary, always visible (matches the hint shown on the
           create-user form so users see the same expectations in both places). -->
      <p class="hint" data-testid="password-hint">
        {{ locale.t('users.form.passwordHint') }}
      </p>

      <cds-control class="field">
        <cds-input class="pwd-input">
          <label>{{ locale.t('changePassword.current') }}</label>
          <input
            slot="input"
            :type="showCurrent ? 'text' : 'password'"
            autocomplete="current-password"
            :value="oldPassword"
            :disabled="submitting"
            @input="(e) => (oldPassword = (e.target as HTMLInputElement).value)"
          />
          <button
            slot="suffix"
            type="button"
            class="pwd-toggle"
            :aria-label="showCurrent ? locale.t('changePassword.action.hidePwd') : locale.t('changePassword.action.showPwd')"
            :title="showCurrent ? locale.t('changePassword.action.hidePwd') : locale.t('changePassword.action.showPwd')"
            :disabled="submitting"
            @click="showCurrent = !showCurrent"
          >
            <cds-icon :shape="showCurrent ? 'eye-hide' : 'eye'" size="sm"></cds-icon>
          </button>
        </cds-input>
      </cds-control>

      <cds-control class="field">
        <cds-input class="pwd-input" :status="complexity.ok || newPassword.length === 0 ? 'neutral' : 'error'">
          <label>{{ locale.t('changePassword.new') }}</label>
          <input
            slot="input"
            :type="showNew ? 'text' : 'password'"
            autocomplete="new-password"
            :value="newPassword"
            :disabled="submitting"
            @input="(e) => (newPassword = (e.target as HTMLInputElement).value)"
          />
          <button
            slot="suffix"
            type="button"
            class="pwd-toggle"
            :aria-label="showNew ? locale.t('changePassword.action.hidePwd') : locale.t('changePassword.action.showPwd')"
            :title="showNew ? locale.t('changePassword.action.hidePwd') : locale.t('changePassword.action.showPwd')"
            :disabled="submitting"
            @click="showNew = !showNew"
          >
            <cds-icon :shape="showNew ? 'eye-hide' : 'eye'" size="sm"></cds-icon>
          </button>
          <cds-control-message
            v-if="newPassword.length > 0 && complexity.reasons.length > 0"
            status="warning"
            aria-live="polite"
          >
            <ul class="complexity" data-testid="password-complexity-reasons">
              <li v-for="reason in complexity.reasons" :key="reason">{{ reason }}</li>
            </ul>
          </cds-control-message>
        </cds-input>
      </cds-control>

      <cds-control class="field">
        <cds-input class="pwd-input" :status="mismatch ? 'error' : 'neutral'">
          <label>{{ locale.t('changePassword.confirm') }}</label>
          <input
            slot="input"
            :type="showConfirm ? 'text' : 'password'"
            autocomplete="new-password"
            :value="confirmPassword"
            :disabled="submitting"
            @input="(e) => (confirmPassword = (e.target as HTMLInputElement).value)"
          />
          <button
            slot="suffix"
            type="button"
            class="pwd-toggle"
            :aria-label="showConfirm ? locale.t('changePassword.action.hidePwd') : locale.t('changePassword.action.showPwd')"
            :title="showConfirm ? locale.t('changePassword.action.hidePwd') : locale.t('changePassword.action.showPwd')"
            :disabled="submitting"
            @click="showConfirm = !showConfirm"
          >
            <cds-icon :shape="showConfirm ? 'eye-hide' : 'eye'" size="sm"></cds-icon>
          </button>
          <cds-control-message v-if="mismatch" status="error" aria-live="polite">
            {{ locale.t('changePassword.mismatch') }}
          </cds-control-message>
        </cds-input>
      </cds-control>
    </cds-modal-content>

    <cds-modal-actions>
      <!--
        Native <button> rather than <cds-button action="solid" status="primary">:
        the Clarity web-component button does not render its themed shell
        inside <cds-modal-actions> in this build (the slot context drops the
        visual styles; only layout/typography tokens reach the .private-host
        inside its shadow root). We use the same Clarity 6 design tokens so
        the result matches the documented "solid primary" appearance:
        enabled  = filled blue with white uppercase text,
        disabled = grey fill with no pointer events.
      -->
      <button
        type="button"
        class="submit-btn"
        :disabled="!canSubmit"
        :aria-busy="submitting || undefined"
        @click="onSubmit"
      >
        {{ isClosable
          ? locale.t('changePassword.submitUser')
          : locale.t('changePassword.submit') }}
      </button>
    </cds-modal-actions>
  </cds-modal>
</template>

<style scoped>
.modal-title {
  margin: 0;
}
.intro {
  margin: 0 0 8px;
  color: var(--cds-alias-typography-color-300, #555);
  font-size: 13px;
  line-height: 1.6;
}
.hint {
  margin: 0 0 16px;
  padding: 8px 12px;
  background: var(--cds-alias-object-app-background, #f4f4f4);
  border-left: 3px solid var(--cds-alias-status-info, #0079ad);
  color: var(--cds-alias-typography-color-300, #555);
  font-size: 12px;
  line-height: 1.5;
  border-radius: 0 4px 4px 0;
}
.field {
  display: block;
  margin-bottom: 12px;
}
.complexity {
  margin: 0;
  padding-left: 18px;
  font-size: 12px;
}

/* Password reveal toggle — mirrors LoginView's pattern. The eye button is
   slotted into cds-input's shadow DOM via `slot="suffix"`, so Vue scoped
   styles need :deep() to reach it. Reserve right-padding on the input so the
   typed text doesn't slide under the eye icon. */
.pwd-input {
  --padding: 4px 36px 4px 12px;
}
.pwd-input :deep(.suffix) {
  pointer-events: auto;
  display: flex;
  align-items: center;
  top: 0;
  height: 100%;
}
.pwd-input :deep(.pwd-toggle) {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  background: none;
  border: 0;
  padding: 0;
  margin: 0;
  cursor: pointer;
  color: var(--cds-alias-typography-color-300, #6b6b6b);
  border-radius: 4px;
  transition: color 0.12s ease, background-color 0.12s ease;
}
.pwd-input :deep(.pwd-toggle:hover:not(:disabled)) {
  color: var(--cds-alias-object-app-foreground, #1b1b1b);
  background: var(--cds-alias-object-app-background, #f4f4f4);
}
.pwd-input :deep(.pwd-toggle:disabled) {
  cursor: not-allowed;
  opacity: 0.5;
}
.pwd-input :deep(.pwd-toggle:focus-visible) {
  outline: 2px solid var(--cds-alias-status-info, #0079ad);
  outline-offset: 1px;
}

:deep(cds-modal) {
  --width: 480px;
}

/* Solid-primary button styling — mirrors Clarity 6's cds-button[action=solid]
   visual so the disabled grey / enabled blue contract is preserved. Tokens
   come from @cds/core/global.min.css via the page cascade. */
.submit-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: var(
    --cds-global-space-11,
    calc(36 * 1rem / var(--cds-global-base, 20))
  );
  min-width: var(
    --cds-global-space-13,
    calc(64 * 1rem / var(--cds-global-base, 20))
  );
  padding:
    var(--cds-global-space-6, calc(12 * 1rem / var(--cds-global-base, 20)))
    var(--cds-global-space-7, calc(16 * 1rem / var(--cds-global-base, 20)));
  border: var(
      --cds-alias-object-border-width-100,
      calc(1 * 1rem / var(--cds-global-base, 20))
    )
    solid
    var(--cds-alias-status-info, #0079ad);
  border-radius: var(
    --cds-alias-object-border-radius-100,
    calc(4 * 1rem / var(--cds-global-base, 20))
  );
  background: var(--cds-alias-status-info, #0079ad);
  color: var(--cds-global-typography-color-100, #ffffff);
  font-family: var(
    --cds-global-typography-font-family,
    'Clarity City', 'Avenir Next', sans-serif
  );
  font-size: var(
    --cds-global-typography-font-size-2,
    calc(12 * 1rem / var(--cds-global-base, 20))
  );
  font-weight: var(--cds-global-typography-font-weight-semibold, 600);
  letter-spacing: 0.12em;
  text-transform: uppercase;
  text-decoration: none;
  cursor: pointer;
  user-select: none;
  transition: filter 0.12s ease, background-color 0.12s ease;
}
.submit-btn:hover:not(:disabled):not(:focus) {
  filter: brightness(0.9);
}
.submit-btn:focus-visible {
  outline: 2px solid var(--cds-alias-status-info, #0079ad);
  outline-offset: 2px;
}
.submit-btn:disabled {
  /* Disabled state: grey fill, neutral border, no hover effect, no pointer. */
  background: var(--cds-alias-status-disabled-tint, #cbd4d8);
  border-color: var(--cds-alias-status-disabled-tint, #cbd4d8);
  color: var(--cds-alias-status-disabled, #aeb8bc);
  cursor: not-allowed;
  filter: none;
}
</style>