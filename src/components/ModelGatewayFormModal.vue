<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useLocaleStore } from '@/stores/locale'
import type { ModelGateway, ModelGatewayInput } from '@/api/graphql/model-gateway-types'

const props = defineProps<{
  open: boolean
  gateway: ModelGateway | null
  saving: boolean
}>()

const emit = defineEmits<{
  (event: 'close'): void
  (event: 'submit', input: ModelGatewayInput): void
}>()

const locale = useLocaleStore()
const name = ref('')
const endpoint = ref('')
const adminUrl = ref('')
const masterKey = ref('')
const attempted = ref(false)

const isEditing = computed(() => Boolean(props.gateway))

function isHTTPURL(value: string): boolean {
  try {
    const parsed = new URL(value)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

const nameValid = computed(() => {
  const length = name.value.trim().length
  return length >= 2 && length <= 64
})
const endpointValid = computed(() => isHTTPURL(endpoint.value.trim()))
const adminUrlValid = computed(
  () => adminUrl.value.trim().length === 0 || isHTTPURL(adminUrl.value.trim()),
)
const masterKeyValid = computed(() => isEditing.value || masterKey.value.trim().length > 0)
const formValid = computed(
  () => nameValid.value && endpointValid.value && adminUrlValid.value && masterKeyValid.value,
)

function reset() {
  name.value = props.gateway?.name ?? ''
  endpoint.value = props.gateway?.endpoint ?? ''
  adminUrl.value = props.gateway?.adminUrl ?? ''
  masterKey.value = ''
  attempted.value = false
}

watch(
  () => [props.open, props.gateway] as const,
  ([open]) => {
    if (open) reset()
    if (!open) masterKey.value = ''
  },
  { immediate: true },
)

function normalizeURL(value: string): string {
  return value.trim().replace(/\/+$/, '')
}

function submit() {
  attempted.value = true
  if (!formValid.value || props.saving) return
  emit('submit', {
    name: name.value.trim(),
    provider: 'LITELLM',
    endpoint: normalizeURL(endpoint.value),
    adminUrl: adminUrl.value.trim() ? normalizeURL(adminUrl.value) : null,
    masterKey: masterKey.value.trim() || null,
    loadBalancingStrategy: 'ROUND_ROBIN',
  })
}

function close() {
  if (props.saving) return
  masterKey.value = ''
  emit('close')
}
</script>

<template>
  <cds-modal :hidden="!open" :closable="!saving" size="md" @closeChange="close">
    <cds-modal-header>
      <h2 cds-text="title" class="modal-title">
        {{ locale.t(isEditing ? 'gateway.form.editTitle' : 'gateway.form.createTitle') }}
      </h2>
    </cds-modal-header>

    <cds-modal-content>
      <form class="gateway-form" @submit.prevent="submit">
        <cds-select>
          <label>{{ locale.t('gateway.form.provider') }}</label>
          <select disabled aria-readonly="true">
            <option>LiteLLM</option>
          </select>
        </cds-select>

        <cds-input :status="attempted && !nameValid ? 'error' : 'neutral'">
          <label>{{ locale.t('gateway.form.name') }}</label>
          <input
            :value="name"
            maxlength="64"
            autocomplete="off"
            :placeholder="locale.t('gateway.form.namePlaceholder')"
            @input="name = ($event.target as HTMLInputElement).value"
          />
          <cds-control-message v-if="attempted && !nameValid" status="error">
            {{ locale.t('gateway.form.nameError') }}
          </cds-control-message>
        </cds-input>

        <cds-input :status="attempted && !endpointValid ? 'error' : 'neutral'">
          <label>{{ locale.t('gateway.form.endpoint') }}</label>
          <input
            type="url"
            :value="endpoint"
            autocomplete="url"
            placeholder="https://litellm.example.com"
            @input="endpoint = ($event.target as HTMLInputElement).value"
          />
          <cds-control-message v-if="attempted && !endpointValid" status="error">
            {{ locale.t('gateway.form.urlError') }}
          </cds-control-message>
        </cds-input>

        <cds-input :status="attempted && !adminUrlValid ? 'error' : 'neutral'">
          <label>{{ locale.t('gateway.form.adminUrl') }}</label>
          <input
            type="url"
            :value="adminUrl"
            autocomplete="url"
            placeholder="https://litellm.example.com/ui"
            @input="adminUrl = ($event.target as HTMLInputElement).value"
          />
          <cds-control-message v-if="attempted && !adminUrlValid" status="error">
            {{ locale.t('gateway.form.urlError') }}
          </cds-control-message>
        </cds-input>

        <cds-input :status="attempted && !masterKeyValid ? 'error' : 'neutral'">
          <label>{{ locale.t('gateway.form.masterKey') }}</label>
          <input
            type="password"
            :value="masterKey"
            autocomplete="new-password"
            :placeholder="
              locale.t(
                isEditing ? 'gateway.form.masterKeyEditHint' : 'gateway.form.masterKeyPlaceholder',
              )
            "
            @input="masterKey = ($event.target as HTMLInputElement).value"
          />
          <cds-control-message v-if="attempted && !masterKeyValid" status="error">
            {{ locale.t('gateway.form.masterKeyError') }}
          </cds-control-message>
        </cds-input>

        <div class="strategy-note">
          <span>{{ locale.t('gateway.form.strategy') }}</span>
          <cds-badge status="info">{{ locale.t('gateway.strategy.roundRobin') }}</cds-badge>
        </div>
        <p class="secret-note">{{ locale.t('gateway.form.secretNote') }}</p>
      </form>
    </cds-modal-content>

    <cds-modal-actions>
      <cds-button action="outline" :disabled="saving" @click="close">
        {{ locale.t('gateway.action.cancel') }}
      </cds-button>
      <cds-button
        :loading-state="saving ? 'loading' : 'default'"
        :disabled="saving"
        @click="submit"
      >
        {{ locale.t(isEditing ? 'gateway.action.save' : 'gateway.action.connect') }}
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
  grid-template-columns: 1fr 1fr;
  gap: 18px 20px;
  padding-block: 4px;
}
.gateway-form cds-input,
.gateway-form cds-select {
  min-width: 0;
}
.gateway-form cds-select,
.gateway-form cds-input:nth-of-type(4),
.strategy-note,
.secret-note {
  grid-column: 1 / -1;
}
.strategy-note {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 32px;
  color: var(--cds-alias-object-app-foreground, #1b1b1b);
}
.secret-note {
  margin: -8px 0 0;
  color: var(--cds-alias-typography-color-300, #565656);
  font-size: 12px;
  line-height: 1.5;
}
@media (max-width: 720px) {
  .gateway-form {
    grid-template-columns: 1fr;
  }
  .gateway-form cds-select,
  .gateway-form cds-input:nth-of-type(4),
  .strategy-note,
  .secret-note {
    grid-column: auto;
  }
}
</style>
