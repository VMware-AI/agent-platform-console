<script setup lang="ts">
/**
 * 制品编辑器 (Artifact create / edit form).
 *
 * Drives `upsertArtifact`. The backend keys upsert by (name, version) within the
 * caller's tenant, so:
 *   - "create" starts blank.
 *   - "new version" pre-fills name+kind from the selected artifact, blank version.
 *   - "edit" pre-fills every field of the selected version row.
 *
 * `content` is inline text for config/script/knowledge artifacts (≤64K) and is
 * rejected by the backend for kind=package, so the textarea is disabled when
 * kind=package. Mirrors the AgentConfigKnowledgeDialog backdrop/card pattern.
 */
import { computed, nextTick, reactive, ref, watch } from 'vue'
import { useLocaleStore } from '@/stores/locale'
import {
  ARTIFACT_KINDS,
  type ArtifactKind,
  type ArtifactNode,
  type UpsertArtifactInputVars,
} from '@/api/graphql/queries/artifacts'
import '@/components/icons'

const props = defineProps<{
  open: boolean
  /** Pre-fill source. null → blank create form. */
  initial: ArtifactNode | null
  /** When true keep name+kind locked (editing an existing version). */
  lockIdentity?: boolean
  /** True while the parent's upsertArtifact mutation is in flight. */
  saving?: boolean
  /** Dialog heading. */
  title: string
}>()

const locale = useLocaleStore()

const emit = defineEmits<{
  (event: 'close'): void
  (event: 'submit', input: UpsertArtifactInputVars): void
}>()

interface FormState {
  name: string
  kind: ArtifactKind
  version: string
  uri: string
  content: string
  sha256: string
}

function blankForm(): FormState {
  return { name: '', kind: 'config', version: '', uri: '', content: '', sha256: '' }
}

const form = reactive<FormState>(blankForm())
const submitted = ref(false)

// a11y: focus management. Move focus into the dialog on open, return it to the
// triggering element on close, and trap Tab within the card (mirrors
// CreateSnapshotDialog).
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

function onDialogKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    event.stopPropagation()
    close()
    return
  }
  if (event.key !== 'Tab') return
  const focusable = focusableInCard()
  if (focusable.length === 0) return
  const first = focusable[0]
  const last = focusable[focusable.length - 1]
  const active = document.activeElement as HTMLElement | null
  if (event.shiftKey && active === first) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && active === last) {
    event.preventDefault()
    first.focus()
  }
}

watch(
  () => [props.open, props.initial] as const,
  ([open]) => {
    if (!open) {
      if (lastFocused) {
        lastFocused.focus()
        lastFocused = null
      }
      return
    }
    submitted.value = false
    const src = props.initial
    form.name = src?.name ?? ''
    form.kind = src?.kind ?? 'config'
    form.version = src?.version ?? ''
    form.uri = src?.uri ?? ''
    form.content = src?.content ?? ''
    form.sha256 = src?.sha256 ?? ''
    lastFocused = document.activeElement as HTMLElement | null
    // Focus the first enabled field; name is disabled when identity is locked.
    nextTick(() => {
      const focusable = focusableInCard()
      if (firstFieldEl.value && !firstFieldEl.value.disabled) firstFieldEl.value.focus()
      else focusable[0]?.focus()
    })
  },
  { immediate: true },
)

const isPackage = computed(() => form.kind === 'package')

const nameValid = computed(() => form.name.trim().length > 0)
const versionValid = computed(() => form.version.trim().length > 0)
const uriValid = computed(() => form.uri.trim().length > 0)
const canSubmit = computed(() => nameValid.value && versionValid.value && uriValid.value)

function close() {
  if (!props.saving) emit('close')
}

function onBackdropClick(event: MouseEvent) {
  if (event.target === event.currentTarget) close()
}

function submit() {
  submitted.value = true
  if (props.saving || !canSubmit.value) return
  // Build an immutable input; omit content for packages (backend rejects it),
  // and send null for empty optional strings rather than "".
  const trimmedContent = form.content.trim()
  const trimmedSha = form.sha256.trim()
  const input: UpsertArtifactInputVars = {
    name: form.name.trim(),
    kind: form.kind,
    version: form.version.trim(),
    uri: form.uri.trim(),
    content: isPackage.value ? null : trimmedContent.length > 0 ? trimmedContent : null,
    sha256: trimmedSha.length > 0 ? trimmedSha : null,
  }
  emit('submit', input)
}
</script>

<template>
  <Teleport to="body">
    <Transition name="af-fade">
      <div
        v-if="open"
        class="af-backdrop"
        role="dialog"
        aria-modal="true"
        :aria-label="title"
        @click="onBackdropClick"
        @keydown="onDialogKeydown"
      >
        <div ref="cardEl" class="af-card" @click.stop>
          <h2 cds-text="section" class="af-title">{{ title }}</h2>

          <form class="af-form" @submit.prevent="submit">
            <label class="af-field">
              <span class="af-label">{{ locale.t('artifacts.form.name') }} *</span>
              <cds-input>
                <input
                  ref="firstFieldEl"
                  v-model="form.name"
                  type="text"
                  autocomplete="off"
                  :disabled="lockIdentity || saving"
                  :aria-label="locale.t('artifacts.form.name')"
                  :placeholder="locale.t('artifacts.form.namePlaceholder')"
                  :aria-invalid="submitted && !nameValid"
                  :aria-describedby="submitted && !nameValid ? 'af-name-error' : undefined"
                />
              </cds-input>
              <small v-if="submitted && !nameValid" id="af-name-error" class="af-error">
                {{ locale.t('artifacts.form.required') }}
              </small>
            </label>

            <div class="af-row">
              <label class="af-field">
                <span class="af-label">{{ locale.t('artifacts.form.kind') }} *</span>
                <cds-select>
                  <select
                    v-model="form.kind"
                    :disabled="lockIdentity || saving"
                    :aria-label="locale.t('artifacts.form.kind')"
                  >
                    <option v-for="k in ARTIFACT_KINDS" :key="k" :value="k">
                      {{ locale.t('artifacts.kind.' + k) }}
                    </option>
                  </select>
                </cds-select>
              </label>

              <label class="af-field">
                <span class="af-label">{{ locale.t('artifacts.form.version') }} *</span>
                <cds-input>
                  <input
                    v-model="form.version"
                    type="text"
                    autocomplete="off"
                    :disabled="saving"
                    :aria-label="locale.t('artifacts.form.version')"
                    :placeholder="locale.t('artifacts.form.versionPlaceholder')"
                    :aria-invalid="submitted && !versionValid"
                    :aria-describedby="submitted && !versionValid ? 'af-version-error' : undefined"
                  />
                </cds-input>
                <small v-if="submitted && !versionValid" id="af-version-error" class="af-error">
                  {{ locale.t('artifacts.form.required') }}
                </small>
              </label>
            </div>

            <label class="af-field">
              <span class="af-label">{{ locale.t('artifacts.form.uri') }} *</span>
              <cds-input>
                <input
                  v-model="form.uri"
                  type="text"
                  autocomplete="off"
                  :disabled="saving"
                  :aria-label="locale.t('artifacts.form.uri')"
                  :placeholder="locale.t('artifacts.form.uriPlaceholder')"
                  :aria-invalid="submitted && !uriValid"
                  :aria-describedby="submitted && !uriValid ? 'af-uri-error' : undefined"
                />
              </cds-input>
              <small v-if="submitted && !uriValid" id="af-uri-error" class="af-error">
                {{ locale.t('artifacts.form.required') }}
              </small>
            </label>

            <label class="af-field">
              <span class="af-label">{{ locale.t('artifacts.form.sha256') }}</span>
              <cds-input>
                <input
                  v-model="form.sha256"
                  type="text"
                  autocomplete="off"
                  :disabled="saving"
                  :aria-label="locale.t('artifacts.form.sha256')"
                  :placeholder="locale.t('artifacts.form.sha256Placeholder')"
                />
              </cds-input>
            </label>

            <label class="af-field">
              <span class="af-label">{{ locale.t('artifacts.form.content') }}</span>
              <textarea
                v-model="form.content"
                class="af-textarea"
                rows="5"
                :disabled="isPackage || saving"
                :aria-label="locale.t('artifacts.form.content')"
                aria-describedby="af-content-hint"
                :placeholder="
                  isPackage ? locale.t('artifacts.form.contentPackageHint') : locale.t('artifacts.form.contentPlaceholder')
                "
              ></textarea>
              <small id="af-content-hint" class="af-hint muted">
                {{ isPackage ? locale.t('artifacts.form.contentPackageHint') : locale.t('artifacts.form.contentHint') }}
              </small>
            </label>

            <div class="af-actions">
              <cds-button type="button" action="outline" :disabled="saving" @click="close">
                {{ locale.t('artifacts.form.cancel') }}
              </cds-button>
              <cds-button
                type="submit"
                action="solid"
                status="primary"
                :loading-state="saving ? 'loading' : 'default'"
                :disabled="saving"
              >
                {{ locale.t('artifacts.form.save') }}
              </cds-button>
            </div>
          </form>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.af-backdrop {
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
.af-card {
  width: min(560px, 100%);
  max-height: min(92vh, 760px);
  display: flex;
  flex-direction: column;
  background: var(--cds-alias-object-container-background, #ffffff);
  color: var(--cds-alias-object-app-foreground, #1b1b1b);
  border-radius: 12px;
  box-shadow: 0 30px 80px rgba(0, 0, 0, 0.35);
  padding: 24px;
  gap: 14px;
  overflow: auto;
}
.af-title {
  margin: 0;
  font-size: 18px;
}
.af-form {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.af-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}
.af-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}
.af-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--cds-alias-typography-color-300, #565656);
}
.af-textarea {
  width: 100%;
  font: inherit;
  font-family: var(--cds-global-typography-font-family-monospace, monospace);
  font-size: 13px;
  padding: 8px 10px;
  border: 1px solid var(--cds-alias-object-border-color, #d7d7d7);
  border-radius: 4px;
  background: var(--cds-alias-object-container-background, #fff);
  color: var(--cds-alias-object-app-foreground, #1b1b1b);
  resize: vertical;
  box-sizing: border-box;
}
.af-textarea:disabled {
  opacity: 0.6;
}
.af-hint {
  font-size: 11px;
}
.af-error {
  font-size: 11px;
  color: var(--cds-alias-status-danger, #c92100);
}
.af-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 4px;
}
.muted {
  color: var(--cds-alias-typography-color-300, #565656);
}
.af-fade-enter-active,
.af-fade-leave-active {
  transition: opacity 0.18s ease;
}
.af-fade-enter-from,
.af-fade-leave-to {
  opacity: 0;
}
@media (max-width: 560px) {
  .af-row {
    grid-template-columns: 1fr;
  }
}
</style>
