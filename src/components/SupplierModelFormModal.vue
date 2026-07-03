<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useLocaleStore } from '@/stores/locale'
import type {
  RateLimitPolicy,
  RateLimitPolicyDraft,
  RateLimitType,
} from '@/types/rate-limit-policy'
import { RATE_LIMIT_TYPES } from '@/types/rate-limit-policy'

const props = defineProps<{
  open: boolean
  policy: RateLimitPolicy | null
  saving?: boolean
}>()

const emit = defineEmits<{
  (event: 'close'): void
  (event: 'submit', draft: RateLimitPolicyDraft): void
}>()

const locale = useLocaleStore()
const name = ref('')
const type = ref<RateLimitType>('COMBINED')
const tokenLimitPerMinute = ref(100_000)
const requestLimitPerMinute = ref(1_000)
const enabled = ref(true)
const attempted = ref(false)

const isEditing = computed(() => Boolean(props.policy))
const nameValid = computed(() => {
  const length = name.value.trim().length
  return length >= 2 && length <= 64
})
const tokenLimitValid = computed(
  () => type.value === 'REQUEST' || tokenLimitPerMinute.value > 0,
)
const requestLimitValid = computed(
  () => type.value === 'TOKEN' || requestLimitPerMinute.value > 0,
)
const formValid = computed(
  () => nameValid.value && tokenLimitValid.value && requestLimitValid.value,
)

function reset() {
  name.value = props.policy?.name ?? ''
  type.value = props.policy?.type ?? 'COMBINED'
  tokenLimitPerMinute.value = props.policy?.tokenLimitPerMinute ?? 100_000
  requestLimitPerMinute.value = props.policy?.requestLimitPerMinute ?? 1_000
  enabled.value = props.policy?.enabled ?? true
  attempted.value = false
}

watch(
  () => [props.open, props.policy] as const,
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
    type: type.value,
    tokenLimitPerMinute: type.value === 'REQUEST' ? 0 : tokenLimitPerMinute.value,
    requestLimitPerMinute: type.value === 'TOKEN' ? 0 : requestLimitPerMinute.value,
    enabled: enabled.value,
  })
}
</script>

<template>
  <cds-modal :hidden="!open" :closable="!saving" size="md" @closeChange="close">
    <cds-modal-header>
      <h2 cds-text="title" class="modal-title">
        {{ locale.t(isEditing ? 'supplier.form.editTitle' : 'supplier.form.createTitle') }}
      </h2>
    </cds-modal-header>

    <cds-modal-content>
      <form class="policy-form" @submit.prevent="submit">
        <cds-input :status="attempted && !nameValid ? 'error' : 'neutral'">
          <label>{{ locale.t('supplier.form.name') }}</label>
          <input
            :value="name"
            maxlength="64"
            autocomplete="off"
            :readonly="isEditing"
            :placeholder="locale.t('supplier.form.namePlaceholder')"
            @input="name = ($event.target as HTMLInputElement).value"
          />
          <cds-control-message v-if="attempted && !nameValid" status="error">
            {{ locale.t('supplier.form.nameError') }}
          </cds-control-message>
          <cds-control-message v-else-if="isEditing" status="neutral">
            {{ locale.t('supplier.form.nameLockedHint') }}
          </cds-control-message>
        </cds-input>

        <cds-select>
          <label>{{ locale.t('supplier.form.type') }}</label>
          <select
            :value="type"
            :aria-label="locale.t('supplier.form.type')"
            @change="type = ($event.target as HTMLSelectElement).value as RateLimitType"
          >
            <option v-for="item in RATE_LIMIT_TYPES" :key="item" :value="item">
              {{ locale.t(`supplier.type.${item}`) }}
            </option>
          </select>
        </cds-select>

        <cds-input
          v-if="type !== 'REQUEST'"
          :status="attempted && !tokenLimitValid ? 'error' : 'neutral'"
        >
          <label>{{ locale.t('supplier.form.tokenLimit') }}</label>
          <input
            type="number"
            min="1"
            step="1000"
            :value="tokenLimitPerMinute"
            @input="tokenLimitPerMinute = Number(($event.target as HTMLInputElement).value)"
          />
        </cds-input>

        <cds-input
          v-if="type !== 'TOKEN'"
          :status="attempted && !requestLimitValid ? 'error' : 'neutral'"
        >
          <label>{{ locale.t('supplier.form.requestLimit') }}</label>
          <input
            type="number"
            min="1"
            step="10"
            :value="requestLimitPerMinute"
            @input="requestLimitPerMinute = Number(($event.target as HTMLInputElement).value)"
          />
        </cds-input>

        <cds-control>
          <cds-toggle>
            <label>{{ locale.t('supplier.form.enabled') }}</label>
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
        {{ locale.t('supplier.form.cancel') }}
      </cds-button>
      <cds-button
        :loading-state="saving ? 'loading' : 'default'"
        :disabled="saving"
        @click="submit"
      >
        {{ locale.t('supplier.form.submit') }}
      </cds-button>
    </cds-modal-actions>
  </cds-modal>
</template>

<style scoped>
.modal-title {
  margin: 0;
}
.policy-form {
  display: grid;
  gap: 16px;
}
</style>
