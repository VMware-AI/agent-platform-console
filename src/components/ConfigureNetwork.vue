<script setup lang="ts">
import { ref, watch } from 'vue'
import { useLocaleStore } from '@/stores/locale'

export interface VsphereNetwork { name: string; path: string; type: string; dvsName: string }

const props = defineProps<{
  networks: VsphereNetwork[]
  currentPortGroup: string
  disabled: boolean
  loading: boolean
}>()

const emit = defineEmits<{ (e: 'update:portGroup', v: string): void }>()

const locale = useLocaleStore()

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
      <label>{{ locale.t('configure.network.portGroup') }}</label>
      <div class="net-select-wrap">
        <select class="net-select" :value="selected" :disabled="disabled || loading" @change="onChange">
          <option v-if="loading" value="">{{ locale.t('configure.network.loading') }}</option>
          <option v-else-if="!networks.length" value="">{{ locale.t('configure.network.noPortGroup') }}</option>
          <option v-for="n in networks" :key="n.path" :value="n.path">{{ n.name }} ({{ n.dvsName }})</option>
        </select>
      </div>
      <p class="net-warn">{{ locale.t('configure.network.switchWarn') }}</p>
    </div>
  </div>
</template>

<style scoped>
.net-field { padding: 8px 0; }
.net-field label { display: block; font-size: 14px; font-weight: 500; color: var(--cds-global-typography-color-400, #4e5969); margin-bottom: 4px; }
.net-select { width: 100%; max-width: 320px; padding: 6px 10px; border: 1px solid var(--cds-alias-object-border-color, #d0d5dd); border-radius: 6px; font-size: 14px; background: var(--cds-alias-object-container-background, #fff); color: inherit; }
.net-select:disabled { background: var(--cds-alias-object-app-background, #f5f5f5); color: var(--cds-global-typography-color-300, #86909c); cursor: not-allowed; }
.net-warn { font-size: 12px; color: var(--cds-alias-status-warning, #d4a017); margin-top: 6px; }
</style>
