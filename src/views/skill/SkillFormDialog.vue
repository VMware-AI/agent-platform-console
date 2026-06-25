<script setup lang="ts">
/**
 * Skill create / edit dialog (技能管理). Mirrors RateLimitPolicyFormModal:
 * a cds-modal form that emits a `submit` draft to the parent, which performs the
 * upsertSkill mutation. Both create and edit go through upsertSkill — there is no
 * separate create op in the schema. i18n is self-contained via FALLBACK + tt so
 * this view never touches the shared locale store.
 */
import { computed, ref, watch } from 'vue'
import { useLocaleStore } from '@/stores/locale'
import type { SkillNode, UpsertSkillInput } from '@/api/graphql/queries/skills'

const FALLBACK: Record<string, { zh: string; en: string }> = {
  'skill.form.createTitle': { zh: '新建技能', en: 'New Skill' },
  'skill.form.editTitle': { zh: '编辑技能', en: 'Edit Skill' },
  'skill.form.name': { zh: '名称', en: 'Name' },
  'skill.form.namePlaceholder': { zh: '请输入技能名称', en: 'Enter a skill name' },
  'skill.form.nameError': { zh: '名称长度需为 2–128 个字符', en: 'Name must be 2–128 characters' },
  'skill.form.version': { zh: '版本', en: 'Version' },
  'skill.form.versionPlaceholder': { zh: '例如 1.0.0', en: 'e.g. 1.0.0' },
  'skill.form.versionError': { zh: '请填写版本', en: 'Version is required' },
  'skill.form.uri': { zh: '资源地址 (URI)', en: 'URI' },
  'skill.form.uriPlaceholder': { zh: '技能制品地址，例如 oci://… 或 https://…', en: 'Skill artifact URI, e.g. oci://… or https://…' },
  'skill.form.uriError': { zh: '请填写资源地址', en: 'URI is required' },
  'skill.form.description': { zh: '描述', en: 'Description' },
  'skill.form.descriptionPlaceholder': { zh: '可选：简要描述该技能的用途', en: 'Optional: a short description of the skill' },
  'skill.form.cancel': { zh: '取消', en: 'Cancel' },
  'skill.form.submit': { zh: '保存', en: 'Save' },
}

function tt(key: string): string {
  const entry = FALLBACK[key]
  if (entry) return entry[locale.locale]
  return locale.t(key)
}

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
        {{ tt(isEditing ? 'skill.form.editTitle' : 'skill.form.createTitle') }}
      </h2>
    </cds-modal-header>

    <cds-modal-content>
      <form class="skill-form" @submit.prevent="submit">
        <cds-input :status="attempted && !nameValid ? 'error' : 'neutral'">
          <label>{{ tt('skill.form.name') }}</label>
          <input
            :value="name"
            maxlength="128"
            autocomplete="off"
            :placeholder="tt('skill.form.namePlaceholder')"
            @input="name = ($event.target as HTMLInputElement).value"
          />
          <cds-control-message v-if="attempted && !nameValid" status="error">
            {{ tt('skill.form.nameError') }}
          </cds-control-message>
        </cds-input>

        <cds-input :status="attempted && !versionValid ? 'error' : 'neutral'">
          <label>{{ tt('skill.form.version') }}</label>
          <input
            :value="version"
            maxlength="64"
            autocomplete="off"
            :placeholder="tt('skill.form.versionPlaceholder')"
            @input="version = ($event.target as HTMLInputElement).value"
          />
          <cds-control-message v-if="attempted && !versionValid" status="error">
            {{ tt('skill.form.versionError') }}
          </cds-control-message>
        </cds-input>

        <cds-input :status="attempted && !uriValid ? 'error' : 'neutral'">
          <label>{{ tt('skill.form.uri') }}</label>
          <input
            :value="uri"
            autocomplete="off"
            :placeholder="tt('skill.form.uriPlaceholder')"
            @input="uri = ($event.target as HTMLInputElement).value"
          />
          <cds-control-message v-if="attempted && !uriValid" status="error">
            {{ tt('skill.form.uriError') }}
          </cds-control-message>
        </cds-input>

        <cds-textarea>
          <label>{{ tt('skill.form.description') }}</label>
          <textarea
            rows="3"
            :value="description"
            :placeholder="tt('skill.form.descriptionPlaceholder')"
            @input="description = ($event.target as HTMLTextAreaElement).value"
          ></textarea>
        </cds-textarea>
      </form>
    </cds-modal-content>

    <cds-modal-actions>
      <cds-button action="outline" :disabled="saving" @click="close">
        {{ tt('skill.form.cancel') }}
      </cds-button>
      <cds-button
        :loading-state="saving ? 'loading' : 'default'"
        :disabled="saving"
        @click="submit"
      >
        {{ tt('skill.form.submit') }}
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
