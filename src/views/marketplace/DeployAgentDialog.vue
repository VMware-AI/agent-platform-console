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
import { computed, ref, watch } from 'vue'
import { useQuery } from '@vue/apollo-composable'
import { useLocaleStore } from '@/stores/locale'
import { VSPHERE_RESOURCE_POOLS_QUERY } from '@/api/graphql/queries/vsphere'
import type {
  DeployAgentInput,
  OvaTemplateFamily,
  OvaTemplateVersion,
  ResourcePool,
  VsphereResourcePool,
  VsphereResourcePoolsQueryResult,
  VsphereResourcePoolsQueryVars,
} from '@/api/graphql/types'
import type { DepartmentNode } from '@/api/graphql/queries/departments'
import '@/components/icons'

const props = defineProps<{
  open: boolean
  template: OvaTemplateFamily | null
  pools: ResourcePool[]
  departments: DepartmentNode[]
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
// The selected vSphere placement pool's inventory PATH (sent as targetResourcePool).
const targetResourcePool = ref('')
const hostname = ref('')
// The chosen department whose gateway issues the agent's virtual key + whose
// gateway public_url is baked into cloud-init (LLD-13 §3.3). '' = platform default.
const departmentId = ref<string>('')
// Bound to a <input type="number"> whose v-model coerces a typed value to a JS
// number, so the runtime type is string | number ('' when blank). Normalize via
// String(...) before any string op (see budgetValid / submit).
const maxBudget = ref<string | number>('')
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
      departmentId.value = ''
      maxBudget.value = ''
      attempted.value = false
    }
  },
  { immediate: true },
)

/* ---- Live vSphere placement pools (keyed off the selected platform pool) ----
   Re-queries whenever the platform resource pool changes. Only enabled while the
   dialog is open with a pool selected, so we don't dial vCenter unnecessarily. */
const vsphereVars = computed<VsphereResourcePoolsQueryVars>(() => ({
  resourcePoolId: resourcePoolId.value,
}))
const vsphereEnabled = computed(() => props.open && !!resourcePoolId.value)
const {
  result: vsphereResult,
  loading: vspherePoolsLoading,
} = useQuery<VsphereResourcePoolsQueryResult, VsphereResourcePoolsQueryVars>(
  VSPHERE_RESOURCE_POOLS_QUERY,
  vsphereVars,
  () => ({ enabled: vsphereEnabled.value, fetchPolicy: 'cache-and-network' }),
)
const vspherePools = computed<VsphereResourcePool[]>(
  () => vsphereResult.value?.vsphereResourcePools ?? [],
)

// When the available pools change (pool switched / first load), keep the
// selection valid: clear it if the previously picked path is no longer offered.
watch(vspherePools, (pools) => {
  if (targetResourcePool.value && !pools.some((p) => p.path === targetResourcePool.value)) {
    targetResourcePool.value = ''
  }
})

const versionValid = () => !!templateVersionId.value
const poolValid = () => !!resourcePoolId.value
const nameValid = () => name.value.trim().length > 0
const budgetValid = () => {
  const raw = String(maxBudget.value).trim()
  if (!raw) return true
  const n = Number(raw)
  return Number.isFinite(n) && n >= 0
}
// A placement pool is required when vCenter offers any (a real OVA template has
// no source pool). When the list is empty (vcsim / regular-VM sources), an empty
// selection is allowed — the clone inherits the source template's pool.
const targetPoolValid = () =>
  vspherePools.value.length === 0 || !!targetResourcePool.value

function formValid(): boolean {
  return versionValid() && poolValid() && nameValid() && targetPoolValid() && budgetValid()
}

function submit() {
  attempted.value = true
  if (!formValid()) return
  const rawBudget = String(maxBudget.value).trim()
  const budget = rawBudget ? Number(rawBudget) : null
  emit('submit', {
    name: name.value.trim(),
    templateFamilyId: props.template?.id ?? '',
    templateVersionId: templateVersionId.value,
    resourcePoolId: resourcePoolId.value,
    // The department whose gateway routes this agent (LLD-13 §3.3); '' → null = default.
    departmentId: departmentId.value || null,
    // The picked vSphere pool's inventory PATH. A true OVA template has no source
    // resource pool, so a real deploy must place the clone here; empty inherits
    // the source's pool (only valid for regular-VM sources, e.g. vcsim).
    targetResourcePool: targetResourcePool.value || null,
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

        <!-- vSphere 放置资源池：真实 OVA 模板无源资源池，部署必须指定一个放置池。
             列表来自所选平台资源池对应 vCenter 的实时枚举；为空（vcsim/常规 VM）时
             允许不选，克隆继承源模板所在池。 -->
        <cds-select
          class="full-row"
          :status="attempted && !targetPoolValid() ? 'error' : 'neutral'"
        >
          <label>{{ locale.t('marketplace.deploy.targetPool') }}</label>
          <select
            v-model="targetResourcePool"
            :disabled="vspherePoolsLoading || vspherePools.length === 0"
          >
            <option value="">
              {{
                vspherePoolsLoading
                  ? locale.t('marketplace.deploy.targetPoolLoading')
                  : vspherePools.length === 0
                    ? locale.t('marketplace.deploy.targetPoolEmpty')
                    : locale.t('marketplace.deploy.targetPoolPlaceholder')
              }}
            </option>
            <option
              v-for="p in vspherePools"
              :key="p.path"
              :value="p.path"
            >
              {{ p.name }} — {{ p.path }}
            </option>
          </select>
          <cds-control-message v-if="attempted && !targetPoolValid()" status="error">
            {{ locale.t('marketplace.deploy.error.targetPool') }}
          </cds-control-message>
        </cds-select>

        <!-- 部门（可选）：决定由哪个部门的网关发放该智能体的虚拟密钥，并将该网关
             public_url 注入 cloud-init（LLD-13 §3.3）。不选 = 平台默认网关。 -->
        <cds-select class="full-row">
          <label>{{ locale.t('marketplace.deploy.department') }}</label>
          <select v-model="departmentId">
            <option value="">{{ locale.t('marketplace.deploy.departmentDefault') }}</option>
            <option v-for="d in props.departments" :key="d.id" :value="d.id">
              {{ d.name }}
            </option>
          </select>
          <cds-control-message status="neutral">
            {{ locale.t('marketplace.deploy.departmentHint') }}
          </cds-control-message>
        </cds-select>

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
