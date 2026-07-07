<script setup lang="ts">
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

const isRunning = (s: string) => s === 'running'
</script>

<template>
  <div class="qa-rows">
    <div class="qa-btn-group">
      <cds-button size="sm" @click="$emit('rotateKey')"><cds-icon shape="key" size="sm" aria-hidden="true"></cds-icon>密码更新</cds-button>
      <cds-button size="sm" @click="$emit('rotateKey')"><cds-icon shape="refresh" size="sm" aria-hidden="true"></cds-icon>密钥轮换</cds-button>
      <cds-button size="sm" :disabled="!isRunning(agentStatus)" :title="!isRunning(agentStatus) ? '仅运行中实例可重启' : undefined" @click="$emit('restart')"><cds-icon shape="sync" size="sm" aria-hidden="true"></cds-icon>重启实例</cds-button>
      <cds-button size="sm" :disabled="!isRunning(agentStatus)" :title="!isRunning(agentStatus) ? '实例未在运行' : undefined" @click="$emit('stop')"><cds-icon shape="stop" size="sm" aria-hidden="true"></cds-icon>停止实例</cds-button>
    </div>
    <div v-if="hasChanges" class="qa-save-row">
      <cds-button :loading-state="saving ? 'loading' : 'default'" @click="$emit('save')"><cds-icon shape="floppy" size="sm" aria-hidden="true"></cds-icon>保存配置</cds-button>
      <span class="qa-save-hint">修改资源、网络或 vApp 参数后保存到 vCenter</span>
    </div>
  </div>
</template>

<style scoped>
.qa-btn-group { display: flex; gap: 8px; flex-wrap: wrap; }
.qa-save-row { display: flex; align-items: center; gap: 12px; margin-top: 12px; padding-top: 12px; border-top: 1px dashed #e5e6eb; }
.qa-save-hint { font-size: 12px; color: #86909c; }
</style>
