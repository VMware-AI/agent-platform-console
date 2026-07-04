<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useLocaleStore } from '@/stores/locale'
import type { VirtualKeyDraft, VirtualKeyOption } from '@/types/virtual-key'

// Issue-only: a virtual key is an immutable credential, so there is no edit form —
// to change a key you revoke it and issue a new one.
const props = defineProps<{
  open: boolean
  users: VirtualKeyOption[]
  agents: VirtualKeyOption[]
  policies: VirtualKeyOption[]
  saving?: boolean
}>()

const emit = defineEmits<{
  (event: 'close'): void
  (event: 'submit', draft: VirtualKeyDraft): void
}>()

const locale = useLocaleStore()
const name = ref('')
const userId = ref('')
const agentId = ref('')
const policyId = ref('')
const expiresAt = ref('')
const attempted = ref(false)

// alias is optional; when provided it must be a sensible length.
const nameValid = computed(() => {
  const length = name.value.trim().length
  return length === 0 || (length >= 2 && length <= 64)
})
const ownerValid = computed(() => props.users.some((user) => user.id === userId.value))
const agentValid = computed(() => true) // agent binding is optional
const formValid = computed(() => nameValid.value && ownerValid.value)
const minimumDate = computed(() => new Date().toISOString().slice(0, 10))

function reset() {
  name.value = ''
  userId.value = props.users[0]?.id ?? ''
  agentId.value = ''
  policyId.value = ''
  expiresAt.value = ''
  attempted.value = false
}

watch(
  () => [props.open, props.users, props.agents, props.policies] as const,
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
    userId: userId.value,
    agentId: agentId.value,
    policyId: policyId.value,
    // Expire at end-of-day local when a date is picked; empty → no expiry.
    expiresAt: expiresAt.value ? new Date(`${expiresAt.value}T23:59:59`).toISOString() : '',
  })
}
</script>

<template>
  <cds-modal :hidden="!open" :closable="!saving" size="md" @closeChange="close">
    <cds-modal-header>
      <h2 cds-text="title" class="modal-title">
        {{ locale.t('virtualKey.form.createTitle') }}
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

        <cds-select :status="attempted && !ownerValid ? 'error' : 'neutral'">
          <label>{{ locale.t('virtualKey.form.owner') }}</label>
          <select
            :value="userId"
            :aria-label="locale.t('virtualKey.form.owner')"
            @change="userId = ($event.target as HTMLSelectElement).value"
          >
            <option v-for="user in users" :key="user.id" :value="user.id">{{ user.name }}</option>
          </select>
          <cds-control-message v-if="attempted && !ownerValid" status="error">
            {{ locale.t('virtualKey.form.ownerError') }}
          </cds-control-message>
        </cds-select>

        <cds-select :status="attempted && !agentValid ? 'error' : 'neutral'">
          <label>{{ locale.t('virtualKey.form.agent') }}</label>
          <select
            :value="agentId"
            :aria-label="locale.t('virtualKey.form.agent')"
            @change="agentId = ($event.target as HTMLSelectElement).value"
          >
            <option value="">不绑定（独立密钥）</option>
            <option v-for="agent in agents" :key="agent.id" :value="agent.id">
              {{ agent.id.slice(0, 12) }}... · {{ agent.name }}
            </option>
          </select>
        </cds-select>

        <cds-select>
          <label>{{ locale.t('virtualKey.form.policy') }}</label>
          <select
            :value="policyId"
            :aria-label="locale.t('virtualKey.form.policy')"
            @change="policyId = ($event.target as HTMLSelectElement).value"
          >
            <option value="">{{ locale.t('virtualKey.form.policyNone') }}</option>
            <option v-for="item in policies" :key="item.id" :value="item.id">{{ item.name }}</option>
          </select>
        </cds-select>

        <cds-input>
          <label>{{ locale.t('virtualKey.form.expiresAt') }}</label>
          <input
            type="date"
            :value="expiresAt"
            :min="minimumDate"
            @input="expiresAt = ($event.target as HTMLInputElement).value"
          />
          <cds-control-message status="neutral">
            {{ locale.t('virtualKey.form.expiresHint') }}
          </cds-control-message>
        </cds-input>
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
