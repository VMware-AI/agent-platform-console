<script setup lang="ts">
import { ref } from 'vue'
import { useLocaleStore } from '@/stores/locale'
import { useToast } from '@/composables/useToast'
import { graphqlErrorMessage } from '@/api/graphql/errors'

// Shown ONCE after a key is issued or regenerated — the backend never returns the
// secret again. Lets the operator copy it before dismissing.
defineProps<{
  open: boolean
  secret: string
  /** Optional second one-time credential (deploy: the VM's initial login password,
   *  which may be auto-generated so the operator never saw it). Shown as a second
   *  block; callers that omit it (key regenerate) see only the secret. */
  password?: string
}>()

const emit = defineEmits<{ (event: 'close'): void }>()

const locale = useLocaleStore()
const toast = useToast()
const copied = ref(false)

function copyWithFallback(value: string) {
  const textarea = document.createElement('textarea')
  textarea.value = value
  textarea.style.position = 'fixed'
  textarea.style.opacity = '0'
  document.body.appendChild(textarea)
  textarea.select()
  const ok = document.execCommand('copy')
  document.body.removeChild(textarea)
  if (!ok) throw new Error('Copy command rejected')
}

async function copyValue(value: string) {
  try {
    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(value)
      } catch {
        copyWithFallback(value)
      }
    } else {
      copyWithFallback(value)
    }
    copied.value = true
    toast.success(locale.t('virtualKey.secret.copied'))
  } catch (err) {
    toast.error(graphqlErrorMessage(err, locale.t('virtualKey.toast.copyFailed')))
  }
}
</script>

<template>
  <cds-modal :hidden="!open" :closable="true" size="md" @closeChange="emit('close')">
    <cds-modal-header>
      <h2 cds-text="title" class="modal-title">{{ locale.t('virtualKey.secret.title') }}</h2>
    </cds-modal-header>

    <cds-modal-content>
      <div class="secret-body">
        <cds-alert status="warning" :closable="false">
          {{ locale.t('virtualKey.secret.warning') }}
        </cds-alert>
        <div class="secret-field">
          <span class="secret-label">{{ locale.t('virtualKey.secret.keyLabel') }}</span>
          <div class="secret-row">
            <code class="secret-value">{{ secret }}</code>
            <cds-button action="outline" size="sm" @click="copyValue(secret)">
              <cds-icon shape="copy" size="sm"></cds-icon>
              {{ locale.t('virtualKey.secret.copy') }}
            </cds-button>
          </div>
        </div>
        <div v-if="password" class="secret-field">
          <span class="secret-label">{{ locale.t('virtualKey.secret.passwordLabel') }}</span>
          <div class="secret-row">
            <code class="secret-value">{{ password }}</code>
            <cds-button action="outline" size="sm" @click="copyValue(password)">
              <cds-icon shape="copy" size="sm"></cds-icon>
              {{ locale.t('virtualKey.secret.copy') }}
            </cds-button>
          </div>
        </div>
      </div>
    </cds-modal-content>

    <cds-modal-actions>
      <cds-button @click="emit('close')">
        {{ locale.t('virtualKey.secret.done') }}
      </cds-button>
    </cds-modal-actions>
  </cds-modal>
</template>

<style scoped>
.modal-title {
  margin: 0;
}
.secret-body {
  display: grid;
  gap: 16px;
}
.secret-field {
  display: grid;
  gap: 4px;
}
.secret-label {
  font-size: 12px;
  color: var(--cds-alias-typography-color-02, #6f6f6f);
}
.secret-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.secret-value {
  flex: 1 1 auto;
  min-width: 0;
  padding: 8px 10px;
  border: 1px solid var(--cds-alias-object-border-color, #b3b3b3);
  border-radius: 3px;
  background: var(--cds-alias-object-app-background, #f4f4f4);
  font-family: var(--cds-global-typography-monospace-font-family, monospace);
  font-size: 13px;
  word-break: break-all;
  user-select: all;
}
</style>
