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
} from '@/types/resource-pool'
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
  insecure: false,
  username: '',
  password: '',
})

const isEdit = computed(() => !!props.pool)

const titleKey = computed(() =>
  isEdit.value ? 'resources.form.title.edit' : 'resources.form.title.create',
)

/** Available content libraries fetched after a successful authenticated test. */
const contentLibraries = ref<string[]>([])
/** The library the user selected from the dropdown. */
const selectedLibrary = ref('')

/** Track which fields the test was computed against — changes after the test
 *  hide the result (stale) and clear the library list. */
const testSnapshot = ref<{
  name: string
  endpoint: string
  username: string
  password: string
  insecure: boolean
} | null>(null)
const testResult = ref<null | {
  ok: boolean
  message: string
  detail: { vSphereVersion: string; contentLibraries: string[] } | null
}>(null)

const canTest = computed(
  () => !!(form.name.trim() && form.endpoint.trim() && form.username.trim() && form.password),
)
// Creating a pool requires credentials AND a library selection; editing can
// omit credentials (keeping the stored ones) but must always have a library.
const canSubmit = computed(
  () =>
    !!(form.name.trim() && form.endpoint.trim() && selectedLibrary.value) &&
    (isEdit.value || !!(form.username.trim() && form.password)),
)

watch(
  () => props.open,
  (o) => {
    if (o) {
      form.name = props.pool?.name ?? ''
      form.endpoint = props.pool?.endpoint ?? ''
      form.insecure = props.pool?.insecure ?? false
      // Credentials are never returned by the API (write-only); always start blank.
      form.username = ''
      form.password = ''
      // On edit, pre-select the stored library name so the form is immediately valid.
      selectedLibrary.value = props.pool?.contentLibraryName ?? ''
      // Keep the pre-selected library in the list so it renders even before a fresh test.
      contentLibraries.value = props.pool?.contentLibraryName ? [props.pool.contentLibraryName] : []
      testResult.value = null
      testSnapshot.value = null
    }
  },
  { immediate: true },
)

watch(
  () => [form.name, form.endpoint, form.username, form.password, form.insecure],
  () => {
    const snap = testSnapshot.value
    if (snap) {
      if (
        form.name !== snap.name ||
        form.endpoint !== snap.endpoint ||
        form.username !== snap.username ||
        form.password !== snap.password ||
        form.insecure !== snap.insecure
      ) {
        testResult.value = null
        testSnapshot.value = null
        contentLibraries.value = []
        selectedLibrary.value = ''
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
        insecure: form.insecure,
        username: form.username.trim(),
        password: form.password,
      },
    })
    const res = r?.data?.testResourcePoolConnection
    if (res) {
      testResult.value = {
        ok: res.ok,
        message: res.message,
        detail: res.detail ?? null,
      }
      testSnapshot.value = {
        name: form.name,
        endpoint: form.endpoint,
        username: form.username,
        password: form.password,
        insecure: form.insecure,
      }
      if (res.ok && res.detail?.contentLibraries?.length) {
        contentLibraries.value = res.detail.contentLibraries
        // Auto-select when only one library exists, or keep previous selection
        // if it's still in the list.
        if (!selectedLibrary.value || !contentLibraries.value.includes(selectedLibrary.value)) {
          selectedLibrary.value = contentLibraries.value.length === 1 ? contentLibraries.value[0] : ''
        }
      } else if (res.ok) {
        contentLibraries.value = []
        selectedLibrary.value = ''
      }
    }
  } catch (err) {
    console.error('[resources] test connection failed', err)
    testResult.value = { ok: false, message: '请求失败，请重试', detail: null }
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
    contentLibraryName: selectedLibrary.value,
    insecure: form.insecure,
  }
  // Credentials are write-only: always on create, on edit only to rotate.
  if (form.username.trim()) input.username = form.username.trim()
  if (form.password) input.password = form.password
  emit('submit', { mode: isEdit.value ? 'update' : 'create', input })
}

function close() {
  emit('close')
}
</script>

<template>
  <cds-modal :hidden="!open" :closable="true" size="md" @closeChange="close">
    <cds-modal-header>
      <h3 cds-text="title">{{ locale.t(titleKey) }}</h3>
    </cds-modal-header>

    <cds-modal-content>
      <form class="resource-form" cds-layout="vertical align:stretch gap:md" @submit.prevent="onSubmit">
        <!-- Name: required in both create and edit (mirrors UserFormDialog / ModelGatewayFormModal pattern) -->
        <cds-control>
          <cds-input>
            <label>{{ locale.t('resources.form.name') }}<sup class="required-mark" aria-hidden="true">{{ locale.t('resources.form.requiredMark') }}</sup></label>
            <input
              slot="input"
              type="text"
              :value="form.name"
              @input="(e: Event) => form.name = (e.target as HTMLInputElement).value"
            />
          </cds-input>
        </cds-control>

        <!-- Endpoint: required in both create and edit -->
        <cds-control>
          <cds-input>
            <label>{{ locale.t('resources.form.endpoint') }}<sup class="required-mark" aria-hidden="true">{{ locale.t('resources.form.requiredMark') }}</sup></label>
            <input
              slot="input"
              type="text"
              :value="form.endpoint"
              placeholder="https://vc.example.local/sdk"
              @input="(e: Event) => form.endpoint = (e.target as HTMLInputElement).value"
            />
          </cds-input>
        </cds-control>

        <!-- Username: required in create, optional in edit (rotating credentials) -->
        <cds-control>
          <cds-input>
            <label>
              {{ locale.t('resources.form.username') }}<sup v-if="!isEdit" class="required-mark" aria-hidden="true">{{ locale.t('resources.form.requiredMark') }}</sup>
            </label>
            <input
              slot="input"
              type="text"
              autocomplete="off"
              :value="form.username"
              :placeholder="locale.t('resources.form.usernamePlaceholder')"
              @input="(e: Event) => form.username = (e.target as HTMLInputElement).value"
            />
          </cds-input>
        </cds-control>

        <!-- Password: required in create, optional in edit (leave blank to keep stored credentials).
             In edit mode we surface the hint via cds-control-message so it sits
             directly under the password field, matching the model-gateway form's
             error-message placement. -->
        <cds-control>
          <cds-password>
            <label>
              {{ locale.t('resources.form.password') }}<sup v-if="!isEdit" class="required-mark" aria-hidden="true">{{ locale.t('resources.form.requiredMark') }}</sup>
            </label>
            <input
              slot="input"
              type="password"
              autocomplete="new-password"
              :value="form.password"
              @input="(e: Event) => form.password = (e.target as HTMLInputElement).value"
            />
            <cds-control-message v-if="isEdit" status="info">
              {{ locale.t('resources.form.passwordEditHint') }}
            </cds-control-message>
          </cds-password>
        </cds-control>

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
            size="sm"
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
              v-if="testResult.detail && testResult.detail.vSphereVersion"
              class="resource-test-detail"
            >
              vSphere {{ testResult.detail.vSphereVersion }} · {{ testResult.detail.contentLibraries.length }} 个内容库
            </div>
            <cds-button-action
              shape="times"
              :title="locale.t('common.cancel')"
              :aria-label="locale.t('common.cancel')"
              @click="dismissTestResult"
            ></cds-button-action>
          </cds-alert>
        </div>

        <!-- Content library dropdown: appears after a successful test -->
        <cds-control v-if="contentLibraries.length > 0 || selectedLibrary">
          <cds-select>
            <label>{{ locale.t('resources.form.contentLibrary') }}</label>
            <select
              :value="selectedLibrary"
              @change="(e: Event) => selectedLibrary = (e.target as HTMLSelectElement).value"
            >
              <option value="" disabled>{{ locale.t('resources.form.contentLibrarySelect') }}</option>
              <option v-for="lib in contentLibraries" :key="lib" :value="lib">{{ lib }}</option>
            </select>
          </cds-select>
        </cds-control>
      </form>
    </cds-modal-content>

    <cds-modal-actions>
      <cds-button type="button" action="outline" @click="close">
        {{ locale.t('common.cancel') }}
      </cds-button>
      <cds-button
        type="submit"
        action="solid"
        status="primary"
        :disabled="!canSubmit"
        @click="onSubmit"
      >
        {{ locale.t('resources.form.submit') }}
      </cds-button>
    </cds-modal-actions>
  </cds-modal>
</template>

<style scoped>
/* cds-modal is teleported to <body>, so deep selectors are required to size
   the host. Same width as ModelGatewayFormModal (560px) so the two dialogs
   read as the same family at the same breakpoint. */
:deep(cds-modal) {
  --width: 560px;
}

/* Match ModelGatewayFormModal: the form should not span the full modal
   content width — the columns would leave inputs visually over-long.
   `align:stretch` on the form itself still stretches internal controls
   to the form's max width (70% of the modal content), which is the
   intended "Compact 2-column" clarity form layout. */
.resource-form {
  max-width: 70%;
}

.resource-check {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  cursor: pointer;
  /* Push the checkbox row to the right of the cds-input label column so its
     left edge lines up with the vCenter 密码 input's text (i.e. the
     start of the input column). Same 24px offset as ModelGatewayFormModal's
     test-connection-row. */
  margin-left: 24px;
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
  /* Same 24px left offset as .resource-check above and as
     ModelGatewayFormModal's .test-connection-row: the 测试连接 button
     should line up under the vCenter 密码 input column, not the modal edge. */
  margin-left: 24px;
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

/* Mark for backend-required fields. Same CSS contract as UserFormDialog.vue
   and ModelGatewayFormModal.vue. */
.required-mark {
  color: var(--cds-alias-status-danger, #c21d00);
  font-size: 0.7em;
  font-weight: 700;
  line-height: 1;
  margin-left: 1px;
  display: inline-block;
  vertical-align: top;
  /* Lift the asterisk above the cap-line of the label baseline. */
  position: relative;
  top: -0.25em;
}
</style>
