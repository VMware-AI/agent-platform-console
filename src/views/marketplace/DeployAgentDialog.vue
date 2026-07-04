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
import { VSPHERE_RESOURCE_POOLS_QUERY, VSPHERE_NETWORKS_QUERY } from '@/api/graphql/queries/vsphere'
import type { ResourcePool } from '@/types/resource-pool'
import type {
  DeployAgentInput,
  OvaTemplateFamily,
  OvaTemplateVersion,
  VsphereResourcePool,
  VsphereResourcePoolsQueryResult,
  VsphereResourcePoolsQueryVars,
  VsphereNetwork,
  VsphereNetworksQueryResult,
  VsphereNetworksQueryVars,
} from '@/types/marketplace'
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
// The selected vSphere placement pool's inventory PATH (sent as targetResourcePool).
const targetResourcePool = ref('')
// The selected vSphere portgroup PATH (sent as targetNetwork; '' = inherit template NIC).
const targetNetwork = ref('')
const hostname = ref('')
// Bound to a <input type="number"> whose v-model coerces a typed value to a JS
// number, so the runtime type is string | number ('' when blank). Normalize via
// String(...) before any string op (see budgetValid / submit).
const maxBudget = ref<string | number>('')
// Initial login password for the agent VM (UI + OS). Optional — empty seeds nothing.
// A typo would lock the user out (they'd never know the seeded password), so we
// require a matching confirm + mirror the webadmin policy (12–72 bytes, no ':'/ctrl).
const initialPassword = ref('')
const confirmPassword = ref('')
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
      targetNetwork.value = ''
      hostname.value = ''
      maxBudget.value = ''
      initialPassword.value = ''
      confirmPassword.value = ''
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

/* ---- Live vSphere networks / portgroups ---- */
const networksVars = computed<VsphereNetworksQueryVars>(() => ({
  resourcePoolId: resourcePoolId.value,
}))
const {
  result: networksResult,
  loading: networksLoading,
} = useQuery<VsphereNetworksQueryResult, VsphereNetworksQueryVars>(
  VSPHERE_NETWORKS_QUERY,
  networksVars,
  () => ({ enabled: vsphereEnabled.value, fetchPolicy: 'cache-and-network' }),
)
const vsphereNetworks = computed<VsphereNetwork[]>(
  () => networksResult.value?.vsphereNetworks ?? [],
)

// Group portgroups by their dvSwitch name (distributed) or 'Standard' bucket.
const networksGrouped = computed(() => {
  const groups: Record<string, VsphereNetwork[]> = {}
  for (const n of vsphereNetworks.value) {
    const key = n.type === 'distributed' ? (n.dvsName || 'Distributed vSwitch') : 'Standard'
    if (!groups[key]) groups[key] = []
    groups[key].push(n)
  }
  return groups
})

watch(vsphereNetworks, (nets) => {
  if (targetNetwork.value && !nets.some((n) => n.path === targetNetwork.value)) {
    targetNetwork.value = ''
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
// '' = fine (no password seeded). Otherwise mirror the webadmin policy and require
// the confirm to match. Returns the locale key of the first violation, or '' if ok.
function pwErrorKey(): string {
  const p = initialPassword.value
  if (!p && !confirmPassword.value) return ''
  // Mirror the backend seed policy (agent-platform-backend
  // internal/graph/deploy_targets.go validateInitialPassword), which itself
  // mirrors the VM webadmin: reject edge whitespace (the seeder trims, so a
  // padded value silently seeds a different credential), then ≥12 code points,
  // ≤72 bytes (bcrypt truncates past 72), no ':' (htpasswd/chpasswd delimiter),
  // and no control chars incl. C1 (an interior newline smuggles a second
  // "user:password" line into chpasswd).
  if (p !== p.trim()) return 'marketplace.deploy.error.passwordChars'
  if ([...p].length < 12 || new TextEncoder().encode(p).length > 72) {
    return 'marketplace.deploy.error.passwordWeak'
  }
  if (p.includes(':') || /\p{Cc}/u.test(p)) return 'marketplace.deploy.error.passwordChars'
  if (p !== confirmPassword.value) return 'marketplace.deploy.error.passwordMismatch'
  return ''
}
const pwValid = () => pwErrorKey() === ''
// A placement pool is required when vCenter offers any (a real OVA template has
// no source pool). When the list is empty (vcsim / regular-VM sources), an empty
// selection is allowed — the clone inherits the source template's pool.
const targetPoolValid = () =>
  vspherePools.value.length === 0 || !!targetResourcePool.value

function formValid(): boolean {
  return (
    versionValid() && poolValid() && nameValid() && targetPoolValid() && budgetValid() && pwValid()
  )
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
    // The picked vSphere pool's inventory PATH. A true OVA template has no source
    // resource pool, so a real deploy must place the clone here; empty inherits
    // the source's pool (only valid for regular-VM sources, e.g. vcsim).
    targetResourcePool: targetResourcePool.value || null,
    targetNetwork: targetNetwork.value || null,
    hostname: hostname.value.trim() || null,
    maxBudget: budget,
    // Empty = no credential seeded; otherwise the VM's webadmin seeds UI + OS at boot.
    initialPassword: initialPassword.value || null,
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
            {{ locale.t('marketplace.deploy.versionCount').replace('{n}', String(props.template.versions.length)) }}
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

        <!-- 初始登录密码（可选）：留空则首启不种密码；填写则 VM 内 webadmin 首启把它
             同时写入网页登录(nginx htpasswd)与系统用户。带确认框防打错锁死。 -->
        <cds-input :status="attempted && !pwValid() ? 'error' : 'neutral'">
          <label>{{ locale.t('marketplace.deploy.initialPassword') }}</label>
          <input v-model="initialPassword" type="password" autocomplete="new-password" />
        </cds-input>
        <cds-input :status="attempted && !pwValid() ? 'error' : 'neutral'">
          <label>{{ locale.t('marketplace.deploy.confirmPassword') }}</label>
          <input v-model="confirmPassword" type="password" autocomplete="new-password" />
          <cds-control-message v-if="attempted && !pwValid()" status="error">
            {{ locale.t(pwErrorKey()) }}
          </cds-control-message>
        </cds-input>
        <cds-alert status="info" class="full-row deploy-info">
          <cds-alert-content>{{ locale.t('marketplace.deploy.initialPasswordHint') }}</cds-alert-content>
        </cds-alert>

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

        <!-- 目标网络/端口组（可选）：标准端口组直接列出，分布式端口组按 dvSwitch 分组 -->
        <cds-select class="full-row">
          <label>{{ locale.t('marketplace.deploy.targetNetwork') }}</label>
          <select
            v-model="targetNetwork"
            :disabled="networksLoading || vsphereNetworks.length === 0"
          >
            <option value="">
              {{
                networksLoading
                  ? locale.t('marketplace.deploy.targetNetworkLoading')
                  : vsphereNetworks.length === 0
                    ? locale.t('marketplace.deploy.targetNetworkEmpty')
                    : locale.t('marketplace.deploy.targetNetworkPlaceholder')
              }}
            </option>
            <template v-for="(nets, groupName) in networksGrouped" :key="groupName">
              <optgroup :label="String(groupName)">
                <option
                  v-for="n in nets"
                  :key="n.path"
                  :value="n.path"
                >
                  {{ n.name }}
                </option>
              </optgroup>
            </template>
          </select>
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
