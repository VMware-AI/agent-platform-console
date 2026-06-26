<script setup lang="ts">
/**
 * 接入网关连接 (Register Gateway Connection) dialog.
 *
 * Mirrors RateLimitPolicyFormModal's cds-modal layout. Register-only — there is
 * no updateGatewayConnection op, so this form always creates. The parent owns
 * the `saving` flag; this component emits a validated
 * RegisterGatewayConnectionInput and stays presentational.
 *
 * `masterKey` is the litellm master key: write-only (backend stores a secret
 * reference, never reads it back), so it is an optional field and never
 * pre-filled.
 */
import { computed, ref, watch } from 'vue'
import { useLocaleStore } from '@/stores/locale'
import {
  LOAD_BALANCE_STRATEGIES,
  type LoadBalanceStrategy,
  type RegisterGatewayConnectionInput,
} from '@/api/graphql/queries/gateway-connections'

const props = defineProps<{
  open: boolean
  saving?: boolean
}>()

const locale = useLocaleStore()

const emit = defineEmits<{
  (event: 'close'): void
  (event: 'submit', input: RegisterGatewayConnectionInput): void
}>()

const DEFAULT_STRATEGY: LoadBalanceStrategy = 'simple_shuffle'

const name = ref('')
const endpoint = ref('')
const masterKey = ref('')
const loadBalanceStrategy = ref<LoadBalanceStrategy>(DEFAULT_STRATEGY)
const attempted = ref(false)

const nameValid = computed(() => {
  const length = name.value.trim().length
  return length >= 2 && length <= 64
})
const endpointValid = computed(() => /^https?:\/\/.+/i.test(endpoint.value.trim()))
const formValid = computed(() => nameValid.value && endpointValid.value)

function reset() {
  name.value = ''
  endpoint.value = ''
  masterKey.value = ''
  loadBalanceStrategy.value = DEFAULT_STRATEGY
  attempted.value = false
}

watch(
  () => props.open,
  (open) => {
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
  const trimmedKey = masterKey.value.trim()
  emit('submit', {
    name: name.value.trim(),
    endpoint: endpoint.value.trim(),
    masterKey: trimmedKey === '' ? undefined : trimmedKey,
    loadBalanceStrategy: loadBalanceStrategy.value,
  })
}
</script>

<template>
  <cds-modal :hidden="!open" :closable="!saving" size="md" @closeChange="close">
    <cds-modal-header>
      <h2 cds-text="title" class="modal-title">{{ locale.t('gatewayConn.form.createTitle') }}</h2>
    </cds-modal-header>

    <cds-modal-content>
      <form class="gateway-form" @submit.prevent="submit">
        <cds-input :status="attempted && !nameValid ? 'error' : 'neutral'">
          <label for="gw-form-name">{{ locale.t('gatewayConn.form.name') }}</label>
          <input
            id="gw-form-name"
            :value="name"
            maxlength="64"
            autocomplete="off"
            :placeholder="locale.t('gatewayConn.form.namePlaceholder')"
            :aria-invalid="attempted && !nameValid"
            :aria-describedby="attempted && !nameValid ? 'gw-form-name-error' : undefined"
            @input="name = ($event.target as HTMLInputElement).value"
          />
          <cds-control-message v-if="attempted && !nameValid" id="gw-form-name-error" status="error">
            {{ locale.t('gatewayConn.form.nameError') }}
          </cds-control-message>
        </cds-input>

        <cds-input :status="attempted && !endpointValid ? 'error' : 'neutral'">
          <label for="gw-form-endpoint">{{ locale.t('gatewayConn.form.endpoint') }}</label>
          <input
            id="gw-form-endpoint"
            :value="endpoint"
            autocomplete="off"
            placeholder="https://litellm.example.com"
            :aria-invalid="attempted && !endpointValid"
            :aria-describedby="attempted && !endpointValid ? 'gw-form-endpoint-error' : undefined"
            @input="endpoint = ($event.target as HTMLInputElement).value"
          />
          <cds-control-message v-if="attempted && !endpointValid" id="gw-form-endpoint-error" status="error">
            {{ locale.t('gatewayConn.form.endpointError') }}
          </cds-control-message>
        </cds-input>

        <cds-input>
          <label for="gw-form-master-key">{{ locale.t('gatewayConn.form.masterKey') }}</label>
          <input
            id="gw-form-master-key"
            type="password"
            :value="masterKey"
            autocomplete="new-password"
            :placeholder="locale.t('gatewayConn.form.masterKeyPlaceholder')"
            aria-describedby="gw-form-master-key-hint"
            @input="masterKey = ($event.target as HTMLInputElement).value"
          />
          <cds-control-message id="gw-form-master-key-hint" status="neutral">
            {{ locale.t('gatewayConn.form.masterKeyHint') }}
          </cds-control-message>
        </cds-input>

        <cds-select>
          <label for="gw-form-strategy">{{ locale.t('gatewayConn.form.strategy') }}</label>
          <select
            id="gw-form-strategy"
            :value="loadBalanceStrategy"
            :aria-label="locale.t('gatewayConn.form.strategy')"
            @change="loadBalanceStrategy = ($event.target as HTMLSelectElement).value as LoadBalanceStrategy"
          >
            <option v-for="item in LOAD_BALANCE_STRATEGIES" :key="item" :value="item">
              {{ locale.t(`gatewayConn.strategy.${item}`) }}
            </option>
          </select>
        </cds-select>
      </form>
    </cds-modal-content>

    <cds-modal-actions>
      <cds-button action="outline" :disabled="saving" @click="close">
        {{ locale.t('gatewayConn.form.cancel') }}
      </cds-button>
      <cds-button
        :loading-state="saving ? 'loading' : 'default'"
        :disabled="saving"
        @click="submit"
      >
        {{ locale.t('gatewayConn.form.submit') }}
      </cds-button>
    </cds-modal-actions>
  </cds-modal>
</template>

<style scoped>
.modal-title {
  margin: 0;
}
.gateway-form {
  display: grid;
  gap: 16px;
}
</style>
