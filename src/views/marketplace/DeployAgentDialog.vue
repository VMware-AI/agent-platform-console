<script setup lang="ts">
/* eslint-disable */
 
/* eslint-disable @typescript-eslint/no-explicit-any */
import { computed, reactive, ref, watch } from 'vue'
import { useQuery } from '@vue/apollo-composable'
import gql from 'graphql-tag'
import { VSPHERE_RESOURCE_POOLS_QUERY, VSPHERE_NETWORKS_QUERY, UNBOUND_KEYS_QUERY, INSTANT_CLONE_PARENTS_QUERY } from '@/api/graphql/queries/vsphere'
import type { ResourcePool } from '@/types/resource-pool'
import type {
  DeployAgentInput, OvaTemplateFamily,
  VsphereResourcePool, VsphereResourcePoolsQueryResult, VsphereResourcePoolsQueryVars,
  VsphereNetwork, VsphereNetworksQueryResult, VsphereNetworksQueryVars,
} from '@/types/marketplace'
import '@/components/icons'
import { useLocaleStore } from '@/stores/locale'

const props = defineProps<{ open: boolean; template: OvaTemplateFamily | null; pools: ResourcePool[]; deploying: boolean }>()
const emit = defineEmits<{ (e: 'close'): void; (e: 'submit', input: DeployAgentInput): void }>()

const locale = useLocaleStore()

/* ════════════ 区块 1: 基础运行环境 ════════════ */
const globalForm = reactive({
  versionId: '', resourcePoolId: '', placementPool: '', targetNetwork: '',
  cloneMode: 'full' as 'full' | 'instant', instantCloneParent: '',
  parentSource: 'existing' as 'existing' | 'create',
  newParents: [{ name: 'ic-p', ip: '' }] as Array<{ name: string; ip: string }>,
})

/* ════════════ 区块 2: 全局安全与认证 ════════════ */
const securityForm = reactive({ runAsUser: 'vmware', password: '', confirmPassword: '', sshKey: '' })
const showPw = ref(false); const showCpw = ref(false)
const pwErr = ref(''); const cpwErr = ref('')

/* 密码校验 */
function validatePassword() {
  pwErr.value = ''; cpwErr.value = ''
  const pw = securityForm.password; const cpw = securityForm.confirmPassword
  if (!pw) { pwErr.value = locale.t('deployAgent.err.passwordRequired'); return false }
  if (pw.length < 8) { pwErr.value = locale.t('deployAgent.err.passwordMinLen'); return false }
  if (cpw && pw !== cpw) { cpwErr.value = locale.t('deployAgent.err.passwordMismatch'); return false }
  return true
}

/* ════════════ 区块 2.5: 部署模式 (单台/批量) ════════════════════════════ */
const deployMode = ref<'single' | 'batch'>('single')

/* ════════════ 区块 3: 网络策略 ════════════ */
const deployPolicy = reactive({ ipMode: 'dhcp' as 'dhcp' | 'static', netmask: '255.255.255.0', gateway: '172.16.85.1', dns: '172.16.85.1' })

/* ════════════ 区块 4: 实例清单 ════════════ */
interface InstanceRow { hostname: string; ip: string; keyBinding: string }
const instanceList = reactive<InstanceRow[]>([{ hostname: '', ip: '', keyBinding: '' }])
const batchCount = ref(3); const batchPrefix = ref(''); const batchStartIP = ref('')
const attempted = ref(false)

// Skills selection
const selectedSkillIds = ref<string[]>([])
const { result: skillsResult } = useQuery(gql`query Skills { skills { id name version description } }`)
const availableSkills = computed(() => (skillsResult.value as any)?.skills ?? [])

// ─── Wizard state machine ──────────────────────────────────────────────
// Five steps: 基础环境 → 部署模式 (单台/批量) → 安全认证 → 网络策略 → 实例清单
type StepId = 'env' | 'mode' | 'skills' | 'security' | 'network' | 'instances'
const STEPS: readonly StepId[] = ['env', 'mode', 'skills', 'security', 'network', 'instances'] as const
const currentStep = ref<StepId>('env')

function stepIndex(s: StepId): number { return STEPS.indexOf(s) }
function stepLabel(s: StepId): string {
  return {
    env: locale.t('deployAgent.section.env'),
    mode: locale.t('deployAgent.section.mode'),
    security: locale.t('deployAgent.section.security'),
    network: locale.t('deployAgent.section.network'),
    skills: '选择Skill',
    instances: locale.t('deployAgent.section.instances'),
  }[s]
}
function goNext() {
  const i = stepIndex(currentStep.value)
  if (i >= STEPS.length - 1) return
  // ---- per-step validation ----
  const s = currentStep.value
  if (s === 'env') {
    if (!globalForm.resourcePoolId) { alert(locale.t('deployAgent.err.pool') as string); return }
    if (!globalForm.versionId) { alert(locale.t('deployAgent.err.version') as string); return }
    if (!globalForm.placementPool) { alert('请选择 vSphere 放置资源池'); return }
  }
  if (s === 'security') {
    validatePassword()
    if (pwErr.value) { alert(pwErr.value); return }
    if (cpwErr.value) { alert(cpwErr.value); return }
  }
  if (s === 'network' && deployPolicy.ipMode === 'static') {
    if (!deployPolicy.netmask) { alert('请填写子网掩码'); return }
    if (!deployPolicy.gateway) { alert('请填写网关'); return }
  }
  if (s === 'instances') {
    if (deployMode.value === 'single') {
      if (!instanceList[0]?.hostname.trim()) { alert(locale.t('deployAgent.err.name') as string); return }
      if (deployPolicy.ipMode === 'static' && !instanceList[0]?.ip) { alert(locale.t('deployAgent.err.ipRequired') as string); return }
    }
  }
  currentStep.value = STEPS[i + 1]
}
function goPrev() { const i = stepIndex(currentStep.value); if (i > 0) currentStep.value = STEPS[i - 1] }

/* ---- vSphere 查询 ---- */
const vVars = computed<VsphereResourcePoolsQueryVars>(() => ({ resourcePoolId: globalForm.resourcePoolId }))
const vOn = computed(() => props.open && !!globalForm.resourcePoolId)
const { result: vRes } = useQuery<VsphereResourcePoolsQueryResult, VsphereResourcePoolsQueryVars>(VSPHERE_RESOURCE_POOLS_QUERY, vVars, () => ({ enabled: vOn.value, fetchPolicy: 'cache-first' }))
const vspherePools = computed<VsphereResourcePool[]>(() => vRes.value?.vsphereResourcePools ?? [])
const vspherePoolsLoading = computed(() => vOn.value && vspherePools.value.length === 0)
const { result: nRes } = useQuery<VsphereNetworksQueryResult, VsphereNetworksQueryVars>(VSPHERE_NETWORKS_QUERY, () => ({ resourcePoolId: globalForm.resourcePoolId }), () => ({ enabled: vOn.value, fetchPolicy: 'cache-first' }))
const vsphereNetworks = computed<VsphereNetwork[]>(() => nRes.value?.vsphereNetworks ?? [])
const { result: uRes } = useQuery(UNBOUND_KEYS_QUERY, null, () => ({ enabled: computed(() => props.open), fetchPolicy: 'cache-and-network' }))
const unboundKeys = computed(() => uRes.value?.unboundKeys ?? [])
const keySearch = ref('')
const filteredKeys = computed(() => {
  if (!keySearch.value) return unboundKeys.value
  const q = keySearch.value.toLowerCase()
  return unboundKeys.value.filter(k => (k.name || k.id?.slice(0,8) || '').toLowerCase().includes(q))
})
const { result: pRes } = useQuery(INSTANT_CLONE_PARENTS_QUERY, () => ({ resourcePoolId: globalForm.resourcePoolId }), () => ({ enabled: computed(() => globalForm.cloneMode === 'instant' && globalForm.parentSource === 'existing' && !!globalForm.resourcePoolId) }))
const instantParents = computed(() =>
  ((pRes.value as any)?.instantCloneParents ?? []).filter((v: any) => v.name.startsWith('ic-p'))
)

// Auto-select "Resources" as the default placement pool when pools load
watch(vspherePools, (pools) => {
  if (!globalForm.placementPool && pools.length > 0) {
    const r = pools.find(p => p.name === 'Resources') || pools[0]
    globalForm.placementPool = r.path
  }
}, { immediate: true })

const versionList = computed(() => props.template ? [...props.template.versions].reverse() : [])

const networksGrouped = computed(() => {
  const g: Record<string, VsphereNetwork[]> = {}
  for (const n of vsphereNetworks.value) { const k = n.type === 'distributed' ? (n.dvsName || 'Distributed') : 'Standard'; if (!g[k]) g[k] = []; g[k].push(n) }
  return g
})

/* ---- 批量生成 ---- */
function incrementIP(ip: string, offset: number): string {
  const p = ip.split('.').map(Number); if (p.length === 4 && p.every(x => !isNaN(x))) { p[3] += offset; return p.join('.') }; return ''
}
function generateBatch() {
  const n = Math.max(1, Math.min(50, batchCount.value)); instanceList.length = 0
  for (let i = 0; i < n; i++) {
    const idx = String(i + 1).padStart(2, '0')
    instanceList.push({ hostname: batchPrefix.value ? `${batchPrefix.value}-${idx}` : '', ip: batchStartIP.value ? incrementIP(batchStartIP.value, i) : '', keyBinding: '' })
  }
}

/* ---- 校验 ---- */
const errors = computed(() => {
  const e: Record<string, string> = {}
  if (!attempted.value) return e
  if (!globalForm.versionId) e.version = locale.t('deployAgent.err.version')
  if (!globalForm.resourcePoolId) e.pool = locale.t('deployAgent.err.pool')
  if (securityForm.password && securityForm.password !== securityForm.confirmPassword) e.pw = locale.t('deployAgent.err.passwordMismatch')
  if (deployMode.value === 'single') {
    if (!instanceList[0]?.hostname.trim()) e.host = locale.t('deployAgent.err.name')
    if (deployPolicy.ipMode === 'static' && !instanceList[0]?.ip) e.ip0 = locale.t('deployAgent.err.ipRequired')
  }
  else {
    const names = instanceList.map(r => r.hostname.trim()).filter(Boolean)
    if (new Set(names).size !== names.length) e.ndup = locale.t('deployAgent.err.hostnameDup')
    if (deployPolicy.ipMode === 'static') {
      const ips = instanceList.map(r => r.ip).filter(Boolean)
      if (ips.length < instanceList.length) e.ipmiss = locale.t('deployAgent.err.ipMissing')
      else if (new Set(ips).size !== ips.length) e.idup = locale.t('deployAgent.err.ipDup')
    }
  }
  return e
})
const valid = computed(() => Object.keys(errors.value).length === 0)

/* ---- 提交 ---- */
function submit() {
  attempted.value = true; validatePassword(); if (!valid.value || pwErr.value || cpwErr.value) return
  // Final step: collect the right instance rows based on deploy mode
  const rows: InstanceRow[] = deployMode.value === 'single' ? [instanceList[0]] : instanceList
  const mk = (r: InstanceRow): DeployAgentInput => {
    const ovf: Array<{ key: string; value: string }> = []
    if (securityForm.runAsUser) ovf.push({ key: 'guestinfo.run_as_user', value: securityForm.runAsUser })
    if (securityForm.password) ovf.push({ key: 'guestinfo.password', value: securityForm.password })
    if (securityForm.sshKey) ovf.push({ key: 'guestinfo.ssh_key', value: securityForm.sshKey })
    if (deployPolicy.ipMode === 'static') {
      ovf.push({ key: 'guestinfo.ip_mode', value: 'static' })
      ovf.push({ key: 'guestinfo.static_ip', value: r.ip })
      ovf.push({ key: 'guestinfo.netmask', value: deployPolicy.netmask })
      ovf.push({ key: 'guestinfo.gateway', value: deployPolicy.gateway })
      ovf.push({ key: 'guestinfo.dns', value: deployPolicy.dns })
    }
    return {
      name: r.hostname.trim(), templateFamilyId: props.template?.id ?? '', templateVersionId: globalForm.versionId,
      resourcePoolId: globalForm.resourcePoolId, targetResourcePool: globalForm.placementPool || null,
      targetNetwork: globalForm.targetNetwork || null, hostname: r.hostname.trim() || null,
      keySource: (r.keyBinding ? 'existing' : 'new') as 'new' | 'existing',
      existingKeyId: r.keyBinding || null, cloneMode: globalForm.cloneMode,
      instantCloneParent: globalForm.cloneMode === 'instant' && globalForm.parentSource === 'existing' ? globalForm.instantCloneParent || null : null,
      _createParents: globalForm.cloneMode === 'instant' && globalForm.parentSource === 'create' ? globalForm.newParents.filter(p => p.name.trim() && p.ip.trim()).map(p => ({ name: p.name.trim(), ip: p.ip.trim() })) : null,
      ovfProperties: ovf.length > 0 ? ovf : null,
    } as any
  }
  if (deployMode.value === 'single') emit('submit', mk(instanceList[0]))
  else instanceList.forEach(r => emit('submit', mk(r)))
}

/* ---- 重置 ---- */
watch(() => props.open, (o) => {
  if (o && props.template) {
    const v = props.template.versions[0]
    Object.assign(globalForm, { versionId: v?.id ?? '', resourcePoolId: props.pools[0]?.id ?? '', placementPool: '', targetNetwork: '', cloneMode: 'full', instantCloneParent: '', parentSource: 'existing', newParents: [{ name: 'ic-p', ip: '' }] })
    Object.assign(securityForm, { runAsUser: 'vmware', password: '', confirmPassword: '', sshKey: '' })
    Object.assign(deployPolicy, { ipMode: 'dhcp', netmask: '255.255.255.0', gateway: '172.16.85.1', dns: '172.16.85.1' })
    deployMode.value = 'single'
    keySearch.value = ''
    currentStep.value = 'env'
    instanceList.length = 0; instanceList.push({ hostname: '', ip: '', keyBinding: '' })
    batchCount.value = 3; batchPrefix.value = ''; batchStartIP.value = ''; attempted.value = false
  }
}, { immediate: true })
</script>

<template>
  <cds-modal :hidden="!props.open" size="lg" @closeChange="emit('close')">
    <cds-modal-header><h2 cds-text="title" class="t">{{ locale.t('deployAgent.title').replace('{name}', props.template?.name || '') }}</h2></cds-modal-header>
    <cds-modal-content>
      <div class="wizard-grid">
        <nav class="wizard-sidebar" aria-label="wizard steps">
          <ol class="wizard-steps">
            <li v-for="(s, i) in STEPS" :key="s"
              class="wizard-step-item"
              :class="{ active: s === currentStep, visited: i < stepIndex(currentStep), unvisited: i > stepIndex(currentStep) }">
              <button type="button" class="step-button"
                :disabled="i > stepIndex(currentStep)"
                @click="i < stepIndex(currentStep) && (currentStep = s)">
                <span class="step-marker">
                  <cds-icon v-if="i < stepIndex(currentStep)" shape="check" size="sm"></cds-icon>
                  <template v-else>{{ i + 1 }}</template>
                </span>
                <span class="step-label">{{ stepLabel(s) }}</span>
              </button>
            </li>
          </ol>
        </nav>

        <section class="wizard-main">
          <div class="f">

        <!-- ══ 区块1: 基础运行环境 ══ -->
        <div v-if="currentStep==='env'" class="blk"><h3 class="bh">{{ locale.t('deployAgent.section.env') }}</h3><p class="bd">{{ locale.t('deployAgent.section.envDesc') }}</p>
          <div class="g2">
            <cds-select control-width="shrink"><label>{{ locale.t('deployAgent.label.version') }}</label><select v-model="globalForm.versionId"><option v-for="v in versionList" :key="v.id" :value="v.id">{{ v.version }}</option></select></cds-select>
            <cds-select control-width="shrink"><label>{{ locale.t('deployAgent.label.placementPool') }}</label><select v-model="globalForm.placementPool"><option value="" disabled>{{ vspherePoolsLoading ? '加载中…' : locale.t('deployAgent.selectPlaceholder') }}</option><option v-for="p in vspherePools" :key="p.path" :value="p.path">{{ p.name }}</option></select></cds-select>
            <cds-select control-width="shrink"><label>{{ locale.t('deployAgent.label.targetNetwork') }}</label><select v-model="globalForm.targetNetwork"><option value="">{{ locale.t('deployAgent.inheritDefault') }}</option><optgroup v-for="(nets,g) in networksGrouped" :key="g" :label="g"><option v-for="n in nets" :key="n.path" :value="n.path">{{ n.name }}</option></optgroup></select></cds-select>
            <cds-select control-width="shrink"><label>{{ locale.t('deployAgent.label.cloneMode') }}</label><select v-model="globalForm.cloneMode"><option value="full">{{ locale.t('deployAgent.cloneMode.full') }}</option><option value="instant">{{ locale.t('deployAgent.cloneMode.instant') }}</option></select></cds-select>
          </div>
          <template v-if="globalForm.cloneMode==='instant'">
            <div class="ic-sec">
              <div class="rr"><label class="ir" :class="{a:globalForm.parentSource==='existing'}"><input type="radio" v-model="globalForm.parentSource" value="existing"/>{{ locale.t('deployAgent.parentSource.existing') }}</label><label class="ir" :class="{a:globalForm.parentSource==='create'}"><input type="radio" v-model="globalForm.parentSource" value="create"/>{{ locale.t('deployAgent.parentSource.create') }}</label></div>
              <cds-select v-if="globalForm.parentSource==='existing'" control-width="shrink" style="margin-top:8px"><label>{{ locale.t('deployAgent.label.parentVm') }}</label><select v-model="globalForm.instantCloneParent"><option value="">{{ locale.t('deployAgent.selectPlaceholder') }}</option><option v-for="p in instantParents" :key="p.name" :value="p.name">{{ p.name }}</option></select></cds-select>
              <template v-else><div v-for="(p,i) in globalForm.newParents" :key="i" style="display:flex;gap:8px;align-items:flex-end;margin-top:8px"><cds-input style="flex:1"><label>{{ locale.t('deployAgent.label.name') }}</label><input v-model="p.name"/></cds-input><cds-input style="flex:1"><label>{{ locale.t('deployAgent.label.staticIp') }}</label><input v-model="p.ip"/></cds-input><cds-button-action v-if="globalForm.newParents.length>1" shape="times" :aria-label="locale.t('deployAgent.action.remove')" :title="locale.t('deployAgent.action.remove')" @click="globalForm.newParents.splice(i,1)"/></div><cds-button size="sm" action="outline" style="margin-top:8px" @click="globalForm.newParents.push({name:'ic-p',ip:''})"><cds-icon shape="plus" size="sm"/>{{ locale.t('deployAgent.action.addParent') }}</cds-button></template>
            </div>
          </template>
        </div>

        <!-- ══ 区块2: 全局安全与认证 ══ -->
        <!-- ══ Skills ══ -->
        <div v-if="currentStep==='skills'" class="blk"><h3 class="bh">选择 Skill（可选）</h3><p class="bd">为智能体预装离线 Skill 包。部署时 cloud-init 自动安装。</p>
          <div v-if="availableSkills.length===0" style="color:#86909c;font-size:13px">暂无可用 Skill。请先在 Skill 管理中创建。</div>
          <label v-for="sk in availableSkills" :key="sk.id" style="display:flex;align-items:center;gap:8px;padding:8px 12px;border:1px solid #e5e7eb;border-radius:8px;cursor:pointer;margin-bottom:6px">
            <input type="checkbox" :value="sk.id" v-model="selectedSkillIds" />
            <strong>{{ sk.name }}</strong> <span style="color:#888;font-size:12px">v{{ sk.version }}</span>
            <span style="color:#666;font-size:12px;flex:1;text-align:right">{{ sk.description || '' }}</span>
          </label>
        </div>
                <div v-if="currentStep==='security'" class="blk"><h3 class="bh">{{ locale.t('deployAgent.section.security') }}</h3><p class="bd">{{ locale.t('deployAgent.section.securityDesc') }}</p>
          <div class="g2">
            <cds-input><label>RunAs User</label><input v-model="securityForm.runAsUser" placeholder="vmware" class="uline"/></cds-input>
            <!-- 密码 -->
            <div class="field">
              <label class="fl">{{ locale.t('deployAgent.label.password') }} <span class="rq">*</span></label>
              <div class="pw-wrap"><input :type="showPw ? 'text' : 'password'" v-model="securityForm.password" :placeholder="locale.t('deployAgent.placeholder.password')" class="uline" :class="{ 'uline-err': attempted && pwErr }" @input="pwErr = ''"/><cds-button-action :shape="showPw ? 'eye-hide' : 'eye'" :title="showPw ? locale.t('deployAgent.action.hide') : locale.t('deployAgent.action.show')" :aria-label="showPw ? locale.t('deployAgent.action.hidePassword') : locale.t('deployAgent.action.showPassword')" @click="showPw = !showPw"/></div>
              <p v-if="attempted && pwErr" class="er">{{ pwErr }}</p>
            </div>
            <!-- 确认密码 -->
            <div class="field">
              <label class="fl">{{ locale.t('deployAgent.label.confirmPassword') }} <span class="rq">*</span></label>
              <div class="pw-wrap"><input :type="showCpw ? 'text' : 'password'" v-model="securityForm.confirmPassword" :placeholder="locale.t('deployAgent.placeholder.confirmPassword')" class="uline" :class="{ 'uline-err': attempted && cpwErr }" @input="cpwErr = ''"/><cds-button-action :shape="showCpw ? 'eye-hide' : 'eye'" :title="showCpw ? locale.t('deployAgent.action.hide') : locale.t('deployAgent.action.show')" :aria-label="showCpw ? locale.t('deployAgent.action.hidePassword') : locale.t('deployAgent.action.showPassword')" @click="showCpw = !showCpw"/></div>
              <p v-if="attempted && cpwErr" class="er">{{ cpwErr }}</p>
            </div>
            <cds-input><label>{{ locale.t('deployAgent.label.sshKey') }}</label><input v-model="securityForm.sshKey" :placeholder="locale.t('deployAgent.placeholder.sshKey')" class="uline"/></cds-input>
          </div>
        </div>

        <!-- ══ 区块2.5: 部署模式 (单台/批量) ══ -->
        <div v-if="currentStep==='mode'" class="blk"><h3 class="bh">{{ locale.t('deployAgent.section.mode') }}</h3>
          <div class="rr"><label class="ir" :class="{a:deployMode==='single'}"><input type="radio" v-model="deployMode" value="single"/>{{ locale.t('deployAgent.mode.single') }}</label><label class="ir" :class="{a:deployMode==='batch'}"><input type="radio" v-model="deployMode" value="batch"/>{{ locale.t('deployAgent.mode.batch') }}</label></div>
        </div>

        <!-- ══ 区块3: 网络策略 ══ -->
        <div v-if="currentStep==='network'" class="blk"><h3 class="bh">{{ locale.t('deployAgent.section.network') }}</h3>
          <div class="rr"><label class="ir" :class="{a:deployPolicy.ipMode==='dhcp'}"><input type="radio" v-model="deployPolicy.ipMode" value="dhcp"/>{{ locale.t('deployAgent.ipMode.dhcp') }}</label><label class="ir" :class="{a:deployPolicy.ipMode==='static'}"><input type="radio" v-model="deployPolicy.ipMode" value="static"/>{{ locale.t('deployAgent.ipMode.static') }}</label></div>
          <template v-if="deployPolicy.ipMode==='static'">
            <div class="g3" style="margin-top:12px">
              <cds-input><label>{{ locale.t('deployAgent.label.netmask') }}</label><input v-model="deployPolicy.netmask" :placeholder="locale.t('deployAgent.placeholder.netmask')"/></cds-input>
              <cds-input><label>{{ locale.t('deployAgent.label.gateway') }}</label><input v-model="deployPolicy.gateway" :placeholder="locale.t('deployAgent.placeholder.gateway')"/></cds-input>
              <cds-input><label>{{ locale.t('deployAgent.label.dns') }}</label><input v-model="deployPolicy.dns" :placeholder="locale.t('deployAgent.placeholder.dns')"/></cds-input>
            </div>
          </template>
        </div>

        <!-- ══ 区块4: 实例配置清单 ══ -->
        <div v-if="currentStep==='instances'" class="blk"><h3 class="bh">{{ locale.t('deployAgent.section.instances') }}</h3>
          <!-- 单台 -->
          <template v-if="deployMode==='single'">
            <div class="g2">
              <cds-input><label>{{ locale.t('deployAgent.label.agentName') }} <span class="rq">*</span></label><input v-model="instanceList[0].hostname" :placeholder="locale.t('deployAgent.placeholder.agentName')"/></cds-input>
              <cds-input v-if="deployPolicy.ipMode==='static'"><label>{{ locale.t('accessInfo.ip') }} <span class="rq">*</span></label><input v-model="instanceList[0].ip" :placeholder="locale.t('deployAgent.placeholder.startIp')"/></cds-input>
              <div><cds-select control-width="shrink"><label>{{ locale.t('deployAgent.label.keyBinding') }}</label><select v-model="instanceList[0].keyBinding"><option value="">{{ locale.t('deployAgent.placeholder.browseKeys') }}</option><option v-for="k in filteredKeys" :key="k.id" :value="k.id">{{ k.name||k.id.slice(0,8) }}</option></select></cds-select><div style="margin-top:2px"><input class="uline" v-model="keySearch" placeholder="搜索密钥…" style="width:100%;font-size:12px;padding:2px 4px"/></div></div>
            </div>
            <p v-if="attempted&&errors.host" class="er">{{errors.host}}</p>
            <p v-if="attempted&&errors.ip0" class="er">{{errors.ip0}}</p>
          </template>
          <!-- 批量 -->
          <template v-if="deployMode==='batch'">
            <div class="bt"><cds-input style="width:100px"><label>{{ locale.t('deployAgent.label.count') }}</label><input v-model.number="batchCount" type="number" min="1" max="50"/></cds-input><cds-input style="width:160px"><label>{{ locale.t('deployAgent.label.namePrefix') }}</label><input v-model="batchPrefix" :placeholder="locale.t('deployAgent.placeholder.namePrefix')"/></cds-input><cds-input v-if="deployPolicy.ipMode==='static'" style="width:160px"><label>{{ locale.t('deployAgent.label.startIp') }}</label><input v-model="batchStartIP" :placeholder="locale.t('deployAgent.placeholder.startIp')"/></cds-input><cds-button size="sm" action="outline" @click="generateBatch">{{ locale.t('deployAgent.action.generate') }}</cds-button></div>
            <div class="tw" v-if="instanceList.length">
              <table class="it"><thead><tr><th style="width:50px">#</th><th>{{ locale.t('deployAgent.table.hostname') }} <span class="rq">*</span></th><th v-if="deployPolicy.ipMode==='static'">{{ locale.t('deployAgent.table.ip') }} <span class="rq">*</span></th><th>{{ locale.t('deployAgent.table.keyBinding') }}</th></tr></thead>
                <tbody><tr v-for="(row,i) in instanceList" :key="i"><td class="ix">{{i+1}}</td><td><input class="ci" v-model="row.hostname" :class="{er2:attempted&&!row.hostname.trim()}"/></td><td v-if="deployPolicy.ipMode==='static'"><input class="ci" v-model="row.ip" :class="{er2:attempted&&!row.ip}"/></td><td><select class="cs" v-model="row.keyBinding"><option value="">{{ locale.t('deployAgent.placeholder.browse') }}</option><option v-for="k in filteredKeys" :key="k.id" :value="k.id">{{k.name||k.id.slice(0,8)}}</option></select></td></tr></tbody>
              </table>
              <p v-if="attempted&&errors.ndup" class="er">{{errors.ndup}}</p><p v-if="attempted&&errors.idup" class="er">{{errors.idup}}</p><p v-if="attempted&&errors.ipmiss" class="er">{{errors.ipmiss}}</p>
            </div>
          </template>
        </div>

          </div>
        </section>
      </div>
    </cds-modal-content>
    <cds-modal-actions>
      <cds-button v-if="stepIndex(currentStep) > 0" action="outline" @click="goPrev">{{ locale.t('deployAgent.action.prev') }}</cds-button>
      <cds-button action="outline" @click="emit('close')">{{ locale.t('deployAgent.action.cancel') }}</cds-button>
      <cds-button v-if="stepIndex(currentStep) < STEPS.length - 1" status="primary" @click="goNext">{{ locale.t('deployAgent.action.next') }}</cds-button>
      <cds-button v-else :loading-state="props.deploying?'loading':'default'" status="primary" @click="submit">{{ locale.t('deployAgent.action.submit') }}</cds-button>
    </cds-modal-actions>
  </cds-modal>
</template>

<style scoped>
.t{margin:0;font-size:18px;font-weight:600}.f{display:flex;flex-direction:column;gap:16px;max-height:60vh;overflow-y:auto}
.blk{padding:12px;border:1px solid #e5e6eb;border-radius:8px}.bh{margin:0 0 4px;font-size:15px;font-weight:600}.bd{margin:0 0 12px;font-size:12px;color:#86909c}
.g2{display:grid;grid-template-columns:1fr 1fr;gap:12px}.g3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px}
.ic-sec{margin-top:8px;padding:10px;border:1px solid #e5e6eb;border-radius:6px;background:#f9fafb}
.rr{display:flex;gap:16px}.ir{display:flex;align-items:center;gap:6px;cursor:pointer}.ir input[type=radio]{accent-color:#0072a3}.ir.a{font-weight:600;color:#0072a3}
.sl{font-size:14px;font-weight:500;display:block;margin-bottom:6px}.rq{color:#c92100}
.bt{display:flex;align-items:flex-end;gap:10px;flex-wrap:wrap;margin-bottom:12px}
.tw{overflow-x:auto}.it{width:100%;border-collapse:collapse;font-size:13px}.it th{text-align:left;padding:8px 6px;background:#f7f8fa;font-weight:600;border-bottom:2px solid #e5e6eb}.it td{padding:4px 6px;border-bottom:1px solid #f0f0f0}
.ix{text-align:center;color:#86909c}.ci{width:100%;padding:6px 8px;border:1px solid #d0d5dd;border-radius:4px;font-size:13px;box-sizing:border-box}.ci:focus{border-color:#0072a3;outline:none}.ci.er2{border-color:#c92100}.cs{width:100%;padding:6px 8px;border:1px solid #d0d5dd;border-radius:4px;font-size:13px;background:#fff}
.er{color:#c92100;font-size:12px;margin:6px 0 0}
.pw-wrap{display:flex;align-items:center;gap:4px}.pw-wrap input{flex:1}
.uline{border:none;border-bottom:1px solid var(--cds-alias-object-border-color, #d0d5dd);border-radius:0;padding:6px 0;font-size:14px;width:100%;outline:none;background:transparent;color:inherit}.uline:focus{border-bottom-color:var(--cds-alias-status-info, #0072a3)}.uline-err{border-bottom-color:var(--cds-alias-status-danger, #c92100)}
.fl{font-size:14px;color:var(--cds-global-typography-color-400, #4e5969);display:block;margin-bottom:4px}.field{display:flex;flex-direction:column}
.wizard-grid{display:grid;grid-template-columns:200px 1fr;height:min(70vh,600px);width:100%}
.wizard-sidebar{background:#f4f4f4;box-shadow:inset -1px 0 0 #e8e8e8;padding:20px 0 16px;display:flex;flex-direction:column;height:100%;overflow-y:auto}
.wizard-steps{list-style:none;margin:0;padding:0}
.wizard-step-item{margin:0}
.step-button{display:flex;align-items:center;gap:10px;width:100%;padding:8px 14px;border:0;background:transparent;color:#565656;font:inherit;text-align:left;cursor:pointer}
.step-button:disabled{cursor:default}
.step-marker{display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:50%;font-size:11px;font-weight:600;background:transparent;border:1px solid currentColor;flex-shrink:0}
.wizard-step-item.active .step-button{color:#fff;background:#0072a3}
.wizard-step-item.active .step-marker{background:rgba(255,255,255,.2);border-color:rgba(255,255,255,.4)}
.wizard-step-item.visited .step-marker{background:#0072a3;color:#fff;border-color:#0072a3}
.step-label{font-size:13px}
.wizard-main{display:flex;flex-direction:column;min-width:0;height:100%;min-height:0;overflow-y:auto;padding:16px 24px}
</style>
