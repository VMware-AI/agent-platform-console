<script setup lang="ts">
/**
 * Generic confirm dialog. Mirrors the AboutDialog backdrop + card pattern
 * (Teleport → backdrop → card). Shared by destructive row actions in any
 * view (e.g. the Users tab's delete flow and the Model Gateway view's
 * delete flow).
 *
 * Supports an optional "type-to-confirm" mode used for irreversible
 * destructive actions (e.g. deleting a user). When `expectedInput` is
 * non-empty, the dialog renders an input field and the confirm button stays
 * disabled until the trimmed value matches `expectedInput` exactly.
 */
import { computed, ref, watch } from 'vue'
import { useLocaleStore } from '@/stores/locale'
import '@/components/icons'

const props = defineProps<{
  open: boolean
  title: string
  /**
   * Plain body text. Used when `bodySegments` is empty/absent. The two
   * props are mutually exclusive at render time — `bodySegments` wins.
   */
  body?: string
  /**
   * Optional rich body. When supplied (non-empty), overrides `body` and
   * renders each segment either as plain text or wrapped in `<strong>`
   * (when `bold: true`). Useful when an inline value (e.g. a username the
   * user must type to confirm) needs emphasis.
   */
  bodySegments?: { text: string; bold?: boolean }[]
  /** When true the confirm button is rendered in danger style. */
  danger?: boolean
  /** Optional label shown above the type-to-confirm input. */
  inputLabel?: string
  /** Optional placeholder for the type-to-confirm input. */
  inputPlaceholder?: string
  /**
   * When non-empty, the confirm button is disabled until the input matches
   * this string (trimmed, case-sensitive). The input is reset on every
   * `open` transition from false → true.
   */
  expectedInput?: string
}>()

const emit = defineEmits<{
  (e: 'confirm'): void
  (e: 'close'): void
}>()

const locale = useLocaleStore()

const typedInput = ref('')

/* Reset on every (re-)open so the user can't bypass by reusing a previous
   match left in the DOM. */
watch(
  () => props.open,
  (o) => {
    if (o) typedInput.value = ''
  },
)

const confirmDisabled = computed(() => {
  if (!props.expectedInput) return false
  return typedInput.value.trim() !== props.expectedInput
})

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
          <p v-if="bodySegments && bodySegments.length" cds-text="body" class="confirm-body">
            <template v-for="(seg, i) in bodySegments" :key="i">
              <strong v-if="seg.bold">{{ seg.text }}</strong>
              <template v-else>{{ seg.text }}</template>
            </template>
          </p>
          <p v-else cds-text="body" class="confirm-body">{{ body }}</p>

          <div v-if="expectedInput" class="confirm-input-wrap">
            <span v-if="inputLabel" class="confirm-input-label">{{ inputLabel }}</span>
            <input
              type="text"
              class="app-input"
              autocomplete="off"
              autocapitalize="off"
              spellcheck="false"
              :value="typedInput"
              :placeholder="inputPlaceholder"
              @input="(e: Event) => typedInput = (e.target as HTMLInputElement).value"
            />
          </div>

          <div class="confirm-actions">
            <cds-button type="button" action="outline" @click="close">
              {{ locale.t('common.cancel') }}
            </cds-button>
            <cds-button
              type="button"
              action="solid"
              :status="danger ? 'danger' : 'primary'"
              :disabled="confirmDisabled"
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
  /* gap is the only thing separating title / body / input / actions.
     Bump up so the type-to-confirm input doesn't sit flush against the
     prompt text above it. */
  gap: 20px;
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

/* `display: block` (not flex) so the cds-input child sits on its own
   line and gets a visual breath of space below the prompt body. */
.confirm-input-wrap {
  display: block;
}

.confirm-input-label {
  display: block;
  font-size: 13px;
  font-weight: 600;
  color: var(--cds-alias-typography-color-300, #565656);
  margin-bottom: 8px;
}

/* Local copy of the project's `.app-input` (defined per-view elsewhere) so
   the type-to-confirm input can take real keyboard focus and text. Using a
   native <input> instead of <cds-input> + slotted <input> avoids the
   web-component slot/focus quirks that made the previous implementation
   non-typeable in some environments.

   Style: underline-only — drop the full box border, keep the bottom
   border so the input still reads as a "text field" without the boxed
   look. The box is regenerated on focus as a subtle outline ring. */
.app-input {
  font: inherit;
  font-size: 14px;
  width: 100%;
  height: 32px;
  padding: 4px 2px;
  border: 0;
  border-bottom: 1px solid var(--cds-alias-object-border-color, #cbd4d8);
  border-radius: 0;
  background: transparent;
  color: var(--cds-alias-object-app-foreground, #1b1b1b);
  outline: none;
  transition: border-color 0.12s ease, box-shadow 0.12s ease;
  box-sizing: border-box;
}
.app-input:focus {
  border-bottom-color: var(--cds-alias-status-info, #0079ad);
  box-shadow: 0 1px 0 0 var(--cds-alias-status-info, #0079ad);
}
.app-input::placeholder {
  color: var(--cds-alias-typography-color-300, #565656);
  opacity: 0.6;
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