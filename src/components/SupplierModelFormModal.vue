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
import type { BudgetDurationUnit } from '@/components/VirtualKeyFormModal.vue'

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
  // 预算周期:与 VirtualKeyFormModal 的「有效时长 / 预算周期」一致,
  // 拆成 number + unit 两个字段,UI 用 number input + unit select。
  // submit() 时由 formatBudgetDuration 重新拼成 "<n><unit>" 字符串,
  // 这是 LiteLLM 端 resolver 期望的格式。空 / 0 视为未设置。
  budgetDurationValue: number | null
  budgetDurationUnit: BudgetDurationUnit
  useInPassThrough: boolean
  useChatCompletionsApi: boolean
  mergeReasoningContentInChoices: boolean
  // 模型标签的 UI 状态:自由文本,逗号 / 换行 / 中文逗号 都视作分隔符。
  // 用自由文本而非即时 split 是为了避免每次按键都触发 round-trip:
  // 用户输入半形逗号时,如果立即 split + filter + rejoin,空串会被过滤
  // 掉,刚打进去的逗号就被"吞"了,光标也会跳。延迟到 submit 时再解析,
  // 与 VirtualKeyFormModal.vue 的 tagsText 行为一致。
  tagsText: string
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
    budgetDurationValue: null,
    budgetDurationUnit: 'mo',
    useInPassThrough: false,
    useChatCompletionsApi: true,
    mergeReasoningContentInChoices: false,
    tagsText: '',
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

// Resolve the *effective* mode string from the two-field state. Mirrors
// effectiveProvider — MODE_CUSTOM sentinel means the user picked the
// "custom…" branch and the real value lives in d.modeCustom.
function effectiveMode(d: SpecDraft): string {
  return d.modeSelect === MODE_CUSTOM ? d.modeCustom.trim() : d.modeSelect
}

// 把 tagsText 解析成提交用的 string[]。空文本 / 全空 token 都返回 null,
// 让后端保持「不指定」的语义。分隔符支持半形逗号、换行、中文全角逗号,
// 与 VirtualKeyFormModal.vue 保持一致。
function parseTags(text: string): string[] | null {
  const tokens = text
    .split(/[,\n，]/)
    .map((s) => s.trim())
    .filter(Boolean)
  return tokens.length > 0 ? tokens : null
}

// ─── budgetDuration (wire: "<n><unit>" 字符串) ↔ UI (number + unit) ───
// LiteLLM resolver 期望的 wire 格式,例如 "30d" / "1mo" / "12h"。
// UI 与 VirtualKeyFormModal 的预算周期控件一致:数字 + 单位下拉。
// 单位集合来自 BudgetDurationUnit,与 VirtualKeyFormModal 同步,
// 避免 supplier / virtual-key 两边「单位语义不一致」。
const BUDGET_DURATION_UNITS: readonly BudgetDurationUnit[] = ['s', 'm', 'h', 'd', 'mo']

// 默认单位:月(mo),与 VirtualKeyFormModal 一致 —— 大多数预算周期都是
// 「自然月」reset 窗口。
const DEFAULT_BUDGET_DURATION_UNIT: BudgetDurationUnit = 'mo'

// wire 字符串 → UI 的 number + unit。解析失败回退到 null + 'mo',
// 与空字符串的展示保持一致,避免脏数据把表单卡死。
function parseBudgetDuration(wire: string | null): {
  budgetDurationValue: number | null
  budgetDurationUnit: BudgetDurationUnit
} {
  if (!wire) return { budgetDurationValue: null, budgetDurationUnit: DEFAULT_BUDGET_DURATION_UNIT }
  // 末段识别单位 —— 优先匹配两位字母 'mo',再退回到单位表里的任意 1 字母。
  // 用 longest-match-first 避免 '1mo' 被错切成 number='1m' / unit='o'。
  const m = wire.match(/^(-?\d+(?:\.\d+)?)(s|m|h|d|mo)?$/)
  if (!m) return { budgetDurationValue: null, budgetDurationUnit: DEFAULT_BUDGET_DURATION_UNIT }
  const value = Number(m[1])
  const unit = (m[2] as BudgetDurationUnit | undefined) ?? DEFAULT_BUDGET_DURATION_UNIT
  return { budgetDurationValue: value, budgetDurationUnit: unit }
}

// UI 的 number + unit → wire 字符串。空 / 0 / 负数都返回 null,
// 让后端保持「不指定」的语义,与 tpm / rpm / maxBudget 一致。
function formatBudgetDuration(
  value: number | null,
  unit: BudgetDurationUnit,
): string | null {
  if (value == null || value <= 0) return null
  return `${value}${unit}`
}

// unit → i18n key 后缀。复用 VirtualKeyFormModal 已有的 locale 词条
// (virtualKey.form.budgetDurationUnitSecond / Minute / Hour / Day / Month),
// 避免重复维护。
//   's'  → 'Second'   (秒)
//   'm'  → 'Minute'   (分钟)
//   'h'  → 'Hour'     (小时)
//   'd'  → 'Day'      (天)
//   'mo' → 'Month'    (月 —— 自然月 reset 窗口)
function unitLabelSuffix(unit: BudgetDurationUnit): string {
  switch (unit) {
    case 's':  return 'Second'
    case 'm':  return 'Minute'
    case 'h':  return 'Hour'
    case 'd':  return 'Day'
    case 'mo': return 'Month'
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
          // budgetDuration 在 wire 上是 "<n><unit>" 字符串(例如 "30d",
          // "1mo")。回填时拆成 number + unit,UI 用两个独立控件编辑,
          // submit() 再由 formatBudgetDuration 拼回去。
          ...parseBudgetDuration(s.litellmParams.budgetDuration ?? null),
          useInPassThrough: s.litellmParams.useInPassThrough,
          useChatCompletionsApi: s.litellmParams.useChatCompletionsApi,
          mergeReasoningContentInChoices: s.litellmParams.mergeReasoningContentInChoices,
          // 模型标签:回填到 tagsText(逗号 + 空格分隔,符合占位符风格),
          // 真正的 string[] 在 submit 时再由 parseTags 解析。
          tagsText: s.litellmParams.tags.join(', '),
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
    d.budgetDurationValue = null
    // 单位保留默认值 'mo',关闭开关并不清单位 —— 下次开开关时直接沿用。
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
    budgetDuration: formatBudgetDuration(d.budgetDurationValue, d.budgetDurationUnit),
    useInPassThrough: d.useInPassThrough,
    useChatCompletionsApi: d.useChatCompletionsApi,
    mergeReasoningContentInChoices: d.mergeReasoningContentInChoices,
    tags: parseTags(d.tagsText),
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
  return Boolean(d.tpm ?? d.rpm ?? d.maxBudget ?? d.budgetDurationValue)
}

 
function formatLimits(d: SpecDraft): string {
  const parts: string[] = []
  if (d.tpm) parts.push(`tpm ${d.tpm}`)
  if (d.rpm) parts.push(`rpm ${d.rpm}`)
  if (d.maxBudget) parts.push(`maxBudget ${d.maxBudget}`)
  // budgetDuration:review 时也是 "<n><unit>",与提交时的 wire 格式一致。
  const budgetDuration = formatBudgetDuration(d.budgetDurationValue, d.budgetDurationUnit)
  if (budgetDuration) parts.push(`budgetDuration ${budgetDuration}`)
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
                <dt>{{ locale.t('supplier.model.form.organization') }}</dt>
                <dd>{{ organization || '—' }}</dd>
                <dt>{{ locale.t('supplier.model.form.gateway') }}</dt>
                <dd>{{ currentGatewayName }}</dd>
              </dl>

              <template v-else>
                <cds-input :status="attemptBasic && !nameValid ? 'error' : 'neutral'">
                  <label>
                    {{ locale.t('supplier.model.form.name') }}
                    <sup class="required-mark" aria-hidden="true">*</sup>
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
                  class="organization-field"
                  :class="{ error: attemptBasic && !organizationValid }"
                >
                  <label for="supplier-organization-input" class="organization-label">
                    {{ locale.t('supplier.model.form.organization') }}
                    <sup class="required-mark" aria-hidden="true">*</sup>
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

                <div
                  class="gateway-field"
                  :class="{ error: attemptBasic && !gatewayValid }"
                >
                  <label for="supplier-gateway-select" class="gateway-label">
                    {{ locale.t('supplier.model.form.gateway') }}
                    <sup class="required-mark" aria-hidden="true">*</sup>
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
                      {{ locale.t('supplier.model.form.spec.heading').replace('{n}', String(i + 1)) }}
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
                          <sup class="required-mark" aria-hidden="true">*</sup>
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
                          <sup class="required-mark" aria-hidden="true">*</sup>
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
                          <sup class="required-mark" aria-hidden="true">*</sup>
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
                          <sup v-if="!isEditing" class="required-mark" aria-hidden="true">*</sup>
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
                          <sup class="required-mark" aria-hidden="true">*</sup>
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
                        <cds-control-message v-if="attemptSpecs && !d.model.trim()" status="error">{{ locale.t('supplier.model.form.spec.requiredHint') }}</cds-control-message>
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
                            v-model="d.tagsText"
                            placeholder="production, reasoner"
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
                          <!-- 设置限额下的 7 个数字输入框 (TPM / RPM / 最大预算 /
                               预算周期 / 输入 / 输出 / 缓存读 / 缓存写 —— 预算周期
                               因为带单位下拉所以保留原 .duration-row,其余 6 个用
                               .duration-row--no-unit) 全部用原生 label + native
                               input,绕开 cds-input web component 自带的
                               `layout="horizontal"` 行为 (label + input 在一行,
                               input 宽度被 input-message-container 限制为
                               `cds-global-layout-space-xxxl * 3` ≈ 192px)。
                               .duration-row + .duration-value/.duration-label
                               与「有效时长」「预算周期」同源,已经验证在 1fr
                               grid 内撑满父级。 -->
                          <div class="duration-field">
                            <div class="duration-row duration-row--no-unit">
                              <label class="duration-label" :for="`spec-tpm-${i}`">
                                {{ locale.t('supplier.model.form.limits.tpm') }}
                              </label>
                              <input
                                :id="`spec-tpm-${i}`"
                                class="duration-value"
                                type="number"
                                min="0"
                                step="1000"
                                :value="d.tpm ?? ''"
                                @input="d.tpm = numOrNull(($event.target as HTMLInputElement).value)"
                              />
                            </div>
                          </div>
                          <div class="duration-field">
                            <div class="duration-row duration-row--no-unit">
                              <label class="duration-label" :for="`spec-rpm-${i}`">
                                {{ locale.t('supplier.model.form.limits.rpm') }}
                              </label>
                              <input
                                :id="`spec-rpm-${i}`"
                                class="duration-value"
                                type="number"
                                min="0"
                                step="100"
                                :value="d.rpm ?? ''"
                                @input="d.rpm = numOrNull(($event.target as HTMLInputElement).value)"
                              />
                            </div>
                          </div>
                          <div class="duration-field">
                            <div class="duration-row duration-row--no-unit">
                              <label class="duration-label" :for="`spec-maxBudget-${i}`">
                                {{ locale.t('supplier.model.form.limits.maxBudget') }}
                              </label>
                              <input
                                :id="`spec-maxBudget-${i}`"
                                class="duration-value"
                                type="number"
                                min="0"
                                step="any"
                                :value="d.maxBudget ?? ''"
                                @input="d.maxBudget = numOrNull(($event.target as HTMLInputElement).value)"
                              />
                            </div>
                          </div>
                          <!-- 预算周期:与 VirtualKeyFormModal 一致的「数字 + 单位」
                               双控件布局。cds-input 的 shadow DOM 只投影一个
                               form control,这里用原生 label + input + select
                               替代,复用 .duration-* 样式保持视觉一致。
                               submit() 时由 formatBudgetDuration 拼成
                               "<n><unit>" 字符串提交。 -->
                          <div class="duration-field">
                            <div class="duration-row">
                              <label class="duration-label" :for="`spec-budgetDuration-${i}`">
                                {{ locale.t('supplier.model.form.limits.budgetDuration') }}
                              </label>
                              <input
                                :id="`spec-budgetDuration-${i}`"
                                class="duration-value"
                                type="number"
                                min="0"
                                step="1"
                                :value="d.budgetDurationValue ?? ''"
                                @input="
                                  d.budgetDurationValue =
                                    ($event.target as HTMLInputElement).value === ''
                                      ? null
                                      : Number(($event.target as HTMLInputElement).value)
                                "
                              />
                              <select
                                class="duration-unit"
                                :value="d.budgetDurationUnit"
                                :aria-label="locale.t('virtualKey.form.budgetDurationUnit')"
                                @change="
                                  d.budgetDurationUnit = ($event.target as HTMLSelectElement)
                                    .value as BudgetDurationUnit
                                "
                              >
                                <option v-for="u in BUDGET_DURATION_UNITS" :key="u" :value="u">
                                  {{ locale.t(`virtualKey.form.budgetDurationUnit${unitLabelSuffix(u)}`) }}
                                </option>
                              </select>
                            </div>
                          </div>
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
                          <div class="duration-field">
                            <div class="duration-row duration-row--no-unit">
                              <label class="duration-label" :for="`spec-inputPrice-${i}`">
                                {{ locale.t('supplier.model.form.cost.input') }}
                              </label>
                              <input
                                :id="`spec-inputPrice-${i}`"
                                class="duration-value"
                                type="number"
                                min="0"
                                step="any"
                                :value="d.inputCostPerToken ?? ''"
                                @input="d.inputCostPerToken = numOrNull(($event.target as HTMLInputElement).value)"
                              />
                            </div>
                          </div>
                          <div class="duration-field">
                            <div class="duration-row duration-row--no-unit">
                              <label class="duration-label" :for="`spec-outputPrice-${i}`">
                                {{ locale.t('supplier.model.form.cost.output') }}
                              </label>
                              <input
                                :id="`spec-outputPrice-${i}`"
                                class="duration-value"
                                type="number"
                                min="0"
                                step="any"
                                :value="d.outputCostPerToken ?? ''"
                                @input="d.outputCostPerToken = numOrNull(($event.target as HTMLInputElement).value)"
                              />
                            </div>
                          </div>
                          <div class="duration-field">
                            <div class="duration-row duration-row--no-unit">
                              <label class="duration-label" :for="`spec-cacheRead-${i}`">
                                {{ locale.t('supplier.model.form.cost.cacheRead') }}
                              </label>
                              <input
                                :id="`spec-cacheRead-${i}`"
                                class="duration-value"
                                type="number"
                                min="0"
                                step="any"
                                :value="d.cacheReadInputTokenCost ?? ''"
                                @input="d.cacheReadInputTokenCost = numOrNull(($event.target as HTMLInputElement).value)"
                              />
                            </div>
                          </div>
                          <div class="duration-field">
                            <div class="duration-row duration-row--no-unit">
                              <label class="duration-label" :for="`spec-cacheWrite-${i}`">
                                {{ locale.t('supplier.model.form.cost.cacheWrite') }}
                              </label>
                              <input
                                :id="`spec-cacheWrite-${i}`"
                                class="duration-value"
                                type="number"
                                min="0"
                                step="any"
                                :value="d.cacheCreationInputTokenCost ?? ''"
                                @input="d.cacheCreationInputTokenCost = numOrNull(($event.target as HTMLInputElement).value)"
                              />
                            </div>
                          </div>
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
                  <dt>{{ locale.t('supplier.model.form.review.organization') }}</dt>
                  <dd>{{ organization || locale.t('supplier.model.form.review.unset') }}</dd>
                  <dt>{{ locale.t('supplier.model.form.review.gateway') }}</dt>
                  <dd>{{ currentGatewayName }}</dd>
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
                         of .spec-grid), then API 地址, then API Key, then
                         选择模型 at the bottom of .spec-grid, then 模型模式
                         and 模型标签 from .advanced-section, then the two
                         composite summaries (限流 / 单价) which fold in
                         the toggle subgrids, then the three standalone
                         toggles (透传 / chat completions / 合并 reasoning).
                         API Key is shown as a status string only, never
                         the literal secret. -->
                    <dt>{{ locale.t('supplier.model.form.review.customLlmProvider') }}</dt>
                    <dd>{{ effectiveProvider(d) || locale.t('supplier.model.form.review.unset') }}</dd>
                    <template v-if="d.apiBase">
                      <dt>{{ locale.t('supplier.model.form.review.apiBase') }}</dt>
                      <dd>{{ d.apiBase }}</dd>
                    </template>
                    <dt>{{ locale.t('supplier.model.form.review.apiKey') }}</dt>
                    <dd>
                      {{
                        isEditing
                          ? (d.apiKey.trim()
                              ? locale.t('supplier.model.form.review.apiKeyRotate')
                              : locale.t('supplier.model.form.review.apiKeyKeep'))
                          : locale.t('supplier.model.form.review.apiKeySet')
                      }}
                    </dd>
                    <dt>{{ locale.t('supplier.model.form.review.model') }}</dt>
                    <dd>{{ d.model || locale.t('supplier.model.form.review.unset') }}</dd>
                    <template v-if="effectiveMode(d)">
                      <dt>{{ locale.t('supplier.model.form.review.mode') }}</dt>
                      <dd>{{ effectiveMode(d) }}</dd>
                    </template>
                    <template v-if="parseTags(d.tagsText)">
                      <dt>{{ locale.t('supplier.model.form.review.tags') }}</dt>
                      <dd>{{ parseTags(d.tagsText)?.join(', ') }}</dd>
                    </template>
                    <template v-if="hasLimits(d)">
                      <dt>{{ locale.t('supplier.model.form.review.limits') }}</dt>
                      <dd>{{ formatLimits(d) }}</dd>
                    </template>
                    <template v-if="hasCost(d)">
                      <dt>{{ locale.t('supplier.model.form.review.cost') }}</dt>
                      <dd>{{ formatCost(d) }}</dd>
                    </template>
                    <dt>{{ locale.t('supplier.model.form.flag.useInPassThrough') }}</dt>
                    <dd>{{ d.useInPassThrough ? locale.t('supplier.model.form.review.toggleOn') : locale.t('supplier.model.form.review.toggleOff') }}</dd>
                    <dt>{{ locale.t('supplier.model.form.flag.useChatCompletionsApi') }}</dt>
                    <dd>{{ d.useChatCompletionsApi ? locale.t('supplier.model.form.review.toggleOn') : locale.t('supplier.model.form.review.toggleOff') }}</dd>
                    <dt>{{ locale.t('supplier.model.form.flag.mergeReasoningContentInChoices') }}</dt>
                    <dd>{{ d.mergeReasoningContentInChoices ? locale.t('supplier.model.form.review.toggleOn') : locale.t('supplier.model.form.review.toggleOff') }}</dd>
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
/* 单列布局:每个 label+input 字段独占一行,占满整行宽度。
   原 1fr 1fr 两列布局会让单字段(如 模型模式 / 模型标签 / modeCustom)只
   占第一列 ≈50% 宽度,视觉上字段过窄、显空;改成 1fr 后所有
   .advanced-grid 块内部的字段都全宽显示,label+input 在同一行、上下
   字段纵向堆叠,与 设置限额 / 自定义价格 子网格的策略一致。 */
.advanced-grid { display: grid; gap: 12px; grid-template-columns: 1fr; margin-bottom: 8px; }
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
  /* 单列 grid,但用 `minmax(0, 1fr)` 而非 `1fr` —— 后者在 grid 1fr
     column 内 sibling 子项的 max-content 会撑开 column (cds-control
     包 toggle 的实际 content width 是 216px,会让 1fr track 缩到
     ~216,即 .toggles-subgrid width 不超过 sibling 宽度 → 7 个
     new input 右端距 modal 内边距留 ~150px 空白)。`minmax(0, 1fr)`
     允许 column 收缩到 0,grid track 撑满父级 (advanced-section
     padding 内的 content width = ~356px) 而非按 max-content 算。
     这样 .toggles-subgrid (.toggles-column 的直接子节点) 占满整列,
     内层 .duration-value 100% 才能撑到列右端。
     cds-control 自身仍然用 `width: max-content` + `max-width: 100%`
     单独收缩 (见下一条 rule),不让其被 grid stretch 拉宽。 */
  grid-template-columns: minmax(0, 1fr);
  margin-bottom: 0;
  column-gap: 1.2rem;
}
.toggles-column > cds-control {
  width: max-content;
  max-width: 100%;
  margin-left: -1.2rem;
}
/* Sub-grid that holds the four limit / price inputs right under their
   controlling toggle. Lives as a single grid item inside .toggles-column
   — 单列布局,每个 label+input 字段独占一行,占满整行宽度。
   原 grid-template-columns: 1fr 1fr 让四个字段呈 2×2 排列,label+input
   共同占一行约一半的宽度,字段显得过窄且阅读节奏不佳;改成 1fr 后
   四个字段纵向堆叠,label+input 各占一行,视觉上更宽松、输入控件也更
   易点击。与 用户在 #supplierModelForm 提的需求一致:「设置限额 /
   自定义价格」的四个参数全部各占一行显示。 */
.toggles-subgrid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 12px;
  margin-bottom: 0;
  /* 显式 width: 100% 让 grid 1fr column 占满父级(advanced-section
     padding 内部全宽),子元素 .duration-value 再 100% 撑到列右端。
     `!important` 强制覆盖任何 grid 子项收缩行为(比如父级
     .toggles-column 是 grid 1fr 时,在某些浏览器下子项默认
     min-content 而非 stretch,会让 grid track 收缩到内容宽度,
     即使 grid-template-columns 是 1fr 也会留白)。
     box-sizing: border-box 防止任何 padding 撑破父级宽度。 */
  width: 100% !important;
  box-sizing: border-box;
}
/* Extra breathing room above each subgrid so the first row of inputs
   doesn't sit flush against its controlling toggle — gives the
   section a clearer heading→content rhythm. */
.toggles-subgrid--price { margin-top: 12px; }
.toggles-subgrid--limits { margin-top: 12px; }
.test-row { display: flex; align-items: center; gap: 10px; }
.test-status { text-transform: capitalize; }
.drop-warning { margin-top: 8px; }
/* duration-* — 数字 + 单位 选择器布局,与 VirtualKeyFormModal 一致。
   当前用于 Spec 草稿里的 budgetDuration 字段。每个表单里独立维护一份,
   因为 .duration-* 在源组件是 scoped,不会跨组件泄漏。 */
.duration-field {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  column-gap: 1.2rem;
  row-gap: 6px;
}
.duration-row {
  grid-column: 1 / -1;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 1.2rem;
}
/* Variant used when a row has no <select> unit — collapses the third
   column (auto) so the value input takes the full remaining width
   instead of leaving a phantom empty cell on the right. Keeps the
   baseline consistent with the sibling .duration-row that DOES have a
   <select>, so all rows inside .toggles-subgrid share the same label /
   input vertical alignment. (与 VirtualKeyFormModal 同步定义;
   SupplierModal 之前只用了带 select 的 budgetDuration 字段,7 个
   new input 改造后必须显式定义 --no-unit variant,否则会 fallback
   到 .duration-row 的 3 列 auto 布局,第三列空 auto 列仍占 grid
   track 推挤 input 列 —— 实测会让 1fr input 列短几 px。) */
.duration-row--no-unit {
  grid-template-columns: auto minmax(0, 1fr);
}
.duration-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--cds-alias-object-app-foreground, #1b1b1b);
  white-space: nowrap;
  cursor: pointer;
}
.duration-value {
  width: 100%;
  min-width: 0;
  font: inherit;
  font-size: 14px;
  /* `box-sizing: border-box !important` 与 VirtualKeyFormModal
     同源:Chrome 给 <input> 套 user-agent shadow root,user-agent
     origin 强制 content-box !important,普通 `box-sizing` 没法
     override。锁住 24px 实际渲染高度,避免 .duration-field grid
     行被 padding+border 撑到 41px。 */
  box-sizing: border-box !important;
  height: 24px;
  padding: 4px 8px;
  border: 0;
  border-bottom: 1px solid #21333b;
  border-radius: 0;
  background: transparent;
  color: var(--cds-alias-object-app-foreground, #1b1b1b);
  outline: none;
}
.duration-value:focus {
  /* focus 态用 1px #0079ad 色带覆盖原 1px #21333b 下边框。
     background-size: 100% 1px 让色带刚好占满 input 整宽 1px,
     background-position: bottom 贴底。 */
  border-bottom: 1px solid #21333b;
  background-image: linear-gradient(#0079ad, #0079ad);
  background-size: 100% 1px;
  background-repeat: no-repeat;
  background-position: bottom;
}
.duration-unit {
  font: inherit;
  font-size: 14px;
  box-sizing: border-box !important;
  min-height: 24px;
  min-width: 72px;
  padding: 4px 24px 4px 8px;
  border: 0;
  border-bottom: 1px solid #21333b;
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
  background-position: calc(100% - 14px) 50%, calc(100% - 9px) 50%;
  background-size: 5px 5px, 5px 5px;
  background-repeat: no-repeat;
}
.duration-unit:focus {
  /* 与 .duration-value:focus 同视觉 —— 1px #0079ad 色带覆盖 1px
     #21333b 下边框。需要重新声明下拉箭头 caret (linear-gradient
     三角形),否则 :focus 内 background-image 会覆盖普通态箭头。 */
  border-bottom: 1px solid #21333b;
  background-image: linear-gradient(#0079ad, #0079ad),
    linear-gradient(45deg, transparent 50%, currentColor 50%),
    linear-gradient(135deg, currentColor 50%, transparent 50%);
  background-size: 100% 1px, 5px 5px, 5px 5px;
  background-position: bottom, calc(100% - 14px) 50%, calc(100% - 9px) 50%;
  background-repeat: no-repeat;
}
.wizard-step {
  display: grid;
  gap: 16px;
}
.wizard-step.review {
  gap: 20px;
}
/* 与 VirtualKeyFormModal 的 `.key-form cds-input` 同源:Carbon
   <cds-input> 内部 host 默认 inline-block,grid (`.advanced-grid`,
   `.toggles-subgrid`) 是 1fr 单元,但 child 没显式 width 时按
   content 收缩,label 短的 cds-input (如「每分钟 tokens (tpm)」)
   就只占 label 那段宽度。强制 cds-input 与底层 native input
   撑满父级 1fr,让 step 3 高级参数里的所有 cds-input 与
   「模型标签」(.tags-input) 同宽。
   所有 .wizard-step 内的 cds-input 模板上设了 `layout="vertical"`,
   让 label 出现在上方而不是左侧,把 input 行留给原生 <input>
   撑满整个 host 宽度 (horizontal 模式下 label 和 input 平分一行,
   会让 input 宽度只有 host 的一半多一点)。

   `!important` 是必要的 —— Chrome 给 <cds-input> 套了
   user-agent shadow root,user-agent origin 给 host 设了
   `width: auto !important` 与 `box-sizing: content-box !important`,
   优先级高于 author 普通规则。Author 普通 `width: 100%` 无法
   override,会导致宽度按 content 收缩 (与 VirtualKeyFormModal
   早期碰到的同一类问题 —— 必须用 !important 把 author
   优先级升到 user-agent !important 之上)。box-sizing: border-box
   防止 padding+border 撑破 .wizard-step 的内容宽度。 */
.wizard-step cds-input,
.wizard-step cds-input > input,
.wizard-step cds-textarea,
.wizard-step cds-textarea > textarea {
  width: 100% !important;
  box-sizing: border-box !important;
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