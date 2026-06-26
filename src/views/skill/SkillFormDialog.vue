<script setup lang="ts">
/**
 * Skill create / edit dialog (技能管理). Mirrors RateLimitPolicyFormModal:
 * a cds-modal form that emits a `submit` draft to the parent, which performs the
 * upsertSkill mutation. Both create and edit go through upsertSkill — there is no
 * separate create op in the schema.
 */
import { computed, ref, watch } from 'vue'
import { useLocaleStore } from '@/stores/locale'
import type { SkillNode, UpsertSkillInput } from '@/api/graphql/queries/skills'

const props = defineProps<{
  open: boolean
  skill: SkillNode | null
  saving?: boolean
}>()

const emit = defineEmits<{
  (event: 'close'): void
  (event: 'submit', draft: UpsertSkillInput): void
}>()

const locale = useLocaleStore()

const name = ref('')
const version = ref('')
const uri = ref('')
const description = ref('')
const attempted = ref(false)

const isEditing = computed(() => Boolean(props.skill))
const nameValid = computed(() => {
  const length = name.value.trim().length
  return length >= 2 && length <= 128
})
const versionValid = computed(() => version.value.trim().length > 0)
const uriValid = computed(() => uri.value.trim().length > 0)
const formValid = computed(() => nameValid.value && versionValid.value && uriValid.value)

function reset() {
  name.value = props.skill?.name ?? ''
  version.value = props.skill?.version ?? ''
  uri.value = props.skill?.uri ?? ''
  description.value = props.skill?.description ?? ''
  attempted.value = false
}

watch(
  () => [props.open, props.skill] as const,
  ([open]) => {
    if (open) reset()
  },
  { immediate: true },
)

function close() {
  if (!props.saving) emit('close')
}

function submit() {
  attempted.value = true
  if (!formValid.value || props.saving) return
  const trimmedDescription = description.value.trim()
  emit('submit', {
    name: name.value.trim(),
    version: version.value.trim(),
    uri: uri.value.trim(),
    description: trimmedDescription.length > 0 ? trimmedDescription : null,
  })
}
</script>

<template>
  <cds-modal :hidden="!open" :closable="!saving" size="md" @closeChange="close">
    <cds-modal-header>
      <h2 cds-text="title" class="modal-title">
        {{ locale.t(isEditing ? 'skill.form.editTitle' : 'skill.form.createTitle') }}
      </h2>
    </cds-modal-header>

    <cds-modal-content>
      <form class="skill-form" @submit.prevent="submit">
        <cds-input :status="attempted && !nameValid ? 'error' : 'neutral'">
          <label for="skill-form-name">{{ locale.t('skill.form.name') }}</label>
          <input
            id="skill-form-name"
            :value="name"
            maxlength="128"
            autocomplete="off"
            :disabled="isEditing"
            :placeholder="locale.t('skill.form.namePlaceholder')"
            :aria-invalid="attempted && !nameValid"
            :aria-describedby="attempted && !nameValid ? 'skill-form-name-error' : undefined"
            @input="name = ($event.target as HTMLInputElement).value"
          />
          <cds-control-message v-if="attempted && !nameValid" id="skill-form-name-error" status="error">
            {{ locale.t('skill.form.nameError') }}
          </cds-control-message>
        </cds-input>

        <cds-input :status="attempted && !versionValid ? 'error' : 'neutral'">
          <label for="skill-form-version">{{ locale.t('skill.form.version') }}</label>
          <input
            id="skill-form-version"
            :value="version"
            maxlength="64"
            autocomplete="off"
            :disabled="isEditing"
            :placeholder="locale.t('skill.form.versionPlaceholder')"
            :aria-invalid="attempted && !versionValid"
            :aria-describedby="attempted && !versionValid ? 'skill-form-version-error' : undefined"
            @input="version = ($event.target as HTMLInputElement).value"
          />
          <cds-control-message v-if="attempted && !versionValid" id="skill-form-version-error" status="error">
            {{ locale.t('skill.form.versionError') }}
          </cds-control-message>
        </cds-input>

        <cds-input :status="attempted && !uriValid ? 'error' : 'neutral'">
          <label for="skill-form-uri">{{ locale.t('skill.form.uri') }}</label>
          <input
            id="skill-form-uri"
            :value="uri"
            autocomplete="off"
            :placeholder="locale.t('skill.form.uriPlaceholder')"
            :aria-invalid="attempted && !uriValid"
            :aria-describedby="attempted && !uriValid ? 'skill-form-uri-error' : undefined"
            @input="uri = ($event.target as HTMLInputElement).value"
          />
          <cds-control-message v-if="attempted && !uriValid" id="skill-form-uri-error" status="error">
            {{ locale.t('skill.form.uriError') }}
          </cds-control-message>
        </cds-input>

        <cds-textarea>
          <label for="skill-form-description">{{ locale.t('skill.form.description') }}</label>
          <textarea
            id="skill-form-description"
            rows="3"
            :value="description"
            :placeholder="locale.t('skill.form.descriptionPlaceholder')"
            @input="description = ($event.target as HTMLTextAreaElement).value"
          ></textarea>
        </cds-textarea>
      </form>
    </cds-modal-content>

    <cds-modal-actions>
      <cds-button action="outline" :disabled="saving" @click="close">
        {{ locale.t('skill.form.cancel') }}
      </cds-button>
      <cds-button
        :loading-state="saving ? 'loading' : 'default'"
        :disabled="saving"
        @click="submit"
      >
        {{ locale.t('skill.form.submit') }}
      </cds-button>
    </cds-modal-actions>
  </cds-modal>
</template>

<style scoped>
.modal-title {
  margin: 0;
}
.skill-form {
  display: grid;
  gap: 16px;
}
</style>
