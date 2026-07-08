<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useLocaleStore } from '@/stores/locale'
import type { VirtualKeyOption } from '@/types/virtual-key'
import {
  ROUTE_PERMISSIONS,
  ROUTE_PERMISSION_PATHS,
  type RoutePermission,
} from '@/api/graphql/queries/virtual-keys'

// VirtualKeyFormDraft — the create flow's wire payload. The postman
// `IssueVirtualKey` mutation requires `organizationId`, `name`, and
// `modelGateway`; everything else is optional. Models are sourced from
// `gatewayAvailableModels(gatewayConnectionId)` (the parent re-queries
// when the gateway picker changes) — there is no longer any M2 网关路由
// involved at this layer.
export interface VirtualKeyFormDraft {
  name: string
  organizationId: string
  modelGateway: string
  agentId?: string | null
  duration?: string
  expiresAt?: string | null
  models?: string[]
  maxBudget?: number
  budgetDuration?: string
  maxParallelRequests?: number
  tpmLimit?: number
  rpmLimit?: number
  rpmLimitType?: string
  tpmLimitType?: string
  // Frontend "Allow All Routes" Switch:
  // - ON  → allowedRoutes OMITTED in the wire payload
  // - OFF → allowedRoutes = ['/v1/chat/completions', ...]
  allowedRoutes?: string[]
  tags?: string[]
  blocked?: boolean
  keyType?: string
  autoRotate?: boolean
  rotationInterval?: string
}

const props = defineProps<{
  open: boolean
  agents: VirtualKeyOption[]
  gateways: VirtualKeyOption[]
  // Real-time model names fetched from the chosen modelGateway. An empty
  // array means "no models loaded yet" — usually because the user hasn't
  // picked a gateway yet (the parent's query is skipped).
  availableModels: string[]
  saving?: boolean
}>()

const emit = defineEmits<{
  (event: 'close'): void
  (event: 'gateway-changed', gatewayId: string): void
  (event: 'submit', draft: VirtualKeyFormDraft): void
}>()

const locale = useLocaleStore()

// Basic
const name = ref('')
const organizationId = ref('')
const modelGateway = ref('')
const selectedModels = ref<string[]>([])
const duration = ref('')
const expiresAt = ref('')
const agentId = ref('')
const showAdvanced = ref(false)

// Advanced
const maxBudget = ref<number | null>(null)
const budgetDuration = ref('')
const maxParallelRequests = ref<number | null>(null)
const tpmLimit = ref<number | null>(null)
const rpmLimit = ref<number | null>(null)
const rpmLimitType = ref('')
const tpmLimitType = ref('')
const tagsText = ref('')
const blocked = ref(false)
const keyType = ref('default')
const autoRotate = ref(false)
const rotationInterval = ref('')

// allowed_routes Switch + multi-select
const allowAllRoutes = ref(true)
const allowedRoutePermissions = ref<RoutePermission[]>([])

const attempted = ref(false)
const minimumDate = computed(() => new Date().toISOString().slice(0, 10))

const nameValid = computed(() => {
  const length = name.value.trim().length
  return length >= 2 && length <= 64
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
  agentId.value = ''
  maxBudget.value = null
  budgetDuration.value = ''
  maxParallelRequests.value = null
  tpmLimit.value = null
  rpmLimit.value = null
  rpmLimitType.value = ''
  tpmLimitType.value = ''
  tagsText.value = ''
  blocked.value = false
  keyType.value = 'default'
  autoRotate.value = false
  rotationInterval.value = ''
  allowAllRoutes.value = true
  allowedRoutePermissions.value = []
  attempted.value = false
  showAdvanced.value = false
}

watch(
  () => [props.open, props.gateways, props.agents] as const,
  ([open]) => {
    if (open) reset()
  },
  { immediate: true },
)

function close() {
  if (!props.saving) emit('close')
}

function toggleModel(model: string) {
  selectedModels.value = selectedModels.value.includes(model)
    ? selectedModels.value.filter((m) => m !== model)
    : [...selectedModels.value, model]
}

function onGatewayChange(event: Event) {
  const id = (event.target as HTMLSelectElement).value
  modelGateway.value = id
  // Reset the model selection — the previous gateway's models are no
  // longer valid (server-side verification against gatewayAvailableModels
  // will reject stale names).
  selectedModels.value = []
  emit('gateway-changed', id)
}

function togglePermission(p: RoutePermission) {
  const i = allowedRoutePermissions.value.indexOf(p)
  if (i === -1) allowedRoutePermissions.value = [...allowedRoutePermissions.value, p]
  else allowedRoutePermissions.value = allowedRoutePermissions.value.filter((_, idx) => idx !== i)
}

function submit() {
  attempted.value = true
  if (!formValid.value || props.saving) return
  const tags = tagsText.value
    .split(/[,\n，]/)
    .map((s) => s.trim())
    .filter(Boolean)
  // allowed_routes omit-when-allow-all rule (design doc §4.2):
  //   ON  → omit the field entirely (let the gateway default stand)
  //   OFF → send the explicit list of /v1/* paths
  const allowedRoutes =
    allowAllRoutes.value
      ? undefined
      : allowedRoutePermissions.value.map((p) => ROUTE_PERMISSION_PATHS[p])

  const draft: VirtualKeyFormDraft = {
    name: name.value.trim(),
    organizationId: organizationId.value.trim(),
    modelGateway: modelGateway.value,
    agentId: agentId.value || null,
    duration: duration.value.trim() || undefined,
    expiresAt: expiresAt.value
      ? new Date(`${expiresAt.value}T23:59:59`).toISOString()
      : null,
    models: selectedModels.value.length > 0 ? selectedModels.value : undefined,
    maxBudget: maxBudget.value ?? undefined,
    budgetDuration: budgetDuration.value || undefined,
    maxParallelRequests: maxParallelRequests.value ?? undefined,
    tpmLimit: tpmLimit.value ?? undefined,
    rpmLimit: rpmLimit.value ?? undefined,
    rpmLimitType: rpmLimitType.value || undefined,
    tpmLimitType: tpmLimitType.value || undefined,
    allowedRoutes,
    tags: tags.length > 0 ? tags : undefined,
    blocked: blocked.value,
    keyType: keyType.value || undefined,
    autoRotate: autoRotate.value,
    rotationInterval: rotationInterval.value || undefined,
  }
  emit('submit', draft)
}
</script>

<template>
  <cds-modal :hidden="!open" :closable="!saving" size="lg" @closeChange="close">
    <cds-modal-header>
      <h2 cds-text="title" class="modal-title">
        {{ locale.t('virtualKey.form.createTitle') }}
      </h2>
    </cds-modal-header>

    <cds-modal-content>
      <form class="key-form" @submit.prevent="submit">
        <!-- BASIC -->
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
            {{ locale.t('virtualKey.form.nameRequired') }}
          </cds-control-message>
        </cds-input>

        <cds-input :status="attempted && !orgValid ? 'error' : 'neutral'">
          <label>{{ locale.t('virtualKey.form.organization') }}</label>
          <input
            :value="organizationId"
            autocomplete="off"
            :placeholder="locale.t('virtualKey.form.organizationPlaceholder')"
            @input="organizationId = ($event.target as HTMLInputElement).value"
          />
          <cds-control-message v-if="attempted && !orgValid" status="error">
            {{ locale.t('virtualKey.form.orgRequired') }}
          </cds-control-message>
        </cds-input>

        <cds-select :status="attempted && !gatewayValid ? 'error' : 'neutral'">
          <label>{{ locale.t('virtualKey.form.gateway') }}</label>
          <select
            :value="modelGateway"
            :aria-label="locale.t('virtualKey.form.gateway')"
            @change="onGatewayChange"
          >
            <option v-for="gateway in gateways" :key="gateway.id" :value="gateway.id">
              {{ gateway.name }}
            </option>
          </select>
          <cds-control-message v-if="attempted && !gatewayValid" status="error">
            {{ locale.t('virtualKey.form.gatewayRequired') }}
          </cds-control-message>
        </cds-select>

        <!-- Models multi-select — sourced from gatewayAvailableModels after
             a gateway is picked. Server-side validates each entry against
             the gateway's live model list, so stale names 400. -->
        <div>
          <label class="section-label">{{ locale.t('virtualKey.form.models') }}</label>
          <div class="models-grid">
            <label
              v-for="model in availableModels"
              :key="model"
              class="model-option"
            >
              <input
                type="checkbox"
                :checked="selectedModels.includes(model)"
                @change="toggleModel(model)"
              />
              <span>{{ model }}</span>
            </label>
            <p v-if="availableModels.length === 0" class="model-empty">
              {{ locale.t('virtualKey.form.modelsEmpty') }}
            </p>
          </div>
          <cds-control-message v-if="modelGateway" status="neutral">
            {{ locale.t('virtualKey.form.modelsHint') }}
          </cds-control-message>
        </div>

        <cds-select>
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

        <div class="duration-row">
          <cds-input>
            <label>{{ locale.t('virtualKey.form.duration') }}</label>
            <input
              :value="duration"
              :placeholder="locale.t('virtualKey.form.durationPlaceholder')"
              @input="duration = ($event.target as HTMLInputElement).value"
            />
            <cds-control-message status="neutral">
              {{ locale.t('virtualKey.form.durationHint') }}
            </cds-control-message>
          </cds-input>
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
        </div>

        <!-- ADVANCED (LiteLLM design doc §4.2 风控抽屉) -->
        <details class="advanced-section" :open="showAdvanced">
          <summary>{{ locale.t('virtualKey.form.advanced') }}</summary>
          <div class="advanced-grid">
            <cds-input>
              <label>{{ locale.t('virtualKey.form.maxBudget') }}</label>
              <input
                type="number"
                min="0"
                step="1"
                :value="maxBudget ?? ''"
                @input="maxBudget = Number(($event.target as HTMLInputElement).value) || null"
              />
            </cds-input>
            <cds-input>
              <label>{{ locale.t('virtualKey.form.tpmLimit') }}</label>
              <input
                type="number"
                min="0"
                step="1000"
                :value="tpmLimit ?? ''"
                @input="tpmLimit = Number(($event.target as HTMLInputElement).value) || null"
              />
            </cds-input>
            <cds-input>
              <label>{{ locale.t('virtualKey.form.rpmLimit') }}</label>
              <input
                type="number"
                min="0"
                step="100"
                :value="rpmLimit ?? ''"
                @input="rpmLimit = Number(($event.target as HTMLInputElement).value) || null"
              />
            </cds-input>
            <cds-input>
              <label>{{ locale.t('virtualKey.form.maxParallelRequests') }}</label>
              <input
                type="number"
                min="0"
                step="1"
                :value="maxParallelRequests ?? ''"
                @input="
                  maxParallelRequests = Number(($event.target as HTMLInputElement).value) || null
                "
              />
            </cds-input>
            <cds-input>
              <label>{{ locale.t('virtualKey.form.budgetDuration') }}</label>
              <input
                :value="budgetDuration"
                :placeholder="locale.t('virtualKey.form.budgetDurationPlaceholder')"
                @input="budgetDuration = ($event.target as HTMLInputElement).value"
              />
            </cds-input>
            <cds-input>
              <label>{{ locale.t('virtualKey.form.tags') }}</label>
              <input
                v-model="tagsText"
                :placeholder="locale.t('virtualKey.form.tagsPlaceholder')"
              />
            </cds-input>
            <cds-input>
              <label>{{ locale.t('virtualKey.form.rotationInterval') }}</label>
              <input
                :value="rotationInterval"
                :placeholder="locale.t('virtualKey.form.rotationIntervalPlaceholder')"
                @input="rotationInterval = ($event.target as HTMLInputElement).value"
              />
            </cds-input>
            <cds-control>
              <cds-toggle>
                <label>{{ locale.t('virtualKey.form.blocked') }}</label>
                <input
                  type="checkbox"
                  slot="input"
                  :checked="blocked"
                  @change="blocked = ($event.target as HTMLInputElement).checked"
                />
              </cds-toggle>
            </cds-control>
            <cds-control>
              <cds-toggle>
                <label>{{ locale.t('virtualKey.form.autoRotate') }}</label>
                <input
                  type="checkbox"
                  slot="input"
                  :checked="autoRotate"
                  @change="autoRotate = ($event.target as HTMLInputElement).checked"
                />
              </cds-toggle>
            </cds-control>
          </div>

          <!-- allowed_routes: 隐式白名单 (design doc §4.2) -->
          <fieldset class="allowed-routes-set">
            <legend>{{ locale.t('virtualKey.form.allowedRoutes') }}</legend>
            <cds-control>
              <cds-toggle>
                <label>{{ locale.t('virtualKey.form.allowAllRoutes') }}</label>
                <input
                  type="checkbox"
                  slot="input"
                  :checked="allowAllRoutes"
                  @change="allowAllRoutes = ($event.target as HTMLInputElement).checked"
                />
              </cds-toggle>
            </cds-control>
            <div v-if="!allowAllRoutes" class="allowed-routes-options">
              <label
                v-for="p in ROUTE_PERMISSIONS"
                :key="p"
                class="allowed-route-option"
              >
                <input
                  type="checkbox"
                  :checked="allowedRoutePermissions.includes(p)"
                  @change="togglePermission(p)"
                />
                <span>{{ locale.t(`virtualKey.allowedRoutes.${p}`) }}</span>
              </label>
            </div>
            <cds-control-message v-if="attempted && !allowedRoutesValid" status="error">
              {{ locale.t('virtualKey.form.allowedRoutesError') }}
            </cds-control-message>
          </fieldset>
        </details>
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
.section-label {
  display: block;
  margin-bottom: 6px;
  font-size: 13px;
  font-weight: 500;
}
.models-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 12px;
  max-height: 160px;
  overflow-y: auto;
  border: 1px solid var(--cds-alias-object-border-color, #e8e8e8);
  border-radius: 4px;
  padding: 8px 12px;
}
.model-option {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 13px;
}
.model-empty {
  font-size: 12px;
  color: var(--cds-alias-typography-color-300, #565656);
  margin: 0;
}
.duration-row {
  display: grid;
  gap: 16px;
  grid-template-columns: 1fr 1fr;
}
.advanced-section {
  border: 1px solid var(--cds-alias-object-border-color, #e8e8e8);
  border-radius: 4px;
  padding: 8px 12px;
}
.advanced-section summary {
  cursor: pointer;
  font-weight: 500;
  margin-bottom: 8px;
}
.advanced-grid {
  display: grid;
  gap: 12px;
  grid-template-columns: 1fr 1fr;
}
.allowed-routes-set {
  border: 1px solid var(--cds-alias-object-border-color, #e8e8e8);
  border-radius: 4px;
  padding: 8px 12px;
  margin: 12px 0 0 0;
}
.allowed-routes-set legend {
  font-size: 12px;
  padding: 0 6px;
  color: var(--cds-alias-typography-color-300, #565656);
}
.allowed-routes-options {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 12px;
  margin-top: 8px;
}
.allowed-route-option {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 13px;
}
</style>