<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useLocaleStore } from '@/stores/locale'
import type {
  VirtualKey,
  VirtualKeyAgentOption,
  VirtualKeyDraft,
} from '@/types/virtual-key'

const props = defineProps<{
  open: boolean
  virtualKey: VirtualKey | null
  agents: VirtualKeyAgentOption[]
  policies: string[]
  saving?: boolean
}>()

const emit = defineEmits<{
  (event: 'close'): void
  (event: 'submit', draft: VirtualKeyDraft): void
}>()

const locale = useLocaleStore()
const name = ref('')
const agentId = ref('')
const policy = ref('')
const expiresAt = ref('')
const enabled = ref(true)
const attempted = ref(false)

const isEditing = computed(() => Boolean(props.virtualKey))
const nameValid = computed(() => {
  const length = name.value.trim().length
  return length >= 2 && length <= 64
})
const agentValid = computed(() => props.agents.some((agent) => agent.id === agentId.value))
const policyValid = computed(() => props.policies.includes(policy.value))
const expiresAtValid = computed(() => !Number.isNaN(new Date(expiresAt.value).getTime()))
const formValid = computed(
  () => nameValid.value && agentValid.value && policyValid.value && expiresAtValid.value,
)
const minimumDate = computed(() => new Date().toISOString().slice(0, 10))

function dateInputValue(value: string | undefined): string {
  if (!value) {
    const date = new Date()
    date.setFullYear(date.getFullYear() + 1)
    return date.toISOString().slice(0, 10)
  }
  return new Date(value).toISOString().slice(0, 10)
}

function reset() {
  name.value = props.virtualKey?.name ?? ''
  agentId.value = props.virtualKey?.agentId ?? props.agents[0]?.id ?? ''
  policy.value = props.virtualKey?.policy ?? props.policies[0] ?? ''
  expiresAt.value = dateInputValue(props.virtualKey?.expiresAt)
  enabled.value = props.virtualKey?.enabled ?? true
  attempted.value = false
}

watch(
  () => [props.open, props.virtualKey, props.agents, props.policies] as const,
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
  emit('submit', {
    name: name.value.trim(),
    agentId: agentId.value,
    policy: policy.value,
    expiresAt: new Date(`${expiresAt.value}T23:59:59`).toISOString(),
    enabled: enabled.value,
  })
}
</script>

<template>
  <cds-modal :hidden="!open" :closable="!saving" size="md" @closeChange="close">
    <cds-modal-header>
      <h2 cds-text="title" class="modal-title">
        {{ locale.t(isEditing ? 'virtualKey.form.editTitle' : 'virtualKey.form.createTitle') }}
      </h2>
    </cds-modal-header>

    <cds-modal-content>
      <form class="key-form" @submit.prevent="submit">
        <cds-input :status="attempted && !nameValid ? 'error' : 'neutral'">
          <label>{{ locale.t('virtualKey.form.name') }}</label>
          <input
            :value="name"
            maxlength="64"
            autocomplete="off"
            :placeholder="locale.t('virtualKey.form.namePlaceholder')"
            @input="name = ($event.target as HTMLInputElement).value"
          />
          <cds-control-message v-if="attempted && !nameValid" status="error">
            {{ locale.t('virtualKey.form.nameError') }}
          </cds-control-message>
        </cds-input>

        <cds-select :status="attempted && !agentValid ? 'error' : 'neutral'">
          <label>{{ locale.t('virtualKey.form.agent') }}</label>
          <select
            :value="agentId"
            :aria-label="locale.t('virtualKey.form.agent')"
            @change="agentId = ($event.target as HTMLSelectElement).value"
          >
            <option v-for="agent in agents" :key="agent.id" :value="agent.id">
              {{ agent.id }} · {{ agent.name }}
            </option>
          </select>
        </cds-select>

        <cds-select :status="attempted && !policyValid ? 'error' : 'neutral'">
          <label>{{ locale.t('virtualKey.form.policy') }}</label>
          <select
            :value="policy"
            :aria-label="locale.t('virtualKey.form.policy')"
            @change="policy = ($event.target as HTMLSelectElement).value"
          >
            <option v-for="item in policies" :key="item" :value="item">{{ item }}</option>
          </select>
        </cds-select>

        <cds-input :status="attempted && !expiresAtValid ? 'error' : 'neutral'">
          <label>{{ locale.t('virtualKey.form.expiresAt') }}</label>
          <input
            type="date"
            :value="expiresAt"
            :min="isEditing ? undefined : minimumDate"
            @input="expiresAt = ($event.target as HTMLInputElement).value"
          />
        </cds-input>

        <cds-control>
          <cds-toggle>
            <label>{{ locale.t('virtualKey.form.enabled') }}</label>
            <input
              type="checkbox"
              slot="input"
              :checked="enabled"
              @change="enabled = ($event.target as HTMLInputElement).checked"
            />
          </cds-toggle>
        </cds-control>
      </form>
    </cds-modal-content>

    <cds-modal-actions>
      <cds-button action="outline" :disabled="saving" @click="close">
        {{ locale.t('virtualKey.form.cancel') }}
      </cds-button>
      <cds-button
        :loading-state="saving ? 'loading' : 'default'"
        :disabled="saving"
        @click="submit"
      >
        {{ locale.t('virtualKey.form.submit') }}
      </cds-button>
    </cds-modal-actions>
  </cds-modal>
</template>

<style scoped>
.modal-title {
  margin: 0;
}
.key-form {
  display: grid;
  gap: 16px;
}
</style>
