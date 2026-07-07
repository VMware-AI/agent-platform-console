<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { apolloClient } from '@/api/graphql/client'
import { useLocaleStore } from '@/stores/locale'
import { useToast } from '@/composables/useToast'
import { graphqlErrorMessage } from '@/api/graphql/errors'
import {
  MODEL_NAME_PATTERN,
  PROVIDER_OPTIONS,
  PROVIDER_DEFAULT_API_BASE,
  PROVIDER_CUSTOM,
  type ProviderOption,
} from '@/types/supplier-model'
import {
  TEST_PRIVATE_MODEL_SPEC_CONNECTION,
  type ProviderModelNode,
  type CreateProviderModelInput,
  type UpdateProviderModelInput,
  type ModelSpecInput,
  type LitellmParamsInput,
  type ModelInfoInput,
  type TestPrivateModelSpecConnectionResult,
  type TestPrivateModelSpecConnectionVars,
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
  // `providerSelect` 是下拉选中值:空串 = 不指定,`PROVIDER_CUSTOM` = 用户输入
  // 自定义值(此时 `providerCustom` 才有效),其它 = 已知名。
  // `providerCustom` 是「自定义供应商」分支下的实际字符串。
  providerSelect: string
  providerCustom: string
  apiKey: string
  apiBase: string
  // `modeSelect` 是下拉选中值:空串 = 不指定,`MODE_CUSTOM` = 用户输入
  // 自定义值(此时 `modeCustom` 才有效),其它 = 已知名。
  // `modeCustom` 是「自定义…」分支下的实际字符串。
  modeSelect: string
  modeCustom: string
  tpm: number | null
  rpm: number | null
  maxBudget: number | null
  budgetDuration: string
  useInPassThrough: boolean
  useChatCompletionsApi: boolean
  mergeReasoningContentInChoices: boolean
  tags: string[]
  // 设置限额开关:关闭时 tpm/rpm/maxBudget/budgetDuration 四个输入整体隐藏,
  // 提交时四项限额字段为 null。开启后,四项限额输入才出现。
  useLimits: boolean
  // 自定义价格开关:关闭时四项费用输入整体隐藏,提交时各费用字段为 null。
  // 开启后,四项费用输入框才出现,用户填入的数字原样提交。
  useCustomPrice: boolean
  inputCostPerToken: number | null
  outputCostPerToken: number | null
  cacheReadInputTokenCost: number | null
  cacheCreationInputTokenCost: number | null
}

function emptySpec(): SpecDraft {
  return {
    specId: null,
    model: '',
    providerSelect: '',
    providerCustom: '',
    apiKey: '',
    apiBase: '',
    modeSelect: '',
    modeCustom: '',
    tpm: null,
    rpm: null,
    maxBudget: null,
    budgetDuration: '',
    useInPassThrough: false,
    useChatCompletionsApi: true,
    mergeReasoningContentInChoices: false,
    tags: [],
    useLimits: false,
    useCustomPrice: false,
    inputCostPerToken: null,
    outputCostPerToken: null,
    cacheReadInputTokenCost: null,
    cacheCreationInputTokenCost: null,
  }
}

// Resolve the *effective* provider string from the two-field state.
// Used by both submit (write) and validation (read). Mirrors the
// modeSelect/modeCustom helper inline in draftToSpecInput.
function effectiveProvider(d: SpecDraft): string {
  return d.providerSelect === PROVIDER_CUSTOM ? d.providerCustom.trim() : d.providerSelect
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

// ─── Mode 字段 ──────────────────────────────────────────────────────────
// 后端 modelInfo.mode 当前为 free-form 字符串,尚未提供枚举。这里给
// 出 LiteLLM 常见的 mode 选项;`MODE_OPTIONS` 决定下拉里列出哪些值。
// 出于兼容考虑:
//   - 空串表示「不指定」(传给后端时映射成 null)
//   - `MODE_CUSTOM` 是占位哨兵,代表用户选择了"自定义",此时真正写入
//     的是 `d.modeCustom` 字段。后端调整枚举之前,已有但不在
//     `MODE_OPTIONS` 里的字符串会被原样回显、保留并提交,不会被覆盖。
const MODE_CUSTOM = '__custom__'
const MODE_OPTIONS: readonly string[] = [
  'chat',
  'completion',
  'embedding',
  'audio_speech',
  'audio_transcription',
  'image_generation',
  'video_generation',
  'rerank',
  'realtime',
  'batch',
  'ocr',
]

const locale = useLocaleStore()
const toast = useToast()

const name = ref('')
const gatewayId = ref('')
// Row-level organization: shared across every spec on this ProviderModel.
// Stored as a string (raw user input); broadcast to all specs on submit.
const organization = ref('')
const specDrafts = ref<SpecDraft[]>([])
const attempt = ref(false)
// `testing` stays a single boolean so the test button disables across all
// specs while one is in flight. `testingSpecIndex` records which spec is
// currently being probed (purely for telemetry / debugging).
const testing = ref(false)
const testingSpecIndex = ref<number | null>(null)
// Per-spec test status: keyed by spec index. Each spec retains its own
// last-known status badge across re-renders. Entries are populated by
// testConnectionForSpec().
type TestOutcome = 'success' | 'failure'
const specTestStatus = ref<Record<number, TestOutcome | null>>({})
// Per-spec failure message from the most recent probe. Cleared on success
// or before retrying so a stale reason doesn't bleed into the next run.
// Surfaces in the per-spec status badge AND in the toast — without this,
// a GraphQL validation failure (data:null) would leak the raw {message}
// placeholder into the badge because the testFailure template interpolates
// the reason.
const specTestMessages = ref<Record<number, string>>({})
// Per-spec upstream model list returned by the most recent
// testPrivateModelSpecConnection probe. UI-only — never serialized into
// the submit payload. Cleared on probe failure or empty result so the
// user doesn't keep picking stale suggestions.
const specModelLists = ref<Record<number, string[]>>({})
// Per-spec 高级参数 chevron state, keyed by spec index. Each spec's
// details element has its own row, so it must own its own open state —
// sharing a single ref would let clicking one spec flip another spec's
// chevron. The whole-ProviderModel "create-only defaults" details below
// uses a separate ref because it lives outside the spec v-for.
const specAdvancedOpen = ref<Record<number, boolean>>({})
const providerAdvancedOpen = ref(false)

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
      // Seed row-level organization from the first spec. If specs carry
      // different org values we silently keep the first; user can
      // override (locked in edit mode, see template).
      organization.value = m.modelSpecs[0]?.litellmParams.organization ?? ''
      specDrafts.value = m.modelSpecs.map((s) => {
        // 把后端回传的 provider 字符串映射回下拉控件:
        //   - 空: 选中"不指定"
        //   - 在 PROVIDER_OPTIONS 内的: 直接选对应项
        //   - 其它(如已有但尚未列入选项的自定义值,如 gemini / mistral):
        //     选中"自定义供应商",把原值保留到 providerCustom,提交时原样
        //     回传,不被前端覆盖
        const incomingProvider = s.litellmParams.customLlmProvider ?? ''
        const matchedProvider = (PROVIDER_OPTIONS as readonly string[]).includes(incomingProvider)
        // 把后端回传的 mode 字符串映射回下拉控件:
        //   - 空 / null: 选中"不指定"
        //   - 在 MODE_OPTIONS 内的: 直接选对应项
        //   - 其它(如已有但尚未列入选项的自定义值): 选中"自定义…",
        //     把原值保留到 modeCustom,提交时原样回传,不被前端覆盖
        const incoming = s.modelInfo.mode ?? ''
        const matched = MODE_OPTIONS.includes(incoming)
        return {
          specId: s.modelInfo.id,
          model: s.litellmParams.model,
          providerSelect: matchedProvider ? incomingProvider : incomingProvider ? PROVIDER_CUSTOM : '',
          providerCustom: matchedProvider || !incomingProvider ? '' : incomingProvider,
          apiKey: '',
          apiBase: s.litellmParams.apiBase ?? '',
          modeSelect: matched ? incoming : incoming ? MODE_CUSTOM : '',
          modeCustom: matched || !incoming ? '' : incoming,
          tpm: s.litellmParams.tpm,
          rpm: s.litellmParams.rpm,
          maxBudget: s.litellmParams.maxBudget,
          budgetDuration: s.litellmParams.budgetDuration ?? '',
          useInPassThrough: s.litellmParams.useInPassThrough,
          useChatCompletionsApi: s.litellmParams.useChatCompletionsApi,
          mergeReasoningContentInChoices: s.litellmParams.mergeReasoningContentInChoices,
          tags: [...s.litellmParams.tags],
          // 任一限额字段已设置即视为「设置限额」开启,避免来回切换
          // 时把后端已存的值藏起来、丢失。
          useLimits:
            s.litellmParams.tpm != null ||
            s.litellmParams.rpm != null ||
            s.litellmParams.maxBudget != null ||
            Boolean(s.litellmParams.budgetDuration),
          // 任一费用字段已设置即视为「自定义价格」开启,避免来回切换
          // 时把后端已存的值藏起来、丢失。
          useCustomPrice:
            s.litellmParams.inputCostPerToken != null ||
            s.litellmParams.outputCostPerToken != null ||
            s.litellmParams.cacheReadInputTokenCost != null ||
            s.litellmParams.cacheCreationInputTokenCost != null,
          inputCostPerToken: s.litellmParams.inputCostPerToken,
          outputCostPerToken: s.litellmParams.outputCostPerToken,
          cacheReadInputTokenCost: s.litellmParams.cacheReadInputTokenCost,
          cacheCreationInputTokenCost: s.litellmParams.cacheCreationInputTokenCost,
        }
      })
      specAdvancedOpen.value = {}
      providerAdvancedOpen.value = false
      // Seed the broadcast defaults from the first spec — backend persists
      // these per spec, but the form only exposes one input pair, so the
      // user sees and edits one representative value.
      defaultApiKeyTpmLimit.value = m.modelSpecs[0]?.litellmParams.defaultApiKeyTpmLimit ?? null
      defaultApiKeyRpmLimit.value = m.modelSpecs[0]?.litellmParams.defaultApiKeyRpmLimit ?? null
    } else {
      name.value = ''
      gatewayId.value = ''
      organization.value = ''
      specDrafts.value = [emptySpec()]
      specAdvancedOpen.value = {}
      providerAdvancedOpen.value = false
      defaultApiKeyTpmLimit.value = null
      defaultApiKeyRpmLimit.value = null
    }
    attempt.value = false
    specTestStatus.value = {}
    specTestMessages.value = {}
    specModelLists.value = {}
    testingSpecIndex.value = null
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
const organizationValid = computed(() => organization.value.trim().length > 0)
const specValid = computed(() =>
  specDrafts.value.every(
    (s) => s.model.trim().length > 0 && effectiveProvider(s).length > 0,
  ),
)
const apiKeyValid = computed(() =>
  isEditing.value
    ? true
    : specDrafts.value.every((s) => s.apiKey.trim().length > 0),
)

const basicValid = computed(
  () => nameValid.value && gatewayValid.value && organizationValid.value,
)
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

 
function goPrev() {
  attemptBasic.value = false
  attemptSpecs.value = false
  const idx = stepIndex(currentStep.value)
  if (idx > 0) currentStep.value = STEPS[idx - 1]
}

 
function goToStep(s: StepId) {
  if (s === currentStep.value) return
  const targetIdx = STEPS.indexOf(s)
  if (targetIdx > stepIndex(currentStep.value)) return // unvisited: no-op
  attemptBasic.value = false
  attemptSpecs.value = false
  currentStep.value = s
}

function close() {
  if (!props.saving) emit('close')
}

async function testConnectionForSpec(index: number, d: SpecDraft) {
  // New mutation only needs apiBase + apiKey — it talks to the upstream
  // provider, not the row-level ProviderModel. model is the *output* of
  // the probe, not a precondition, so it does not gate the button.
  if (!d.apiBase.trim() || !d.apiKey.trim()) {
    attempt.value = true
    return
  }
  testing.value = true
  testingSpecIndex.value = index
  specTestStatus.value = { ...specTestStatus.value, [index]: null }
  // Drop the previous failure reason so a successful retry doesn't render
  // a stale message.
  const nextMessages = { ...specTestMessages.value }
  delete nextMessages[index]
  specTestMessages.value = nextMessages
  const recordFailure = (message: string) => {
    specTestStatus.value = { ...specTestStatus.value, [index]: 'failure' }
    specTestMessages.value = { ...specTestMessages.value, [index]: message }
  }
  try {
    const r = await apolloClient.mutate<
      TestPrivateModelSpecConnectionResult,
      TestPrivateModelSpecConnectionVars
    >({
      mutation: TEST_PRIVATE_MODEL_SPEC_CONNECTION,
      variables: {
        input: {
          apiBase: d.apiBase.trim(),
          apiKey: d.apiKey.trim(),
        },
      },
    })
    const data = r.data?.testPrivateModelSpecConnection
    const ok = Boolean(data?.success)
    if (ok && data && data.modelList.length > 0) {
      specTestStatus.value = { ...specTestStatus.value, [index]: 'success' }
      specModelLists.value = { ...specModelLists.value, [index]: data.modelList }
      toast.success(
        locale
          .t('supplier.model.form.testSuccess')
          .replace('{count}', String(data.modelList.length)),
      )
      return
    }
    // Failure or empty list → drop any stale list so the datalist
    // doesn't keep offering picks the user can't reach anymore.
    const next = { ...specModelLists.value }
    delete next[index]
    specModelLists.value = next
    // `data` may be missing entirely when the mutation never reached the
    // resolver (e.g. backend schema is older than the frontend and the
    // server rejected the operation at GraphQL validation time). Fall
    // back to the Apollo-level error message in that case — the earlier
    // `if (!ok && data)` branch silently swallowed it.
    const reason =
      data?.message ?? graphqlErrorMessage(r.errors, locale.t('supplier.model.form.testUnknown'))
    recordFailure(reason)
    toast.error(
      locale.t('supplier.model.form.testFailure').replace('{message}', reason),
    )
  } catch (error) {
    // Apollo rejects the mutation promise on transport / validation
    // failures (errorPolicy: 'none'). `graphqlErrorMessage` walks
    // graphQLErrors first, then the thrown message, then the fallback.
    const reason = graphqlErrorMessage(error, locale.t('supplier.model.form.testUnknown'))
    recordFailure(reason)
    const next = { ...specModelLists.value }
    delete next[index]
    specModelLists.value = next
    toast.error(locale.t('supplier.model.form.testFailure').replace('{message}', reason))
  } finally {
    testing.value = false
    testingSpecIndex.value = null
  }
}

function numOrNull(v: string): number | null {
  if (v.trim() === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

// Handler wired to the 供应商 <select>'s @change. Sets providerSelect on
// the draft and, when the new value is a known predefined provider,
// auto-fills apiBase with the default URL — still user-editable.
// PROVIDER_CUSTOM and '' leave apiBase alone (user types it / it's unset).
function onProviderChange(d: SpecDraft, ev: Event) {
  const next = (ev.target as HTMLSelectElement).value
  d.providerSelect = next
  if (next === '' || next === PROVIDER_CUSTOM) return
  if ((PROVIDER_OPTIONS as readonly string[]).includes(next)) {
    d.apiBase = PROVIDER_DEFAULT_API_BASE[next as ProviderOption]
  }
}

function onUseLimitsChange(d: SpecDraft, ev: Event) {
  const checked = (ev.target as HTMLInputElement).checked
  d.useLimits = checked
  if (!checked) {
    d.tpm = null
    d.rpm = null
    d.maxBudget = null
    d.budgetDuration = ''
  }
}

function onUseCustomPriceChange(d: SpecDraft, ev: Event) {
  const checked = (ev.target as HTMLInputElement).checked
  d.useCustomPrice = checked
  if (!checked) {
    d.inputCostPerToken = null
    d.outputCostPerToken = null
    d.cacheReadInputTokenCost = null
    d.cacheCreationInputTokenCost = null
  }
}

function draftToSpecInput(d: SpecDraft): ModelSpecInput {
  const lp: LitellmParamsInput = {
    model: d.model.trim(),
    // 把下拉控件映射回后端字段:
    //   - 空串        → null(后端视为不指定)
    //   - 已知名       → 原值
    //   - 自定义供应商 → 写回 providerCustom(原始字符串原样保留)
    customLlmProvider: effectiveProvider(d),
    apiBase: d.apiBase || null,
    // Row-level organization is broadcast to every spec on submit
    // (independent of how many specs the user adds).
    organization: organization.value.trim() || null,
    tpm: d.tpm,
    rpm: d.rpm,
    maxBudget: d.maxBudget,
    budgetDuration: d.budgetDuration || null,
    useInPassThrough: d.useInPassThrough,
    useChatCompletionsApi: d.useChatCompletionsApi,
    mergeReasoningContentInChoices: d.mergeReasoningContentInChoices,
    tags: d.tags.length > 0 ? d.tags : null,
    inputCostPerToken: d.inputCostPerToken,
    outputCostPerToken: d.outputCostPerToken,
    cacheReadInputTokenCost: d.cacheReadInputTokenCost,
    cacheCreationInputTokenCost: d.cacheCreationInputTokenCost,
  }
  // Broadcast the whole-ProviderModel default limits from the "高级参数"
  // block onto every spec's litellmParams. Available in both create and
  // edit modes: backend expects defaultApiKey{Tpm,Rpm}Limit on every spec,
  // so we copy the user-edited value to each one on submit. Null is
  // acceptable on the wire — backend treats null as "no override".
  lp.defaultApiKeyTpmLimit = defaultApiKeyTpmLimit.value
  lp.defaultApiKeyRpmLimit = defaultApiKeyRpmLimit.value
  // apiKey: create → must send; edit → only send if user typed a non-empty value (rotate).
  if (!isEditing.value || d.apiKey.trim().length > 0) {
    lp.apiKey = d.apiKey
  }
  const mi: ModelInfoInput = {
    // 把下拉控件映射回后端字段:
    //   - 空串 / null  → 不传(后端视为使用默认)
    //   - 已知名       → 原值
    //   - 自定义       → 写回 modeCustom(原始字符串原样保留)
    mode:
      d.modeSelect === MODE_CUSTOM
        ? (d.modeCustom.trim() || null)
        : d.modeSelect
          ? d.modeSelect
          : null,
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
    // Backend moved defaultApiKey{Tpm,Rpm}Limit down onto every spec's
    // litellmParams (see draftToSpecInput), so CreateProviderModelInput no
    // longer carries the row-level fields.
    emit('submit', {
      name: name.value.trim(),
      modelGateway: gatewayId.value,
      modelSpecs,
    } satisfies CreateProviderModelInput)
  }
}

function badgeClassForTestStatus(s: TestOutcome) {
  return s === 'success' ? 'success' : 'danger'
}

// ─── Review (step 3) helpers ──────────────────────────────────────────────
 
const currentGatewayName = computed(() => {
  const g = props.gateways.find((g) => g.id === gatewayId.value)
  return g?.name ?? locale.t('supplier.model.form.review.unset')
})

 
function hasLimits(d: SpecDraft): boolean {
  return Boolean(d.tpm ?? d.rpm ?? d.maxBudget ?? d.budgetDuration)
}

 
function formatLimits(d: SpecDraft): string {
  const parts: string[] = []
  if (d.tpm) parts.push(`tpm ${d.tpm}`)
  if (d.rpm) parts.push(`rpm ${d.rpm}`)
  if (d.maxBudget) parts.push(`maxBudget ${d.maxBudget}`)
  if (d.budgetDuration) parts.push(`budgetDuration ${d.budgetDuration}`)
  return parts.join(' / ')
}

 
function hasCost(d: SpecDraft): boolean {
  return Boolean(
    d.inputCostPerToken ??
      d.outputCostPerToken ??
      d.cacheReadInputTokenCost ??
      d.cacheCreationInputTokenCost,
  )
}

 
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
        {{
          locale.t(
            isEditing ? 'supplier.model.form.editTitle' : 'supplier.model.form.createTitle',
          )
        }}
      </h2>
    </cds-modal-header>

    <cds-modal-content>
      <div class="wizard-grid">
        <nav class="wizard-sidebar" aria-label="wizard steps">
          <ol class="wizard-steps">
            <li
              v-for="(s, i) in STEPS"
              :key="s"
              class="wizard-step-item"
              :class="{
                active: s === currentStep,
                visited: i < stepIndex(currentStep),
                unvisited: i > stepIndex(currentStep),
              }"
            >
              <button
                type="button"
                class="step-button"
                :disabled="i >= stepIndex(currentStep)"
                @click="i < stepIndex(currentStep) && goToStep(s)"
              >
                <span class="step-marker">
                  <cds-icon
                    v-if="i < stepIndex(currentStep)"
                    shape="check"
                    size="sm"
                  ></cds-icon>
                  <template v-else>{{ i + 1 }}</template>
                </span>
                <span class="step-label">
                  {{ locale.t(`supplier.model.form.step.${s}`) }}
                </span>
              </button>
            </li>
          </ol>
        </nav>

        <section class="wizard-main">
          <header class="wizard-main-header">
            <h2 class="step-heading">{{ locale.t(`supplier.model.form.step.${currentStep}`) }}</h2>
            <p class="step-indicator">
              {{
                locale
                  .t('supplier.model.form.stepIndicator')
                  .replace('{current}', String(stepIndex(currentStep) + 1))
                  .replace('{total}', String(STEPS.length))
                  .replace('{label}', locale.t(`supplier.model.form.step.${currentStep}`))
              }}
            </p>
          </header>

          <div class="wizard-body">
            <!-- STEP 1: BASIC (name + modelGateway)
                 Edit mode renders the three fields as a read-only key/value
                 list (matches the review step's <dl> styling) since name,
                 modelGateway, and organization are all immutable post-create.
                 Create mode keeps the editable inputs unchanged. -->
            <div v-show="currentStep === 'basic'" class="wizard-step">
              <dl v-if="isEditing" class="basic-readonly">
                <dt>{{ locale.t('supplier.model.form.name') }}</dt>
                <dd>{{ name }}</dd>
                <dt>{{ locale.t('supplier.model.form.gateway') }}</dt>
                <dd>{{ currentGatewayName }}</dd>
                <dt>{{ locale.t('supplier.model.form.organization') }}</dt>
                <dd>{{ organization || '—' }}</dd>
              </dl>

              <template v-else>
                <cds-input :status="attemptBasic && !nameValid ? 'error' : 'neutral'">
                  <label>
                    {{ locale.t('supplier.model.form.name') }}
                    <span class="required-mark" aria-hidden="true">*</span>
                  </label>
                  <input
                    :value="name"
                    minlength="2"
                    maxlength="64"
                    autocomplete="off"
                    :placeholder="locale.t('supplier.model.form.namePlaceholder')"
                    @input="name = ($event.target as HTMLInputElement).value"
                  />
                  <cds-control-message v-if="attemptBasic && !nameValid" status="error">
                    {{ locale.t('supplier.model.form.nameError') }}
                  </cds-control-message>
                  <cds-control-message v-else status="neutral">
                    {{ locale.t('supplier.model.form.nameHint') }}
                  </cds-control-message>
                </cds-input>

                <div
                  class="gateway-field"
                  :class="{ error: attemptBasic && !gatewayValid }"
                >
                  <label for="supplier-gateway-select" class="gateway-label">
                    {{ locale.t('supplier.model.form.gateway') }}
                    <span class="required-mark" aria-hidden="true">*</span>
                  </label>
                  <select
                    id="supplier-gateway-select"
                    class="gateway-select"
                    :value="gatewayId"
                    :aria-label="locale.t('supplier.model.form.gateway')"
                    @change="gatewayId = ($event.target as HTMLSelectElement).value"
                  >
                    <option value="">{{ locale.t('supplier.model.form.gatewayPlaceholder') }}</option>
                    <option v-for="g in gateways" :key="g.id" :value="g.id">{{ g.name }}</option>
                  </select>
                </div>

                <div
                  class="organization-field"
                  :class="{ error: attemptBasic && !organizationValid }"
                >
                  <label for="supplier-organization-input" class="organization-label">
                    {{ locale.t('supplier.model.form.organization') }}
                    <span class="required-mark" aria-hidden="true">*</span>
                  </label>
                  <input
                    id="supplier-organization-input"
                    class="organization-input"
                    :value="organization"
                    autocomplete="off"
                    :placeholder="locale.t('supplier.model.form.organizationPlaceholder')"
                    @input="organization = ($event.target as HTMLInputElement).value"
                  />
                  <cds-control-message
                    v-if="attemptBasic && !organizationValid"
                    status="error"
                    class="organization-message"
                  >
                    {{ locale.t('supplier.model.form.organizationError') }}
                  </cds-control-message>
                </div>
              </template>
            </div>

            <!-- STEP 2: SPECS (spec array editor + advanced + test row) -->
            <div v-show="currentStep === 'specs'" class="wizard-step">
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
                      模型 #{{ i + 1 }}
                      <template v-if="d.model">— {{ d.model }}</template>
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
                      <div class="provider-field">
                        <span class="provider-label">
                          {{ locale.t('supplier.model.form.spec.provider') }}
                          <span class="required-mark" aria-hidden="true">*</span>
                        </span>
                        <cds-select>
                          <select
                            :value="d.providerSelect"
                            :aria-label="locale.t('supplier.model.form.spec.provider')"
                            @change="onProviderChange(d, $event)"
                          >
                            <option value="">
                              {{ locale.t('supplier.model.form.spec.providerPlaceholder') }}
                            </option>
                            <option v-for="opt in PROVIDER_OPTIONS" :key="opt" :value="opt">
                              {{ locale.t(`supplier.model.form.spec.providerOption.${opt}`) }}
                            </option>
                          </select>
                        </cds-select>
                      </div>
                      <cds-input
                        v-if="d.providerSelect === PROVIDER_CUSTOM"
                        :status="attemptSpecs && !effectiveProvider(d) ? 'error' : 'neutral'"
                      >
                        <label>
                          {{ locale.t('supplier.model.form.spec.provider') }}
                          <span class="required-mark" aria-hidden="true">*</span>
                        </label>
                        <input
                          :value="d.providerCustom"
                          autocomplete="off"
                          placeholder="my_provider"
                          @input="d.providerCustom = ($event.target as HTMLInputElement).value"
                        />
                      </cds-input>
                      <cds-input>
                        <label>
                          {{ locale.t('supplier.model.form.spec.apiBase') }}
                          <span class="required-mark" aria-hidden="true">*</span>
                        </label>
                        <input
                          :value="d.apiBase"
                          autocomplete="off"
                          placeholder=""
                          @input="d.apiBase = ($event.target as HTMLInputElement).value"
                        />
                        <cds-control-message status="neutral">
                          {{
                            d.providerSelect === PROVIDER_CUSTOM
                              ? locale.t('supplier.model.form.spec.apiBaseHintCustom')
                              : locale.t('supplier.model.form.spec.apiBaseHint')
                          }}
                        </cds-control-message>
                      </cds-input>
                      <cds-input :status="!isEditing && attemptSpecs && !d.apiKey.trim() ? 'error' : 'neutral'">
                        <label>
                          {{ locale.t('supplier.model.form.spec.apiKey') }}
                          <span v-if="!isEditing" class="required-mark" aria-hidden="true">*</span>
                        </label>
                        <input
                          type="password"
                          autocomplete="off"
                          :placeholder="isEditing
                            ? locale.t('supplier.model.form.spec.apiKeyPlaceholder')
                            : locale.t('supplier.model.form.apiKeyPlaceholder')"
                          @input="d.apiKey = ($event.target as HTMLInputElement).value"
                        />
                      </cds-input>
                      <!-- per-spec test connection — placed between apiKey
                           and model so the user can probe a single deployment
                           after filling creds and before picking a model.
                           Backend currently only exposes
                           testProviderConnection(name); the per-spec payload
                           (apiBase/apiKey/model) is wired in here so swapping
                           to a spec-aware mutation later is local. -->
                      <div v-if="!isEditing" class="test-row">
                        <cds-button
                          action="outline"
                          size="sm"
                          :disabled="
                            testing ||
                            !d.apiBase.trim() ||
                            !d.apiKey.trim()
                          "
                          @click="testConnectionForSpec(i, d)"
                        >
                          <cds-icon shape="connect" size="sm"></cds-icon>
                          {{ locale.t('supplier.model.form.testConnection') }}
                        </cds-button>
                        <cds-badge
                          v-if="specTestStatus[i]"
                          :status="badgeClassForTestStatus(specTestStatus[i]!)"
                          class="test-status"
                        >
                          <template v-if="specTestStatus[i] === 'success'">
                            {{
                              locale
                                .t('supplier.model.form.testSuccess')
                                .replace('{count}', String(specModelLists[i]?.length ?? 0))
                            }}
                          </template>
                          <template v-else>
                            {{
                              locale
                                .t('supplier.model.form.testFailure')
                                .replace(
                                  '{message}',
                                  specTestMessages[i] ?? locale.t('supplier.model.form.testUnknown'),
                                )
                            }}
                          </template>
                        </cds-badge>
                      </div>
                      <cds-input :status="attemptSpecs && !d.model.trim() ? 'error' : 'neutral'">
                        <label>
                          {{ locale.t('supplier.model.form.spec.model') }}
                          <span class="required-mark" aria-hidden="true">*</span>
                        </label>
                        <input
                          :value="d.model"
                          :list="`spec-model-list-${i}`"
                          autocomplete="off"
                          :placeholder="locale.t('supplier.model.form.spec.modelSelectPlaceholder')"
                          @input="d.model = ($event.target as HTMLInputElement).value"
                        />
                        <!-- Datalist of models returned by the most recent
                             probe of THIS spec. Hidden until a successful
                             test populates specModelLists[i]. The id and
                             the input's :list attr use the same template
                             so they bind per-row. -->
                        <datalist
                          v-if="specModelLists[i] && specModelLists[i]!.length > 0"
                          :id="`spec-model-list-${i}`"
                        >
                          <option v-for="m in specModelLists[i]" :key="m" :value="m" />
                        </datalist>
                        <cds-control-message v-if="attemptSpecs && !d.model.trim()" status="error">必填</cds-control-message>
                      </cds-input>
                    </div>

                    <details
                      class="advanced-section"
                      @toggle="specAdvancedOpen[i] = ($event.target as HTMLDetailsElement).open"
                    >
                      <summary class="advanced-toggle">
                        <cds-icon
                          shape="angle"
                          :direction="specAdvancedOpen[i] ? 'down' : 'right'"
                          size="sm"
                        ></cds-icon>
                        <span>{{ locale.t('supplier.model.form.specAdvanced') }}</span>
                      </summary>
                      <div class="advanced-grid">
                        <div class="mode-field">
                          <span class="mode-label">{{ locale.t('supplier.model.form.spec.mode') }}</span>
                          <cds-select>
                            <select
                              :value="d.modeSelect"
                              :aria-label="locale.t('supplier.model.form.spec.mode')"
                              @change="d.modeSelect = ($event.target as HTMLSelectElement).value"
                            >
                              <option value="">
                                {{ locale.t('supplier.model.form.spec.modePlaceholder') }}
                              </option>
                              <option v-for="opt in MODE_OPTIONS" :key="opt" :value="opt">
                                {{ locale.t(`supplier.model.form.spec.modeOption.${opt}`) }}
                              </option>
                            </select>
                          </cds-select>
                        </div>
                      </div>
                      <!-- 模型标签:独立成单独一行,使用单行 label + underline-only
                           input 的样式,与模型模式字段保持一致的视觉节奏。 -->
                      <div class="advanced-grid">
                        <div class="tags-field">
                          <label
                            :for="`spec-tags-${i}`"
                            class="tags-label"
                          >{{ locale.t('supplier.model.form.spec.tags') }}</label>
                          <input
                            :id="`spec-tags-${i}`"
                            type="text"
                            class="tags-input"
                            autocomplete="off"
                            :value="d.tags.join(', ')"
                            placeholder="production, reasoner"
                            @input="d.tags = ($event.target as HTMLInputElement).value.split(/[,\n，]/).map((s) => s.trim()).filter(Boolean)"
                          />
                        </div>
                      </div>
                      <!-- 「自定义…」分支:仅当用户选择 MODE_CUSTOM 时显示,
                           把真正的字符串写在 modeCustom,提交时原样回传。
                           这是为了后端尚未冻结枚举之前,不破坏已保存的
                           任意字符串值。独立成单独 grid,避免在 mode + tags
                           所在的两列 grid 里把 tags 推到第二行。 -->
                      <div v-if="d.modeSelect === MODE_CUSTOM" class="advanced-grid">
                        <cds-input>
                          <label>{{ locale.t('supplier.model.form.spec.mode') }}</label>
                          <input
                            :value="d.modeCustom"
                            autocomplete="off"
                            placeholder="my_custom_mode"
                            @input="d.modeCustom = ($event.target as HTMLInputElement).value"
                          />
                        </cds-input>
                      </div>
                      <!-- 5 个 toggle + 它们各自管控的子输入块统一在末尾单列展示。
                           每个「toggle + 子输入块」是一对相邻的 grid 子项,
                           通过 `toggles-column` 的 row-gap 让所有节点纵向
                           间距一致。「设置限额」勾选后,限额四件套紧随其后
                           出现在「设置限额」toggle 下方;「自定义价格」同理。
                           margin-bottom 设为 0 避免 grid 自带的 8px 末尾空白
                           造成视觉间距不一致。 -->
                      <div class="advanced-grid toggles-column">
                        <cds-control>
                          <cds-toggle>
                            <label>{{ locale.t('supplier.model.form.limits.custom') }}</label>
                            <input
                              type="checkbox"
                              slot="input"
                              :checked="d.useLimits"
                              @change="onUseLimitsChange(d, $event)"
                            />
                          </cds-toggle>
                        </cds-control>
                        <div v-if="d.useLimits" class="toggles-subgrid toggles-subgrid--limits">
                          <cds-input>
                            <label>{{ locale.t('supplier.model.form.limits.tpm') }}</label>
                            <input
                              type="number"
                              :value="d.tpm ?? ''"
                              @input="d.tpm = numOrNull(($event.target as HTMLInputElement).value)"
                            />
                          </cds-input>
                          <cds-input>
                            <label>{{ locale.t('supplier.model.form.limits.rpm') }}</label>
                            <input
                              type="number"
                              :value="d.rpm ?? ''"
                              @input="d.rpm = numOrNull(($event.target as HTMLInputElement).value)"
                            />
                          </cds-input>
                          <cds-input>
                            <label>{{ locale.t('supplier.model.form.limits.maxBudget') }}</label>
                            <input
                              type="number"
                              step="any"
                              :value="d.maxBudget ?? ''"
                              @input="d.maxBudget = numOrNull(($event.target as HTMLInputElement).value)"
                            />
                          </cds-input>
                          <cds-input>
                            <label>{{ locale.t('supplier.model.form.limits.budgetDuration') }}</label>
                            <input
                              :value="d.budgetDuration"
                              placeholder="30d"
                              @input="d.budgetDuration = ($event.target as HTMLInputElement).value"
                            />
                          </cds-input>
                        </div>
                        <cds-control>
                          <cds-toggle>
                            <label>{{ locale.t('supplier.model.form.cost.custom') }}</label>
                            <input
                              type="checkbox"
                              slot="input"
                              :checked="d.useCustomPrice"
                              @change="onUseCustomPriceChange(d, $event)"
                            />
                          </cds-toggle>
                        </cds-control>
                        <div v-if="d.useCustomPrice" class="toggles-subgrid toggles-subgrid--price">
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

              <!-- Whole-ProviderModel default limits — available in both
                   create and edit modes. In create mode the user types
                   fresh values; in edit mode the values are pre-filled
                   from the first spec (since each spec carries its own
                   defaultApiKey{Tpm,Rpm}Limit on the wire, but the form
                   only exposes one input pair). On submit, draftToSpecInput
                   broadcasts the current value onto every spec. -->
              <details
                class="advanced-section"
                :open="false"
                @toggle="providerAdvancedOpen = ($event.target as HTMLDetailsElement).open"
              >
                <summary class="advanced-toggle">
                  <cds-icon
                    shape="angle"
                    :direction="providerAdvancedOpen ? 'down' : 'right'"
                    size="sm"
                  ></cds-icon>
                  <span>{{ locale.t('supplier.model.form.advanced') }}</span>
                </summary>
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
            </div>

            <!-- STEP 3: REVIEW (read-only summary) -->
            <div v-show="currentStep === 'review'" class="wizard-step review">
              <section class="review-section">
                <h3>{{ locale.t('supplier.model.form.review.basic') }}</h3>
                <dl>
                  <dt>{{ locale.t('supplier.model.form.review.name') }}</dt>
                  <dd>{{ name }}</dd>
                  <dt>{{ locale.t('supplier.model.form.review.gateway') }}</dt>
                  <dd>{{ currentGatewayName }}</dd>
                  <dt>{{ locale.t('supplier.model.form.review.organization') }}</dt>
                  <dd>{{ organization || locale.t('supplier.model.form.review.unset') }}</dd>
                </dl>
              </section>

              <section class="review-section">
                <h3>
                  {{ locale.t('supplier.model.form.step.specs') }}
                  ({{
                    locale.t('supplier.model.form.review.specsCount').replace('{count}', String(specDrafts.length))
                  }})
                </h3>

                <article
                  v-for="(d, i) in specDrafts"
                  :key="i"
                  class="review-spec"
                >
                  <h4>
                    {{ locale.t('supplier.model.form.review.specHeading').replace('{n}', String(i + 1)) }}
                  </h4>
                  <dl>
                    <!-- Field order mirrors the spec step's .spec-grid /
                         .advanced-section input order: 供应商 first (top
                         of .spec-grid), then API 地址, then 选择模型 at
                         the bottom of .spec-grid, then 模型标签 from
                         .advanced-section, then the two composite
                         summaries (限流 / 单价) which fold in the
                         toggle subgrids. Earlier recap put 选择模型
                         first, which mismatched the entry order the
                         user just typed and read as reordered. -->
                    <dt>{{ locale.t('supplier.model.form.review.customLlmProvider') }}</dt>
                    <dd>{{ effectiveProvider(d) || locale.t('supplier.model.form.review.unset') }}</dd>
                    <template v-if="d.apiBase">
                      <dt>{{ locale.t('supplier.model.form.review.apiBase') }}</dt>
                      <dd>{{ d.apiBase }}</dd>
                    </template>
                    <dt>{{ locale.t('supplier.model.form.review.model') }}</dt>
                    <dd>{{ d.model || locale.t('supplier.model.form.review.unset') }}</dd>
                    <template v-if="d.tags.length">
                      <dt>{{ locale.t('supplier.model.form.review.tags') }}</dt>
                      <dd>{{ d.tags.join(', ') }}</dd>
                    </template>
                    <template v-if="hasLimits(d)">
                      <dt>{{ locale.t('supplier.model.form.review.limits') }}</dt>
                      <dd>{{ formatLimits(d) }}</dd>
                    </template>
                    <template v-if="hasCost(d)">
                      <dt>{{ locale.t('supplier.model.form.review.cost') }}</dt>
                      <dd>{{ formatCost(d) }}</dd>
                    </template>
                  </dl>
                </article>
              </section>
            </div>
          </div>
        </section>
      </div>
    </cds-modal-content>

    <cds-modal-actions>
      <cds-button action="outline" :disabled="saving" @click="close">
        {{ locale.t('supplier.model.form.cancel') }}
      </cds-button>
      <cds-button
        v-if="stepIndex(currentStep) > 0"
        action="outline"
        :disabled="saving"
        @click="goPrev"
      >
        {{ locale.t('supplier.model.form.back') }}
      </cds-button>
      <cds-button
        v-if="currentStep !== 'review'"
        :disabled="saving"
        @click="goNext"
      >
        {{ locale.t('supplier.model.form.next') }}
      </cds-button>
      <cds-button
        v-else
        :loading-state="saving ? 'loading' : 'default'"
        :disabled="saving"
        @click="submit"
      >
        {{ locale.t(isEditing ? 'supplier.model.form.submitUpdate' : 'supplier.model.form.submitCreate') }}
      </cds-button>
    </cds-modal-actions>
  </cds-modal>
</template>

<style scoped>
.field-label {
  display: inline-block;
  font-size: 13px;
  font-weight: 400;
  color: var(--cds-alias-object-app-foreground, #1b1b1b);
  margin-right: 8px;
}
.field-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.field-row .field-label {
  flex-shrink: 0;
}
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
/* Core spec inputs (供应商 / apiBase / API Key / 模型) render as one
   label + one control per row — each field gets the full row width. The
   two-column helper styles (.provider-field / .mode-field) still layout
   the label inline with the control within that single row. */
.spec-grid { display: grid; gap: 12px; grid-template-columns: 1fr; }
.advanced-section { display: block; width: 100%; border: 1px solid var(--cds-alias-object-border-color, #e8e8e8); border-radius: 4px; padding: 8px 12px; box-sizing: border-box; }
/* Whole-ProviderModel defaults block sits at the bottom of the specs
   step. Push it away from the last spec block (and the drop-warning
   above) so it doesn't visually collide with the spec list — without
   this, .specs-section { gap: 8px } collapses the two into a single
   mass and the chevron header reads as part of the spec block above. */
.specs-section > .advanced-section {
  margin-top: 12px;
}
.advanced-section summary { display: block; cursor: pointer; font-weight: 500; margin-bottom: 24px; list-style: none; }
.advanced-section summary::-webkit-details-marker { display: none; }
/* 高级参数 toggle: chevron direction is driven by per-details open state
   (specAdvancedOpen[i] for per-spec rows, providerAdvancedOpen for the
   create-only ProviderModel defaults) via the cds-icon `direction` prop
   (same pattern as 模型 #1 spec-toggle above). The chevron flips between
   'right' (►, collapsed) and 'down' (▼, expanded) — Clarity handles the
   internal SVG rotation, no manual transform needed. */
.advanced-toggle {
  display: flex;
  align-items: center;
  gap: 8px;
}
.advanced-toggle > cds-icon {
  display: inline-flex;
  flex-shrink: 0;
}
.advanced-grid { display: grid; gap: 12px; grid-template-columns: 1fr 1fr; margin-bottom: 8px; }
.mode-field { display: flex; align-items: center; gap: 8px; }
.mode-field > cds-select { flex: 1; min-width: 0; }
.mode-label { font-size: 13px; font-weight: 600; color: var(--cds-alias-object-app-foreground, #1b1b1b); white-space: nowrap; flex-shrink: 0; }
/* Tags field — same inline-label + underline-only input pattern as the
   gateway/organization pickers, so it sits in the same row as 模式 when
   placed in the two-column .advanced-grid. */
.tags-field {
  display: flex;
  align-items: center;
  gap: 8px;
  /* Extra breathing room between the 模型标签 row and the next section
     (设置限额 toggle), so the tags row doesn't feel packed against the
     toggle column below. */
  margin-bottom: 6px;
}
.tags-field > .tags-input {
  flex: 1;
  min-width: 0;
}
.tags-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--cds-alias-object-app-foreground, #1b1b1b);
  white-space: nowrap;
  flex-shrink: 0;
}
.tags-input {
  font: inherit;
  font-size: 14px;
  line-height: 1.5;
  width: 100%;
  padding: 4px 2px 4px;
  border: 0;
  border-bottom: 1px solid var(--cds-alias-object-border-color, #cbd4d8);
  border-radius: 0;
  background: transparent;
  color: var(--cds-alias-object-app-foreground, #1b1b1b);
  outline: none;
  transition: border-color 0.12s ease, box-shadow 0.12s ease;
  box-sizing: border-box;
}
.tags-input:focus {
  border-bottom-color: var(--cds-status-info, #0079ad);
  box-shadow: 0 1px 0 0 var(--cds-status-info, #0079ad);
}
.provider-field { display: flex; align-items: center; gap: 1.9rem; }
.provider-field > cds-select { flex: 1; min-width: 0; }
.provider-label { font-size: 13px; color: var(--cds-alias-label-color, #565656); font-weight: 500; white-space: nowrap; flex-shrink: 0; }
.flags-grid { grid-template-columns: 1fr 1fr; }
/* All toggles in a single column with a uniform vertical gap between
   rows. The grid's own margin-bottom is zeroed so the bottom edge of
   the last toggle doesn't get the extra 8px the other .advanced-grid
   blocks carry — keeping the toggle column flush with the section
   above. */
.toggles-column {
  grid-template-columns: 1fr;
  margin-bottom: 0;
  /* Increase horizontal spacing between columns (single column here, so
     this is mostly a no-op visually, but kept for consistency with the
     other two-column .advanced-grid blocks). No row-gap — toggles
     stack with no vertical breathing room between them. */
  column-gap: 1.2rem;
  /* Keep each cds-control flush-left on the grid's leading edge instead
     of stretching to fill the column width. */
  justify-items: start;
}
.toggles-column > cds-control {
  width: max-content;
  max-width: 100%;
  margin-left: -1.2rem;
}
/* Sub-grid that holds the four limit / price inputs right under their
   controlling toggle. Lives as a single grid item inside .toggles-column
   — two columns by default, same rhythm as the other .advanced-grid
   blocks in the section. No bottom margin so the next toggle (or the
   column's bottom edge) sits at a consistent gap. */
.toggles-subgrid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  margin-bottom: 0;
}
/* Extra breathing room above each subgrid so the first row of inputs
   doesn't sit flush against its controlling toggle — gives the
   section a clearer heading→content rhythm. */
.toggles-subgrid--price { margin-top: 12px; }
.toggles-subgrid--limits { margin-top: 12px; }
.test-row { display: flex; align-items: center; gap: 10px; }
.test-status { text-transform: capitalize; }
.drop-warning { margin-top: 8px; }
.wizard-step {
  display: grid;
  gap: 16px;
}
.wizard-step.review {
  gap: 20px;
}
.review-section h3 {
  margin: 0 0 8px;
  font-size: 14px;
  font-weight: 600;
}
.review-section dl {
  display: grid;
  grid-template-columns: max-content 1fr;
  gap: 4px 16px;
  margin: 0;
  /* Center the <dd> value text vertically against the <dt> label cell.
     Without this the grid row uses default align-items: stretch and
     dd's inline box sits baseline-shifted against the dt's inline box,
     leaving the value visibly higher than the label on the user's
     screenshot ("asd" floats above the row center). align-items: center
     alone fixes it, but multi-line dd values (rare on review but
     possible for tags) still read baseline-locked — flex makes wrap
     align cleanly too. */
  align-items: center;
}
.review-section dt {
  color: var(--cds-alias-typography-color-300, #565656);
  font-size: 13px;
  font-weight: 600;
}
.review-section dd {
  margin: 0;
  font-size: 13px;
  display: flex;
  align-items: center;
}
/* Edit-mode basic step — three row-level fields (name / modelGateway /
   organization) become immutable post-create, so we render them as a
   read-only key/value list instead of disabled inputs. Reuses the same
   grid + alignment rules as .review-section dl so the user sees the
   same visual treatment twice (step 1 in edit mode, step 3 in any
   mode) and recognises them as "summary" displays. */
.basic-readonly {
  display: grid;
  grid-template-columns: max-content 1fr;
  gap: 12px 16px;
  margin: 0;
  align-items: center;
}
.basic-readonly dt {
  color: var(--cds-alias-typography-color-300, #565656);
  font-size: 13px;
  font-weight: 600;
}
/* Mark for backend-required fields. Same CSS contract as
   ModelGatewayFormModal.vue / UserFormDialog.vue: crimson color,
   ~0.7em, floats above the cap-line via negative top margin so the
   asterisk sits in superscript position next to the label text. */
.required-mark {
  color: var(--cds-alias-status-danger, #c21d00);
  font-size: 0.7em;
  font-weight: 700;
  line-height: 1;
  margin: -0.5em 0 0 1px;
  display: inline-block;
}

.basic-readonly dd {
  margin: 0;
  font-size: 13px;
  display: flex;
  align-items: center;
}
.review-spec {
  border: 1px solid var(--cds-alias-object-border-color, #e8e8e8);
  border-radius: 4px;
  padding: 12px;
  margin-top: 8px;
}
.review-spec h4 {
  margin: 0 0 8px;
  font-size: 13px;
  font-weight: 600;
}
.review-spec dl {
  display: grid;
  grid-template-columns: max-content 1fr;
  gap: 4px 16px;
  margin: 0;
  /* Same fix as .review-section dl — center the value text against the
     label cell so the spec rows read as a clean two-column list. */
  align-items: center;
}
.review-spec dt {
  color: var(--cds-alias-typography-color-300, #565656);
  font-size: 12px;
  font-weight: 600;
}
.review-spec dd {
  margin: 0;
  font-size: 12px;
  display: flex;
  align-items: center;
}
.wizard-grid {
  display: grid;
  grid-template-columns: 220px 1fr;
  /* Pin the wizard to the modal's scrollable inner height (cds-modal sets
     --max-height: 70vh on .modal-body, which is the only scroll context
     we get). Matching the wizard to that exact height guarantees two
     things at once:
       1. The cds-modal-body never engages its own scrollbar, because the
          wizard exactly fills the available vertical space — no extra
          scroll source competing with the wizard's internal one.
       2. The sidebar sits at a fixed 100% of this height and is therefore
          geometrically incapable of moving when the user scrolls the
          right-hand .wizard-body — earlier sticky-based attempts still
          drifted a few pixels because the modal's own scroll context
          kept nudging the sidebar along with the body content. */
  height: min(70vh, 640px);
  /* The slotted children of <cds-modal-content> sit inside the component's
     shadow root flex column with `align-items: flex-start`, so they don't
     stretch horizontally by default. Without an explicit width the wizard
     would only take the width of its widest child — meaning a collapsed
     spec (which only shows the narrow toggle button) shrinks the entire
     wizard, mismatching the width of the modal around it. Forcing 100%
     here keeps the wizard the same width whether specs are expanded or
     collapsed, matching the modal's content area. */
  width: 100%;
}
.wizard-sidebar {
  background: var(--cds-alias-object-app-background, #f4f4f4);
  box-shadow: inset -1px 0 0 var(--cds-alias-object-border-color, #e8e8e8);
  padding: 24px 0 16px;
  display: flex;
  flex-direction: column;
  /* Fill the full grid height (matches .modal-body's content area). The
     grid uses `min(70vh, 640px)` so the sidebar is geometrically pinned
     to that height and can't move when only the right column scrolls.
     overflow-y: auto is a defensive fallback for very small viewports
     where the three step buttons plus their padding don't fit. */
  height: 100%;
  overflow-y: auto;
}
.wizard-steps {
  list-style: none;
  margin: 0;
  padding: 0;
}
.wizard-step-item {
  margin: 0;
}
.step-button {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 10px 16px;
  border: 0;
  background: transparent;
  color: var(--cds-alias-typography-color-300, #565656);
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.step-button:disabled {
  cursor: default;
}
.step-marker {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  font-size: 12px;
  font-weight: 600;
  background: transparent;
  border: 1px solid currentColor;
  flex-shrink: 0;
}
.wizard-step-item.active .step-button {
  color: #fff;
  background: var(--cds-alias-object-app-blue, #0072a3);
}
.wizard-step-item.active .step-marker {
  background: rgba(255, 255, 255, 0.2);
  border-color: rgba(255, 255, 255, 0.4);
}
.wizard-step-item.visited .step-button {
  color: var(--cds-alias-typography-color-300, #565656);
}
.wizard-step-item.visited .step-marker {
  background: var(--cds-alias-object-app-blue, #0072a3);
  color: #fff;
  border-color: var(--cds-alias-object-app-blue, #0072a3);
}
.step-label {
  font-size: 14px;
}
.wizard-main {
  display: flex;
  flex-direction: column;
  min-width: 0;
  /* Fill the grid row so .wizard-body below can claim the remaining
     vertical space for its own scroll context. min-height: 0 releases
     the implicit flex item "min-height: auto" so the body can shrink
     below its content size when the grid height is fixed. */
  height: 100%;
  min-height: 0;
}
.wizard-main-header {
  padding: 20px 24px 12px;
}
.wizard-main-header h2 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
}
.wizard-main-header h2.step-heading {
  font-size: 20px;
  color: var(--cds-alias-object-app-foreground, #1b1b1b);
}
.step-indicator {
  margin: 6px 0 0;
  font-size: 12px;
  color: var(--cds-alias-typography-color-300, #565656);
}
.wizard-body {
  padding: 16px 24px 24px;
  /* Independent scroll context for the right-hand content column. The
     cds-modal sets --max-height: 70vh on .modal-body; we pin .wizard-grid
     to exactly that height so the modal-body never engages its own
     scrollbar. Once the modal-body stops scrolling, the sidebar (which
     fills 100% of the grid row) sits at a fixed visual position, and
     only this column moves when the user scrolls. */
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
}

/* Gateway picker — label inline + underline-only select. The label sits
   on the same row as the select (same pattern as the model-name field
   above), and the select itself keeps only a bottom border to read as a
   flat text field, regaining a focus ring on focus. */
.gateway-field {
  display: grid;
  grid-template-columns: auto 1fr;
  align-items: center;
  gap: 1.2rem;
}
.gateway-field .gateway-hint {
  grid-column: 1 / -1;
}
.gateway-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--cds-alias-object-app-foreground, #1b1b1b);
  cursor: pointer;
  white-space: nowrap;
}
.gateway-select {
  font: inherit;
  font-size: 14px;
  width: 100%;
  min-height: 32px;
  padding: 4px 24px 4px 2px;
  border: 0;
  border-bottom: 1px solid var(--cds-alias-object-border-color, #cbd4d8);
  border-radius: 0;
  background: transparent;
  color: var(--cds-alias-object-app-foreground, #1b1b1b);
  outline: none;
  appearance: none;
  -webkit-appearance: none;
  -moz-appearance: none;
  cursor: pointer;
  background-image: linear-gradient(45deg, transparent 50%, currentColor 50%),
    linear-gradient(135deg, currentColor 50%, transparent 50%);
  background-position:
    calc(100% - 12px) 14px,
    calc(100% - 7px) 14px;
  background-size: 5px 5px, 5px 5px;
  background-repeat: no-repeat;
  transition: border-color 0.12s ease, box-shadow 0.12s ease;
  box-sizing: border-box;
}
.gateway-select:focus {
  border-bottom-color: var(--cds-alias-status-info, #0079ad);
  box-shadow: 0 1px 0 0 var(--cds-alias-status-info, #0079ad);
}
.gateway-select:disabled {
  cursor: not-allowed;
  opacity: 0.65;
}
.gateway-field.error .gateway-select {
  border-bottom-color: var(--cds-alias-status-danger, #c92100);
  box-shadow: 0 1px 0 0 var(--cds-alias-status-danger, #c92100);
}
.gateway-hint {
  margin: 2px 0 0;
  font-size: 12px;
  color: var(--cds-alias-typography-color-300, #565656);
}

/* Organization picker — same inline-label + underline-only input pattern
   as the gateway picker above, so 「所属组织」 and 「模型网关」 read as
   siblings on the basic-info step. Label is 13px / 600 to match the
   gateway label. */
.organization-field {
  display: grid;
  grid-template-columns: auto 1fr;
  align-items: center;
  gap: 1.2rem;
}
.organization-field .organization-message {
  grid-column: 1 / -1;
}
.organization-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--cds-alias-object-app-foreground, #1b1b1b);
  cursor: pointer;
  white-space: nowrap;
}
.organization-input {
  font: inherit;
  font-size: 14px;
  width: 100%;
  min-height: 32px;
  padding: 4px 2px;
  border: 0;
  border-bottom: 1px solid var(--cds-alias-object-border-color, #cbd4d8);
  border-radius: 0;
  background: transparent;
  color: var(--cds-alias-object-app-foreground, #1b1b1b);
  outline: none;
  appearance: none;
  -webkit-appearance: none;
  -moz-appearance: none;
  transition: border-color 0.12s ease, box-shadow 0.12s ease;
  box-sizing: border-box;
}
.organization-input:focus {
  border-bottom-color: var(--cds-alias-status-info, #0079ad);
  box-shadow: 0 1px 0 0 var(--cds-alias-status-info, #0079ad);
}
.organization-input:disabled {
  cursor: not-allowed;
  opacity: 0.65;
}
.organization-field.error .organization-input {
  border-bottom-color: var(--cds-alias-status-danger, #c92100);
  box-shadow: 0 1px 0 0 var(--cds-alias-status-danger, #c92100);
}
</style>