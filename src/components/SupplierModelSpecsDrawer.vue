<script setup lang="ts">
import { ref, watch } from 'vue'
import { apolloClient } from '@/api/graphql/client'
import { useLocaleStore } from '@/stores/locale'
import { useToast } from '@/composables/useToast'
import { graphqlErrorMessage } from '@/api/graphql/errors'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import {
  BLOCK_PROVIDER_MODEL_SPEC,
  DELETE_PROVIDER_MODEL_SPEC,
  ADD_PROVIDER_MODEL_SPEC,
  REFRESH_PROVIDER_MODEL_STATUS,
  TEST_PRIVATE_MODEL_SPEC_CONNECTION,
  type ProviderModelNode,
  type ModelSpec,
  type BlockProviderModelSpecVars,
  type BlockProviderModelSpecResult,
  type DeleteProviderModelSpecVars,
  type DeleteProviderModelSpecResult,
  type AddProviderModelSpecVars,
  type AddProviderModelSpecResult,
  type RefreshProviderModelStatusVars,
  type RefreshProviderModelStatusResult,
  type TestPrivateModelSpecConnectionResult,
  type TestPrivateModelSpecConnectionVars,
} from '@/api/graphql/queries/supplier-models'
import {
  PROVIDER_OPTIONS,
  PROVIDER_DEFAULT_API_BASE,
  PROVIDER_CUSTOM,
  type ProviderOption,
} from '@/types/supplier-model'

const props = defineProps<{
  open: boolean
  model: ProviderModelNode | null
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'changed'): void
}>()

const locale = useLocaleStore()
const toast = useToast()

const pendingDeleteSpec = ref<ModelSpec | null>(null)
const addModalOpen = ref(false)
// `addAttempt` toggles error borders on the add-spec modal — mirrors
// SupplierModelFormModal.attemptSpecs pattern: stays false until the
// user clicks submit, then surfaces inline errors instead of toasting.
const addAttempt = ref(false)
// `addSaving` disables the submit button during the in-flight mutation
// so the user can't double-click and create duplicate specs.
const addSaving = ref(false)
// Per-spec probe state — mirrors the spec-form pattern but scoped to the
// single draft being added, so no per-index record is needed.
const addTesting = ref(false)
const addTestStatus = ref<'success' | 'failure' | null>(null)
const addTestMessage = ref('')
// Successful probe populates this list — the model input then offers it
// as a <datalist> suggestion while staying free-form.
const addModelList = ref<string[]>([])
const newSpec = ref({
  model: '',
  providerSelect: '',
  providerCustom: '',
  apiKey: '',
  apiBase: '',
})

// Resolves the effective provider string for the add modal — same shape
// as SupplierModelFormModal.effectiveProvider(), scoped to this modal's
// local state.
function effectiveProvider(): string {
  return newSpec.value.providerSelect === PROVIDER_CUSTOM
    ? newSpec.value.providerCustom.trim()
    : newSpec.value.providerSelect
}

// Same auto-fill logic as the form: when a predefined provider is
// selected, fill apiBase with the default URL. Custom / '' leave it.
function onProviderChange(ev: Event) {
  const next = (ev.target as HTMLSelectElement).value
  newSpec.value.providerSelect = next
  if (next === '' || next === PROVIDER_CUSTOM) return
  if ((PROVIDER_OPTIONS as readonly string[]).includes(next)) {
    newSpec.value.apiBase = PROVIDER_DEFAULT_API_BASE[next as ProviderOption]
  }
}

// Local mirror of spec.blocked values, populated from props.model on
// each prop update. We can't write back to props.model directly:
// Apollo's useQuery returns a frozen reactive Proxy after refetch
// (Vue 3 / Apollo strict mode), so mutating spec.modelInfo.blocked
// throws `Cannot assign to read only property 'blocked'`. Instead the
// UI reads from this mirror (with the props value as fallback for any
// spec the mirror doesn't yet cover), and toggles update the mirror.
// The mirror is reconciled against props.model every time the model
// prop changes, so server values flow back after refetch.
//
// Reconciliation is gated by an in-flight set so a stale props snapshot
// (e.g. emitted right after optimistic write but before refetch
// completes — Vue emits `changed` immediately, parent calls refetch,
// the props reactive triggers the watcher once with the OLD props
// value still cached) doesn't overwrite our optimistic mirror and
// visibly flip the toggle back to its old state until the round-trip
// resolves.
const blockedOverride = ref<Record<string, boolean>>({})
const inflightBlockedToggle = ref(false)

watch(
  () => props.model?.modelSpecs.map((s) => [s.modelInfo.id, s.modelInfo.blocked]) as Array<[string, boolean]>,
  (entries) => {
    if (!entries) {
      blockedOverride.value = {}
      return
    }
    if (inflightBlockedToggle.value) return
    const next: Record<string, boolean> = {}
    for (const [id, blocked] of entries) next[id] = blocked
    blockedOverride.value = next
  },
  { immediate: true, deep: true },
)

function isBlocked(spec: ModelSpec): boolean {
  const override = blockedOverride.value[spec.modelInfo.id]
  return override ?? spec.modelInfo.blocked
}

async function toggleSpecBlocked(specId: string, blocked: boolean) {
  // Guard against re-entry: Vue re-renders after optimistic mutation
  // push the new `checked` value through `:checked="..."` into the
  // cds-toggle host, whose updated() lifecycle then re-emits
  // `checkedChange` (which we deliberately don't listen for — see the
  // template — but cds-toggle's internals can still run sync re-renders
  // that re-trigger the slotted <input>'s change event). Skip the round
  // trip when the local cache already matches the requested value to
  // avoid duplicate BlockProviderModelSpec mutations.
  if (blockedOverride.value[specId] === blocked) return
  // Optimistic update via the local mirror (NOT mutating props.model —
  // that throws on Apollo's frozen Proxy). Reverts to server value when
  // the mirror is reconciled by the watcher after refetch.
  blockedOverride.value = { ...blockedOverride.value, [specId]: blocked }
  // Mark inflight so the watch callback doesn't reconcile the mirror
  // back to the pre-refetch props snapshot (which would briefly flip
  // the toggle back to its old state until refetch resolves).
  inflightBlockedToggle.value = true
  try {
    await apolloClient.mutate<BlockProviderModelSpecResult, BlockProviderModelSpecVars>({
      mutation: BLOCK_PROVIDER_MODEL_SPEC,
      variables: { input: { specId, blocked } },
    })
    emit('changed')
  } catch (error) {
    // Roll back the optimistic flip on failure so the UI doesn't lie.
    const next = { ...blockedOverride.value }
    delete next[specId]
    blockedOverride.value = next
    toast.error(graphqlErrorMessage(error, locale.t('supplier.model.toast.saveFailed')))
  } finally {
    inflightBlockedToggle.value = false
  }
}

function requestDeleteSpec(spec: ModelSpec) {
  pendingDeleteSpec.value = spec
}

async function confirmDeleteSpec() {
  const spec = pendingDeleteSpec.value
  pendingDeleteSpec.value = null
  if (!spec) return
  try {
    await apolloClient.mutate<DeleteProviderModelSpecResult, DeleteProviderModelSpecVars>({
      mutation: DELETE_PROVIDER_MODEL_SPEC,
      variables: { input: { specId: spec.modelInfo.id } },
    })
    toast.success(locale.t('supplier.specs.toast.deleted'))
    emit('changed')
  } catch (error) {
    toast.error(graphqlErrorMessage(error, locale.t('supplier.model.toast.deleteFailed')))
  }
}

async function refreshAll() {
  if (!props.model) return
  try {
    await apolloClient.mutate<
      RefreshProviderModelStatusResult,
      RefreshProviderModelStatusVars
    >({ mutation: REFRESH_PROVIDER_MODEL_STATUS, variables: { id: props.model.id } })
    toast.success(locale.t('supplier.specs.toast.refreshed'))
    emit('changed')
  } catch (error) {
    toast.error(graphqlErrorMessage(error, locale.t('supplier.model.toast.refreshFailed')))
  }
}

function openAddModal() {
  newSpec.value = {
    model: '',
    providerSelect: '',
    providerCustom: '',
    apiKey: '',
    apiBase: '',
  }
  addAttempt.value = false
  addSaving.value = false
  addModalOpen.value = true
}

// Cancel / backdrop / × all funnel through this — reset the attempt
// flag so the error borders go away as soon as the user dismisses.
function closeAddModal() {
  addModalOpen.value = false
  addAttempt.value = false
  addSaving.value = false
  addTesting.value = false
  addTestStatus.value = null
  addTestMessage.value = ''
  addModelList.value = []
}

// Probe the upstream provider with the typed-in apiBase + apiKey.
// On success, the returned model list becomes a <datalist> suggestion
// for the model input. Mirrors SupplierModelFormModal.testConnectionForSpec
// — same mutation, same error precedence (apollo thrown > graphQLErrors
// > unknown fallback), same stale-message reset between attempts.
async function testAddConnection() {
  addAttempt.value = true
  if (!newSpec.value.apiBase.trim() || !newSpec.value.apiKey.trim()) return
  addTesting.value = true
  addTestStatus.value = null
  addTestMessage.value = ''
  try {
    const r = await apolloClient.mutate<
      TestPrivateModelSpecConnectionResult,
      TestPrivateModelSpecConnectionVars
    >({
      mutation: TEST_PRIVATE_MODEL_SPEC_CONNECTION,
      variables: {
        input: {
          apiBase: newSpec.value.apiBase.trim(),
          apiKey: newSpec.value.apiKey.trim(),
        },
      },
    })
    const data = r.data?.testPrivateModelSpecConnection
    if (data?.success && data.modelList.length > 0) {
      addTestStatus.value = 'success'
      addModelList.value = data.modelList
      toast.success(
        locale
          .t('supplier.model.form.testSuccess')
          .replace('{count}', String(data.modelList.length)),
      )
      return
    }
    addModelList.value = []
    const reason =
      data?.message ?? graphqlErrorMessage(r.errors, locale.t('supplier.model.form.testUnknown'))
    addTestStatus.value = 'failure'
    addTestMessage.value = reason
    toast.error(locale.t('supplier.model.form.testFailure').replace('{message}', reason))
  } catch (error) {
    addModelList.value = []
    const reason = graphqlErrorMessage(error, locale.t('supplier.model.form.testUnknown'))
    addTestStatus.value = 'failure'
    addTestMessage.value = reason
    toast.error(locale.t('supplier.model.form.testFailure').replace('{message}', reason))
  } finally {
    addTesting.value = false
  }
}

async function submitAddSpec() {
  if (!props.model) return
  addAttempt.value = true
  // Validate the same four required fields the create-form modal uses.
  // Missing the model name is by far the most likely user error since
  // the placeholder looks like an optional field, so we keep the check
  // focused on what's actually required for a valid spec submission.
  const provider = effectiveProvider()
  if (
    !newSpec.value.model.trim()
    || !provider
    || !newSpec.value.apiKey.trim()
    || !newSpec.value.apiBase.trim()
  ) {
    return
  }
  addSaving.value = true
  try {
    await apolloClient.mutate<AddProviderModelSpecResult, AddProviderModelSpecVars>({
      mutation: ADD_PROVIDER_MODEL_SPEC,
      variables: {
        input: {
          providerModelId: props.model.id,
          spec: {
            litellmParams: {
              model: newSpec.value.model.trim(),
              customLlmProvider: provider,
              apiKey: newSpec.value.apiKey.trim() || null,
              apiBase: newSpec.value.apiBase.trim() || null,
            },
          },
        },
      },
    })
    toast.success(locale.t('supplier.specs.toast.added'))
    addModalOpen.value = false
    emit('changed')
  } catch (error) {
    toast.error(graphqlErrorMessage(error, locale.t('supplier.model.toast.saveFailed')))
  } finally {
    addSaving.value = false
  }
}

function close() {
  emit('close')
}

function statusBadgeKind(s: string): 'success' | 'danger' | 'neutral' {
  if (s === 'healthy') return 'success'
  if (s === 'unhealthy') return 'danger'
  return 'neutral'
}
</script>

<template>
  <cds-modal :hidden="!open" size="xl" @closeChange="close">
    <cds-modal-header>
      <h2 cds-text="title" class="modal-title">
        {{ props.model
          ? locale.t('supplier.specs.title').replace('{name}', props.model.name)
          : ''
        }}
      </h2>
      <div v-if="props.model" class="modal-meta">
        <span class="meta-count">
          {{ props.model.modelSpecs.length }} {{ locale.t('supplier.specs.metaCount') }}
        </span>
        <cds-badge
          :status="
            props.model.status === 'full_healthy' ? 'success'
            : props.model.status === 'full_outage' ? 'danger'
            : props.model.status === 'partial_outage' ? 'warning'
            : 'neutral'
          "
        >
          {{ locale.t(`supplier.status.${props.model.status}`) }}
        </cds-badge>
      </div>
    </cds-modal-header>

    <cds-modal-content>
      <div v-if="props.model" class="specs-tools">
        <cds-button action="outline" size="sm" @click="openAddModal">
          <cds-icon shape="plus-circle" size="sm"></cds-icon>
          {{ locale.t('supplier.specs.add') }}
        </cds-button>
        <cds-button action="outline" size="sm" @click="refreshAll">
          <cds-icon shape="refresh" size="sm"></cds-icon>
          {{ locale.t('supplier.specs.refresh') }}
        </cds-button>
      </div>

      <div
        v-if="!props.model || props.model.modelSpecs.length === 0"
        class="empty"
      >
        <cds-icon shape="list" size="xl"></cds-icon>
        <p>{{ locale.t('supplier.specs.empty') }}</p>
      </div>

      <div v-else class="spec-table-wrap">
        <table class="spec-table">
          <thead>
            <tr>
              <th>{{ locale.t('supplier.viewModal.col.model') }}</th>
              <th>{{ locale.t('supplier.model.form.spec.provider') }}</th>
              <th>{{ locale.t('supplier.viewModal.col.apiBase') }}</th>
              <th>{{ locale.t('supplier.viewModal.col.mode') }}</th>
              <th>{{ locale.t('supplier.viewModal.col.tags') }}</th>
              <th>{{ locale.t('supplier.specs.col.status') }}</th>
              <th>{{ locale.t('supplier.specs.col.blocked') }}</th>
              <th>{{ locale.t('supplier.col.actions') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="spec in props.model.modelSpecs" :key="spec.modelInfo.id">
              <td class="cell-strong">{{ spec.litellmParams.model }}</td>
              <td>{{ spec.litellmParams.customLlmProvider }}</td>
              <td class="cell-mono">{{ spec.litellmParams.apiBase || '—' }}</td>
              <td>{{ spec.modelInfo.mode || '—' }}</td>
              <td>
                <span v-if="spec.litellmParams.tags.length === 0">—</span>
                <span v-else>{{ spec.litellmParams.tags.join(', ') }}</span>
              </td>
              <td>
                <cds-badge :status="statusBadgeKind(spec.modelInfo.additionalProp1.status)">
                  {{ spec.modelInfo.additionalProp1.status }}
                </cds-badge>
              </td>
              <td>
                <!-- cds-toggle fires `checkedChange` only when the slotted
                     <input> itself receives the click. Users hit the LABEL
                     (the visible hit target — see the working pattern in
                     VirtualKeyFormModal.vue/SupplierModelFormModal.vue),
                     which dispatches a synthetic click on the input and the
                     `<label>`'s own "for" attribute flips the checkbox state,
                     bypassing the host's checkedChange emission entirely. As
                     a result `@checkedChange` would never fire in real user
                     clicks, and the BlockProviderModelSpec mutation would
                     never be sent. Bind `@change` to the input directly so
                     the handler fires no matter which surface the user hit. -->
                <cds-toggle :checked="isBlocked(spec)">
                  <label>{{ locale.t('supplier.specs.col.blocked') }}</label>
                  <input
                    slot="input"
                    type="checkbox"
                    tabindex="-1"
                    :checked="isBlocked(spec)"
                    :aria-label="locale.t('supplier.specs.col.blocked')"
                    @change="
                      (e: Event) =>
                        toggleSpecBlocked(
                          spec.modelInfo.id,
                          (e.target as HTMLInputElement).checked,
                        )
                    "
                  />
                </cds-toggle>
              </td>
              <td>
                <button
                  type="button"
                  class="row-action danger"
                  :title="locale.t('supplier.action.delete')"
                  :aria-label="locale.t('supplier.action.delete')"
                  @click="requestDeleteSpec(spec)"
                >
                  <cds-icon shape="trash" size="sm"></cds-icon>
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </cds-modal-content>

    <cds-modal-actions>
      <cds-button action="outline" @click="close">
        {{ locale.t('common.close') }}
      </cds-button>
    </cds-modal-actions>

    <!-- ADD SPEC MODAL — mirrors the core parameter layout of the
         "新建模型" form's step 2 (supplier/model/provider/apiBase/
         apiKey/model name) so the modal feels like a slice of the same
         wizard rather than a separate mini-form. Advanced parameters
         (mode, tags, limits, cost, toggles) are intentionally omitted —
         users edit those per-spec from the main form after creation. -->
    <cds-modal :hidden="!addModalOpen" size="md" @closeChange="closeAddModal">
      <cds-modal-header>
        <h2 cds-text="title">{{ locale.t('supplier.specs.addModal.title') }}</h2>
      </cds-modal-header>
      <cds-modal-content>
        <div class="add-form">
          <div class="provider-field">
            <span class="provider-label">
              {{ locale.t('supplier.model.form.spec.provider') }}
              <span class="required-mark" aria-hidden="true">*</span>
            </span>
            <cds-select>
              <select
                :value="newSpec.providerSelect"
                :aria-label="locale.t('supplier.model.form.spec.provider')"
                @change="onProviderChange($event)"
              >
                <option value="">
                  {{ locale.t('supplier.specs.addModal.providerPlaceholder') }}
                </option>
                <option v-for="opt in PROVIDER_OPTIONS" :key="opt" :value="opt">
                  {{ locale.t(`supplier.model.form.spec.providerOption.${opt}`) }}
                </option>
              </select>
            </cds-select>
          </div>
          <cds-input
            v-if="newSpec.providerSelect === PROVIDER_CUSTOM"
            :status="addAttempt && !newSpec.providerCustom.trim() ? 'error' : 'neutral'"
          >
            <label>
              {{ locale.t('supplier.model.form.spec.provider') }}
              <span class="required-mark" aria-hidden="true">*</span>
            </label>
            <input
              :value="newSpec.providerCustom"
              autocomplete="off"
              placeholder="my_provider"
              @input="newSpec.providerCustom = ($event.target as HTMLInputElement).value"
            />
          </cds-input>
          <cds-input :status="addAttempt && !newSpec.apiBase.trim() ? 'error' : 'neutral'">
            <label>
              {{ locale.t('supplier.model.form.spec.apiBase') }}
              <span class="required-mark" aria-hidden="true">*</span>
            </label>
            <input
              :value="newSpec.apiBase"
              autocomplete="off"
              placeholder="https://api.deepseek.com"
              @input="newSpec.apiBase = ($event.target as HTMLInputElement).value"
            />
            <cds-control-message status="neutral">
              {{
                newSpec.providerSelect === PROVIDER_CUSTOM
                  ? locale.t('supplier.model.form.spec.apiBaseHintCustom')
                  : locale.t('supplier.model.form.spec.apiBaseHint')
              }}
            </cds-control-message>
          </cds-input>
          <cds-input :status="addAttempt && !newSpec.apiKey.trim() ? 'error' : 'neutral'">
            <label>
              {{ locale.t('supplier.model.form.spec.apiKey') }}
              <span class="required-mark" aria-hidden="true">*</span>
            </label>
            <input
              type="password"
              autocomplete="off"
              :placeholder="locale.t('supplier.model.form.spec.apiKeyPlaceholder')"
              @input="newSpec.apiKey = ($event.target as HTMLInputElement).value"
            />
          </cds-input>
          <!-- Per-spec test connection — sits between apiKey and model
               so the user can probe credentials + endpoint and get a
               datalist suggestion for the model name. Mirrors the
               layout in SupplierModelFormModal.spec-grid for visual
               consistency. -->
          <div class="test-row">
            <cds-button
              action="outline"
              size="sm"
              :disabled="
                addTesting
                || !newSpec.apiBase.trim()
                || !newSpec.apiKey.trim()
              "
              @click="testAddConnection"
            >
              <cds-icon shape="connect" size="sm"></cds-icon>
              {{ locale.t('supplier.model.form.testConnection') }}
            </cds-button>
            <cds-badge
              v-if="addTestStatus"
              :status="addTestStatus === 'success' ? 'success' : 'danger'"
              class="test-status"
            >
              <template v-if="addTestStatus === 'success'">
                {{
                  locale
                    .t('supplier.model.form.testSuccess')
                    .replace('{count}', String(addModelList.length))
                }}
              </template>
              <template v-else>
                {{
                  locale
                    .t('supplier.model.form.testFailure')
                    .replace(
                      '{message}',
                      addTestMessage || locale.t('supplier.model.form.testUnknown'),
                    )
                }}
              </template>
            </cds-badge>
          </div>
          <cds-input :status="addAttempt && !newSpec.model.trim() ? 'error' : 'neutral'">
            <label>
              {{ locale.t('supplier.model.form.spec.model') }}
              <span class="required-mark" aria-hidden="true">*</span>
            </label>
            <input
              :value="newSpec.model"
              :list="addModelList.length > 0 ? 'add-spec-model-list' : undefined"
              autocomplete="off"
              :placeholder="locale.t('supplier.specs.addModal.modelPlaceholder')"
              @input="newSpec.model = ($event.target as HTMLInputElement).value"
            />
            <!-- Datalist of models returned by the most recent probe of
                 this draft. Hidden until a successful probe populates
                 addModelList; the input stays free-form so the user
                 can still type a custom model name if their upstream
                 offers one the probe missed. -->
            <datalist
              v-if="addModelList.length > 0"
              id="add-spec-model-list"
            >
              <option v-for="m in addModelList" :key="m" :value="m" />
            </datalist>
          </cds-input>
        </div>
      </cds-modal-content>
      <cds-modal-actions>
        <cds-button action="outline" @click="closeAddModal">
          {{ locale.t('supplier.model.form.cancel') }}
        </cds-button>
        <cds-button :disabled="addSaving" @click="submitAddSpec">
          {{ locale.t('supplier.specs.addModal.submit') }}
        </cds-button>
      </cds-modal-actions>
    </cds-modal>

    <ConfirmDialog
      :open="pendingDeleteSpec !== null"
      :title="locale.t('supplier.model.confirm.specDeleteTitle')"
      :body="locale
        .t('supplier.model.confirm.specDeleteBody')
        .replace('{name}', pendingDeleteSpec?.litellmParams.model ?? '')"
      :expected-input="pendingDeleteSpec?.litellmParams.model ?? ''"
      :input-placeholder="locale.t('supplier.model.confirm.tokenPlaceholder')"
      danger
      @close="pendingDeleteSpec = null"
      @confirm="confirmDeleteSpec"
    />
  </cds-modal>
</template>

<style scoped>
.modal-title {
  word-break: break-all;
}
.modal-meta {
  display: flex;
  align-items: center;
  gap: 10px;
  /* Extra breathing room between the title and the meta line so the
     count + status badge read as a separate, deliberate subtitle rather
     than part of the heading. Earlier 4px made the meta feel glued to
     the title; 12px keeps it visually associated but distinct. */
  margin-top: 12px;
  font-size: 16px;
  font-weight: 600;
  color: var(--cds-alias-object-app-foreground, #1b1b1b);
}
.meta-count {
  font-size: 16px;
  font-weight: 600;
  color: var(--cds-alias-object-app-foreground, #1b1b1b);
}
.specs-tools {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 8px;
}
.empty {
  text-align: center;
  padding: 32px;
  color: var(--cds-alias-typography-color-300, #565656);
}
/* Horizontal-scroll wrapper — matches the supplier view modal pattern so
   wide tables (8 columns incl. tags / apiBase) keep readable without
   breaking the modal layout. */
.spec-table-wrap {
  width: 100%;
  overflow-x: auto;
  border: 1px solid var(--cds-alias-object-border-color, #e8e8e8);
  border-radius: 4px;
}
.spec-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
  min-width: 980px;
}
.spec-table th,
.spec-table td {
  text-align: left;
  padding: 8px 12px;
  border-bottom: 1px solid var(--cds-alias-object-border-color, #e8e8e8);
  vertical-align: middle;
  white-space: nowrap;
}
.spec-table th {
  background: var(--cds-alias-object-app-background, #f4f4f4);
  font-weight: 600;
  color: var(--cds-alias-typography-color-300, #565656);
  position: sticky;
  top: 0;
}
.spec-table tbody tr:last-child td {
  border-bottom: 0;
}
.cell-strong {
  font-weight: 600;
}
.cell-mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px;
}
.add-form { display: grid; gap: 12px; width: 100%; }
/* Test connection row — same horizontal flex + small gap pattern as
   SupplierModelFormModal.test-row, so the button + status badge sit
   on one line and read as a single tool group below the apiKey input. */
.test-row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.test-status { text-transform: capitalize; }
/* cds-modal-content defaults to p-x:lg (--δ6 = 24px * 1rem / 20) on
   the host plus the modal-content wrapper's cds-layout="vertical
   gap:lg p-y:xs". Together they squeeze size="md" (~576px) inputs
   down to ~470px. cds-modal-content is teleported to body so we need
   :deep to reach it from this scoped style. Slight risk of leaking
   across other modals using cds-modal-content inside this component
   — there is none in this file (this component uses one main modal
   + one add-spec submodal, both use cds-modal-content), and the
   visual effect on the main modal is desirable too (slightly wider
   table cells). */
:deep(cds-modal-content) {
  padding-left: 16px;
  padding-right: 16px;
}
/* Mirrors the .required-mark contract used across SupplierModelFormModal
   and ModelGatewayFormModal — crimson 0.7em glyph, negative top margin
   so it floats above the cap-line next to the label. Tells users which
   fields block submit (validated by the addAttempt gating below). */
.required-mark {
  color: var(--cds-alias-status-danger, #c21d00);
  font-size: 0.7em;
  font-weight: 700;
  line-height: 1;
  margin: -0.5em 0 0 1px;
  display: inline-block;
}
.provider-field { display: flex; align-items: center; gap: 1.9rem; }
.provider-field > cds-select { flex: 1; min-width: 0; }
.provider-label { font-size: 13px; color: var(--cds-alias-label-color, #565656); font-weight: 500; white-space: nowrap; flex-shrink: 0; }
.row-action { padding: 4px; border: 0; border-radius: 3px; background: transparent; cursor: pointer; color: inherit; }
.row-action.danger { color: var(--cds-alias-status-danger, #c92100); }
.row-action:hover { background: var(--cds-alias-object-app-background, #f4f4f4); }
</style>