<script setup lang="ts">
/**
 * 镜像创建 / 编辑对话框 (Harbor image upsert form).
 *
 * UX: a small form over repository / tag / digest / signed. On submit it emits
 * the immutable draft; the parent calls `upsertImage(input)` then refetches.
 * Editing an existing image pre-fills and LOCKS repository+tag (the backend
 * upserts on that pair, so editing them would fork a new row rather than rename;
 * digest/signed stay editable). Mirrors the
 * AgentConfigKnowledgeDialog backdrop/card pattern.
 */
import { computed, ref, watch } from 'vue'
import { useLocaleStore } from '@/stores/locale'
import type { ImageNode } from '@/api/graphql/queries/images'
import '@/components/icons'

const props = defineProps<{
  open: boolean
  /** The image being edited (null → create). Drives the title + pre-filled fields. */
  image: ImageNode | null
  /** True while the parent's upsertImage mutation is in flight. */
  saving?: boolean
}>()

const locale = useLocaleStore()

const emit = defineEmits<{
  (event: 'close'): void
  (event: 'submit', draft: { repository: string; tag: string; digest: string; signed: boolean }): void
}>()

const repository = ref('')
const tag = ref('')
const digest = ref('')
const signed = ref(false)

const isEditing = computed(() => props.image !== null)

// Reset the form whenever the dialog (re)opens so stale input never leaks
// between create/edit sessions. New objects only — no in-place mutation.
watch(
  () => [props.open, props.image] as const,
  ([open, image]) => {
    if (!open) return
    repository.value = image?.repository ?? ''
    tag.value = image?.tag ?? ''
    digest.value = image?.digest ?? ''
    signed.value = image?.signed ?? false
  },
  { immediate: true },
)

const canSubmit = computed(
  () => repository.value.trim().length > 0 && tag.value.trim().length > 0,
)

function close() {
  if (!props.saving) emit('close')
}

function onBackdropClick(event: MouseEvent) {
  if (event.target === event.currentTarget) close()
}

function submit() {
  if (props.saving || !canSubmit.value) return
  emit('submit', {
    repository: repository.value.trim(),
    tag: tag.value.trim(),
    digest: digest.value.trim(),
    signed: signed.value,
  })
}
</script>

<template>
  <Teleport to="body">
    <Transition name="img-fade">
      <div
        v-if="open"
        class="img-backdrop"
        role="dialog"
        aria-modal="true"
        :aria-label="locale.t(isEditing ? 'image.dialog.editTitle' : 'image.dialog.createTitle')"
        @click="onBackdropClick"
      >
        <form class="img-card" @click.stop @submit.prevent="submit">
          <h2 cds-text="section" class="img-title">
            {{ locale.t(isEditing ? 'image.dialog.editTitle' : 'image.dialog.createTitle') }}
          </h2>

          <label class="img-field">
            <span class="img-label">{{ locale.t('image.field.repository') }}</span>
            <cds-input>
              <input
                v-model="repository"
                type="text"
                autocomplete="off"
                required
                :disabled="isEditing"
                :placeholder="locale.t('image.field.repositoryPlaceholder')"
                :aria-label="locale.t('image.field.repository')"
              />
            </cds-input>
          </label>

          <label class="img-field">
            <span class="img-label">{{ locale.t('image.field.tag') }}</span>
            <cds-input>
              <input
                v-model="tag"
                type="text"
                autocomplete="off"
                required
                :disabled="isEditing"
                :placeholder="locale.t('image.field.tagPlaceholder')"
                :aria-label="locale.t('image.field.tag')"
              />
            </cds-input>
          </label>

          <label class="img-field">
            <span class="img-label">{{ locale.t('image.field.digest') }}</span>
            <cds-input>
              <input
                v-model="digest"
                type="text"
                autocomplete="off"
                :placeholder="locale.t('image.field.digestPlaceholder')"
                :aria-label="locale.t('image.field.digest')"
              />
            </cds-input>
            <small class="img-hint muted">{{ locale.t('image.field.digestHint') }}</small>
          </label>

          <label class="img-check">
            <input v-model="signed" type="checkbox" class="app-checkbox" />
            <span>{{ locale.t('image.field.signed') }}</span>
          </label>

          <div class="img-actions">
            <cds-button type="button" action="outline" :disabled="saving" @click="close">
              {{ locale.t('image.dialog.cancel') }}
            </cds-button>
            <cds-button
              type="submit"
              action="solid"
              status="primary"
              :loading-state="saving ? 'loading' : 'default'"
              :disabled="saving || !canSubmit"
            >
              {{ locale.t('image.dialog.save') }}
            </cds-button>
          </div>
        </form>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.img-backdrop {
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
.img-card {
  width: min(480px, 100%);
  max-height: min(90vh, 720px);
  display: flex;
  flex-direction: column;
  gap: 14px;
  overflow: auto;
  background: var(--cds-alias-object-container-background, #ffffff);
  color: var(--cds-alias-object-app-foreground, #1b1b1b);
  border-radius: 12px;
  box-shadow: 0 30px 80px rgba(0, 0, 0, 0.35);
  padding: 24px;
}
.img-title {
  margin: 0;
  font-size: 18px;
}
.img-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.img-label {
  font-size: 13px;
  font-weight: 600;
}
.img-field cds-input {
  width: 100%;
}
.img-hint {
  font-size: 12px;
}
.img-check {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  cursor: pointer;
}
.app-checkbox {
  width: 16px;
  height: 16px;
  accent-color: var(--cds-alias-object-interaction-color, #0072a3);
}
.img-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 4px;
}
.muted {
  color: var(--cds-alias-typography-color-300, #565656);
}
.img-fade-enter-active,
.img-fade-leave-active {
  transition: opacity 0.18s ease;
}
.img-fade-enter-from,
.img-fade-leave-to {
  opacity: 0;
}
</style>
