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
  duration?: string
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
  // keyType is intentionally absent — the postman `IssueVirtualKey`
  // mutation always receives a fixed `default` value (see VirtualKeyView
  // submitKey), so there is no UI-driven variation to carry in the draft.
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
const autoRotate = ref(false)
const rotationInterval = ref('')

// allowed_routes Switch + multi-select
const allowAllRoutes = ref(true)
const allowedRoutePermissions = ref<RoutePermission[]>([])

const attempted = ref(false)

const nameValid = computed(() => {
  const length = name.value.trim().length
  return length >= 2 && length <= 64
})
const orgValid = computed(() => organizationId.value.trim().length > 0)
const gatewayValid = computed(() =>
  props.gateways.some((gateway) => gateway.id === modelGateway.value),
)
const allowedRoutesValid = computed(
  () => allowAllRoutes.value || allowedRoutePermissions.value.length > 0,
)
const formValid = computed(
  () => nameValid.value && orgValid.value && gatewayValid.value && allowedRoutesValid.value,
)

function reset() {
  name.value = ''
  organizationId.value = ''
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
  duration.value = ''
  maxBudget.value = null
  budgetDuration.value = ''
  maxParallelRequests.value = null
  tpmLimit.value = null
  rpmLimit.value = null
  rpmLimitType.value = ''
  tpmLimitType.value = ''
  tagsText.value = ''
  blocked.value = false
  autoRotate.value = false
  rotationInterval.value = ''
  allowAllRoutes.value = true
  allowedRoutePermissions.value = []
  attempted.value = false
  showAdvanced.value = false
  // Make sure the parent's `availableModels` query re-fires for the
  // restored gateway (Apollo may have evicted the previous result, or
  // the parent may not have set `formGateway` if this is the very first
  // open and `initialModelGateway` was empty).
  if (restored) emit('gateway-changed', restored)
}

watch(
  () => [props.open, props.gateways, props.initialModelGateway] as const,
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
    duration: duration.value.trim() || undefined,
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

        <div
          class="gateway-field"
          :class="{ error: attempted && !gatewayValid }"
        >
          <label for="vk-gateway-select" class="gateway-label">
            {{ locale.t('virtualKey.form.gateway') }}
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
             the gateway's live model list, so stale names 400. -->
        <div>
          <label class="section-label">{{ locale.t('virtualKey.form.models') }}</label>
          <div class="models-grid">
            <label v-for="model in availableModels" :key="model" class="model-option">
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
          <cds-control-message status="neutral">
            {{ locale.t('virtualKey.form.modelsHint') }}
          </cds-control-message>
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
            <cds-icon
              shape="angle"
              :direction="showAdvanced ? 'down' : 'right'"
              size="sm"
            ></cds-icon>
            <span>{{ locale.t('virtualKey.form.advanced') }}</span>
          </summary>

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
            <div class="auto-rotate-group">
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
              <cds-input v-if="autoRotate">
                <label>{{ locale.t('virtualKey.form.rotationInterval') }}</label>
                <input
                  :value="rotationInterval"
                  :placeholder="locale.t('virtualKey.form.rotationIntervalPlaceholder')"
                  @input="rotationInterval = ($event.target as HTMLInputElement).value"
                />
              </cds-input>
            </div>
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
/* Indent the form body inside the lg modal so field labels no longer
   share the modal title's left edge (at lg width, that edge feels
   cramped). A fixed left margin (not max-width) keeps the indent
   predictable and matches the "start after the title" rhythm. */
.key-form {
  display: grid;
  gap: 16px;
  margin-left: 24px;
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
  background: var(--cds-alias-object-app-background, #f4f4f4);
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
   Carbon primary which reads as too loud against the neutral chrome. */
.model-option:has(.model-option-input:checked) .model-option-pill {
  background: var(--cds-alias-object-app-blue-50, rgba(0, 114, 163, 0.08));
  border-color: var(--cds-alias-status-info, #0079ad);
  color: var(--cds-alias-status-info, #0079ad);
  font-weight: 500;
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
/* Advanced section — bordered details/summary block whose chevron
   mirrors the 「新建模型」 modal (cds-icon shape="angle", direction
   driven by the open state). The default browser triangle is suppressed
   so the carbon icon is the sole visual indicator. */
.advanced-section {
  border: 1px solid var(--cds-alias-object-border-color, #e8e8e8);
  border-radius: 4px;
  padding: 8px 12px;
}
.advanced-section summary {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  font-weight: 500;
  list-style: none;
}
.advanced-section summary::-webkit-details-marker {
  display: none;
}
.advanced-toggle {
  display: flex;
  align-items: center;
  gap: 8px;
}
.advanced-toggle > cds-icon {
  display: inline-flex;
  flex-shrink: 0;
}
.advanced-grid {
  display: grid;
  gap: 12px;
  grid-template-columns: 1fr 1fr;
}
/* Auto-rotate group wraps the toggle + (conditional) interval input so
   they stack vertically AND occupy the full width of the 2-col advanced
   grid — the interval field would otherwise get pushed into column 2. */
.auto-rotate-group {
  grid-column: 1 / -1;
  display: grid;
  gap: 8px;
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