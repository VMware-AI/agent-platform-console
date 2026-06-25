<script setup lang="ts">
/**
 * 上游编辑器 (Upstream upsert form).
 *
 * UX: a modal form for creating / editing an Upstream. `upsertUpstream` keys by
 * `name`, so on edit the name is shown read-only (changing it would mint a new
 * upstream). apiKey is write-only — the backend stores it in the secret store and
 * never reads it back, so the field is always blank on open and only sent when the
 * operator types a value. Mirrors AgentConfigKnowledgeDialog's backdrop/card.
 */
import { computed, reactive, watch } from 'vue'
import {
  UPSTREAM_PROVIDERS,
  type UpstreamNode,
  type UpstreamProvider,
  type UpsertUpstreamRoutingVars,
} from '@/api/graphql/queries/gateway-routing'
import '@/components/icons'

const props = defineProps<{
  open: boolean
  /** The upstream being edited; null for create. */
  upstream: UpstreamNode | null
  /** True while the parent's upsertUpstream mutation is in flight. */
  saving?: boolean
  /** Local fallback translator (upstreamRouter.* keys not in the locale store). */
  tt: (key: string) => string
}>()

const emit = defineEmits<{
  (event: 'close'): void
  (event: 'submit', input: UpsertUpstreamRoutingVars['input']): void
}>()

interface FormState {
  name: string
  provider: UpstreamProvider
  apiBase: string
  apiKey: string
  model: string
  enabled: boolean
}

function emptyForm(): FormState {
  return { name: '', provider: 'openai', apiBase: '', apiKey: '', model: '', enabled: true }
}

const form = reactive<FormState>(emptyForm())

const isEditing = computed(() => Boolean(props.upstream))

// Reset the form whenever the dialog opens; apiKey always starts blank (write-only).
watch(
  () => [props.open, props.upstream] as const,
  ([open]) => {
    if (!open) return
    const source = props.upstream
    Object.assign(
      form,
      source
        ? {
            name: source.name,
            provider: source.provider,
            apiBase: source.apiBase ?? '',
            apiKey: '',
            model: source.model,
            enabled: source.enabled,
          }
        : emptyForm(),
    )
  },
  { immediate: true },
)

const canSubmit = computed(
  () => form.name.trim().length > 0 && form.model.trim().length > 0 && !props.saving,
)

function close() {
  if (!props.saving) emit('close')
}

function onBackdropClick(event: MouseEvent) {
  if (event.target === event.currentTarget) close()
}

function submit() {
  if (!canSubmit.value) return
  const apiBase = form.apiBase.trim()
  const apiKey = form.apiKey.trim()
  // Build a fresh input object (immutable); only send apiKey when the operator
  // typed one, and apiBase only when non-empty.
  emit('submit', {
    name: form.name.trim(),
    provider: form.provider,
    model: form.model.trim(),
    enabled: form.enabled,
    ...(apiBase ? { apiBase } : {}),
    ...(apiKey ? { apiKey } : {}),
  })
}
</script>

<template>
  <Teleport to="body">
    <Transition name="uf-fade">
      <div
        v-if="open"
        class="uf-backdrop"
        role="dialog"
        aria-modal="true"
        :aria-label="tt(isEditing ? 'upstreamRouter.upstream.dialog.editTitle' : 'upstreamRouter.upstream.dialog.createTitle')"
        @click="onBackdropClick"
      >
        <div class="uf-card" @click.stop>
          <h2 cds-text="section" class="uf-title">
            {{ tt(isEditing ? 'upstreamRouter.upstream.dialog.editTitle' : 'upstreamRouter.upstream.dialog.createTitle') }}
          </h2>

          <form class="uf-form" @submit.prevent="submit">
            <label class="uf-field">
              <span class="uf-label">{{ tt('upstreamRouter.upstream.field.name') }}</span>
              <cds-input>
                <input
                  v-model="form.name"
                  type="text"
                  autocomplete="off"
                  :readonly="isEditing"
                  :placeholder="tt('upstreamRouter.upstream.field.namePlaceholder')"
                  :aria-label="tt('upstreamRouter.upstream.field.name')"
                />
              </cds-input>
              <small v-if="isEditing" class="uf-hint muted">
                {{ tt('upstreamRouter.upstream.field.nameLocked') }}
              </small>
            </label>

            <label class="uf-field">
              <span class="uf-label">{{ tt('upstreamRouter.upstream.field.provider') }}</span>
              <cds-select>
                <select
                  v-model="form.provider"
                  :aria-label="tt('upstreamRouter.upstream.field.provider')"
                >
                  <option v-for="option in UPSTREAM_PROVIDERS" :key="option" :value="option">
                    {{ tt(`upstreamRouter.provider.${option}`) }}
                  </option>
                </select>
              </cds-select>
            </label>

            <label class="uf-field">
              <span class="uf-label">{{ tt('upstreamRouter.upstream.field.model') }}</span>
              <cds-input>
                <input
                  v-model="form.model"
                  type="text"
                  autocomplete="off"
                  :placeholder="tt('upstreamRouter.upstream.field.modelPlaceholder')"
                  :aria-label="tt('upstreamRouter.upstream.field.model')"
                />
              </cds-input>
            </label>

            <label class="uf-field">
              <span class="uf-label">{{ tt('upstreamRouter.upstream.field.apiBase') }}</span>
              <cds-input>
                <input
                  v-model="form.apiBase"
                  type="url"
                  autocomplete="off"
                  :placeholder="tt('upstreamRouter.upstream.field.apiBasePlaceholder')"
                  :aria-label="tt('upstreamRouter.upstream.field.apiBase')"
                />
              </cds-input>
            </label>

            <label class="uf-field">
              <span class="uf-label">{{ tt('upstreamRouter.upstream.field.apiKey') }}</span>
              <cds-input>
                <input
                  v-model="form.apiKey"
                  type="password"
                  autocomplete="new-password"
                  :placeholder="tt(isEditing ? 'upstreamRouter.upstream.field.apiKeyEditPlaceholder' : 'upstreamRouter.upstream.field.apiKeyPlaceholder')"
                  :aria-label="tt('upstreamRouter.upstream.field.apiKey')"
                />
              </cds-input>
              <small class="uf-hint muted">{{ tt('upstreamRouter.upstream.field.apiKeyHint') }}</small>
            </label>

            <label class="uf-checkbox-field">
              <input
                v-model="form.enabled"
                type="checkbox"
                class="app-checkbox"
                :aria-label="tt('upstreamRouter.upstream.field.enabled')"
              />
              <span>{{ tt('upstreamRouter.upstream.field.enabled') }}</span>
            </label>
          </form>

          <div class="uf-actions">
            <cds-button type="button" action="outline" :disabled="saving" @click="close">
              {{ tt('upstreamRouter.action.cancel') }}
            </cds-button>
            <cds-button
              type="button"
              action="solid"
              status="primary"
              :loading-state="saving ? 'loading' : 'default'"
              :disabled="!canSubmit"
              @click="submit"
            >
              {{ tt('upstreamRouter.action.save') }}
            </cds-button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.uf-backdrop {
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
.uf-card {
  width: min(520px, 100%);
  max-height: min(90vh, 760px);
  display: flex;
  flex-direction: column;
  background: var(--cds-alias-object-container-background, #ffffff);
  color: var(--cds-alias-object-app-foreground, #1b1b1b);
  border-radius: 12px;
  box-shadow: 0 30px 80px rgba(0, 0, 0, 0.35);
  padding: 24px;
  gap: 14px;
}
.uf-title {
  margin: 0;
  font-size: 18px;
}
.uf-form {
  display: flex;
  flex-direction: column;
  gap: 14px;
  overflow: auto;
}
.uf-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.uf-label {
  font-size: 13px;
  font-weight: 600;
}
.uf-field cds-input,
.uf-field cds-select {
  width: 100%;
}
.uf-hint {
  font-size: 12px;
}
.uf-checkbox-field {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  cursor: pointer;
}
.uf-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
.app-checkbox {
  width: 16px;
  height: 16px;
  accent-color: var(--cds-alias-object-interaction-color, #0072a3);
}
.muted {
  color: var(--cds-alias-typography-color-300, #565656);
}
.uf-fade-enter-active,
.uf-fade-leave-active {
  transition: opacity 0.18s ease;
}
.uf-fade-enter-from,
.uf-fade-leave-to {
  opacity: 0;
}
</style>
