<script setup lang="ts">
/**
 * Create-snapshot dialog for 智能体快照与生命周期. Collects a snapshot `name`
 * (required) and optional `description`, then emits `submit` with the trimmed
 * values. Mirrors the ConfirmDialog backdrop + card pattern (Teleport →
 * backdrop → card) so it matches the rest of the console.
 */
import { computed, nextTick, ref, watch } from 'vue'
import { useLocaleStore } from '@/stores/locale'
import '@/components/icons'

const props = defineProps<{
  open: boolean
  /** The agent the snapshot will be taken of (display only). */
  agentName: string
  saving: boolean
  /** Translation resolver injected by the parent view. */
}>()

const locale = useLocaleStore()

const emit = defineEmits<{
  (e: 'submit', payload: { name: string; description: string | null }): void
  (e: 'close'): void
}>()

const name = ref('')
const description = ref('')

// a11y: focus management. Move focus into the dialog on open, return it to the
// element that triggered the dialog on close, and trap Tab within the card.
const cardEl = ref<HTMLElement | null>(null)
const nameInputEl = ref<HTMLInputElement | null>(null)
let lastFocused: HTMLElement | null = null

function focusableInCard(): HTMLElement[] {
  if (!cardEl.value) return []
  return Array.from(
    cardEl.value.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  )
}

function onDialogKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    e.stopPropagation()
    close()
    return
  }
  if (e.key !== 'Tab') return
  const focusable = focusableInCard()
  if (focusable.length === 0) return
  const first = focusable[0]
  const last = focusable[focusable.length - 1]
  const active = document.activeElement as HTMLElement | null
  if (e.shiftKey && active === first) {
    e.preventDefault()
    last.focus()
  } else if (!e.shiftKey && active === last) {
    e.preventDefault()
    first.focus()
  }
}

// Reset the form whenever the dialog opens so a previous entry never leaks, and
// drive focus in/out for accessibility.
watch(
  () => props.open,
  (open) => {
    if (open) {
      name.value = ''
      description.value = ''
      lastFocused = document.activeElement as HTMLElement | null
      nextTick(() => nameInputEl.value?.focus())
    } else if (lastFocused) {
      lastFocused.focus()
      lastFocused = null
    }
  },
)

const trimmedName = computed(() => name.value.trim())
const canSubmit = computed(() => trimmedName.value.length > 0 && !props.saving)

function close() {
  if (props.saving) return
  emit('close')
}

function submit() {
  if (!canSubmit.value) return
  emit('submit', {
    name: trimmedName.value,
    description: description.value.trim() || null,
  })
}

function onBackdropClick(e: MouseEvent) {
  if (e.target === e.currentTarget) close()
}
</script>

<template>
  <Teleport to="body">
    <Transition name="snap-dialog-fade">
      <div
        v-if="open"
        class="snap-backdrop"
        role="dialog"
        aria-modal="true"
        :aria-label="locale.t('agentSnapshot.create.title')"
        @click="onBackdropClick"
        @keydown="onDialogKeydown"
      >
        <form ref="cardEl" class="snap-card" @submit.prevent="submit">
          <h2 cds-text="section" class="snap-title">{{ locale.t('agentSnapshot.create.title') }}</h2>
          <p cds-text="body" class="snap-sub muted">
            {{ locale.t('agentSnapshot.create.forAgent') }}
            <strong>{{ agentName }}</strong>
          </p>

          <cds-input class="field">
            <label>{{ locale.t('agentSnapshot.create.nameLabel') }}</label>
            <input
              ref="nameInputEl"
              v-model="name"
              type="text"
              :placeholder="locale.t('agentSnapshot.create.namePlaceholder')"
              :aria-label="locale.t('agentSnapshot.create.nameLabel')"
              maxlength="120"
              required
              aria-required="true"
            />
          </cds-input>

          <cds-textarea class="field">
            <label>{{ locale.t('agentSnapshot.create.descLabel') }}</label>
            <textarea
              v-model="description"
              rows="3"
              :placeholder="locale.t('agentSnapshot.create.descPlaceholder')"
              :aria-label="locale.t('agentSnapshot.create.descLabel')"
              maxlength="500"
            ></textarea>
          </cds-textarea>

          <div class="snap-actions">
            <cds-button type="button" action="outline" :disabled="saving" @click="close">
              {{ locale.t('agentSnapshot.action.cancel') }}
            </cds-button>
            <cds-button type="submit" action="solid" status="primary" :disabled="!canSubmit">
              {{ locale.t('agentSnapshot.action.create') }}
            </cds-button>
          </div>
        </form>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.snap-backdrop {
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
.snap-card {
  width: min(460px, 100%);
  background: var(--cds-alias-object-container-background, #ffffff);
  color: var(--cds-alias-object-app-foreground, #1b1b1b);
  border-radius: 12px;
  box-shadow: 0 30px 80px rgba(0, 0, 0, 0.35);
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.snap-title {
  margin: 0;
  font-size: 18px;
}
.snap-sub {
  margin: 0;
}
.field {
  width: 100%;
}
.field textarea {
  width: 100%;
  resize: vertical;
}
.snap-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 4px;
}
.muted {
  color: var(--cds-alias-typography-color-300, #565656);
}
.snap-dialog-fade-enter-active,
.snap-dialog-fade-leave-active {
  transition: opacity 0.18s ease;
}
.snap-dialog-fade-enter-from,
.snap-dialog-fade-leave-to {
  opacity: 0;
}
</style>
