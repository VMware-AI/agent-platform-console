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
import { computed, reactive, watch } from 'vue'
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
  /** Local fallback translator (agentTemplate.* keys not yet in the locale store). */
  tt: (key: string) => string
}>()

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

// Reset the form whenever the dialog opens (or the edit target changes) so it
// never shows stale values from a previous open.
watch(
  () => [props.open, props.template] as const,
  ([open, template]) => {
    if (!open) return
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
  },
  { immediate: true },
)

// `kind` and `display` are required by the schema (non-null). Disable submit
// until both are present; trim to reject whitespace-only input.
const canSubmit = computed(
  () => form.kind.trim().length > 0 && form.display.trim().length > 0 && !props.saving,
)

const dialogTitle = computed(() =>
  isEditing.value ? props.tt('agentTemplate.dialog.editTitle') : props.tt('agentTemplate.dialog.createTitle'),
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
      >
        <div class="at-card" @click.stop>
          <h2 cds-text="section" class="at-title">{{ dialogTitle }}</h2>

          <form class="at-form" @submit.prevent="submit">
            <div class="at-grid">
              <label class="at-field">
                <span class="at-label">
                  {{ tt('agentTemplate.field.kind') }}
                  <em class="at-required" aria-hidden="true">*</em>
                </span>
                <cds-input>
                  <input
                    v-model="form.kind"
                    type="text"
                    autocomplete="off"
                    :readonly="isEditing"
                    :placeholder="tt('agentTemplate.field.kindPlaceholder')"
                    :aria-label="tt('agentTemplate.field.kind')"
                  />
                </cds-input>
                <small v-if="isEditing" class="at-hint muted">
                  {{ tt('agentTemplate.field.kindLocked') }}
                </small>
              </label>

              <label class="at-field">
                <span class="at-label">
                  {{ tt('agentTemplate.field.display') }}
                  <em class="at-required" aria-hidden="true">*</em>
                </span>
                <cds-input>
                  <input
                    v-model="form.display"
                    type="text"
                    autocomplete="off"
                    :placeholder="tt('agentTemplate.field.displayPlaceholder')"
                    :aria-label="tt('agentTemplate.field.display')"
                  />
                </cds-input>
              </label>

              <label class="at-field">
                <span class="at-label">{{ tt('agentTemplate.field.status') }}</span>
                <cds-select>
                  <select v-model="form.status" :aria-label="tt('agentTemplate.field.status')">
                    <option v-for="value in STATUSES" :key="value" :value="value">
                      {{ tt(`agentTemplate.status.${value}`) }}
                    </option>
                  </select>
                </cds-select>
              </label>

              <label class="at-field">
                <span class="at-label">{{ tt('agentTemplate.field.version') }}</span>
                <cds-input>
                  <input
                    v-model="form.version"
                    type="text"
                    autocomplete="off"
                    :placeholder="tt('agentTemplate.field.versionPlaceholder')"
                    :aria-label="tt('agentTemplate.field.version')"
                  />
                </cds-input>
              </label>

              <label class="at-field">
                <span class="at-label">{{ tt('agentTemplate.field.installMethod') }}</span>
                <cds-select>
                  <select
                    v-model="form.installMethod"
                    :aria-label="tt('agentTemplate.field.installMethod')"
                  >
                    <option v-for="value in INSTALL_METHODS" :key="value" :value="value">
                      {{ tt(`agentTemplate.installMethod.${value}`) }}
                    </option>
                  </select>
                </cds-select>
              </label>

              <label class="at-field at-span-2">
                <span class="at-label">{{ tt('agentTemplate.field.installCommand') }}</span>
                <cds-input>
                  <input
                    v-model="form.installCommand"
                    type="text"
                    autocomplete="off"
                    :placeholder="tt('agentTemplate.field.installCommandPlaceholder')"
                    :aria-label="tt('agentTemplate.field.installCommand')"
                  />
                </cds-input>
              </label>

              <label class="at-field at-span-2">
                <span class="at-label">{{ tt('agentTemplate.field.description') }}</span>
                <cds-textarea>
                  <textarea
                    v-model="form.description"
                    rows="2"
                    :placeholder="tt('agentTemplate.field.descriptionPlaceholder')"
                    :aria-label="tt('agentTemplate.field.description')"
                  ></textarea>
                </cds-textarea>
              </label>

              <label class="at-field at-span-2">
                <span class="at-label">{{ tt('agentTemplate.field.knowledgeRoot') }}</span>
                <cds-input>
                  <input
                    v-model="form.knowledgeRoot"
                    type="text"
                    autocomplete="off"
                    :placeholder="tt('agentTemplate.field.knowledgeRootPlaceholder')"
                    :aria-label="tt('agentTemplate.field.knowledgeRoot')"
                  />
                </cds-input>
              </label>

              <label class="at-field at-span-2">
                <span class="at-label">{{ tt('agentTemplate.field.knowledgePrompt') }}</span>
                <cds-textarea>
                  <textarea
                    v-model="form.knowledgePrompt"
                    rows="3"
                    :placeholder="tt('agentTemplate.field.knowledgePromptPlaceholder')"
                    :aria-label="tt('agentTemplate.field.knowledgePrompt')"
                  ></textarea>
                </cds-textarea>
              </label>
            </div>

            <div class="at-actions">
              <cds-button type="button" action="outline" :disabled="saving" @click="close">
                {{ tt('agentTemplate.action.cancel') }}
              </cds-button>
              <cds-button
                type="submit"
                action="solid"
                status="primary"
                :loading-state="saving ? 'loading' : 'default'"
                :disabled="!canSubmit"
              >
                {{ tt('agentTemplate.action.save') }}
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
