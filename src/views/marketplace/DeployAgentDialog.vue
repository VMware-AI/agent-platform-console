<script setup lang="ts">
/**
 * Deploy Agent Dialog — creates a NEW agent from an OVA template version. Picks a
 * version + target resource pool, names the agent, and optionally sets a cloud-init
 * hostname / per-key budget cap.
 *
 * The marketplace no longer picks or creates a virtual key: the backend ISSUES the
 * gateway key as part of provisioning and returns its secret ONCE
 * (DeployedAgent.virtualKeySecret), surfaced afterward in a reveal dialog
 * (see AgentMarketplaceView → VirtualKeySecretDialog).
 */
import { ref, watch } from 'vue'
import { useLocaleStore } from '@/stores/locale'
import type {
  DeployAgentInput,
  OvaTemplateFamily,
  OvaTemplateVersion,
  ResourcePool,
} from '@/api/graphql/types'
import '@/components/icons'

const props = defineProps<{
  open: boolean
  template: OvaTemplateFamily | null
  pools: ResourcePool[]
  deploying: boolean
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'submit', input: DeployAgentInput): void
}>()

const locale = useLocaleStore()

const templateVersionId = ref<string>('')
const resourcePoolId = ref<string>('')
const name = ref('')
const targetResourcePool = ref('')
const hostname = ref('')
const maxBudget = ref('')
const attempted = ref(false)

watch(
  () => props.open,
  (o) => {
    if (o && props.template) {
      // Backend returns versions NEWEST-first, so the newest is index 0.
      const latest = props.template.versions[0]
      templateVersionId.value = latest?.id ?? ''
      resourcePoolId.value = props.pools[0]?.id ?? ''
      name.value = `${props.template.name}_${Date.now() % 100000}`
      targetResourcePool.value = ''
      hostname.value = ''
      maxBudget.value = ''
      attempted.value = false
    }
  },
  { immediate: true },
)

const versionValid = () => !!templateVersionId.value
const poolValid = () => !!resourcePoolId.value
const nameValid = () => name.value.trim().length > 0
const budgetValid = () => {
  if (!maxBudget.value.trim()) return true
  const n = Number(maxBudget.value)
  return Number.isFinite(n) && n >= 0
}

function formValid(): boolean {
  return versionValid() && poolValid() && nameValid() && budgetValid()
}

function submit() {
  attempted.value = true
  if (!formValid()) return
  const budget = maxBudget.value.trim() ? Number(maxBudget.value) : null
  emit('submit', {
    name: name.value.trim(),
    templateFamilyId: props.template?.id ?? '',
    templateVersionId: templateVersionId.value,
    resourcePoolId: resourcePoolId.value,
    // A true OVA template has no source resource pool, so a real deploy must name
    // a vSphere placement pool here; empty inherits the source's pool (regular VMs).
    targetResourcePool: targetResourcePool.value.trim() || null,
    hostname: hostname.value.trim() || null,
    maxBudget: budget,
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
          :status="attempted && !versionValid() ? 'error' : 'neutral'"
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
          <cds-control-message v-if="attempted && !versionValid()" status="error">
            {{ locale.t('marketplace.deploy.error.version') }}
          </cds-control-message>
        </cds-select>

        <!-- 资源池 -->
        <cds-select
          class="full-row"
          :status="attempted && !poolValid() ? 'error' : 'neutral'"
        >
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
          <cds-control-message v-if="attempted && !poolValid()" status="error">
            {{ locale.t('marketplace.deploy.error.pool') }}
          </cds-control-message>
        </cds-select>

        <!-- 智能体名 -->
        <cds-input :status="attempted && !nameValid() ? 'error' : 'neutral'">
          <label>{{ locale.t('marketplace.deploy.name') }}</label>
          <input
            v-model="name"
            :placeholder="locale.t('marketplace.deploy.namePlaceholder')"
          />
          <cds-control-message v-if="attempted && !nameValid()" status="error">
            {{ locale.t('marketplace.deploy.error.name') }}
          </cds-control-message>
        </cds-input>

        <!-- 主机名（可选） -->
        <cds-input>
          <label>{{ locale.t('marketplace.deploy.hostname') }}</label>
          <input
            v-model="hostname"
            :placeholder="locale.t('marketplace.deploy.hostnamePlaceholder')"
          />
        </cds-input>

        <!-- vSphere 资源池（可选）：真实 OVA 模板无源资源池，部署必须指定 -->
        <cds-input>
          <label>{{ locale.t('marketplace.deploy.targetPool') }}</label>
          <input
            v-model="targetResourcePool"
            :placeholder="locale.t('marketplace.deploy.targetPoolPlaceholder')"
          />
        </cds-input>

        <!-- 预算上限（可选） -->
        <cds-input :status="attempted && !budgetValid() ? 'error' : 'neutral'">
          <label>{{ locale.t('marketplace.deploy.maxBudget') }}</label>
          <input
            v-model="maxBudget"
            type="number"
            min="0"
            step="0.01"
            :placeholder="locale.t('marketplace.deploy.maxBudgetPlaceholder')"
          />
          <cds-control-message v-if="attempted && !budgetValid()" status="error">
            {{ locale.t('marketplace.deploy.error.maxBudget') }}
          </cds-control-message>
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
</style>
