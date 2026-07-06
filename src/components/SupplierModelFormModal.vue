<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { apolloClient } from '@/api/graphql/client'
import { useLocaleStore } from '@/stores/locale'
import { useToast } from '@/composables/useToast'
import { graphqlErrorMessage } from '@/api/graphql/errors'
import { MODEL_NAME_PATTERN } from '@/types/supplier-model'
import {
  TEST_PROVIDER_CONNECTION,
  type ProviderModelNode,
  type CreateProviderModelInput,
  type UpdateProviderModelInput,
  type ModelSpecInput,
  type LitellmParamsInput,
  type ModelInfoInput,
  type TestProviderConnectionResult,
  type TestProviderConnectionVars,
  type ProviderModelStatus,
} from '@/api/graphql/queries/supplier-models'

// ─── Wizard state machine ────────────────────────────────────────────────
// Three steps: row-level identity (name + gateway), per-deployment detail
// (spec array editor), and a read-only review before submit. Edit mode
// renders step 1 as read-only (`name` and `modelGateway` are locked).
type StepId = 'basic' | 'specs' | 'review'
const STEPS: readonly StepId[] = ['basic', 'specs', 'review'] as const

function stepIndex(s: StepId): number {
  return STEPS.indexOf(s)
}

interface SpecDraft {
  specId: string | null
  model: string
  customLlmProvider: string
  apiKey: string
  apiBase: string
  organization: string
  mode: string
  tpm: number | null
  rpm: number | null
  maxBudget: number | null
  budgetDuration: string
  useInPassThrough: boolean
  useLitellmProxy: boolean
  useChatCompletionsApi: boolean
  mergeReasoningContentInChoices: boolean
  tags: string[]
  inputCostPerToken: number | null
  outputCostPerToken: number | null
  cacheReadInputTokenCost: number | null
  cacheCreationInputTokenCost: number | null
}

function emptySpec(): SpecDraft {
  return {
    specId: null,
    model: '',
    customLlmProvider: '',
    apiKey: '',
    apiBase: '',
    organization: '',
    mode: '',
    tpm: null,
    rpm: null,
    maxBudget: null,
    budgetDuration: '',
    useInPassThrough: false,
    useLitellmProxy: false,
    useChatCompletionsApi: true,
    mergeReasoningContentInChoices: false,
    tags: [],
    inputCostPerToken: null,
    outputCostPerToken: null,
    cacheReadInputTokenCost: null,
    cacheCreationInputTokenCost: null,
  }
}

const props = defineProps<{
  open: boolean
  model: ProviderModelNode | null
  gateways: Array<{ id: string; name: string }>
  saving?: boolean
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'submit', input: CreateProviderModelInput | UpdateProviderModelInput): void
}>()

const locale = useLocaleStore()
const toast = useToast()

const name = ref('')
const gatewayId = ref('')
const specDrafts = ref<SpecDraft[]>([])
const attempt = ref(false)
const testing = ref(false)
const testStatus = ref<ProviderModelStatus | null>(null)
const advancedOpen = ref(false)

const defaultApiKeyTpmLimit = ref<number | null>(null)
const defaultApiKeyRpmLimit = ref<number | null>(null)
const openSpecIndex = ref<number>(0)

// Wizard step + per-step attempt flags (Task 2 / spec §3.2). Entering a
// new step resets both flags so old error states don't bleed across
// transitions. Step 'review' is read-only and never needs an attempt flag.
const currentStep = ref<StepId>('basic')
const attemptBasic = ref(false)
const attemptSpecs = ref(false)

const isEditing = computed(() => Boolean(props.model))

watch(
  () => [props.model, props.open] as const,
  () => {
    if (!props.open) return
    if (props.model) {
      const m = props.model
      name.value = m.name
      gatewayId.value = m.modelGateway.id
      specDrafts.value = m.modelSpecs.map((s) => ({
        specId: s.modelInfo.id,
        model: s.litellmParams.model,
        customLlmProvider: s.litellmParams.customLlmProvider,
        apiKey: '',
        apiBase: s.litellmParams.apiBase ?? '',
        organization: s.litellmParams.organization ?? '',
        mode: s.modelInfo.mode ?? '',
        tpm: s.litellmParams.tpm,
        rpm: s.litellmParams.rpm,
        maxBudget: s.litellmParams.maxBudget,
        budgetDuration: s.litellmParams.budgetDuration ?? '',
        useInPassThrough: s.litellmParams.useInPassThrough,
        useLitellmProxy: s.litellmParams.useLitellmProxy,
        useChatCompletionsApi: s.litellmParams.useChatCompletionsApi,
        mergeReasoningContentInChoices: s.litellmParams.mergeReasoningContentInChoices,
        tags: [...s.litellmParams.tags],
        inputCostPerToken: s.litellmParams.inputCostPerToken,
        outputCostPerToken: s.litellmParams.outputCostPerToken,
        cacheReadInputTokenCost: s.litellmParams.cacheReadInputTokenCost,
        cacheCreationInputTokenCost: s.litellmParams.cacheCreationInputTokenCost,
      }))
      advancedOpen.value = false
      defaultApiKeyTpmLimit.value = null
      defaultApiKeyRpmLimit.value = null
    } else {
      name.value = ''
      gatewayId.value = ''
      specDrafts.value = [emptySpec()]
      advancedOpen.value = false
      defaultApiKeyTpmLimit.value = null
      defaultApiKeyRpmLimit.value = null
    }
    attempt.value = false
    testStatus.value = null
    openSpecIndex.value = 0
    currentStep.value = 'basic'
  },
  { immediate: true },
)

const nameValid = computed(() => {
  const trimmed = name.value.trim()
  return trimmed.length >= 2 && MODEL_NAME_PATTERN.test(trimmed)
})
const gatewayValid = computed(() => Boolean(gatewayId.value))
const specValid = computed(() =>
  specDrafts.value.every(
    (s) => s.model.trim().length > 0 && s.customLlmProvider.trim().length > 0,
  ),
)
const apiKeyValid = computed(() =>
  isEditing.value
    ? true
    : specDrafts.value.every((s) => s.apiKey.trim().length > 0),
)

const basicValid = computed(() => nameValid.value && gatewayValid.value)
const specsValid = computed(() => specValid.value && apiKeyValid.value)

// Legacy single-boolean validity for the submit() guard. Kept so the
// submit() function below can keep its `if (!formValid.value || props.saving) return`
// defensive check intact.
const formValid = computed(
  () =>
    basicValid.value &&
    specsValid.value,
)

const showUnsavedDropWarning = computed(() =>
  isEditing.value && props.model
    ? specDrafts.value.length < props.model.modelSpecs.length
    : false,
)

function addSpec() {
  specDrafts.value = [...specDrafts.value, emptySpec()]
  openSpecIndex.value = specDrafts.value.length - 1
}

function removeSpec(index: number) {
  if (specDrafts.value.length <= 1) return
  specDrafts.value = specDrafts.value.filter((_, i) => i !== index)
  if (openSpecIndex.value >= specDrafts.value.length) {
    openSpecIndex.value = specDrafts.value.length - 1
  }
}

 
function canAdvance(): boolean {
  if (currentStep.value === 'basic') return basicValid.value
  if (currentStep.value === 'specs') return specsValid.value
  return true // review → submit is gated by the submit() guard, not by goNext
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function goNext() {
  if (!canAdvance()) {
    if (currentStep.value === 'basic') attemptBasic.value = true
    else if (currentStep.value === 'specs') attemptSpecs.value = true
    return
  }
  attemptBasic.value = false
  attemptSpecs.value = false
  const idx = stepIndex(currentStep.value)
  if (idx < STEPS.length - 1) currentStep.value = STEPS[idx + 1]
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function goPrev() {
  attemptBasic.value = false
  attemptSpecs.value = false
  const idx = stepIndex(currentStep.value)
  if (idx > 0) currentStep.value = STEPS[idx - 1]
}

function close() {
  if (!props.saving) emit('close')
}

async function testConnection() {
  if (!nameValid.value || !specDrafts.value[0]?.model) {
    attempt.value = true
    return
  }
  testing.value = true
  testStatus.value = null
  try {
    const r = await apolloClient.mutate<
      TestProviderConnectionResult,
      TestProviderConnectionVars
    >({
      mutation: TEST_PROVIDER_CONNECTION,
      variables: { name: name.value.trim() },
    })
    testStatus.value = r.data?.testProviderConnection ?? null
  } catch (error) {
    toast.error(graphqlErrorMessage(error, locale.t('supplier.model.form.testUnknown')))
    testStatus.value = 'unknown'
  } finally {
    testing.value = false
  }
}

function numOrNull(v: string): number | null {
  if (v.trim() === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function draftToSpecInput(d: SpecDraft): ModelSpecInput {
  const lp: LitellmParamsInput = {
    model: d.model.trim(),
    customLlmProvider: d.customLlmProvider.trim(),
    apiBase: d.apiBase || null,
    organization: d.organization || null,
    tpm: d.tpm,
    rpm: d.rpm,
    maxBudget: d.maxBudget,
    budgetDuration: d.budgetDuration || null,
    useInPassThrough: d.useInPassThrough,
    useLitellmProxy: d.useLitellmProxy,
    useChatCompletionsApi: d.useChatCompletionsApi,
    mergeReasoningContentInChoices: d.mergeReasoningContentInChoices,
    tags: d.tags.length > 0 ? d.tags : null,
    inputCostPerToken: d.inputCostPerToken,
    outputCostPerToken: d.outputCostPerToken,
    cacheReadInputTokenCost: d.cacheReadInputTokenCost,
    cacheCreationInputTokenCost: d.cacheCreationInputTokenCost,
  }
  // apiKey: create → must send; edit → only send if user typed a non-empty value (rotate).
  if (!isEditing.value || d.apiKey.trim().length > 0) {
    lp.apiKey = d.apiKey
  }
  const mi: ModelInfoInput = {
    mode: d.mode || null,
    blocked: false,
  }
  if (d.specId) mi.id = d.specId
  return { litellmParams: lp, modelInfo: mi }
}

function submit() {
  attempt.value = true
  if (!formValid.value || props.saving) return
  const modelSpecs: ModelSpecInput[] = specDrafts.value.map(draftToSpecInput)
  if (isEditing.value) {
    emit('submit', {
      providerModelId: props.model!.id,
      modelSpecs,
    } satisfies UpdateProviderModelInput)
  } else {
    emit('submit', {
      name: name.value.trim(),
      modelGateway: gatewayId.value,
      modelSpecs,
      defaultApiKeyTpmLimit: defaultApiKeyTpmLimit.value,
      defaultApiKeyRpmLimit: defaultApiKeyRpmLimit.value,
    } satisfies CreateProviderModelInput)
  }
}

function badgeClassForTestStatus(s: ProviderModelStatus) {
  return s === 'full_healthy'
    ? 'success'
    : s === 'full_outage'
      ? 'danger'
      : s === 'partial_outage'
        ? 'warning'
        : 'neutral'
}

// ─── Review (step 3) helpers ──────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const currentGatewayName = computed(() => {
  const g = props.gateways.find((g) => g.id === gatewayId.value)
  return g?.name ?? locale.t('supplier.model.form.review.unset')
})

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function hasLimits(d: SpecDraft): boolean {
  return Boolean(d.tpm ?? d.rpm ?? d.maxBudget ?? d.budgetDuration)
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function formatLimits(d: SpecDraft): string {
  const parts: string[] = []
  if (d.tpm) parts.push(`tpm ${d.tpm}`)
  if (d.rpm) parts.push(`rpm ${d.rpm}`)
  if (d.maxBudget) parts.push(`maxBudget ${d.maxBudget}`)
  if (d.budgetDuration) parts.push(`budgetDuration ${d.budgetDuration}`)
  return parts.join(' / ')
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function hasCost(d: SpecDraft): boolean {
  return Boolean(
    d.inputCostPerToken ??
      d.outputCostPerToken ??
      d.cacheReadInputTokenCost ??
      d.cacheCreationInputTokenCost,
  )
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function formatCost(d: SpecDraft): string {
  const parts: string[] = []
  if (d.inputCostPerToken != null) parts.push(`in ${d.inputCostPerToken}`)
  if (d.outputCostPerToken != null) parts.push(`out ${d.outputCostPerToken}`)
  if (d.cacheReadInputTokenCost != null) parts.push(`cr ${d.cacheReadInputTokenCost}`)
  if (d.cacheCreationInputTokenCost != null) parts.push(`cw ${d.cacheCreationInputTokenCost}`)
  return parts.join(' / ')
}
</script>

<template>
  <cds-modal :hidden="!open" :closable="!saving" size="lg" @closeChange="close">
    <cds-modal-header>
      <h2 cds-text="title" class="modal-title">
        {{ locale.t(isEditing ? 'supplier.model.form.editTitle' : 'supplier.model.form.createTitle') }}
      </h2>
    </cds-modal-header>

    <cds-modal-content>
      <form class="model-form" @submit.prevent="submit">
        <!-- BASIC -->
        <cds-input :status="attempt && !nameValid ? 'error' : 'neutral'">
          <label>{{ locale.t('supplier.model.form.name') }}</label>
          <input
            :value="name"
            minlength="2"
            maxlength="64"
            autocomplete="off"
            :readonly="isEditing"
            :placeholder="locale.t('supplier.model.form.namePlaceholder')"
            @input="name = ($event.target as HTMLInputElement).value"
          />
          <cds-control-message v-if="attempt && !nameValid" status="error">
            {{ locale.t('supplier.model.form.nameError') }}
          </cds-control-message>
          <cds-control-message v-else-if="isEditing" status="neutral">
            {{ locale.t('supplier.model.form.nameLockedHint') }}
          </cds-control-message>
          <cds-control-message v-else status="neutral">
            {{ locale.t('supplier.model.form.nameHint') }}
          </cds-control-message>
        </cds-input>

        <cds-select :status="attempt && !gatewayValid ? 'error' : 'neutral'">
          <label>{{ locale.t('supplier.model.form.gateway') }}</label>
          <select
            :value="gatewayId"
            :disabled="isEditing"
            :aria-label="locale.t('supplier.model.form.gateway')"
            @change="gatewayId = ($event.target as HTMLSelectElement).value"
          >
            <option value="">{{ locale.t('supplier.model.form.gatewayPlaceholder') }}</option>
            <option v-for="g in gateways" :key="g.id" :value="g.id">{{ g.name }}</option>
          </select>
          <cds-control-message v-if="isEditing" status="neutral">
            {{ locale.t('supplier.model.form.gatewayLockedHint') }}
          </cds-control-message>
        </cds-select>

        <!-- SPECS -->
        <div class="specs-section">
          <div class="specs-header">
            <strong>{{ locale.t('supplier.model.form.specs') }}</strong>
            <cds-control-message status="neutral">
              {{ locale.t('supplier.model.form.specsHint') }}
            </cds-control-message>
          </div>

          <div
            v-for="(d, i) in specDrafts"
            :key="i"
            class="spec-block"
          >
            <button
              type="button"
              class="spec-toggle"
              :class="{ open: openSpecIndex === i }"
              @click="openSpecIndex = openSpecIndex === i ? -1 : i"
            >
              <cds-icon
                shape="angle"
                :direction="openSpecIndex === i ? 'down' : 'right'"
                size="sm"
              ></cds-icon>
              <span>
                Spec #{{ i + 1 }}
                <template v-if="d.model">— {{ d.model }}</template>
                <template v-else>(未填写)</template>
              </span>
              <span
                role="button"
                tabindex="0"
                class="spec-remove"
                :class="{ disabled: specDrafts.length <= 1 }"
                :aria-disabled="specDrafts.length <= 1"
                @click.stop="specDrafts.length > 1 && removeSpec(i)"
                @keydown.enter.stop.prevent="specDrafts.length > 1 && removeSpec(i)"
                @keydown.space.stop.prevent="specDrafts.length > 1 && removeSpec(i)"
              >
                {{ locale.t('supplier.model.form.spec.removeSpec') }}
              </span>
            </button>
            <div v-if="openSpecIndex === i" class="spec-body">
              <div class="spec-grid">
                <cds-input :status="attempt && !d.model.trim() ? 'error' : 'neutral'">
                  <label>model</label>
                  <input
                    :value="d.model"
                    autocomplete="off"
                    placeholder="deepseek-chat"
                    @input="d.model = ($event.target as HTMLInputElement).value"
                  />
                  <cds-control-message v-if="attempt && !d.model.trim()" status="error">必填</cds-control-message>
                </cds-input>
                <cds-input :status="attempt && !d.customLlmProvider.trim() ? 'error' : 'neutral'">
                  <label>{{ locale.t('supplier.model.form.spec.customLlmProvider') }}</label>
                  <input
                    :value="d.customLlmProvider"
                    autocomplete="off"
                    placeholder="deepseek"
                    @input="d.customLlmProvider = ($event.target as HTMLInputElement).value"
                  />
                  <cds-control-message status="neutral">
                    {{ locale.t('supplier.model.form.spec.customLlmProviderHint') }}
                  </cds-control-message>
                </cds-input>
                <cds-input :status="!isEditing && attempt && !d.apiKey.trim() ? 'error' : 'neutral'">
                  <label>{{ locale.t('supplier.model.form.spec.apiKey') }}</label>
                  <input
                    type="password"
                    autocomplete="off"
                    :placeholder="locale.t('supplier.model.form.spec.apiKeyPlaceholder')"
                    @input="d.apiKey = ($event.target as HTMLInputElement).value"
                  />
                </cds-input>
                <cds-input>
                  <label>apiBase</label>
                  <input
                    :value="d.apiBase"
                    autocomplete="off"
                    placeholder="https://api.deepseek.com"
                    @input="d.apiBase = ($event.target as HTMLInputElement).value"
                  />
                </cds-input>
                <cds-input>
                  <label>organization</label>
                  <input
                    :value="d.organization"
                    autocomplete="off"
                    @input="d.organization = ($event.target as HTMLInputElement).value"
                  />
                </cds-input>
                <cds-input>
                  <label>{{ locale.t('supplier.model.form.spec.mode') }}</label>
                  <input
                    :value="d.mode"
                    autocomplete="off"
                    placeholder="chat"
                    @input="d.mode = ($event.target as HTMLInputElement).value"
                  />
                </cds-input>
              </div>

              <details class="advanced-section">
                <summary>{{ locale.t('supplier.model.form.advanced') }}</summary>
                <div class="advanced-grid">
                  <cds-input>
                    <label>tpm</label>
                    <input
                      type="number"
                      :value="d.tpm ?? ''"
                      @input="d.tpm = numOrNull(($event.target as HTMLInputElement).value)"
                    />
                  </cds-input>
                  <cds-input>
                    <label>rpm</label>
                    <input
                      type="number"
                      :value="d.rpm ?? ''"
                      @input="d.rpm = numOrNull(($event.target as HTMLInputElement).value)"
                    />
                  </cds-input>
                  <cds-input>
                    <label>maxBudget</label>
                    <input
                      type="number"
                      step="any"
                      :value="d.maxBudget ?? ''"
                      @input="d.maxBudget = numOrNull(($event.target as HTMLInputElement).value)"
                    />
                  </cds-input>
                  <cds-input>
                    <label>budgetDuration</label>
                    <input
                      :value="d.budgetDuration"
                      placeholder="30d"
                      @input="d.budgetDuration = ($event.target as HTMLInputElement).value"
                    />
                  </cds-input>
                  <cds-input>
                    <label>tags</label>
                    <input
                      :value="d.tags.join(', ')"
                      placeholder="production, reasoner"
                      @input="d.tags = ($event.target as HTMLInputElement).value.split(/[,\n，]/).map((s) => s.trim()).filter(Boolean)"
                    />
                  </cds-input>
                </div>
                <div class="advanced-grid">
                  <cds-input>
                    <label>{{ locale.t('supplier.model.form.cost.input') }}</label>
                    <input
                      type="number"
                      step="any"
                      :value="d.inputCostPerToken ?? ''"
                      @input="d.inputCostPerToken = numOrNull(($event.target as HTMLInputElement).value)"
                    />
                  </cds-input>
                  <cds-input>
                    <label>{{ locale.t('supplier.model.form.cost.output') }}</label>
                    <input
                      type="number"
                      step="any"
                      :value="d.outputCostPerToken ?? ''"
                      @input="d.outputCostPerToken = numOrNull(($event.target as HTMLInputElement).value)"
                    />
                  </cds-input>
                  <cds-input>
                    <label>{{ locale.t('supplier.model.form.cost.cacheRead') }}</label>
                    <input
                      type="number"
                      step="any"
                      :value="d.cacheReadInputTokenCost ?? ''"
                      @input="d.cacheReadInputTokenCost = numOrNull(($event.target as HTMLInputElement).value)"
                    />
                  </cds-input>
                  <cds-input>
                    <label>{{ locale.t('supplier.model.form.cost.cacheWrite') }}</label>
                    <input
                      type="number"
                      step="any"
                      :value="d.cacheCreationInputTokenCost ?? ''"
                      @input="d.cacheCreationInputTokenCost = numOrNull(($event.target as HTMLInputElement).value)"
                    />
                  </cds-input>
                </div>
                <div class="advanced-grid flags-grid">
                  <cds-control>
                    <cds-toggle>
                      <label>{{ locale.t('supplier.model.form.flag.useInPassThrough') }}</label>
                      <input
                        type="checkbox"
                        slot="input"
                        :checked="d.useInPassThrough"
                        @change="d.useInPassThrough = ($event.target as HTMLInputElement).checked"
                      />
                    </cds-toggle>
                  </cds-control>
                  <cds-control>
                    <cds-toggle>
                      <label>{{ locale.t('supplier.model.form.flag.useLitellmProxy') }}</label>
                      <input
                        type="checkbox"
                        slot="input"
                        :checked="d.useLitellmProxy"
                        @change="d.useLitellmProxy = ($event.target as HTMLInputElement).checked"
                      />
                    </cds-toggle>
                  </cds-control>
                  <cds-control>
                    <cds-toggle>
                      <label>{{ locale.t('supplier.model.form.flag.useChatCompletionsApi') }}</label>
                      <input
                        type="checkbox"
                        slot="input"
                        :checked="d.useChatCompletionsApi"
                        @change="d.useChatCompletionsApi = ($event.target as HTMLInputElement).checked"
                      />
                    </cds-toggle>
                  </cds-control>
                  <cds-control>
                    <cds-toggle>
                      <label>{{ locale.t('supplier.model.form.flag.mergeReasoningContentInChoices') }}</label>
                      <input
                        type="checkbox"
                        slot="input"
                        :checked="d.mergeReasoningContentInChoices"
                        @change="d.mergeReasoningContentInChoices = ($event.target as HTMLInputElement).checked"
                      />
                    </cds-toggle>
                  </cds-control>
                </div>
              </details>
            </div>
          </div>

          <cds-button action="outline" size="sm" @click="addSpec">
            <cds-icon shape="plus-circle" size="sm"></cds-icon>
            {{ locale.t('supplier.model.form.spec.addSpec') }}
          </cds-button>

          <cds-control-message
            v-if="showUnsavedDropWarning"
            status="warning"
            class="drop-warning"
          >
            {{ locale.t('supplier.model.form.unsavedDropWarning') }}
          </cds-control-message>
        </div>

        <!-- TEST ROW (create only) -->
        <div v-if="!isEditing" class="test-row">
          <cds-button
            action="outline"
            :disabled="testing || !nameValid || !specDrafts[0]?.model?.trim()"
            @click="testConnection"
          >
            <cds-icon shape="network-globe" size="sm"></cds-icon>
            {{ locale.t('supplier.model.form.testConnection') }}
          </cds-button>
          <cds-badge
            v-if="testStatus"
            :status="badgeClassForTestStatus(testStatus)"
            class="test-status"
          >
            {{ locale.t(`supplier.status.${testStatus}`) }}
          </cds-badge>
        </div>

        <!-- ADVANCED (create only) -->
        <details v-if="!isEditing" class="advanced-section" :open="advancedOpen">
          <summary>{{ locale.t('supplier.model.form.advanced') }}</summary>
          <div class="advanced-grid">
            <cds-input>
              <label>{{ locale.t('supplier.model.form.defaultApiKeyTpmLimit') }}</label>
              <input
                type="number"
                :value="defaultApiKeyTpmLimit ?? ''"
                @input="defaultApiKeyTpmLimit = numOrNull(($event.target as HTMLInputElement).value)"
              />
            </cds-input>
            <cds-input>
              <label>{{ locale.t('supplier.model.form.defaultApiKeyRpmLimit') }}</label>
              <input
                type="number"
                :value="defaultApiKeyRpmLimit ?? ''"
                @input="defaultApiKeyRpmLimit = numOrNull(($event.target as HTMLInputElement).value)"
              />
            </cds-input>
          </div>
        </details>
      </form>
    </cds-modal-content>

    <cds-modal-actions>
      <cds-button action="outline" :disabled="saving" @click="close">
        {{ locale.t('supplier.model.form.cancel') }}
      </cds-button>
      <cds-button
        :loading-state="saving ? 'loading' : 'default'"
        :disabled="saving"
        @click="submit"
      >
        {{ locale.t('supplier.model.form.submit') }}
      </cds-button>
    </cds-modal-actions>
  </cds-modal>
</template>

<style scoped>
.modal-title { margin: 0; }
.model-form { display: grid; gap: 16px; max-height: 70vh; overflow: auto; padding-right: 4px; }
.specs-section { display: grid; gap: 8px; }
.specs-header { display: flex; align-items: center; gap: 8px; }
.spec-block { border: 1px solid var(--cds-alias-object-border-color, #e8e8e8); border-radius: 4px; }
.spec-toggle {
  display: flex; align-items: center; gap: 8px; width: 100%;
  padding: 8px 12px; border: 0; background: transparent; cursor: pointer; font: inherit; text-align: left;
}
.spec-toggle.open { background: var(--cds-alias-object-app-background, #f4f4f4); }
.spec-remove {
  margin-left: auto; padding: 4px 8px; border: 1px solid var(--cds-alias-object-border-color, #8c8c8c);
  border-radius: 3px; background: transparent; cursor: pointer; font: inherit; font-size: 12px;
}
.spec-remove.disabled { opacity: 0.5; cursor: not-allowed; }
.spec-body { padding: 12px; border-top: 1px solid var(--cds-alias-object-border-color, #e8e8e8); display: grid; gap: 12px; }
.spec-grid { display: grid; gap: 12px; grid-template-columns: 1fr 1fr; }
.advanced-section { border: 1px solid var(--cds-alias-object-border-color, #e8e8e8); border-radius: 4px; padding: 8px 12px; }
.advanced-section summary { cursor: pointer; font-weight: 500; margin-bottom: 8px; }
.advanced-grid { display: grid; gap: 12px; grid-template-columns: 1fr 1fr; margin-bottom: 8px; }
.flags-grid { grid-template-columns: 1fr 1fr; }
.test-row { display: flex; align-items: center; gap: 10px; }
.test-status { text-transform: capitalize; }
.drop-warning { margin-top: 8px; }
</style>