<script setup lang="ts">
/**
 * Generic confirm dialog. Mirrors the AboutDialog backdrop + card pattern
 * (Teleport → backdrop → card). Used by destructive row actions in the
 * Users / Roles tabs.
 */
import { useLocaleStore } from '@/stores/locale'
import '@/components/icons'

defineProps<{
  open: boolean
  title: string
  body: string
  /** When true the confirm button is rendered in danger style. */
  danger?: boolean
}>()

const emit = defineEmits<{
  (e: 'confirm'): void
  (e: 'close'): void
}>()

const locale = useLocaleStore()

function close() {
  emit('close')
}
function confirm() {
  emit('confirm')
}
function onBackdropClick(e: MouseEvent) {
  if (e.target === e.currentTarget) close()
}
</script>

<template>
  <Teleport to="body">
    <Transition name="confirm-fade">
      <div
        v-if="open"
        class="confirm-backdrop"
        role="alertdialog"
        aria-modal="true"
        :aria-label="title"
        @click="onBackdropClick"
      >
        <div class="confirm-card">
          <h2 cds-text="section" class="confirm-title">{{ title }}</h2>
          <p cds-text="body" class="confirm-body">{{ body }}</p>
          <div class="confirm-actions">
            <cds-button type="button" action="outline" @click="close">
              {{ locale.t('common.cancel') }}
            </cds-button>
            <cds-button
              type="button"
              :action="danger ? 'solid' : 'solid'"
              :status="danger ? 'danger' : 'primary'"
              @click="confirm"
            >
              {{ locale.t('common.confirm') }}
            </cds-button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.confirm-backdrop {
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

.confirm-card {
  width: min(420px, 100%);
  background: var(--cds-alias-object-container-background, #ffffff);
  color: var(--cds-alias-object-app-foreground, #1b1b1b);
  border-radius: 12px;
  box-shadow: 0 30px 80px rgba(0, 0, 0, 0.35);
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.confirm-title {
  margin: 0;
  font-size: 18px;
}

.confirm-body {
  margin: 0;
  line-height: 1.6;
  color: var(--cds-alias-typography-color-300, #565656);
}

.confirm-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.confirm-fade-enter-active,
.confirm-fade-leave-active {
  transition: opacity 0.18s ease;
}
.confirm-fade-enter-from,
.confirm-fade-leave-to {
  opacity: 0;
}
</style>