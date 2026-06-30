<script setup lang="ts">
/**
 * ModelGatewayFormModal — create dialog for a model gateway.
 *
 * Edit flow was removed; this modal is now create-only. The "测试连接"
 * button calls `testNewModelGatewayConnection` (a pre-create dry-run probe)
 * before the user submits.
 *
 * Backend contract (see Postman § Model Gateways (LITELLM)):
 *   - `ModelGatewayInput` only accepts `name / provider / endpoint / masterKey`.
 *     `loadBalancingStrategy` and `backendModelCount` are read-only,
 *     populated by sync; `adminUrl` is not an input.
 */
import { computed, ref, watch } from 'vue'
import { useMutation } from '@vue/apollo-composable'
import { useLocaleStore } from '@/stores/locale'
import { useToast } from '@/composables/useToast'
import { graphqlErrorMessage } from '@/api/graphql/errors'
import { TEST_NEW_MODEL_GATEWAY_CONNECTION } from '@/api/graphql/queries/model-gateways'
import type {
  ModelGatewayInput,
  ModelGatewayProvider,
  TestNewModelGatewayConnectionPayload,
  TestNewModelGatewayConnectionVars,
} from '@/types/model-gateway'

const props = defineProps<{
  open: boolean
  saving: boolean
}>()

const emit = defineEmits<{
  (event: 'close'): void
  (event: 'submit', input: ModelGatewayInput): void
}>()

const locale = useLocaleStore()
const toast = useToast()

/* ---------- form state ---------- */
const name = ref('')
const endpoint = ref('')
const masterKey = ref('')
/* Selected gateway type. Only LiteLLM is currently supported, but the
   selector is open (not disabled) so adding more providers is a
   backend-side change away. */
const provider = ref<ModelGatewayProvider>('LITELLM')
const attempted = ref(false)

/* Test connection state. */
const testing = ref(false)
const testResult = ref<'success' | 'failure' | null>(null)
const testMessage = ref('')

/* ---------- validation ---------- */
function isHTTPURL(value: string): boolean {
  try {
    const parsed = new URL(value)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

const nameValid = computed(() => {
  const length = name.value.trim().length
  return length >= 2 && length <= 64
})
const endpointValid = computed(() => isHTTPURL(endpoint.value.trim()))
/* Master key is required (create mode only — edit was removed). */
const masterKeyValid = computed(() => masterKey.value.trim().length > 0)
const formValid = computed(
  () => nameValid.value && endpointValid.value && masterKeyValid.value,
)

/* The Test Connection button is enabled once the user has supplied enough
   to attempt a real call. A master key is always required. */
const testButtonEnabled = computed(
  () =>
    endpointValid.value &&
    masterKey.value.trim().length > 0 &&
    !testing.value,
)

/* ---------- reset on open ---------- */
function reset() {
  name.value = ''
  endpoint.value = ''
  masterKey.value = ''
  provider.value = 'LITELLM'
  testResult.value = null
  testMessage.value = ''
  testing.value = false
  attempted.value = false
}

watch(
  () => props.open,
  (open) => {
    if (open) reset()
    if (!open) {
      masterKey.value = ''
      testResult.value = null
      testMessage.value = ''
      testing.value = false
    }
  },
  { immediate: true },
)

/* ---------- helpers ---------- */
function normalizeURL(value: string): string {
  return value.trim().replace(/\/+$/, '')
}

/* ---------- test connection ---------- */
const { mutate: testByInput } = useMutation<
  TestNewModelGatewayConnectionPayload,
  TestNewModelGatewayConnectionVars
>(TEST_NEW_MODEL_GATEWAY_CONNECTION)

async function runTest() {
  if (testing.value) return
  if (!endpointValid.value || !masterKey.value.trim()) {
    toast.warning(locale.t('gateway.form.testMissingInput'))
    return
  }
  testing.value = true
  testResult.value = null
  testMessage.value = ''
  try {
    const res = await testByInput({
      input: {
        endpoint: normalizeURL(endpoint.value),
        masterKey: masterKey.value.trim(),
      },
    })
    const result = res?.data?.testNewModelGatewayConnection ?? null
    if (!result) throw new Error('no test result')
    if (result.success) {
      testResult.value = 'success'
      testMessage.value = result.message
      toast.success(
        locale.t('gateway.form.testSuccess').replace('{message}', result.message),
      )
    } else {
      testResult.value = 'failure'
      testMessage.value = result.message
      toast.error(
        locale.t('gateway.form.testFailure').replace('{message}', result.message),
      )
    }
  } catch (err) {
    testResult.value = 'failure'
    testMessage.value = graphqlErrorMessage(err, locale.t('gateway.form.testMissingInput'))
    toast.error(locale.t('gateway.form.testFailure').replace('{message}', testMessage.value))
  } finally {
    testing.value = false
  }
}

/* ---------- submit ---------- */
function submit() {
  attempted.value = true
  if (!formValid.value || props.saving) return
  /* `ModelGatewayInput` on the backend is a strict subset
     (`name / provider / endpoint / masterKey`). `loadBalancingStrategy`
     and `backendModelCount` are read-only — populated by sync, never
     accepted as inputs. `adminUrl` is not stored; the UI is
     `${endpoint}/ui` and is computed on read. */
  emit('submit', {
    name: name.value.trim(),
    provider: provider.value,
    endpoint: normalizeURL(endpoint.value),
    masterKey: masterKey.value.trim() || null,
  })
}

function close() {
  if (props.saving) return
  masterKey.value = ''
  testResult.value = null
  testMessage.value = ''
  testing.value = false
  emit('close')
}
</script>

<template>
  <cds-modal size="md" @closeChange="close">
    <cds-modal-header>
      <h3 cds-text="title">
        {{ locale.t('gateway.form.createTitle') }}
      </h3>
    </cds-modal-header>

    <cds-modal-content>
      <form class="gateway-form" cds-layout="vertical align:stretch gap:md" @submit.prevent="submit">
        <!-- gateway name -->
        <cds-control>
          <cds-input :status="attempted && !nameValid ? 'error' : 'neutral'">
            <label>{{ locale.t('gateway.form.name') }}<sup class="required-mark" aria-hidden="true">{{ locale.t('gateway.form.requiredMark') }}</sup></label>
            <input
              slot="input"
              type="text"
              :value="name"
              maxlength="64"
              autocomplete="off"
              :placeholder="locale.t('gateway.form.namePlaceholder')"
              @input="(e: Event) => name = (e.target as HTMLInputElement).value"
            />
            <cds-control-message v-if="attempted && !nameValid" status="error">
              {{ locale.t('gateway.form.nameError') }}
            </cds-control-message>
          </cds-input>
        </cds-control>

        <!-- gateway type. Only LiteLLM is supported today, but the selector
             is enabled so future providers can be added without UI work. -->
        <cds-control>
          <cds-select>
            <label>{{ locale.t('gateway.form.provider') }}<sup class="required-mark" aria-hidden="true">{{ locale.t('gateway.form.requiredMark') }}</sup></label>
            <select
              :value="provider"
              @change="(e: Event) => provider = (e.target as HTMLSelectElement).value as ModelGatewayProvider"
            >
              <option value="LITELLM">LiteLLM</option>
            </select>
          </cds-select>
        </cds-control>

        <!-- gateway URL (label: 网关地址) -->
        <cds-control>
          <cds-input :status="attempted && !endpointValid ? 'error' : 'neutral'">
            <label>{{ locale.t('gateway.form.endpoint') }}<sup class="required-mark" aria-hidden="true">{{ locale.t('gateway.form.requiredMark') }}</sup></label>
            <input
              slot="input"
              type="url"
              :value="endpoint"
              autocomplete="url"
              placeholder="https://litellm.example.com"
              @input="(e: Event) => endpoint = (e.target as HTMLInputElement).value"
            />
            <cds-control-message v-if="attempted && !endpointValid" status="error">
              {{ locale.t('gateway.form.urlError') }}
            </cds-control-message>
          </cds-input>
        </cds-control>

        <!-- master key. Required (create mode only). -->
        <cds-control>
          <cds-password
            :status="attempted && !masterKeyValid ? 'error' : 'neutral'"
          >
            <label>{{ locale.t('gateway.form.masterKey') }}<sup class="required-mark" aria-hidden="true">{{ locale.t('gateway.form.requiredMark') }}</sup></label>
            <input
              slot="input"
              type="password"
              :value="masterKey"
              autocomplete="new-password"
              :placeholder="locale.t('gateway.form.masterKeyPlaceholder')"
              @input="(e: Event) => masterKey = (e.target as HTMLInputElement).value"
            />
            <cds-control-message v-if="attempted && !masterKeyValid" status="error">
              {{ locale.t('gateway.form.masterKeyError') }}
            </cds-control-message>
          </cds-password>
        </cds-control>

        <!-- test connection button. Sits on its own row, left-aligned, and
             is visually paired with the test result hint that follows it. -->
        <div class="test-connection-row">
          <cds-button
            class="test-connection-btn"
            action="outline"
            status="primary"
            size="sm"
            :loading-state="testing ? 'loading' : 'default'"
            :disabled="!testButtonEnabled"
            data-testid="test-connection"
            @click="runTest"
          >
            {{ locale.t('gateway.form.testConnection') }}
          </cds-button>
        </div>

        <!-- test result hint. Stays sticky until the next test or close.
             Rendered as a plain <div> (same pattern as UserFormDialog.vue's
             password complexity feedback) because cds-control-message is
             only projected correctly when nested inside cds-input / cds-select.
             Placed immediately BELOW the test button so the user sees the
             status right where they clicked. -->
        <div
          v-if="testResult"
          :class="['test-result', `test-result--${testResult}`]"
          data-testid="test-result"
        >
          {{ testMessage }}
        </div>

        </form>
    </cds-modal-content>

    <cds-modal-actions>
      <cds-button action="outline" :disabled="saving" @click="close">
        {{ locale.t('gateway.action.cancel') }}
      </cds-button>
      <cds-button
        type="submit"
        action="solid"
        status="primary"
        :loading-state="saving ? 'loading' : 'default'"
        :disabled="saving"
        @click="submit"
      >
        {{ locale.t('gateway.action.connect') }}
      </cds-button>
    </cds-modal-actions>
  </cds-modal>
</template>

<style scoped>
.gateway-form {
  /* Vertical Clarity layout drives gap/alignment. max-width matches
     UserFormDialog.vue so the form reads as compact. */
  max-width: 70%;
  margin-left: 0;
  margin-right: auto;
}

/* Test Connection button. Lives in its own row (left-aligned). Its
   left edge is offset by `padding-left: 24px` to align with the input
   field's text content (past the label column at default Clarity
   density). The status hint below uses the same offset. */
.test-connection-row {
  display: flex;
  justify-content: flex-start;
  padding-left: 24px;
}
.test-connection-btn {
  /* Extra breathing room from the master key field above so the button
     doesn't crowd the password input's bottom border. */
  margin-top: 12px;
}

/* Test result hint. Rendered BELOW the test-connection button. The
   margin-top keeps a small breathing room from the button above. The
   `padding-left` keeps it aligned with the input column. */
.test-result {
  font-size: 12px;
  margin: 12px 0 0;
  padding-left: 24px;
  line-height: 1.5;
}
.test-result--success {
  color: var(--cds-alias-status-success, #007c4d);
}
.test-result--failure {
  color: var(--cds-alias-status-danger, #c21d00);
}

/* Mark for backend-required fields. Same CSS contract as UserFormDialog.vue:
   crimson color, 0.7em, floats above the cap-line via negative top margin. */
.required-mark {
  color: var(--cds-alias-status-danger, #c21d00);
  font-size: 0.7em;
  font-weight: 700;
  line-height: 1;
  margin: -0.5em 0 0 1px;
  display: inline-block;
}

/* cds-modal is teleported to <body>, so deep selectors are required to size
   the host. Same as UserFormDialog.vue. */
:deep(cds-modal) {
  --width: 560px;
}
</style>