<script setup lang="ts">
import { ref, watch } from 'vue'

export interface VAppProperty { key: string; value: string }

const props = defineProps<{
  templateFamilyId: string | null
  templateVersionId: string | null
  resourcePoolId: string | null
  runAsUser: string
  vAppProperties: VAppProperty[]
  disabled: boolean
}>()

const emit = defineEmits<{
  (e: 'update:runAsUser', v: string): void
  (e: 'update:vAppProperties', v: VAppProperty[]): void
}>()

const runAs = ref(props.runAsUser)
const props_ = ref<VAppProperty[]>([...props.vAppProperties])

watch(() => props.runAsUser, (v) => { runAs.value = v })
watch(() => props.vAppProperties, (v) => { props_.value = [...v] })

function onRunAsChange(e: Event) {
  runAs.value = (e.target as HTMLInputElement).value
  emit('update:runAsUser', runAs.value)
}
function onPropKeyChange(idx: number, e: Event) {
  props_.value[idx] = { ...props_.value[idx], key: (e.target as HTMLInputElement).value }
  emit('update:vAppProperties', [...props_.value])
}
function onPropValChange(idx: number, e: Event) {
  props_.value[idx] = { ...props_.value[idx], value: (e.target as HTMLInputElement).value }
  emit('update:vAppProperties', [...props_.value])
}
function addProp() { props_.value = [...props_.value, { key: '', value: '' }]; emit('update:vAppProperties', [...props_.value]) }
function removeProp(idx: number) { props_.value.splice(idx, 1); props_.value = [...props_.value]; emit('update:vAppProperties', [...props_.value]) }
</script>

<template>
  <div class="vapp-rows">
    <div class="cfg-row"><label>模版族</label><span class="cfg-value mono">{{ templateFamilyId || '—' }}</span><span class="cfg-lock">🔒</span></div>
    <div class="cfg-row"><label>模版版本</label><span class="cfg-value mono">{{ templateVersionId || '—' }}</span><span class="cfg-lock">🔒</span></div>
    <div class="cfg-row"><label>资源池</label><span class="cfg-value mono">{{ resourcePoolId || '—' }}</span><span class="cfg-lock">🔒</span></div>
    <div class="cfg-row"><label>运行账户</label><input class="vapp-input" :value="runAs" :disabled="disabled" placeholder="svc_robot" @input="onRunAsChange"></div>

    <div class="vapp-section-label">自定义 OVF 属性</div>
    <div v-for="(p, i) in props_" :key="i" class="vapp-prop-row">
      <input class="vapp-input vapp-key" :value="p.key" :disabled="disabled" placeholder="属性名" @input="(e: Event) => onPropKeyChange(i, e)">
      <input class="vapp-input vapp-val" :value="p.value" :disabled="disabled" placeholder="属性值" @input="(e: Event) => onPropValChange(i, e)">
      <cds-button-action v-if="!disabled" shape="times" title="移除" @click="removeProp(i)"></cds-button-action>
    </div>
    <cds-button v-if="!disabled" size="sm" action="outline" class="add-prop-btn" @click="addProp">+ 添加属性</cds-button>
  </div>
</template>

<style scoped>
.cfg-row { display: flex; align-items: center; padding: 10px 0; border-bottom: 1px solid #f2f3f5; gap: 12px; }
.cfg-row label { flex: 0 0 80px; font-size: 14px; font-weight: 500; color: #4e5969; }
.cfg-value { flex: 1; font-size: 14px; word-break: break-all; min-width: 0; }
.cfg-lock { flex-shrink: 0; font-size: 12px; opacity: 0.5; }
.mono { font-family: 'SF Mono', 'Fira Code', monospace; }
.vapp-input { flex: 1; padding: 6px 10px; border: 1px solid #d0d5dd; border-radius: 6px; font-size: 14px; max-width: 240px; }
.vapp-input:focus { border-color: #0072a3; outline: none; }
.vapp-input:disabled { background: #f5f5f5; color: #86909c; }
.vapp-section-label { font-size: 13px; font-weight: 600; color: #4e5969; margin-top: 12px; padding-top: 8px; border-top: 1px dashed #e5e6eb; }
.vapp-prop-row { display: flex; align-items: center; gap: 8px; padding: 6px 0; }
.vapp-key { max-width: 140px; }
.vapp-val { max-width: 180px; }
.add-prop-btn { margin-top: 8px; }
</style>
