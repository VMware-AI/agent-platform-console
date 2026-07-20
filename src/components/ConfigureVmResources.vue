<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useLocaleStore } from '@/stores/locale'

const props = defineProps<{
  currentCpu: number; currentMemory: number; currentDisk: number
  isRunning: boolean; disabled: boolean
}>()

const emit = defineEmits<{
  (e: 'update:cpu', v: number): void
  (e: 'update:memory', v: number): void
  (e: 'update:disk', v: number): void
}>()

const locale = useLocaleStore()

const cpu = ref(props.currentCpu)
const memory = ref(props.currentMemory)
const disk = ref(props.currentDisk)
const cpuErr = ref(''); const memErr = ref(''); const diskErr = ref('')
const CM = 16; const MM = 64; const DM = 500

watch(() => [props.currentCpu, props.currentMemory, props.currentDisk], () => {
  cpu.value = props.currentCpu; memory.value = props.currentMemory; disk.value = props.currentDisk
})

function tpl(key: string, sub: Record<string, string | number>): string {
  let s = locale.t(key)
  for (const [k, v] of Object.entries(sub)) s = s.replace(`{${k}}`, String(v))
  return s
}

function onCpu(e: Event) {
  const n = parseInt((e.target as HTMLInputElement).value, 10)
  if (!Number.isFinite(n) || n < 1) { cpuErr.value = locale.t('configure.vm.positiveInt'); return }
  if (n > CM) { cpuErr.value = tpl('configure.vm.maxCpu', { n: CM }); return }
  if (props.isRunning && n < props.currentCpu) {
    cpuErr.value = tpl('configure.vm.cpuScaleUpOnly', { n: props.currentCpu })
    return
  }
  cpuErr.value = ''; cpu.value = n; emit('update:cpu', n)
}
function onMem(e: Event) {
  const n = parseInt((e.target as HTMLInputElement).value, 10)
  if (!Number.isFinite(n) || n < 1) { memErr.value = locale.t('configure.vm.positiveInt'); return }
  if (n > MM) { memErr.value = tpl('configure.vm.maxMem', { n: MM }); return }
  if (props.isRunning && n < props.currentMemory) {
    memErr.value = tpl('configure.vm.memScaleUpOnly', { n: props.currentMemory })
    return
  }
  memErr.value = ''; memory.value = n; emit('update:memory', n)
}
function onDisk(e: Event) {
  const n = parseInt((e.target as HTMLInputElement).value, 10)
  if (!Number.isFinite(n) || n < 1) { diskErr.value = locale.t('configure.vm.positiveInt'); return }
  if (n > DM) { diskErr.value = tpl('configure.vm.maxDisk', { n: DM }); return }
  if (n < props.currentDisk) {
    diskErr.value = tpl('configure.vm.diskScaleUpOnly', { n: props.currentDisk })
    return
  }
  diskErr.value = ''; disk.value = n; emit('update:disk', n)
}
const hint = computed(() => props.isRunning ? locale.t('configure.vm.scaleHintRunning') : locale.t('configure.vm.scaleHintStopped'))
</script>

<template>
  <div class="res-rows">
    <div class="res-field"><label>{{ locale.t('configure.vm.cpuLabel') }}</label><div class="res-input-wrap"><input type="number" class="res-input" :value="cpu" :min="isRunning ? currentCpu : 1" :max="CM" :disabled="disabled" @input="onCpu"><span class="res-current">{{ tpl('configure.vm.cpuRange', { n: currentCpu, max: CM }) }}</span></div><span v-if="cpuErr" class="res-err">{{ cpuErr }}</span></div>
    <div class="res-field"><label>{{ locale.t('configure.vm.memLabel') }}</label><div class="res-input-wrap"><input type="number" class="res-input" :value="memory" :min="isRunning ? currentMemory : 1" :max="MM" :disabled="disabled" @input="onMem"><span class="res-current">{{ tpl('configure.vm.memRange', { n: currentMemory, max: MM }) }}</span></div><span v-if="memErr" class="res-err">{{ memErr }}</span></div>
    <div class="res-field"><label>{{ locale.t('configure.vm.diskLabel') }}</label><div class="res-input-wrap"><input type="number" class="res-input" :value="disk" :min="currentDisk" :max="DM" :disabled="disabled" @input="onDisk"><span class="res-current">{{ tpl('configure.vm.diskRange', { n: currentDisk, min: currentDisk, max: DM }) }}</span></div><span v-if="diskErr" class="res-err">{{ diskErr }}</span></div>
    <p class="res-hint">{{ hint }}</p>
  </div>
</template>

<style scoped>
.res-field { padding: 8px 0; }
.res-field label { display: block; font-size: 14px; font-weight: 500; color: var(--cds-global-typography-color-400, #4e5969); margin-bottom: 4px; }
.res-input-wrap { display: flex; align-items: center; gap: 10px; }
.res-input { width: 100px; padding: 6px 10px; border: 1px solid var(--cds-alias-object-border-color, #d0d5dd); border-radius: 6px; font-size: 14px; font-family: monospace; background: var(--cds-alias-object-container-background, #fff); color: inherit; }
.res-input:focus { border-color: var(--cds-alias-status-info, #0072a3); outline: none; box-shadow: 0 0 0 2px color-mix(in srgb, var(--cds-alias-status-info, #0072a3) 15%, transparent); }
.res-input:disabled { background: var(--cds-alias-object-app-background, #f5f5f5); color: var(--cds-global-typography-color-300, #86909c); cursor: not-allowed; }
.res-current { font-size: 12px; color: var(--cds-global-typography-color-300, #86909c); }
.res-err { display: block; color: var(--cds-alias-status-danger, #c92100); font-size: 12px; margin-top: 4px; }
.res-hint { font-size: 12px; color: var(--cds-global-typography-color-300, #86909c); margin-top: 8px; padding-top: 8px; border-top: 1px dashed var(--cds-alias-object-border-color, #e5e6eb); }
</style>
