<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useLocaleStore } from '@/stores/locale'
import ShuttleBox from '@/components/ShuttleBox.vue'
import type { ModelRouteGatewayOption } from '@/types/model-route'
import { MODEL_NAME_PATTERN } from '@/types/supplier-model'
import type { ProviderModelStatus } from '@/api/graphql/queries/supplier-models'
import {
  LOAD_BALANCING_STRATEGIES,
  type LoadBalancingStrategy,
} from '@/api/graphql/queries/model-routes'

// `ShuttleCandidate` is the shape each row in the shuttle listbox takes.
// We use this in lieu of the full ProviderModelNode when the form only
// needs the few fields the operator sees (name, provider, health). Keeping
// the type local means the form can be tested with stub candidates that
// don't depend on the supplier-models module's full surface. Provider is
// intentionally string-typed so the form doesn't fail typecheck when the
// GraphQL enum grows a new variant (the dropdown just lists whatever
// comes back).
interface ShuttleCandidate {
  id: string
  name: string
  provider: string
  // Mirrors ProviderModelNode.status (full_healthy | partial_outage |
  // full_outage | unknown). The shape is union-typed here rather than
  // `string` so healthBadgeStatus / healthBadgeIcon below stay exhaustive
  // — adding a new enum variant at the GraphQL boundary would surface as
  // a TS error in this file, which is the right failure mode.
  status: ProviderModelStatus
}

// Map the ProviderModelStatus enum onto the cds-badge `status` prop, matching
// the row badge in SupplierModelView so the operator sees the same color
// for the same backend health state across both pages.
function healthBadgeStatus(
  s: ProviderModelStatus,
): 'success' | 'warning' | 'danger' | 'neutral' {
  if (s === 'full_healthy') return 'success'
  if (s === 'partial_outage') return 'warning'
  if (s === 'full_outage') return 'danger'
  return 'neutral'
}

// Mirrors SupplierModelView's icon shape mapping: check-circle for healthy,
// ban for full outage, warning-standard for everything else (partial_outage
// + unknown).
function healthBadgeIcon(
  s: ProviderModelStatus,
): 'check-circle' | 'ban' | 'warning-standard' {
  if (s === 'full_healthy') return 'check-circle'
  if (s === 'full_outage') return 'ban'
  return 'warning-standard'
}

// Form draft — emitted to the parent on submit. The parent maps this
// onto the GraphQL `CreateModelRouteInput` / `UpdateModelRouteInput`
// shape. The previous `backendGatewayId` + `gatewayName` pair was a
// denormalized wire artifact; the current backend schema only carries
// `modelGatewayId` (the gateway is resolved server-side by id). The
// parent no longer needs the gateway name on the draft — it just looks
// it up from the gateways picker to populate `modelGatewayId`.
// Exported so the parent can type its `submit` handler.
export interface ModelRouteFormDraft {
  name: string
  modelGatewayId: string
  // Wire-level LoadBalancingStrategy (LiteLLM kebab-case on the wire;
  // UPPER_SNAKE here). Always sent — even on create the backend accepts
  // an explicit value, and silently dropping it on submit caused routes
  // to be created without a strategy and inherit the server-side
  // default (SIMPLE_SHUFFLE), which is fine for the first route but
  // hides what the operator actually picked in the form.
  strategy: LoadBalancingStrategy
  supportedModels: string[]
  fallbacks?: string[]
  contextWindowFallbacks?: string[]
  contentPolicyFallbacks?: string[]
}

const props = defineProps<{
  open: boolean
  route: import('@/api/graphql/queries/model-routes').ModelRouteNode | null
  gateways: ModelRouteGatewayOption[]
  // Candidate supplier models (left column of the shuttle). The parent
  // owns the fetch — typically from PROVIDER_MODELS_QUERY.
  candidates: readonly ShuttleCandidate[]
  // `true` while the parent's PROVIDER_MODELS_QUERY is in flight after a
  // gateway pick. Drives the "正在加载可用模型…" placeholder so the
  // empty state doesn't read as "暂无可用模型" mid-fetch.
  candidatesLoading?: boolean
  // All model route aliases — used as the option list for the three
  // fallback multi-selects (design doc §3.2: 常规 / context_window /
  // content_policy fallbacks).
  allRoutes: { id: string; name: string }[]
  saving?: boolean
}>()

const emit = defineEmits<{
  (event: 'close'): void
  (event: 'submit', draft: ModelRouteFormDraft): void
  // Fired whenever the operator changes the gateway picker. Parent uses
  // this to refetch the provider-model list for the new gateway — the
  // shuttle candidate set is gateway-scoped. The form itself drops any
  // already-picked candidates in the same handler so stale rows from the
  // previous gateway can't survive into the new selection.
  (event: 'gateway-changed', gatewayId: string): void
}>()

const locale = useLocaleStore()
const name = ref('')
const gatewayId = ref('')
const strategy = ref<LoadBalancingStrategy>('SIMPLE_SHUFFLE')
const selectedCandidates = ref<ShuttleCandidate[]>([])
const showAdvanced = ref(false)
const attempted = ref(false)

// Mid-edit "operator swapped the gateway" flag. Declared before
// `reset()` because the open/reset watch runs its `immediate` callback
// synchronously at registration time, and that callback invokes
// `reset()` — which reads `userTouchedGateway`. Hoisting the ref past
// `reset()` would silently work (function declarations are hoisted),
// but reading a `const` ref before its declaration hits Vue's TDZ
// guard at runtime. Declared here so reset() always sees the binding.
// See onFirstConfirm()/onGatewayChange() for the production read/write
// sites — the watch in the next block is the consumer.
const userTouchedGateway = ref(false)

// Three independent fallback chains. Each is a multi-select of other
// routes' model aliases (LiteLLM design doc §3.2).
const fallbacks = ref<string[]>([])
const contextWindowFallbacks = ref<string[]>([])
const contentPolicyFallbacks = ref<string[]>([])

const isEditing = computed(() => Boolean(props.route))

const nameValid = computed(() => {
  const trimmed = name.value.trim()
  return trimmed.length >= 2 && MODEL_NAME_PATTERN.test(trimmed)
})
const gatewayValid = computed(() =>
  props.gateways.some((gateway) => gateway.id === gatewayId.value),
)
const modelsValid = computed(() => selectedCandidates.value.length > 0)
const formValid = computed(
  () => nameValid.value && gatewayValid.value && modelsValid.value,
)

// Other routes' aliases, used to populate the three fallback multi-selects.
// We exclude the current route's own name (a route can't fall back to
// itself) — the parent supplies `allRoutes` so the form can do this
// without re-querying.
const fallbackOptions = computed(() => {
  const self = props.route?.name
  return props.allRoutes.filter((r) => r.name !== self)
})

function reset() {
  const r = props.route
  name.value = r?.name ?? ''
  // New routes default to NO gateway picked — mirrors VirtualKeyFormModal
    // (and the rest of the form modals in the console). Forcing the first
    // gateway as default caused "create" to silently inherit one operator
    // hadn't reviewed; now the placeholder option ("placeholder") shows
    // and validation catches an empty selection on submit.
  gatewayId.value = r?.modelGateway.id ?? ''
  strategy.value = (r?.strategy as LoadBalancingStrategy | undefined) ?? 'SIMPLE_SHUFFLE'
  // `supportedModels` carries the names of the supplier models that were
  // bound to the route. Find their current shuttle candidate rows so the
  // form pre-fills the right column. We rely on the parent passing the
  // candidate list with up-to-date names (the row is identified by name,
  // not id, because the GraphQL `supportedModels` is a string[]).
  const boundNames = new Set(r?.supportedModels ?? [])
  selectedCandidates.value = props.candidates.filter((c) => boundNames.has(c.name))
  fallbacks.value = r?.fallbacks ?? []
  contextWindowFallbacks.value = r?.contextWindowFallbacks ?? []
  contentPolicyFallbacks.value = r?.contentPolicyFallbacks ?? []
  attempted.value = false
  // Clear the mid-edit "operator swapped the gateway" flag — any value
  // it had from a previous edit session must not carry over, or the
  // candidates reconciliation would skip the just-reset right column
  // and re-introduce the empty-right-column bug.
  userTouchedGateway.value = false
  showAdvanced.value = Boolean(
    fallbacks.value.length ||
      contextWindowFallbacks.value.length ||
      contentPolicyFallbacks.value.length,
  )
}

// Reset the form on the false→true edge of `open`, and whenever the
// edited route reference changes (parent may switch which row is being
// edited without closing the modal — defensive against double-open).
//
// Explicitly NOT watching `props.candidates` or `props.gateways` here:
// picking a gateway triggers a refetch whose intermediate state briefly
// clears `candidates` (`providerResult.loading.value === true` ⇒ empty
// list in the parent). If we react to that, reset() runs again and
// overwrites the gatewayId the operator JUST picked, forcing them to
// pick it twice — the original symptom in the "model gateway first
// pick doesn't stick" bug.
watch(
  () => [props.open, props.route] as const,
  ([open]) => {
    if (open) reset()
  },
  { immediate: true },
)

// Reconcile `selectedCandidates` against the latest candidates list
// in EDIT mode, AFTER the gateway-scoped refetch has settled.
//
// The edit-mode reset() pre-fills `selectedCandidates` from the route's
// `supportedModels`, but `props.candidates` may not have arrived yet at
// that moment — the parent triggers the gateway-scoped refetch in
// response to `openEdit()`, and while `useQuery.loading === true` the
// parent passes `[]` as `candidates`. reset() then sets
// `selectedCandidates = []` because there's nothing to filter against,
// and once candidates land later the right column stays empty (the
// route's bound models appear in the left column instead — the bug
// reported in the "编辑" screenshot).
//
// Watching candidates and re-applying the bound-name match closes that
// race: by the time candidates arrive, selectedCandidates is rebuilt
// from the bound names → the bound rows move to the right column where
// the operator expects them.
//
// `userTouchedGateway` short-circuits the reconciliation after the
// operator changes the gateway picker mid-edit — onGatewayChange()
// clears selectedCandidates explicitly, and we don't want the
// refetch-driven candidates update to re-inject the route's original
// `supportedModels` (those belong to the previous gateway). The flag
// is reset on the next candidates update so a follow-up edit re-syncs
// from the route's bound list again.
//
// CREATE mode is intentionally NOT reconciled here. The operator
// drives the shuttle directly in that flow, and any background
// candidates refetch (e.g. a sibling provider-model mutation in
// another view invalidating the cache) would silently wipe their
// in-progress picks.
watch(
  () => props.candidates,
  (next) => {
    if (!props.route) return
    if (userTouchedGateway.value) {
      userTouchedGateway.value = false
      return
    }
    const boundNames = new Set(props.route.supportedModels)
    selectedCandidates.value = next.filter((c) => boundNames.has(c.name))
  },
)

function close() {
  if (!props.saving) emit('close')
}

// Gateway picker change. The model list is gateway-scoped, so any models
// already in the right column are now from the wrong gateway — drop them
// before signalling the parent to refetch the new gateway's candidates.
// Empty-string gatewayId is treated as "no gateway" (the placeholder
// option) — the parent skips the query and the shuttle empties out.
function onGatewayChange(event: Event) {
  const id = (event.target as HTMLSelectElement).value
  gatewayId.value = id
  selectedCandidates.value = []
  // Block the candidates reconciliation watch from re-injecting the
  // route's original supportedModels when the new gateway's model
  // list arrives — the operator just chose a different gateway and
  // any pre-fill from `props.route` is now stale. The flag is cleared
  // by the watch on the next candidates tick (see above).
  userTouchedGateway.value = true
  emit('gateway-changed', id)
}

function toggleFallback(kind: 'general' | 'context' | 'content', routeName: string) {
  const target =
    kind === 'general'
      ? fallbacks
      : kind === 'context'
        ? contextWindowFallbacks
        : contentPolicyFallbacks
  const i = target.value.indexOf(routeName)
  if (i === -1) target.value = [...target.value, routeName]
  else target.value = target.value.filter((_, idx) => idx !== i)
}

function submit() {
  attempted.value = true
  if (!formValid.value || props.saving) return
  const gateway = props.gateways.find((item) => item.id === gatewayId.value)
  if (!gateway) return
  const supportedModels = selectedCandidates.value.map((c) => c.name)
  emit('submit', {
    name: name.value.trim(),
    modelGatewayId: gateway.id,
    strategy: strategy.value,
    supportedModels,
    fallbacks: fallbacks.value.length > 0 ? fallbacks.value : undefined,
    contextWindowFallbacks:
      contextWindowFallbacks.value.length > 0 ? contextWindowFallbacks.value : undefined,
    contentPolicyFallbacks:
      contentPolicyFallbacks.value.length > 0 ? contentPolicyFallbacks.value : undefined,
  })
}



</script>

<template>
  <cds-modal :hidden="!open" :closable="!saving" size="lg" @closeChange="close">
    <cds-modal-header>
      <h2 cds-text="title" class="modal-title">
        {{ locale.t(isEditing ? 'gatewayModel.form.editTitle' : 'gatewayModel.form.createTitle') }}
      </h2>
    </cds-modal-header>

    <cds-modal-content class="route-modal-content">
      <form class="route-form" @submit.prevent="submit">
        <!-- BASIC -->
        <cds-input :status="attempted && !nameValid ? 'error' : 'neutral'">
          <label>
            {{ locale.t('gatewayModel.form.name') }}
            <sup class="required-mark" aria-hidden="true">
              {{ locale.t('gatewayModel.form.requiredMark') }}
            </sup>
          </label>
          <input
            :value="name"
            maxlength="64"
            autocomplete="off"
            :readonly="isEditing"
            :placeholder="locale.t('gatewayModel.form.namePlaceholder')"
            @input="name = ($event.target as HTMLInputElement).value"
          />
          <cds-control-message v-if="attempted && !nameValid" status="error">
            {{ locale.t('gatewayModel.form.nameError') }}
          </cds-control-message>
          <cds-control-message v-else status="neutral">
            {{ locale.t('gatewayModel.form.nameHint') }}
          </cds-control-message>
        </cds-input>

        <div class="field-with-label">
          <span class="field-label">
            {{ locale.t('gatewayModel.form.gateway') }}
            <sup class="required-mark" aria-hidden="true">
              {{ locale.t('gatewayModel.form.requiredMark') }}
            </sup>
          </span>
          <cds-select :status="attempted && !gatewayValid ? 'error' : 'neutral'">
            <select
              :value="gatewayId"
              :aria-label="locale.t('gatewayModel.form.gateway')"
              @change="onGatewayChange"
            >
              <option value="">
                {{ locale.t('gatewayModel.form.gatewayPlaceholder') }}
              </option>
              <option v-for="gateway in gateways" :key="gateway.id" :value="gateway.id">
                {{ gateway.name }}
              </option>
            </select>
          </cds-select>
        </div>

        <!-- 策略 (LiteLLM 网关层负载均衡) -->
        <div class="field-with-label">
          <span class="field-label">
            {{ locale.t('gatewayModel.form.strategy') }}
            <sup class="required-mark" aria-hidden="true">
              {{ locale.t('gatewayModel.form.requiredMark') }}
            </sup>
          </span>
          <cds-select>
            <select
              :value="strategy"
              :aria-label="locale.t('gatewayModel.form.strategy')"
              @change="
                strategy = ($event.target as HTMLSelectElement).value as LoadBalancingStrategy
              "
            >
              <option
                v-for="item in LOAD_BALANCING_STRATEGIES"
                :key="item"
                :value="item"
              >
                {{ locale.t(`gatewayModel.strategy.${item}`) }}
              </option>
            </select>
          </cds-select>
        </div>

        <!-- SUPPLIER MODEL SHUTTLE (核心: 多对多节点聚合) -->
        <div>
          <label class="shuttle-section-label">
            {{ locale.t('gatewayModel.form.models') }}
            <sup class="required-mark" aria-hidden="true">
              {{ locale.t('gatewayModel.form.requiredMark') }}
            </sup>
          </label>
          <ShuttleBox
            v-model:selected="selectedCandidates"
            :candidates="candidates"
            :loading="candidatesLoading"
            :left-label="locale.t('gatewayModel.form.candidatesLabel')"
            :right-label="locale.t('gatewayModel.form.selectedLabel')"
          >
            <template #left-item="{ item }">
              <span class="shuttle-row">
                <span class="shuttle-name">{{ (item as ShuttleCandidate).name }}</span>
                <span class="shuttle-provider">{{ (item as ShuttleCandidate).provider }}</span>
                <cds-badge
                  :status="healthBadgeStatus((item as ShuttleCandidate).status)"
                  class="shuttle-status"
                >
                  <cds-icon
                    :shape="healthBadgeIcon((item as ShuttleCandidate).status)"
                    size="sm"
                    aria-hidden="true"
                  ></cds-icon>
                  {{ locale.t(`supplier.status.${(item as ShuttleCandidate).status}`) }}
                </cds-badge>
              </span>
            </template>
            <template #right-item="{ item }">
              <span class="shuttle-row">
                <span class="shuttle-name">{{ (item as ShuttleCandidate).name }}</span>
                <span class="shuttle-provider">{{ (item as ShuttleCandidate).provider }}</span>
              </span>
            </template>
          </ShuttleBox>
          <!-- Empty-state hint: distinguishes "operator hasn't picked a
               gateway yet" (no fetch in flight) from "operator picked a
               gateway but it returned zero models" (fetch done, empty
               result). Both are recoverable; the first is the form's
               normal starting state, the second is a real "this gateway
               has nothing to bind" signal. -->
          <p v-if="!gatewayId" class="shuttle-hint">
            {{ locale.t('gatewayModel.form.modelsEmpty') }}
          </p>
          <p
            v-else-if="!candidatesLoading && candidates.length === 0"
            class="shuttle-hint"
          >
            {{ locale.t('gatewayModel.form.modelsEmptyAfterPick') }}
          </p>
          <cds-control-message v-if="attempted && !modelsValid" status="error">
            {{ locale.t('gatewayModel.form.modelsError') }}
          </cds-control-message>
        </div>

        <!-- ADVANCED (LiteLLM design doc §3.2 fallback chains) — chevron
             mirrors the 「颁发密钥」 modal: CSS-drawn rotated square that
             flips between right (collapsed) and down (expanded) via the
             `open` reflected back from the <details> toggle event. -->
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
            <span>{{ locale.t('gatewayModel.form.advanced') }}</span>
          </summary>
          <div class="advanced-grid">
            <!-- 常规 fallback -->
            <fieldset class="fallback-set">
              <legend>{{ locale.t('gatewayModel.fallbacks.general') }}</legend>
              <p class="fallback-hint">{{ locale.t('gatewayModel.fallbacks.generalHint') }}</p>
              <div class="fallback-options">
                <label
                  v-for="opt in fallbackOptions"
                  :key="`g-${opt.id}`"
                  class="fallback-option"
                >
                  <input
                    type="checkbox"
                    :checked="fallbacks.includes(opt.name)"
                    @change="toggleFallback('general', opt.name)"
                  />
                  <span>{{ opt.name }}</span>
                </label>
                <p v-if="fallbackOptions.length === 0" class="fallback-empty">
                  {{ locale.t('gatewayModel.fallbacks.empty') }}
                </p>
              </div>
            </fieldset>

            <!-- 上下文降级 -->
            <fieldset class="fallback-set">
              <legend>{{ locale.t('gatewayModel.fallbacks.context') }}</legend>
              <p class="fallback-hint">{{ locale.t('gatewayModel.fallbacks.contextHint') }}</p>
              <div class="fallback-options">
                <label
                  v-for="opt in fallbackOptions"
                  :key="`c-${opt.id}`"
                  class="fallback-option"
                >
                  <input
                    type="checkbox"
                    :checked="contextWindowFallbacks.includes(opt.name)"
                    @change="toggleFallback('context', opt.name)"
                  />
                  <span>{{ opt.name }}</span>
                </label>
              </div>
            </fieldset>

            <!-- 内容策略降级 -->
            <fieldset class="fallback-set">
              <legend>{{ locale.t('gatewayModel.fallbacks.content') }}</legend>
              <p class="fallback-hint">{{ locale.t('gatewayModel.fallbacks.contentHint') }}</p>
              <div class="fallback-options">
                <label
                  v-for="opt in fallbackOptions"
                  :key="`p-${opt.id}`"
                  class="fallback-option"
                >
                  <input
                    type="checkbox"
                    :checked="contentPolicyFallbacks.includes(opt.name)"
                    @change="toggleFallback('content', opt.name)"
                  />
                  <span>{{ opt.name }}</span>
                </label>
              </div>
            </fieldset>
          </div>
        </details>
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
        {{ locale.t(isEditing ? 'gatewayModel.form.submit' : 'gatewayModel.form.submitCreate') }}
      </cds-button>
    </cds-modal-actions>
  </cds-modal>
</template>

<style scoped>
/* Modal uses cds' native size="lg" (~691px wide) so the dialog is
   responsive to the form content. The form's right-gutter problem is
   inside modal-content — see route-form rules below. */
.modal-title {
  margin: 0;
}
/* modal-content's host element is a custom element (no shadow layout
   rules of its own) that contains a single child — our <form>. By
   default a custom element is `display: inline` and `width: auto`,
   which causes the form to size to its content (~480px) instead of
   filling modal-body's available width (~640px). Forcing it to
   display: block + width: 100% lets modal-body's p-x:lg padding do
   its job and the form to span the full dialog content area. */
.route-modal-content {
  display: block;
  width: 100%;
  box-sizing: border-box;
}
/* Fill the modal horizontally and indent both edges 24px so field
   labels no longer share the modal title's left edge (at lg width
   that edge feels cramped) and the form's last input doesn't sit
   flush against the modal's right edge. Mirrors .key-form in
   VirtualKeyFormModal.vue — a left margin (not max-width) keeps the
   indent predictable and matches the "start after the title" rhythm.
   NOTE: this introduces a 24px right gutter on the shuttle row
   (the modal's only wide row); accepted as a consistency cost so
   this modal matches VirtualKeyFormModal.vue. */
.route-form {
  display: grid;
  gap: 16px;
  margin-left: 24px;
  padding-right: 48px;
  /* Force the form to fill its parent — without width: 100%, an
     auto-width grid container shrinks to fit its content (min-content),
     which here is dictated by the .field-with-label rows at
     120 + gap + 394 ≈ 526px. The parent (cds-modal-content's inner
     div, cds-layout="vertical" → display: flex) does NOT stretch
     grid children via align-items: stretch in the same way it
     stretches block children, so we have to be explicit. With this
     rule the form spans the full dialog content area (≈ 658px on
     size="lg") and the right gutter disappears. */
  width: 100%;
  box-sizing: border-box;
  grid-template-columns: minmax(0, 1fr);
}
.route-form > * {
  min-width: 0;
  width: 100%;
  box-sizing: border-box;
}
/* Force every cds-input and its underlying native <input>, and every
   cds-select, to span the full form width. Without this, the cds web
   components collapse to their content width (browser default for
   inline-block form controls) and the layout looks ragged against the
   modal's right edge. Pinning to 100% keeps every field row a stable
   width. Mirrors the same rule on .key-form in
   VirtualKeyFormModal.vue. */
.route-form cds-input,
.route-form cds-input > input,
.route-form cds-select,
.route-form cds-select > select,
.route-form cds-control {
  width: 100%;
  box-sizing: border-box;
}
/* cds-select inside a .field-with-label wrapper must still span the
   full form width — without this the select collapses to its content
   width and the label/select column misaligns with sibling cds-input
   rows above and below. */
.field-with-label > cds-select {
  width: 100%;
  box-sizing: border-box;
}
.shuttle-section-label {
  display: block;
  margin-bottom: 6px;
  font-size: 13px;
  font-weight: 500;
}
/* Required-field red star. Mirrors VirtualKeyFormModal's `.required-mark`
   so all create-flow modals share the same red-asterisk UX (crimson,
   0.7em, negative top margin to keep the glyph floating just above
   the label cap-line). The mark is purely decorative — the
   `aria-hidden="true"` on the `<sup>` keeps it out of the
   screen-reader announcement; the placeholder / validation message
   still tells the operator the field is required. */
.required-mark {
  color: var(--cds-alias-status-danger, #c21d00);
  font-size: 0.7em;
  font-weight: 700;
  line-height: 1;
  margin: -0.5em 0 0 1px;
  display: inline-block;
}
/* Empty-state hint rendered under the shuttle when the operator hasn't
   picked a gateway yet, or picked one that returns no models. Sits
   between the shuttle and the validation message — visually quieter
   than either, since it's informational ("fix the form") rather than
   a hard error. */
.shuttle-hint {
  margin: 8px 0 0;
  font-size: 12px;
  color: var(--cds-alias-typography-color-300, #565656);
}
/* External label + cds-select wrapper. cds-select's shadow DOM does
   NOT render a slotted <label> (verified in
   node_modules/@cds/core/select/select.element.js — the element has
   no label handling at all, unlike cds-input which does). The only
   way to get a visible label is to place it OUTSIDE cds-select, the
   same workaround SupplierModelFormModal.vue uses for its provider
   picker. Inline row (label left of select) per the form author's
   decision — the label shrinks to its own content width so the
   select box left edge starts where the cds-input row above does
   (label sits inside cds-input's slotted <label>). Without this the
   fixed 120px label column pushes the select visibly right of the
   other fields' input boxes. */
.field-with-label {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 1.2rem;
  min-width: 0;
}
.field-label {
  flex-shrink: 0;
  font-size: 13px;
  font-weight: 500;
  color: var(--cds-alias-typography-color-300, #565656);
}
.shuttle-row {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  width: 100%;
}
.shuttle-name {
  font-weight: 500;
}
.shuttle-provider {
  color: var(--cds-alias-typography-color-300, #565656);
  font-size: 12px;
  text-transform: lowercase;
}
.shuttle-status {
  margin-left: auto;
  text-transform: capitalize;
  font-size: 11px;
}
.advanced-section {
  border: 1px solid var(--cds-alias-object-border-color, #e8e8e8);
  border-radius: 4px;
  padding: 8px 12px;
}
.advanced-section > summary {
  display: flex;
  align-items: center;
  cursor: pointer;
  font-weight: 500;
  margin-bottom: 8px;
  list-style: none;
  /* Give the rotated chevron enough vertical room so its top isn't
     clipped by the summary's content box. Mirrors the implicit
     vertical space VirtualKeyFormModal gets from its default
     list-item summary padding. */
  padding-top: 2px;
  padding-bottom: 2px;
  min-height: 18px;
}
.advanced-section > summary::-webkit-details-marker {
  display: none;
}
/* Same chevron pattern as VirtualKeyFormModal — a CSS-drawn rotated
   square that flips direction between right (collapsed) and down
   (expanded), synced to <details> `open`. Sizing (7x7 box + 2px
   borders, no extra padding) matches VirtualKeyFormModal exactly so
   the two chevrons read at the same visual size and stroke length. */
.advanced-toggle {
  display: flex;
  align-items: center;
  gap: 12px;
}
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
  /* Optical centering inside the 7x7 box — the rotated-square glyph
     only fills the bottom-right quadrant, so this lifts the visual
     weight up 2px to match the eye's expectation of centered. */
  margin-top: -2px;
}
.advanced-chevron--open {
  transform: rotate(45deg);
  margin-top: 2px;
}
.advanced-grid {
  display: grid;
  gap: 12px;
}
.fallback-set {
  border: 1px solid var(--cds-alias-object-border-color, #e8e8e8);
  border-radius: 4px;
  padding: 8px 12px;
  margin: 0;
}
.fallback-set legend {
  font-size: 12px;
  padding: 0 6px;
  color: var(--cds-alias-typography-color-300, #565656);
}
.fallback-hint {
  font-size: 12px;
  color: var(--cds-alias-typography-color-300, #565656);
  margin: 0 0 6px 0;
}
.fallback-options {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 12px;
  max-height: 140px;
  overflow-y: auto;
}
.fallback-option {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
}
.fallback-empty {
  font-size: 12px;
  color: var(--cds-alias-typography-color-300, #565656);
  margin: 0;
}
</style>
