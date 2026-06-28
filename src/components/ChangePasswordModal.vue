<script setup lang="ts">
/**
 * Forced password-change modal.
 *
 * Mounted by AppShell while `auth.mustChangePassword === true`. The modal is
 * `:closable="false"` — the user cannot dismiss it until the flag clears.
 * Submit triggers `auth.changePassword(oldPassword, newPassword)`; on
 * success the flag flips to false and the parent unmounts the modal. On
 * failure the toast surfaces the backend error via graphqlErrorMessage.
 */
import { computed, ref } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { useLocaleStore } from '@/stores/locale'
import { useToast } from '@/composables/useToast'
import { graphqlErrorMessage } from '@/api/graphql/errors'
import { passwordMeets } from '@/composables/usePasswordComplexity'
import '@/components/icons'

const auth = useAuthStore()
const locale = useLocaleStore()
const toast = useToast()

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

async function onSubmit() {
  if (!canSubmit.value) return
  submitting.value = true
  try {
    const ok = await auth.changePassword(oldPassword.value, newPassword.value)
    if (ok) {
      toast.success(locale.t('changePassword.toast.ok'))
      // No explicit close — the parent's v-if re-evaluates as soon as
      // auth.mustChangePassword flips to false.
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
    data-testid="change-password-modal"
    role="alertdialog"
    @closeChange="() => {}"
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
        <cds-input>
          <label>{{ locale.t('changePassword.current') }}</label>
          <input
            slot="input"
            type="password"
            autocomplete="current-password"
            :value="oldPassword"
            :disabled="submitting"
            @input="(e) => (oldPassword = (e.target as HTMLInputElement).value)"
          />
        </cds-input>
      </cds-control>

      <cds-control class="field">
        <cds-input :status="complexity.ok || newPassword.length === 0 ? 'neutral' : 'error'">
          <label>{{ locale.t('changePassword.new') }}</label>
          <input
            slot="input"
            type="password"
            autocomplete="new-password"
            :value="newPassword"
            :disabled="submitting"
            @input="(e) => (newPassword = (e.target as HTMLInputElement).value)"
          />
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
        <cds-input :status="mismatch ? 'error' : 'neutral'">
          <label>{{ locale.t('changePassword.confirm') }}</label>
          <input
            slot="input"
            type="password"
            autocomplete="new-password"
            :value="confirmPassword"
            :disabled="submitting"
            @input="(e) => (confirmPassword = (e.target as HTMLInputElement).value)"
          />
          <cds-control-message v-if="mismatch" status="error" aria-live="polite">
            {{ locale.t('changePassword.mismatch') }}
          </cds-control-message>
        </cds-input>
      </cds-control>
    </cds-modal-content>

    <cds-modal-actions>
      <cds-button
        type="button"
        action="solid"
        status="primary"
        :disabled="!canSubmit"
        :loading="submitting"
        @click="onSubmit"
      >
        {{ locale.t('changePassword.submit') }}
      </cds-button>
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
</style>