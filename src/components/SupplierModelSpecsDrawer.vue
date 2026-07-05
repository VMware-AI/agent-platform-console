<script setup lang="ts">
import { ref } from 'vue'
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
  type ProviderModelNode,
  type BlockProviderModelSpecVars,
  type BlockProviderModelSpecResult,
  type DeleteProviderModelSpecVars,
  type DeleteProviderModelSpecResult,
  type AddProviderModelSpecVars,
  type AddProviderModelSpecResult,
  type RefreshProviderModelStatusVars,
  type RefreshProviderModelStatusResult,
} from '@/api/graphql/queries/supplier-models'

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

const pendingDeleteSpecId = ref<string | null>(null)
const addModalOpen = ref(false)
const newSpec = ref({
  model: '',
  customLlmProvider: '',
  apiKey: '',
  apiBase: '',
})

async function toggleSpecBlocked(specId: string, blocked: boolean) {
  try {
    await apolloClient.mutate<BlockProviderModelSpecResult, BlockProviderModelSpecVars>({
      mutation: BLOCK_PROVIDER_MODEL_SPEC,
      variables: { input: { specId, blocked } },
    })
    emit('changed')
  } catch (error) {
    toast.error(graphqlErrorMessage(error, locale.t('supplier.toast.saveFailed')))
  }
}

function requestDeleteSpec(specId: string) {
  pendingDeleteSpecId.value = specId
}

async function confirmDeleteSpec() {
  const specId = pendingDeleteSpecId.value
  pendingDeleteSpecId.value = null
  if (!specId) return
  try {
    await apolloClient.mutate<DeleteProviderModelSpecResult, DeleteProviderModelSpecVars>({
      mutation: DELETE_PROVIDER_MODEL_SPEC,
      variables: { input: { specId } },
    })
    toast.success(locale.t('supplier.specs.toast.deleted'))
    emit('changed')
  } catch (error) {
    toast.error(graphqlErrorMessage(error, locale.t('supplier.toast.deleteFailed')))
  }
}

async function blockAllSpecs() {
  if (!props.model) return
  const ids = props.model.modelSpecs.map((s) => s.modelInfo.id)
  if (ids.length === 0) return
  await Promise.allSettled(
    ids.map((specId) =>
      apolloClient.mutate<BlockProviderModelSpecResult, BlockProviderModelSpecVars>({
        mutation: BLOCK_PROVIDER_MODEL_SPEC,
        variables: { input: { specId, blocked: true } },
      }),
    ),
  )
  toast.success(
    locale.t('supplier.specs.toast.blocked').replace('{count}', String(ids.length)),
  )
  emit('changed')
}

async function unblockAllSpecs() {
  if (!props.model) return
  const ids = props.model.modelSpecs.map((s) => s.modelInfo.id)
  if (ids.length === 0) return
  await Promise.allSettled(
    ids.map((specId) =>
      apolloClient.mutate<BlockProviderModelSpecResult, BlockProviderModelSpecVars>({
        mutation: BLOCK_PROVIDER_MODEL_SPEC,
        variables: { input: { specId, blocked: false } },
      }),
    ),
  )
  toast.success(
    locale.t('supplier.specs.toast.unblocked').replace('{count}', String(ids.length)),
  )
  emit('changed')
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
    toast.error(graphqlErrorMessage(error, locale.t('supplier.toast.refreshFailed')))
  }
}

function openAddModal() {
  newSpec.value = { model: '', customLlmProvider: '', apiKey: '', apiBase: '' }
  addModalOpen.value = true
}

async function submitAddSpec() {
  if (!props.model) return
  if (!newSpec.value.model.trim() || !newSpec.value.customLlmProvider.trim()) {
    toast.error(locale.t('supplier.toast.saveFailed'))
    return
  }
  try {
    await apolloClient.mutate<AddProviderModelSpecResult, AddProviderModelSpecVars>({
      mutation: ADD_PROVIDER_MODEL_SPEC,
      variables: {
        input: {
          providerModelId: props.model.id,
          spec: {
            litellmParams: {
              model: newSpec.value.model.trim(),
              customLlmProvider: newSpec.value.customLlmProvider.trim(),
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
    toast.error(graphqlErrorMessage(error, locale.t('supplier.toast.saveFailed')))
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
  <cds-drawer :hidden="!open" @closeChange="close">
    <cds-drawer-header>
      <h2 cds-text="title">
        {{ props.model
          ? locale.t('supplier.specs.title').replace('{name}', props.model.name)
          : ''
        }}
      </h2>
      <div v-if="props.model" class="drawer-meta">
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
    </cds-drawer-header>

    <cds-drawer-content>
      <div v-if="props.model" class="specs-tools">
        <cds-button action="outline" size="sm" @click="openAddModal">
          <cds-icon shape="plus-circle" size="sm"></cds-icon>
          {{ locale.t('supplier.specs.add') }}
        </cds-button>
        <cds-button action="outline" size="sm" @click="blockAllSpecs">
          <cds-icon shape="ban" size="sm"></cds-icon>
          {{ locale.t('supplier.specs.blockAll') }}
        </cds-button>
        <cds-button action="outline" size="sm" @click="unblockAllSpecs">
          <cds-icon shape="unlock" size="sm"></cds-icon>
          {{ locale.t('supplier.specs.unblockAll') }}
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

      <table v-else class="spec-table">
        <thead>
          <tr>
            <th>model</th>
            <th>customLlmProvider</th>
            <th>{{ locale.t('supplier.col.specs') }}</th>
            <th>{{ locale.t('supplier.action.test') }}</th>
            <th>{{ locale.t('supplier.col.actions') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="spec in props.model.modelSpecs" :key="spec.modelInfo.id">
            <td>{{ spec.litellmParams.model }}</td>
            <td>{{ spec.litellmParams.customLlmProvider }}</td>
            <td>
              <cds-badge :status="statusBadgeKind(spec.modelInfo.additionalProp1.status)">
                {{ spec.modelInfo.additionalProp1.status }}
              </cds-badge>
            </td>
            <td>
              <cds-toggle>
                <input
                  type="checkbox"
                  :checked="spec.modelInfo.blocked"
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
                @click="requestDeleteSpec(spec.modelInfo.id)"
              >
                <cds-icon shape="trash" size="sm"></cds-icon>
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </cds-drawer-content>

    <!-- ADD SPEC MODAL -->
    <cds-modal :hidden="!addModalOpen" size="md" @closeChange="addModalOpen = false">
      <cds-modal-header>
        <h2 cds-text="title">{{ locale.t('supplier.specs.addModal.title') }}</h2>
      </cds-modal-header>
      <cds-modal-content>
        <div class="add-form">
          <cds-input>
            <label>model</label>
            <input
              :value="newSpec.model"
              :placeholder="locale.t('supplier.specs.addModal.modelPlaceholder')"
              @input="newSpec.model = ($event.target as HTMLInputElement).value"
            />
          </cds-input>
          <cds-input>
            <label>customLlmProvider</label>
            <input
              :value="newSpec.customLlmProvider"
              :placeholder="locale.t('supplier.specs.addModal.customLlmProviderPlaceholder')"
              @input="newSpec.customLlmProvider = ($event.target as HTMLInputElement).value"
            />
          </cds-input>
          <cds-input>
            <label>{{ locale.t('supplier.model.form.spec.apiKey') }}</label>
            <input
              type="password"
              :placeholder="locale.t('supplier.specs.addModal.apiKeyPlaceholder')"
              @input="newSpec.apiKey = ($event.target as HTMLInputElement).value"
            />
            <cds-control-message status="neutral">
              {{ locale.t('supplier.specs.addModal.apiKeyHint') }}
            </cds-control-message>
          </cds-input>
          <cds-input>
            <label>apiBase</label>
            <input
              :value="newSpec.apiBase"
              placeholder="https://api.deepseek.com"
              @input="newSpec.apiBase = ($event.target as HTMLInputElement).value"
            />
          </cds-input>
        </div>
      </cds-modal-content>
      <cds-modal-actions>
        <cds-button action="outline" @click="addModalOpen = false">
          {{ locale.t('supplier.model.form.cancel') }}
        </cds-button>
        <cds-button @click="submitAddSpec">
          {{ locale.t('supplier.specs.addModal.submit') }}
        </cds-button>
      </cds-modal-actions>
    </cds-modal>

    <ConfirmDialog
      :open="pendingDeleteSpecId !== null"
      :title="locale.t('supplier.confirm.deleteTitle')"
      :body="locale.t('supplier.confirm.deleteBody').replace('{name}', '该 spec')"
      danger
      @close="pendingDeleteSpecId = null"
      @confirm="confirmDeleteSpec"
    />
  </cds-drawer>
</template>

<style scoped>
.drawer-meta { display: flex; align-items: center; gap: 8px; margin-top: 4px; }
.specs-tools { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 16px; }
.empty { text-align: center; padding: 32px; color: var(--cds-alias-typography-color-300, #565656); }
.spec-table { width: 100%; border-collapse: collapse; }
.spec-table th, .spec-table td {
  text-align: left; padding: 8px; border-bottom: 1px solid var(--cds-alias-object-border-color, #e8e8e8);
}
.add-form { display: grid; gap: 12px; }
.row-action { padding: 4px; border: 0; border-radius: 3px; background: transparent; cursor: pointer; color: inherit; }
.row-action.danger { color: var(--cds-alias-status-danger, #c92100); }
.row-action:hover { background: var(--cds-alias-object-app-background, #f4f4f4); }
</style>