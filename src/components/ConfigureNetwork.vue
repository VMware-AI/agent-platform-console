<script setup lang="ts">
import { ref, watch } from 'vue'

export interface VsphereNetwork { name: string; path: string; type: string; dvsName: string }

const props = defineProps<{
  networks: VsphereNetwork[]
  currentPortGroup: string
  disabled: boolean
  loading: boolean
}>()

const emit = defineEmits<{ (e: 'update:portGroup', v: string): void }>()

const selected = ref(props.currentPortGroup)
watch(() => props.currentPortGroup, (v) => { selected.value = v })

function onChange(e: Event) {
  selected.value = (e.target as HTMLSelectElement).value
  emit('update:portGroup', selected.value)
}
</script>

<template>
  <div class="net-rows">
    <div class="net-field">
      <label>端口组</label>
      <div class="net-select-wrap">
        <select class="net-select" :value="selected" :disabled="disabled || loading" @change="onChange">
          <option v-if="loading" value="">加载中...</option>
          <option v-else-if="!networks.length" value="">无可用端口组</option>
          <option v-for="n in networks" :key="n.path" :value="n.path">{{ n.name }} ({{ n.dvsName }})</option>
        </select>
      </div>
      <p class="net-warn">⚠️ 切换端口组将临时断开虚拟机网络，建议业务低峰时段操作</p>
    </div>
  </div>
</template>

<style scoped>
.net-field { padding: 8px 0; }
.net-field label { display: block; font-size: 14px; font-weight: 500; color: #4e5969; margin-bottom: 4px; }
.net-select { width: 100%; max-width: 320px; padding: 6px 10px; border: 1px solid #d0d5dd; border-radius: 6px; font-size: 14px; background: #fff; }
.net-select:disabled { background: #f5f5f5; color: #86909c; cursor: not-allowed; }
.net-warn { font-size: 12px; color: #d4a017; margin-top: 6px; }
</style>
