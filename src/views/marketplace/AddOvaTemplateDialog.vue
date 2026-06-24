<script setup lang="ts">
/**
 * Add OvaTemplate Dialog (Family + initial Version).
 *
 * Per the marketplace plan: one dialog creates both the OvaTemplateFamily
 * and its first OvaTemplateVersion atomically. iconShape / iconColor /
 * typeLabel are derived from `type` rather than collected from the user.
 * (As of 2026/06, `typeLabel` itself was removed from the Agent schema —
 *  the frontend renders the localized label directly via
 *  `locale.t(`agents.type.${TYPE_FROM_GQL[type]}`)`.)
 */
import { computed, ref, watch } from 'vue'
import { useLocaleStore } from '@/stores/locale'
import type {
  AgentType,
  CreateOvaTemplateFamilyInput,
  OvaTemplateColor,
} from '@/api/graphql/types'
import '@/components/icons'

const props = defineProps<{ open: boolean; saving: boolean }>()
const emit = defineEmits<{
  (e: 'close'): void
  (e: 'submit', input: CreateOvaTemplateFamilyInput): void
}>()

const locale = useLocaleStore()

const name = ref('')
const type = ref<AgentType | ''>('')
const version = ref('v1.0.0')
const ovaIdentifier = ref('')
const description = ref('')
const toolsText = ref('')
const scenariosText = ref('')
const skillsText = ref('')
const attempted = ref(false)

watch(
  () => props.open,
  (o) => {
    if (o) {
      name.value = ''
      type.value = ''
      version.value = 'v1.0.0'
      ovaIdentifier.value = ''
      description.value = ''
      toolsText.value = ''
      scenariosText.value = ''
      skillsText.value = ''
      attempted.value = false
    }
  },
  { immediate: true },
)

const TYPE_OPTIONS: Array<{ value: AgentType; key: string }> = [
  { value: 'GENERAL_CHAT',     key: 'general-chat' },
  { value: 'IMAGE_GENERATION', key: 'image-generation' },
  { value: 'BASIC_LLM',        key: 'basic-llm' },
  { value: 'OPENCLAW',         key: 'openclaw' },
  { value: 'HERMES',           key: 'hermes' },
  { value: 'CLAUDE_CODE',      key: 'claude-code' },
  { value: 'XIAOGUAI',         key: 'xiaoguai' },
  { value: 'QCODER',           key: 'qcoder' },
  { value: 'OPENCODE',         key: 'opencode' },
]

const ICON_SHAPE_BY_TYPE: Record<AgentType, string> = {
  GENERAL_CHAT: 'talk-bubbles',
  IMAGE_GENERATION: 'image',
  BASIC_LLM: 'atom',
  OPENCLAW: 'wrench',
  HERMES: 'talk-bubbles',
  CLAUDE_CODE: 'world',
  XIAOGUAI: 'book',
  QCODER: 'bar-chart',
  OPENCODE: 'pop-out',
}

const ICON_COLOR_BY_TYPE: Record<AgentType, OvaTemplateColor> = {
  GENERAL_CHAT: 'PURPLE',
  IMAGE_GENERATION: 'PURPLE',
  BASIC_LLM: 'CYAN',
  OPENCLAW: 'BLUE',
  HERMES: 'PURPLE',
  CLAUDE_CODE: 'RED',
  XIAOGUAI: 'GREEN',
  QCODER: 'ORANGE',
  OPENCODE: 'ORANGE',
}

/* ---------- Validation ---------- */
const ovaIdentifierPattern = /^[a-zA-Z0-9._-]+$/

const nameValid = computed(() => name.value.trim().length > 0)
const typeValid = computed(() => !!type.value)
const versionValid = computed(() => version.value.trim().length > 0)
const ovaIdValid = computed(() => {
  const v = ovaIdentifier.value.trim()
  return v.length > 0 && ovaIdentifierPattern.test(v)
})
const descValid = computed(() => description.value.trim().length > 0)
const toolsValid = computed(
  () => toolsText.value.split('\n').map((s) => s.trim()).filter(Boolean).length > 0,
)
const scenariosValid = computed(
  () => scenariosText.value.split('\n').map((s) => s.trim()).filter(Boolean).length > 0,
)
const skillsValid = computed(
  () => skillsText.value.split('\n').map((s) => s.trim()).filter(Boolean).length > 0,
)

const formValid = computed(
  () =>
    nameValid.value &&
    typeValid.value &&
    versionValid.value &&
    ovaIdValid.value &&
    descValid.value &&
    toolsValid.value &&
    scenariosValid.value &&
    skillsValid.value,
)

function submit() {
  attempted.value = true
  if (!formValid.value || !type.value) return
  const t = type.value
  const tools = toolsText.value.split('\n').map((s) => s.trim()).filter(Boolean)
  const scenarios = scenariosText.value.split('\n').map((s) => s.trim()).filter(Boolean)
  const skills = skillsText.value.split('\n').map((s) => s.trim()).filter(Boolean)
  emit('submit', {
    name: name.value.trim(),
    type: t,
    description: description.value.trim(),
    tools,
    scenarios,
    skills,
    iconShape: ICON_SHAPE_BY_TYPE[t],
    iconColor: ICON_COLOR_BY_TYPE[t],
    initialVersion: {
      version: version.value.trim(),
      ovaIdentifier: ovaIdentifier.value.trim(),
      notes: null,
    },
  })
}

function close() {
  emit('close')
}
</script>

<template>
  <cds-modal
    :hidden="!props.open"
    :closable="!props.saving"
    size="lg"
    @closeChange="close"
  >
    <cds-modal-header>
      <h2 cds-text="title" class="modal-title">
        {{ locale.t('marketplace.form.title.create') }}
      </h2>
    </cds-modal-header>
    <cds-modal-content>
      <form class="tpl-form" @submit.prevent="submit">
        <cds-input
          class="full-row"
          :status="attempted && !nameValid ? 'error' : 'neutral'"
        >
          <label>{{ locale.t('marketplace.form.name') }}</label>
          <input
            :value="name"
            :placeholder="locale.t('marketplace.form.namePlaceholder')"
            @input="(e: Event) => (name = (e.target as HTMLInputElement).value)"
          />
          <cds-control-message
            v-if="attempted && !nameValid"
            status="error"
          >
            {{ locale.t('marketplace.form.error.name') }}
          </cds-control-message>
        </cds-input>

        <cds-select
          class="full-row"
          :status="attempted && !typeValid ? 'error' : 'neutral'"
        >
          <label>{{ locale.t('marketplace.form.type') }}</label>
          <select
            :value="type"
            @change="(e: Event) => (type = (e.target as HTMLSelectElement).value as AgentType)"
          >
            <option value="" disabled>--</option>
            <option v-for="opt in TYPE_OPTIONS" :key="opt.value" :value="opt.value">
              {{ locale.t(`marketplace.type.${opt.key}`) }}
            </option>
          </select>
          <cds-control-message
            v-if="attempted && !typeValid"
            status="error"
          >
            {{ locale.t('marketplace.form.error.name') }}
          </cds-control-message>
        </cds-select>

        <cds-input :status="attempted && !versionValid ? 'error' : 'neutral'">
          <label>{{ locale.t('marketplace.form.initialVersion') }}</label>
          <input
            :value="version"
            :placeholder="locale.t('marketplace.form.versionPlaceholder')"
            @input="(e: Event) => (version = (e.target as HTMLInputElement).value)"
          />
          <cds-control-message
            v-if="attempted && !versionValid"
            status="error"
          >
            {{ locale.t('marketplace.form.error.version') }}
          </cds-control-message>
        </cds-input>

        <cds-input
          :status="attempted && !ovaIdValid ? 'error' : 'neutral'"
        >
          <label>{{ locale.t('marketplace.form.ovaIdentifier') }}</label>
          <input
            :value="ovaIdentifier"
            :placeholder="locale.t('marketplace.form.ovaIdentifierPlaceholder')"
            @input="(e: Event) => (ovaIdentifier = (e.target as HTMLInputElement).value)"
          />
          <cds-control-message
            v-if="attempted && !ovaIdValid"
            status="error"
          >
            {{ locale.t('marketplace.form.error.ovaIdentifierFormat') }}
          </cds-control-message>
          <cds-control-message v-else status="info">
            {{ locale.t('marketplace.form.ovaIdentifierHint') }}
          </cds-control-message>
        </cds-input>

        <cds-input
          class="full-row"
          :status="attempted && !descValid ? 'error' : 'neutral'"
        >
          <label>{{ locale.t('marketplace.form.description') }}</label>
          <textarea
            :value="description"
            rows="3"
            @input="(e: Event) => (description = (e.target as HTMLTextAreaElement).value)"
          ></textarea>
          <cds-control-message
            v-if="attempted && !descValid"
            status="error"
          >
            {{ locale.t('marketplace.form.error.name') }}
          </cds-control-message>
        </cds-input>

        <cds-input
          class="full-row"
          :status="attempted && !toolsValid ? 'error' : 'neutral'"
        >
          <label>{{ locale.t('marketplace.form.tools') }}</label>
          <textarea
            :value="toolsText"
            rows="4"
            @input="(e: Event) => (toolsText = (e.target as HTMLTextAreaElement).value)"
          ></textarea>
          <cds-control-message
            v-if="attempted && !toolsValid"
            status="error"
          >
            {{ locale.t('marketplace.form.error.name') }}
          </cds-control-message>
        </cds-input>

        <cds-input
          class="full-row"
          :status="attempted && !scenariosValid ? 'error' : 'neutral'"
        >
          <label>{{ locale.t('marketplace.form.scenarios') }}</label>
          <textarea
            :value="scenariosText"
            rows="4"
            @input="(e: Event) => (scenariosText = (e.target as HTMLTextAreaElement).value)"
          ></textarea>
          <cds-control-message
            v-if="attempted && !scenariosValid"
            status="error"
          >
            {{ locale.t('marketplace.form.error.name') }}
          </cds-control-message>
        </cds-input>

        <cds-input
          class="full-row"
          :status="attempted && !skillsValid ? 'error' : 'neutral'"
        >
          <label>{{ locale.t('marketplace.form.skills') }}</label>
          <textarea
            :value="skillsText"
            rows="4"
            placeholder="一行一条"
            @input="(e: Event) => (skillsText = (e.target as HTMLTextAreaElement).value)"
          ></textarea>
          <cds-control-message
            v-if="attempted && !skillsValid"
            status="error"
          >
            {{ locale.t('marketplace.form.error.name') }}
          </cds-control-message>
        </cds-input>
      </form>
    </cds-modal-content>
    <cds-modal-actions>
      <cds-button
        action="outline"
        :disabled="props.saving"
        @click="close"
      >
        {{ locale.t('marketplace.form.cancel') }}
      </cds-button>
      <cds-button
        :loading-state="props.saving ? 'loading' : 'default'"
        :disabled="props.saving"
        @click="submit"
      >
        {{ locale.t('marketplace.form.submit') }}
      </cds-button>
    </cds-modal-actions>
  </cds-modal>
</template>

<style scoped>
.tpl-form {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}
.tpl-form .full-row {
  grid-column: 1 / -1;
}
.modal-title {
  margin: 0;
}
</style>
