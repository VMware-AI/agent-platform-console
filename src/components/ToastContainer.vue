<script setup lang="ts">
import type { ToastStatus } from '@/composables/useToast'
import { useToast } from '@/composables/useToast'
import { useLocaleStore } from '@/stores/locale'

const { toasts, dismiss } = useToast()
const locale = useLocaleStore()

/** Map toast status → cds icon shape. We re-use the cds icons that
 * cds-alert would have used internally so the visual still matches. */
const ICON_FOR_STATUS: Record<ToastStatus, string> = {
  info: 'info-standard',
  success: 'success-standard',
  warning: 'warning-standard',
  danger: 'error-standard',
}
</script>

<template>
  <!--
    Top-right floating stack. cds has no dedicated toast/snackbar component
    and cds-alert's slot projection (Vue + LitElement + Shadow DOM) keeps
    silently dropping the text in banner mode, so we render a plain div
    styled with cds color tokens + a cds-icon for the status glyph.

    `aria-live="polite"` lets screen readers announce toasts without
    interrupting; we bump to "assertive" only for danger-level toasts
    (see individual .toast aria-live binding). -->
  <div class="toast-stack" aria-live="polite">
    <TransitionGroup name="toast">
      <div
        v-for="toast in toasts"
        :key="toast.id"
        :class="['toast', `toast-${toast.status}`]"
        role="status"
        :aria-live="toast.status === 'danger' ? 'assertive' : 'polite'"
      >
        <cds-icon
          :shape="ICON_FOR_STATUS[toast.status]"
          size="md"
          class="toast-icon"
          aria-hidden="true"
        ></cds-icon>
        <div class="toast-body">
          <div v-if="toast.title" class="toast-title">{{ toast.title }}</div>
          <div class="toast-message">{{ toast.message }}</div>
        </div>
        <button
          type="button"
          class="toast-close"
          :aria-label="locale.t('common.close')"
          @click="dismiss(toast.id)"
        >
          ×
        </button>
      </div>
    </TransitionGroup>
  </div>
</template>

<style scoped>
.toast-stack {
  position: fixed;
  top: var(--cds-global-space-7, 16px);
  right: var(--cds-global-space-7, 16px);
  z-index: 1100;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: var(--cds-global-space-3, 8px);
  max-width: min(420px, calc(100vw - 32px));
  pointer-events: none;
}

.toast {
  pointer-events: auto;
  display: flex;
  align-items: center;
  gap: var(--cds-global-space-4, 16px);
  min-width: 280px;
  max-width: 420px;
  padding: 12px 16px;
  border-radius: 4px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.22);
  font-size: 14px;
  line-height: 1.5;
  color: var(--cds-global-typography-color-100, #fff);
  /* Solid background (no opacity tricks) — the four status variants below
     override --background so each toast is fully opaque. */
  background: var(--toast-bg, #565656);
}

.toast-info {
  --toast-bg: var(--cds-alias-status-info, #0079ad);
}
.toast-success {
  --toast-bg: var(--cds-alias-status-success, #42810e);
}
.toast-warning {
  --toast-bg: var(--cds-alias-status-warning, #ffa600);
  color: var(--cds-global-typography-color-400, #21333b);
}
.toast-danger {
  --toast-bg: var(--cds-alias-status-danger, #c21d00);
}

.toast-icon {
  flex-shrink: 0;
  margin-top: 2px;
  color: currentColor;
}

.toast-body {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.toast-title {
  font-weight: 700;
  font-size: 14px;
  line-height: 1.4;
}

.toast-message {
  font-size: 14px;
  font-weight: 600;
  line-height: 1.5;
  word-break: break-word;
  white-space: pre-wrap;
}

.toast-close {
  flex-shrink: 0;
  appearance: none;
  background: transparent;
  border: 0;
  padding: 0;
  margin: 0;
  width: 24px;
  height: 24px;
  font-size: 20px;
  line-height: 1;
  color: currentColor;
  cursor: pointer;
  border-radius: 2px;
  opacity: 0.85;
  transition: opacity 120ms ease;
}
.toast-close:hover,
.toast-close:focus-visible {
  opacity: 1;
  outline: 2px solid currentColor;
  outline-offset: 1px;
}

/* TransitionGroup: slide in from the right + fade, fade out. */
.toast-enter-active,
.toast-leave-active {
  transition: opacity 180ms ease, transform 180ms ease;
}
.toast-enter-from {
  opacity: 0;
  transform: translateX(24px);
}
.toast-leave-to {
  opacity: 0;
  transform: translateX(24px);
}
.toast-move {
  transition: transform 180ms ease;
}
</style>
