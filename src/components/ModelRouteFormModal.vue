<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useLocaleStore } from '@/stores/locale'
import type {
  ModelRoute,
  ModelRouteDraft,
  ModelRouteGatewayOption,
  ModelRouteStrategy,
} from '@/types/model-route'
import { MODEL_ROUTE_STRATEGIES } from '@/types/model-route'

const props = defineProps<{
  open: boolean
  route: ModelRoute | null
  gateways: ModelRouteGatewayOption[]
  saving?: boolean
}>()

const emit = defineEmits<{
  (event: 'close'): void
  (event: 'submit', draft: ModelRouteDraft): void
}>()

const locale = useLocaleStore()
const name = ref('')
const gatewayId = ref('')
const strategy = ref<ModelRouteStrategy>('ROUND_ROBIN')
const modelsText = ref('')
const enabled = ref(true)
const attempted = ref(false)

const isEditing = computed(() => Boolean(props.route))
const parsedModels = computed(() => [
  ...new Set(
    modelsText.value
      .split(/[\n,，]/)
      .map((value) => value.trim())
      .filter(Boolean),
  ),
])
const nameValid = computed(() => {
  const length = name.value.trim().length
  return length >= 2 && length <= 64
})
const gatewayValid = computed(() =>
  props.gateways.some((gateway) => gateway.id === gatewayId.value),
)
const modelsValid = computed(() => parsedModels.value.length > 0)
const formValid = computed(() => nameValid.value && gatewayValid.value && modelsValid.value)

function reset() {
  name.value = props.route?.name ?? ''
  gatewayId.value = props.route?.gatewayId ?? props.gateways[0]?.id ?? ''
  strategy.value = props.route?.strategy ?? 'ROUND_ROBIN'
  modelsText.value = props.route?.supportedModels.join('\n') ?? ''
  enabled.value = props.route?.enabled ?? true
  attempted.value = false
}

watch(
  () => [props.open, props.route, props.gateways] as const,
  ([open]) => {
    if (open) reset()
  },
  { immediate: true },
)

function close() {
  if (props.saving) return
  emit('close')
}

function submit() {
  attempted.value = true
  if (!formValid.value || props.saving) return
  const gateway = props.gateways.find((item) => item.id === gatewayId.value)
  if (!gateway) return
  emit('submit', {
    name: name.value.trim(),
    gatewayId: gateway.id,
    gatewayName: gateway.name,
    strategy: strategy.value,
    supportedModels: parsedModels.value,
    enabled: enabled.value,
  })
}
</script>

<template>
  <cds-modal :hidden="!open" :closable="!saving" size="md" @closeChange="close">
    <cds-modal-header>
      <h2 cds-text="title" class="modal-title">
        {{ locale.t(isEditing ? 'gatewayModel.form.editTitle' : 'gatewayModel.form.createTitle') }}
      </h2>
    </cds-modal-header>

    <cds-modal-content>
      <form class="route-form" @submit.prevent="submit">
        <cds-input :status="attempted && !nameValid ? 'error' : 'neutral'">
          <label>{{ locale.t('gatewayModel.form.name') }}</label>
          <input
            :value="name"
            maxlength="64"
            autocomplete="off"
            :placeholder="locale.t('gatewayModel.form.namePlaceholder')"
            @input="name = ($event.target as HTMLInputElement).value"
          />
          <cds-control-message v-if="attempted && !nameValid" status="error">
            {{ locale.t('gatewayModel.form.nameError') }}
          </cds-control-message>
        </cds-input>

        <cds-select :status="attempted && !gatewayValid ? 'error' : 'neutral'">
          <label>{{ locale.t('gatewayModel.form.gateway') }}</label>
          <select
            :value="gatewayId"
            :aria-label="locale.t('gatewayModel.form.gateway')"
            @change="gatewayId = ($event.target as HTMLSelectElement).value"
          >
            <option v-for="gateway in gateways" :key="gateway.id" :value="gateway.id">
              {{ gateway.name }}
            </option>
          </select>
          <cds-control-message v-if="attempted && !gatewayValid" status="error">
            {{ locale.t('gatewayModel.form.gatewayError') }}
          </cds-control-message>
        </cds-select>

        <cds-select>
          <label>{{ locale.t('gatewayModel.form.strategy') }}</label>
          <select
            :value="strategy"
            :aria-label="locale.t('gatewayModel.form.strategy')"
            @change="strategy = ($event.target as HTMLSelectElement).value as ModelRouteStrategy"
          >
            <option v-for="item in MODEL_ROUTE_STRATEGIES" :key="item" :value="item">
              {{ locale.t(`gatewayModel.strategy.${item}`) }}
            </option>
          </select>
        </cds-select>

        <cds-textarea :status="attempted && !modelsValid ? 'error' : 'neutral'">
          <label>{{ locale.t('gatewayModel.form.models') }}</label>
          <textarea
            :value="modelsText"
            rows="5"
            :placeholder="locale.t('gatewayModel.form.modelsPlaceholder')"
            @input="modelsText = ($event.target as HTMLTextAreaElement).value"
          ></textarea>
          <cds-control-message v-if="attempted && !modelsValid" status="error">
            {{ locale.t('gatewayModel.form.modelsError') }}
          </cds-control-message>
        </cds-textarea>

        <cds-control>
          <cds-toggle>
            <label>{{ locale.t('gatewayModel.form.enabled') }}</label>
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
        {{ locale.t('common.cancel') }}
      </cds-button>
      <cds-button
        :loading-state="saving ? 'loading' : 'default'"
        :disabled="saving"
        @click="submit"
      >
        {{ locale.t('gatewayModel.form.submit') }}
      </cds-button>
    </cds-modal-actions>
  </cds-modal>
</template>

<style scoped>
.modal-title {
  margin: 0;
}
.route-form {
  display: grid;
  gap: 16px;
}
</style>
