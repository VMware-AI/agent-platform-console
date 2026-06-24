<script setup lang="ts">
/**
 * Deploy Agent Dialog — selects a template version, target pool, model
 * gateway, virtual key (existing or new), and collects the run-as
 * username + password (with confirmation + complexity check).
 */
import { computed, ref, watch } from 'vue'
import { useQuery } from '@vue/apollo-composable'
import { useLocaleStore } from '@/stores/locale'
import { passwordMeets } from '@/composables/usePasswordComplexity'
import { AVAILABLE_VIRTUAL_KEYS_QUERY } from '@/api/graphql/queries/ovaTemplates'
import type {
  DeployAgentInput,
  ModelGatewayRef,
  OvaTemplateFamily,
  OvaTemplateVersion,
  ResourcePool,
  VirtualKey,
  VirtualKeyMode,
} from '@/api/graphql/types'
import '@/components/icons'

const props = defineProps<{
  open: boolean
  template: OvaTemplateFamily | null
  pools: ResourcePool[]
  modelGateways: ModelGatewayRef[]
  deploying: boolean
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'submit', input: DeployAgentInput): void
}>()

const locale = useLocaleStore()

const templateVersionId = ref<string>('')
const resourcePoolId = ref<string>('')
const modelGatewayId = ref<string>('')
const virtualKeyMode = ref<VirtualKeyMode>('USE_EXISTING')
const existingVirtualKeyId = ref<string>('')
const newVirtualKeyName = ref<string>('')
const name = ref('')
const username = ref('')
const password = ref('')
const confirmPassword = ref('')
const description = ref('')
const attempted = ref(false)
const usernameTaken = ref(false)

watch(
  () => props.open,
  (o) => {
    if (o && props.template) {
      const latest = props.template.versions[props.template.versions.length - 1]
      templateVersionId.value = latest?.id ?? ''
      resourcePoolId.value = props.pools[0]?.id ?? ''
      modelGatewayId.value = props.modelGateways[0]?.id ?? ''
      virtualKeyMode.value = 'USE_EXISTING'
      existingVirtualKeyId.value = ''
      newVirtualKeyName.value = ''
      name.value = `${props.template.name}_${Date.now() % 100000}`
      username.value = ''
      password.value = ''
      confirmPassword.value = ''
      description.value = ''
      attempted.value = false
      usernameTaken.value = false
    }
  },
  { immediate: true },
)

/* ---- dynamic available-keys query (depends on modelGatewayId) ---- */
const availableKeysResult = useQuery<{ availableVirtualKeys: VirtualKey[] }>(
  AVAILABLE_VIRTUAL_KEYS_QUERY,
  () => ({ modelGatewayId: modelGatewayId.value || null }),
  () => ({ enabled: !!modelGatewayId.value && props.open, fetchPolicy: 'cache-and-network' }),
)
const availableKeys = computed<VirtualKey[]>(
  () => availableKeysResult.result.value?.availableVirtualKeys ?? [],
)
watch(availableKeys, (keys) => {
  if (virtualKeyMode.value === 'USE_EXISTING' && keys.length > 0) {
    if (!existingVirtualKeyId.value || !keys.find((k) => k.id === existingVirtualKeyId.value)) {
      existingVirtualKeyId.value = keys[0]?.id ?? ''
    }
  } else if (virtualKeyMode.value === 'USE_EXISTING' && keys.length === 0) {
    existingVirtualKeyId.value = ''
  }
})
watch(modelGatewayId, () => {
  existingVirtualKeyId.value = ''
})

const complexity = computed(() => passwordMeets(password.value))
const passwordsMatch = computed(() => password.value === confirmPassword.value && password.value.length > 0)

const versionValid = computed(() => !!templateVersionId.value)
const poolValid = computed(() => !!resourcePoolId.value)
const gwValid = computed(() => !!modelGatewayId.value)
const virtualKeyValid = computed(() =>
  virtualKeyMode.value === 'USE_EXISTING' ? !!existingVirtualKeyId.value : newVirtualKeyName.value.trim().length > 0,
)
const nameValid = computed(() => name.value.trim().length > 0)
const usernameValid = computed(() => username.value.trim().length > 0 && !usernameTaken.value)

const formValid = computed(
  () =>
    versionValid.value &&
    poolValid.value &&
    gwValid.value &&
    virtualKeyValid.value &&
    nameValid.value &&
    usernameValid.value &&
    complexity.value.ok &&
    passwordsMatch.value,
)

function onModeChange(mode: VirtualKeyMode) {
  virtualKeyMode.value = mode
  if (mode === 'USE_EXISTING') {
    newVirtualKeyName.value = ''
    existingVirtualKeyId.value = availableKeys.value[0]?.id ?? ''
  } else {
    existingVirtualKeyId.value = ''
  }
}

function submit() {
  attempted.value = true
  if (!formValid.value) return
  emit('submit', {
    templateVersionId: templateVersionId.value,
    resourcePoolId: resourcePoolId.value,
    modelGatewayId: modelGatewayId.value,
    virtualKeyMode: virtualKeyMode.value,
    existingVirtualKeyId:
      virtualKeyMode.value === 'USE_EXISTING' ? existingVirtualKeyId.value : null,
    newVirtualKeyName:
      virtualKeyMode.value === 'CREATE_NEW' ? newVirtualKeyName.value.trim() : null,
    name: name.value.trim(),
    username: username.value.trim(),
    password: password.value,
    description: description.value.trim() || null,
  })
}

function close() {
  emit('close')
}

function fmtVersionRow(v: OvaTemplateVersion): string {
  const isLatest = v.version === props.template?.latestVersion
  return `${v.version}${isLatest ? ` · ${locale.t('marketplace.deploy.versionLatest')}` : ''}`
}
</script>

<template>
  <cds-modal
    :hidden="!props.open"
    :closable="!props.deploying"
    size="lg"
    @closeChange="close"
  >
    <cds-modal-header>
      <h2 cds-text="title" class="modal-title">
        {{ locale.t('marketplace.deploy.title') }}
      </h2>
    </cds-modal-header>
    <cds-modal-content>
      <form class="deploy-form" @submit.prevent="submit">
        <!-- 模板信息条 -->
        <cds-alert v-if="props.template" status="info" class="deploy-info">
          <cds-alert-content>
            {{ props.template.name }} ·
            {{ props.template.versions.length }} 个版本可选
          </cds-alert-content>
        </cds-alert>

        <!-- 版本 -->
        <cds-select
          class="full-row"
          :status="attempted && !versionValid ? 'error' : 'neutral'"
        >
          <label>{{ locale.t('marketplace.deploy.version') }}</label>
          <select v-model="templateVersionId">
            <option
              v-for="v in props.template?.versions ?? []"
              :key="v.id"
              :value="v.id"
            >
              {{ fmtVersionRow(v) }}
            </option>
          </select>
          <cds-control-message v-if="attempted && !versionValid" status="error">
            {{ locale.t('marketplace.deploy.error.version') }}
          </cds-control-message>
        </cds-select>

        <!-- 资源池 -->
        <cds-select :status="attempted && !poolValid ? 'error' : 'neutral'">
          <label>{{ locale.t('marketplace.deploy.pool') }}</label>
          <select v-model="resourcePoolId">
            <option
              v-for="p in props.pools"
              :key="p.id"
              :value="p.id"
            >
              {{ p.name }} — {{ p.endpoint }}
            </option>
          </select>
          <cds-control-message v-if="attempted && !poolValid" status="error">
            {{ locale.t('marketplace.deploy.error.pool') }}
          </cds-control-message>
        </cds-select>

        <!-- 模型网关 -->
        <cds-select :status="attempted && !gwValid ? 'error' : 'neutral'">
          <label>{{ locale.t('marketplace.deploy.modelGateway') }}</label>
          <select v-model="modelGatewayId">
            <option
              v-for="mg in props.modelGateways"
              :key="mg.id"
              :value="mg.id"
            >
              {{ mg.name }} — {{ mg.endpoint }}
            </option>
          </select>
          <cds-control-message v-if="attempted && !gwValid" status="error">
            {{ locale.t('marketplace.deploy.error.modelGateway') }}
          </cds-control-message>
        </cds-select>

        <!-- 虚拟密钥 toggle -->
        <div class="vk-toggle full-row">
          <span cds-text="body" class="vk-toggle-label">
            {{ locale.t('marketplace.deploy.virtualKeyMode') }}
          </span>
          <div class="vk-toggle-buttons">
            <cds-button
              :action="virtualKeyMode === 'USE_EXISTING' ? 'solid' : 'outline'"
              status="primary"
              size="sm"
              type="button"
              @click="onModeChange('USE_EXISTING')"
            >
              {{ locale.t('marketplace.deploy.virtualKeyMode.existing') }}
            </cds-button>
            <cds-button
              :action="virtualKeyMode === 'CREATE_NEW' ? 'solid' : 'outline'"
              status="primary"
              size="sm"
              type="button"
              @click="onModeChange('CREATE_NEW')"
            >
              {{ locale.t('marketplace.deploy.virtualKeyMode.new') }}
            </cds-button>
          </div>
        </div>

        <cds-select
          v-if="virtualKeyMode === 'USE_EXISTING'"
          class="full-row"
          :status="attempted && !virtualKeyValid ? 'error' : 'neutral'"
        >
          <label>{{ locale.t('marketplace.deploy.existingKey') }}</label>
          <select v-model="existingVirtualKeyId">
            <option v-if="availableKeys.length === 0" value="" disabled>
              {{ locale.t('marketplace.deploy.noAvailableKey') }}
            </option>
            <option
              v-for="k in availableKeys"
              :key="k.id"
              :value="k.id"
            >
              {{ k.name }} — {{ k.modelGateway.name }}
            </option>
          </select>
          <cds-control-message
            v-if="attempted && !virtualKeyValid"
            status="error"
          >
            {{ locale.t('marketplace.deploy.error.virtualKey') }}
          </cds-control-message>
        </cds-select>

        <cds-input
          v-else
          class="full-row"
          :status="attempted && !virtualKeyValid ? 'error' : 'neutral'"
        >
          <label>{{ locale.t('marketplace.deploy.newKeyName') }}</label>
          <input
            v-model="newVirtualKeyName"
            :placeholder="locale.t('marketplace.deploy.newKeyNamePlaceholder')"
          />
          <cds-control-message
            v-if="attempted && !virtualKeyValid"
            status="error"
          >
            {{ locale.t('marketplace.deploy.error.virtualKey') }}
          </cds-control-message>
        </cds-input>

        <!-- 智能体名 + 运行账户用户名 -->
        <cds-input :status="attempted && !nameValid ? 'error' : 'neutral'">
          <label>{{ locale.t('marketplace.deploy.name') }}</label>
          <input
            v-model="name"
            :placeholder="locale.t('marketplace.deploy.namePlaceholder')"
          />
          <cds-control-message v-if="attempted && !nameValid" status="error">
            {{ locale.t('marketplace.deploy.error.name') }}
          </cds-control-message>
        </cds-input>

        <cds-input
          :status="attempted && !usernameValid ? 'error' : 'neutral'"
        >
          <label>{{ locale.t('marketplace.deploy.username') }}</label>
          <input
            v-model="username"
            :placeholder="locale.t('marketplace.deploy.usernamePlaceholder')"
          />
          <cds-control-message v-if="attempted && !usernameValid" status="error">
            {{
              usernameTaken
                ? locale.t('marketplace.deploy.error.usernameTaken')
                : locale.t('marketplace.deploy.error.username')
            }}
          </cds-control-message>
        </cds-input>

        <!-- 密码 + 确认 -->
        <cds-password
          :status="attempted && !complexity.ok ? 'error' : 'neutral'"
        >
          <label>{{ locale.t('marketplace.deploy.password') }}</label>
          <input v-model="password" type="password" />
          <cds-control-message
            v-if="attempted && !complexity.ok"
            status="error"
          >
            {{ locale.t('marketplace.deploy.passwordWeak') }}
          </cds-control-message>
        </cds-password>

        <cds-password
          :status="attempted && !passwordsMatch ? 'error' : 'neutral'"
        >
          <label>{{ locale.t('marketplace.deploy.confirmPassword') }}</label>
          <input v-model="confirmPassword" type="password" />
          <cds-control-message
            v-if="attempted && !passwordsMatch"
            status="error"
          >
            {{ locale.t('marketplace.deploy.passwordMismatch') }}
          </cds-control-message>
        </cds-password>

        <!-- 描述 -->
        <cds-input class="full-row">
          <label>{{ locale.t('marketplace.deploy.description') }}</label>
          <textarea v-model="description" rows="2"></textarea>
        </cds-input>
      </form>
    </cds-modal-content>
    <cds-modal-actions>
      <cds-button action="outline" :disabled="props.deploying" @click="close">
        {{ locale.t('marketplace.deploy.cancel') }}
      </cds-button>
      <cds-button
        :loading-state="props.deploying ? 'loading' : 'default'"
        :disabled="props.deploying"
        @click="submit"
      >
        {{ locale.t('marketplace.deploy.submit') }}
      </cds-button>
    </cds-modal-actions>
  </cds-modal>
</template>

<style scoped>
.deploy-form {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}
.deploy-form .full-row {
  grid-column: 1 / -1;
}
.deploy-info {
  margin: 0 0 4px 0;
}
.modal-title {
  margin: 0;
}
.vk-toggle {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.vk-toggle-label {
  font-weight: 600;
}
.vk-toggle-buttons {
  display: flex;
  gap: 8px;
}
</style>
