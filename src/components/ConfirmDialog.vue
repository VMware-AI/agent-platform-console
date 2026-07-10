<script setup lang="ts">
/**
 * Generic confirm dialog. Mirrors the AboutDialog backdrop + card pattern
 * (Teleport → backdrop → card). Shared by destructive row actions in any
 * view (e.g. the Users tab's delete flow and the Model Gateway view's
 * delete flow).
 *
 * Supports two opt-in input modes:
 *   1. "type-to-confirm" (`expectedInput`) — for irreversible destructive
 *      actions (e.g. deleting a user). Confirm button stays disabled until
 *      the trimmed input matches `expectedInput` exactly.
 *   2. "numeric input" (`numericInput`) — for actions that need a value
 *      from the operator at confirm time, e.g. purge "delete keys older
 *      than N days". Confirm button is disabled until the trimmed value
 *      is a positive integer; the integer is emitted on `confirm` as the
 *      second tuple value (`[confirmed, numericValue]`).
 *
 * The two modes are mutually exclusive at the call site; this component
 * prefers `numericInput` when both are set (the dialog is data-driven —
 * picking the input that requires the most thinking wins).
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
  /**
   * Numeric-input mode. When provided, the dialog renders a `<input
   * type="number">` instead of (not in addition to) the type-to-confirm
   * field. The confirm button is disabled until the trimmed value is a
   * positive integer within `[min, max]`; the integer is emitted on
   * `confirm` as the second tuple value of the event payload so the
   * caller can use it directly (e.g. as the `beforeTime` offset for
   * purgeRevokedVirtualKeys).
   */
  numericInput?: {
    label: string
    placeholder?: string
    default?: number
    min?: number
    max?: number
  }
}>()

const emit = defineEmits<{
  (e: 'confirm', numericValue?: number): void
  (e: 'close'): void
}>()

const locale = useLocaleStore()

const typedInput = ref('')
// Numeric-input state. Initialised to `numericInput.default` on every
// open so the operator sees the suggested value up front; cleared on
// close so the next open gets the default again (avoids a stale "30"
// from a previous attempt).
const typedNumeric = ref<number | null>(null)

/* Reset on every (re-)open so the user can't bypass by reusing a previous
   match left in the DOM. */
watch(
  () => props.open,
  (o) => {
    if (o) {
      typedInput.value = ''
      typedNumeric.value = props.numericInput?.default ?? null
    }
  },
)

const confirmDisabled = computed(() => {
  if (props.numericInput) {
    const n = typedNumeric.value
    if (n == null || !Number.isFinite(n)) return true
    const { min, max } = props.numericInput
    if (typeof min === 'number' && n < min) return true
    if (typeof max === 'number' && n > max) return true
    return false
  }
  if (props.expectedInput) {
    return typedInput.value.trim() !== props.expectedInput
  }
  return false
})

function close() {
  emit('close')
}
function confirm() {
  emit('confirm', typedNumeric.value ?? undefined)
}
function onBackdropClick(e: MouseEvent) {
  if (e.target === e.currentTarget) close()
}
// Numeric-input handler. Extracted as a named function (instead of an
// inline @input expression) so the template can keep vue-tsc happy —
// inlining a complex handler that re-assigns `typedNumeric.value`
// triggered `possibly null` narrowing complaints when the template
// parser couldn't thread the type through.
function onNumericInput(event: Event) {
  const raw = (event.target as HTMLInputElement).value
  if (raw === '') {
    typedNumeric.value = null
    return
  }
  const parsed = Number(raw)
  typedNumeric.value = Number.isFinite(parsed) ? parsed : null
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

          <!-- Numeric-input mode: shows when `numericInput` is provided.
               Mutually exclusive with the type-to-confirm field above;
               callers shouldn't set both. We use the native HTML number
               input rather than the cds-input wrapper because cds-input's
               internal slot expects a free-text binding that fights with
               number-type coercion; matching the type-to-confirm path's
               plain input keeps the styling consistent. -->
          <div v-else-if="numericInput" class="confirm-input-wrap">
            <span v-if="numericInput.label" class="confirm-input-label">{{ numericInput.label }}</span>
            <input
              type="number"
              class="app-input"
              :min="numericInput.min"
              :max="numericInput.max"
              :value="typedNumeric ?? ''"
              :placeholder="numericInput.placeholder"
              @input="onNumericInput"
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
  /* Must sit above Clarity cds-modal's overlay (z-index: 1000000 per
     @cds/core/internal-components/overlay) so the dialog can be triggered
     from inside a cds-modal (e.g. destructive actions on the supplier
     model editor) and still appear on top. Earlier 1100 worked when
     confirm was only triggered from top-level list views, but is
     layered under cds-modal when nested. */
  z-index: 1100000;
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