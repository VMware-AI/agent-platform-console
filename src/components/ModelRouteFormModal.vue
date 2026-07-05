<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useLocaleStore } from '@/stores/locale'
import ShuttleBox from '@/components/ShuttleBox.vue'
import type {
  ModelRouteGatewayOption,
  ModelRouteStrategy,
} from '@/types/model-route'
import { MODEL_ROUTE_STRATEGIES } from '@/types/model-route'
import { NODE_ID_PATTERN } from '@/types/supplier-model'
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
  // `status` is loosely typed (the candidate may be a ProviderModel,
  // a ModelRoute, or any future shape — this form only renders it as a
  // label + a coarse health dot). New ProviderModel API uses
  // `full_healthy | partial_outage | full_outage | unknown`; we accept
  // any string and gate the dot color on the legacy 4-bucket as a
  // best-effort. Anything unrecognized maps to neutral.
  status: string
}

// Form draft — emitted to the parent on submit. The parent maps this onto
// the GraphQL `CreateModelRouteInput` / `UpdateModelRouteInput` shape
// (largely the same). Exported so the parent can type its `submit` handler.
export interface ModelRouteFormDraft {
  name: string
  backendGatewayId: string
  gatewayName: string
  supportedModels: string[]
  uiStrategy: ModelRouteStrategy
  enabled: boolean
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
  // All model route aliases — used as the option list for the three
  // fallback multi-selects (design doc §3.2: 常规 / context_window /
  // content_policy fallbacks).
  allRoutes: { id: string; name: string }[]
  saving?: boolean
}>()

const emit = defineEmits<{
  (event: 'close'): void
  (event: 'submit', draft: ModelRouteFormDraft): void
}>()

const locale = useLocaleStore()
const name = ref('')
const gatewayId = ref('')
const strategy = ref<LoadBalancingStrategy>('SIMPLE_SHUFFLE')
const uiStrategy = ref<ModelRouteStrategy>('ROUND_ROBIN')
const selectedCandidates = ref<ShuttleCandidate[]>([])
const enabled = ref(true)
const showAdvanced = ref(false)
const attempted = ref(false)

// Three independent fallback chains. Each is a multi-select of other
// routes' model aliases (LiteLLM design doc §3.2).
const fallbacks = ref<string[]>([])
const contextWindowFallbacks = ref<string[]>([])
const contentPolicyFallbacks = ref<string[]>([])

const isEditing = computed(() => Boolean(props.route))

const nameValid = computed(() => NODE_ID_PATTERN.test(name.value.trim()))
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
  gatewayId.value = r?.backendGatewayId ?? props.gateways[0]?.id ?? ''
  strategy.value = (r?.strategy as LoadBalancingStrategy | undefined) ?? 'SIMPLE_SHUFFLE'
  uiStrategy.value = r?.uiStrategy ?? 'ROUND_ROBIN'
  // `supportedModels` carries the names of the supplier models that were
  // bound to the route. Find their current shuttle candidate rows so the
  // form pre-fills the right column. We rely on the parent passing the
  // candidate list with up-to-date names (the row is identified by name,
  // not id, because the GraphQL `supportedModels` is a string[]).
  const boundNames = new Set(r?.supportedModels ?? [])
  selectedCandidates.value = props.candidates.filter((c) => boundNames.has(c.name))
  enabled.value = r?.enabled ?? true
  fallbacks.value = r?.fallbacks ?? []
  contextWindowFallbacks.value = r?.contextWindowFallbacks ?? []
  contentPolicyFallbacks.value = r?.contentPolicyFallbacks ?? []
  attempted.value = false
  showAdvanced.value = Boolean(
    fallbacks.value.length ||
      contextWindowFallbacks.value.length ||
      contentPolicyFallbacks.value.length,
  )
}

watch(
  () => [props.open, props.route, props.gateways, props.candidates] as const,
  ([open]) => {
    if (open) reset()
  },
  { immediate: true },
)

function close() {
  if (!props.saving) emit('close')
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
    backendGatewayId: gateway.id,
    gatewayName: gateway.name,
    supportedModels,
    uiStrategy: uiStrategy.value,
    enabled: enabled.value,
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

    <cds-modal-content>
      <form class="route-form" @submit.prevent="submit">
        <!-- BASIC -->
        <cds-input :status="attempted && !nameValid ? 'error' : 'neutral'">
          <label>{{ locale.t('gatewayModel.form.name') }}</label>
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
        </cds-select>

        <div class="dual">
          <cds-select>
            <label>{{ locale.t('gatewayModel.form.strategy') }}</label>
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
          <cds-select>
            <label>{{ locale.t('gatewayModel.form.uiStrategy') }}</label>
            <select
              :value="uiStrategy"
              :aria-label="locale.t('gatewayModel.form.uiStrategy')"
              @change="
                uiStrategy = ($event.target as HTMLSelectElement).value as ModelRouteStrategy
              "
            >
              <option v-for="item in MODEL_ROUTE_STRATEGIES" :key="item" :value="item">
                {{ locale.t(`gatewayModel.strategy.${item}`) }}
              </option>
            </select>
          </cds-select>
        </div>

        <!-- SUPPLIER MODEL SHUTTLE (核心: 多对多节点聚合) -->
        <div>
          <label class="shuttle-section-label">
            {{ locale.t('gatewayModel.form.models') }}
          </label>
          <ShuttleBox
            v-model:selected="selectedCandidates"
            :candidates="candidates"
            :left-label="locale.t('gatewayModel.form.candidatesLabel')"
            :right-label="locale.t('gatewayModel.form.selectedLabel')"
          >
            <template #left-item="{ item }">
              <span class="shuttle-row">
                <span class="shuttle-name">{{ (item as ShuttleCandidate).name }}</span>
                <span class="shuttle-provider">{{ (item as ShuttleCandidate).provider }}</span>
                <cds-badge
                  :status="
                    (item as ShuttleCandidate).status === 'active'
                      ? 'success'
                      : (item as ShuttleCandidate).status === 'melted'
                        ? 'danger'
                        : (item as ShuttleCandidate).status === 'degraded'
                          ? 'warning'
                          : 'neutral'
                  "
                  class="shuttle-status"
                >
                  {{ (item as ShuttleCandidate).status }}
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
          <cds-control-message v-if="attempted && !modelsValid" status="error">
            {{ locale.t('gatewayModel.form.modelsError') }}
          </cds-control-message>
        </div>

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

        <!-- ADVANCED -->
        <details class="advanced-section" :open="showAdvanced">
          <summary>{{ locale.t('gatewayModel.form.advanced') }}</summary>
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
.dual {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}
.shuttle-section-label {
  display: block;
  margin-bottom: 6px;
  font-size: 13px;
  font-weight: 500;
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
.advanced-section summary {
  cursor: pointer;
  font-weight: 500;
  margin-bottom: 8px;
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
