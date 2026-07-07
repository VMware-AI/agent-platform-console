<script setup lang="ts">
/* eslint-disable */
 
/* eslint-disable @typescript-eslint/no-explicit-any */
import { computed, reactive, ref, watch } from 'vue'
import { useQuery } from '@vue/apollo-composable'
import { VSPHERE_RESOURCE_POOLS_QUERY, VSPHERE_NETWORKS_QUERY, UNBOUND_KEYS_QUERY, INSTANT_CLONE_PARENTS_QUERY } from '@/api/graphql/queries/vsphere'
import type { ResourcePool } from '@/types/resource-pool'
import type {
  DeployAgentInput, OvaTemplateFamily,
  VsphereResourcePool, VsphereResourcePoolsQueryResult, VsphereResourcePoolsQueryVars,
  VsphereNetwork, VsphereNetworksQueryResult, VsphereNetworksQueryVars,
} from '@/types/marketplace'
import '@/components/icons'

const props = defineProps<{ open: boolean; template: OvaTemplateFamily | null; pools: ResourcePool[]; deploying: boolean }>()
const emit = defineEmits<{ (e: 'close'): void; (e: 'submit', input: DeployAgentInput): void }>()

/* ════════════ 区块 1: 基础运行环境 ════════════ */
const globalForm = reactive({
  versionId: '', resourcePoolId: '', placementPool: '', targetNetwork: '',
  cloneMode: 'full' as 'full' | 'instant', instantCloneParent: '',
  parentSource: 'existing' as 'existing' | 'create',
  newParents: [{ name: 'ic-p', ip: '' }] as Array<{ name: string; ip: string }>,
})

/* ════════════ 区块 2: 全局安全与认证 ════════════ */
const securityForm = reactive({ runAsUser: 'svc_robot', password: '', confirmPassword: '', sshKey: '' })
const showPw = ref(false); const showCpw = ref(false)
const pwErr = ref(''); const cpwErr = ref('')

/* 密码校验 */
function validatePassword() {
  pwErr.value = ''; cpwErr.value = ''
  const pw = securityForm.password; const cpw = securityForm.confirmPassword
  if (!pw) { pwErr.value = '密码不能为空'; return false }
  if (pw.length < 8) { pwErr.value = '密码至少 8 位'; return false }
  if (cpw && pw !== cpw) { cpwErr.value = '两次密码不一致'; return false }
  return true
}

/* ════════════ 区块 3: 部署与网络策略 ════════════ */
const deployPolicy = reactive({ deployMode: 'single' as 'single' | 'batch', ipMode: 'dhcp' as 'dhcp' | 'static', netmask: '255.255.255.0', gateway: '172.16.85.1', dns: '172.16.85.1' })

/* ════════════ 区块 4: 实例清单 ════════════ */
interface InstanceRow { hostname: string; ip: string; keyBinding: string }
const instanceList = reactive<InstanceRow[]>([{ hostname: '', ip: '', keyBinding: '' }])
const batchCount = ref(3); const batchPrefix = ref(''); const batchStartIP = ref('')
const attempted = ref(false)

/* ---- vSphere 查询 ---- */
const vVars = computed<VsphereResourcePoolsQueryVars>(() => ({ resourcePoolId: globalForm.resourcePoolId }))
const vOn = computed(() => props.open && !!globalForm.resourcePoolId)
const { result: vRes } = useQuery<VsphereResourcePoolsQueryResult, VsphereResourcePoolsQueryVars>(VSPHERE_RESOURCE_POOLS_QUERY, vVars, () => ({ enabled: vOn.value, fetchPolicy: 'cache-and-network' }))
const vspherePools = computed<VsphereResourcePool[]>(() => vRes.value?.vsphereResourcePools ?? [])
const { result: nRes } = useQuery<VsphereNetworksQueryResult, VsphereNetworksQueryVars>(VSPHERE_NETWORKS_QUERY, () => ({ resourcePoolId: globalForm.resourcePoolId }), () => ({ enabled: vOn.value, fetchPolicy: 'cache-and-network' }))
const vsphereNetworks = computed<VsphereNetwork[]>(() => nRes.value?.vsphereNetworks ?? [])
const { result: uRes } = useQuery(UNBOUND_KEYS_QUERY, null, () => ({ enabled: computed(() => props.open), fetchPolicy: 'cache-and-network' }))
const unboundKeys = computed(() => uRes.value?.unboundKeys ?? [])
const { result: pRes } = useQuery(INSTANT_CLONE_PARENTS_QUERY, () => ({ resourcePoolId: globalForm.resourcePoolId }), () => ({ enabled: computed(() => globalForm.cloneMode === 'instant' && globalForm.parentSource === 'existing' && !!globalForm.resourcePoolId) }))
const instantParents = computed(() =>
  ((pRes.value as any)?.instantCloneParents ?? []).filter((v: any) => v.name.startsWith('ic-p'))
)

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
  if (!globalForm.versionId) e.version = '请选择版本'
  if (!globalForm.resourcePoolId) e.pool = '请选择资源池'
  if (securityForm.password && securityForm.password !== securityForm.confirmPassword) e.pw = '两次密码不一致'
  if (deployPolicy.deployMode === 'single') { if (!instanceList[0]?.hostname.trim()) e.host = '请输入名称'; if (deployPolicy.ipMode === 'static' && !instanceList[0]?.ip) e.ip0 = 'IP 必填' }
  else {
    const names = instanceList.map(r => r.hostname.trim()).filter(Boolean)
    if (new Set(names).size !== names.length) e.ndup = '主机名不可重复'
    if (deployPolicy.ipMode === 'static') {
      const ips = instanceList.map(r => r.ip).filter(Boolean)
      if (ips.length < instanceList.length) e.ipmiss = '所有实例的 IP 必填'
      else if (new Set(ips).size !== ips.length) e.idup = 'IP 地址不可重复'
    }
  }
  return e
})
const valid = computed(() => Object.keys(errors.value).length === 0)

/* ---- 提交 ---- */
function submit() {
  attempted.value = true; validatePassword(); if (!valid.value || pwErr.value || cpwErr.value) return
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
      keySource: 'new', cloneMode: globalForm.cloneMode,
      instantCloneParent: globalForm.cloneMode === 'instant' && globalForm.parentSource === 'existing' ? globalForm.instantCloneParent || null : null,
      _createParents: globalForm.cloneMode === 'instant' && globalForm.parentSource === 'create' ? globalForm.newParents.filter(p => p.name.trim() && p.ip.trim()).map(p => ({ name: p.name.trim(), ip: p.ip.trim() })) : null,
      ovfProperties: ovf.length > 0 ? ovf : null,
    } as any
  }
  if (deployPolicy.deployMode === 'single') emit('submit', mk(instanceList[0]))
  else instanceList.forEach(r => emit('submit', mk(r)))
}

/* ---- 重置 ---- */
watch(() => props.open, (o) => {
  if (o && props.template) {
    const v = props.template.versions[0]
    Object.assign(globalForm, { versionId: v?.id ?? '', resourcePoolId: props.pools[0]?.id ?? '', placementPool: '', targetNetwork: '', cloneMode: 'full', instantCloneParent: '', parentSource: 'existing', newParents: [{ name: 'ic-p', ip: '' }] })
    Object.assign(securityForm, { runAsUser: 'svc_robot', password: '', confirmPassword: '', sshKey: '' })
    Object.assign(deployPolicy, { deployMode: 'single', ipMode: 'dhcp', netmask: '255.255.255.0', gateway: '172.16.85.1', dns: '172.16.85.1' })
    instanceList.length = 0; instanceList.push({ hostname: '', ip: '', keyBinding: '' })
    batchCount.value = 3; batchPrefix.value = ''; batchStartIP.value = ''; attempted.value = false
  }
}, { immediate: true })
</script>

<template>
  <cds-modal :hidden="!props.open" size="lg" @closeChange="emit('close')">
    <cds-modal-header><h2 cds-text="title" class="t">部署智能体 — {{ props.template?.name }}</h2></cds-modal-header>
    <cds-modal-content>
      <div class="f">

        <!-- ══ 区块1: 基础运行环境 ══ -->
        <div class="blk"><h3 class="bh">基础运行环境</h3><p class="bd">所有实例共享的底层 IaaS 资源配置</p>
          <div class="g2">
            <cds-select control-width="shrink"><label>选择版本</label><select v-model="globalForm.versionId"><option v-for="v in versionList" :key="v.id" :value="v.id">{{ v.version }}</option></select></cds-select>
            <cds-select control-width="shrink"><label>vSphere 放置资源池</label><select v-model="globalForm.placementPool"><option value="">继承模板默认</option><option v-for="p in vspherePools" :key="p.path" :value="p.path">{{ p.name }}</option></select></cds-select>
            <cds-select control-width="shrink"><label>目标端口组</label><select v-model="globalForm.targetNetwork"><option value="">保持模板默认</option><optgroup v-for="(nets,g) in networksGrouped" :key="g" :label="g"><option v-for="n in nets" :key="n.path" :value="n.path">{{ n.name }}</option></optgroup></select></cds-select>
            <cds-select control-width="shrink"><label>克隆模式</label><select v-model="globalForm.cloneMode"><option value="full">全量克隆</option><option value="instant">即时克隆</option></select></cds-select>
          </div>
          <template v-if="globalForm.cloneMode==='instant'">
            <div class="ic-sec">
              <div class="rr"><label class="ir" :class="{a:globalForm.parentSource==='existing'}"><input type="radio" v-model="globalForm.parentSource" value="existing"/>选择已有父虚拟机</label><label class="ir" :class="{a:globalForm.parentSource==='create'}"><input type="radio" v-model="globalForm.parentSource" value="create"/>创建新父虚拟机</label></div>
              <cds-select v-if="globalForm.parentSource==='existing'" control-width="shrink" style="margin-top:8px"><label>父虚拟机</label><select v-model="globalForm.instantCloneParent"><option value="">-- 选择 --</option><option v-for="p in instantParents" :key="p.name" :value="p.name">{{ p.name }}</option></select></cds-select>
              <template v-else><div v-for="(p,i) in globalForm.newParents" :key="i" style="display:flex;gap:8px;align-items:flex-end;margin-top:8px"><cds-input style="flex:1"><label>名称</label><input v-model="p.name"/></cds-input><cds-input style="flex:1"><label>静态 IP</label><input v-model="p.ip"/></cds-input><cds-button-action v-if="globalForm.newParents.length>1" shape="times" @click="globalForm.newParents.splice(i,1)"/></div><cds-button size="sm" action="outline" style="margin-top:8px" @click="globalForm.newParents.push({name:'ic-p',ip:''})"><cds-icon shape="plus" size="sm"/>添加父虚拟机</cds-button></template>
            </div>
          </template>
        </div>

        <!-- ══ 区块2: 全局安全与认证 ══ -->
        <div class="blk"><h3 class="bh">全局安全与认证</h3><p class="bd">所有实例统一的 Cloud-Init / vApp 系统凭据</p>
          <div class="g2">
            <cds-input><label>RunAs User</label><input v-model="securityForm.runAsUser" placeholder="svc_robot" class="uline"/></cds-input>
            <!-- 密码 -->
            <div class="field">
              <label class="fl">密码 <span class="rq">*</span></label>
              <div class="pw-wrap"><input :type="showPw ? 'text' : 'password'" v-model="securityForm.password" placeholder="至少 8 位" class="uline" :class="{ 'uline-err': attempted && pwErr }" @input="pwErr = ''"/><cds-button-action :shape="showPw ? 'eye-hide' : 'eye'" :title="showPw ? '隐藏' : '显示'" @click="showPw = !showPw"/></div>
              <p v-if="attempted && pwErr" class="er">{{ pwErr }}</p>
            </div>
            <!-- 确认密码 -->
            <div class="field">
              <label class="fl">确认密码 <span class="rq">*</span></label>
              <div class="pw-wrap"><input :type="showCpw ? 'text' : 'password'" v-model="securityForm.confirmPassword" placeholder="再次输入" class="uline" :class="{ 'uline-err': attempted && cpwErr }" @input="cpwErr = ''"/><cds-button-action :shape="showCpw ? 'eye-hide' : 'eye'" :title="showCpw ? '隐藏' : '显示'" @click="showCpw = !showCpw"/></div>
              <p v-if="attempted && cpwErr" class="er">{{ cpwErr }}</p>
            </div>
            <cds-input><label>SSH 公钥（可选）</label><input v-model="securityForm.sshKey" placeholder="ssh-rsa AAA..." class="uline"/></cds-input>
          </div>
        </div>

        <!-- ══ 区块3: 部署与网络策略 ══ -->
        <div class="blk"><h3 class="bh">部署与网络策略</h3>
          <div class="g2">
            <div><label class="sl">部署模式</label><div class="rr"><label class="ir" :class="{a:deployPolicy.deployMode==='single'}"><input type="radio" v-model="deployPolicy.deployMode" value="single"/>单台部署</label><label class="ir" :class="{a:deployPolicy.deployMode==='batch'}"><input type="radio" v-model="deployPolicy.deployMode" value="batch"/>批量部署</label></div></div>
            <div><label class="sl">IP 分配模式</label><div class="rr"><label class="ir" :class="{a:deployPolicy.ipMode==='dhcp'}"><input type="radio" v-model="deployPolicy.ipMode" value="dhcp"/>DHCP</label><label class="ir" :class="{a:deployPolicy.ipMode==='static'}"><input type="radio" v-model="deployPolicy.ipMode" value="static"/>静态 IP</label></div></div>
          </div>
          <template v-if="deployPolicy.ipMode==='static'">
            <div class="g3" style="margin-top:12px">
              <cds-input><label>子网掩码</label><input v-model="deployPolicy.netmask" placeholder="255.255.255.0"/></cds-input>
              <cds-input><label>网关</label><input v-model="deployPolicy.gateway" placeholder="172.16.85.1"/></cds-input>
              <cds-input><label>DNS（逗号分隔多个）</label><input v-model="deployPolicy.dns" placeholder="172.16.85.1,8.8.8.8"/></cds-input>
            </div>
          </template>
        </div>

        <!-- ══ 区块4: 实例配置清单 ══ -->
        <div class="blk"><h3 class="bh">实例配置清单</h3>
          <!-- 单台 -->
          <template v-if="deployPolicy.deployMode==='single'">
            <div class="g2">
              <cds-input><label>智能体名称 <span class="rq">*</span></label><input v-model="instanceList[0].hostname" placeholder="my-agent-01"/></cds-input>
              <cds-input v-if="deployPolicy.ipMode==='static'"><label>IP 地址 <span class="rq">*</span></label><input v-model="instanceList[0].ip" placeholder="172.16.85.200"/></cds-input>
              <cds-select control-width="shrink"><label>网关密钥绑定</label><select v-model="instanceList[0].keyBinding"><option value="">-- 新建密钥 --</option><option v-for="k in unboundKeys" :key="k.id" :value="k.id">{{ k.alias||k.id.slice(0,8) }}</option></select></cds-select>
            </div>
            <p v-if="attempted&&errors.host" class="er">{{errors.host}}</p>
            <p v-if="attempted&&errors.ip0" class="er">{{errors.ip0}}</p>
          </template>
          <!-- 批量 -->
          <template v-if="deployPolicy.deployMode==='batch'">
            <div class="bt"><cds-input style="width:100px"><label>数量</label><input v-model.number="batchCount" type="number" min="1" max="50"/></cds-input><cds-input style="width:160px"><label>名称前缀</label><input v-model="batchPrefix" placeholder="agent"/></cds-input><cds-input v-if="deployPolicy.ipMode==='static'" style="width:160px"><label>起始 IP</label><input v-model="batchStartIP" placeholder="172.16.85.200"/></cds-input><cds-button size="sm" action="outline" @click="generateBatch">生成清单</cds-button></div>
            <div class="tw" v-if="instanceList.length">
              <table class="it"><thead><tr><th style="width:50px">#</th><th>主机名 <span class="rq">*</span></th><th v-if="deployPolicy.ipMode==='static'">IP 地址 <span class="rq">*</span></th><th>密钥绑定</th></tr></thead>
                <tbody><tr v-for="(row,i) in instanceList" :key="i"><td class="ix">{{i+1}}</td><td><input class="ci" v-model="row.hostname" :class="{er2:attempted&&!row.hostname.trim()}"/></td><td v-if="deployPolicy.ipMode==='static'"><input class="ci" v-model="row.ip" :class="{er2:attempted&&!row.ip}"/></td><td><select class="cs" v-model="row.keyBinding"><option value="">-- 新建 --</option><option v-for="k in unboundKeys" :key="k.id" :value="k.id">{{k.alias||k.id.slice(0,8)}}</option></select></td></tr></tbody>
              </table>
              <p v-if="attempted&&errors.ndup" class="er">{{errors.ndup}}</p><p v-if="attempted&&errors.idup" class="er">{{errors.idup}}</p><p v-if="attempted&&errors.ipmiss" class="er">{{errors.ipmiss}}</p>
            </div>
          </template>
        </div>

      </div>
    </cds-modal-content>
    <cds-modal-actions><cds-button action="outline" @click="emit('close')">取消</cds-button><cds-button :loading-state="props.deploying?'loading':'default'" status="primary" @click="submit">部署</cds-button></cds-modal-actions>
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
.uline{border:none;border-bottom:1px solid #d0d5dd;border-radius:0;padding:6px 0;font-size:14px;width:100%;outline:none;background:transparent}.uline:focus{border-bottom-color:#0072a3}.uline-err{border-bottom-color:#c92100}
.fl{font-size:14px;color:#4e5969;display:block;margin-bottom:4px}.field{display:flex;flex-direction:column}
</style>
