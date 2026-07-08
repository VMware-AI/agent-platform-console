<script setup lang="ts">
import { computed, ref, watch } from 'vue'

const props = defineProps<{
  currentCpu: number; currentMemory: number; currentDisk: number
  isRunning: boolean; disabled: boolean
}>()

const emit = defineEmits<{
  (e: 'update:cpu', v: number): void
  (e: 'update:memory', v: number): void
  (e: 'update:disk', v: number): void
}>()

const cpu = ref(props.currentCpu)
const memory = ref(props.currentMemory)
const disk = ref(props.currentDisk)
const cpuErr = ref(''); const memErr = ref(''); const diskErr = ref('')
const CM = 16; const MM = 64; const DM = 500

watch(() => [props.currentCpu, props.currentMemory, props.currentDisk], () => {
  cpu.value = props.currentCpu; memory.value = props.currentMemory; disk.value = props.currentDisk
})

function onCpu(e: Event) {
  const n = parseInt((e.target as HTMLInputElement).value, 10)
  if (!Number.isFinite(n) || n < 1) { cpuErr.value = '请输入 ≥1 的正整数'; return }
  if (n > CM) { cpuErr.value = `最大 ${CM} 核`; return }
  if (props.isRunning && n < props.currentCpu) { cpuErr.value = `运行中仅支持扩容（≥${props.currentCpu}）`; return }
  cpuErr.value = ''; cpu.value = n; emit('update:cpu', n)
}
function onMem(e: Event) {
  const n = parseInt((e.target as HTMLInputElement).value, 10)
  if (!Number.isFinite(n) || n < 1) { memErr.value = '请输入 ≥1 的正整数'; return }
  if (n > MM) { memErr.value = `最大 ${MM} GB`; return }
  if (props.isRunning && n < props.currentMemory) { memErr.value = `运行中仅支持扩容（≥${props.currentMemory}GB）`; return }
  memErr.value = ''; memory.value = n; emit('update:memory', n)
}
function onDisk(e: Event) {
  const n = parseInt((e.target as HTMLInputElement).value, 10)
  if (!Number.isFinite(n) || n < 1) { diskErr.value = '请输入 ≥1 的正整数'; return }
  if (n > DM) { diskErr.value = `最大 ${DM} GB`; return }
  if (n < props.currentDisk) { diskErr.value = `磁盘仅支持扩容（≥${props.currentDisk}GB）`; return }
  diskErr.value = ''; disk.value = n; emit('update:disk', n)
}
const hint = computed(() => props.isRunning ? '运行中实例仅支持扩容，缩减需先停止实例' : '已停止实例可自由调整资源规格')
</script>

<template>
  <div class="res-rows">
    <div class="res-field"><label>CPU 核数</label><div class="res-input-wrap"><input type="number" class="res-input" :value="cpu" :min="isRunning ? currentCpu : 1" :max="CM" :disabled="disabled" @input="onCpu"><span class="res-current">当前 {{ currentCpu }} 核，范围 1-{{ CM }}</span></div><span v-if="cpuErr" class="res-err">{{ cpuErr }}</span></div>
    <div class="res-field"><label>内存 (GB)</label><div class="res-input-wrap"><input type="number" class="res-input" :value="memory" :min="isRunning ? currentMemory : 1" :max="MM" :disabled="disabled" @input="onMem"><span class="res-current">当前 {{ currentMemory }} GB，范围 1-{{ MM }}</span></div><span v-if="memErr" class="res-err">{{ memErr }}</span></div>
    <div class="res-field"><label>磁盘 (GB)</label><div class="res-input-wrap"><input type="number" class="res-input" :value="disk" :min="currentDisk" :max="DM" :disabled="disabled" @input="onDisk"><span class="res-current">当前 {{ currentDisk }} GB，范围 {{ currentDisk }}-{{ DM }}</span></div><span v-if="diskErr" class="res-err">{{ diskErr }}</span></div>
    <p class="res-hint">{{ hint }}</p>
  </div>
</template>

<style scoped>
.res-field { padding: 8px 0; }
.res-field label { display: block; font-size: 14px; font-weight: 500; color: #4e5969; margin-bottom: 4px; }
.res-input-wrap { display: flex; align-items: center; gap: 10px; }
.res-input { width: 100px; padding: 6px 10px; border: 1px solid #d0d5dd; border-radius: 6px; font-size: 14px; font-family: monospace; }
.res-input:focus { border-color: #0072a3; outline: none; box-shadow: 0 0 0 2px rgba(0,114,163,0.15); }
.res-input:disabled { background: #f5f5f5; color: #86909c; cursor: not-allowed; }
.res-current { font-size: 12px; color: #86909c; }
.res-err { display: block; color: #c92100; font-size: 12px; margin-top: 4px; }
.res-hint { font-size: 12px; color: #86909c; margin-top: 8px; padding-top: 8px; border-top: 1px dashed #e5e6eb; }
</style>
