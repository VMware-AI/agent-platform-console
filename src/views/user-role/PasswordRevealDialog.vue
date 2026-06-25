<script setup lang="ts">
/**
 * One-shot password reveal dialog.
 *
 * The plaintext password is passed in once by the parent (e.g. from the
 * `createUser` mutation's `generatedPassword` field). This component does
 * NOT persist it anywhere — closing the dialog drops the only copy. The
 * warning text tells the user to copy immediately.
 */
import { ref } from 'vue'
import { useLocaleStore } from '@/stores/locale'
import { useToast } from '@/composables/useToast'
import '@/components/icons'

const props = defineProps<{
  open: boolean
  username: string
  password: string
}>()

const emit = defineEmits<{
  (e: 'close'): void
}>()

const locale = useLocaleStore()
const toast = useToast()
const copied = ref(false)

async function copy() {
  try {
    await navigator.clipboard.writeText(props.password)
    copied.value = true
    toast.success(locale.t('users.toast.passwordCopied'))
  } catch (err) {
     
    console.error('[users] clipboard write failed', err)
    toast.error('复制失败')
  }
}

function close() {
  copied.value = false
  emit('close')
}

function onBackdropClick(e: MouseEvent) {
  if (e.target === e.currentTarget) close()
}
</script>

<template>
  <Teleport to="body">
    <Transition name="reveal-fade">
      <div
        v-if="open"
        class="reveal-backdrop"
        role="alertdialog"
        aria-modal="true"
        :aria-label="locale.t('users.passwordReveal.title').replace('{name}', username)"
        @click="onBackdropClick"
      >
        <div class="reveal-card">
          <h2 cds-text="section" class="reveal-title">
            {{ locale.t('users.passwordReveal.title').replace('{name}', username) }}
          </h2>
          <p cds-text="body" class="reveal-warning">
            {{ locale.t('users.passwordReveal.warning') }}
          </p>
          <div class="reveal-pwd-row">
            <code class="reveal-pwd">{{ password }}</code>
            <cds-button
              type="button"
              action="solid"
              status="primary"
              @click="copy"
            >
              <cds-icon shape="copy" size="sm" aria-hidden="true"></cds-icon>
              {{ locale.t('users.passwordReveal.copy') }}
            </cds-button>
          </div>
          <div class="reveal-actions">
            <cds-button type="button" action="outline" @click="close">
              {{ locale.t('users.passwordReveal.close') }}
            </cds-button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.reveal-backdrop {
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

.reveal-card {
  width: min(520px, 100%);
  background: var(--cds-alias-object-container-background, #ffffff);
  color: var(--cds-alias-object-app-foreground, #1b1b1b);
  border-radius: 12px;
  box-shadow: 0 30px 80px rgba(0, 0, 0, 0.35);
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.reveal-title {
  margin: 0;
  font-size: 18px;
}

.reveal-warning {
  margin: 0;
  font-size: 13px;
  line-height: 1.6;
  color: var(--cds-alias-status-warning, #ffa600);
  background: var(--cds-alias-object-app-background, #fff8e6);
  border-radius: 6px;
  padding: 8px 12px;
}

.reveal-pwd-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.reveal-pwd {
  flex: 1 1 auto;
  font-family: ui-monospace, "SFMono-Regular", "Menlo", monospace;
  font-size: 16px;
  background: var(--cds-alias-object-app-background, #f4f4f4);
  border: 1px solid var(--cds-alias-object-border-color, #e8e8e8);
  border-radius: 6px;
  padding: 10px 12px;
  word-break: break-all;
  user-select: all;
}

.reveal-actions {
  display: flex;
  justify-content: flex-end;
}

.reveal-fade-enter-active,
.reveal-fade-leave-active {
  transition: opacity 0.18s ease;
}
.reveal-fade-enter-from,
.reveal-fade-leave-to {
  opacity: 0;
}
</style>