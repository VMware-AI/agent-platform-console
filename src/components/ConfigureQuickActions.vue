<script setup lang="ts">
import { useLocaleStore } from '@/stores/locale'

defineProps<{
  hasChanges: boolean
  saving: boolean
  agentStatus: string
}>()

defineEmits<{
  (e: 'rotateKey'): void
  (e: 'restart'): void
  (e: 'stop'): void
  (e: 'save'): void
}>()

const locale = useLocaleStore()
const isRunning = (s: string) => s === 'running'
</script>

<template>
  <div class="qa-rows">
    <div class="qa-btn-group">
      <cds-button size="sm" @click="$emit('rotateKey')"><cds-icon shape="key" size="sm" aria-hidden="true"></cds-icon>{{ locale.t('configure.quickActions.rotateKey') }}</cds-button>
      <cds-button size="sm" @click="$emit('rotateKey')"><cds-icon shape="refresh" size="sm" aria-hidden="true"></cds-icon>{{ locale.t('configure.quickActions.rotateSecret') }}</cds-button>
      <cds-button size="sm" :disabled="!isRunning(agentStatus)" :title="!isRunning(agentStatus) ? locale.t('configure.quickActions.restartTitle') : undefined" @click="$emit('restart')"><cds-icon shape="sync" size="sm" aria-hidden="true"></cds-icon>{{ locale.t('configure.quickActions.restart') }}</cds-button>
      <cds-button size="sm" :disabled="!isRunning(agentStatus)" :title="!isRunning(agentStatus) ? locale.t('configure.quickActions.stopTitle') : undefined" @click="$emit('stop')"><cds-icon shape="stop" size="sm" aria-hidden="true"></cds-icon>{{ locale.t('configure.quickActions.stop') }}</cds-button>
    </div>
    <div v-if="hasChanges" class="qa-save-row">
      <cds-button :loading-state="saving ? 'loading' : 'default'" @click="$emit('save')"><cds-icon shape="floppy" size="sm" aria-hidden="true"></cds-icon>{{ locale.t('configure.quickActions.save') }}</cds-button>
      <span class="qa-save-hint">{{ locale.t('configure.quickActions.saveHint') }}</span>
    </div>
  </div>
</template>

<style scoped>
.qa-btn-group { display: flex; gap: 8px; flex-wrap: wrap; }
.qa-save-row { display: flex; align-items: center; gap: 12px; margin-top: 12px; padding-top: 12px; border-top: 1px dashed var(--cds-alias-object-border-color, #e5e6eb); }
.qa-save-hint { font-size: 12px; color: var(--cds-global-typography-color-300, #86909c); }
</style>
