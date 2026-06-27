<script setup lang="ts">
/**
 * Create-or-edit dialog for a single resource pool.
 *
 * Mirrors the UserFormDialog pattern but is a "create-or-edit" two-mode
 * dialog: the same component is opened for both new and existing rows
 * (existing rows pass an optional `pool` prop to pre-fill the inputs).
 *
 * Submit emits `submit(input)` with the normalized `CreateResourcePoolInput`
 * or `UpdateResourcePoolInput` payload — the parent decides which mutation
 * to fire.
 */
import { computed, reactive, ref, watch } from 'vue'
import { useMutation } from '@vue/apollo-composable'
import { useLocaleStore } from '@/stores/locale'
import { TEST_RESOURCE_POOL_CONNECTION_MUTATION } from '@/api/graphql/queries/resourcePools'
import type {
  CreateResourcePoolInput,
  ResourcePool,
  TestResourcePoolConnectionResult,
  TestResourcePoolConnectionVars,
} from '@/api/graphql/types/resource-pool'
import '@/components/icons'

const props = defineProps<{
  open: boolean
  /** When provided, the dialog pre-fills the inputs and emits an Update
   *  payload; when omitted, the dialog starts blank and emits a Create. */
  pool?: ResourcePool | null
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'submit', payload: { mode: 'create' | 'update'; input: CreateResourcePoolInput }): void
}>()

const locale = useLocaleStore()

const form = reactive({
  name: '',
  endpoint: '',
  contentLibraryName: '',
  insecure: false,
})

const isEdit = computed(() => !!props.pool)

const titleKey = computed(() =>
  isEdit.value ? 'resources.form.title.edit' : 'resources.form.title.create',
)

/** Track which input fields the alert was last computed against — if any
 *  of them change after the test, the alert is hidden (stale). */
const testSnapshot = ref<{ name: string; endpoint: string; contentLibraryName: string } | null>(null)
const testResult = ref<null | { ok: boolean; message: string; detail: { vSphereVersion: string; itemCount: number } | null }>(null)

const canTest = computed(
  () => !!(form.name.trim() && form.endpoint.trim() && form.contentLibraryName.trim()),
)
const canSubmit = computed(() => canTest.value)

watch(
  () => props.open,
  (o) => {
    if (o) {
      form.name = props.pool?.name ?? ''
      form.endpoint = props.pool?.endpoint ?? ''
      form.contentLibraryName = props.pool?.contentLibraryName ?? ''
      form.insecure = props.pool?.insecure ?? false
      // Reset the test-connection alert every time the dialog re-opens.
      testResult.value = null
    }
  },
  { immediate: true },
)

watch(
  () => [form.name, form.endpoint, form.contentLibraryName],
  () => {
    if (testSnapshot.value) {
      const cur = { name: form.name, endpoint: form.endpoint, contentLibraryName: form.contentLibraryName }
      if (
        cur.name !== testSnapshot.value.name ||
        cur.endpoint !== testSnapshot.value.endpoint ||
        cur.contentLibraryName !== testSnapshot.value.contentLibraryName
      ) {
        testResult.value = null
        testSnapshot.value = null
      }
    }
  },
)

const { mutate: testConnectionMutate, loading: testing } = useMutation<
  TestResourcePoolConnectionResult,
  TestResourcePoolConnectionVars
>(TEST_RESOURCE_POOL_CONNECTION_MUTATION)

async function onTestConnection() {
  if (!canTest.value || testing.value) return
  try {
    const r = await testConnectionMutate({
      input: {
        name: form.name.trim(),
        endpoint: form.endpoint.trim(),
        contentLibraryName: form.contentLibraryName.trim(),
      },
    })
    const res = r?.data?.testResourcePoolConnection
    if (res) {
      testResult.value = {
        ok: res.ok,
        message: res.message,
        detail: res.detail,
      }
      testSnapshot.value = {
        name: form.name,
        endpoint: form.endpoint,
        contentLibraryName: form.contentLibraryName,
      }
    }
  } catch (err) {
     
    console.error('[resources] test connection failed', err)
    testResult.value = { ok: false, message: '请求失败,请重试', detail: null }
  }
}

function dismissTestResult() {
  testResult.value = null
  testSnapshot.value = null
}

function onSubmit() {
  if (!canSubmit.value) return
  const input: CreateResourcePoolInput = {
    name: form.name.trim(),
    endpoint: form.endpoint.trim(),
    contentLibraryName: form.contentLibraryName.trim(),
    insecure: form.insecure,
  }
  emit('submit', { mode: isEdit.value ? 'update' : 'create', input })
}

function close() {
  emit('close')
}
function onBackdropClick(e: MouseEvent) {
  if (e.target === e.currentTarget) close()
}
</script>

<template>
  <Teleport to="body">
    <Transition name="resource-fade">
      <div
        v-if="open"
        class="resource-backdrop"
        role="dialog"
        aria-modal="true"
        :aria-label="locale.t(titleKey)"
        @click="onBackdropClick"
      >
        <div class="resource-card" @click.stop>
          <h2 cds-text="section" class="resource-title">
            {{ locale.t(titleKey) }}
          </h2>

          <form class="resource-form" @submit.prevent="onSubmit">
            <label class="resource-field">
              <span class="resource-label">{{ locale.t('resources.form.name') }}</span>
              <input
                type="text"
                class="app-input"
                :value="form.name"
                @input="(e: Event) => form.name = (e.target as HTMLInputElement).value"
              />
            </label>

            <label class="resource-field">
              <span class="resource-label">{{ locale.t('resources.form.endpoint') }}</span>
              <input
                type="text"
                class="app-input"
                :value="form.endpoint"
                placeholder="https://vc.example.local/sdk"
                @input="(e: Event) => form.endpoint = (e.target as HTMLInputElement).value"
              />
            </label>

            <label class="resource-field">
              <span class="resource-label">{{ locale.t('resources.form.contentLibrary') }}</span>
              <input
                type="text"
                class="app-input"
                :value="form.contentLibraryName"
                :placeholder="locale.t('resources.form.contentLibraryPlaceholder')"
                @input="(e: Event) => form.contentLibraryName = (e.target as HTMLInputElement).value"
              />
            </label>

            <label class="resource-check">
              <input
                type="checkbox"
                :checked="form.insecure"
                @change="(e: Event) => form.insecure = (e.target as HTMLInputElement).checked"
              />
              <span>
                <span class="resource-check-label">{{ locale.t('resources.form.insecure') }}</span>
                <span class="resource-check-hint">{{ locale.t('resources.form.insecureHint') }}</span>
              </span>
            </label>

            <div class="resource-test">
              <cds-button
                type="button"
                action="outline"
                status="primary"
                :disabled="!canTest || testing"
                @click="onTestConnection"
              >
                <cds-icon
                  v-if="testing"
                  shape="circle-loader"
                  size="sm"
                  aria-hidden="true"
                ></cds-icon>
                {{ locale.t('resources.form.testConnection') }}
              </cds-button>
              <cds-alert
                v-if="testResult"
                :status="testResult.ok ? 'success' : 'danger'"
                class="resource-test-alert"
              >
                <div class="resource-test-message">{{ testResult.message }}</div>
                <div
                  v-if="testResult.ok && testResult.detail"
                  class="resource-test-detail"
                >
                  vSphere {{ testResult.detail.vSphereVersion }} · {{ testResult.detail.itemCount }} 个 OVF 模板
                </div>
                <cds-button-action
                  shape="times"
                  :title="locale.t('common.cancel')"
                  :aria-label="locale.t('common.cancel')"
                  @click="dismissTestResult"
                ></cds-button-action>
              </cds-alert>
            </div>

            <div class="resource-actions">
              <cds-button type="button" action="outline" @click="close">
                {{ locale.t('common.cancel') }}
              </cds-button>
              <cds-button
                type="submit"
                action="solid"
                status="primary"
                :disabled="!canSubmit"
              >
                {{ locale.t('resources.form.submit') }}
              </cds-button>
            </div>
          </form>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.resource-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(11, 18, 32, 0.55);
  backdrop-filter: blur(2px);
  -webkit-backdrop-filter: blur(2px);
  display: grid;
  place-items: center;
  z-index: 1100;
  padding: 24px;
}

.resource-card {
  width: min(520px, 100%);
  background: var(--cds-alias-object-container-background, #ffffff);
  color: var(--cds-alias-object-app-foreground, #1b1b1b);
  border-radius: 12px;
  box-shadow: 0 30px 80px rgba(0, 0, 0, 0.35);
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.resource-title {
  margin: 0;
  font-size: 18px;
}

.resource-form {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.resource-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.resource-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--cds-alias-typography-color-300, #565656);
}

.resource-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.resource-check {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  cursor: pointer;
}
.resource-check input {
  margin-top: 2px;
}
.resource-check-label {
  display: block;
  font-size: 13px;
  font-weight: 600;
  color: var(--cds-alias-typography-color-300, #565656);
}
.resource-check-hint {
  display: block;
  font-size: 12px;
  margin-top: 2px;
  color: var(--cds-alias-typography-color-400, #80838a);
}

.resource-test {
  display: flex;
  flex-direction: column;
  gap: 8px;
  align-items: flex-start;
}

.resource-test-alert {
  width: 100%;
}

.resource-test-message {
  font-size: 13px;
  font-weight: 600;
}

.resource-test-detail {
  font-size: 12px;
  margin-top: 2px;
  color: var(--cds-alias-typography-color-300, #565656);
}

.app-input {
  font: inherit;
  font-size: 14px;
  width: 100%;
  height: 36px;
  padding: 0 12px;
  border-radius: 4px;
  border: 1px solid var(--cds-alias-object-border-color, #cbd4d8);
  background: var(--cds-alias-object-container-background, #ffffff);
  color: var(--cds-alias-object-app-foreground, #1b1b1b);
  outline: none;
  transition: border-color 0.12s ease, box-shadow 0.12s ease;
  box-sizing: border-box;
}
.app-input:focus {
  border-color: var(--cds-alias-status-info, #0079ad);
  box-shadow: 0 0 0 2px var(--cds-alias-object-interaction-background-hover, #e0f6ff);
}

.resource-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.resource-fade-enter-active,
.resource-fade-leave-active {
  transition: opacity 0.18s ease;
}
.resource-fade-enter-from,
.resource-fade-leave-to {
  opacity: 0;
}
</style>
