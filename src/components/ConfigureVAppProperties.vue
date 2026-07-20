<script setup lang="ts">
import { ref, watch } from 'vue'
import { useLocaleStore } from '@/stores/locale'

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

const locale = useLocaleStore()

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
    <div class="cfg-row"><label>{{ locale.t('configure.vapp.templateFamily') }}</label><span class="cfg-value mono">{{ templateFamilyId || '—' }}</span><span class="cfg-lock">🔒</span></div>
    <div class="cfg-row"><label>{{ locale.t('configure.vapp.templateVersion') }}</label><span class="cfg-value mono">{{ templateVersionId || '—' }}</span><span class="cfg-lock">🔒</span></div>
    <div class="cfg-row"><label>{{ locale.t('configure.vapp.resourcePool') }}</label><span class="cfg-value mono">{{ resourcePoolId || '—' }}</span><span class="cfg-lock">🔒</span></div>
    <div class="cfg-row"><label>{{ locale.t('configure.vapp.runAs') }}</label><input class="vapp-input" :value="runAs" :disabled="disabled" :placeholder="locale.t('configure.vapp.runAsPlaceholder')" @input="onRunAsChange"></div>

    <div class="vapp-section-label">{{ locale.t('configure.vapp.ovfHeading') }}</div>
    <div v-for="(p, i) in props_" :key="i" class="vapp-prop-row">
      <input class="vapp-input vapp-key" :value="p.key" :disabled="disabled" :placeholder="locale.t('configure.vapp.keyPlaceholder')" @input="(e: Event) => onPropKeyChange(i, e)">
      <input class="vapp-input vapp-val" :value="p.value" :disabled="disabled" :placeholder="locale.t('configure.vapp.valuePlaceholder')" @input="(e: Event) => onPropValChange(i, e)">
      <cds-button-action v-if="!disabled" shape="times" :title="locale.t('configure.vapp.remove')" :aria-label="locale.t('configure.vapp.remove')" @click="removeProp(i)"></cds-button-action>
    </div>
    <cds-button v-if="!disabled" size="sm" action="outline" class="add-prop-btn" @click="addProp">{{ locale.t('configure.vapp.addProp') }}</cds-button>
  </div>
</template>

<style scoped>
.cfg-row { display: flex; align-items: center; padding: 10px 0; border-bottom: 1px solid var(--cds-alias-object-border-color, #f2f3f5); gap: 12px; }
.cfg-row label { flex: 0 0 80px; font-size: 14px; font-weight: 500; color: var(--cds-global-typography-color-400, #4e5969); }
.cfg-value { flex: 1; font-size: 14px; word-break: break-all; min-width: 0; }
.cfg-lock { flex-shrink: 0; font-size: 12px; opacity: 0.5; }
.mono { font-family: 'SF Mono', 'Fira Code', monospace; }
.vapp-input { flex: 1; padding: 6px 10px; border: 1px solid var(--cds-alias-object-border-color, #d0d5dd); border-radius: 6px; font-size: 14px; max-width: 240px; }
.vapp-input:focus { border-color: var(--cds-alias-status-info, #0072a3); outline: none; }
.vapp-input:disabled { background: var(--cds-alias-object-app-background, #f5f5f5); color: var(--cds-global-typography-color-300, #86909c); }
.vapp-section-label { font-size: 13px; font-weight: 600; color: var(--cds-global-typography-color-400, #4e5969); margin-top: 12px; padding-top: 8px; border-top: 1px dashed var(--cds-alias-object-border-color, #e5e6eb); }
.vapp-prop-row { display: flex; align-items: center; gap: 8px; padding: 6px 0; }
.vapp-key { max-width: 140px; }
.vapp-val { max-width: 180px; }
.add-prop-btn { margin-top: 8px; }
</style>
