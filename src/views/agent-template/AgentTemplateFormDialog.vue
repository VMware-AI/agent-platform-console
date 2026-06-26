<script setup lang="ts">
/**
 * 智能体模板 upsert 表单 (Agent Template create / edit dialog).
 *
 * Mirrors the AgentConfigKnowledgeDialog backdrop/card pattern (Teleport →
 * backdrop → card). Drives `upsertAgentTemplate(input: UpsertAgentTemplateInput)`.
 *
 * `kind` is the catalog identity the backend keys upsert by, so it is editable
 * only when creating; on edit it is shown read-only. Submit emits an immutable
 * draft — the parent performs the mutation and surfaces errors via toast.
 */
import { computed, nextTick, reactive, ref, watch } from 'vue'
import { useLocaleStore } from '@/stores/locale'
import type {
  AgentTemplateNode,
  AgentTemplateStatus,
  InstallMethod,
  UpsertAgentTemplateInput,
} from '@/api/graphql/queries/agent-templates'
import '@/components/icons'

const props = defineProps<{
  open: boolean
  /** The template being edited; null when creating a new one. */
  template: AgentTemplateNode | null
  /** True while the parent's upsertAgentTemplate mutation is in flight. */
  saving?: boolean
}>()

const locale = useLocaleStore()

const emit = defineEmits<{
  (event: 'close'): void
  (event: 'submit', input: UpsertAgentTemplateInput): void
}>()

const INSTALL_METHODS: readonly InstallMethod[] = ['offline_tar', 'curl', 'unset']
const STATUSES: readonly AgentTemplateStatus[] = ['active', 'deferred']

interface FormState {
  kind: string
  display: string
  description: string
  installMethod: InstallMethod
  installCommand: string
  status: AgentTemplateStatus
  version: string
  knowledgeRoot: string
  knowledgePrompt: string
}

function emptyForm(): FormState {
  return {
    kind: '',
    display: '',
    description: '',
    installMethod: 'unset',
    installCommand: '',
    status: 'active',
    version: '',
    knowledgeRoot: '',
    knowledgePrompt: '',
  }
}

const form = reactive<FormState>(emptyForm())

const isEditing = computed(() => Boolean(props.template))

// a11y: focus management. Move focus into the dialog on open, return it to the
// element that triggered the dialog on close, and trap Tab within the card.
const cardEl = ref<HTMLElement | null>(null)
const firstFieldEl = ref<HTMLInputElement | null>(null)
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

// Reset the form whenever the dialog opens (or the edit target changes) so it
// never shows stale values from a previous open.
watch(
  () => [props.open, props.template] as const,
  ([open, template]) => {
    if (!open) {
      if (lastFocused) {
        lastFocused.focus()
        lastFocused = null
      }
      return
    }
    const next = emptyForm()
    if (template) {
      next.kind = template.kind
      next.display = template.display
      next.description = template.description ?? ''
      next.installMethod = template.installMethod
      next.installCommand = template.installCommand ?? ''
      next.status = template.status
      next.version = template.version ?? ''
      next.knowledgeRoot = template.knowledgeRoot ?? ''
      next.knowledgePrompt = template.knowledgePrompt ?? ''
    }
    Object.assign(form, next)
    lastFocused = document.activeElement as HTMLElement | null
    nextTick(() => firstFieldEl.value?.focus())
  },
  { immediate: true },
)

// `kind` and `display` are required by the schema (non-null). Disable submit
// until both are present; trim to reject whitespace-only input.
const canSubmit = computed(
  () => form.kind.trim().length > 0 && form.display.trim().length > 0 && !props.saving,
)

const dialogTitle = computed(() =>
  isEditing.value ? locale.t('agentTemplate.dialog.editTitle') : locale.t('agentTemplate.dialog.createTitle'),
)

// Normalise blank optional strings to null so the backend stores absence rather
// than an empty string.
function blankToNull(value: string): string | null {
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function buildInput(): UpsertAgentTemplateInput {
  return {
    kind: form.kind.trim(),
    display: form.display.trim(),
    description: blankToNull(form.description),
    installMethod: form.installMethod,
    installCommand: blankToNull(form.installCommand),
    status: form.status,
    version: blankToNull(form.version),
    knowledgeRoot: blankToNull(form.knowledgeRoot),
    knowledgePrompt: blankToNull(form.knowledgePrompt),
  }
}

function close() {
  if (!props.saving) emit('close')
}

function onBackdropClick(event: MouseEvent) {
  if (event.target === event.currentTarget) close()
}

function submit() {
  if (!canSubmit.value) return
  emit('submit', buildInput())
}
</script>

<template>
  <Teleport to="body">
    <Transition name="at-fade">
      <div
        v-if="open"
        class="at-backdrop"
        role="dialog"
        aria-modal="true"
        :aria-label="dialogTitle"
        @click="onBackdropClick"
        @keydown="onDialogKeydown"
      >
        <div ref="cardEl" class="at-card" @click.stop>
          <h2 cds-text="section" class="at-title">{{ dialogTitle }}</h2>

          <form class="at-form" @submit.prevent="submit">
            <div class="at-grid">
              <label class="at-field">
                <span class="at-label">
                  {{ locale.t('agentTemplate.field.kind') }}
                  <em class="at-required" aria-hidden="true">*</em>
                </span>
                <cds-input>
                  <input
                    ref="firstFieldEl"
                    v-model="form.kind"
                    type="text"
                    autocomplete="off"
                    :readonly="isEditing"
                    :placeholder="locale.t('agentTemplate.field.kindPlaceholder')"
                    :aria-label="locale.t('agentTemplate.field.kind')"
                    :aria-required="!isEditing"
                  />
                </cds-input>
                <small v-if="isEditing" class="at-hint muted">
                  {{ locale.t('agentTemplate.field.kindLocked') }}
                </small>
              </label>

              <label class="at-field">
                <span class="at-label">
                  {{ locale.t('agentTemplate.field.display') }}
                  <em class="at-required" aria-hidden="true">*</em>
                </span>
                <cds-input>
                  <input
                    v-model="form.display"
                    type="text"
                    autocomplete="off"
                    :placeholder="locale.t('agentTemplate.field.displayPlaceholder')"
                    :aria-label="locale.t('agentTemplate.field.display')"
                    aria-required="true"
                  />
                </cds-input>
              </label>

              <label class="at-field">
                <span class="at-label">{{ locale.t('agentTemplate.field.status') }}</span>
                <cds-select>
                  <select v-model="form.status" :aria-label="locale.t('agentTemplate.field.status')">
                    <option v-for="value in STATUSES" :key="value" :value="value">
                      {{ locale.t(`agentTemplate.status.${value}`) }}
                    </option>
                  </select>
                </cds-select>
              </label>

              <label class="at-field">
                <span class="at-label">{{ locale.t('agentTemplate.field.version') }}</span>
                <cds-input>
                  <input
                    v-model="form.version"
                    type="text"
                    autocomplete="off"
                    :placeholder="locale.t('agentTemplate.field.versionPlaceholder')"
                    :aria-label="locale.t('agentTemplate.field.version')"
                  />
                </cds-input>
              </label>

              <label class="at-field">
                <span class="at-label">{{ locale.t('agentTemplate.field.installMethod') }}</span>
                <cds-select>
                  <select
                    v-model="form.installMethod"
                    :aria-label="locale.t('agentTemplate.field.installMethod')"
                  >
                    <option v-for="value in INSTALL_METHODS" :key="value" :value="value">
                      {{ locale.t(`agentTemplate.installMethod.${value}`) }}
                    </option>
                  </select>
                </cds-select>
              </label>

              <label class="at-field at-span-2">
                <span class="at-label">{{ locale.t('agentTemplate.field.installCommand') }}</span>
                <cds-input>
                  <input
                    v-model="form.installCommand"
                    type="text"
                    autocomplete="off"
                    :placeholder="locale.t('agentTemplate.field.installCommandPlaceholder')"
                    :aria-label="locale.t('agentTemplate.field.installCommand')"
                  />
                </cds-input>
              </label>

              <label class="at-field at-span-2">
                <span class="at-label">{{ locale.t('agentTemplate.field.description') }}</span>
                <cds-textarea>
                  <textarea
                    v-model="form.description"
                    rows="2"
                    :placeholder="locale.t('agentTemplate.field.descriptionPlaceholder')"
                    :aria-label="locale.t('agentTemplate.field.description')"
                  ></textarea>
                </cds-textarea>
              </label>

              <label class="at-field at-span-2">
                <span class="at-label">{{ locale.t('agentTemplate.field.knowledgeRoot') }}</span>
                <cds-input>
                  <input
                    v-model="form.knowledgeRoot"
                    type="text"
                    autocomplete="off"
                    :placeholder="locale.t('agentTemplate.field.knowledgeRootPlaceholder')"
                    :aria-label="locale.t('agentTemplate.field.knowledgeRoot')"
                  />
                </cds-input>
              </label>

              <label class="at-field at-span-2">
                <span class="at-label">{{ locale.t('agentTemplate.field.knowledgePrompt') }}</span>
                <cds-textarea>
                  <textarea
                    v-model="form.knowledgePrompt"
                    rows="3"
                    :placeholder="locale.t('agentTemplate.field.knowledgePromptPlaceholder')"
                    :aria-label="locale.t('agentTemplate.field.knowledgePrompt')"
                  ></textarea>
                </cds-textarea>
              </label>
            </div>

            <div class="at-actions">
              <cds-button type="button" action="outline" :disabled="saving" @click="close">
                {{ locale.t('agentTemplate.action.cancel') }}
              </cds-button>
              <cds-button
                type="submit"
                action="solid"
                status="primary"
                :loading-state="saving ? 'loading' : 'default'"
                :disabled="!canSubmit"
              >
                {{ locale.t('agentTemplate.action.save') }}
              </cds-button>
            </div>
          </form>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.at-backdrop {
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
.at-card {
  width: min(640px, 100%);
  max-height: min(90vh, 760px);
  display: flex;
  flex-direction: column;
  background: var(--cds-alias-object-container-background, #ffffff);
  color: var(--cds-alias-object-app-foreground, #1b1b1b);
  border-radius: 12px;
  box-shadow: 0 30px 80px rgba(0, 0, 0, 0.35);
  padding: 24px;
  gap: 16px;
}
.at-title {
  margin: 0;
  font-size: 18px;
}
.at-form {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-height: 0;
}
.at-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px 16px;
  overflow: auto;
  padding-right: 4px;
}
.at-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}
.at-span-2 {
  grid-column: 1 / -1;
}
.at-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--cds-alias-typography-color-300, #565656);
}
.at-required {
  color: var(--cds-alias-status-danger, #c92100);
  font-style: normal;
}
.at-field cds-input,
.at-field cds-select,
.at-field cds-textarea {
  width: 100%;
}
.at-field input,
.at-field select,
.at-field textarea {
  width: 100%;
}
.at-field textarea {
  resize: vertical;
  font: inherit;
}
.at-hint {
  font-size: 11px;
}
.at-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  flex: 0 0 auto;
}
.muted {
  color: var(--cds-alias-typography-color-300, #565656);
}
.at-fade-enter-active,
.at-fade-leave-active {
  transition: opacity 0.18s ease;
}
.at-fade-enter-from,
.at-fade-leave-to {
  opacity: 0;
}
</style>
