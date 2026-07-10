<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useLocaleStore } from '@/stores/locale'
import type { VirtualKeyOption } from '@/types/virtual-key'
import {
  ROUTE_PERMISSIONS,
  ROUTE_PERMISSION_PATHS,
  type RoutePermission,
  type VirtualKeyMetadata,
} from '@/api/graphql/queries/virtual-keys'
import type { CloneVirtualKeyInput } from '@/utils/virtualKey'

// Duration unit — LiteLLM accepts 'd' / 'h' / 'w' / 'm' (h=hour, d=day,
// w=7 days, m=month). The form drives the unit via a dropdown and
// rejoins "<value><unit>" in submit() to match that exact format.
export type DurationUnit = 'h' | 'd' | 'w' | 'm'

// Rotation interval unit — a finer-grained subset than DurationUnit
// because key rotation windows can be much shorter than key expiry
// windows. Accepts s/m/h/d (s=second, m=minute, h=hour, d=day). No
// week / month — those don't make sense for automatic rotation.
export type RotationIntervalUnit = 's' | 'm' | 'h' | 'd'

// Budget duration unit — LiteLLM-style, with the addition of 'mo' for
// 自然月 (calendar month, e.g. reset on the 1st of each month). Sits
// between RotationIntervalUnit (no month/week) and DurationUnit (which
// has 'w' but no 's'). Default is 'mo' — the most common budget window.
export type BudgetDurationUnit = 's' | 'm' | 'h' | 'd' | 'mo'

// Rate limit type — three LiteLLM throughput modes (see design doc §4.2):
//   best_effort_throughput (default) — soft cap; over-allocation is allowed
//   guaranteed_throughput          — hard cap; raises an error on overuse
//   dynamic                        — may dynamically exceed when no 429s
// The form defaults to 'best_effort_throughput' and only writes the
// field to the wire payload when the user picks a non-default value.
// (Defined as a non-exported type alias because SFC `<script setup>`
// doesn't allow top-level `export`s; export happens via the explicit
// `VirtualKeyFormDraft` interface below if/when other modules need it.)
type RateLimitType = 'best_effort_throughput' | 'guaranteed_throughput' | 'dynamic'

// Canonical, ordered list of rate-limit-type options. Used both as the
// iteration source for the radio UI and as the order in which options
// appear in the picker. Defined inside <script setup> (no `export` —
// SFC `<script setup>` doesn't allow top-level exports).
const RATE_LIMIT_TYPES: RateLimitType[] = [
  'best_effort_throughput',
  'guaranteed_throughput',
  'dynamic',
]

// VirtualKeyFormDraft — the create flow's wire payload. The postman
// `IssueVirtualKey` mutation now requires only `name` and
// `modelGateway` (the org scope is resolved server-side from the
// caller's session); everything else is optional. Models are sourced
// from `gatewayAvailableModels(gatewayConnectionId)` (the parent
// re-queries when the gateway picker changes) — there is no longer
// any M2 网关路由 involved at this layer.
export interface VirtualKeyFormDraft {
  name: string
  modelGateway: string
  duration?: string
  models?: string[]
  maxBudget?: number
  budgetDuration?: string
  maxParallelRequests?: number
  tpmLimit?: number
  rpmLimit?: number
  rpmLimitType?: string
  tpmLimitType?: string
  // Frontend "Allow All APIs" Switch:
  // - ON  → allowedRoutes OMITTED in the wire payload
  // - OFF → allowedRoutes = ['/v1/chat/completions', ...]
  allowedRoutes?: string[]
  // The wire payload now ships tags under `metadata.tags` (per the
  // IssueVirtualKeyInput contract change); the form's free-text input
  // still parses the same comma/newline-separated list, we just place
  // it inside the metadata bucket at submit time.
  metadata?: VirtualKeyMetadata
  // keyType is intentionally absent — the postman `IssueVirtualKey`
  // mutation always receives a fixed `default` value (see VirtualKeyView
  // submitKey), so there is no UI-driven variation to carry in the draft.
  // The clone path *does* carry the source's keyType through, so we
  // declare it as optional here and let submit() decide whether to
  // include it in the wire payload (create leaves it undefined →
  // submitKey falls back to 'default'; clone forwards the source's
  // value verbatim).
  keyType?: string
  autoRotate?: boolean
  rotationInterval?: string
}

const props = defineProps<{
  open: boolean
  gateways: VirtualKeyOption[]
  // The parent's persisted gateway selection — restored into the form on
  // open so the previously-picked gateway's model list reappears without
  // the user having to re-pick it.
  initialModelGateway?: string
  // Real-time model names fetched from the chosen modelGateway. An empty
  // array means "no models loaded yet" — usually because the user hasn't
  // picked a gateway yet (the parent's query is skipped).
  availableModels: string[]
  // Real-time query loading state for `availableModels` — drives the
  // "loading…" placeholder so the empty state doesn't read as
  // "暂无可用模型，请先选择网关" while the request is still in flight.
  availableModelsLoading?: boolean
  saving?: boolean
  // 'clone' switches the title to 克隆令牌 and tells reset() to layer
  // the clone prefill on top of the empty baseline. 'create' (default)
  // is the existing create-from-scratch path; clone is identical except
  // for the prefill + title.
  mode?: 'create' | 'clone'
  // Full prefill for the clone path. Consumed by reset() on the
  // false→true edge of `open`; null/undefined on the create path leaves
  // reset()'s baseline untouched. The fields mirror what the parent's
  // openClone() produced via `virtualKeyToIssueInput(src)`.
  initialDraft?: CloneVirtualKeyInput | null
  // Live duplicate-name check, driven by the parent (VirtualKeyView
  // runs the debounced virtualKeys(nameEquals: ...) query). The modal
  // only renders the warning — the network round-trip lives in the
  // parent so this component stays Apollo-free. `checking` flips the
  // indicator; `duplicate` (with the offending key's id, when known)
  // is what blocks form submission.
  nameDuplicate?: { checking: boolean; duplicate: boolean } | null
}>()

const emit = defineEmits<{
  (event: 'close'): void
  (event: 'gateway-changed', gatewayId: string): void
  (event: 'submit', draft: VirtualKeyFormDraft): void
  // Emitted on every keystroke in the name input; the parent debounces
  // and runs a virtualKeys(nameEquals: ...) query to surface a live
  // "name already exists" warning before the user submits. Modal
  // itself stays Apollo-free — see the prop comment above.
  (event: 'name-change', name: string): void
}>()

const locale = useLocaleStore()

// Basic
const name = ref('')
const modelGateway = ref('')
const selectedModels = ref<string[]>([])
// Duration is split into a numeric value and a unit so the user can
// pick the unit from a dropdown (h/d/w/m). submit() rejoins them into
// "<n><unit>" — the format the LiteLLM-side resolver expects.
const durationValue = ref<number | null>(null)
const durationUnit = ref<DurationUnit>('d')
const showAdvanced = ref(false)

// Advanced
// Budget control — a master toggle for the 「消费上限」 + 「预算周期」
// pair. When OFF, the form OMITS both maxBudget and budgetDuration from
// the wire payload (the resolver applies LiteLLM's default — no cap).
// When ON, the two fields become editable and the user picks a
// per-key spending cap + reset window.
const budgetControl = ref(false)
const maxBudget = ref<number | null>(null)
// Budget duration mirrors the duration / rotationInterval pattern: a
// numeric value plus a unit dropdown. submit() rejoins them into
// "<n><unit>" — the format the LiteLLM-side resolver expects. Default
// unit is 'mo' (自然月) — matches the most common budget reset window.
const budgetDurationValue = ref<number | null>(null)
const budgetDurationUnit = ref<BudgetDurationUnit>('mo')
const maxParallelRequests = ref<number | null>(null)
// Rate-limit control — a master toggle for the four TPM/RPM fields
// (tpmLimit, tpmLimitType, rpmLimit, rpmLimitType). Same pattern as
// `budgetControl` above: OFF → form OMITS all four fields from the
// wire payload; ON → the four fields become editable and submit()
// writes them. Without this gate, submit() would previously write the
// (uncontrolled) null values and silently drop the type fields, which
// meant the "limits" UX had no effect at all — even when the user had
// typed numbers into the inputs.
const rateLimitControl = ref(false)
const tpmLimit = ref<number | null>(null)
const rpmLimit = ref<number | null>(null)
// rpm/tpm Limit Type — mirrors LiteLLM's three throughput modes:
//   best_effort_throughput — over-allocation is allowed (no error)
//   guaranteed_throughput — over-allocation raises an error
//   dynamic              — may dynamically exceed when no 429s
// Default 'best_effort_throughput' matches the LiteLLM resolver
// default; the form keeps that default selected on open and only sends
// the field when the user explicitly picks a non-default value.
const rpmLimitType = ref<RateLimitType>('best_effort_throughput')
const tpmLimitType = ref<RateLimitType>('best_effort_throughput')
// Track the popover open state for the rate-limit-type pickers. The
// <details> element itself owns the actual open/close toggle, but
// the @click handler on each option needs to programmatically close
// the popover after a selection, which requires a reactive ref.
const tpmLimitPopoverOpen = ref(false)
const rpmLimitPopoverOpen = ref(false)
// Trigger element refs — the <summary> inside each popover's <details>.
// The popover list is teleported to <body> (see comment near
// <Teleport to="body"> below) so it can no longer rely on the
// <details>'s own relative positioning — it has to be positioned
// relative to the viewport with `position: fixed`. We measure the
// trigger's bounding rect at open time and on every scroll / resize
// to keep the list visually anchored under the trigger even as the
// surrounding form scrolls inside the modal.
const tpmLimitTriggerRef = ref<HTMLElement | null>(null)
const rpmLimitTriggerRef = ref<HTMLElement | null>(null)
// Live rect for the currently-open popover — null when the popover
// is closed. Drives the `top`/`left`/`width` inline styles on the
// teleported list so the list renders flush under the trigger. The
// `triggerWidth` is read out of the rect at open time and reused
// across re-renders (the list width should not depend on scroll
// state — only the position does).
const tpmPopoverPos = ref<{ top: number; left: number; width: number } | null>(null)
const rpmPopoverPos = ref<{ top: number; left: number; width: number } | null>(null)
const tagsText = ref('')
const autoRotate = ref(false)
// Rotation interval mirrors the duration pattern: a numeric value plus
// a unit dropdown (s/m/h/d). submit() rejoins them into "<n><unit>" —
// the format the LiteLLM-side resolver expects. Hidden when autoRotate
// is OFF (the input is conditionally rendered). Default unit is 'h'
// (hour) — a sensible starting window for automatic key rotation.
const rotationIntervalValue = ref<number | null>(null)
const rotationIntervalUnit = ref<RotationIntervalUnit>('h')
// keyType — driven only by the clone prefill path. Undefined on
// create, in which case the parent's submitKey() falls back to the
// hard-coded 'default'. Reading it back through the draft keeps the
// wire payload faithful when the user *does* clone a keyType that the
// upstream intentionally varied (rare today; intended forward-
// compatible with a future backend IssueVirtualKeyInput change).
const keyType = ref<string | undefined>(undefined)

// allowed_routes Switch + multi-select
const allowAllRoutes = ref(true)
const allowedRoutePermissions = ref<RoutePermission[]>([])

const attempted = ref(false)

const nameValid = computed(() => {
  const length = name.value.trim().length
  if (length < 2 || length > 64) return false
  // When the parent reports a duplicate, treat the name as invalid.
  // We deliberately do NOT block submission on `checking` (only on
  // `duplicate`) — a 300ms-debounced query is mid-flight most of the
  // time the user is typing, and we'd be falsely red on every keypress.
  if (props.nameDuplicate?.duplicate) return false
  return true
})
const gatewayValid = computed(() =>
  props.gateways.some((gateway) => gateway.id === modelGateway.value),
)
const modelsValid = computed(() => selectedModels.value.length > 0)
const allowedRoutesValid = computed(
  () => allowAllRoutes.value || allowedRoutePermissions.value.length > 0,
)
const formValid = computed(
  () =>
    nameValid.value &&
    gatewayValid.value &&
    modelsValid.value &&
    allowedRoutesValid.value,
)

function reset() {
  name.value = ''
  // Restore the parent's last-selected gateway on reopen, so the
  // previously-loaded model list reappears without re-picking. Only
  // restore if the gateway id still exists in the current gateway list
  // (the parent's `gateways` may have refreshed since last open).
  const restored =
    props.initialModelGateway &&
    props.gateways.some((gateway) => gateway.id === props.initialModelGateway)
      ? props.initialModelGateway
      : ''
  modelGateway.value = restored
  selectedModels.value = []
  durationValue.value = null
  durationUnit.value = 'd'
  budgetControl.value = false
  maxBudget.value = null
  // Budget duration's default unit is 'mo' (自然月) — and the resolver
  // (LiteLLM) treats the value as "calendar months" which is meaningless
  // as a fractional count, so we pin the value to 1 whenever the unit
  // is 'mo' (see the watch on budgetDurationUnit below for the same
  // rule applied on user-driven unit changes). Initialise the value
  // here so the disabled input shows "1" on first open rather than
  // an empty box.
  budgetDurationValue.value = budgetDurationUnit.value === 'mo' ? 1 : null
  budgetDurationUnit.value = 'mo'
  rateLimitControl.value = false
  maxParallelRequests.value = null
  tpmLimit.value = null
  rpmLimit.value = null
  rpmLimitType.value = 'best_effort_throughput'
  tpmLimitType.value = 'best_effort_throughput'
  tagsText.value = ''
  autoRotate.value = false
  rotationIntervalValue.value = null
  rotationIntervalUnit.value = 'h'
  keyType.value = undefined
  allowAllRoutes.value = true
  allowedRoutePermissions.value = []
  attempted.value = false
  showAdvanced.value = false
  // Make sure the parent's `availableModels` query re-fires for the
  // restored gateway (Apollo may have evicted the previous result, or
  // the parent may not have set `formGateway` if this is the very first
  // open and `initialModelGateway` was empty).
  if (restored) emit('gateway-changed', restored)

  // Clone prefill — layered on top of the empty baseline above so the
  // create path is unchanged (mode === 'create' / null draft falls
  // through). The helper at @/utils/virtualKey already cleared `name`
  // and dropped `duration`/`agentId`, so we only re-populate the
  // fields the source actually carries.
  if (props.mode === 'clone' && props.initialDraft) {
    const d = props.initialDraft
    // name is forced empty by the helper — leave the baseline '' so
    // the modal's required-field check fires on submit until the user
    // types a value.
    name.value = d.name ?? ''
    // Gateway: prefer the source's gateway over the parent's restored
    // value, so the form lands on the right gateway when the user
    // clones a key bound to a gateway they hadn't last opened.
    if (d.modelGateway && props.gateways.some((g) => g.id === d.modelGateway)) {
      modelGateway.value = d.modelGateway
      emit('gateway-changed', d.modelGateway)
    }
    if (d.models && d.models.length > 0) {
      selectedModels.value = [...d.models]
    }
    // Budget: turn the master toggle on only when the source actually
    // carried a value, so leaving both null on the source keeps the
    // create-style "no cap" default.
    if (typeof d.maxBudget === 'number') {
      budgetControl.value = true
      maxBudget.value = d.maxBudget
    }
    // budgetDuration is "30d" / "1mo" — split value/unit; pin to 1 if
    // the unit is 'mo' (mirrors the baseline rule on line 256 above).
    if (d.budgetDuration) {
      budgetControl.value = true
      const m = /^(\d+)([smhdwmo]+)$/.exec(d.budgetDuration)
      if (m) {
        budgetDurationValue.value =
          m[2] === 'mo' ? 1 : Number(m[1])
        budgetDurationUnit.value = m[2] as BudgetDurationUnit
      }
    }
    // Rate-limit master toggle mirrors budget: ON only when the source
    // carried at least one rate-limit field. Limits that the source
    // didn't carry stay null (the wire payload will simply omit them,
    // same as if the user hadn't filled the field).
    if (
      typeof d.maxParallelRequests === 'number' ||
      typeof d.tpmLimit === 'number' ||
      typeof d.rpmLimit === 'number'
    ) {
      rateLimitControl.value = true
    }
    if (typeof d.maxParallelRequests === 'number') {
      maxParallelRequests.value = d.maxParallelRequests
    }
    if (typeof d.tpmLimit === 'number') tpmLimit.value = d.tpmLimit
    if (typeof d.rpmLimit === 'number') rpmLimit.value = d.rpmLimit
    if (d.tpmLimitType) {
      tpmLimitType.value = d.tpmLimitType as RateLimitType
    }
    if (d.rpmLimitType) {
      rpmLimitType.value = d.rpmLimitType as RateLimitType
    }
    // allowedRoutes: empty list / undefined means "Allow All APIs" was
    // ON for the source. Any concrete list flips the switch OFF and
    // maps each /v1/* path back to the RoutePermission enum value used
    // by the form's checkbox grid.
    if (d.allowedRoutes && d.allowedRoutes.length > 0) {
      allowAllRoutes.value = false
      const perms: RoutePermission[] = []
      for (const path of d.allowedRoutes) {
        const entry = Object.entries(ROUTE_PERMISSION_PATHS).find(
          ([, p]) => p === path,
        )
        if (entry) perms.push(entry[0] as RoutePermission)
      }
      allowedRoutePermissions.value = perms
    }
    // tags ride under `metadata.tags` on the wire. The form's free-text
    // input is comma/newline-separated; serialise back the same way the
    // submit() path parses it (so the visible value round-trips).
    if (d.metadata) {
      tagsText.value = d.metadata.tags
        .map((t) => String(t).trim())
        .filter(Boolean)
        .join(', ')
    }
    if (typeof d.autoRotate === 'boolean') {
      autoRotate.value = d.autoRotate
    }
    if (d.rotationInterval) {
      // RotationIntervalUnit is 's' | 'm' | 'h' | 'd' (no w/mo —
      // tighter than DurationUnit because key-rotation windows are
      // always sub-month). Restrict the regex char-class accordingly
      // so the cast lines up with the ref's type without a `as
      // unknown as`.
      const m = /^(\d+)([smhd]+)$/.exec(d.rotationInterval)
      if (m) {
        rotationIntervalValue.value = Number(m[1])
        rotationIntervalUnit.value = m[2] as RotationIntervalUnit
      }
    }
    // Carry the source's keyType through verbatim; empty string from a
    // malformed source maps to undefined so the parent's fallback to
    // 'default' (in submitKey) fires for the create-equivalent case.
    if (d.keyType && d.keyType.length > 0) {
      keyType.value = d.keyType
    }
    // Force the advanced pane open on clone — too many pre-filled
    // values to hide behind a "Show advanced" click; the user is
    // likely here to verify or tweak them.
    showAdvanced.value = true
  }
}

// Reset the form fields only on the false→true edge of `open` (i.e. the
// moment the modal opens). Earlier this watcher also listed
// `props.gateways` and `props.initialModelGateway` as deps and called
// reset() on any change while open — that wiped the user's
// 「密钥名称」/「所属组织」 as soon as they picked a gateway, because
// picking a gateway emitted `gateway-changed`, the parent updated
// `formGateway`, and the new `initialModelGateway` value triggered
// reset() with `open` still true. Edge-only reset is the right shape:
// the `gateways` list and `initialModelGateway` are read inside reset()
// already (to restore the previously-selected gateway), so the
// dependency is fine — the only requirement is that reset() must NOT
// fire when the user changes a dep while the modal is already open.
watch(
  () => props.open,
  (open, prev) => {
    if (open && !prev) reset()
  },
  { immediate: true },
)

// When the user picks 'mo' as the budget-duration unit, the resolver
// (LiteLLM) treats the value as a count of calendar months, so any
// fractional value would round to a whole number anyway. To keep the
// UI consistent with that constraint — and to prevent the user from
// typing a meaningless value like 0.5mo or 13mo (which the resolver
// does accept but reads as "1 month" or "12 months" respectively) —
// we force the value to 1 and disable the numeric input while the
// unit is 'mo'. The watch fires on the unit <select>'s @change; it
// does NOT fire when the user types into the (disabled) input, since
// the input is disabled while the unit is 'mo'. When the user
// switches AWAY from 'mo' (e.g. to 'd'), we leave the value alone
// rather than clearing it — the user may have explicitly set a
// number while it was editable (e.g. typed 30 when the unit was 'd'
// before switching to 'mo' and back) and we shouldn't silently wipe
// their input.
watch(budgetDurationUnit, (unit) => {
  if (unit === 'mo') budgetDurationValue.value = 1
})

function close() {
  if (!props.saving) emit('close')
}

// Single-source-of-truth for the name input's @input handler: updates
// the local ref + bubbles the value up to the parent so its debounced
// virtualKeys(nameEquals: ...) check can run. Inline as @input="name =
// ($event.target as HTMLInputElement).value" used to live directly on
// the input — moved here when the duplicate-check flow was added so
// the emit doesn't have to be duplicated across handlers.
function onNameInput(event: Event) {
  const value = (event.target as HTMLInputElement).value
  name.value = value
  emit('name-change', value.trim())
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

// Recompute the viewport-relative position for one of the popover
// lists. Called at open time and on every scroll / resize while the
// popover is open, so the list stays flush under its trigger even as
// the modal's internal scroll position changes. Returns null when the
// trigger ref isn't attached yet (e.g. the popover is closed) so the
// caller can clear its position state.
function measurePopoverPosition(
  trigger: HTMLElement | null,
): { top: number; left: number; width: number } | null {
  if (!trigger) return null
  const rect = trigger.getBoundingClientRect()
  // 4px mirrors the original absolute offset (`top: calc(100% + 4px)`)
  // so the list sits 4px below the trigger, matching the previous
  // visual rhythm.
  return { top: rect.bottom + 4, left: rect.left, width: rect.width }
}

function refreshTpmPopoverPosition() {
  tpmPopoverPos.value = measurePopoverPosition(tpmLimitTriggerRef.value)
}
function refreshRpmPopoverPosition() {
  rpmPopoverPos.value = measurePopoverPosition(rpmLimitTriggerRef.value)
}

// Toggle the popover open state AND seed the position state. We
// can't rely on a pure `:open` binding because by the time the next
// paint happens the list (which is `position: fixed`) needs valid
// coordinates or it would briefly render at the wrong viewport
// position. Measuring at toggle time — which fires synchronously
// after the user click — gives us a stable rect before Vue's render
// pass starts, so the list appears under the trigger on the very
// first frame it becomes visible.
//
// Each toggle also enforces mutual exclusion against its sibling:
// opening one popover programmatically closes the other, both at
// the reactive-ref level and at the underlying <details>.open DOM
// level — otherwise each <details> would manage its own state
// independently, and clicking the RPM trigger while TPM is open
// would leave both popovers visible at once (they live in different
// Teleport slots and so never collapse into each other visually).
function onTpmTriggerToggle(event: Event) {
  const open = (event.target as HTMLDetailsElement).open
  tpmLimitPopoverOpen.value = open
  if (open) {
    refreshTpmPopoverPosition()
    // Mutex: collapse the RPM popover so both can't be open at once.
    // Set the Vue ref first so the teleported list unmounts, then
    // sync the underlying <details>.open so a subsequent summary
    // click still sees a consistent starting state.
    rpmLimitPopoverOpen.value = false
    rpmPopoverPos.value = null
    if (rpmLimitTriggerRef.value) {
      ;(rpmLimitTriggerRef.value as HTMLElement).closest('details')?.removeAttribute('open')
    }
  } else {
    tpmPopoverPos.value = null
  }
}
function onRpmTriggerToggle(event: Event) {
  const open = (event.target as HTMLDetailsElement).open
  rpmLimitPopoverOpen.value = open
  if (open) {
    refreshRpmPopoverPosition()
    // Mutex: collapse the TPM popover (mirror of onTpmTriggerToggle).
    tpmLimitPopoverOpen.value = false
    tpmPopoverPos.value = null
    if (tpmLimitTriggerRef.value) {
      ;(tpmLimitTriggerRef.value as HTMLElement).closest('details')?.removeAttribute('open')
    }
  } else {
    rpmPopoverPos.value = null
  }
}

// Re-measure on scroll / resize while a popover is open. The trigger
// moves with the surrounding form as the modal scrolls, so a stale
// position would leave the list floating in the wrong place. We
// attach a single window-level listener (added on first open, never
// removed while the modal is alive) — cheap because it's a passive
// listener and only fires when the user is actually scrolling.
function onViewportChange() {
  if (tpmLimitPopoverOpen.value) refreshTpmPopoverPosition()
  if (rpmLimitPopoverOpen.value) refreshRpmPopoverPosition()
}
onMounted(() => {
  window.addEventListener('scroll', onViewportChange, true)
  window.addEventListener('resize', onViewportChange)
})
onBeforeUnmount(() => {
  window.removeEventListener('scroll', onViewportChange, true)
  window.removeEventListener('resize', onViewportChange)
})

function submit() {
  attempted.value = true
  if (!formValid.value || props.saving) return
  const tagsArray = tagsText.value
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
    modelGateway: modelGateway.value,
    duration:
      durationValue.value != null && durationValue.value > 0
        ? `${durationValue.value}${durationUnit.value}`
        : undefined,
    models: selectedModels.value.length > 0 ? selectedModels.value : undefined,
    maxBudget: budgetControl.value ? maxBudget.value ?? undefined : undefined,
    budgetDuration:
      budgetControl.value &&
      budgetDurationValue.value != null &&
      budgetDurationValue.value > 0
        ? `${budgetDurationValue.value}${budgetDurationUnit.value}`
        : undefined,
    maxParallelRequests: maxParallelRequests.value ?? undefined,
    // Rate-limit fields are gated by the 「设置限额」 master toggle:
    //   OFF → omit all four fields (LiteLLM's no-cap default applies)
    //   ON  → write tpmLimit / rpmLimit when non-null; write
    //         *LimitType only when explicitly non-default (matches the
    //         pre-existing behavior so the wire payload stays minimal
    //         when the user hasn't picked a throughput mode).
    tpmLimit: rateLimitControl.value ? tpmLimit.value ?? undefined : undefined,
    rpmLimit: rateLimitControl.value ? rpmLimit.value ?? undefined : undefined,
    rpmLimitType:
      rateLimitControl.value && rpmLimitType.value !== 'best_effort_throughput'
        ? rpmLimitType.value
        : undefined,
    tpmLimitType:
      rateLimitControl.value && tpmLimitType.value !== 'best_effort_throughput'
        ? tpmLimitType.value
        : undefined,
    allowedRoutes,
    // IssueVirtualKeyInput now carries tags under `metadata.tags`; when
    // the input is empty we OMIT the field entirely so the resolver sees
    // nil and the gateway keeps its default (no tags) rather than
    // receiving an empty bucket.
    metadata: tagsArray.length > 0 ? { tags: tagsArray } : undefined,
    // keyType travels through verbatim when the clone path set it; on
    // create (or when the helper cleared it) it stays undefined and
    // the parent's submitKey() falls back to the hard-coded 'default'.
    keyType: keyType.value || undefined,
    autoRotate: autoRotate.value,
    rotationInterval:
      autoRotate.value &&
      rotationIntervalValue.value != null &&
      rotationIntervalValue.value > 0
        ? `${rotationIntervalValue.value}${rotationIntervalUnit.value}`
        : undefined,
  }
  emit('submit', draft)
}
</script>

<template>
  <cds-modal :hidden="!open" :closable="!saving" size="lg" @closeChange="close">
    <cds-modal-header>
      <h2 cds-text="title" class="modal-title">
        {{ locale.t(mode === 'clone' ? 'virtualKey.form.cloneTitle' : 'virtualKey.form.createTitle') }}
      </h2>
    </cds-modal-header>

    <cds-modal-content>
      <form class="key-form" @submit.prevent="submit">
        <!-- BASIC -->
        <cds-input :status="attempted && !nameValid ? 'error' : 'neutral'">
          <label>
            {{ locale.t('virtualKey.form.name') }}
            <sup class="required-mark" aria-hidden="true">
              {{ locale.t('virtualKey.form.requiredMark') }}
            </sup>
          </label>
          <input
            :value="name"
            maxlength="64"
            autocomplete="off"
            :placeholder="locale.t('virtualKey.form.namePlaceholder')"
            @input="onNameInput"
          />
          <!-- Live duplicate hint — when the parent reports a hit,
               surface it as a soft "warning" status before the user
               hits submit (and the backend 409s). `checking` shows a
               transient indicator; `duplicate` blocks form submission
               via nameValid above. -->
          <cds-control-message
            v-if="nameDuplicate?.duplicate && (name ?? '').trim().length > 0"
            status="warning"
          >
            {{ locale.t('virtualKey.form.nameDuplicate') }}
          </cds-control-message>
          <cds-control-message
            v-else-if="attempted && !nameValid"
            status="error"
          >
            {{ locale.t('virtualKey.form.nameRequired') }}
          </cds-control-message>
        </cds-input>

        <div
          class="gateway-field"
          :class="{ error: attempted && !gatewayValid }"
        >
          <label for="vk-gateway-select" class="gateway-label">
            {{ locale.t('virtualKey.form.gateway') }}
            <sup class="required-mark" aria-hidden="true">
              {{ locale.t('virtualKey.form.requiredMark') }}
            </sup>
          </label>
          <select
            id="vk-gateway-select"
            class="gateway-select"
            :value="modelGateway"
            :aria-label="locale.t('virtualKey.form.gateway')"
            @change="onGatewayChange"
          >
            <option value="">{{ locale.t('virtualKey.form.gatewayPlaceholder') }}</option>
            <option v-for="gateway in gateways" :key="gateway.id" :value="gateway.id">
              {{ gateway.name }}
            </option>
          </select>
          <cds-control-message v-if="attempted && !gatewayValid" status="error">
            {{ locale.t('virtualKey.form.gatewayRequired') }}
          </cds-control-message>
        </div>

        <!-- Models multi-select — sourced from gatewayAvailableModels after
             a gateway is picked. Server-side validates each entry against
             the gateway's live model list, so stale names 400. Before a
             gateway is picked the parent hasn't queried yet, so the list
             is empty and the `model-empty` paragraph below renders the
             「先选择网关」 hint. -->
        <div :class="{ 'models-field-error': attempted && !modelsValid }">
          <label class="section-label">
            {{ locale.t('virtualKey.form.models') }}
            <sup class="required-mark" aria-hidden="true">
              {{ locale.t('virtualKey.form.requiredMark') }}
            </sup>
            <!-- 「选择网关后加载可用模型」 rendered inline next to the
                 label as a parenthetical hint, rather than as a
                 separate <cds-control-message> below the chip cloud.
                 The model-picker is a visually self-explanatory
                 control (a grid of togglable pills), and the
                 "load-after-pick" caveat is more naturally read as a
                 sub-label of the field name than as a footer
                 message — keeping it next to the field name
                 preserves a tight vertical rhythm under the basic
                 fields section. The `.models-hint` class is
                 scoped-styled to match the muted, smaller text weight
                 of the parenthetical elsewhere in the app. -->
            <span class="models-hint">
              ({{ locale.t('virtualKey.form.modelsHint') }})
            </span>
          </label>
          <div class="models-grid">
            <label
              v-for="model in availableModels"
              :key="model"
              class="model-option"
            >
              <input
                type="checkbox"
                class="model-option-input"
                :checked="selectedModels.includes(model)"
                @change="toggleModel(model)"
              />
              <span class="model-option-pill">{{ model }}</span>
            </label>
            <p v-if="availableModels.length === 0" class="model-empty">
              <template v-if="!modelGateway">
                {{ locale.t('virtualKey.form.modelsEmpty') }}
              </template>
              <template v-else-if="availableModelsLoading">
                {{ locale.t('virtualKey.form.modelsLoading') }}
              </template>
              <template v-else>
                {{ locale.t('virtualKey.form.modelsEmptyAfterPick') }}
              </template>
            </p>
          </div>
          <cds-control-message v-if="attempted && !modelsValid" status="error">
            {{ locale.t('virtualKey.form.modelsRequired') }}
          </cds-control-message>
        </div>

        <!-- Duration lives BELOW the basic section (above 高级参数) so users
             see the expiry toggle without expanding. Native <input> +
             <select> rather than <cds-input>+slot: cds-input's shadow DOM
             only projects a single form control, so a sibling <select>
             next to the slotted <input> doesn't render. Using a plain
             <label> + native controls mirrors ConfirmDialog's app-input
             pattern and lets both controls take real focus. The label,
             value input, and unit select share one row (auto / 1fr / auto)
             to match the gateway field's two-column rhythm. -->
        <div class="duration-field">
          <div class="duration-row">
            <label class="duration-label">
              {{ locale.t('virtualKey.form.duration') }}
            </label>
            <input
              class="duration-value"
              type="number"
              min="0"
              step="1"
              :value="durationValue ?? ''"
              @input="
                durationValue =
                  ($event.target as HTMLInputElement).value === ''
                    ? null
                    : Number(($event.target as HTMLInputElement).value)
              "
            />
            <select
              class="duration-unit"
              :value="durationUnit"
              :aria-label="locale.t('virtualKey.form.durationUnit')"
              @change="
                durationUnit = ($event.target as HTMLSelectElement).value as DurationUnit
              "
            >
              <option value="h">{{ locale.t('virtualKey.form.durationUnitHour') }}</option>
              <option value="d">{{ locale.t('virtualKey.form.durationUnitDay') }}</option>
              <option value="w">{{ locale.t('virtualKey.form.durationUnitWeek') }}</option>
              <option value="m">{{ locale.t('virtualKey.form.durationUnitMonth') }}</option>
            </select>
          </div>
          <cds-control-message status="neutral" class="duration-hint">
            {{ locale.t('virtualKey.form.durationHint') }}
          </cds-control-message>
        </div>

        <!-- Auto-rotate lives BELOW 有效时长, ABOVE 高级参数 — sits in the
             "always-visible" zone with 有效时长 because rotating the key
             is a basic key-issuance concern, not a 风控抽屉 knob. The
             (conditional) rotation interval stacks under the toggle so
             both pieces read as one logical group. -->
        <div class="auto-rotate-group">
          <cds-control class="auto-rotate-toggle">
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
          <!-- Mirrors 有效时长's number + unit-select layout. Native label
               + input + select (cds-input's shadow DOM only projects a
               single form control, so a sibling <select> wouldn't render
               inside it). Reuses the .duration-* styles so the two
               "interval" fields look identical. -->
          <div v-if="autoRotate" class="duration-field">
            <div class="duration-row">
              <label class="duration-label">
                {{ locale.t('virtualKey.form.rotationInterval') }}
              </label>
              <input
                class="duration-value"
                type="number"
                min="0"
                step="1"
                :value="rotationIntervalValue ?? ''"
                @input="
                  rotationIntervalValue =
                    ($event.target as HTMLInputElement).value === ''
                      ? null
                      : Number(($event.target as HTMLInputElement).value)
                "
              />
              <select
                class="duration-unit"
                :value="rotationIntervalUnit"
                :aria-label="locale.t('virtualKey.form.rotationIntervalUnit')"
                @change="
                  rotationIntervalUnit = ($event.target as HTMLSelectElement).value as RotationIntervalUnit
                "
              >
                <option value="s">
                  {{ locale.t('virtualKey.form.rotationIntervalUnitSecond') }}
                </option>
                <option value="m">
                  {{ locale.t('virtualKey.form.rotationIntervalUnitMinute') }}
                </option>
                <option value="h">
                  {{ locale.t('virtualKey.form.rotationIntervalUnitHour') }}
                </option>
                <option value="d">
                  {{ locale.t('virtualKey.form.rotationIntervalUnitDay') }}
                </option>
              </select>
            </div>
          </div>
        </div>

        <!-- ADVANCED (LiteLLM design doc §4.2 风控抽屉) — chevron mirrors
             the 「新建模型」 modal: direction flips between right
             (collapsed) and down (expanded), tracked via the `open`
             reflected back from the <details> toggle event. -->
        <details
          class="advanced-section"
          :open="showAdvanced"
          @toggle="showAdvanced = ($event.target as HTMLDetailsElement).open"
        >
          <summary class="advanced-toggle">
            <span
              class="advanced-chevron"
              :class="{ 'advanced-chevron--open': showAdvanced }"
              aria-hidden="true"
            ></span>
            <span>{{ locale.t('virtualKey.form.advanced') }}</span>
          </summary>

          <div class="advanced-grid">
            <!-- Tags is a free-form, multi-token string — its own row so the
                 placeholder can show several example tags on one line and
                 the field doesn't get squeezed by the numeric neighbors. -->
            <cds-input class="advanced-tags">
              <label>{{ locale.t('virtualKey.form.tags') }}</label>
              <input
                v-model="tagsText"
                :placeholder="locale.t('virtualKey.form.tagsPlaceholder')"
              />
            </cds-input>
            <cds-input class="advanced-full-row">
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
          </div>

          <!-- Rate-limit control group — master toggle + (conditional)
               2×2 grid of TPM/RPM fields, rendered as its own block
               OUTSIDE .advanced-grid (same pattern as the budget-control
               group below). The four child fields (tpmLimitType /
               tpmLimit / rpmLimitType / rpmLimit) are arranged in two
               rows × two columns so they read as a paired "throughput
               control" rather than four unrelated fields. When the
               toggle is OFF, all four inputs are removed from the DOM
               AND the form OMITS the four corresponding wire fields
               (the resolver applies LiteLLM's no-cap default). -->
          <div class="rate-limit-control-group">
            <cds-control class="rate-limit-control-toggle">
              <cds-toggle>
                <label>{{ locale.t('virtualKey.form.rateLimitControl') }}</label>
                <input
                  type="checkbox"
                  slot="input"
                  :checked="rateLimitControl"
                  @change="rateLimitControl = ($event.target as HTMLInputElement).checked"
                />
              </cds-toggle>
            </cds-control>
            <div v-if="rateLimitControl" class="rate-limit-control-list">
              <!-- Four fields stacked vertically — one field per row,
                   each row spanning the full form width. This is the
                   simplest layout for the four-parameter block: every
                   field reads on its own line (label above the
                   control), and there's no need for the reader to
                   track which cell pairs with which across rows or
                   columns. The trade-off is vertical density
                   (4 lines instead of 2) but the rate-limit knobs are
                   configuration rather than primary input, so a
                   forgiving, easy-to-scan layout is more important
                   than compactness here. -->
              <div class="rate-limit-type-field">
                <label class="rate-limit-type-label" :for="`tpm-limit-type-trigger`">
                  {{ locale.t('virtualKey.form.tpmLimitType') }}
                </label>
                <details
                  class="rate-limit-popover"
                  :open="tpmLimitPopoverOpen"
                  @toggle="onTpmTriggerToggle"
                >
                  <summary
                    :id="`tpm-limit-type-trigger`"
                    ref="tpmLimitTriggerRef"
                    class="duration-unit duration-unit--full rate-limit-popover-trigger"
                    :aria-label="locale.t('virtualKey.form.tpmLimitType')"
                  >
                    <span class="rate-limit-popover-trigger-text">
                      {{ locale.t(`virtualKey.form.rateLimitType.${tpmLimitType}.title`) }}
                    </span>
                    <span class="rate-limit-popover-caret" aria-hidden="true"></span>
                  </summary>
                  <!-- The popover list is intentionally empty here.
                       The actual <ul> lives in a <Teleport to="body">
                       at the end of this template (search for
                       `teleportRateLimitPopovers`) so it can use
                       `position: fixed` to escape the modal's
                       internal scroll container — that container was
                       clipping the list at its bottom edge and
                       hiding the scrollbar, leaving 「动态」
                       unreachable. The trigger rect is still measured
                       from the <summary> above; we just render the
                       list out-of-tree so the rect math (viewport
                       coords) lines up cleanly with the list's
                       `position: fixed` positioning. -->
                </details>
              </div>
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
              <div class="rate-limit-type-field">
                <label class="rate-limit-type-label" :for="`rpm-limit-type-trigger`">
                  {{ locale.t('virtualKey.form.rpmLimitType') }}
                </label>
                <details
                  class="rate-limit-popover"
                  :open="rpmLimitPopoverOpen"
                  @toggle="onRpmTriggerToggle"
                >
                  <summary
                    :id="`rpm-limit-type-trigger`"
                    ref="rpmLimitTriggerRef"
                    class="duration-unit duration-unit--full rate-limit-popover-trigger"
                    :aria-label="locale.t('virtualKey.form.rpmLimitType')"
                  >
                    <span class="rate-limit-popover-trigger-text">
                      {{ locale.t(`virtualKey.form.rateLimitType.${rpmLimitType}.title`) }}
                    </span>
                    <span class="rate-limit-popover-caret" aria-hidden="true"></span>
                  </summary>
                  <!-- See the matching TPM popover-list comment for
                       why the actual <ul> is teleported to <body>. -->
                </details>
              </div>
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
            </div>
          </div>

          <!-- Budget control group — toggle + (conditional) maxBudget +
               budgetDuration pair, rendered as its own block OUTSIDE
               .advanced-grid so it can stretch the full form width
               without competing with the tags / maxParallelRequests
               fields for grid columns. When the toggle is OFF, both
               inputs are removed from the DOM and the form OMITS the
               corresponding wire fields. Sibling to the
               .rate-limit-control-group above — together they cover
               the "spending cap" and "throughput cap" toggles of the
               LiteLLM 风控抽屉 (design doc §4.2). -->
          <div class="budget-control-group">
            <cds-control class="budget-control-toggle">
              <cds-toggle>
                <label>{{ locale.t('virtualKey.form.budgetControl') }}</label>
                <input
                  type="checkbox"
                  slot="input"
                  :checked="budgetControl"
                  @change="budgetControl = ($event.target as HTMLInputElement).checked"
                />
              </cds-toggle>
            </cds-control>
            <div v-if="budgetControl" class="budget-control-row">
              <!-- Mirrors 有效时长's number + unit-select layout. Native
                   label + input + select (cds-input's shadow DOM only
                   projects a single form control, so a sibling <select>
                   wouldn't render inside it). Reuses the .duration-*
                   styles. Unit set is s/m/h/d/mo — 'mo' is 自然月
                   (calendar-month reset window). -->
              <div class="duration-field">
                <div class="duration-row duration-row--no-unit">
                  <label class="duration-label">
                    {{ locale.t('virtualKey.form.maxBudget') }}
                  </label>
                  <input
                    class="duration-value"
                    type="number"
                    min="0"
                    step="1"
                    :value="maxBudget ?? ''"
                    @input="maxBudget = Number(($event.target as HTMLInputElement).value) || null"
                  />
                </div>
              </div>
              <!-- Mirrors 有效时长's number + unit-select layout. Native
                   label + input + select (cds-input's shadow DOM only
                   projects a single form control, so a sibling <select>
                   wouldn't render inside it). Reuses the .duration-*
                   styles. Unit set is s/m/h/d/mo — 'mo' is 自然月
                   (calendar-month reset window). -->
              <div class="duration-field">
                <div class="duration-row">
                  <label class="duration-label">
                    {{ locale.t('virtualKey.form.budgetDuration') }}
                  </label>
                  <input
                    class="duration-value"
                    type="number"
                    min="0"
                    step="1"
                    :value="budgetDurationValue ?? ''"
                    :disabled="budgetDurationUnit === 'mo'"
                    @input="
                      budgetDurationValue =
                        ($event.target as HTMLInputElement).value === ''
                          ? null
                          : Number(($event.target as HTMLInputElement).value)
                    "
                  />
                  <select
                    class="duration-unit"
                    :value="budgetDurationUnit"
                    :aria-label="locale.t('virtualKey.form.budgetDurationUnit')"
                    @change="
                      budgetDurationUnit = ($event.target as HTMLSelectElement)
                        .value as BudgetDurationUnit
                    "
                  >
                    <option value="s">
                      {{ locale.t('virtualKey.form.budgetDurationUnitSecond') }}
                    </option>
                    <option value="m">
                      {{ locale.t('virtualKey.form.budgetDurationUnitMinute') }}
                    </option>
                    <option value="h">
                      {{ locale.t('virtualKey.form.budgetDurationUnitHour') }}
                    </option>
                    <option value="d">
                      {{ locale.t('virtualKey.form.budgetDurationUnitDay') }}
                    </option>
                    <option value="mo">
                      {{ locale.t('virtualKey.form.budgetDurationUnitMonth') }}
                    </option>
                  </select>
                </div>
              </div>
            </div>
          </div>

          <!-- allowed_routes: 隐式白名单 (design doc §4.2). The previous
                 <fieldset>+<legend> chrome drew a boxed caption
                 「接口权限」 above the toggle, which read as a
                 sub-section header and visually competed with the
                 two other advanced toggles (「设置限额」 /
                 「预算控制」) that render inline. We now render the
                 section label inline next to the toggle as
                 「允许所有接口 (接口权限)」 so all three advanced
                 toggles share the same inline-label rhythm. -->
          <div class="allowed-routes-group">
            <cds-control>
              <cds-toggle>
                <label>
                  {{ locale.t('virtualKey.form.allowAllRoutes') }}
                  <span class="allowed-routes-caption">
                    ({{ locale.t('virtualKey.form.allowedRoutes') }})
                  </span>
                </label>
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
          </div>
        </details>

        <!-- teleportRateLimitPopovers — Teleport the popover lists
             for TPM and RPM limit-type pickers out to <body>. They
             live as fixed-position elements positioned by inline
             `top/left/width` styles driven by the corresponding
             trigger's `getBoundingClientRect()`. Teleporting is what
             makes the positioning reliable: rendering the list in
             place inside the <details> caused two failures — (a) the
             list could be clipped by ancestor overflow containers
             (the modal's internal scroll container clipped the
             bottom edge, hiding 「动态」), and (b) measuring
             <summary> inside a <details> in some browsers returned a
             rect that didn't match the visible position, leaving the
             list floating at the wrong viewport coordinates. With
             the list at <body> root and the rect measured from the
             trigger, both problems disappear: the list has no
             overflow ancestors above <body>, and the trigger rect
             is the only anchor. -->
        <Teleport to="body">
          <ul
            v-if="tpmLimitPopoverOpen"
            class="rate-limit-popover-list"
            role="listbox"
            :style="
              tpmPopoverPos
                ? {
                    top: `${tpmPopoverPos.top}px`,
                    left: `${tpmPopoverPos.left}px`,
                    width: `${tpmPopoverPos.width}px`,
                  }
                : undefined
            "
          >
            <li
              v-for="opt in RATE_LIMIT_TYPES"
              :key="opt"
              class="rate-limit-popover-option"
              :class="{
                'rate-limit-popover-option--selected': tpmLimitType === opt,
              }"
              role="option"
              :aria-selected="tpmLimitType === opt"
              @click="
                tpmLimitType = opt;
                tpmLimitPopoverOpen = false
              "
            >
              <span class="rate-limit-popover-option-title">
                {{ locale.t(`virtualKey.form.rateLimitType.${opt}.title`) }}
              </span>
              <span class="rate-limit-popover-option-desc">
                {{ locale.t(`virtualKey.form.rateLimitType.${opt}.desc`) }}
              </span>
            </li>
          </ul>
          <ul
            v-if="rpmLimitPopoverOpen"
            class="rate-limit-popover-list"
            role="listbox"
            :style="
              rpmPopoverPos
                ? {
                    top: `${rpmPopoverPos.top}px`,
                    left: `${rpmPopoverPos.left}px`,
                    width: `${rpmPopoverPos.width}px`,
                  }
                : undefined
            "
          >
            <li
              v-for="opt in RATE_LIMIT_TYPES"
              :key="opt"
              class="rate-limit-popover-option"
              :class="{
                'rate-limit-popover-option--selected': rpmLimitType === opt,
              }"
              role="option"
              :aria-selected="rpmLimitType === opt"
              @click="
                rpmLimitType = opt;
                rpmLimitPopoverOpen = false
              "
            >
              <span class="rate-limit-popover-option-title">
                {{ locale.t(`virtualKey.form.rateLimitType.${opt}.title`) }}
              </span>
              <span class="rate-limit-popover-option-desc">
                {{ locale.t(`virtualKey.form.rateLimitType.${opt}.desc`) }}
              </span>
            </li>
          </ul>
        </Teleport>
      </form>
    </cds-modal-content>

    <cds-modal-actions>
      <cds-button action="outline" :disabled="saving" @click="close">
        {{ locale.t('virtualKey.form.cancel') }}
      </cds-button>
      <cds-button
        :loading-state="saving ? 'loading' : 'default'"
        :disabled="!formValid || saving"
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
/* Indent the form body inside the lg modal so field labels no longer
   share the modal title's left edge (at lg width, that edge feels
   cramped). A fixed left margin (not max-width) keeps the indent
   predictable and matches the "start after the title" rhythm. The
   right padding adds matching breathing room on the right so the
   form's last input doesn't sit flush against the modal edge. */
.key-form {
  display: grid;
  gap: 16px;
  margin-left: 24px;
  padding-right: 24px;
}
/* Force the two wrappers that nest grid + flex layouts under
   .key-form to min-width: 0, so the outer 1fr column's implicit
   `minmax(auto, 1fr)` doesn't expand past the padding-right: 24px
   edge. The chain ends at .duration-unit { min-width: 72px } deep
   inside the rate-limit popovers — without these clamps, the
   wrapper's width grows past the form's right padding and the
   popover trigger's underline + caret render outside the visible
   frame. Scoped to the two wrappers we know about (instead of a
   universal `.key-form > *`) so cds-input / cds-control web
   components keep their default min-width: auto and aren't
   accidentally flattened. */
.key-form > .rate-limit-control-group,
.key-form > .advanced-section {
  min-width: 0;
}
/* Force every cds-input and its underlying native <input> to span the
   full form width. Without this, cds-input collapses to its content
   width (browser default for inline-block inputs) — when 高级参数
   opens and the wider advanced grid reflows, sibling cds-input widths
   visibly grow with it. Pinning to 100% keeps every field row a
   stable width regardless of which sibling is open. */
.key-form cds-input,
.key-form cds-input > input,
.key-form cds-textarea,
.key-form cds-textarea > textarea {
  width: 100%;
  box-sizing: border-box;
}
/* Force every cds-input and the underlying native <input> to span the
   full form width. Without this, cds-input collapses to its content
   width (browser default) — when 高级参数 opens, the wider grid there
   reflows cds-input widths back across the form, so basic fields
   visibly grow with it. Pinning the width to 100% keeps every row
   stable regardless of which sibling is open. */
.key-form cds-input,
.key-form cds-input > input,
.key-form cds-textarea,
.key-form cds-textarea > textarea {
  width: 100%;
  box-sizing: border-box;
}
.section-label {
  display: block;
  margin-bottom: 6px;
  font-size: 13px;
  font-weight: 500;
}
/* Inline parenthetical hint for the 「选择可调用模型」 label. Renders
   the 「选择网关后加载可用模型」 caveat as a muted aside next to the
   field name, so the user doesn't have to scan below the chip
   cloud for the explanation. The smaller font + lighter color match
   the .allowed-routes-caption style used by the (接口权限) label
   further down in the form. */
.models-hint {
  margin-left: 4px;
  font-size: 12px;
  font-weight: 400;
  color: var(--cds-alias-typography-color-300, #565656);
}
/* Mark for backend-required fields (密钥名称 / 所属组织 / 模型网关 /
   可调用模型). Mirrors the .required-mark style used in
   ModelGatewayFormModal.vue / UserFormDialog.vue so all create-flow
   modals in the app share the same red-star UX. The crimson color
   and 0.7em size + negative top margin keep the asterisk floating
   just above the label cap-line without visually competing with
   the label text itself. */
.required-mark {
  color: var(--cds-alias-status-danger, #c21d00);
  font-size: 0.7em;
  font-weight: 700;
  line-height: 1;
  margin: -0.5em 0 0 1px;
  display: inline-block;
}
/* Gateway select — mirrors the 「新建模型」 form's two-column pattern
   (label left, select right) so the 「模型网关」 label is always visible
   and the field reads on the same horizontal axis as 所属组织 等表单字段。 */
.gateway-field {
  display: grid;
  grid-template-columns: auto 1fr;
  align-items: center;
  gap: 1.2rem;
}
.gateway-field.error .gateway-select {
  border-bottom-color: var(--cds-alias-status-danger, #c92100);
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
  background-position: calc(100% - 14px) 50%, calc(100% - 9px) 50%;
  background-size: 5px 5px, 5px 5px;
  background-repeat: no-repeat;
}
.gateway-select:focus {
  border-bottom: 1px solid var(--cds-focus, #0f62fe);
}
.gateway-select:disabled {
  cursor: not-allowed;
  color: var(--cds-alias-typography-color-300, #565656);
}
.gateway-hint {
  grid-column: 1 / -1;
  font-size: 12px;
  color: var(--cds-alias-typography-color-300, #565656);
  margin-top: 4px;
}
/* 可调用模型 picker — pill/chip style. The native checkbox is visually
   hidden; the pill's bg/border state is driven by the checkbox's
   `:checked` pseudo-class via the `:has()` parent selector. Keyboard and
   screen-reader accessibility are preserved (the input stays focusable
   and the surrounding <label> forwards clicks). */
.models-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  max-height: 200px;
  overflow-y: auto;
  padding: 12px;
  /* Pin to the form's content width so the grid keeps the modal's
     full width when no chips are present. Without this, an empty
     grid (no `.model-option` children to push the flex container
     wide) collapses to its min-content — a single `.model-empty`
     paragraph's intrinsic width, which is much narrower than the
     form — and the surrounding modal shrinks to fit. The chips
     case was the only thing keeping the grid wide before the dev
     seed list was removed. box-sizing: border-box so the 12px
     padding stays inside the form's right gutter instead of
     spilling past it.

     min-width: 750px is load-bearing here for a second reason: the
     single grid column inside .key-form takes its track width from
     the max min-content of its children — and a few of the siblings
     (cds-input, the gateway field) are web components whose host
     elements have a small min-content. The column would otherwise
     collapse to that smaller intrinsic width, and the form would
     not fill the dialog at lg size. Pushing the grid's min-width
     out to 750px (the dialog content area for `size="lg"` minus
     24px right padding) is the cleanest way to keep one row wide
     enough to drive the column open to the dialog edge without
     hardcoding the form's own width. The other rows (cds-input)
     follow via their existing `width: 100%` rule on .key-form
     cds-input. box-sizing: border-box + min-width are combined
     because min-width alone ignores padding when content is
     overflowing. */
  width: 100%;
  min-width: 750px;
  box-sizing: border-box;
  /* 浅蓝灰 hsl(198, 15%, 93%) 作为 chip 选择区背景 —— hue 198°
     偏冷,saturation 15% 极低,lightness 93% 接近白底,与
     light theme 整体节奏兼容,与高级参数 section 内 #f4f4f4
     的背景微妙区分但不刺眼,让「选择多个 model 的容器」与
     普通 cds-input 区在视觉上分开。 */
  background: hsl(198, 15%, 93%);
  border-radius: 4px;
}
.model-option {
  display: inline-flex;
  align-items: center;
  cursor: pointer;
  position: relative;
}
.model-option-input {
  /* Visually hidden but still focusable / screen-reader reachable. The
     input is absolutely positioned over its label so clicks land on it
     directly; the pill text is purely decorative. */
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  opacity: 0;
  cursor: pointer;
  margin: 0;
}
.model-option-pill {
  display: inline-flex;
  align-items: center;
  padding: 6px 12px;
  font-size: 13px;
  line-height: 1.2;
  border: 1px solid var(--cds-alias-object-border-color, #cbd4d8);
  border-radius: 999px;
  background: #ffffff;
  color: var(--cds-alias-object-app-foreground, #1b1b1b);
  user-select: none;
  transition: background-color 120ms ease, border-color 120ms ease,
    color 120ms ease;
}
/* Selected state — matches the "soft-tint pill" used elsewhere in the
   app (see SupplierModelView's status-filter chip): a low-saturation
   blue-50 fill with a muted info-blue border + text. Avoids the bright
   Carbon primary which reads as too loud against the neutral chrome.

   选中态加深:把填充 alpha 从 0.08 → 0.18 让 chip 背景蓝更明显、
   边框从 1px → 2px 加重视觉边界,使选中 model 在 chip 列表中
   一眼可辨。字色保持 #0079ad 不变(font-weight 500 不变),不会
   与未选中 chip 的中性灰文字形成突兀色差。 */
.model-option:has(.model-option-input:checked) .model-option-pill {
  background: hsl(198, 100%, 95%);
  border: 2px solid var(--cds-alias-status-info, #0079ad);
  color: var(--cds-alias-status-info, #0079ad);
  font-weight: 500;
  /* 2px 边框比未选中 pill 多 2px,把上下 padding 各减小 1px,
     让 chip 高度与未选中 chip 一致(避免选中后 chip 高度变化
     跳动)。 */
  padding: 5px 11px;
}
/* Hover / focus — only meaningful when the pill is unselected; the
   tinted state already reads as "on". */
.model-option:hover .model-option-pill {
  border-color: var(--cds-alias-status-info, #0079ad);
}
.model-option-input:focus-visible + .model-option-pill {
  outline: 2px solid var(--cds-alias-object-interaction-background-hover, #b6e3ff);
  outline-offset: 2px;
}
.model-empty {
  font-size: 12px;
  color: var(--cds-alias-typography-color-300, #565656);
  margin: 0;
  padding: 8px 4px;
}
/* 可调用模型 section 的错误态 — 与「模型网关」字段共用同一种视觉
   反馈：attempted 之后若用户没选模型，把 .models-grid 的边框从默认的
   中性灰换成 danger 红，让错误提示出现的位置 (grid 下方) 和视觉锚
   点 (grid 容器) 紧贴在一起。1px 实线 + box-sizing: border-box 配合
   上面的 width: 100% + box-sizing: border-box，避免因 border 出现而
   撑破 modal 的右内边距。 */
.models-field-error .models-grid {
  border: 1px solid var(--cds-alias-status-danger, #c92100);
}
/* Advanced section — bordered details/summary block whose chevron
   mirrors the 「新建模型」 modal (cds-icon shape="angle", direction
   driven by the open state). The default browser triangle is suppressed
   so the carbon icon is the sole visual indicator. */
.advanced-section {
  border: 1px solid var(--cds-alias-object-border-color, #e8e8e8);
  border-radius: 4px;
  /* Bottom padding is intentionally larger than the 8px top/sides
     padding so the last child (「允许所有接口 (接口权限)」) reads
     with a clear breathing gap from the section's bottom border.
     Without the extra inset, the toggle's bottom edge sits only
     8px above the border and the section feels bottom-heavy. 20px
     matches the section's outer rhythm and gives the toggle the
     same "inside the box" feel on the bottom as the summary has
     on the top. */
  padding: 8px 12px 20px;
}
/* Bump the gap between the 「高级参数」 summary and its first child
   row (「模型标签」). Without this padding the summary's text baseline
   sits flush against the input border and the section feels cramped
   on first open. 12px = the section's own horizontal padding doubled,
   so the summary-to-first-row breathing matches the visual weight of
   the section's left/right inset and reads as a uniform inner rhythm
   (rather than a small decorative gap). The `>` direct-child
   combinator scopes this to the section's own summary, not any
   nested <details> summaries (e.g. .rate-limit-popover) inside the
   section. */
.advanced-section > summary {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  font-weight: 500;
  list-style: none;
  padding-bottom: 12px;
}
.advanced-section > summary::-webkit-details-marker {
  display: none;
}
.advanced-toggle {
  display: flex;
  align-items: center;
  gap: 8px;
}
/* CSS-only chevron — drawn from a 2-border rotated square (the
   "border-triangle" trick). Was previously a <cds-icon shape="angle"
   :direction="…"> which crashed during HMR rerender with
   "Cannot read properties of null (reading 'flags')" — that error
   comes from lit-html's attribute serialization and the Carbon
   icon's LitElement instance losing its props in the HMR boundary.
   A pure CSS chevron sidesteps the issue entirely. */
.advanced-chevron {
  display: inline-block;
  width: 7px;
  height: 7px;
  border-right: 2px solid var(--cds-alias-object-app-foreground, #1b1b1b);
  border-bottom: 2px solid var(--cds-alias-object-app-foreground, #1b1b1b);
  transform: rotate(-45deg);
  transform-origin: 50% 50%;
  transition: transform 120ms ease;
  flex-shrink: 0;
  /* Center the visual weight of the rotated square inside its 7x7
     box so it doesn't look offset to the bottom-right. */
  margin-top: -2px;
}
.advanced-chevron--open {
  transform: rotate(45deg);
  margin-top: 2px;
}
/* Duration row: label (fixed-ish) + value input (1fr) + unit select
   (fixed-ish) on a single grid line. Mirrors the gateway field's
   auto/1fr two-column rhythm and stacks the helper message under the
   whole row (it spans both controls visually). Native underline-only
   styling keeps both controls visually consistent with the cds-input
   fields elsewhere in the form. */
.duration-field {
  display: grid;
  /* Stack the .duration-row on row 1 and the helper message on row 2.
     Column lines match .duration-row's auto/1fr/auto so the hint sits
     directly under the value input (column 2), not stretched across
     the whole field width. */
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
   <select>, so the two rows inside .budget-control-row share the
   same label / input vertical alignment. */
.duration-row--no-unit {
  grid-template-columns: auto minmax(0, 1fr);
}
.duration-hint {
  /* Sit under the value input (column 2), not under the unit select. */
  grid-column: 2;
  /* Sized to match the helper text under the rest of the form so the
     line break in 「留空表示永不过期,例如 30d」 matches neighbouring
     fields and the unit select stays visually anchored above. The
     :deep() descent lets the font-size + colour reach the text node
     inside cds-control-message's shadow DOM (without it the host
     element honors the local styles but the inner text still picks
     up the Carbon default size). */
  font-size: 12px;
  line-height: 1.4;
  color: var(--cds-alias-typography-color-300, #565656);
}
/* The 「留空表示永不过期,例如 30d」 helper is rendered as a
   <cds-control-message> web component; needs the 2.6rem indent to
   align under the value input column. Plain <p class="duration-hint">
   elements (e.g. the rate-limit-type option descriptions) skip this
   offset and start at the column-2 left edge. */
cds-control-message.duration-hint {
  margin-left: 2.6rem;
}
.duration-hint:deep(*) {
  font-size: inherit;
  color: inherit;
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
  /* `box-sizing: border-box !important` 是 load-bearing:
     Chrome 给 <input> 套了 user-agent shadow root,
     user-agent origin 把 box-sizing 强制设成 content-box 且带
     !important,优先级高于 author 普通规则。
     .duration-value 直接挂在 light DOM (不在任何 web component
     shadow 里),所以 user-agent 规则会作用,普通的
     `box-sizing: border-box` 没法 override。
     !important 让 author 优先级升到 user-agent !important 之上,
     `height: 24px` 锁住渲染高度(与 cds-input 24px 对齐)、
     不再因 padding+border 把 .duration-field grid 行撑高到 41px。
     cds-input 内部 input 不受影响,因为 Carbon web component
     shadow 里有 author-origin override。 */
  box-sizing: border-box !important;
  height: 24px;
  padding: 4px 8px;
  border: 0;
  /* 下边框深色 (#21333b) 与对话框底部的横线视觉一致 —— 强调
     "高级参数"section 内的次级控件边界,但不抢主输入的视觉重量。
     focus 态仍是 Carbon 蓝色 (var(--cds-focus)),保留键盘可访问性。 */
  border-bottom: 1px solid #21333b;
  border-radius: 0;
  background: transparent;
  color: var(--cds-alias-object-app-foreground, #1b1b1b);
  outline: none;
}
.duration-value:focus {
  /* focus 态用 1px #0079ad 色带覆盖原 1px #21333b 下边框,
     background-size: 100% 1px 让色带刚好占满 input 整宽 1px,
     视觉上是一条 #0079ad 横线(替代 border-bottom 颜色)。
     background-position: bottom 把色带贴底;用 background-image
     而不是直接改 border-bottom 颜色是为了避免与其他可能叠加
     在该位置的高亮(例如后续再加 hover/helper 提示)冲突。 */
  border-bottom: 1px solid #21333b;
  background-image: linear-gradient(#0079ad, #0079ad);
  background-size: 100% 1px;
  background-repeat: no-repeat;
  background-position: bottom;
}
.duration-unit {
  font: inherit;
  font-size: 14px;
  /* 与 .duration-value 同理:Chrome 给 <select> 也套了 user-agent
     shadow root,user-agent origin 把 box-sizing 强制设成
     content-box !important,普通 `box-sizing: border-box` 没法
     override。!important 让 `min-height: 24px` 锁住 24px 实际
     渲染高度(与 cds-input 24px 一致),避免 grid 行被撑高。 */
  box-sizing: border-box !important;
  min-height: 24px;
  min-width: 72px;
  padding: 4px 24px 4px 8px;
  border: 0;
  /* 与 .duration-value 同色 (#21333b),统一"高级参数"section 内
     这六个字段的下边框视觉;focus 态仍是 Carbon 蓝色。 */
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
  /* 与 .duration-value:focus 同视觉 —— 1px #0079ad 色带覆盖
     1px #21333b 下边框。需要重新声明下拉箭头 caret (linear-gradient
     三角形),否则 :focus 内 background-image 会覆盖普通态的
     箭头;CSS background-image 后写覆盖前写。 */
  border-bottom: 1px solid #21333b;
  background-image: linear-gradient(#0079ad, #0079ad),
    linear-gradient(45deg, transparent 50%, currentColor 50%),
    linear-gradient(135deg, currentColor 50%, transparent 50%);
  background-size: 100% 1px, 5px 5px, 5px 5px;
  background-position: bottom, calc(100% - 14px) 50%, calc(100% - 9px) 50%;
  background-repeat: no-repeat;
}
/* Full-width variant — used when a row has no value <input> next to the
   <select> (e.g. the rate-limit-type pickers: label + select only).
   Drops the min-width floor and stretches the select to fill the
   remaining grid column instead of sitting at its intrinsic 72px. */
.duration-unit--full {
  width: 100%;
  min-width: 0;
  flex: 1 1 auto;
}
/* Rate-limit popover — a custom <details> dropdown whose trigger
   button reuses .duration-unit visuals (border-bottom underline,
   caret, padding) and whose listbox renders each option as a
   vertical "title + description" block — exactly the LiteLLM picker
   UX. The popover is positioned absolutely under the trigger so the
   surrounding grid layout doesn't shift when the listbox opens. */
.rate-limit-popover {
  position: relative;
  display: block;
  width: 100%;
}
.rate-limit-popover > summary {
  list-style: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  cursor: pointer;
}
.rate-limit-popover > summary::-webkit-details-marker {
  display: none;
}
.rate-limit-popover-trigger {
  /* Trigger reuses .duration-unit but needs to behave like a button
     (clickable), not a select. Override the appearance resets and
     keep the underline look from .duration-unit. */
  appearance: none;
  -webkit-appearance: none;
  -moz-appearance: none;
  background: transparent;
  text-align: left;
  user-select: none;
}
.rate-limit-popover-trigger-text {
  flex: 1 1 auto;
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  /* 字体大小沿用父级 .duration-unit 的 14px(继承),与 cds-input
     输入文字(14px)节奏一致。之前显式设 13px 是为了让触发器
     "读起来像配置旋钮而不是主输入",但在和「每分钟 Tokens (tpm)」
     14px 输入左右对照后,这种小差异反而显得不整齐,去掉 override
     让两者节奏统一。 */
}
.rate-limit-popover-caret {
  flex: 0 0 auto;
  width: 7px;
  height: 7px;
  border-right: 2px solid var(--cds-alias-object-app-foreground, #1b1b1b);
  border-bottom: 2px solid var(--cds-alias-object-app-foreground, #1b1b1b);
  transform: rotate(45deg);
  transition: transform 120ms ease;
}
.rate-limit-popover[open] > summary .rate-limit-popover-caret {
  transform: rotate(-135deg);
}
/* Rate-limit popover — a custom <details> dropdown whose trigger
   button reuses .duration-unit visuals (border-bottom underline,
   caret, padding) and whose listbox renders each option as a
   vertical "title + description" block — exactly the LiteLLM picker
   UX.

   The list is `position: fixed` (not absolute) so it escapes any
   `overflow: auto` / `overflow: hidden` ancestor — most importantly
   the modal's own scroll container — which would otherwise clip the
   list at its bottom edge and HIDE the scrollbar, leaving the user
   unable to reach the lower options (e.g. 「动态」 for TPM/RPM).
   Fixed positioning also makes `max-height: 320px` + `overflow-y:
   auto` work as intended: the list caps at 320px tall and shows a
   scrollbar when its content overflows. Coordinates are supplied by
   inline style from JS (top / left / width), measured from the
   trigger's bounding rect — see measurePopoverPosition in the
   script section. */
.rate-limit-popover-list {
  position: fixed;
  /* Must sit above Clarity cds-modal's overlay (z-index 1000000 per
     ConfirmDialog.vue's comment) so the list is visible when it
     opens. The list is teleported to <body>, so it lives in the
     root stacking context — and a small z-index here would lose to
     the modal's overlay regardless of DOM order. 1100000 mirrors
     ConfirmDialog's own strategy for sibling modals. */
  z-index: 1100000;
  list-style: none;
  margin: 0;
  padding: 4px 0;
  background: #ffffff;
  border: 1px solid var(--cds-alias-object-border-color, #cbd4d8);
  border-radius: 4px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
  max-height: 320px;
  overflow-y: auto;
}
.rate-limit-popover-option {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 8px 12px;
  cursor: pointer;
  user-select: none;
}
.rate-limit-popover-option:hover {
  background: var(--cds-alias-object-app-background, #f4f4f4);
}
.rate-limit-popover-option--selected {
  background: var(--cds-alias-object-app-blue-50, rgba(0, 114, 163, 0.08));
}
.rate-limit-popover-option-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--cds-alias-object-app-foreground, #1b1b1b);
  line-height: 1.3;
}
.rate-limit-popover-option-desc {
  font-size: 10px;
  color: var(--cds-alias-typography-color-300, #565656);
  line-height: 1.45;
  white-space: normal;
}
.advanced-grid {
  display: grid;
  gap: 12px;
  grid-template-columns: 1fr 1fr;
  /* Push the rate-limit-control-group (设置限额) below us by 12px so
     「最大并发请求」 (last child of .advanced-grid) doesn't sit
     flush against the 「设置限额」 toggle — they read as distinct
     rows rather than a single cramped column. Pairs with
     .budget-control-group { margin-top: 12px } below to give all
     three advanced groups (rate-limit, budget, allowed-routes) a
     consistent 12px inter-group rhythm. */
  margin-bottom: 12px;
}
/* Tags is a free-form multi-token string — give it its own row that
   spans both columns of the advanced grid. Without this it'd share a
   row with budgetDuration and the placeholder text would be cut off. */
.advanced-grid .advanced-tags,
.advanced-tags {
  grid-column: 1 / -1;
}
/* Same full-row span as .advanced-tags — used for maxParallelRequests,
   which we want on its own line under 模型标签 (and not sharing a row
   with one of the rate-limit-type popovers, which would force the
   numeric input to fit in 50% width and feel cramped). */
.advanced-grid .advanced-full-row,
.advanced-full-row {
  grid-column: 1 / -1;
}
/* Auto-rotate group: toggle + (conditional) rotation interval stacked
   vertically. Lives outside 高级参数 now, so the previous `grid-column:
   1 / -1` (which forced full width inside advanced-grid) is no longer
   needed — the group is a top-level block child of .key-form. */
.auto-rotate-group {
  display: grid;
  gap: 8px;
}
/* Pull the toggle row back by 1.2rem so the 「自动轮换」 label lines up
   with the input border column, not the form's content edge. The
   negative offset matches the form's 1.2rem row-gap (set on
   .key-form, .duration-row, .gateway-field). */
.auto-rotate-toggle {
  margin-left: -1.2rem;
}
/* Budget control group: same 「toggle + 条件子字段」 pattern as the
   auto-rotate group above, but the two child inputs sit in their own
   2-column row (消费上限 | 预算周期) so they read as a paired "spending
   cap" control rather than two unrelated fields. Both controls reuse
   the form's 1.2rem column gap rhythm. */
.budget-control-group {
  display: grid;
  gap: 8px;
  /* Match the rhythm set by .advanced-grid { margin-bottom: 12px }
     above so 「设置限额」 (the sibling .rate-limit-control-group) and
     「预算控制」 (this toggle) read as two distinct control rows
     rather than one continuous block. Without this the two toggles
     sit flush against each other and the eye can't easily find the
     boundary between them. */
  margin-top: 12px;
}
.budget-control-toggle {
  margin-left: -1.2rem;
}
.budget-control-row {
  display: grid;
  /* 单列:每个字段各占一行。原本是两列(1fr 1fr)让 maxBudget 与
     budgetDuration 并排,但在中文标签下两列挤在同一行视觉负担较重,
     改为各占一行更易读。align-items: stretch 仍是 grid 默认,
     写出来明确意图。gap 8px 与 .rate-limit-control-list /
     .advanced-section padding 一致,保持高级参数 section 内的
     视觉节奏统一(单位字段不会再用 1.2rem 这种 grid 列间距)。 */
  grid-template-columns: 1fr;
  gap: 8px;
  /* Stretch both rows to the same column width — without this, the
     native input + select row (shorter) and the no-unit row (shorter)
     would render at their intrinsic widths and end up visually
     misaligned with each other. align-items: stretch is the grid
     default; spelled out here to keep the intent clear. */
  align-items: stretch;
}
/* Rate-limit control group: mirrors .budget-control-group's 「toggle +
   条件子字段」 pattern but lays the four children out as a 2-column ×
   2-row grid so the (type, value) pairs sit side-by-side rather than
   stacking into a tall column on the left. The toggle row gets the
   same negative indent as .budget-control-toggle so the labels line
   up under the form's content edge. */
.rate-limit-control-group {
  display: grid;
  gap: 8px;
  /* A small gap between the toggle and the 2x2 grid when expanded —
     same as .budget-control-group, which uses 8px. */
}
.rate-limit-control-toggle {
  margin-left: -1.2rem;
}
/* Rate-limit control list — outer wrapper that stacks the four
   rate-limit fields (TPM type, TPM value, RPM type, RPM value)
   vertically, one field per row, each spanning the full form
   width. 8px row-gap keeps the four fields visually grouped under
   the 「设置限额」 toggle without competing with the form's outer
   16px gap.

   `min-width: 0` is load-bearing: this wrapper lives inside
   `.rate-limit-control-group` (grid, single 1fr column), and the
   1fr column's implicit `minmax(auto, 1fr)` would otherwise expand
   to the children's intrinsic min-width — the chain ends at
   `.duration-unit { min-width: 72px }`, so without this override the
   wrapper's width grows past the form's right padding (the modal's
   padding-right: 24px edge) and the trigger underline of the inner
   `.rate-limit-type-field` rows renders outside the visible frame.
   Forcing min-width: 0 makes the grid track's 1fr the binding
   constraint, so each row's `minmax(0, 1fr)` inside the rate-limit
   type fields can clamp to the actual remaining column width. */
.rate-limit-control-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
}
/* Rate-limit type picker — label + trigger laid out side-by-side on a
   single grid row (auto / minmax(0, 1fr)), matching the .duration-row
   rhythm used by 有效时长 / 预算周期. The minmax(0, 1fr) on the
   trigger column is what keeps the popover's underline from
   overflowing the form's right padding: a plain 1fr would let the
   trigger inherit the form's full content width and extend past the
   modal's padding-right: 24px edge, while minmax(0, 1fr) clamps the
   column to whatever space remains after the label and the 1.2rem
   gap — so the trigger's right border lines up flush with the value
   input's right edge in the sibling .duration-row.

   The descendant overrides below (min-width: 0 on .rate-limit-popover
   + summary + the duration-unit trigger itself) are required for
   minmax(0, 1fr) to actually clamp the column: .duration-unit carries
   a min-width: 72px floor (set above for the time-unit picker), and
   .rate-limit-popover + summary default to min-width: auto, so the
   intrinsic minimum width of the trigger chain would otherwise push
   the column past 1fr and let the trigger's underline extend past
   the form's right padding. Forcing every link in the chain to
   min-width: 0 makes the grid track's minmax(0, ...) the binding
   constraint, so the column shrinks to whatever space remains. The
   label keeps its 12px muted style (set on .rate-limit-type-label
   below) so the rate-limit fields read as configuration knobs rather
   than primary input like the basic 有效时长 label (13px / 600). */
.rate-limit-type-field {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: center;
  column-gap: 1.2rem;
}
.rate-limit-type-field > .rate-limit-popover,
.rate-limit-type-field > .rate-limit-popover > summary,
.rate-limit-type-field > .rate-limit-popover > summary.duration-unit {
  min-width: 0;
  /* The trigger (a <summary class="duration-unit">) carries a
     padding-right: 24px inherited from .duration-unit (designed for
     the native <select> arrow room). Without box-sizing: border-box
     here, that padding sits OUTSIDE the grid track's measured width,
     so the trigger box renders 32px wider than the cell the
     minmax(0, 1fr) column allocated — visually the caret sits flush
     against the underline's right edge (instead of 24px inside it)
     and reads as "stuck to the wall". Switching to border-box forces
     the padding to count against the track width, so the trigger's
     right border lines up flush with its grid cell.

     `!important` is load-bearing here: the project ships a global
     `*, ::after, ::before { box-sizing: inherit !important }` reset
     (verified live via CDP `CSS.getMatchedStylesForNode` — the
     unscoped `*` selector with !important at specificity 0,1,0,0
     outranks any non-!important scoped rule that targets the same
     element, because scoped styles compile to `[data-v-xxx]`
     attribute selectors but `!important` flips the cascade
     regardless of specificity. Without `!important` here, our
     border-box gets ignored and the trigger inherits content-box
     from <html>'s user-agent default. With `!important`, our
     border-box wins and the padding stops overflowing the cell. */
  box-sizing: border-box !important;
}
.rate-limit-type-field > .rate-limit-popover {
  width: 100%;
}
.rate-limit-type-label {
  /* 与 cds-input label 同节奏 —— 13px / 600 / 默认前景色 #1b1b1b,
     让「TPM 限流模式」「RPM 限流模式」label 在视觉上与
     「每分钟 Tokens (tpm)」「每分钟 请求 (rpm)」cds-input label
     完全一致。原来是 12px / 500 / muted #565656,把这两个 label
     读成"次要配置说明",但同一 grid 里左右对照,读者会期望两者
     节奏一致,改为同 cds-input label 节奏后视觉更整齐。 */
  font-size: 13px;
  font-weight: 600;
  color: var(--cds-alias-object-app-foreground, #1b1b1b);
  cursor: pointer;
}
/* allowed_routes group — previously wrapped in a bordered
   <fieldset> + boxed <legend> that read as a sub-section header.
   Now it's a flat block that mirrors the .rate-limit-control-group /
   .budget-control-group layout: a single toggle row (with the section
   label inline as 「允许所有接口 (接口权限)」), optionally followed by
   a row of route-permission checkboxes. The 12px top margin keeps
   visual separation from the previous advanced block without drawing
   a border. */
.allowed-routes-group {
  margin: 12px 0 0 0;
}
/* Pull the toggle row back by 1.2rem so the 「允许所有接口」 label
   lines up with the other advanced toggles above (设置限额 /
   预算控制 — both use the same -1.2rem offset via
   .rate-limit-control-toggle / .budget-control-toggle). Before this
   rule was added, the toggle inherited cds-control's default
   left margin/padding and read as visibly indented to the right of
   its siblings. The previous <fieldset>+padding: 8px 12px chrome
   had produced the same alignment by accident — once the border was
   removed the alignment had to be reinstated explicitly. */
.allowed-routes-group cds-control {
  margin-left: -1.2rem;
}
/* Inline 「(接口权限)」 caption — dimmer + slightly smaller than the
   toggle label so the section identifier reads as a parenthetical
   aside rather than a competing primary label. */
.allowed-routes-caption {
  margin-left: 4px;
  font-size: 12px;
  font-weight: 400;
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